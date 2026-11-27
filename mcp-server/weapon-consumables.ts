import { fireDamageContextIssue } from './fire-damage-preflight'
import { pendingStartTurnFire } from '../lib/weapon-consumable-state'
import { groundDamageIssue } from './ground-damage-preflight'
import type { AbilityCheckResult, DiceRollResult } from '../lib/types'
import type { WeaponConsumableHolder, WeaponConsumableId } from '../lib/weapon-consumable-state'
import { curseAttackDisadvantage } from '../lib/curse-effects'
import * as gs from './game-state'
import * as rules from './rules'
import { getAbilityModifier, rollDice } from './dice'
import { equipmentId, afterInventoryChange } from './equipment'
import { available, hero, effects, effectiveAC, bonusOnRoll, now, distance, feature } from './hero-rules'
import { canSee, visibleCell, frightenedByVisibleSource } from './monster-perception'
import { monsterSource, dealDamage, endInvisibility, reactToHarm } from './monster-rules'
import { assertDirectCoverTarget, coverArmorClass } from './cover'
import { reactionWindow } from './hero-combat'
import { rollRuleD20 } from './roll-rules'
import { toolkitError, toolkitResult, toolkitState } from './toolkit'
import { checkedResolution, registerCheckedResolution, registerToolkitAttack } from './toolkit-checks'
import { rangedWeaponContext,assertHeldWeaponWeather,type RangedWeaponContext } from './ranged-weapon-rules'

export interface WeaponConsumableInput {
  useId: string; itemId: string; targetKind: 'creature' | 'object'; targetId: string; mode: 'splash' | 'throw'
}
const ids = new Set<string>(['acid_vial', 'holy_water_flask', 'alchemists_fire_flask'])
function existingWeaponConsumableState() {
  return (gs.getState() as unknown as WeaponConsumableHolder).dmTools?.weaponConsumables
}
export function weaponConsumableState() {
  toolkitState()
  const holder = gs.getState() as unknown as WeaponConsumableHolder
  return holder.dmTools!.weaponConsumables ??= { receipts: {}, burning: {} }
}
function replay(id: string, command: string) {
  const receipt = weaponConsumableState().receipts[id]
  if (receipt && receipt.command !== command) toolkitError('CONSUMABLE_USE_CONFLICT', 'This useId belongs to a different completed operation.')
  return receipt ? toolkitResult(receipt.result) : undefined
}
function complete(id: string, command: string, result: Record<string, unknown>) {
  weaponConsumableState().receipts[id] = { command, result }
  gs.addLogEntry({ round: gs.getState().round, turn: 'system', action: 'Objet consommable', mechanicalDetail: String(result.mechanicalSummary) })
  return toolkitResult(result)
}
function owned(input: WeaponConsumableInput) {
  const item = gs.getPlayer().inventory.find(item => item.id === input.itemId)
  if (!item || !ids.has(equipmentId(item))) toolkitError('WEAPON_CONSUMABLE_NOT_OWNED', 'Select an exact owned acid, holy water or alchemist fire item instance.')
  return item!
}
function validate(input: WeaponConsumableInput,validatingPending=false) {
  if(!validatingPending)available()
  if (input.targetKind !== 'creature') toolkitError('CONSUMABLE_OBJECT_UNSUPPORTED', 'Object damage and object turn clocks are not supported by this resolver; no item or action has been spent.')
  const item = owned(input), kind = equipmentId(item) as WeaponConsumableId
  if (kind === 'alchemists_fire_flask' && input.mode !== 'throw') toolkitError('CONSUMABLE_MODE_INVALID', 'Alchemist fire specifies throwing the flask, not splashing it.')
  // The engine has authoritative creature turns only in active combat.
  if (gs.getState().phase !== 'combat') toolkitError('CONSUMABLE_COMBAT_REQUIRED', 'Start an explicit combat before resolving this ranged attack and any ongoing turn damage.')
  if(validatingPending){
    // A held attack is its own outstanding reaction. Ordinary turn/action
    // validators deliberately reject any pending window, so inspect the real
    // prerequisites without clearing or bypassing that window for other tools.
    const state=gs.getState(),actor=state.player,target=gs.getEntity(input.targetId)
    if(state.currentTurn!=='player'||!state.initiativeOrder.includes('player')||!state.initiativeOrder.includes(input.targetId))
      toolkitError('CONSUMABLE_HELD_CONTEXT_INVALID','The original full-action source attack must still belong to this actual player turn and target.')
    if(actor.hp.current<=0||actor.deathSaves?.dead||actor.conditions.some(c=>['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(c)))
      toolkitError('ENTITY_INCAPACITATED','The original attacker must still be alive and capable before a reaction die.')
    if(hero().actionCredits<=0)toolkitError('ACTION_ALREADY_USED','The original held consumable requires its real unspent full action.')
    if(!target||target.id==='player'||'isAlive'in target&&!target.isAlive)toolkitError('CONSUMABLE_HELD_CONTEXT_INVALID','The exact original living target must still exist; no substitute is chosen.')
    rules.validateHostileTarget('player',input.targetId)
    if(distance(actor.position,target!.position)>(input.mode==='splash'?1:4))toolkitError('TARGET_OUT_OF_RANGE','The original source consumable target is outside its actual fixed range.')
  }else{
    rules.validateActionUse('player') // Full Use-an-Object action, never an Extra Attack slot.
    rules.validateAttack('player', input.targetId, kind, input.mode === 'splash' ? 1 : 4)
  }
  if (effects('turned', 'player').length) toolkitError('TURNED_ACTION_RESTRICTED', 'A turned creature cannot attack.')
  const actor = gs.getPlayer(), target = gs.getEntity(input.targetId)!
  assertDirectCoverTarget(actor.id, target.id)
  if (!visibleCell({ ...actor, conditions: actor.conditions.filter(condition => condition !== 'blinded') }, target.position))
    toolkitError('CONSUMABLE_LINE_BLOCKED', 'An intervening solid obstruction prevents this direct ranged attack.')
  if (kind === 'holy_water_flask' && !monsterSource(target)?.type)
    toolkitError('CONSUMABLE_CREATURE_TYPE_UNKNOWN', 'Holy water requires an authoritative creature type; no type is inferred from a name or description.')
  return { item, kind, actor, target }
}
export function validateHeldWeaponConsumableAttack(command:Record<string,unknown>){
  if(command.domain!=='weapon-consumable')return
  const input=command.input as WeaponConsumableInput|undefined
  if(!input||typeof input.useId!=='string'||typeof input.itemId!=='string'||typeof input.targetId!=='string'||!['splash','throw'].includes(input.mode))
    toolkitError('CONSUMABLE_HELD_CONTEXT_INVALID','The held source consumable must retain its exact actual item, target, use and mode before another die.')
  validate(input!,true)
  if(command.rangedContext)assertHeldWeaponWeather(command.rangedContext as RangedWeaponContext)
}
export function useWeaponConsumable(input: WeaponConsumableInput, held?: DiceRollResult,originalRanged?:RangedWeaponContext) {
  const command = JSON.stringify(input), prior = replay(input.useId, command)
  if (prior) return prior
  const { item, kind, actor, target } = validate(input), dist = distance(actor.position, target.position)
  const rangedContext=held?originalRanged:rangedWeaponContext(actor,target,input.mode==='splash'?1:4,input.mode==='splash'?1:4,true,{weaponReference:item.id,canonicalWeaponId:'improvised-flask',attackMode:input.mode})
  if(rangedContext)assertHeldWeaponWeather(rangedContext)
  const helped = effects('help-attack', actor.id).filter(effect => effect.data.enemyId === target.id)
  const advantage = Boolean(helped.length || !canSee(target, actor) || effects('hidden', actor.id).length && !canSee(target, actor)
    || target.conditions.some(condition => ['blinded', 'restrained', 'stunned', 'unconscious', 'paralyzed', 'petrified'].includes(condition))
    || target.conditions.includes('prone') && dist <= 1 || effects('guiding-bolt', target.id).length)
  const closeEnemy = Object.values(gs.getState().monsters).some(enemy => enemy.id !== actor.id && enemy.hostile !== false && enemy.hp.current > 0
    && !enemy.conditions.some(condition => ['incapacitated', 'unconscious', 'paralyzed', 'stunned', 'petrified'].includes(condition))
    && distance(enemy.position, actor.position) <= 1 && canSee(enemy, actor))
  const disadvantage = Boolean(closeEnemy || curseAttackDisadvantage(gs.getState(), actor.id, target.id)
    || actor.conditions.some(condition => ['blinded', 'poisoned', 'restrained', 'prone'].includes(condition)) || !canSee(actor, target)
    || target.conditions.includes('prone') && dist > 1 || effects('dodge', target.id).length && canSee(target, actor)
    || effects('vicious-mockery', actor.id).length || frightenedByVisibleSource(actor.id)||rangedContext?.strongWindDisadvantage||rangedContext?.underwaterContext?.disadvantage)
  // Improvised ranged weapons use DEX. No proficiency is invented for an owned vial.
  const roll = held ?? rollRuleD20(actor.id, 'attack', getAbilityModifier(actor.stats.dex), advantage, disadvantage,'dex')
  if (!held) { const bless = bonusOnRoll('attack', actor.id); roll.total += bless; roll.modifier += bless }
  if (!held && hero().inspiration.some(entry => entry.targetId === actor.id && entry.expiresAt > now()))
    return reactionWindow('attack', actor.id, target.id, ['bardic_inspiration', 'decline'],
      { type: 'toolkit_attack', domain: 'weapon-consumable', input, ...(rangedContext?{rangedContext}:{}),inspiredActorId: actor.id }, roll)
  const natural = roll.rolls[0], targetAC = coverArmorClass(actor.id, target.id, effectiveAC(target.id))
  const criticalRoll = natural === 20 || feature('improved_critical') && natural === 19
  const hit = criticalRoll || natural !== 1 && roll.total >= targetAC
  const criticalHit = hit && (criticalRoll || dist <= 1 && target.conditions.some(condition => ['unconscious', 'paralyzed'].includes(condition)))
  const radiantTarget = ['fiend', 'undead'].includes(monsterSource(target)?.type ?? '')
  const damageType = kind === 'acid_vial' ? 'acid' : kind === 'holy_water_flask' ? 'radiant' : 'fire'
  const damageRoll = hit && kind !== 'alchemists_fire_flask' && (kind !== 'holy_water_flask' || radiantTarget)
    ? rollDice(criticalHit ? '4d6' : '2d6') : undefined
  // Commit once, after all unsupported cases and any held reaction have resolved.
  rules.recordAction(actor.id)
  if (!gs.consumePlayerItem(candidate => candidate.id === item.id)) toolkitError('WEAPON_CONSUMABLE_NOT_OWNED', 'The selected physical flask is no longer owned.')
  afterInventoryChange()
  const damageResolution = damageRoll ? dealDamage(target.id, damageRoll.total, damageType, { critical: criticalHit, weaponAttack: true, sourceId: actor.id }) : undefined
  if (hit && kind === 'alchemists_fire_flask' && !weaponConsumableState().burning[target.id])
    weaponConsumableState().burning[target.id] = { targetId: target.id, sourceId: actor.id, itemId: item.id, useId: input.useId, startedAt: now() }
  if (!hit || !damageRoll) reactToHarm(actor.id, target.id)
  endInvisibility(actor.id)
  const consumedEffects = new Set([...helped, ...effects('hidden', actor.id), ...effects('vicious-mockery', actor.id), ...effects('guiding-bolt', target.id)].map(effect => effect.id))
  hero().effects = hero().effects.filter(effect => !consumedEffects.has(effect.id))
  return complete(input.useId, command, { success: true, useId: input.useId, itemId: item.id, equipmentId: kind, targetId: target.id,
    mode: input.mode, consumed: true, actionSpent: true, attackRoll: roll, naturalRoll: natural, proficiencyApplied: false,...(rangedContext?{rangedContext}:{}),
    targetAC, hit, criticalHit, damageType, damageRoll, damageResolution, damageDealt: damageResolution?.damageDealt ?? 0,
    burning: Boolean(weaponConsumableState().burning[target.id]),
    mechanicalSummary: `${kind} : ${roll.detail} contre CA ${targetAC}, ${hit ? 'touché' : 'raté'} ; action et objet consommés${hit && kind === 'alchemists_fire_flask' ? ', 1d4 feu au début des tours de la cible' : ''}.` })
}

function burningTargetAlive(id: string) {
  const target = gs.getPhysicalCreature(id)
  return target && (id === 'player' ? !gs.getPlayer().deathSaves?.dead : 'isAlive'in target&&target.isAlive)
}
/** Intrinsic start-turn effect; called by the engine, never by a free-form model tick. */
export function startWeaponConsumableTurn(actorId: string | null) {
  if (!actorId) return undefined
  const state = existingWeaponConsumableState(), fire = state?.burning[actorId]
  if (!fire) return undefined
  if (!burningTargetAlive(actorId)) { delete state!.burning[actorId]; return undefined }
  const gsState = gs.getState(), key = `${gsState.combatGeneration ?? 0}:${gsState.turnCounter ?? 0}:${actorId}`
  if (fire.lastTurn === key) return undefined
  const issue=startTurnFirePreflightIssue(gsState,actorId);if(issue)return{pendingStartTurnFire:{eventId:key,entityId:actorId,useId:fire.useId,...issue}}
  const damageRoll = rollDice('1d4'), damageResolution = gs.withPhysicalCreatureResolution([actorId],()=>dealDamage(actorId, damageRoll.total, 'fire', { sourceId: fire.sourceId,damageEventId:`alchemist-fire:${key}` }))
  fire.lastTurn=key
  gs.addLogEntry({ round: gsState.round, turn: actorId, action: 'Feu grégeois', mechanicalDetail: `Début du tour : ${damageRoll.total} dégâts de feu bruts.` })
  if (!burningTargetAlive(actorId)) delete state!.burning[actorId]
  const result={targetId:actorId,eventId:key,useId:fire.useId,damageRoll,damageResolution}
  const receipts=state!.turnReceipts??={};receipts[key]={eventId:key,entityId:actorId,useId:fire.useId,at:gsState.worldTimeSeconds??0,result:structuredClone(result)}
  return result
}
/** Time jumps cannot silently bypass unresolved start-of-turn fire. Combat's
 * ordinary six-second round clock is advanced directly by the turn engine. */
export function assertWeaponConsumableTimeAdvance(seconds: number) {
  if (seconds <= 0) return
  const state = existingWeaponConsumableState()
  if (!state) return
  if (Object.keys(state.burning).some(id => burningTargetAlive(id))) toolkitError('ALCHEMIST_FIRE_ACTIVE', 'Resolve creature turns or extinguish alchemist fire before skipping time, resting or leaving combat.')
}
export function extinguishWeaponConsumableFire(input: { eventId: string; actorId: string }) {
  const command = JSON.stringify({ action: 'extinguish', ...input }), prior = replay(input.eventId, command)
  if (prior) return prior
  available(); rules.validateActionUse(input.actorId)
  if (!weaponConsumableState().burning[input.actorId]) toolkitError('ALCHEMIST_FIRE_NOT_ACTIVE', 'The chosen actor is not burning from alchemist fire.')
  return checkedResolution({ entityId: input.actorId, ability: 'dex', dc: 10, proficient: false, label: 'Éteindre le feu grégeois' },
    { domain: 'weapon-consumable-extinguish', command: { ...input, serialized: command } })
}
export function registerWeaponConsumableResolutions() {
  registerToolkitAttack('weapon-consumable', (command, roll) => useWeaponConsumable(command.input as unknown as WeaponConsumableInput, roll,command.rangedContext as RangedWeaponContext|undefined))
  registerCheckedResolution('weapon-consumable-extinguish', (command, check) => {
    const eventId = String(command.eventId), actorId = String(command.actorId), serialized = String(command.serialized)
    const prior = replay(eventId, serialized); if (prior) return prior
    if (!weaponConsumableState().burning[actorId]) toolkitError('ALCHEMIST_FIRE_NOT_ACTIVE', 'The saved extinguishing check no longer has an active fire.')
    rules.validateActionUse(actorId); rules.recordAction(actorId)
    if (check.success) delete weaponConsumableState().burning[actorId]
    return complete(eventId, serialized, { success: true, actorId, eventId, extinguished: Boolean(check.success), check: check as AbilityCheckResult,
      actionSpent: true, mechanicalSummary: `Éteindre le feu grégeois : test de Dextérité DD 10 ${check.success ? 'réussi' : 'échoué'} ; action consommée.` })
  })
}

export function startTurnFirePreflightIssue(state:import('../lib/types').GameState,entityId:string){
 const fire=state.dmTools?.weaponConsumables?.burning[entityId];if(!fire)return null
 const actor=entityId==='player'?state.player:state.monsters[entityId]??state.npcs?.[entityId]
 if(!actor||(entityId==='player'?state.player.deathSaves?.dead:'isAlive'in actor&&actor.isAlive===false))return null
 const environmental=fireDamageContextIssue(state,'creature',entityId);if(environmental)return environmental
 if(Object.keys(state.dmTools?.weaponConsumables?.turnReceipts??{}).length>=512)return{code:'ALCHEMIST_FIRE_TURN_LIMIT',message:'The exact retained start-turn fire history is full before a new real damage roll.'}
 return groundDamageIssue(state,entityId,4)
}
export function resolveStartTurnFire(input:{entityId:string;eventId:string}){
 const state=gs.getState(),prior=state.dmTools?.weaponConsumables?.turnReceipts?.[input.eventId]
 if(prior){if(prior.entityId!==input.entityId)toolkitError('START_TURN_FIRE_EVENT_CONFLICT','Retain the actual creature of this resolved turn-fire event.');return{...structuredClone(prior.result),replayed:true}}
 const due=pendingStartTurnFire(state);if(!due||due.entityId!==input.entityId||due.eventId!==input.eventId)toolkitError('START_TURN_FIRE_EVENT_REQUIRED','Choose the exact still due fire event of the actual already opened turn; no fresh turn or tick is created.')
 const issue=startTurnFirePreflightIssue(state,input.entityId);if(issue)toolkitError(issue.code,issue.message)
 if(state.hero?.pending)toolkitError('REACTION_PENDING','Finish the held real resolution before resolving the already due start-turn fire.')
 return startWeaponConsumableTurn(input.entityId)
}
