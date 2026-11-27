import { sleepArmorSnapshot } from './sleep'
import { createHash, randomUUID } from 'node:crypto'
import type { GameState } from '../lib/types'
import { RestStateSchema, appendRestActivity, inspectRestPeriod, type RestSession, type RestState } from '../lib/rest-state'
import * as gs from './game-state'
import { available, assertHero, hero, now, feature, healingRoll, addHeroEffect, removeHeroEffect, advanceHeroTime, shortRest, longRest } from './hero-rules'
import { getAbilityModifier } from './dice'
import { assertBreathingRecoveryAllowed } from './breathing'
import { activeAfflictions } from './afflictions'
import { sewerPlagueEvent, sewerPlagueHitDieHealing } from './sewer-plague'
import { assertGameTimeAdvance } from './time-preflight'
import { actualLocomotionLocation } from '../lib/locomotion-state'
import { toolkitError, toolkitState } from './toolkit'

export interface RestChoices { hitDice?: number; arcaneRecovery?: number[]; songOfRest?: boolean }
export interface RecordedRestCompletion { restId: string; kind: 'short' | 'long'; hpAtStart: number; startedAt: number; completedAt: number; armoredSleep?:boolean }
const issued = new WeakSet<object>()
const saved = () => gs.getState().dmTools?.rests
const data = (): RestState => toolkitState().rests ??= { version: 1, receipts: {} }
function checkpoint(state = gs.getState(),canonical=true) {
  const player = state.player
  const physical = { time: state.worldTimeSeconds ?? 0, phase: state.phase, generation: state.combatGeneration,
    map: state.currentMapId, position: player.position, hp: player.hp, conditions: player.conditions,
    inventory: player.inventory, slots: player.spellSlots, resources: player.resources,
    lastLog: state.combatLog.at(-1), logLength: state.combatLog.length }
  return { fingerprint: createHash('sha256').update(JSON.stringify(physical,canonical?(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value:undefined)).digest('hex'),
    mapId: state.currentMapId ?? '', phase: state.phase, combatGeneration: state.combatGeneration ?? 0,
    position: { ...player.position } }
}
function checkpointMatches(saved:{fingerprint:string}){return saved.fingerprint===checkpoint().fingerprint||saved.fingerprint===checkpoint(gs.getState(),false).fingerprint}
/** Preserve an already witnessed period through a zero-time deterministic source event. */
export function retainRestCheckpointForSourceEvent<T>(operation: () => T): T {
  const period = saved()?.active
  const at = now()
  const observed = period?.creditedUntil === at && period.checkpoint && checkpointMatches(period.checkpoint)
  const result = operation()
  if (observed && period === saved()?.active && now() === at) period!.checkpoint = checkpoint()
  return result
}
function active(restId: string) {
  const period = saved()?.active
  if (!period || period.restId !== restId) toolkitError('REST_PERIOD_REQUIRED', 'Choose the exact current recorded rest period.')
  return period!
}
function fresh(period: RestSession) {
  if (!period.checkpoint) toolkitError('REST_HISTORY_UNRESOLVED', 'The old period has no actual observation checkpoint; no activity history is inferred.')
  if (period.creditedUntil !== now() || !checkpointMatches(period.checkpoint!))
    toolkitError('REST_ACTIVITY_OBSERVATION_REQUIRED', 'Record the actual intervening light or strenuous activity before continuing or completing this rest. An outside clock advance never becomes sleep.')
}
function actorCanRest(kind: 'short' | 'long', starting = false) {
  const player = gs.getPlayer()
  if (player.deathSaves?.dead || player.hp.current === 0 && !player.deathSaves?.stable)
    toolkitError('REST_UNAVAILABLE', 'A dead or actively dying player cannot begin or complete this rest.')
  if (kind === 'long' && starting && player.hp.current < 1)
    toolkitError('REST_START_HP_REQUIRED', 'A long rest requires at least one actual HP at its start.')
  if (player.conditions.includes('petrified')) toolkitError('REST_UNAVAILABLE', 'Stone is not a recorded period of sleep or light activity.')
  if (actualLocomotionLocation(gs.getState(),'player')) toolkitError('REST_ACTUAL_SUPPORT_REQUIRED', 'Reach an actual established support before beginning, advancing or completing this rest. Active swimming or measured climbing suspension does not supply a platform, sleep or light-rest work.')
}
function historyRoom() {
  if (Object.keys(saved()?.receipts ?? {}).length >= 128) toolkitError('REST_HISTORY_LIMIT', 'Rest history is full; no old completion witness is discarded.')
}
function previous(restId: string) {
  const receipts = saved()?.receipts
  return receipts && Object.hasOwn(receipts, restId) ? receipts[restId] : undefined
}
export function inspectRest(restId?: string) {
  const period = restId ? saved()?.active?.restId === restId ? saved()?.active : previous(restId)?.session : saved()?.active
  return { active: saved()?.active ?? null, selected: period ?? null,
    eligibility: period ? inspectRestPeriod(period) : null,
    unobservedActivity: period && saved()?.active === period ? period.creditedUntil !== now()
      || (!period.checkpoint||!checkpointMatches(period.checkpoint)) : false,
    completed: restId ? previous(restId) ?? null : null, worldTimeSeconds: now(), benefitsGranted: false }
}
export function beginRest(input: { restId: string; kind: 'short' | 'long' }) {
  const old = previous(input.restId)
  if (old) {
    if (old.session.kind !== input.kind) toolkitError('REST_ID_CONFLICT', 'This retained rest ID has another kind.')
    return { replayed: true, completed: old, benefitsGranted: false }
  }
  const pending = saved()?.active
  if (pending) {
    if (pending.restId !== input.restId || pending.kind !== input.kind)
      toolkitError('REST_ALREADY_ACTIVE', 'Finish or explicitly abandon the existing recorded period before starting another.')
    return { replayed: true, ...inspectRest(input.restId) }
  }
  available(); actorCanRest(input.kind, true); historyRoom()
  if (gs.getState().phase === 'combat') toolkitError('REST_IN_COMBAT', 'Begin a rest outside combat; combat activity is an interruption, never free downtime.')
  data().active = { ...input, startedAt: now(), creditedUntil: now(), hpAtStart: gs.getPlayer().hp.current,
    segments: [], checkpoint: checkpoint() }
  return { replayed: false, ...inspectRest(input.restId) }
}
function segmentReplay(period: RestSession, eventId: string, seconds: number, activity: string, reason: string) {
  const old = period.segments.find(segment => segment.eventId === eventId)
  if (!old) return undefined
  if (old.to - old.from !== seconds || old.activity !== activity || old.reason !== reason || old.observation)
    toolkitError('REST_ACTIVITY_EVENT_CONFLICT', 'This exact activity event has another immutable definition.')
  return { replayed: true, eligibility: inspectRestPeriod(period), worldTimeSeconds: now(), benefitsGranted: false }
}
export function advanceRest(input: { restId: string; eventId: string; seconds: number; activity: 'sleep' | 'light'; reason: string }) {
  const period = previous(input.restId)?.session ?? active(input.restId)
  const replay = segmentReplay(period, input.eventId, input.seconds, input.activity, input.reason)
  if (replay) return replay
  active(input.restId)
  available(); fresh(period); actorCanRest(period.kind)
  if (gs.getState().phase === 'combat') toolkitError('REST_IN_COMBAT', 'No sleep or light downtime is advanced during combat.')
  if (period.segments.length >= 512) toolkitError('REST_ACTIVITY_LIMIT', 'The rest activity history is full.')
  if (inspectRestPeriod(period).interrupted) toolkitError('REST_INTERRUPTED', 'This period was interrupted; explicitly abandon it and begin a new real period.')
  if (input.activity === 'light' && gs.getPlayer().conditions.some(condition => ['unconscious', 'incapacitated', 'stunned', 'paralyzed'].includes(condition)))
    toolkitError('REST_LIGHT_ACTIVITY_UNAVAILABLE', 'The actual player cannot read, talk or keep watch in this condition.')
  const until = now() + input.seconds
  const due = activeAfflictions('player', 'poison').filter(record => !record.petrificationPause && record.nextAt !== undefined && record.nextAt < until)
  if (due.length) toolkitError('REST_EVENT_BOUNDARY', `Advance only to the next actual poison event before resolving it: ${due.map(record => `${record.id}@${record.nextAt}`).join(', ')}.`)
  assertGameTimeAdvance(input.seconds)
  const from = now(),sleepArmor=input.activity==='sleep'?sleepArmorSnapshot():undefined
  const sleep = input.activity === 'sleep' ? addHeroEffect('rest-sleep', 'player', ['player'], input.seconds,
    { condition: 'unconscious', restId: period.restId }) : undefined
  const naturalRecoveries = advanceHeroTime(input.seconds)
  if (sleep && hero().effects.some(effect => effect.id === sleep.id)) removeHeroEffect(sleep.id)
  appendRestActivity(period, { eventId: input.eventId, from, to: now(), activity: input.activity, reason: input.reason,...sleepArmor?{sleepArmor}:{} })
  period.checkpoint = checkpoint()
  const plagueEvent = sewerPlagueEvent(gs.getState())
  return { replayed: false, eligibility: inspectRestPeriod(period), worldTimeSeconds: now(), naturalRecoveries,
    ...(plagueEvent ? { sewerPlagueEvent: plagueEvent } : {}), benefitsGranted: false }
}
/** MJ observation of an actual interval since the last checkpoint. It never
 * credits sleep or advances the clock. Known movement/combat cannot be light. */
export function observeRestActivity(input: { restId: string; eventId: string; activity: 'light' | 'strenuous'; reason: string }) {
  const period = previous(input.restId)?.session ?? active(input.restId)
  const old = period.segments.find(segment => segment.eventId === input.eventId)
  if (old) {
    if (!old.observation || old.activity !== input.activity || old.reason !== input.reason)
      toolkitError('REST_ACTIVITY_EVENT_CONFLICT', 'This event already records another observation.')
    return { replayed: true, eligibility: inspectRestPeriod(period), benefitsGranted: false }
  }
  active(input.restId)
  assertHero()
  if (hero().pending) toolkitError('REACTION_PENDING', 'Resolve the actual held decision before recording the intervening activity.')
  if (!period.checkpoint) toolkitError('REST_HISTORY_UNRESOLVED', 'This old period has no source observation checkpoint.')
  const current = checkpoint(), before = period.checkpoint!
  if (now() < period.creditedUntil || checkpointMatches(before))
    toolkitError('REST_OBSERVATION_REQUIRED', 'No new actual elapsed interval or state change exists to record.')
  const moved = current.mapId !== before.mapId || current.position.x !== before.position.x || current.position.y !== before.position.y
  if (input.activity === 'light' && (moved || current.phase === 'combat' || before.phase === 'combat'
    || current.combatGeneration !== before.combatGeneration))
    toolkitError('REST_STRENUOUS_ACTIVITY_REQUIRED', 'Actual movement or combat is strenuous, not light rest activity.')
  appendRestActivity(period, { eventId: input.eventId, from: period.creditedUntil, to: now(), activity: input.activity,
    reason: input.reason, observation: { before: before.fingerprint, after: current.fingerprint } })
  period.checkpoint = current
  return { replayed: false, eligibility: inspectRestPeriod(period), benefitsGranted: false }
}
export function assertNoRecordedRest() {
  if (saved()?.active) toolkitError('REST_ALREADY_ACTIVE', 'Complete or explicitly abandon the recorded rest instead of paying for a second implicit rest.')
}
export function preflightRestStrenuousInterval(requireFreshCheckpoint = false): void {
  const period = saved()?.active
  if (!period) return
  if (requireFreshCheckpoint) fresh(period)
  if (!period.checkpoint || period.creditedUntil !== now())
    toolkitError('REST_ACTIVITY_OBSERVATION_REQUIRED', 'Record the actual prior gap before starting a new measured walking interval.')
  if (period.segments.length >= 512) toolkitError('REST_ACTIVITY_LIMIT', 'Abandon the full recorded period before adding another measured activity.')
}
/** Called only by an actual deterministic activity resolver, after its real
 * preflighted interval. This records the chosen activity, never a new call. */
export function recordRestStrenuousInterval(input: { eventId: string; from: number; to: number; reason: string }): void {
  recordRestMeasuredActivityInterval({ ...input, activity: 'strenuous' })
}
export function recordRestMeasuredActivityInterval(input: { eventId: string; from: number; to: number; activity: 'light' | 'strenuous'; reason: string }): void {
  const period = saved()?.active
  if (!period) return
  const eventId = `measured:${createHash('sha256').update(JSON.stringify([period.restId, input.eventId])).digest('hex')}`
  const old = period.segments.find(segment => segment.eventId === eventId)
  if (old) {
    if (old.from !== input.from || old.to !== input.to || old.activity !== input.activity || old.reason !== input.reason)
      toolkitError('REST_ACTIVITY_EVENT_CONFLICT', 'The measured activity already has another immutable interval.')
    return
  }
  if (period.creditedUntil !== input.from || input.to !== now() || input.to < input.from)
    toolkitError('REST_MEASURED_ACTIVITY_INVALID', 'A measured rest interruption must match the actual contiguous elapsed interval.')
  const actual = checkpoint()
  const observation = input.to === input.from ? { before: period.checkpoint?.fingerprint ?? '', after: actual.fingerprint } : undefined
  if (observation && (!observation.before || observation.before === observation.after))
    toolkitError('REST_OBSERVATION_REQUIRED', 'A zero-time measured activity needs its actual physical change or operation log, never an invented interval.')
  appendRestActivity(period, { eventId, from: input.from, to: input.to, activity: input.activity, reason: input.reason,
    ...(observation ? { observation } : {}) })
  period.checkpoint = actual
}
/** Identification, attunement and ordinary rests share one actual period. */
export function takeUninterruptedRest(input: { kind: 'short' | 'long' } & RestChoices): Record<string, unknown> {
  assertNoRecordedRest()
  if (input.kind === 'long' && (input.hitDice || input.arcaneRecovery?.length || input.songOfRest))
    toolkitError('REST_CHOICE_NOT_APPLICABLE', 'Short-rest resource choices do not apply to a long rest.')
  const sleeping = input.kind === 'long' || gs.getPlayer().conditions.includes('unconscious')
  if (sleeping && input.kind === 'short' && (input.arcaneRecovery?.length || input.songOfRest))
    toolkitError('REST_PERFORMANCE_UNWITNESSED', 'An uninterrupted sleeping character cannot study the spellbook or perform Song of Rest.')
  if (input.kind === 'short') shortRest(input, undefined, true); else longRest(undefined, true)
  actorCanRest(input.kind, true); historyRoom()
  const restId = `rest:${randomUUID()}`, seconds = input.kind === 'short' ? 3600 : 28800
  beginRest({ restId, kind: input.kind })
  const activity = advanceRest({ restId, eventId: `activity:${randomUUID()}`, seconds, activity: sleeping ? 'sleep' : 'light',
    reason: 'Explicitly requested uninterrupted standard rest, using its actual sleep or light-activity period.' })
  const result: Record<string, unknown> = finishRest({ restId, hitDice: input.hitDice, arcaneRecovery: input.arcaneRecovery, songOfRest: input.songOfRest })
  // The benefit helper pays no second duration, so it cannot rediscover events
  // that already occurred during this actual activity. Preserve their results
  // in the atomic response and completion receipt, without resolving them again.
  const naturalRecoveries = [...('naturalRecoveries' in activity ? activity.naturalRecoveries ?? [] : []),
    ...(Array.isArray(result.naturalRecoveries) ? result.naturalRecoveries : [])]
  previous(restId)!.result.naturalRecoveries = structuredClone(naturalRecoveries)
  return { ...result, naturalRecoveries, seconds, uninterrupted: true }
}
export function validateRecordedRestCompletion(token: RecordedRestCompletion, kind: 'short' | 'long') {
  if (!issued.has(token)) toolkitError('REST_COMPLETION_WITNESS_REQUIRED', 'Only the engine can issue a completion witness from an actual recorded rest.')
  const period = active(token.restId)
  fresh(period)
  if (period.kind !== kind || !inspectRestPeriod(period).eligible || token.completedAt !== now()
    || token.startedAt !== period.startedAt || token.hpAtStart !== period.hpAtStart)
    toolkitError('REST_COMPLETION_INVALID', 'The actual rest period does not match this completion.')
}
export function finishRest(input: { restId: string } & RestChoices) {
  const definition = JSON.stringify({ hitDice: input.hitDice ?? 0, arcaneRecovery: input.arcaneRecovery ?? [], songOfRest: input.songOfRest ?? false })
  const receipt = previous(input.restId)
  if (receipt) {
    if (receipt.definition !== definition) toolkitError('REST_COMPLETION_CONFLICT', 'This period already completed with another immutable resource choice.')
    return { replayed: true, ...receipt.result }
  }
  const period = active(input.restId)
  available({allowSleepDue:period.kind==='long'}); fresh(period); actorCanRest(period.kind); historyRoom()
  if (!inspectRestPeriod(period).eligible) toolkitError('REST_NOT_COMPLETE', 'The actual recorded duration, sleep, start HP or interruptions do not satisfy this rest.')
  if ((input.arcaneRecovery?.length || input.songOfRest) && !period.segments.some(segment => segment.activity === 'light' && segment.to > segment.from))
    toolkitError('REST_PERFORMANCE_UNWITNESSED', 'Book study or the bard’s own performance requires actual light activity, not only sleep.')
  if (period.kind === 'long' && (input.hitDice || input.arcaneRecovery?.length || input.songOfRest))
    toolkitError('REST_CHOICE_NOT_APPLICABLE', 'Choose hit dice, Arcane Recovery and Song of Rest only on a short rest.')
  const token: RecordedRestCompletion = { restId: period.restId, kind: period.kind, startedAt: period.startedAt,
    hpAtStart: period.hpAtStart, completedAt: now(),armoredSleep:period.segments.some(s=>s.activity==='sleep'&&s.to>s.from&&['medium','heavy'].includes(s.sleepArmor?.category??'none')) }
  issued.add(token)
  let benefits: Record<string, unknown>
  try { benefits = period.kind === 'short' ? shortRest(input, token) : longRest(token) }
  finally { issued.delete(token) }
  const result = { ...benefits!, restId: period.restId, elapsedSeconds: period.creditedUntil - period.startedAt,
    recordedActivity: inspectRestPeriod(period), benefitsGranted: true }
  data().receipts[period.restId] = { restId: period.restId, definition, completedAt: now(), result: structuredClone(result), session: structuredClone(period),
    ...(period.kind === 'short' ? { hitDiceContinuation: {
      checkpoint: checkpoint(), musicAllowed: feature('song_of_rest') && !gs.getPlayer().conditions.includes('deafened')
        && period.segments.some(segment => segment.activity === 'light' && segment.to > segment.from),
      songUsed: Boolean(input.songOfRest && Array.isArray(benefits!.rolls) && benefits!.rolls.length > (input.hitDice ?? 0)), events: {},
    } } : {}) }
  delete data().active
  return { replayed: false, ...result }
}
/** PHB: decide to spend an additional hit die after seeing the previous one.
 * This continues the same actual short-rest end, never another hour or reset. */
export function spendRestHitDie(input: { restId: string; eventId: string; songOfRest?: boolean }) {
  const receipt = previous(input.restId), continuation = receipt?.hitDiceContinuation
  if (!receipt || receipt.session.kind !== 'short' || !continuation)
    toolkitError('SHORT_REST_COMPLETION_REQUIRED', 'Choose a genuinely completed short rest with its actual end-of-rest continuation.')
  const old = Object.hasOwn(continuation!.events, input.eventId) ? continuation!.events[input.eventId] : undefined
  if (old) {
    if (old.songOfRest !== Boolean(input.songOfRest)) toolkitError('REST_HIT_DIE_EVENT_CONFLICT', 'This actual hit-die choice already has another immutable definition.')
    return { replayed: true, ...old.result }
  }
  available(); actorCanRest('short')
  if (receipt!.completedAt !== now() || gs.getState().phase === 'combat'
    || !checkpointMatches(continuation!.checkpoint))
    toolkitError('SHORT_REST_DECISION_CLOSED', 'Time or actual activity has left this short-rest end. It cannot heal later injuries or renew another rest.')
  if (Object.keys(continuation!.events).length >= 32) toolkitError('REST_HIT_DIE_HISTORY_LIMIT', 'The actual hit-die choice receipts are full.')
  if (hero().hitDice.current <= 0) toolkitError('HIT_DICE_INVALID', 'No actual hit die remains.')
  if (input.songOfRest && (!continuation!.musicAllowed || continuation!.songUsed))
    toolkitError('SONG_OF_REST_UNAVAILABLE', 'This rest has no actual eligible performance left, or its one bonus has already been used.')
  assertBreathingRecoveryAllowed('player')
  const player = gs.getPlayer(), before = player.hp.current, con = getAbilityModifier(player.stats.con)
  const roll = healingRoll(`1d${hero().hitDice.die}${con >= 0 ? '+' : ''}${con}`, 'player')
  gs.updatePlayerHP(sewerPlagueHitDieHealing(roll.total)); hero().hitDice.current--
  let songRoll: ReturnType<typeof healingRoll> | undefined
  if (input.songOfRest && player.hp.current > before) {
    songRoll = healingRoll('1d6', 'player'); gs.updatePlayerHP(songRoll.total); continuation!.songUsed = true
  }
  const result = { restId: input.restId, eventId: input.eventId, roll, songRoll,
    hpBefore: before, hpAfter: player.hp.current, hitDice: structuredClone(hero().hitDice), seconds: 0,
    resourcesRenewed: false, songOfRestUsed: continuation!.songUsed }
  continuation!.events[input.eventId] = { songOfRest: Boolean(input.songOfRest), result: structuredClone(result) }
  continuation!.checkpoint = checkpoint()
  return { replayed: false, ...result }
}
/** The study/attunement callback itself belongs to its already paid rest. */
export function finishShortRestStudy(rest: Record<string, unknown>): void {
  if (typeof rest.restId !== 'string') return
  const receipt = previous(rest.restId)
  if (receipt?.hitDiceContinuation && receipt.completedAt === now() && receipt.session.kind === 'short')
    receipt.hitDiceContinuation.checkpoint = checkpoint()
}
export function abandonRest(input: { restId: string; reason: string }) {
  const old = previous(input.restId), definition = `abandon:${input.reason}`
  if (old) {
    if (old.definition !== definition) toolkitError('REST_COMPLETION_CONFLICT', 'This period already has another immutable conclusion.')
    return { replayed: true, ...old.result }
  }
  const period = active(input.restId)
  if (gs.getState().hero?.pending) toolkitError('REACTION_PENDING', 'Resolve the held decision before abandoning this period.')
  historyRoom()
  const result = { abandoned: true, restId: period.restId, benefitsGranted: false, elapsedSeconds: period.creditedUntil - period.startedAt, reason: input.reason }
  data().receipts[period.restId] = { restId: period.restId, definition, completedAt: now(), result, session: structuredClone(period) }
  delete data().active
  return { replayed: false, ...result }
}
export function validateRestState(state: GameState): string[] {
  const source = state.dmTools?.rests
  if (!source) return []
  const parsed = RestStateSchema.safeParse(source)
  if (!parsed.success) return ['Malformed recorded rest state.']
  const errors: string[] = [], time = state.worldTimeSeconds ?? 0
  if (source.active && source.active.creditedUntil > time) errors.push('An active rest cannot contain future activity.')
  if (Object.keys(source.receipts).length > 128) errors.push('Too many retained rest periods.')
  for (const [id, receipt] of Object.entries(source.receipts)) if (id !== receipt.restId || receipt.session.restId !== id
    || receipt.session.creditedUntil > receipt.completedAt || receipt.completedAt > time)
    errors.push('A completed rest must retain its actual ID and elapsed time.')
  for (const receipt of Object.values(source.receipts)) {
    if (receipt.result.benefitsGranted === true && (receipt.completedAt !== receipt.session.creditedUntil || !inspectRestPeriod(receipt.session).eligible))
      errors.push('Rest benefits require a genuinely eligible completed period.')
    if (receipt.hitDiceContinuation && (receipt.session.kind !== 'short' || receipt.result.benefitsGranted !== true))
      errors.push('Additional hit dice require a genuinely completed short rest.')
  }
  if (source.active && Object.hasOwn(source.receipts, source.active.restId)) errors.push('One period cannot be active and completed simultaneously.')
  return errors
}
