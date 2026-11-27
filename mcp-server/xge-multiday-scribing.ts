import { StartMultiDayScribingSchema, WorkMultiDayScribingSchema, AbandonMultiDayScribingSchema,
  AdjudicateMultiDayScribingSchema, multiDayScribingWitness as witness, multiDayScribingOutputOccupied,
  multiDayScribingDeadline, multiDayScribingExtraPaid, type MultiDayScribingProject } from '../lib/xge-multiday-scribing-state'
import { MULTIDAY_SCRIBED_SCROLL_CREATION_PREFIX } from '../lib/scroll-state'
import { multiDayScribedScrollRecipe, SCRIBING_LEVEL_POLICIES } from '../lib/srd/spell-scrolls'
import { COIN_IDS, copperValue, emptyCoins } from '../lib/srd/currency'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { downtimeCraftSupplyUsed, downtimeIntervalIssue } from '../lib/downtime-ledger'
import { entityGroundContact, entityVerticalContext } from '../lib/jumping-state'
import { fullyImmersedInWater } from '../lib/underwater-rules'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { groundGearRecoveryActivityIssue } from '../lib/ground-gear-recovery-state'
import { available, advanceHeroTime, now } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { readXgeMultiDayScribingSource, readXgeGreaterBrewingDelaySource } from './rules-library'
import { assertScrollReadable } from './spell-scrolls'
import { afterInventoryChange, freeHands } from './equipment'
import { assertToolkitReach, toolkitError, toolkitState, assertGreaterBrewingIdAvailable } from './toolkit'
import * as gs from './game-state'

const stamp = <T extends object>(body: T) => ({ ...body, command: witness(body) })
const levelPolicy = SCRIBING_LEVEL_POLICIES[2]
const projects = () => gs.getState().dmTools?.xgeScrollScribing?.projects ?? []
const summary = (p: MultiDayScribingProject, replayed = false) => ({ success: true, replayed,
  projectId: p.start.input.projectId, project: p, completed: Boolean(p.completion), completedDays: p.segments.length,
  requiredDays: levelPolicy.requiredDays, scrollItemId: p.start.input.scrollItemId, deadlineDay: multiDayScribingDeadline(p),
  extraPaidCp: multiDayScribingExtraPaid(p), actionSpent: false })
function replay(input: { eventId: string }) {
  for (const p of projects()) for (const e of [p.start, ...p.segments, ...(p.adjudications ?? []), p.abandonment]) {
    if (e?.input.eventId !== input.eventId) continue
    if (witness(e.input) !== witness(input)) toolkitError('XGE_SCRIBE_EVENT_CONFLICT', 'Retain the exact original multi-day scribing command.')
    return summary(p, true)
  }
  if (gs.getState().dmTools?.xgeScrollScribing?.receipts.some(r => r.input.eventId === input.eventId))
    toolkitError('XGE_SCRIBE_EVENT_CONFLICT', 'That event belongs to its original one-day scribing receipt.')
}
function ready() {
  const s = gs.getState()
  if (s.phase === 'combat' || s.dmTools?.rests?.active || Object.values(s.dmTools?.travel?.routes ?? {}).some(r => r.status === 'active'))
    toolkitError('XGE_SCRIBE_DOWNTIME_REQUIRED', 'Choose actual scribing outside initiative, recorded rest and active travel.')
  available()
  if (s.player.hp.current <= 0 || s.player.conditions.some(c => ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(c)))
    toolkitError('XGE_SCRIBE_ACTOR_UNAVAILABLE', 'The actual character must be able to write this scroll.')
}
function caster() {
  const p = gs.getPlayer()
  if (!p.skillProficiencies?.includes('arcana')) toolkitError('XGE_SCRIBE_ARCANA_REQUIRED', 'Actual Arcana proficiency is required, with no substitute roll.')
  if (!p.features?.includes('spellcasting') || !p.knownSpells?.includes('misty-step'))
    toolkitError('XGE_SCRIBE_SPELL_REQUIRED', 'The exact spell must actually be known or prepared, not only recorded in a book.')
  if (freeHands() < 1) toolkitError('XGE_SCRIBE_FREE_HAND_REQUIRED', 'Free an actual hand for writing and physical supplies.')
  assertScrollReadable() // Writing is not a V/S spell cast; no speech/silence check.
}
function fact(id: string, site: MultiDayScribingProject['start']['site']) {
  const f = gs.getState().worldFacts?.find(f => f.id === id)
  if (!f || f.source !== 'record_scene_fact' || f.expires !== 'never' || f.clueId || f.subjectItemId
    || f.mapId !== site.mapId || f.roomId !== site.roomId || witness(f.narrativeEffect?.cell) !== witness(site.cell))
    toolkitError('XGE_SCRIBE_SITE_FACT_REQUIRED', 'Choose the actual durable local fact at the original measured worksite.')
  return structuredClone(f!) as unknown as Record<string, unknown>
}
function atSite(site: MultiDayScribingProject['start']['site']) {
  const s = gs.getState(), v = entityVerticalContext(s, 'player')
  if (s.currentMapId !== site.mapId || s.currentRoomId !== site.roomId || witness(s.player.position) !== witness(site.cell)
    || !v.known || v.zFeet !== site.zFeet || entityGroundContact(s, 'player', site.cell, site.zFeet).contact !== true
    || fullyImmersedInWater(s, { kind: 'creature', entityId: 'player' }) !== false)
    toolkitError('XGE_SCRIBE_SITE_REQUIRED', 'Return to the exact original dry supported scribing worksite.')
  assertToolkitReach({ ...site, surfaceZFeet: site.zFeet })
}
function project(id: string) {
  const p = projects().find(p => p.start.input.projectId === id)
  if (!p) toolkitError('XGE_SCRIBE_PROJECT_REQUIRED', 'Choose an actual original multi-day scribing project.')
  return p!
}
function walletAfter(paid: ReturnType<typeof StartMultiDayScribingSchema.parse>['paid']) {
  const wallet = { ...(gs.getState().dmTools?.wallet ?? emptyCoins()) }
  for (const coin of COIN_IDS) {
    if (wallet[coin] < paid[coin]) toolkitError('XGE_SCRIBE_FUNDS_REQUIRED', 'Choose exact denominations actually held in the real wallet.')
    wallet[coin] -= paid[coin]
  }
  return wallet
}

export function startMultiDayScribing(raw: unknown) {
  const input = StartMultiDayScribingSchema.parse(raw), old = replay(input)
  if (old) return old
  ready(); caster()
  const s = gs.getState(), v = entityVerticalContext(s, 'player'), source = readXgeMultiDayScribingSource()
  if (projects().length >= 16 || projects().some(p => !p.completion && !p.abandonment))
    toolkitError('XGE_SCRIBE_OPEN_PROJECT', 'This bounded tranche retains16projects and one actual unfinished scroll; no history is discarded.')
  if (Object.keys(s.dmTools?.spellScrolls ?? {}).length >= 64) toolkitError('SPELL_SCROLL_LIMIT', 'The existing physical scroll history is full; no source receipt is erased.')
  if (projects().some(p => p.start.input.projectId === input.projectId)) toolkitError('XGE_SCRIBE_PROJECT_ID_CONFLICT', 'Retain the original project identity.')
  assertGreaterBrewingIdAvailable(input.scrollItemId)
  if (multiDayScribingOutputOccupied(s, input.scrollItemId)) toolkitError('XGE_SCRIBE_OUTPUT_ID_CONFLICT', 'Select an unused actual physical scroll identity.')
  if (downtimeCraftSupplyUsed(s, input.suppliesFactId)) toolkitError('XGE_SCRIBE_SUPPLIES_ALREADY_USED', 'The exact supply lot already belongs to its retained crafting history.')
  if (!v.known || v.zFeet === null || !s.currentMapId || !s.currentRoomId) toolkitError('XGE_SCRIBE_SITE_REQUIRED', 'A measured existing supported worksite is required.')
  const site = { mapId: s.currentMapId!, roomId: s.currentRoomId!, cell: { ...s.player.position }, zFeet: v.zFeet! }
  atSite(site)
  const suppliesFact = fact(input.suppliesFactId, site), cost = multiDayScribedScrollRecipe(input.spellId)!.costCp
  if (copperValue(input.paid) !== cost) toolkitError('XGE_SCRIBE_EXACT_COST_REQUIRED', 'Declare exactly250gp in real held denominations for this source recipe.')
  const wallet = walletAfter(input.paid), at = now(), start = stamp({ input, at, site, suppliesFact, source })
  const p: MultiDayScribingProject = { start, segments: [], purchase: stamp({ at, paid: input.paid }) }
  const data = toolkitState(), state = data.xgeScrollScribing ??= { version: 1, receipts: [] }
  data.wallet = wallet; (state.projects ??= []).push(p); afterInventoryChange()
  return { ...summary(p), paidCp: cost, seconds: 0 }
}

export function workMultiDayScribing(raw: unknown) {
  const input = WorkMultiDayScribingSchema.parse(raw), old = replay(input)
  if (old) return old
  ready(); caster()
  const p = project(input.projectId), s = gs.getState()
  if (p.completion || p.abandonment) toolkitError('XGE_SCRIBE_EFFORT_COMPLETE', 'Only the actual unfinished scroll can receive more effort.')
  readXgeMultiDayScribingSource(); atSite(p.start.site)
  if (witness(fact(p.start.input.suppliesFactId, p.start.site)) !== witness(p.start.suppliesFact)) toolkitError('XGE_SCRIBE_SUPPLIES_CHANGED', 'Retain the exact original physical supplies fact.')
  const from = now(), to = from + levelPolicy.secondsPerDay, day = Math.floor(from / 86400), deadline = multiDayScribingDeadline(p)
  if (deadline !== undefined && day > deadline) toolkitError('XGE_SCRIBE_DELAY_ADJUDICATION_REQUIRED', 'Retain the overdue project until explicit real MJ adjudication; no payment, work or clock advance occurs.')
  if (to > (day + 1) * 86400 || p.segments.some(e => e.day === day)) toolkitError('XGE_SCRIBE_DAY_BOUNDARY', 'Choose a distinct real date with eight continuous hours remaining.')
  const ledger = downtimeIntervalIssue(s, from, levelPolicy.secondsPerDay, true)
  if (ledger) toolkitError('DOWNTIME_SHARED_DAY_REQUIRED', ledger)
  const physical = breathingActivityIssue(s, 'player', levelPolicy.secondsPerDay) ?? groundGearRecoveryActivityIssue(s, levelPolicy.secondsPerDay)
  if (physical) toolkitError(physical.code, physical.message)
  if (Object.values(s.dmTools?.afflictions?.records ?? {}).some(r => r.targetId === 'player' && AFFLICTIONS[r.templateId].kind === 'poison'
    && ['active', 'pending'].includes(r.status) && !r.petrificationPause && r.nextAt !== undefined && r.nextAt < to))
    toolkitError('XGE_SCRIBE_AFFLICTION_BOUNDARY', 'Resolve the actual earlier poison event before the uninterrupted workdate.')
  if (multiDayScribingOutputOccupied(s, p.start.input.scrollItemId)) toolkitError('XGE_SCRIBE_OUTPUT_ID_CONFLICT', 'The reserved scroll identity must remain without a premature physical occupant.')
  assertGameTimeAdvance(levelPolicy.secondsPerDay)
  const e = stamp({ input, from, to, day }); advanceHeroTime(levelPolicy.secondsPerDay); p.segments.push(e)
  if (p.segments.length === levelPolicy.requiredDays) {
    p.completion = stamp({ at: to, workEventId: input.eventId })
    const id = p.start.input.scrollItemId, data = toolkitState(), site = p.start.site
    ;(data.spellScrolls ??= {})[id] = { id, spellId: p.start.input.spellId, identified: true, status: 'active', creation: MULTIDAY_SCRIBED_SCROLL_CREATION_PREFIX + p.start.command }
    ;(s.droppedItems ??= {})[id] = { item: { id, name: 'Parchemin — Pas brumeux', equipmentId: 'spell_scroll', type: 'misc', magical: true, quantity: 1 },
      mapId: site.mapId, roomId: site.roomId, position: { ...site.cell } }
    afterInventoryChange()
  }
  return { ...summary(p), seconds: levelPolicy.secondsPerDay }
}

export function abandonMultiDayScribing(raw: unknown) {
  const input = AbandonMultiDayScribingSchema.parse(raw), old = replay(input)
  if (old) return old
  const p = project(input.projectId)
  if (p.completion || p.abandonment) toolkitError('XGE_SCRIBE_EFFORT_COMPLETE', 'Only the actual unfinished project can be abandoned.')
  p.abandonment = stamp({ input, at: now() })
  return { ...summary(p), refundedCp: levelPolicy.abandonmentRefundCp }
}

export function adjudicateMultiDayScribing(raw: unknown) {
  const input = AdjudicateMultiDayScribingSchema.parse(raw), old = replay(input)
  if (old) return old
  ready()
  const p = project(input.projectId), at = now(), day = Math.floor(at / 86400), previousDeadlineDay = multiDayScribingDeadline(p)
  if (p.completion || p.abandonment || previousDeadlineDay === undefined || day <= previousDeadlineDay || (p.adjudications?.length ?? 0) >= 16)
    toolkitError('XGE_SCRIBE_DELAY_DECISION_REQUIRED', 'Choose the actual unfinished overdue project with its retained real effort.')
  if (input.newDeadlineDay < day || input.newDeadlineDay > p.segments[0].day + 365) toolkitError('XGE_SCRIBE_DELAY_DEADLINE_REQUIRED', 'Choose a finite current or future engine-date deadline within365dates of first effort; no time or work is granted.')
  atSite(p.start.site)
  const facts = (p.adjudications ?? []).flatMap(e => [e.input.decisionFactId, e.input.extraComplicationFactId])
  if (input.decisionFactId === input.extraComplicationFactId || facts.includes(input.decisionFactId) || facts.includes(input.extraComplicationFactId))
    toolkitError('XGE_SCRIBE_DELAY_DISTINCT_FACTS_REQUIRED', 'Each new decision and actual complication needs its distinct original real local fact.')
  const decisionFact = fact(input.decisionFactId, p.start.site), extraComplicationFact = fact(input.extraComplicationFactId, p.start.site)
  const paidCp = copperValue(input.paid)
  if (multiDayScribingExtraPaid(p) + paidCp > levelPolicy.costCp * levelPolicy.maxSupplementCostMultiplier) toolkitError('XGE_SCRIBE_DELAY_COST_CAP', 'All supplementary expenses together are capped at250gp for the entire project, including repeated delays.')
  const wallet = walletAfter(input.paid), e = stamp({ input, at, previousDeadlineDay: previousDeadlineDay!, workedDays: p.segments.length,
    decisionFact, extraComplicationFact, source: readXgeGreaterBrewingDelaySource() })
  toolkitState().wallet = wallet; (p.adjudications ??= []).push(e); afterInventoryChange()
  return { ...summary(p), paidCp, totalCostCp: levelPolicy.costCp + multiDayScribingExtraPaid(p), seconds: 0, complicationIntroducedByMj: true, automaticConsequenceApplied: false }
}
