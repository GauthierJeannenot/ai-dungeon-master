import {
  StartServiceSchema, WorkServiceSchema, ResolveServiceSchema, AbandonServiceSchema, SpendServiceFavorSchema,
  SERVICE_DAY_SECONDS, SERVICE_CHECK_DOMAIN, SERVICE_CHECKS, serviceWitness as witness, serviceReceiptWitness,
  openServiceWeek, unusedServiceFavors, serviceCap, printedServiceFavors, nextServiceLedgerIndex,
  validateXgeReligiousServiceState, type ServiceWeek,
} from '../lib/xge-religious-service-state'
import type { AbilityCheckResult, GameState } from '../lib/types'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { entityGroundContact, entityVerticalContext } from '../lib/jumping-state'
import { fullyImmersedInWater } from '../lib/underwater-rules'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { downtimeIntervalIssue } from '../lib/downtime-ledger'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { groundGearRecoveryActivityIssue } from '../lib/ground-gear-recovery-state'
import { available, advanceHeroTime, now } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { checkedResolution, registerCheckedResolution } from './toolkit-checks'
import { readXgeReligiousServiceSource } from './rules-library'
import { rollDice } from './dice'
import { assertToolkitReach, toolkitError, toolkitResult, toolkitState } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'
const same = (a: unknown, b: unknown) => witness(a) === witness(b)
const weeks = () => gs.getState().dmTools?.xgeReligiousService?.weeks ?? []
const stamp = <T extends object>(body: T) => ({ ...body, command: witness(body) })
function data() { return toolkitState().xgeReligiousService ??= { version: 1, weeks: [], spends: [] } }
function summary() {
  const state = gs.getState()
  return { unusedFavors: unusedServiceFavors(state), currentCap: serviceCap(state.player.stats.cha), capSource: 'actual_current_charisma_modifier' }
}
const result = (week: ServiceWeek, replayed = false) => ({ success: true, replayed, weekId: week.start.input.eventId, week, ...summary() })
function replay(input: { eventId: string }) {
  for (const week of weeks()) {
    const receipt = [week.start, ...week.segments, week.resolution, week.abandonment].find(r => r?.input.eventId === input.eventId)
    if (!receipt) continue
    if (!same(receipt.input, input)) toolkitError('XGE_SERVICE_EVENT_CONFLICT', 'Keep the original temple, source choice and actual effort for this event.')
    return { ...result(week, true), event: receipt, ...(receipt === week.resolution && week.resolution?.heldWitness ? { pendingReaction: gs.getState().hero?.pending } : {}) }
  }
  const spend = gs.getState().dmTools?.xgeReligiousService?.spends.find(s => s.input.eventId === input.eventId)
  if (spend) {
    if (!same(spend.input, input)) toolkitError('XGE_SERVICE_EVENT_CONFLICT', 'Keep the exact original favor, request and acceptance event.')
    return { success: true, replayed: true, event: spend, ...summary() }
  }
}
function ready() {
  const state = gs.getState()
  if (state.phase === 'combat' || state.dmTools?.rests?.active || Object.values(state.dmTools?.travel?.routes ?? {}).some(route => route.status === 'active'))
    toolkitError('XGE_SERVICE_DOWNTIME_REQUIRED', 'Choose actual available downtime outside initiative, rest or an active journey.')
  available(); rules.validateActionUse('player')
}
function weekById(id: string) { return weeks().find(w => w.start.input.eventId === id) ?? toolkitError('XGE_SERVICE_WEEK_REQUIRED', 'Choose the original actual religious-service week.') }
function venue(site: ServiceWeek['start']['site']) {
  const state = gs.getState()
  if (state.currentMapId !== site.mapId || state.currentRoomId !== site.roomId || !same(state.player.position, site.cell)
    || entityGroundContact(state, 'player', site.cell, site.zFeet).contact !== true
    || fullyImmersedInWater(state, { kind: 'creature', entityId: 'player' }) !== false)
    toolkitError('XGE_SERVICE_TEMPLE_REQUIRED', 'Return to the original actually qualified supported dry temple site.')
  assertToolkitReach({ ...site, surfaceZFeet: site.zFeet })
}
function representative(id: string) {
  const state = gs.getState(), person = gs.getPhysicalCreature(id), npc = state.npcs?.[id]
  if (!person || id === 'player' || 'group' in person && person.group || 'isAlive' in person && !person.isAlive || person.hp.current <= 0
    || npc && !npc.visible || person.conditions.some(c => ['unconscious','incapacitated','petrified','paralyzed','stunned'].includes(c)))
    toolkitError('XGE_SERVICE_REPRESENTATIVE_REQUIRED', 'Choose an actual present capable temple representative, not a profile, group or invented clergy member.')
  const vertical = entityVerticalContext(state, id), roomId = inferRoomIdOnMap(person.position, state.currentMapId, state)
  if (!vertical.known || vertical.airborne || vertical.zFeet === null || roomId !== state.currentRoomId)
    toolkitError('XGE_SERVICE_REPRESENTATIVE_REQUIRED', 'Qualify the actual representative at this temple on a known same-room support.')
  const source = { id, mapId: npc?.mapId ?? state.currentMapId, roomId, position: { ...person.position }, zFeet: vertical.zFeet }
  assertToolkitReach({ mapId: source.mapId!, roomId: roomId!, cell: source.position, surfaceZFeet: source.zFeet })
  return source
}
function fact(id: string, site: ServiceWeek['start']['site']) {
  const value = gs.getState().worldFacts?.find(f => f.id === id)
  if (!value || value.source !== 'record_scene_fact' || value.expires !== 'never' || value.clueId || value.subjectItemId
    || value.mapId !== site.mapId || value.roomId !== site.roomId || !same(value.narrativeEffect?.cell, site.cell))
    toolkitError('XGE_SERVICE_PHYSICAL_FACT_REQUIRED', 'Choose an existing durable local factual qualification, never a hidden clue or a free-form source of new knowledge.')
  return { ...structuredClone(value) }
}
function actorFrame() {
  const player = gs.getPlayer()
  return { characterId: player.characterId, level: player.level, stats: player.stats, proficiencyBonus: player.proficiencyBonus,
    skillProficiencies: player.skillProficiencies, expertise: player.expertise, features: player.features, conditions: player.conditions }
}
export function validateXgeReligiousServiceSource(state: GameState) {
  const history = state.dmTools?.xgeReligiousService?.weeks
  if (!history?.length) return []
  const source = readXgeReligiousServiceSource()
  return history.every(w => same(w.start.source, source)) ? [] : ['Retain the exact supplied religious-service source and its documentary complications.']
}
export function startXgeReligiousService(raw: unknown) {
  const input = StartServiceSchema.parse(raw), old = replay(input); if (old) return old
  ready()
  if (weeks().length >= 64 || openServiceWeek(gs.getState())) toolkitError('XGE_SERVICE_OPEN_WEEK', 'Complete or explicitly abandon the unfinished week; no retained history is evicted.')
  const state = gs.getState(), vertical = entityVerticalContext(state, 'player')
  if (!state.currentMapId || !state.currentRoomId || !vertical.known || vertical.zFeet === null)
    toolkitError('XGE_SERVICE_TEMPLE_REQUIRED', 'Establish the real temple at the actual current supported site.')
  const site = { mapId: state.currentMapId, roomId: state.currentRoomId, cell: { ...state.player.position }, zFeet: vertical.zFeet }
  venue(site)
  if (weeks().some(w => w.start.input.templeId === input.templeId && !same(w.start.site, site)))
    toolkitError('XGE_SERVICE_TEMPLE_ID_CONFLICT', 'An existing temple identity retains its original measured site; no relocation is inferred.')
  const start = stamp({ input, at: now(), site, templeFact: fact(input.templeFactId, site), representative: representative(input.representativeId), source: readXgeReligiousServiceSource() })
  const week: ServiceWeek = { start, segments: [] }; data().weeks.push(week)
  return { ...result(week), event: start, seconds: 0, paidCp: 0 }
}
export function workXgeReligiousService(raw: unknown) {
  const input = WorkServiceSchema.parse(raw), old = replay(input); if (old) return old
  ready(); const week = weekById(input.weekId), state = gs.getState()
  if (week.abandonment || week.segments.length >= 5) toolkitError('XGE_SERVICE_EFFORT_COMPLETE', 'Only unfinished actual service receives another workday.')
  venue(week.start.site); representative(week.start.input.representativeId)
  const from = now(), to = from + SERVICE_DAY_SECONDS, day = Math.floor(from / 86400)
  if (to > (day + 1) * 86400 || week.segments.some(s => s.day === day)) toolkitError('XGE_SERVICE_WORKDAY_REQUIRED', 'Choose one distinct date with eight continuous actual hours available.')
  if (week.segments[0] && day > week.segments[0].day + 9) toolkitError('XGE_SERVICE_DELAY_ADJUDICATION_REQUIRED', 'Keep the delayed actual effort pending a future explicit extra-complication/cost procedure.')
  const shared = downtimeIntervalIssue(state, from, SERVICE_DAY_SECONDS, true); if (shared) toolkitError('DOWNTIME_SHARED_DAY_REQUIRED', shared)
  const issue = breathingActivityIssue(state, 'player', SERVICE_DAY_SECONDS) ?? groundGearRecoveryActivityIssue(state, SERVICE_DAY_SECONDS)
  if (issue) toolkitError(issue.code, issue.message)
  if (Object.values(state.dmTools?.afflictions?.records ?? {}).some(record => record.targetId === 'player' && AFFLICTIONS[record.templateId].kind === 'poison'
    && ['active','pending'].includes(record.status) && !record.petrificationPause && record.nextAt !== undefined && record.nextAt < to))
    toolkitError('XGE_SERVICE_AFFLICTION_BOUNDARY', 'Resolve the earlier real poison event before an uninterrupted eight-hour service.')
  assertGameTimeAdvance(SERVICE_DAY_SECONDS)
  const event = stamp({ input, from, to, day }); advanceHeroTime(SERVICE_DAY_SECONDS); week.segments.push(event)
  return { ...result(week), event, seconds: SERVICE_DAY_SECONDS }
}
export function resolveXgeReligiousService(raw: unknown) {
  const input = ResolveServiceSchema.parse(raw), old = replay(input); if (old) return toolkitResult(old)
  ready(); const week = weekById(input.weekId), state = gs.getState()
  if (week.abandonment || week.segments.length !== 5 || week.resolution) toolkitError('XGE_SERVICE_RESOLUTION_REQUIRED', 'Finish five real workdays before the one retained source check.')
  venue(week.start.site); representative(week.start.input.representativeId)
  if (unusedServiceFavors(state).length > serviceCap(state.player.stats.cha)) toolkitError('XGE_SERVICE_CAP_REGULARIZATION_REQUIRED', 'Retain historical promises after an actual Charisma reduction; consume real existing favors before any new gain, without deleting old receipts.')
  if (state.player.conditions.includes('exhaustion') && !state.dmTools?.exhaustion?.creatures.player)
    toolkitError('EXHAUSTION_LEVEL_REQUIRED', 'Qualify the actual existing exhaustion level before the source check.')
  readXgeReligiousServiceSource()
  week.resolution = stamp({ input, at: now(), actor: structuredClone(actorFrame()) })
  const answer = checkedResolution({ ...SERVICE_CHECKS[input.skill], entityId: 'player', sourceReligiousServiceCheck: true },
    { domain: SERVICE_CHECK_DOMAIN, command: { weekId: input.weekId } })
  if (!week.resolution.outcome && gs.getState().hero?.pending) {
    week.resolution.heldWitness = witness(gs.getState().hero!.pending); week.resolution.command = serviceReceiptWitness(week.resolution)
  }
  return answer
}
function finishServiceCheck(command: Record<string, unknown>, check: AbilityCheckResult) {
  const week = weekById(String(command.weekId)), resolution = week.resolution!, expected = SERVICE_CHECKS[resolution.input.skill]
  if (check.ability !== expected.ability || check.label !== expected.label || check.dc !== undefined || check.success !== undefined)
    toolkitError('XGE_SERVICE_CHECK_CHANGED', 'Retain the original source total and chosen Religion or Persuasion check without an invented DC.')
  delete resolution.heldWitness
  resolution.check = { ...check, ability: check.ability as 'int'|'cha', entityId: 'player', label: expected.label, proficient: Boolean(check.proficient), expertise: Boolean(check.expertise), roll: { ...check.roll },
    mechanicalSummary: `${expected.label}: ${check.roll.detail} ; total source ${check.roll.total}` }
  const printed = printedServiceFavors(check.roll.total)
  const state = gs.getState(), charismaScore = state.player.stats.cha, cap = serviceCap(charismaScore)
  const unusedBefore = unusedServiceFavors(state).map(f => f.id), earned = Math.min(printed, Math.max(0, cap - unusedBefore.length))
  const chance = { ...rollDice('1d100') }, roll = chance.total <= 10 ? { ...rollDice('1d6') } : undefined
  resolution.outcome = { printedFavors: printed, earned, charismaScore, cap, unusedBefore, ledgerIndex: nextServiceLedgerIndex(state),
    ...(check.roll.total <= 0 ? { nonpositiveTotalConvention: 'user_no_gain_2026_11_07' as const } : {}),
    favorIds: Array.from({ length: earned }, (_, i) => week.start.input.eventId + ':favor:' + (i + 1)), chance,
    ...(roll ? { example: { roll, text: week.start.source.examples[roll.total - 1] } } : {}) }
  resolution.command = serviceReceiptWitness(resolution)
  return toolkitResult({ ...result(week), event: resolution, notice: 'A promise ledger only. Documentary complications create no clergy, quest, knowledge, attitude, omen or benefit.' })
}
export function validateHeldServiceCheck(command: Record<string, unknown>) {
  const source = command.toolkitResolution as { domain?: string } | undefined
  if (source?.domain !== SERVICE_CHECK_DOMAIN) return
  const week = openServiceWeek(gs.getState())
  if (!week?.resolution || !same(week.resolution.actor, actorFrame())) toolkitError('XGE_SERVICE_CHECK_CHANGED', 'Keep the original actual abilities, proficiency, conditions and Charisma cap context before a held bonus.')
  venue(week.start.site); representative(week.start.input.representativeId)
  const issues = validateXgeReligiousServiceState(gs.getState()); if (issues.length) toolkitError('XGE_SERVICE_CHECK_CHANGED', issues.join(' '))
}
export function registerServiceResolution() { registerCheckedResolution(SERVICE_CHECK_DOMAIN, (command, check) => finishServiceCheck(command, check as AbilityCheckResult)) }
export function spendXgeReligiousFavor(raw: unknown) {
  const input = SpendServiceFavorSchema.parse(raw), old = replay(input); if (old) return old
  ready()
  const favor = unusedServiceFavors(gs.getState()).find(f => f.id === input.favorId)
  if (!favor) toolkitError('XGE_SERVICE_UNUSED_FAVOR_REQUIRED', 'Choose exactly one actual unused temple promise; no fictional or already-spent favor.')
  if ((gs.getState().dmTools?.xgeReligiousService?.spends.length ?? 0) >= 128) toolkitError('XGE_SERVICE_HISTORY_LIMIT', 'Retain the complete favor-spend history; no receipt is evicted.')
  venue(favor!.site)
  if (input.requestFactId === input.acceptanceFactId) toolkitError('XGE_SERVICE_ACCEPTANCE_REQUIRED', 'Qualify the actual request and distinct actual temple acceptance explicitly.')
  const event = stamp({ input, at: now(), templeId: favor!.templeId, originWeekId: favor!.weekId, site: favor!.site,
    requestFact: fact(input.requestFactId, favor!.site), acceptanceFact: fact(input.acceptanceFactId, favor!.site), representative: representative(input.representativeId),
    ledgerIndex: nextServiceLedgerIndex(gs.getState()) })
  data().spends.push(event)
  return { success: true, replayed: false, event, ...summary(), grantedBenefit: false,
    notice: 'One real promise consumed after actual request and acceptance. No information, quest, spell service, omen, actor, attitude, action or physical effect is granted.' }
}
export function abandonXgeReligiousService(raw: unknown) {
  const input = AbandonServiceSchema.parse(raw), old = replay(input); if (old) return old
  ready(); const week = weekById(input.weekId)
  if (week.abandonment || week.segments.length >= 5 || week.resolution) toolkitError('XGE_SERVICE_ABANDONMENT_UNAVAILABLE', 'Abandon only unfinished actual service; a complete result and its promises are retained.')
  const event = stamp({ input, at: now() }); week.abandonment = event
  return { ...result(week), event, refundedCp: 0 }
}
export function inspectXgeReligiousService() { return { readOnly: true, weeks: weeks(), spends: gs.getState().dmTools?.xgeReligiousService?.spends ?? [], source: readXgeReligiousServiceSource(), ...summary() } }
