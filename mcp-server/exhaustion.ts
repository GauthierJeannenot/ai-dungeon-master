import { cackleExhaustionFloor } from '../lib/cackle-fever-state'
import { chaseFatigue,chaseStateOf,pendingChaseDashChecks,chaseWardSequenceIssue } from '../lib/chase-state'
import { nutritionRestEligibility } from '../lib/survival-state'
import type { ExhaustionState, ExhaustionReceipt } from '../lib/exhaustion-state'
import { exhaustionLevel, exhaustionEffects, setExhaustionLevel, adjustExhaustionMaximum } from '../lib/exhaustion'
import { toolkitState, toolkitError } from './toolkit'
import { assertHero, hero, now, effects, removeHeroEffect, heroAfterHPChange,reconcileNaturalRecoveryClock } from './hero-rules'
import { conditionImmune } from './monster-rules'
import { reconcileMagicItems } from './magic-items'
import * as gs from './game-state'
import { noticeNpcHealingCeilingChange } from '../lib/affliction-healing'
import { hasNpcZeroHpEpisode } from '../lib/npc-life-state'

// Structural accessor also permits the schema to be integrated independently.
function data(): ExhaustionState {
  const state = toolkitState() as ReturnType<typeof toolkitState> & { exhaustion?: ExhaustionState }
  return state.exhaustion ??= { creatures: {}, receipts: {} }
}
export function inspectExhaustion(targetId: string,physicalAreaBody=false) {
  const target = physicalAreaBody?gs.getPhysicalCreature(targetId):gs.getEntity(targetId)
  if (!target) toolkitError('ENTITY_NOT_FOUND', 'Choose an existing exhaustion target.')
  if (target!.conditions.includes('exhaustion') && !gs.getState().dmTools?.exhaustion?.creatures[targetId])
    toolkitError('EXHAUSTION_LEVEL_REQUIRED', 'A legacy exhaustion condition has no tracked level. An explicit authoritative level is required; the engine cannot infer it.')
  const level = exhaustionLevel(gs.getState(), targetId)
  return { targetId, level, effects: exhaustionEffects(level), hp: { ...target!.hp },
    unexhaustedHpMax: gs.getState().dmTools?.exhaustion?.creatures[targetId]?.unexhaustedHpMax,
    dead: targetId === 'player' ? Boolean(gs.getPlayer().deathSaves?.dead) : !(target as { isAlive: boolean }).isAlive,
    exhaustionRecovery: exhaustionLongRestRecovery(targetId) }
}

/** Inspection reports eligibility only; the real long-rest hook owns recovery. */
export function exhaustionLongRestRecovery(targetId = 'player') {
  const eligibility = nutritionRestEligibility(targetId === 'player' ? gs.getState().dmTools?.survival : undefined)
  return { status: eligibility.eligible ? 'eligible' as const : 'blocked' as const, code: eligibility.code,
    levelUnchanged: true, level: exhaustionLevel(gs.getState(), targetId), reason: eligibility.reason }
}

/** Parent must route every additive Aid/Drain/restoration mutation through this. */
export function adjustExhaustionHpMaximum(targetId: string, delta: number, minimum = 0) {
  const target = gs.getPersistedMaximumHpTarget(targetId)
  if (!target) toolkitError('ENTITY_NOT_FOUND', 'Maximum-HP target is absent.')
  const record = gs.getState().dmTools?.exhaustion?.creatures[targetId]
  const result = adjustExhaustionMaximum(record, target!.hp, delta, minimum)
  finishExhaustionHpChange(targetId, result.hpBefore.current, false)
  return result
}

/** Direct maximum changes and instantaneous death must not masquerade as damage. */
export function finishExhaustionHpChange(targetId: string, hpBefore: number, fatal: boolean) {
  const target = gs.getPersistedMaximumHpTarget(targetId)
  if (!target) toolkitError('ENTITY_NOT_FOUND', 'Maximum-HP bookkeeping target is absent from active and archived state.')
  const preserveLivingZero='isAlive'in target&&hpBefore===0&&!fatal&&hasNpcZeroHpEpisode(target)
  if (fatal) target.hp.current = 0
  if (target.hp.current <= 0) {
    if ('isAlive' in target) {if(!preserveLivingZero)target.isAlive = false}
    else {
      target.deathSaves ??= { successes: 0, failures: 0 }
      if (fatal) target.deathSaves.dead = true
    }
    if (!target.conditions.includes('unconscious')) target.conditions.push('unconscious')
    if (gs.getState().hero) {
      const concentrationId = hero().concentrationIds[targetId]
      if (concentrationId) removeHeroEffect(concentrationId)
      if (targetId === 'player' && hero().concentrationId) removeHeroEffect(hero().concentrationId!)
      if (fatal || 'isAlive' in target&&!preserveLivingZero) hero().corpseTimes[targetId] ??= now()
    }
  }
  if(fatal)gs.recordActualDeath(targetId)
  heroAfterHPChange(targetId, hpBefore, 0)
  if('isAlive'in target)noticeNpcHealingCeilingChange(gs.getState(),target)
  if (fatal) reconcileMagicItems()
}

export type ExhaustionCommand = { eventId: string; targetId: string; operation: 'add' | 'remove' | 'raised_from_dead'; levels: number; reason: string }
export function changeExhaustion(input: ExhaustionCommand, attribution:{chaseSourceId?:string;removalSource?:'chase'|'other'}={}) {
  assertHero()
  // This is also called from successful resurrection, not exclusively MCP/Zod.
  if (!input.eventId || !input.reason.trim() || !Number.isInteger(input.levels) || input.levels < 1 || input.levels > 6)
    toolkitError('EXHAUSTION_ARGUMENTS', 'An explicit unique eventId, reason, and 1–6 integer levels are required.')
  if (input.operation === 'raised_from_dead' && input.levels !== 1)
    toolkitError('EXHAUSTION_RESURRECTION_LEVEL', 'PHB 2014 resurrection removes exactly one exhaustion level.')
  const command = JSON.stringify({ targetId: input.targetId, operation: input.operation, levels: input.levels, reason: input.reason,...attribution })
  const existing = gs.getState().dmTools?.exhaustion, old = existing?.receipts[input.eventId]
  if (old) {
    if (old.command !== command) toolkitError('EXHAUSTION_EVENT_CONFLICT', 'This eventId already records a different exhaustion event.')
    return { success: true, alreadyApplied: true, receipt: old, target: inspectExhaustion(input.targetId) }
  }
  if (Object.keys(existing?.receipts ?? {}).length >= 2048) toolkitError('EXHAUSTION_RECEIPT_LIMIT', 'At most 2048 exhaustion events per session; no receipt is evicted.')
  const target = gs.getEntity(input.targetId)
  if (!target) toolkitError('ENTITY_NOT_FOUND', 'Choose an existing exhaustion target.')
  if (target!.conditions.includes('exhaustion') && !existing?.creatures[input.targetId])
    toolkitError('EXHAUSTION_LEVEL_REQUIRED', 'A legacy exhaustion condition has no tracked level. Set an explicit authoritative level before modifying it.')
  const dead = input.targetId === 'player' ? Boolean(gs.getPlayer().deathSaves?.dead) : !(target as { isAlive: boolean }).isAlive
  if (input.operation === 'add' && dead) toolkitError('EXHAUSTION_TARGET_DEAD', 'A corpse cannot newly suffer exhaustion; this does not resurrect it.')
  if (input.operation === 'raised_from_dead' && (dead || target!.hp.current <= 0))
    toolkitError('EXHAUSTION_RESURRECTION_REQUIRED', 'Only call this hook after a successful actual resurrection.')
  if (input.operation === 'add' && conditionImmune(target!, 'exhaustion'))
    toolkitError('EXHAUSTION_IMMUNE', 'The exact creature stat block is immune to exhaustion.')
  const chaseDebt=chaseFatigue(gs.getState(),input.targetId)
  if(attribution.chaseSourceId&&(input.operation!=='add'||!chaseStateOf(gs.getState())?.episodes[attribution.chaseSourceId]?.participants[input.targetId]))toolkitError('CHASE_EXHAUSTION_SOURCE_REQUIRED','A chase-add source belongs to its exact actually enrolled participant.')
  if(input.operation==='add'&&attribution.removalSource)toolkitError('EXHAUSTION_REMOVAL_SOURCE_NOT_APPLICABLE','Only an actual reduction selects a removal source.')
  const total=existing?.creatures[input.targetId]?.level??0
  if(input.operation!=='add'&&chaseDebt>0){
    if(!attribution.removalSource&&chaseDebt<total)toolkitError('EXHAUSTION_SOURCE_CHOICE_REQUIRED','Actual exhaustion mixes chase and other sources: explicitly choose chase or other before removal; no priority is invented.')
    attribution={...attribution,removalSource:attribution.removalSource??'chase'}
    const removable=attribution.removalSource==='chase'?chaseDebt:total-chaseDebt
    if(input.levels>removable)toolkitError('EXHAUSTION_SOURCE_LEVELS_REQUIRED','Remove only the explicitly selected source levels, without spilling into another source or erasing fatigue provenance.')
  }else if(attribution.removalSource==='chase')toolkitError('CHASE_FATIGUE_NOT_PRESENT','No actual chase-source exhaustion remains to remove.')
  const remainingChaseChecks=pendingChaseDashChecks(gs.getState(),input.targetId)
  if(input.operation==='add'&&remainingChaseChecks>0&&Math.min(6,total+input.levels)+remainingChaseChecks>6)toolkitError('CHASE_DASH_END_REQUIRED','Finish the already acquired actual Dash checks before a new exhaustion source would strand ability-check debt after death; no source/cost is erased.')
  if(input.operation==='add'&&!attribution.chaseSourceId){const chase=chaseWardSequenceIssue(gs.getState(),input.targetId,{checks:remainingChaseChecks,exhaustionLevel:Math.min(6,total+input.levels)});if(chase)toolkitError(chase.code,chase.message)}
  const record = existing?.creatures[input.targetId] ?? { level: 0 }
  const beforeLevel = record.level, hpBefore = { ...target!.hp }
  const next = Math.max(0, Math.min(6, beforeLevel + (input.operation === 'add' ? input.levels : -input.levels)))
  if(input.operation!=='add'&&next<cackleExhaustionFloor(gs.getState(),input.targetId))toolkitError('CACKLE_EXHAUSTION_LOCKED','The actual disease protects one symptomatic exhaustion level until cured; other levels remain removable by their real sources.')
  // The interaction's source-event granularity requires an explicit ruling.
  const ward = input.operation === 'add' && next === 6 ? effects('death-ward', input.targetId)[0] : undefined
  if (ward) toolkitError('EXHAUSTION_DEATH_WARD_ADJUDICATION', 'Resolve the interaction of this exhaustion source and Death Ward explicitly; neither exhaustion nor the ward has changed.')
  const store = data()
  store.creatures[input.targetId] = record
  setExhaustionLevel(record, target!.hp, next)
  if (record.level > 0) {
    if (!target!.conditions.includes('exhaustion')) target!.conditions.push('exhaustion')
  } else target!.conditions = target!.conditions.filter(condition => condition !== 'exhaustion')
  const died = input.operation === 'add' && next === 6
  finishExhaustionHpChange(input.targetId, hpBefore.current, died)
  const receipt: ExhaustionReceipt = { ...input,...attribution, command, beforeLevel, afterLevel: record.level,
    hpBefore, hpAfter: { ...target!.hp }, died, at: now() }
  store.receipts[input.eventId] = receipt
  const chaseData=chaseStateOf(gs.getState())
  if(chaseData&&(attribution.chaseSourceId||attribution.removalSource==='chase')){
    const fatigue=chaseData.fatigue[input.targetId]??={levels:0,additions:[],removals:[]}
    if(attribution.chaseSourceId){fatigue.levels+=receipt.afterLevel-receipt.beforeLevel;fatigue.additions.push(input.eventId)}
    else {fatigue.levels-=receipt.beforeLevel-receipt.afterLevel;fatigue.removals.push(input.eventId)}
  }
  if('isAlive'in target&&(target.knockout?.recovery??target.npcLife?.episode?.recovery)?.healingHold?.availableAt!==undefined)
    reconcileNaturalRecoveryClock()
  return { success: true, alreadyApplied: false, receipt, target: inspectExhaustion(input.targetId) }
}

/** Call only after resurrection succeeded. A cast-specific ID ensures replay safety. */
export function afterExhaustionResurrection(targetId: string, castEventId: string) {
  if (!castEventId) toolkitError('EXHAUSTION_RESURRECTION_EVENT_REQUIRED', 'A successful resurrection requires a unique engine cast event ID.')
  // NUL is forbidden by ToolkitIdSchema, so MJ events cannot impersonate a cast.
  const eventId = `\u0000resurrection:${castEventId}`
  return changeExhaustion({ targetId, eventId, operation: 'raised_from_dead', levels: 1,
    reason: 'Successful resurrection: PHB 2014 Appendix A, Exhaustion, supplied source line 13655.' })
}
