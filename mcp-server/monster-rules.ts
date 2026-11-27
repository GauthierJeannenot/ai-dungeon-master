import { withCackleConsequences } from './cackle-fever'
import { fullyImmersedInWater,underwaterFireDefenseIssue } from '../lib/underwater-rules'
import { activeSwallowEpisode } from '../lib/swallow-state'
import { captureInsideSwallowDamage,noteInsideSwallowDamage } from './swallow'
import type { Condition, DamageType, EntityStats, MonsterEffect, MonsterState, PlayerState, SavingThrowResult } from '../lib/types'
import { getMonsterRecord } from '../lib/srd/monsters'
import { harvestCreatureActionIssue } from '../lib/srd/harvest-creatures'
import { groupDamageDice } from '../lib/npc-stat-blocks'
import { getAbilityModifier, rollDice } from './dice'
import { rollRuleD20, ruleRollAdvantage, ruleRollDisadvantage } from './roll-rules'
import { adjustExhaustionHpMaximum, finishExhaustionHpChange } from './exhaustion'
import * as gs from './game-state'
import { RuleViolation } from './rules'
import { z } from 'zod'
import { bonusOnRoll, saveAdvantage, effects, removeHeroEffect } from './hero-rules'
import { curseAbilityDisadvantage } from '../lib/curse-effects'
import { coverSavingThrowBonus, type CoverOrigin } from './cover'
import { absorbTemporaryHpDamage } from './temporary-hp'
import type { KnockoutState } from '../lib/nonlethal-state'
import { assertKnockoutDamageSupported } from './nonlethal'
import { assertPetrifiedSpriteHistory } from './petrified-sprite-effects'
import { assertPersistedConditionRemoval, finishPersistedConditionRemoval } from './persisted-conditions'
import { inspectOilFireDamage } from '../lib/oil-state'
import { commitOilFireDamage } from './oil-fire'
import { randomUUID } from 'node:crypto'

export const DamageTypeSchema = z.enum(['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'])

type Creature = PlayerState | MonsterState
export interface SourceAction {
  name: string; desc: string; attack_bonus?: number
  damage?: Array<{ damage_dice?: string; damage_type?: { index: DamageType }; from?: { options: Array<{ damage_dice: string; damage_type: { index: DamageType } }> } }>
  dc?: { dc_type: { index: keyof EntityStats }; dc_value: number }
  usage?: { type: string; dice?: string; min_value?: number }
  actions?: Array<{ action_name: string; count: number | string }>
  action_options?: { from: { options: Array<{ option_type: string; action_name?: string; count?: number;
    items?: Array<{ action_name: string; count: number }> }> } }
}
export interface MonsterSource {
  size: string; type: string; alignment: string
  actions: SourceAction[]; special_abilities?: SourceAction[]
  damage_vulnerabilities: string[]; damage_resistances: string[]; damage_immunities: string[]
  condition_immunities: Array<{ index: Condition }>
  proficiencies: Array<{ value: number; proficiency: { index: string } }>
}
export function monsterSource(entity: Creature | undefined): MonsterSource | undefined {
  const record = entity && 'type' in entity ? getMonsterRecord(entity.type) : undefined
  return record ? (record.reference ?? record.source) as unknown as MonsterSource : undefined
}
export function hasTrait(entity: Creature | undefined, name: string): boolean {
  return Boolean(monsterSource(entity)?.special_abilities?.some(trait => trait.name === name))
}
export function conditionImmune(entity: Creature, condition: Condition): boolean {
  return Boolean(monsterSource(entity)?.condition_immunities.some(entry => entry.index === condition))
    || condition === 'poisoned' && entity.conditions.includes('petrified')
}
export function sourceAction(monster: MonsterState, name: string): SourceAction | undefined {
  const key = name.toLowerCase().replace(/\s+/g, '')
  return monsterSource(monster)?.actions.find(action => action.name.toLowerCase().replace(/\s+/g, '') === key)
}
export function multiattackPlans(monster: MonsterState) {
  const missing=harvestCreatureActionIssue(monster.type,'Multiattack');if(missing)throw new RuleViolation('MONSTER_ACTION_REFERENCE_ONLY',missing,{monsterType:monster.type,action:'Multiattack'})
  const source = sourceAction(monster, 'Multiattack')
  if (!source) throw new RuleViolation('MULTIATTACK_UNAVAILABLE', 'This source creature has no Multiattack.', {})
  const options = source.action_options?.from.options.map(option => option.option_type === 'multiple'
    ? option.items!.flatMap(item => Array.from({ length: item.count }, () => item.action_name))
    : Array.from({ length: option.count! }, () => option.action_name!))
  const random = source.actions?.length === 1 && typeof source.actions[0].count === 'string' && /d/i.test(source.actions[0].count)
    ? { action: source.actions[0].action_name, countDice: source.actions[0].count } : undefined
  // These two source descriptions carry constraints not represented faithfully
  // by the API actions array (notably the veteran's erroneous shortsword count).
  const fixed = monster.type === 'veteran' ? [['Longsword', 'Longsword'], ['Longsword', 'Longsword', 'Shortsword']]
    : monster.type === 'grick' ? [['Tentacles', 'Beak']]
    : !options && !random && source.actions?.every(a => /^\d+$/.test(String(a.count)))
      ? [source.actions.flatMap(a => Array.from({ length: Number(a.count) }, () => a.action_name))] : undefined
  if (!options?.length && !random && !fixed?.length) throw new RuleViolation('MULTIATTACK_NOT_SUPPORTED', 'The source multiattack needs an explicit engine implementation.', {})
  return { options: options ?? fixed, random }
}
export function attackProfile(monster: MonsterState, name: string, damageOption = 0) {
  const action = sourceAction(monster, name)
  if (!action || action.attack_bonus === undefined) throw new RuleViolation('MONSTER_ACTION_NOT_SUPPORTED', 'Choose an exact source attack name.', { name })
  const missing=harvestCreatureActionIssue(monster.type,action.name);if(missing)throw new RuleViolation('MONSTER_ACTION_REFERENCE_ONLY',missing,{monsterType:monster.type,action:action.name})
  const component = action.damage?.[0]
  const damage = component?.from ? component.from.options[damageOption] : damageOption === 0 ? component : undefined
  if (!damage?.damage_dice || !damage.damage_type) throw new RuleViolation('DAMAGE_OPTION_INVALID', 'Choose a source damage option index.', {})
  const melee = /(?:Melee(?: or Ranged)? Weapon Attack|Melee Spell Attack):/.test(action.desc)
  const reach = /reach (\d+) ft\./.exec(action.desc)
  const ranged = /range (\d+)\/(\d+) ft\./.exec(action.desc)
  if (!reach && !ranged) throw new RuleViolation('MONSTER_ACTION_NOT_SUPPORTED', 'Source attack has no supported range.', {})
  return { name: action.name, attackBonus: action.attack_bonus, damageDice: groupDamageDice(monster, damage.damage_dice),
    damageType: damage.damage_type.index, rangeCells: Number(reach?.[1] ?? ranged?.[2]) / 5,
    normalRangeCells: Number(reach?.[1] ?? ranged?.[1]) / 5, melee,
    magical: /Spell Attack:/.test(action.desc), action }
}
export function savingThrow(entityId: string, ability: keyof EntityStats, dc: number, magical = false, againstCondition?: Condition, origin?: CoverOrigin, ignoreCoverForSave = false, sourceDisadvantage = false, sourceAdvantage = false, areaCover?:{targetId:string;bonus:number}): SavingThrowResult {
  const entity = gs.getEntity(entityId)
  if (!entity) throw new RuleViolation('ENTITY_NOT_FOUND', 'Saving throw target is absent.', { entityId })
  return creatureSavingThrow(entity, ability, dc, magical, againstCondition, false, origin, ignoreCoverForSave, sourceDisadvantage,sourceAdvantage,areaCover)
}

// Also supports an authored NPC stat block without adding a combatant to state.
export function creatureSavingThrow(entity: Creature, ability: keyof EntityStats, dc: number, magical = false, againstCondition?: Condition, situationalAdvantage = false, origin?: CoverOrigin, ignoreCoverForSave = false, sourceDisadvantage = false, sourceAdvantage = false, areaCover?:{targetId:string;bonus:number}): SavingThrowResult {
  const entityId = entity.id
  let modifier = getAbilityModifier(entity.stats[ability])
  if (entityId === 'player') {
    const player = entity as PlayerState
    if (player.savingThrowProficiencies?.includes(ability)) modifier += player.proficiencyBonus
    modifier += gs.getState().hero?.effects.filter(e=>e.kind==='magic-item-protection'&&e.targetIds.includes('player')&&e.expiresAt>(gs.getState().worldTimeSeconds??0)).reduce((sum,e)=>sum+Number(e.data.saveBonus??0),0)??0
  } else {
    modifier = monsterSource(entity)?.proficiencies.find(p => p.proficiency.index === `saving-throw-${ability}`)?.value ?? modifier
  }
  const autoFailure = (ability === 'str' || ability === 'dex') && entity.conditions.some(c => ['paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c))
  if(areaCover&&(areaCover.targetId!==entityId||![0,2,5].includes(areaCover.bonus)))throw new RuleViolation('AREA_COVER_CONTEXT_INVALID','Only the reviewed actual area target cover witness can supply this internal bonus.',{})
  const coverBonus = !autoFailure && !ignoreCoverForSave ? areaCover?(ability==='dex'?areaCover.bonus:0):coverSavingThrowBonus(origin, entityId, ability) : 0
  modifier += coverBonus
  const advantage = ruleRollAdvantage(entityId,'save',Boolean(sourceAdvantage || situationalAdvantage || saveAdvantage(entityId, ability, againstCondition) || magical && hasTrait(entity, 'Magic Resistance')
    || againstCondition === 'frightened' && hasTrait(entity, 'Brave')
    || (againstCondition === 'frightened' || againstCondition === 'charmed') && hasTrait(entity, 'Dark Devotion')))
  const disadvantage = ruleRollDisadvantage(entityId,'save',sourceDisadvantage || ability === 'dex' && entity.conditions.includes('restrained') || curseAbilityDisadvantage(gs.getState(),entityId,ability),ability)
  const roll = autoFailure ? { notation: 'automatic-failure', rolls: [], total: 0, modifier: 0, detail: 'Échec automatique dû à un état.' }
    : rollRuleD20(entityId,'save',modifier, advantage, disadvantage,ability)
  if (!autoFailure) {
    if(coverBonus)roll.detail+=` | Couverture +${coverBonus} DEX`
    const bonus=bonusOnRoll('save',entityId)
    if(bonus){roll.total+=bonus;roll.modifier+=bonus;roll.detail+=` | Bénédiction +${bonus}`}
  }
  const success = !autoFailure && roll.total >= dc
  return { entityId, ability, dc, roll, success,
    mechanicalSummary: `JS ${ability.toUpperCase()} ${roll.detail} vs DD ${dc} : ${success ? 'SUCCÈS' : 'ÉCHEC'}${advantage ? ' (avantage)' : ''}` }
}

function defenseMatches(rule: string, type: DamageType, magical: boolean, silvered: boolean, weaponAttack: boolean): boolean {
  if (rule === type) return true
  if (!['bludgeoning', 'piercing', 'slashing'].includes(type)) return false
  if (rule === 'bludgeoning, piercing, and slashing from nonmagical weapons') return weaponAttack && !magical
  if (rule === "bludgeoning, piercing, and slashing from nonmagical weapons that aren't silvered") return weaponAttack && !magical && !silvered
  return false
}
export function adjustedDamage(target: Creature, amount: number, type: DamageType, magical = false, silvered = false, weaponAttack = false) {
  const source = monsterSource(target)
  if(amount>0&&type==='fire'){const issue=underwaterFireDefenseIssue(gs.getState(),{kind:'creature',entityId:target.id});if(issue)throw new RuleViolation(issue.code,issue.message,{})}
  const adjustments: string[] = []
  let total = Math.max(0, Math.floor(amount))
  if (source?.damage_immunities.some(rule => defenseMatches(rule, type, magical, silvered, weaponAttack))
    || type === 'poison' && target.conditions.includes('petrified')) {
    return { damage: 0, adjustments: [`immunité ${type}`] }
  }
  if (source?.damage_resistances.some(rule => defenseMatches(rule, type, magical, silvered, weaponAttack)) || target.conditions.includes('petrified')
    || type==='poison'&&effects('protection-from-poison',target.id).length>0 || type==='fire'&&fullyImmersedInWater(gs.getState(),{kind:'creature',entityId:target.id})===true) {
    total = Math.floor(total / 2); adjustments.push(`résistance ${type}`)
  }
  if (source?.damage_vulnerabilities.some(rule => defenseMatches(rule, type, magical, silvered, weaponAttack))) {
    total *= 2; adjustments.push(`vulnérabilité ${type}`)
  }
  return { damage: total, adjustments }
}

export function endEffect(id: string): void {
  const state = gs.getState()
  const effect = state.monsterEffects?.find(effect => effect.id === id)
  if (!effect) return
  const contained=activeSwallowEpisode(state,effect.targetId);if(contained?.effectId===id)throw new RuleViolation('SWALLOW_PHYSICAL_RELEASE_REQUIRED','Only its actual physical source exit can remove this containment provider.',{})
  const endedAt = Math.min(state.worldTimeSeconds ?? 0, effect.expiresAt ?? (state.worldTimeSeconds ?? 0))
  for (const condition of effect.conditions) assertPersistedConditionRemoval(effect.targetId, condition, endedAt, { kind: 'monster', id })
  state.monsterEffects = state.monsterEffects!.filter(candidate => candidate.id !== id)
  if (effect.kind === 'sprite-poison') for (const linked of [...state.monsterEffects])
    if (linked.kind === 'sprite-sleep' && linked.spritePoisonId === effect.id) endEffect(linked.id)
  if (effect.kind === 'horrifying-visage') {
    state.monsterPowerImmunities ??= []
    state.monsterPowerImmunities.push({ sourceId: effect.sourceId, targetId: effect.targetId,
      power: effect.kind, expiresAt: (state.worldTimeSeconds ?? 0) + 86400 })
  }
  for (const condition of effect.conditions) finishPersistedConditionRemoval(effect.targetId, condition, endedAt)
}

export function reactToHarm(sourceId: string, targetId: string): SavingThrowResult[] {
  const source = gs.getEntity(sourceId), saves: SavingThrowResult[] = []
  for (const effect of effects('charm-person', targetId)) {
    const charmer = gs.getEntity(effect.sourceId)
    if (source && charmer && (source.id === charmer.id || allied(source, charmer))) removeHeroEffect(effect.id)
  }
  for (const effect of [...gs.getState().monsterEffects ?? []]) {
    const charmer = gs.getEntity(effect.sourceId)
    if (effect.kind === 'fey-charm' && effect.targetId === targetId && source && charmer
      && (source.id === charmer.id || allied(source, charmer))) {
      const save = savingThrow(targetId, 'wis', 14, true, 'charmed')
      saves.push(save)
      if (save.success) {
        endEffect(effect.id)
        const state = gs.getState(); state.monsterPowerImmunities ??= []
        state.monsterPowerImmunities.push({ sourceId: charmer.id, targetId, power: 'fey-charm', expiresAt: (state.worldTimeSeconds ?? 0) + 86400 })
      }
    }
  }
  return saves
}
export function addEffect(input: Omit<MonsterEffect, 'id'>): MonsterEffect {
  const state = gs.getState()
  const target = gs.getEntity(input.targetId)!
  const conditions = input.conditions.filter(condition => !conditionImmune(target, condition))
  const effect = { ...input, conditions, id: `effect-${Date.now()}-${Math.random().toString(36).slice(2)}` }
  state.monsterEffects ??= []
  state.monsterEffects.push(effect)
  for (const condition of conditions) gs.applyCondition(input.targetId, condition)
  return effect
}
export function endInvisibility(entityId: string): void {
  for(const effect of [...effects('invisibility',entityId)]){
    removeHeroEffect(effect.id)
    if(effect.data.groupId&&!gs.getState().hero?.effects.some(e=>e.data.groupId===effect.data.groupId))removeHeroEffect(String(effect.data.groupId))
  }
  const entity = gs.getMonster(entityId)
  if (entity?.monsterRuntime?.invisibleConcentration) {
    entity.monsterRuntime.invisibleConcentration = false
    gs.removeCondition(entityId, 'invisible')
  }
}

export function reconcileMonsterEffects(): void {
  for (const effect of [...gs.getState().monsterEffects ?? []]) {
    const source = gs.getEntity(effect.sourceId), target = gs.getEntity(effect.targetId)
    if (effect.kind === 'grapple' && (!source || !target || source.hp.current <= 0
      || (target.id==='player' ? Boolean(gs.getPlayer().deathSaves?.dead) : !(target as MonsterState).isAlive)
      || source.conditions.some(c => ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(c))
      || !target.conditions.includes('grappled')
      || Math.max(Math.abs(source.position.x - target.position.x), Math.abs(source.position.y - target.position.y)) > 1)) endEffect(effect.id)
  }
  for (const monster of Object.values(gs.getState().monsters)) if (monster.conditions.some(c => ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(c)) || !monster.isAlive) endInvisibility(monster.id)
}

export type DamageInstanceOptions={ magical?: boolean; silvered?: boolean; critical?: boolean; weaponAttack?: boolean; sourceId?: string; knockout?:KnockoutState;damageEventId?:string }
export type TypedDamageComponent={amount:number;type:DamageType}
/** One simultaneous source event after each type's own defenses/rounding.
 * Do not use this to merge effects which have a separate save/timing. */
function commitDamageInstance(entityId:string,components:readonly TypedDamageComponent[],options:DamageInstanceOptions){
  assertPetrifiedSpriteHistory()
  const entity = gs.getEntity(entityId)
  if (!entity||!components.length||components.length>16||components.some(part=>!Number.isFinite(part.amount)||part.amount<0||!DamageTypeSchema.safeParse(part.type).success))
    throw new RuleViolation('DAMAGE_INVALID', 'Damage needs an existing target and nonnegative finite sourced typed amounts.', {})
  const amount=components.reduce((sum,part)=>sum+part.amount,0)
  if(!Number.isFinite(amount))throw new RuleViolation('DAMAGE_INVALID','Combined damage must remain finite.',{})
  assertKnockoutDamageSupported(entity,amount)
  const swallowedDamage=captureInsideSwallowDamage(options.sourceId,entityId,options.damageEventId??randomUUID())
  const hpBefore = entity.hp.current
  const groupBefore = 'group' in entity ? entity.group?.remainingCount : undefined
  const amounts=new Map<DamageType,number>()
  for(const part of components)amounts.set(part.type,(amounts.get(part.type)??0)+part.amount)
  const parts=[...amounts].map(([type,raw])=>{const adjusted=adjustedDamage(entity,raw,type,options.magical,options.silvered,options.weaponAttack)
    return{damageType:type,rawDamage:raw,damageDealt:adjusted.damage,damageAdjustment:adjusted.adjustments}})
  const adjusted={damage:parts.reduce((sum,part)=>sum+part.damageDealt,0),adjustments:parts.flatMap(part=>part.damageAdjustment)}
  const damage = adjusted.damage
  const temporaryHp = absorbTemporaryHpDamage(entityId,damage)
  let fortitude: SavingThrowResult | undefined
  let hpDelta = temporaryHp.hpDamage
  if (hpDelta > 0 && hpBefore > 0 && hpDelta >= hpBefore && hasTrait(entity, 'Undead Fortitude') && !parts.some(part=>part.damageType==='radiant'&&part.damageDealt>0) && !options.critical) {
    fortitude = savingThrow(entityId, 'con', 5 + damage)
    if (fortitude.success) hpDelta = hpBefore - 1
  }
  if (damage > 0) {
    for (const effect of [...gs.getState().monsterEffects ?? []]) if (effect.targetId === entityId && effect.endsOnDamage && !effect.petrificationPause) endEffect(effect.id)
    if (entityId === 'player') {
      gs.updatePlayerHP(-hpDelta,{damageReceived:damage,temporaryHpResolved:true,critical:options.critical})
    } else gs.updateMonsterHP(entityId, -hpDelta,{damageReceived:damage,temporaryHpResolved:true,critical:options.critical,knockout:options.knockout})
    if ('monsterRuntime' in entity && entity.monsterRuntime?.invisibleConcentration) {
      if (entity.hp.current<=0||entity.conditions.some(condition=>['incapacitated','unconscious','paralyzed','petrified','stunned'].includes(condition))
        ||!savingThrow(entityId, 'con', Math.max(10, Math.floor(damage / 2))).success) endInvisibility(entityId)
    }
  }
  const harmSaves = options.sourceId ? reactToHarm(options.sourceId, entityId) : []
  for (const effect of [...gs.getState().monsterEffects ?? []]) {
    if (effect.sourceId === entityId && entity.hp.current <= 0 && ['grapple', 'fey-charm'].includes(effect.kind)) endEffect(effect.id)
  }
  noteInsideSwallowDamage(swallowedDamage,damage)
  return {components:parts,result:{ entityId, rawDamage: amount, damageDealt: damage, damageReceived:damage,
    ...(groupBefore !== undefined && 'group' in entity && entity.group ? { groupResult: {
      initialCount: entity.group.initialCount, remainingBefore: groupBefore,
      remainingAfter: entity.group.remainingCount, membersLost: groupBefore - entity.group.remainingCount,
      incapacitatedCount: entity.group.incapacitatedCount,
    } } : {}),
    hpDamage:temporaryHp.hpDamage,hpLost:Math.max(0,hpBefore-entity.hp.current),temporaryHp,damageAdjustment: adjusted.adjustments,
    hpBefore, hpAfter: entity.hp.current, hpMax: entity.hp.max, fortitude, harmSaves,
    knockedOut:'isAlive'in entity&&Boolean(entity.knockout),
    knockout:'isAlive'in entity?entity.knockout:undefined,
    npcLifeEpisode:'isAlive'in entity?entity.npcLife?.episode:undefined,
    died: 'isAlive' in entity ? !entity.isAlive : Boolean(entity.deathSaves?.dead) }}
}
function applyDamageInstance(entityId:string,components:readonly TypedDamageComponent[],options:DamageInstanceOptions):ReturnType<typeof commitDamageInstance>{
  if(!gs.getState().dmTools?.oil)return commitDamageInstance(entityId,components,options)
  const eventId=options.damageEventId??randomUUID()
  const amounts=new Map<DamageType,number>()
  for(const part of components)amounts.set(part.type,(amounts.get(part.type)??0)+part.amount)
  const identity=JSON.stringify({targetId:entityId,components:[...amounts].sort(([a],[b])=>a.localeCompare(b)),
    magical:Boolean(options.magical),silvered:Boolean(options.silvered),critical:Boolean(options.critical),weaponAttack:Boolean(options.weaponAttack),sourceId:options.sourceId??null,knockout:options.knockout??null})
  const old=inspectOilFireDamage(gs.getState(),{targetKind:'creature',targetId:entityId,eventId,components:[]})
  if(old.issue)throw new RuleViolation(old.issue.code,old.issue.message,{})
  if(old.replay){
    const packet=old.replay
    if(packet.requestWitness!==identity||!Array.isArray(packet.components)||!packet.result||typeof packet.result!=='object')
      throw new RuleViolation('OIL_FIRE_EVENT_CONFLICT','This retained damage event does not match the original actual typed packet and source options.',{})
    return structuredClone(packet) as unknown as ReturnType<typeof commitDamageInstance>
  }
  const target=gs.getEntity(entityId)
  if(!target||components.some(part=>!Number.isFinite(part.amount)||part.amount<0||!DamageTypeSchema.safeParse(part.type).success))return commitDamageInstance(entityId,components,options)
  const inspection=inspectOilFireDamage(gs.getState(),{targetKind:'creature',targetId:entityId,eventId,components:[...amounts].map(([type,rawAmount])=>({type,rawAmount,
    damageAfterDefenses:adjustedDamage(target,rawAmount,type,options.magical,options.silvered,options.weaponAttack).damage}))})
  if(inspection.issue)throw new RuleViolation(inspection.issue.code,inspection.issue.message,{})
  if(!inspection.plan)return commitDamageInstance(entityId,components,options)
  const adjustedComponents=[...amounts].map(([type,amount])=>({type,amount:amount+(type==='fire'?inspection.plan!.additionalFireDamage:0)}))
  const fresh=commitDamageInstance(entityId,adjustedComponents,options)
  const packet={components:fresh.components,result:{...fresh.result,oilFire:{...inspection.plan}},requestWitness:identity}
  commitOilFireDamage(inspection.plan,packet)
  return packet
}
export function dealDamage(entityId:string,amount:number,type:DamageType,options:DamageInstanceOptions={}){
  return withCackleConsequences(()=>({...applyDamageInstance(entityId,[{amount,type}],options).result,damageType:type}))
}
export function dealDamageComponents(entityId:string,components:readonly TypedDamageComponent[],options:DamageInstanceOptions={}){
  return withCackleConsequences(()=>{const packet=applyDamageInstance(entityId,components,options)
  return{...packet.result,damageTypes:[...new Set(packet.components.map(part=>part.damageType))],damageComponents:packet.components,...(options.damageEventId?{damageEventId:options.damageEventId}:{})}})
}

function allied(a: Creature, b: Creature): boolean {
  if (a.id === b.id) return false
  return (a.id === 'player' || ('hostile' in a && a.hostile === false)) === (b.id === 'player' || ('hostile' in b && b.hostile === false))
}
export function allyAdjacentTo(attacker: Creature, target: Creature): boolean {
  return [gs.getPlayer(), ...Object.values(gs.getState().monsters)].some(ally => ally.id !== target.id && allied(attacker, ally)
    && ally.hp.current > 0 && !ally.conditions.some(c => ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c))
    && Math.max(Math.abs(ally.position.x - target.position.x), Math.abs(ally.position.y - target.position.y)) <= 1)
}

export function applyAttackRiders(attacker: MonsterState, target: Creature, attackName: string, damage: number): unknown[] {
  if ('isAlive' in target ? !target.isAlive : target.deathSaves?.dead) return []
  const riders: unknown[] = []
  if (attackName === 'Bite' && hasTrait(attacker, 'Pack Tactics')) {
    const save = savingThrow(target.id, 'str', 11)
    riders.push(save)
    if (!save.success) riders.push(gs.applyCondition(target.id, 'prone'))
  }
  if (attackName === 'Bite' && hasTrait(attacker, 'Amphibious')) {
    if (!conditionImmune(target, 'grappled') && !gs.getState().monsterEffects?.some(effect => effect.kind === 'grapple' && effect.sourceId === attacker.id)) riders.push(addEffect({ kind: 'grapple', sourceId: attacker.id, targetId: target.id,
      conditions: ['grappled', 'restrained'], dc: 11 }))
    else riders.push({ immune: true, condition: 'grappled' })
  }
  if (attackName === 'Shortbow' && sourceAction(attacker, 'Heart Sight')) {
    if (conditionImmune(target, 'poisoned')) riders.push({ immune: true, condition: 'poisoned', sourceId: attacker.id, targetId: target.id })
    else {
      const save = savingThrow(target.id, 'con', 10)
      riders.push(save)
      if (!save.success) {
        const poison = addEffect({ kind: 'sprite-poison', sourceId: attacker.id, targetId: target.id,
          conditions: ['poisoned'], expiresAt: (gs.getState().worldTimeSeconds ?? 0) + 60 })
        riders.push(poison)
        if (save.roll.total <= 5) riders.push(addEffect({ kind: 'sprite-sleep', spritePoisonId: poison.id,
          sourceId: attacker.id, targetId: target.id, conditions: ['unconscious'], endsOnDamage: true, expiresAt: poison.expiresAt }))
      }
    }
  }
  if (attackName === 'Life Drain' && damage > 0) {
    const save = savingThrow(target.id, 'con', 13)
    riders.push(save)
    if (!save.success) {
      const beforeHp = target.hp.current
      const beforeBase = gs.getState().dmTools?.exhaustion?.creatures[target.id]?.unexhaustedHpMax ?? target.hp.max
      const reduction = Math.min(beforeBase, damage)
      adjustExhaustionHpMaximum(target.id, -reduction)
      riders.push(addEffect({ kind: 'life-drain', sourceId: attacker.id, targetId: target.id, conditions: [], hpMaxReduction: reduction }))
      if (target.hp.max === 0) {
        finishExhaustionHpChange(target.id, beforeHp, true)
      }
      riders.push({ hpMaxReduction: reduction, hpMax: target.hp.max, hpAfter: target.hp.current })
    }
  }
  return riders
}

export function expireMonsterEffects(): void {
  assertPetrifiedSpriteHistory()
  const state = gs.getState(), now = state.worldTimeSeconds ?? 0
  for (const effect of [...state.monsterEffects ?? []].filter(effect => effect.conditions.includes('petrified') && effect.expiresAt !== undefined && effect.expiresAt <= now)
    .sort((a,b) => a.expiresAt! - b.expiresAt!)) endEffect(effect.id)
  for (const effect of [...state.monsterEffects ?? []]) if (!effect.petrificationPause && effect.expiresAt !== undefined && effect.expiresAt <= now) endEffect(effect.id)
  reconcileMonsterEffects()
  state.monsterPowerImmunities = (state.monsterPowerImmunities ?? []).filter(entry => entry.expiresAt > now)
}
export function startMonsterTurn(): void {
  const state = gs.getState()
  expireMonsterEffects()
  const monster = gs.getMonster(state.currentTurn ?? '')
  if (!monster) return
  monster.monsterRuntime ??= {}
  const key = `${state.combatGeneration}:${state.turnCounter ?? 0}:${monster.id}`
  if (monster.monsterRuntime.startedTurn === key) return
  monster.monsterRuntime.startedTurn = key
  for (const action of monsterSource(monster)?.actions ?? []) {
    if (action.usage?.type === 'recharge on roll' && monster.monsterRuntime.recharge?.[action.name] === false) {
      const roll = rollDice(action.usage.dice!)
      monster.monsterRuntime.recharge[action.name] = roll.total >= action.usage.min_value!
      gs.addLogEntry({ round: state.round, turn: monster.id, action: `Recharge ${action.name}`, mechanicalDetail: roll.detail })
    }
  }
}
