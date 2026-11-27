import { activeFrigidWaterEpisode, dueFrigidWaterSave, frigidWaterDueIssue, frigidWaterEventId, frigidWaterStateOf,
  FRIGID_WATER_DC, FRIGID_WATER_MINUTE, FRIGID_WATER_SOURCE, nextFrigidWaterSave, RecordFrigidWaterSchema,
  type FrigidWaterEpisode, type FrigidWaterQualification } from '../lib/frigid-water-state'
import { actualLocomotionLocation, locomotionStateOf } from '../lib/locomotion-state'
import { currentUnderwaterRecord, underwaterSubjectFrame } from '../lib/underwater-rules'
import { underwaterStateOf } from '../lib/underwater-state'
import { entityVerticalContext } from '../lib/jumping-state'
import { swallowedBy } from '../lib/swallow-state'
import type { GameState, SavingThrowResult, WorldFact } from '../lib/types'
import { chaseWardSequenceIssue, pendingChaseDashChecks } from '../lib/chase-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import * as gs from './game-state'
import { changeExhaustion, inspectExhaustion } from './exhaustion'
import { available, effects } from './hero-rules'
import { conditionImmune } from './monster-rules'
import { toolkitError, toolkitResult, toolkitState } from './toolkit'
import { registerCheckedResolution, savedResolution } from './toolkit-checks'

const now = () => gs.getState().worldTimeSeconds ?? 0
const playerSubject = { kind: 'creature', entityId: 'player' } as const
const sameCell = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x === b.x && a.y === b.y
const exhaustionReason = 'DMG2014 Frigid Water: failed CON DC10 after a completed additional minute of actual immersion.'
const exhaustionId = (eventId: string) => `\u0000${eventId}`

export function frigidWaterQualification(state: GameState, mediumId: string) {
  const medium = locomotionStateOf(state)?.media[mediumId]
  return medium?.mode === 'swim' && medium.mapId === state.currentMapId
    ? Object.values(frigidWaterStateOf(state)?.qualifications ?? {}).find(value =>
      value.waterMediumId === mediumId && value.mediumWitness === witness(medium))
    : undefined
}

type PhysicalExposure = { qualification: FrigidWaterQualification; entry: FrigidWaterEpisode['entry']; uncertain: false }
  | { qualification?: undefined; uncertain: boolean }

function physicalExposure(state: GameState): PhysicalExposure {
  if (state.player.deathSaves?.dead || swallowedBy(state, 'player')) return { uncertain: false }
  const position = actualLocomotionLocation(state, 'player')
  const sourceMove = position ? locomotionStateOf(state)?.moves[position.sourceEventId] : undefined
  if (position && sourceMove?.input.surfaceSwimmingConfirmed) {
    const qualification = frigidWaterQualification(state, position.mediumId)
    if (qualification) return { qualification, entry: { kind: 'surface_swim', eventId: position.sourceEventId }, uncertain: false }
  }
  const frame = underwaterSubjectFrame(state, playerSubject)
  const immersion = currentUnderwaterRecord(state, playerSubject)
  if (immersion?.fullyImmersed) {
    const qualification = frigidWaterQualification(state, immersion.waterMediumId)
    if (qualification) return { qualification, entry: { kind: 'whole_immersion', eventId: immersion.eventId }, uncertain: false }
  }
  // Losing an observation is not leaving the physical water. The same XY over
  // a qualified volume, without proved water contact or a dry altitude, is unresolved.
  const lostOriginalHeight = Boolean(activeFrigidWaterEpisode(state) && entityVerticalContext(state, 'player').source === 'legacy_flat_map_plane')
  return { uncertain: Boolean(frame && Object.values(frigidWaterStateOf(state)?.qualifications ?? {}).some(q => {
    const water = locomotionStateOf(state)?.media[q.waterMediumId]
    return q.mapId === frame.mapId && water?.cells.some(cell => sameCell(cell, frame.cell))
      && (lostOriginalHeight || !frame.known || frame.zFeet! < water.surfaceZFeet!)
  })) }
}

export function assertFrigidWaterEpisodeRoom() {
  const saved = frigidWaterStateOf(gs.getState())
  if (!activeFrigidWaterEpisode(gs.getState()) && (saved?.episodes.length ?? 0) >= 256) {
    toolkitError('FRIGID_WATER_HISTORY_LIMIT', 'An actual new immersion needs retained episode space before movement or observation.')
  }
}

/** Invoked on actual commits. Unknown geometry retains its existing exposure;
 * only a proved dry exit may end it. An intra-water move never resets it. */
export function reconcileFrigidWaterPresence() {
  const state = gs.getState(), saved = frigidWaterStateOf(state)
  if (!saved || !Object.keys(saved.qualifications).length) return
  const active = activeFrigidWaterEpisode(state), physical = physicalExposure(state)
  if (active) {
    if (!physical.qualification && !physical.uncertain) active.episode.endedAt = now()
    return
  }
  if (physical.qualification) {
    assertFrigidWaterEpisodeRoom()
    saved.episodes.push({ qualificationId: physical.qualification.eventId, startedAt: now(), constitution: state.player.stats.con, entry: physical.entry, saves: [] })
  }
}

export function recordFrigidWater(raw: unknown) {
  const input = RecordFrigidWaterSchema.parse(raw), state = gs.getState()
  const saved = frigidWaterStateOf(state), previous = saved?.qualifications[input.eventId]
  if (previous) {
    const original = { eventId: previous.eventId, waterMediumId: previous.waterMediumId, factId: previous.factId,
      actualFrigidWaterConfirmed: previous.actualFrigidWaterConfirmed }
    if (JSON.stringify(original) !== JSON.stringify(input)) toolkitError('FRIGID_WATER_EVENT_CONFLICT', 'Keep the exact original water classification and physical fact.')
    return { success: true, qualification: previous, replayed: true, source: FRIGID_WATER_SOURCE }
  }
  if (state.hero?.pending) toolkitError('REACTION_PENDING', 'Retain the actual circumstances of the already held result before classifying another water source.')
  const due = frigidWaterDueIssue(state)
  if (due) toolkitError(due.code, due.message)
  const medium = locomotionStateOf(state)?.media[input.waterMediumId], fact = state.worldFacts?.find(value => value.id === input.factId)
  if (!medium || medium.mode !== 'swim' || medium.mapId !== state.currentMapId || !fact?.narrativeEffect || fact.source !== 'record_scene_fact'
    || fact.mapId !== medium.mapId || fact.roomId !== medium.roomId || !medium.cells.some(cell => sameCell(cell, fact.narrativeEffect!.cell))) {
    toolkitError('FRIGID_WATER_SOURCE_REQUIRED', 'Choose actual measured current-map water and an existing cold-water scene fact in one of its cells.')
  }
  const swimmer = actualLocomotionLocation(state, 'player'), immersion = currentUnderwaterRecord(state, playerSubject)
  if (swimmer?.mediumId === medium.mediumId || immersion?.fullyImmersed && immersion.waterMediumId === medium.mediumId) {
    toolkitError('FRIGID_WATER_ENTRY_HISTORY_REQUIRED', 'Classify this water before actual entry. No earlier cold dose or fresh grace inside already occupied water is inferred.')
  }
  const mediumWitness = witness(medium)
  if (Object.values(saved?.qualifications ?? {}).some(value => value.waterMediumId === input.waterMediumId && value.mediumWitness === mediumWitness)) {
    toolkitError('FRIGID_WATER_ALREADY_QUALIFIED', 'This exact real water witness already has its retained frigid-water classification.')
  }
  if (Object.keys(saved?.qualifications ?? {}).length >= 256) toolkitError('FRIGID_WATER_HISTORY_LIMIT', 'Retain the bounded original water observations before adding another one.')
  const qualification = { ...input, mapId: medium.mapId, mediumWitness, factWitness: witness(fact), at: now() }
  const ledger = toolkitState().frigidWater ??= { version: 1, qualifications: {}, episodes: [] }
  ledger.qualifications[input.eventId] = qualification
  return { success: true, qualification, source: FRIGID_WATER_SOURCE }
}

function automaticReason(state: GameState) {
  // The playable profiles have no established native ice-water adaptation.
  // Real petrification confers resistance to all damage, including cold.
  return state.player.conditions.includes('petrified') ? 'actual_petrification_cold_resistance' : undefined
}

function assertFrigidWaterSavePreflight() {
  const state = gs.getState()
  const level = inspectExhaustion('player').level
  if (conditionImmune(state.player, 'exhaustion')) return
  if (Object.keys(state.dmTools?.exhaustion?.receipts ?? {}).length >= 2048)
    toolkitError('EXHAUSTION_RECEIPT_LIMIT', 'A possible actual failed immersion save needs an exhaustion receipt before its die.')
  if (level >= 5 && effects('death-ward', 'player').length)
    toolkitError('EXHAUSTION_DEATH_WARD_ADJUDICATION', 'Resolve this potentially fatal source interaction explicitly before rolling or spending Inspiration.')
  const checks = pendingChaseDashChecks(state, 'player')
  if (checks > 0 && level + 1 + checks > 6)
    toolkitError('CHASE_DASH_END_REQUIRED', 'Keep the actual outstanding Dash checks before this possible exhaustion source.')
  const wardIssue = chaseWardSequenceIssue(state, 'player', { checks, exhaustionLevel: Math.min(6, level + 1) })
  if (wardIssue) toolkitError(wardIssue.code, wardIssue.message)
}

export function assertFrigidWaterHeldSave() {
  const state = gs.getState(), pending = state.hero?.pending
  const resolution = pending?.command.toolkitResolution as { domain?: string; command?: { eventId?: string } } | undefined
  if (resolution?.domain !== 'frigid-water-save') return
  const event = dueFrigidWaterSave(state)
  const held = frigidWaterStateOf(state)?.held
  if (!event || resolution.command?.eventId !== event.eventId || pending?.sourceId !== 'player' || pending.command.type !== 'save')
    toolkitError('FRIGID_WATER_HELD_SAVE_MISMATCH', 'Keep the original player and actually due immersion minute of the held Constitution save.')
  if (!held || held.eventId !== event.eventId || held.witness !== witness(pending))
    toolkitError('FRIGID_WATER_HELD_SAVE_MISMATCH', 'Keep the exact original held die and player choice.')
  assertFrigidWaterSavePreflight()
}

export function frigidWaterWardRemediationAt(targetId: string) {
  const state = gs.getState(), event = dueFrigidWaterSave(state)
  if (!event || targetId !== 'player' || automaticReason(state) || !effects('death-ward', 'player').length
    || inspectExhaustion('player').level < 5) return undefined
  return event.at
}

function finishFrigidWaterSave(eventId: string, save?: SavingThrowResult, automatic?: string) {
  const state = gs.getState(), event = dueFrigidWaterSave(state), active = activeFrigidWaterEpisode(state)
  if (!event || !active || event.eventId !== eventId)
    toolkitError('FRIGID_WATER_SAVE_REQUIRED', 'Finish only the current actual due immersion minute.')
  const success = automatic !== undefined || save?.success === true
  const causeExhaustion = !success && !conditionImmune(state.player, 'exhaustion')
  const exhaustionEventId = causeExhaustion ? exhaustionId(eventId) : undefined
  if (exhaustionEventId) changeExhaustion({ eventId: exhaustionEventId, targetId: 'player', operation: 'add', levels: 1, reason: exhaustionReason })
  const receipt = { eventId, at: event.at, success, ...(save ? { save: { ...save } } : {}),
    ...(automatic ? { automaticReason: automatic } : {}), ...(exhaustionEventId ? { exhaustionEventId } : {}) }
  active.episode.saves.push(receipt)
  delete frigidWaterStateOf(state)!.held
  if (gs.getState().player.deathSaves?.dead) active.episode.endedAt = now()
  const resumedCombatTurn = gs.completeSurvivalRoundTransition()
  return toolkitResult({ ...receipt, resolved: true, dc: FRIGID_WATER_DC, source: FRIGID_WATER_SOURCE,
    ...(resumedCombatTurn === undefined ? {} : { resumedCombatTurn }) })
}

export function registerFrigidWaterContinuation() {
  registerCheckedResolution('frigid-water-save', (command, save) => finishFrigidWaterSave(String(command.eventId), save as SavingThrowResult))
}

export function resolveFrigidWaterSave(eventId: string) {
  const state = gs.getState()
  const old = frigidWaterStateOf(state)?.episodes.flatMap(episode => episode.saves).find(save => save.eventId === eventId)
  if (old) return toolkitResult({ ...old, resolved: true, dc: FRIGID_WATER_DC, source: FRIGID_WATER_SOURCE, replayed: true })
  const event = dueFrigidWaterSave(state)
  if (!event || event.eventId !== eventId) toolkitError('FRIGID_WATER_SAVE_REQUIRED', 'Choose the exact actual due immersion minute, never a future or invented save.')
  const pending = state.hero?.pending
  const held = pending?.command.toolkitResolution as { domain?: string; command?: { eventId?: string } } | undefined
  if (held?.domain === 'frigid-water-save' && held.command?.eventId === eventId)
    return toolkitResult({ pendingReaction: pending, replayed: true })
  available({ allowFrigidWaterDue: true, allowWeatherDue: true, allowNutritionDue: true, allowTravelDue: true,
    allowCasting: true, allowSewerOnsetAt: event.at })
  const automatic = automaticReason(state)
  if (automatic) return finishFrigidWaterSave(eventId, undefined, automatic)
  assertFrigidWaterSavePreflight()
  const result = savedResolution({ entityId: 'player', ability: 'con', dc: FRIGID_WATER_DC }, { domain: 'frigid-water-save', command: { eventId } })
  if (state.hero?.pending) frigidWaterStateOf(state)!.held = { eventId, witness: witness(state.hero.pending) }
  return result
}

function retainedObservation(q: FrigidWaterQualification, live?: WorldFact) {
  if (live) return q.factWitness === witness(live) ? live : undefined
  try { return JSON.parse(q.factWitness) as WorldFact | undefined } catch { return undefined }
}

export function validateFrigidWaterHistory(state: GameState) {
  const ledger = frigidWaterStateOf(state)
  const pending = state.hero?.pending
  const held = pending?.command.toolkitResolution as { domain?: string; command?: { eventId?: string } } | undefined
  if (!ledger) return held?.domain === 'frigid-water-save' ? ['Keep the actual frigid-water history of the held save.'] : []
  const issues: string[] = [], time = state.worldTimeSeconds ?? 0, locomotion = locomotionStateOf(state)
  if (Object.keys(ledger.qualifications).length > 256) issues.push('Frigid-water physical qualifications exceed retained capacity.')
  for (const [key, q] of Object.entries(ledger.qualifications)) {
    const water = locomotion?.media[q.waterMediumId], fact = retainedObservation(q, state.worldFacts?.find(value => value.id === q.factId))
    if (key !== q.eventId || !water || water.mode !== 'swim' || water.mapId !== q.mapId || q.at < water.at || q.at > time
      || q.mediumWitness !== witness(water) || !fact || fact.id !== q.factId || fact.source !== 'record_scene_fact' || fact.mapId !== water.mapId
      || fact.roomId !== water.roomId || !fact.narrativeEffect?.cell || !water.cells.some(cell => sameCell(cell, fact.narrativeEffect!.cell))
      || q.factWitness !== witness(fact)) issues.push('Keep the exact actual water geometry and original frigid-water observation.')
  }
  for (const [index, episode] of ledger.episodes.entries()) {
    const q = ledger.qualifications[episode.qualificationId], previous = ledger.episodes[index - 1]
    const move = locomotion?.moves[episode.entry.eventId]
    const observation = underwaterStateOf(state)?.receipts[episode.entry.eventId]?.result.record as { waterMediumId?: string; fullyImmersed?: boolean; at?: number } | undefined
    const validEntry = episode.entry.kind === 'surface_swim'
      ? move?.input.entityId === 'player' && move.input.surfaceSwimmingConfirmed && move.input.mediumId === q?.waterMediumId
        && move.at === episode.startedAt && move.cursor > 0
      : observation?.fullyImmersed && observation.waterMediumId === q?.waterMediumId && (observation.at ?? Infinity) <= episode.startedAt
    if (!q || !validEntry || episode.startedAt < q.at || episode.startedAt > time
      || (index > 0 && (previous.endedAt === undefined || previous.endedAt > episode.startedAt))
      || (episode.endedAt !== undefined && (episode.endedAt < episode.startedAt || episode.endedAt > time))) {
      issues.push('An immersion episode needs its original actual entry, physical source and chronological exit.')
    }
    for (const [saveIndex, receipt] of episode.saves.entries()) {
      const ordinal = saveIndex + 1, expected = frigidWaterEventId(index, ordinal)
      const linked = receipt.exhaustionEventId ? state.dmTools?.exhaustion?.receipts[receipt.exhaustionEventId] : undefined
      if (receipt.eventId !== expected || receipt.at !== episode.startedAt + (episode.constitution + ordinal) * FRIGID_WATER_MINUTE
        || receipt.at > (episode.endedAt ?? time) || Boolean(receipt.save) === Boolean(receipt.automaticReason)
        || (receipt.save && (receipt.save.entityId !== 'player' || receipt.save.ability !== 'con' || receipt.save.dc !== FRIGID_WATER_DC
          || receipt.save.success !== receipt.success))
        || (receipt.automaticReason && (!receipt.success || receipt.automaticReason !== 'actual_petrification_cold_resistance'))
        || (receipt.exhaustionEventId && (receipt.success || receipt.exhaustionEventId !== exhaustionId(expected) || linked?.targetId !== 'player'
          || linked.operation !== 'add' || linked.levels !== 1 || linked.at !== receipt.at || linked.reason !== exhaustionReason))
        || (!receipt.success && !receipt.exhaustionEventId)) {
        issues.push('An immersion minute must retain its exact save and any original linked exhaustion receipt.')
      }
    }
  }
  const active = activeFrigidWaterEpisode(state), physical = physicalExposure(state), next = nextFrigidWaterSave(state)
  if (Boolean(active) !== Boolean(physical.qualification) && !physical.uncertain && !state.player.deathSaves?.dead)
    issues.push('The active immersion must match the actual current water witness.')
  if (next && next.at < time) issues.push('The actual unresolved immersion boundary cannot be bypassed.')
  if (held?.domain === 'frigid-water-save' || ledger.held) {
    if (held?.domain !== 'frigid-water-save' || !ledger.held || next?.at !== time || held.command?.eventId !== next.eventId
      || ledger.held.eventId !== next.eventId || pending?.command.type !== 'save' || pending.sourceId !== 'player'
      || ledger.held.witness !== witness(pending)) issues.push('Keep the exact actually due held Constitution save.')
  }
  return issues
}

export function inspectFrigidWater() {
  const state = gs.getState()
  return { source: FRIGID_WATER_SOURCE, active: activeFrigidWaterEpisode(state)?.episode ?? null,
    nextSave: nextFrigidWaterSave(state) ?? null, dueSave: dueFrigidWaterSave(state) ?? null,
    qualifications: frigidWaterStateOf(state)?.qualifications ?? {} }
}

export function assertFrigidWaterTimeAdvance(seconds: number, combatStep = false) {
  if (seconds <= 0) return
  const state = gs.getState(), due = frigidWaterDueIssue(state)
  if (due) toolkitError(due.code, due.message)
  const physical = physicalExposure(state)
  if (physical.uncertain || (physical.qualification && !activeFrigidWaterEpisode(state))) {
    toolkitError('FRIGID_WATER_CONTACT_REQUIRED', 'The player overlaps a qualified frigid-water volume without established immersion or dry exit. Resolve the real physical context before time advances.')
  }
  const event = nextFrigidWaterSave(state)
  if (event && event.ordinal > 2048 && now() + seconds >= event.at) {
    toolkitError('FRIGID_WATER_HISTORY_LIMIT', 'The original immersion minute needs retained save space before time advances.')
  }
  if (event && now() + seconds > event.at && !combatStep) {
    toolkitError('FRIGID_WATER_TIME_BOUNDARY', `Stop at the actual immersion minute in ${event.at - now()} seconds and explicitly resolve the save before further time.`)
  }
}
