import { beginTumble,registerTumbleResolutions } from './dmg-tumble'
import { beginOverrun,registerOverrunResolutions } from './dmg-overrun'
import { beginShoveAside,resumeShoveAside,retainShoveAsideFirst,finishShoveAside } from './dmg-shove-aside'
import { chaseDashAdmissionIssue } from '../lib/chase-state'
import { SpellObserversSchema } from '../lib/spell-perception-state'
import { SpellAreaSelectionSchema } from '../lib/spell-area-state'
import { TeleportCompanionFields } from '../lib/spell-physical-state'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { findWeapon } from '../lib/srd/weapons'
import { getSkill } from '../lib/srd/skills'
import { ToolkitCellSchema, ToolkitDescriptionSchema } from '../lib/dm-tool-state'
import type { AbilityCheckResult, SavingThrowResult } from '../lib/types'
import { getAbilityModifier } from './dice'
import * as gs from './game-state'
import * as rules from './rules'
import { navigationGrid } from '../lib/navigation'
import { engineGeometry, executeNavigation } from './navigation'
import { monsterSource, conditionImmune, endEffect } from './monster-rules'
import { canSee, visibleCell, passivePerceptionScore } from './monster-perception'
import { available, hero, feature, fail, distance, effects, addHeroEffect, removeHeroEffect, spendHeroAction, effectiveSpeed, alive, spendReaction, reactionAvailable, now } from './hero-rules'
import { preflightStandingMovement } from './movement-modes'
import { freeHands, selectedWeaponItem, weaponForReference, weaponItemHeld } from './equipment'
import { validateImprovisedReference } from './improvised'
import { heroAttack } from './hero-combat'
import { stabilizeNpc } from './npc-life'
import { assertBreathingRecoveryAllowed } from './breathing'
import { isDyingNpc,isNpcStabilizationCandidate,npcStabilizationMatches } from '../lib/npc-life-state'
import { LightObjectSelectionSchema } from '../lib/light-spell-state'
import { cast5eSpell, type HeroSpellInput } from './hero-spells'
import { checkedResolution, registerCheckedResolution } from './toolkit-checks'
import { toolkitResult, toolkitError, toolkitTransaction } from './toolkit'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { perceptionCheckContext } from './perception-checks'

export const CombatActionInput = {
  action: z.enum(['dash', 'disengage', 'dodge', 'help', 'hide', 'ready', 'grapple', 'shove', 'escape_grapple', 'release_grapple', 'stabilize', 'stand_up', 'overrun', 'tumble']),
  actorId: z.string().default('player'), targetId: z.string().optional(), beneficiaryId: z.string().optional(),
  helpKind: z.enum(['attack', 'check']).optional(), skill: z.string().optional(), task: ToolkitDescriptionSchema.optional(),
  perceptionSense:z.enum(['sight','hearing','other']).optional(),
  defenseSkill: z.enum(['athletics', 'acrobatics']).optional(), shove: z.enum(['prone', 'push', 'aside']).optional(),
  tumbleCost:z.enum(['action','bonus_action']).optional(),tumblePath:z.tuple([ToolkitCellSchema,ToolkitCellSchema,ToolkitCellSchema]).optional(),
  overrunCost:z.enum(['action','bonus_action']).optional(),overrunPath:z.tuple([ToolkitCellSchema,ToolkitCellSchema,ToolkitCellSchema]).optional(),
  toCell: ToolkitCellSchema.optional(), effectId: z.string().optional(),
  readied: z.object({ kind: z.enum(['attack', 'move', 'spell']), weaponId: z.string().optional(), trigger: ToolkitDescriptionSchema,
    attackMode:z.enum(['melee','thrown']).optional(),
    area:SpellAreaSelectionSchema.optional(),upcastDamageType:z.enum(['fire','radiant']).optional(),
    companionId:z.string().optional(),...TeleportCompanionFields,
    lightObject:LightObjectSelectionSchema.optional(),spellObservers:SpellObserversSchema.optional(),spellId: z.string().optional(), slotLevel: z.number().int().min(1).max(4).optional(), targetId: z.string().optional(),
    targetIds: z.array(z.string()).max(24).optional(), toCell: ToolkitCellSchema.optional(),
    direction: z.object({ x: z.number().int().min(-1).max(1), y: z.number().int().min(-1).max(1) }).strict().optional(),
    materialItemId: z.string().optional(),focusItemId:z.string().optional(), sculptTargetIds: z.array(z.string()).max(4).optional(),
  }).strict().optional(),
}
type ActionInput = z.infer<z.ZodObject<typeof CombatActionInput>>
const incapacitated = (id: string) => gs.getEntity(id)?.conditions.some(condition => ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(condition)) ?? false
function canReplaceAttack() {
  rules.validateFreeCombatAction('player')
  if (!(hero().attackAction?.remaining ?? 0)) rules.validateActionUse('player')
}
export function spendAttack() {
  const starting = !hero().attackAction || hero().attackAction!.remaining === 0
  const id = starting ? randomUUID() : hero().attackAction!.id
  if (starting) spendHeroAction()
  const used = starting ? 1 : hero().attackAction!.used + 1
  hero().attackAction = { ...(id ? { id } : {}), used, remaining: Math.max(0, (feature('extra_attack') ? 2 : 1) - used) }
}
function combatLog(data: Record<string, unknown>, message: string) {
  gs.addLogEntry({ round: gs.getState().round, turn: gs.getState().currentTurn ?? 'player', action: 'Action de combat', mechanicalDetail: message })
  return toolkitResult({ ...data, mechanicalSummary: message })
}
function finishContest(command: Record<string, unknown>, check: AbilityCheckResult | SavingThrowResult): ReturnType<typeof toolkitResult> {
  resumeShoveAside(command)
  if (command.stage === 'first') {
    retainShoveAsideFirst(command,check)
    const defenderId = String(command.defenderId), skill = String(command.defenseSkill)
    return checkedResolution({ entityId: defenderId, ability: skill === 'acrobatics' ? 'dex' : 'str', skill,
      label: `Opposition ${skill}` }, { domain: 'combat-contest', command: { ...command, stage: 'second', firstCheck: check } })
  }
  const first = command.firstCheck as AbilityCheckResult, success = first.roll.total > check.roll.total
  const action = String(command.action), targetId = String(command.targetId)
  if (action === 'escape_grapple') {
    spendHeroAction()
    if (success) removeHeroEffect(String(command.effectId))
  } else {
    spendAttack()
    if (success && action === 'grapple') addHeroEffect('grapple', 'player', [targetId], 1e12, { condition: 'grappled' })
    if (success && action === 'shove') {
      if (command.shove === 'prone') gs.applyCondition(targetId, 'prone')
      else { const cell = command.toCell as { x: number; y: number }; gs.moveToken(targetId, cell.x, cell.y,
        command.shove==='aside'?{shoveAsideId:String(command.shoveAsideId)}:undefined) }
    }
  }
  const sourceResult={success,action,targetId,check:first,opposition:check,...(command.shove==='aside'?{shove:'aside',toCell:command.toCell,source:command.source,shoveAsideId:command.shoveAsideId}:{}),...(action==='shove'&&success?{position:{...gs.getEntity(targetId)!.position},conditions:[...gs.getEntity(targetId)!.conditions]}:{})}
  finishShoveAside(command,sourceResult)
  return combatLog({ ...sourceResult,
    ...(action === 'shove' && success ? { position: gs.getEntity(targetId)!.position, conditions: gs.getEntity(targetId)!.conditions } : {}) },
  `${action} : ${first.roll.detail} contre ${check.roll.detail}, ${success ? 'réussite' : 'échec'} ; une égalité conserve la situation antérieure.`)
}
export function registerCombatActionResolutions() {
  registerOverrunResolutions()
  registerTumbleResolutions()
  registerCheckedResolution('combat-contest', finishContest)
  registerCheckedResolution('combat-simple', (command, check) => {
    const targetId=String(command.targetId??'player')
    if(command.action==='stabilize')assertBreathingRecoveryAllowed(targetId)
    if(command.action==='stabilize'&&targetId!=='player'){
      const target=gs.getMonster(targetId)
      if(!target||!isNpcStabilizationCandidate(target)||!npcStabilizationMatches(target,command))fail('STABILIZATION_TARGET_INVALID','The exact held NPC stabilization must still refer to its living unstable episode.')
      if(check.success)stabilizeNpc(target!)
    }
    rules.recordAction(String(command.actorId))
    if (command.action === 'stabilize' && targetId==='player' && check.success) gs.stabilizePlayer()
    if (command.action === 'hide') {
      for (const effect of [...effects('hidden', 'player')]) removeHeroEffect(effect.id)
      if (check.success) addHeroEffect('hidden', 'player', ['player'], 1e12, { stealth: check.roll.total, mapId: gs.getState().currentMapId })
    }
    return combatLog({ success: check.success, action: command.action, check,
      ...(command.action === 'stabilize' ? targetId==='player'?{hp:gs.getPlayer().hp,deathSaves:gs.getPlayer().deathSaves}:{targetId,hp:gs.getMonster(targetId)!.hp,npcLife:gs.getMonster(targetId)!.npcLife} : {}) },
    `${command.action} : ${check.roll.detail} contre DD ${check.dc}, ${check.success ? 'réussite' : 'échec'}.`)
  })
}
export function resolveCombatAction(input: ActionInput) {
  available()
  if(input.action!=='tumble'&&(input.tumbleCost!==undefined||input.tumblePath!==undefined))fail('TUMBLE_NOT_APPLICABLE','Select Tumble explicitly before its chosen cost or route.')
  if(input.action!=='overrun'&&(input.overrunCost!==undefined||input.overrunPath!==undefined))fail('OVERRUN_NOT_APPLICABLE','Select Overrun explicitly before its cost choice or route.')
  if(input.shove==='aside'&&input.action!=='shove')fail('SHOVE_ASIDE_NOT_APPLICABLE','Choose the explicit DMG option only for the actual shove action.')
  if(input.perceptionSense!==undefined&&input.action!=='hide'&&!(input.action==='help'&&input.helpKind==='check'&&input.skill==='perception'))
    fail('PERCEPTION_SENSE_NOT_APPLICABLE','Choose perceptionSense only for a real Perception Help task or the explicit observer mode of Hide.')
  if (input.action === 'release_grapple') {
    const source = gs.getEntity(input.actorId)
    if(!source)fail('ENTITY_NOT_FOUND','Choose the actual existing holder.')
    if(input.actorId!=='player'&&gs.getMonster(input.actorId)?.controller==='reactive_npc')fail('NPC_ACTIVATION_REQUIRED','This tool cannot bypass a reactive NPC activation.')
    const effect = effects('grapple').find(effect => effect.id === input.effectId && effect.sourceId === input.actorId)
    const monsterEffect = gs.getState().monsterEffects?.find(effect=>effect.id===input.effectId&&effect.kind==='grapple'&&effect.sourceId===input.actorId
      &&(effect.expiresAt===undefined||effect.expiresAt>now()))
    if (!effect&&!monsterEffect) fail('GRAPPLE_EFFECT_REQUIRED', 'Choose the exact active grapple effect actually held by this actor.')
    if(effect)removeHeroEffect(effect.id)
    else endEffect(monsterEffect!.id)
    return combatLog({ success: true, action: input.action, actorId: input.actorId, effectId: input.effectId }, 'Prise relâchée volontairement par son détenteur, sans action.')
  }
  if (input.actorId !== 'player' && input.action !== 'stabilize') fail('ACTOR_UNSUPPORTED', 'This combat action is implemented for the player; stabilization may use another explicit actor.')
  if(input.action!=='stabilize'||gs.getState().phase==='combat')rules.validateFreeCombatAction(input.actorId)
  if(input.action==='overrun'){
    if(!input.targetId||!input.overrunCost||!input.overrunPath)fail('OVERRUN_SELECTION_REQUIRED','Choose the actual hostile target, whole action or bonus action, and all three exact source-route cells.')
    if(input.shove||input.toCell||input.defenseSkill)fail('OVERRUN_SELECTION_CONFLICT','Overrun uses the printed Strength (Athletics) opposition and its explicit three-cell route, without Shove choices.')
    return beginOverrun({targetId:input.targetId,cost:input.overrunCost,path:input.overrunPath})
  }
  if(input.action==='tumble'){
    if(!input.targetId||!input.tumbleCost||!input.tumblePath)fail('TUMBLE_SELECTION_REQUIRED','Choose the actual hostile target, whole action or bonus action, and all three exact source-route cells.')
    if(input.shove||input.toCell||input.defenseSkill)fail('TUMBLE_SELECTION_CONFLICT','Tumble uses the printed Dexterity (Acrobatics) opposition and its explicit three-cell route, without Shove choices.')
    return beginTumble({targetId:input.targetId,cost:input.tumbleCost,path:input.tumblePath})
  }
  if (input.action === 'stand_up') {
    const { costCells: cost } = preflightStandingMovement('player')
    gs.addMovementUsed('player', cost); gs.removeCondition('player', 'prone')
    return combatLog({ success: true, action: input.action, costCells: cost }, `Le joueur se relève : ${cost} cases de déplacement, aucune action.`)
  }
  if (input.action === 'grapple' || input.action === 'shove') {
    canReplaceAttack()
    const target = input.targetId ? gs.getEntity(input.targetId) : undefined
    if (!target || target.id === 'player' || target.hp.current <= 0 || !gs.getState().initiativeOrder.includes(target.id)) fail('TARGET_REQUIRED', 'Choose an exact living creature in this combat.')
    rules.validateHostileTarget('player', target.id)
    if (distance(target.position, gs.getPlayer().position) > 1 || !visibleCell(gs.getPlayer(), target.position)) fail('TARGET_OUT_OF_RANGE', 'The target must be in unobstructed melee reach.')
    const sizes = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'], size = String(monsterSource(target)?.size ?? '')
    if (!sizes.includes(size)) fail('TARGET_SIZE_UNKNOWN', 'The target needs a sourced size.')
    if (sizes.indexOf(size) > 3) fail('TARGET_TOO_LARGE', 'These Medium player profiles cannot grapple or shove a creature larger than Large.')
    if (input.action === 'grapple') {
      if (freeHands() < 1) fail('FREE_HAND_REQUIRED', 'Explicitly stow/drop a held item to free a hand before grappling.')
      if (conditionImmune(target, 'grappled')) fail('GRAPPLE_IMMUNE', 'This target is immune to grappled.')
      if (effects('grapple', target.id).some(effect => effect.sourceId === 'player')) fail('TARGET_ALREADY_GRAPPLED', 'The player already holds this target.')
    }
    if (input.action === 'shove') {
      if (!input.shove) fail('SHOVE_CHOICE_REQUIRED', 'Choose prone, push or the explicit optional DMG aside procedure.')
      if (input.shove === 'prone' && conditionImmune(target, 'prone')) fail('PRONE_IMMUNE', 'This target is immune to prone.')
      if (input.shove === 'push') {
        const cell = input.toCell, from = target.position, origin = gs.getPlayer().position
        if (!cell || distance(from, cell) !== 1 || cell.x !== from.x + Math.sign(from.x - origin.x) || cell.y !== from.y + Math.sign(from.y - origin.y)) fail('SHOVE_DESTINATION_REQUIRED', 'Choose the exact adjacent cell five feet directly away from the player.')
        if (!navigationGrid(gs.getState(), target.id, engineGeometry(), { ignoreActorEffects: true }).step(from, cell!)) fail('SHOVE_PATH_BLOCKED', 'The push cannot pass through walls, closed doors or occupied cells.')
      }
    }
    if(input.action==='shove'&&input.shove==='push')gs.assertGroundMovementPath(target.id,[input.toCell!])
    let aside:ReturnType<typeof beginShoveAside>|undefined
    if(input.shove==='aside'){
      if(!input.toCell)fail('SHOVE_ASIDE_DESTINATION_REQUIRED','Choose the exact side destination before a die or attack cost.')
      if(!input.defenseSkill)fail('DEFENSE_CHOICE_REQUIRED','Choose the actual defender Athletics or Acrobatics explicitly.')
      aside=beginShoveAside({shove:'aside',targetId:target.id,toCell:input.toCell!,defenseSkill:input.defenseSkill!})
    }
    const command = { action: input.action, targetId: target.id, shove: input.shove, toCell: input.toCell,
      stage: 'first', defenderId: target.id, defenseSkill: input.defenseSkill,...aside?{shoveAsideId:aside.id,source:aside.source}:{} }
    if (incapacitated(target.id)) {
      spendAttack()
      if (input.action === 'grapple') addHeroEffect('grapple', 'player', [target.id], 1e12, { condition: 'grappled' })
      else if (input.shove === 'prone') gs.applyCondition(target.id, 'prone')
      else gs.moveToken(target.id, input.toCell!.x, input.toCell!.y)
      return combatLog({ success: true, automatic: true, action: input.action, targetId: target.id }, `${input.action} réussit automatiquement contre une cible incapable d’agir ; aucune relance.`)
    }
    if (!input.defenseSkill) fail('DEFENSE_CHOICE_REQUIRED', 'Choose the defender Athletics or Acrobatics explicitly.')
    return checkedResolution({ ability: 'str', skill: 'athletics', label: input.action,...aside?{disadvantage:true,advantageReason:'DMG2014 Shove Aside'}:{} }, { domain: 'combat-contest', command })
  }
  if(input.action==='dash'){const issue=chaseDashAdmissionIssue(gs.getState(),input.actorId);if(issue)fail(issue.code,issue.message)}
  rules.validateActionUse(input.actorId)
  if (input.action === 'escape_grapple') {
    const effect = effects('grapple', 'player').find(effect => effect.id === input.effectId)
    if (!effect || !gs.getEntity(effect.sourceId)) fail('GRAPPLE_EFFECT_REQUIRED', 'Choose a tracked contested grapple; monster-specific escape_monster_grapple stays separate.')
    if (!input.defenseSkill) fail('ESCAPE_SKILL_REQUIRED', 'Choose Athletics or Acrobatics explicitly.')
    return checkedResolution({ ability: input.defenseSkill === 'acrobatics' ? 'dex' : 'str', skill: input.defenseSkill, label: 'Échapper à la prise' },
      { domain: 'combat-contest', command: { action: input.action, effectId: effect.id, targetId: 'player', stage: 'first', defenderId: effect.sourceId, defenseSkill: 'athletics' } })
  }
  if (input.action === 'stabilize') {
    const target = input.targetId?gs.getEntity(input.targetId):undefined, actor = gs.getEntity(input.actorId)!
    if(!target)fail('STABILIZATION_TARGET_INVALID','Choose the exact existing living unstable target at zero HP.')
    assertBreathingRecoveryAllowed(target!.id)
    if(target!.id==='player'){
      if(target!.hp.current!==0||gs.getPlayer().deathSaves?.dead||gs.getPlayer().deathSaves?.stable)
        fail('STABILIZATION_TARGET_INVALID','Choose the living unstable player at zero HP.')
    }else if(!isNpcStabilizationCandidate(target as import('../lib/types').MonsterState))fail('STABILIZATION_TARGET_INVALID','Choose an exact living unstable tracked NPC at zero HP.')
    if (distance(actor.position, target.position) > 1 || !visibleCell({ ...actor, conditions: actor.conditions.filter(condition => condition !== 'blinded') }, target.position)) fail('TARGET_OUT_OF_RANGE', 'The helper must reach the injured player.')
    return checkedResolution({ entityId: actor.id, ability: 'wis', skill: 'medicine', dc: 10, label: 'Stabiliser' },
      { domain: 'combat-simple', command: { actorId: actor.id, action: 'stabilize',targetId:target!.id,
        ...(target!.id!=='player'?isDyingNpc(target as import('../lib/types').MonsterState)?{episodeId:(target as import('../lib/types').MonsterState).npcLife!.episode!.id}:{observationEventId:(target as import('../lib/types').MonsterState).npcLife!.legacyObservation!.input.eventId}:{}) } })
  }
  if (input.action === 'hide') {
    const observers = Object.values(gs.getState().monsters).filter(monster => monster.hp.current > 0 && monster.hostile !== false)
    if (observers.some(observer => canSee(observer, gs.getPlayer()))) fail('CANNOT_HIDE_IN_PLAIN_SIGHT', 'Break the observers line of sight before hiding.')
    // Do not floor an observer's passive score at ten: doing so would erase
    // the PHB -5 from exhaustion for weaker observers. Keep the existing
    // default only when there is nobody whose perception opposes this check.
    const scores=observers.map(observer=>passivePerceptionScore(observer,gs.getState(),false,false,input.perceptionSense)).filter((score):score is number=>score!==null&&Number.isFinite(score))
    const dc = (scores.length ? Math.max(...scores) : 10) + 1
    return checkedResolution({ ability: 'dex', skill: 'stealth', dc, label: 'Se cacher' }, { domain: 'combat-simple', command: { actorId: 'player', action: 'hide' } })
  }
  if (input.action === 'help') {
    const beneficiary = input.beneficiaryId ? gs.getEntity(input.beneficiaryId) : undefined
    if (!beneficiary || beneficiary.id === 'player' || !alive(beneficiary) || !('hostile' in beneficiary) || beneficiary.hostile !== false) fail('HELP_BENEFICIARY_REQUIRED', 'Choose an exact living allied creature other than the helper.')
    if (!input.helpKind) fail('HELP_KIND_REQUIRED', 'Choose helpKind attack or check.')
    if (input.helpKind === 'attack') {
      const enemy = input.targetId ? gs.getEntity(input.targetId) : undefined
      if (!enemy || enemy.hp.current <= 0 || enemy.id === beneficiary.id || distance(gs.getPlayer().position, enemy.position) > 1
        || !visibleCell(gs.getPlayer(), enemy.position)) fail('HELP_TARGET_REQUIRED', 'Choose an exact enemy within five feet of the helper.')
    } else {
      if (!input.skill || !getSkill(input.skill) || !input.task) fail('HELP_TASK_REQUIRED', 'Choose a registered skill and describe the exact task being helped.')
      if(perceptionCheckContext({skill:input.skill,perceptionSense:input.perceptionSense},'player').automaticFailure)
        fail('CHECK_HELP_SENSE_UNAVAILABLE','The helper cannot attempt this actual explicitly sensory task in its current conditions; no action or advantage is spent.')
    }
    spendHeroAction(); delete hero().attackAction
    const effect = addHeroEffect(`help-${input.helpKind}`, 'player', [beneficiary.id], 12,
      { untilStartOf: 'player', enemyId: input.targetId, skill: input.skill, task: input.task,perceptionSense:input.perceptionSense })
    return combatLog({ success: true, effect }, 'Aide enregistrée : avantage sur le premier jet correspondant avant le prochain tour du joueur, sans cumul.')
  }
  if (input.action === 'ready') {
    if (!input.readied) fail('READY_CHOICE_REQUIRED', 'Choose the exact readied action and perceivable trigger.')
    if(input.readied.kind==='move'&&activePhysicalLoad(gs.getState()))fail('PHYSICAL_READIED_TRANSPORT_UNSUPPORTED','Release the exact held load before preparing unsupported paired readied movement.')
    if (input.readied.kind === 'spell') {
      if(input.readied.attackMode!==undefined)fail('READY_ATTACK_MODE_NOT_APPLICABLE','Choose attackMode only for a prepared physical weapon attack, never a spell or move.')
      if (!input.readied.spellId || input.readied.weaponId) fail('READY_SPELL_REQUIRED', 'Select the exact registered spell, its explicit targets/area and any required material.')
      const { kind: _kind, weaponId: _weapon, trigger, ...spell } = input.readied
      return cast5eSpell({ ...spell, readiedPrepare: { trigger } })
    }
    if (input.readied.kind === 'attack') {
      const id = input.readied.weaponId
      const item = id ? selectedWeaponItem(id) : undefined, weapon = id ? weaponForReference(id) : undefined
      if (!id || !weapon || !item || !weaponItemHeld(item)) fail('READY_WEAPON_REQUIRED', 'Choose an exact held weapon for the readied attack.')
      if(input.readied.attackMode!==undefined&&weapon!.properties.includes('ranged'))fail('ATTACK_MODE_INVALID','A ranged profile retains its ranged use; omit attackMode.')
      if(input.readied.attackMode==='thrown'&&!weapon!.properties.includes('thrown'))fail('WEAPON_NOT_THROWABLE','Choose a real Thrown profile or explicitly adjudicated generic thrown reference.')
      if(weapon!.improvised)validateImprovisedReference(id!)
      input.readied.weaponId = weapon!.improvised?id:item!.id
    }
    if(input.readied.kind==='move'&&input.readied.attackMode!==undefined)fail('READY_ATTACK_MODE_NOT_APPLICABLE','A prepared movement does not choose a weapon attack mode.')
    spendHeroAction(); delete hero().attackAction
    for (const old of [...effects('readied-action', 'player')]) removeHeroEffect(old.id)
    const effect = addHeroEffect('readied-action', 'player', ['player'], 12, { untilStartOf: 'player', readied: input.readied })
    return combatLog({ success: true, readyId: effect.id, effect }, 'Action préparée : réaction disponible sur un déclencheur observé, avant le prochain tour. Aucun déclenchement automatique.')
  }
  spendHeroAction(); delete hero().attackAction
  return combatLog({ success: true, effect: addHeroEffect(input.action, 'player', ['player'], 12, { untilStartOf: 'player' }) }, `${input.action} : action consommée, effet actif jusqu’au prochain tour.`)
}

export function registerReadiedTools(server: McpServer) {
  server.registerTool('resolve_readied_action', {
    description: 'Explicitly resolve or ignore one exact stored Ready effect before its expiry. The AI judges whether the stored perceivable trigger occurred and supplies triggerObserved; the engine never parses prose to trigger an action. An attack needs an exact targetId and uses the stored weapon, one reaction and one attack only. Optional nonlethal is a release-time choice only for an executed physical player melee attack; nonlethal:true on ranged attacks and any nonlethal field on ignore/move/spell refuse before dice/costs. A move needs an exact toCell, uses up to current speed in a separate reaction movement budget and can provoke opportunity attacks. No implicit target/destination or new player choice is supplied. Pending reaction choices and costs remain authoritative.',
    inputSchema: { readyId: z.string(), choice: z.enum(['execute', 'ignore']), triggerObserved: ToolkitDescriptionSchema.optional(),
      targetId: z.string().optional(), toCell: ToolkitCellSchema.optional(), weaponHands:z.union([z.literal(1),z.literal(2)]).optional(),weaponAbility:z.enum(['str','dex']).optional(),ammunitionItemId:z.string().min(1).optional(),newAttackAction:z.boolean().optional(),
      nonlethal: z.boolean().optional().describe('Explicit release-time knockout choice for execute of a physical player melee attack only. Omit for ignore, movement or spells; even false is invalid on those branches.') },
  }, async input => toolkitTransaction(() => {
    available()
    if (gs.getState().phase !== 'combat') fail('NOT_IN_COMBAT', 'A readied combat action needs active combat.')
    const ready = [...effects('readied-action', 'player'), ...effects('readied-spell', 'player')].find(effect => effect.id === input.readyId)
    if (!ready) fail('READY_EFFECT_NOT_FOUND', 'The chosen Ready effect is absent or has expired.')
    if(input.newAttackAction!==undefined)fail('NEW_ATTACK_ACTION_NOT_APPLICABLE','A Ready release is a reaction, not a new primary Attack action.')
    if(input.ammunitionItemId!==undefined&&(input.choice!=='execute'||ready.kind!=='readied-action'||(ready.data.readied as ActionInput['readied'])?.kind!=='attack'))
      fail('AMMUNITION_READIED_ATTACK_REQUIRED','Choose an ammunition stack only when executing the actual stored physical attack.')
    if (input.nonlethal !== undefined && (input.choice !== 'execute' || ready.kind !== 'readied-action'
      || (ready.data.readied as ActionInput['readied'])?.kind !== 'attack'))
      fail('NONLETHAL_READIED_ATTACK_REQUIRED', 'The nonlethal field is only valid when executing a stored physical player attack; omit it for ignore, movement or spell release.')
    if(input.weaponHands!==undefined&&(input.choice!=='execute'||ready.kind!=='readied-action'||(ready.data.readied as ActionInput['readied'])?.kind!=='attack'))
      fail('WEAPON_HANDS_READIED_ATTACK_REQUIRED','Choose weaponHands only when executing the stored physical attack, not ignore, movement or spell release.')
    if(input.weaponAbility!==undefined&&(input.choice!=='execute'||ready.kind!=='readied-action'||(ready.data.readied as ActionInput['readied'])?.kind!=='attack'))fail('FINESSE_READIED_ATTACK_REQUIRED','Choose weaponAbility only for the actual stored physical finesse attack, not ignore, movement or spell release.')
    if (input.choice === 'ignore') return toolkitResult({ success: true, ignored: true, readyId: ready.id, reactionSpent: false })
    if (!input.triggerObserved) fail('READY_TRIGGER_REQUIRED', 'Describe the perceived occurrence of the stored trigger explicitly.')
    if (!reactionAvailable()) fail('REACTION_ALREADY_USED', 'The player has no reaction available.')
    if (ready.kind === 'readied-spell') {
      if (input.targetId || input.toCell) fail('READY_SPELL_TARGETS_FIXED', 'The spell uses its explicitly prepared targets/area; do not substitute new targets on release.')
      const preparedInput = ready.data.preparedInput as HeroSpellInput
      spendReaction(); removeHeroEffect(ready.id)
      return cast5eSpell({ ...preparedInput, readiedRelease: true })
    }
    const prepared = ready.data.readied as NonNullable<ActionInput['readied']>
    if (prepared.kind === 'attack') {
      if (!input.targetId || input.toCell) fail('READY_TARGET_REQUIRED', 'Choose one exact targetId for the stored readied attack.')
      const item = selectedWeaponItem(prepared.weaponId!)
      if (!item || !weaponItemHeld(item)) fail('READY_WEAPON_UNAVAILABLE', 'The exact prepared weapon is no longer held.')
      const result = heroAttack({ attackerId: 'player', targetId: input.targetId, weaponOrSpell: prepared.weaponId!,attackMode:prepared.attackMode, reaction: true, readied: true, nonlethal: input.nonlethal, weaponHands:input.weaponHands,weaponAbility:input.weaponAbility,ammunitionItemId:input.ammunitionItemId })
      removeHeroEffect(ready.id)
      return result
    }
    if (!input.toCell || input.targetId) fail('READY_DESTINATION_REQUIRED', 'Choose one exact toCell for the stored movement.')
    if(activePhysicalLoad(gs.getState()))fail('PHYSICAL_READIED_TRANSPORT_UNSUPPORTED','Release the held load before this unsupported paired readied movement; the reaction and stored Ready remain unspent.')
    const player = gs.getPlayer(), speed = Math.max(0, player.speed - (effects('ray-of-frost', 'player').length ? 10 : 0))
    addHeroEffect('readied-movement', 'player', ['player'], 12, { untilStartOf: 'player', remainingCells: Math.floor(speed / 5) })
    const move = executeNavigation('player', { kind: 'cell', cell: input.toCell }, false, [], [], true)
    spendReaction(); removeHeroEffect(ready.id)
    return toolkitResult({ success: true, movement: move, pendingReaction: hero().pending,
      mechanicalSummary: `Déplacement préparé : ${move.costCells} cases parcourues en réaction, sans consommer le déplacement du tour ordinaire.` })
  }))
}
