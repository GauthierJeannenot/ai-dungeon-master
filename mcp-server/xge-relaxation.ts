import {
  StartRelaxationSchema, AdvanceRelaxationSchema, FinishRelaxationSchema, RELAX_DAYS, RELAX_DAY_SECONDS,
  RELAX_HOURS_SECONDS, RELAX_RATE_CP, openRelaxation, relaxationDay, relaxationDays, relaxationSeconds,
  relaxationWitness, type RelaxationWeek,
} from '../lib/xge-relaxation-state'
import { COIN_IDS, copperValue, emptyCoins } from '../lib/srd/currency'
import { fullyImmersedInWater } from '../lib/underwater-rules'
import { entityGroundContact, entityVerticalContext } from '../lib/jumping-state'
import { downtimeIntervalIssue } from '../lib/downtime-ledger'
import { breathingActivityIssue } from '../lib/activity-preflight'
import type { GameState } from '../lib/types'
import { available, advanceHeroTime, now } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { preflightRestStrenuousInterval, recordRestMeasuredActivityInterval } from './resting'
import { assertCarryingAcquisition } from './carrying'
import { readXgeRelaxationSources } from './rules-library'
import { toolkitError, toolkitState, assertToolkitReach } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'

const data = () => gs.getState().dmTools?.xgeRelaxation
const same = (a: unknown, b: unknown) => relaxationWitness(a) === relaxationWitness(b)

function ready() {
  if (gs.getState().phase === 'combat')
    toolkitError('XGE_RELAXATION_OUTSIDE_COMBAT', 'Choose an actual relaxation interval outside combat.')
  available()
  rules.validateActionUse('player')
}

function withWitness<T extends object>(data: T) {
  return { ...data, command: relaxationWitness(data) }
}

function replay(input: { eventId: string }) {
  for (const week of data()?.weeks ?? []) {
    const old = [week.start, ...week.segments, week.finish].find(event => event?.input.eventId === input.eventId)
    if (!old) continue
    if (!same(old.input, input))
      toolkitError('XGE_RELAXATION_EVENT_CONFLICT', 'The event identity retains its original paid lifestyle, measured activity or conclusion.')
    return { success: true, replayed: true, weekId: week.start.input.eventId, event: old }
  }
}

function physicalSiteMatches(state: GameState, site: RelaxationWeek['start']['site']) {
  if (state.phase === 'combat' || state.currentMapId !== site.mapId || state.currentRoomId !== site.roomId) return false
  return entityGroundContact(state, 'player', site.cell, site.zFeet).contact === true
    && fullyImmersedInWater(state, { kind: 'creature', entityId: 'player' }) === false
}

function requireOpenWeek(id: string) {
  const week = openRelaxation(gs.getState())
  if (!week || week.start.input.eventId !== id)
    toolkitError('XGE_RELAXATION_WEEK_REQUIRED', 'Choose the actual open relaxation week.')
  return week
}

function requireSite(week: RelaxationWeek) {
  const state = gs.getState(), site = week.start.site
  const fact = state.worldFacts?.find(fact => fact.id === week.start.input.siteFactId)
  if (!physicalSiteMatches(state, site) || !fact || !same(fact, week.start.siteFact))
    toolkitError('XGE_RELAXATION_SITE_REQUIRED', 'Return to the exact actual supported paid site and retain its durable qualification, or explicitly abandon the week.')
  assertToolkitReach({ ...site, surfaceZFeet: site.zFeet })
}

export function validateRelaxationSources(state: GameState) {
  const weeks = state.dmTools?.xgeRelaxation?.weeks
  if (!weeks?.length) return []
  const sources = readXgeRelaxationSources()
  return weeks.every(week => same(week.start.sources, sources)) ? [] : ['Retain the original local XGE and PHB passages for each paid week.']
}

export function startRelaxation(raw: unknown) {
  const input = StartRelaxationSchema.parse(raw), old = replay(input)
  if (old) return old
  ready()
  const state = gs.getState(), at = now(), day = relaxationDay(at)
  if (openRelaxation(state) || (data()?.weeks.length ?? 0) >= 64)
    toolkitError('XGE_RELAXATION_WEEK_LIMIT', 'Keep one open paid relaxation week and the original payment history.')
  if ((day + 1) * RELAX_DAY_SECONDS - at < RELAX_HOURS_SECONDS)
    toolkitError('XGE_RELAXATION_FIRST_DAY_TOO_SHORT', 'Choose a date with enough actual time for its first eight hours before paying.')
  const occupied = downtimeIntervalIssue(state, at, RELAX_HOURS_SECONDS, true)
  if (occupied) toolkitError('DOWNTIME_SHARED_DAY_REQUIRED', occupied)
  const siteFact = state.worldFacts?.find(fact => fact.id === input.siteFactId)
  const cell = siteFact?.narrativeEffect?.cell
  const vertical = entityVerticalContext(state, 'player')
  if (!siteFact || siteFact.expires !== 'never' || siteFact.clueId || siteFact.subjectItemId || !cell
    || !state.currentMapId || !state.currentRoomId || siteFact.mapId !== state.currentMapId
    || siteFact.roomId !== state.currentRoomId || !vertical.known || typeof vertical.zFeet !== 'number')
    toolkitError('XGE_RELAXATION_SITE_REQUIRED', 'Choose a durable actual local site offering the selected lifestyle.')
  const site = { mapId: state.currentMapId, roomId: state.currentRoomId, cell, zFeet: vertical.zFeet }
  if (!physicalSiteMatches(state, site))
    toolkitError('XGE_RELAXATION_SITE_REQUIRED', 'The actual player must occupy the supported exterior lifestyle site.')
  assertToolkitReach({ ...site, surfaceZFeet: site.zFeet })
  const paidCp = RELAX_DAYS * RELAX_RATE_CP[input.lifestyle]
  if (copperValue(input.paid) !== paidCp)
    toolkitError('XGE_RELAXATION_PRICE_REQUIRED', 'Choose actual coin denominations totaling the exact sourced seven-day price.')
  const wallet = { ...(state.dmTools?.wallet ?? emptyCoins()) }
  for (const coin of COIN_IDS) {
    if (wallet[coin] < input.paid[coin])
      toolkitError('XGE_RELAXATION_FUNDS_REQUIRED', 'The actual wallet does not hold those exact denominations.')
    wallet[coin] -= input.paid[coin]
  }
  assertCarryingAcquisition({ walletAfter: wallet })
  const start = withWitness({ input, at, day, site: structuredClone(site), siteFact: { ...structuredClone(siteFact) },
    sources: readXgeRelaxationSources(), paidCp })
  const toolkit = toolkitState()
  const relaxation = toolkit.xgeRelaxation ??= { version: 1, weeks: [] }
  toolkit.wallet = wallet
  relaxation.weeks.push({ start, segments: [] })
  return { success: true, replayed: false, weekId: input.eventId, event: start }
}

export function advanceRelaxation(raw: unknown) {
  const input = AdvanceRelaxationSchema.parse(raw), old = replay(input)
  if (old) return old
  ready()
  const week = requireOpenWeek(input.weekId)
  requireSite(week)
  const state = gs.getState(), from = now(), to = from + input.seconds, day = relaxationDay(from)
  if (week.segments.length >= 512)
    toolkitError('XGE_RELAXATION_HISTORY_LIMIT', 'The original measured interval history is full.')
  if (day >= week.start.day + RELAX_DAYS || to > (day + 1) * RELAX_DAY_SECONDS
    || day > week.start.day && relaxationSeconds(week, day - 1) !== RELAX_HOURS_SECONDS
    || relaxationSeconds(week, day) + input.seconds > RELAX_HOURS_SECONDS)
    toolkitError('XGE_RELAXATION_INTERVAL_REQUIRED', 'Measure up to eight actual hours on each of the seven consecutive paid dates. Split at date boundaries.')
  const ledgerIssue = downtimeIntervalIssue(state, from, input.seconds)
  if (ledgerIssue) toolkitError('DOWNTIME_SHARED_DAY_REQUIRED', ledgerIssue)
  const breathing = breathingActivityIssue(state, 'player', input.seconds)
  if (breathing) toolkitError(breathing.code, breathing.message)
  if (Object.values(state.dmTools?.afflictions?.records ?? {}).some(record => record.targetId === 'player'
    && record.templateId === 'pale_tincture' && record.status === 'active' && !record.petrificationPause
    && record.nextAt !== undefined && record.nextAt < to))
    toolkitError('XGE_RELAXATION_RECOVERY_BOUNDARY', 'Stop at the original Pale Tincture recovery timestamp and resolve its save explicitly.')
  preflightRestStrenuousInterval(true)
  assertGameTimeAdvance(input.seconds)
  const restId = state.dmTools?.rests?.active?.restId
  advanceHeroTime(input.seconds)
  recordRestMeasuredActivityInterval({ eventId: 'xge-relaxation:' + input.eventId, from, to, activity: 'light', reason: input.activitySource })
  const segment = withWitness({ input, from, to, day, ...(restId ? { restId } : {}) })
  week.segments.push(segment)
  return { success: true, replayed: false, weekId: input.weekId, event: segment, qualifiedDays: relaxationDays(week) }
}

export function finishRelaxation(raw: unknown) {
  const input = FinishRelaxationSchema.parse(raw), old = replay(input)
  if (old) return old
  ready()
  const week = requireOpenWeek(input.weekId)
  const release = input.outcome === 'release_pale_tincture_block'
  if (release !== Boolean(input.afflictionId))
    toolkitError('XGE_RELAXATION_BENEFIT_CHOICE_REQUIRED', 'Choose exactly one original Pale Tincture block for release, or explicitly decline the benefit.')
  if (input.outcome !== 'abandon') {
    requireSite(week)
    if (relaxationDays(week).length !== RELAX_DAYS)
      toolkitError('XGE_RELAXATION_INCOMPLETE', 'Complete the seven actual qualifying dates before any final benefit.')
  }
  let releasedDamage = 0
  if (release) {
    if (now() !== week.segments.at(-1)?.to)
      toolkitError('XGE_RELAXATION_BENEFIT_BOUNDARY', 'Choose the final release at the exact end of the last qualifying interval. A later conclusion can decline the benefit.')
    const record = gs.getState().dmTools?.afflictions?.records[input.afflictionId!]
    if (!record || record.targetId !== 'player' || record.templateId !== 'pale_tincture'
      || record.status !== 'active' || record.petrificationPause || record.unhealableDamage <= 0)
      toolkitError('XGE_RELAXATION_HEALING_BLOCK_REQUIRED', 'Choose one active nonmagical Pale Tincture HP recovery restriction with actual locked damage.')
    releasedDamage = record.unhealableDamage
    record.unhealableDamage = 0
    record.relaxationHealingRelease = { weekId: input.weekId, eventId: input.eventId, at: now() }
  }
  const finish = withWitness({ input, at: now(), releasedDamage })
  week.finish = finish
  return { success: true, replayed: false, weekId: input.weekId, event: finish }
}

/** Saving throws qualify at the represented endpoint of a real relaxation interval. */
export function hasRelaxationRecoveryAdvantage(state: GameState, at: number, restId?: string) {
  const week = openRelaxation(state), segment = week?.segments.at(-1)
  return Boolean(week && segment?.to === at && at === (state.worldTimeSeconds ?? 0)
    && (!restId || restId === segment.restId) && physicalSiteMatches(state, week.start.site)
    && state.worldFacts?.some(fact => fact.id === week.start.input.siteFactId && same(fact, week.start.siteFact)))
}

export function inspectRelaxation() {
  return { weeks: (data()?.weeks ?? []).map(week => ({ ...week, qualifiedDays: relaxationDays(week) })), readOnly: true }
}
