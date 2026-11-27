import { StartCarousingSchema, WorkCarousingSchema, ResolveCarousingSchema, AssignCarousingContactSchema, ConsumeCarousingContactSchema, RenewCarousingContactSchema, AbandonCarousingSchema,
  carousingWitness as witness, carousingReceiptWitness, openCarousingWeek, carousingContacts, unspecifiedAlliedContacts,
  carousingCap, nextCarousingLedgerIndex, CAROUSING_DAY_SECONDS, CAROUSING_CHECK_DOMAIN, CAROUSING_CHECK,
  carousingExpenseCp, printedCarousingContacts, validateXgeCarousingState, carousingRenewalIssue, type CarousingWeek, type CarousingSite, type CarousingState } from '../lib/xge-carousing-state'
import type { AbilityCheckResult, GameState } from '../lib/types'
import { COIN_IDS, CoinsSchema, copperValue, emptyCoins } from '../lib/srd/currency'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { downtimeIntervalIssue } from '../lib/downtime-ledger'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { groundGearRecoveryActivityIssue } from '../lib/ground-gear-recovery-state'
import { entityGroundContact, entityVerticalContext } from '../lib/jumping-state'
import { fullyImmersedInWater } from '../lib/underwater-rules'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { socialActors } from '../lib/social'
import { available, advanceHeroTime, now } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { checkedResolution, registerCheckedResolution } from './toolkit-checks'
import { rollDice } from './dice'
import { readXgeCarousingSource } from './rules-library'
import { assertToolkitReach, toolkitError, toolkitResult, toolkitState } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'
const same = (a: unknown, b: unknown) => witness(a) === witness(b)
const weeks = () => gs.getState().dmTools?.xgeCarousing?.weeks ?? []
const stamp = <T extends object>(body: T) => ({ ...body, command: witness(body) })
function data(): CarousingState { return toolkitState().xgeCarousing ??= { version: 1, weeks: [], assignments: [], consumptions: [] } }
function summary() { const state = gs.getState(); return { contacts: carousingContacts(state),
  unspecifiedAlliedContacts: unspecifiedAlliedContacts(state), currentUnspecifiedAlliedCap: carousingCap(state.player.stats.cha) } }
const result = (week: CarousingWeek, replayed = false) => ({ success: true, replayed, weekId: week.start.input.eventId, week, ...summary() })
function replay(input: { eventId: string }) {
  for (const week of weeks()) {
    const receipt = [week.start, ...week.segments, week.resolution, week.abandonment].find(r => r?.input.eventId === input.eventId)
    if (!receipt) continue
    if (!same(receipt.input, input)) toolkitError('XGE_CAROUSING_EVENT_CONFLICT', 'Keep the original venue, class, effort, payment and source check for this actual event.')
    return { ...result(week, true), event: receipt, ...(receipt === week.resolution && week.resolution?.heldWitness ? { pendingReaction: gs.getState().hero?.pending } : {}) }
  }
  const receipt = [...(gs.getState().dmTools?.xgeCarousing?.assignments ?? []), ...(gs.getState().dmTools?.xgeCarousing?.consumptions ?? []),
    ...(gs.getState().dmTools?.xgeCarousing?.renewals ?? [])].find(r => r.input.eventId === input.eventId)
  if (receipt) {
    if (!same(receipt.input, input)) toolkitError('XGE_CAROUSING_EVENT_CONFLICT', 'Keep this original actual contact assignment, renewal or use.')
    return { success: true, replayed: true, event: receipt, ...summary() }
  }
}
function ready() {
  const state = gs.getState()
  if (state.phase === 'combat' || state.dmTools?.rests?.active || Object.values(state.dmTools?.travel?.routes ?? {}).some(route => route.status === 'active'))
    toolkitError('XGE_CAROUSING_DOWNTIME_REQUIRED', 'Choose actual available downtime outside initiative, rest and active travel.')
  available(); rules.validateActionUse('player')
}
function currentCapRepresented() {
  if (unspecifiedAlliedContacts(gs.getState()).length > carousingCap(gs.getState().player.stats.cha))
    toolkitError('XGE_CAROUSING_CAP_ADJUDICATION_REQUIRED', 'A later ability change leaving historical unspecified allies above the current cap is outside this slice. Keep receipts and explicitly qualify real named assignments before any new week or gain; no automatic contact deletion or claimed RAW priority.')
}
function weekById(id: string) { return weeks().find(w => w.start.input.eventId === id) ?? toolkitError('XGE_CAROUSING_WEEK_REQUIRED', 'Choose the retained actual Carousing week.') }
function siteHere(): CarousingSite {
  const state = gs.getState(), vertical = entityVerticalContext(state, 'player')
  if (!state.currentMapId || !state.currentRoomId || !vertical.known || vertical.zFeet === null)
    toolkitError('XGE_CAROUSING_SITE_REQUIRED', 'Qualify the actual supported socializing site.')
  return { mapId: state.currentMapId!, roomId: state.currentRoomId!, cell: { ...state.player.position }, zFeet: vertical.zFeet! }
}
function venue(site: CarousingSite) {
  const state = gs.getState()
  if (state.currentMapId !== site.mapId || state.currentRoomId !== site.roomId || !same(state.player.position, site.cell)
    || entityGroundContact(state, 'player', site.cell, site.zFeet).contact !== true
    || fullyImmersedInWater(state, { kind: 'creature', entityId: 'player' }) !== false)
    toolkitError('XGE_CAROUSING_SITE_REQUIRED', 'Return to the original actually qualified supported dry venue.')
  assertToolkitReach({ ...site, surfaceZFeet: site.zFeet })
}
function person(id: string) {
  const state = gs.getState(), body = gs.getPhysicalCreature(id), npc = state.npcs?.[id]
  if (!body || id === 'player' || 'group' in body && body.group || 'isAlive' in body && !body.isAlive || body.hp.current <= 0
    || npc && !npc.visible || body.conditions.some(c => ['unconscious', 'incapacitated', 'petrified', 'paralyzed', 'stunned'].includes(c)))
    toolkitError('XGE_CAROUSING_PERSON_REQUIRED', 'Choose a real present capable individual, never an invented person or a profile/group.')
  const vertical = entityVerticalContext(state, id), roomId = inferRoomIdOnMap(body.position, state.currentMapId, state)
  if (!vertical.known || vertical.airborne || vertical.zFeet === null || roomId !== state.currentRoomId)
    toolkitError('XGE_CAROUSING_PERSON_REQUIRED', 'The actual person must be physically present on known same-room support.')
  const identity = socialActors(state).find(actor => actor.targetId === id)
  if (!identity || !identity.alive || identity.mapId !== state.currentMapId)
    toolkitError('XGE_CAROUSING_PERSON_REQUIRED', 'Retain this actual individual and social identity on the current map.')
  const value = { id, relationshipId: identity!.relationshipId, mapId: identity!.mapId, roomId,
    position: { ...body.position }, zFeet: vertical.zFeet }
  assertToolkitReach({ mapId: value.mapId, roomId: roomId!, cell: value.position, surfaceZFeet: value.zFeet })
  return value
}
function fact(id: string, site: CarousingSite) {
  const value = gs.getState().worldFacts?.find(f => f.id === id)
  if (!value || value.source !== 'record_scene_fact' || value.expires !== 'never' || value.clueId || value.subjectItemId
    || value.mapId !== site.mapId || value.roomId !== site.roomId || !same(value.narrativeEffect?.cell, site.cell))
    toolkitError('XGE_CAROUSING_PHYSICAL_FACT_REQUIRED', 'Choose an already established durable local qualification, never a hidden clue or free-form source of information.')
  return { ...structuredClone(value!) }
}
export function validateXgeCarousingSource(state: GameState) {
  const history = state.dmTools?.xgeCarousing?.weeks
  if (!history?.length) return []
  const source = readXgeCarousingSource()
  return history.every(week => same(week.start.source, source)) ? [] : ['Retain the exact supplied Carousing rules and all three documentary tables.']
}
export function startXgeCarousing(raw: unknown) {
  const input = StartCarousingSchema.parse(raw), old = replay(input); if (old) return old
  ready()
  currentCapRepresented()
  if (weeks().length >= 64 || openCarousingWeek(gs.getState())) toolkitError('XGE_CAROUSING_OPEN_WEEK', 'Finish or explicitly abandon the unfinished actual week; retain its history.')
  if (carousingContacts(gs.getState()).some(c => c.state === 'unallocated')) toolkitError('XGE_CAROUSING_ALLOCATION_REQUIRED', 'Retain the previous exact result pending explicit assignment to free unspecified slots or actual named NPCs; no discarded gains or cap overflow.')
  const site = siteHere(); venue(site)
  if (weeks().some(w => w.start.input.venueId === input.venueId && !same(w.start.site, site)))
    toolkitError('XGE_CAROUSING_VENUE_ID_CONFLICT', 'An actual venue identity keeps its original measured site.')
  const host = person(input.hostId)
  let nobilityAccessFact, nobilityContacts
  if (input.socialClass === 'upper') {
    if (!input.nobilityAccessFactId || !input.actualNobilityAccessThroughContactsConfirmed || !input.nobilityContactIds?.length
      || new Set(input.nobilityContactIds).size !== input.nobilityContactIds.length)
      toolkitError('XGE_CAROUSING_NOBILITY_ACCESS_REQUIRED', 'Qualify actual sufficient contacts and real access to local nobility. No noble background, disguise or Deception success is inferred.')
    nobilityContacts = input.nobilityContactIds!.map(id => person(id))
    nobilityAccessFact = fact(input.nobilityAccessFactId!, site)
  } else if (input.nobilityAccessFactId || input.nobilityContactIds || input.actualNobilityAccessThroughContactsConfirmed)
    toolkitError('XGE_CAROUSING_ACCESS_ARGUMENTS', 'Nobility access qualifications belong to the explicitly selected upper class.')
  const start = stamp({ input, at: now(), site, venueFact: fact(input.venueFactId, site), host,
    ...(nobilityAccessFact ? { nobilityAccessFact, nobilityContacts } : {}), source: readXgeCarousingSource() })
  const week: CarousingWeek = { start, segments: [] }; data().weeks.push(week)
  return { ...result(week), event: start, seconds: 0, paidCp: 0 }
}
function actorFrame() {
  const p = gs.getPlayer()
  return { characterId: p.characterId, level: p.level, stats: p.stats, proficiencyBonus: p.proficiencyBonus,
    skillProficiencies: p.skillProficiencies, expertise: p.expertise, features: p.features, conditions: p.conditions }
}
export function workXgeCarousing(raw: unknown) {
  const input = WorkCarousingSchema.parse(raw), old = replay(input); if (old) return old
  ready(); const week = weekById(input.weekId), state = gs.getState()
  if (week.abandonment || week.segments.length >= 5) toolkitError('XGE_CAROUSING_EFFORT_COMPLETE', 'Only unfinished actual Carousing receives another date.')
  venue(week.start.site); person(week.start.input.hostId)
  const from = now(), to = from + CAROUSING_DAY_SECONDS, day = Math.floor(from / 86400)
  if (to > (day + 1) * 86400 || week.segments.some(s => s.day === day)) toolkitError('XGE_CAROUSING_WORKDAY_REQUIRED', 'Choose a distinct actual date with eight continuous hours available.')
  if (week.segments[0] && day > week.segments[0].day + 9) toolkitError('XGE_CAROUSING_DELAY_ADJUDICATION_REQUIRED', 'Retain delayed work before a future explicit extension/complication/cost procedure.')
  const shared = downtimeIntervalIssue(state, from, CAROUSING_DAY_SECONDS, true); if (shared) toolkitError('DOWNTIME_SHARED_DAY_REQUIRED', shared)
  const issue = breathingActivityIssue(state, 'player', CAROUSING_DAY_SECONDS) ?? groundGearRecoveryActivityIssue(state, CAROUSING_DAY_SECONDS)
  if (issue) toolkitError(issue.code, issue.message)
  if (Object.values(state.dmTools?.afflictions?.records ?? {}).some(r => r.targetId === 'player' && AFFLICTIONS[r.templateId].kind === 'poison'
    && ['active', 'pending'].includes(r.status) && !r.petrificationPause && r.nextAt !== undefined && r.nextAt < to))
    toolkitError('XGE_CAROUSING_AFFLICTION_BOUNDARY', 'Resolve the earlier actual poison event before uninterrupted Carousing.')
  const first = week.segments.length === 0, expense = carousingExpenseCp(week.start.input.socialClass)
  let wallet
  if (first) {
    if (!input.paid || copperValue(input.paid) !== expense) toolkitError('XGE_CAROUSING_EXACT_EXPENSE_REQUIRED', 'Explicitly choose exact real coins for the entire selected-class week at the first actual effort.')
    wallet = { ...(state.dmTools?.wallet ?? emptyCoins()) }
    for (const coin of COIN_IDS) wallet[coin] -= input.paid![coin]
    if (!CoinsSchema.safeParse(wallet).success) toolkitError('XGE_CAROUSING_COINS_REQUIRED', 'Possess the exact selected physical coins; no implicit exchange, debt or partial payment.')
  } else if (input.paid !== undefined) toolkitError('XGE_CAROUSING_EXPENSE_ALREADY_PAID', 'The whole week was paid once; no extra payment or refund is inferred.')
  assertGameTimeAdvance(CAROUSING_DAY_SECONDS)
  const event = stamp({ input, from, to, day }); advanceHeroTime(CAROUSING_DAY_SECONDS)
  if (wallet) toolkitState().wallet = wallet
  week.segments.push(event)
  return { ...result(week), event, seconds: CAROUSING_DAY_SECONDS, paidCp: first ? expense : 0 }
}
export function resolveXgeCarousing(raw: unknown) {
  const input = ResolveCarousingSchema.parse(raw), old = replay(input); if (old) return toolkitResult(old)
  ready(); currentCapRepresented(); const week = weekById(input.weekId), state = gs.getState()
  if (week.abandonment || week.segments.length !== 5 || week.resolution) toolkitError('XGE_CAROUSING_RESOLUTION_REQUIRED', 'Finish five actual dates before the single retained CHA Persuasion check.')
  venue(week.start.site); person(week.start.input.hostId)
  if (state.player.conditions.includes('exhaustion') && !state.dmTools?.exhaustion?.creatures.player) toolkitError('EXHAUSTION_LEVEL_REQUIRED', 'Qualify the actual exhaustion level before this source check.')
  readXgeCarousingSource()
  week.resolution = stamp({ input, at: now(), actor: structuredClone(actorFrame()) })
  const answer = checkedResolution({ ...CAROUSING_CHECK, entityId: 'player', sourceCarousingCheck: true }, { domain: CAROUSING_CHECK_DOMAIN, command: { weekId: input.weekId } })
  if (!week.resolution.outcome && gs.getState().hero?.pending) {
    week.resolution.heldWitness = witness(gs.getState().hero!.pending); week.resolution.command = carousingReceiptWitness(week.resolution)
  }
  return answer
}
function finishCarousingCheck(command: Record<string, unknown>, check: AbilityCheckResult) {
  const week = weekById(String(command.weekId)), resolution = week.resolution!
  if (check.ability !== 'cha' || check.label !== CAROUSING_CHECK.label || check.dc !== undefined || check.success !== undefined)
    toolkitError('XGE_CAROUSING_CHECK_CHANGED', 'Keep the original source Persuasion total, without an invented DC or automatic d20 success/failure.')
  delete resolution.heldWitness
  resolution.check = { ...check, entityId: 'player', ability: 'cha', label: CAROUSING_CHECK.label, proficient: Boolean(check.proficient), expertise: Boolean(check.expertise), roll: { ...check.roll },
    mechanicalSummary: `${CAROUSING_CHECK.label}: ${check.roll.detail} ; total source ${check.roll.total}` }
  const printed = printedCarousingContacts(check.roll.total), charismaScore = gs.getState().player.stats.cha
  const chance = { ...rollDice('1d100') }, roll = chance.total <= 10 ? { ...rollDice('1d8') } : undefined
  resolution.outcome = { ...printed, contactIds: Array.from({ length: printed.count }, (_, i) => week.start.input.eventId + ':contact:' + (i + 1)),
    charismaScore, cap: carousingCap(charismaScore), ledgerIndex: nextCarousingLedgerIndex(gs.getState()), chance,
    ...(check.roll.total <= 0 ? { nonpositiveTotalConvention: 'user_hostile_2026_11_07' as const } : {}),
    ...(roll ? { example: { roll, text: week.start.source.examples[week.start.input.socialClass][roll.total - 1] } } : {}) }
  resolution.command = carousingReceiptWitness(resolution)
  return toolkitResult({ ...result(week), event: resolution, allocationPending: printed.count > 0,
    notice: 'Retain the actual result pending explicit allocation to available unspecified slots or real met named NPCs. No person, aid, hostile action, attitude, theft, expense, scar, marriage, quest or information is generated.' })
}
export function validateHeldCarousingCheck(command: Record<string, unknown>) {
  if ((command.toolkitResolution as { domain?: string } | undefined)?.domain !== CAROUSING_CHECK_DOMAIN) return
  const week = openCarousingWeek(gs.getState())
  if (!week?.resolution || !same(week.resolution.actor, actorFrame())) toolkitError('XGE_CAROUSING_CHECK_CHANGED', 'Retain the actual original abilities, proficiency, conditions and pending source check.')
  venue(week.start.site); person(week.start.input.hostId)
  const issues = validateXgeCarousingState(gs.getState()); if (issues.length) toolkitError('XGE_CAROUSING_CHECK_CHANGED', issues.join(' '))
}
export function registerCarousingResolution() { registerCheckedResolution(CAROUSING_CHECK_DOMAIN, (command, check) => finishCarousingCheck(command, check as AbilityCheckResult)) }
export function assignXgeCarousingContact(raw: unknown) {
  const input = AssignCarousingContactSchema.parse(raw), old = replay(input); if (old) return old
  ready()
  const state = gs.getState(), contact = carousingContacts(state).find(c => c.id === input.contactId)
  if (!contact || contact.consumed || contact.state === 'named') toolkitError('XGE_CAROUSING_CONTACT_REQUIRED', 'Choose an actual unallocated result or unused unspecified contact; a named identity is immutable.')
  if ((state.dmTools?.xgeCarousing?.assignments.length ?? 0) >= 512) toolkitError('XGE_CAROUSING_HISTORY_LIMIT', 'Keep the whole contact assignment history before another event.')
  if (state.currentMapId !== contact!.mapId) toolkitError('XGE_CAROUSING_ORIGIN_AREA_REQUIRED', 'Meet the actual eligible person in the original represented map area; no remote or invented identity.')
  const charismaScore = state.player.stats.cha, cap = carousingCap(charismaScore), unspecifiedBefore = unspecifiedAlliedContacts(state).map(c => c.id)
  let site, target, socialClassFact, explanationFact
  if (input.assignment === 'unspecified') {
    if (contact!.state !== 'unallocated' || input.targetId || input.socialClass || input.socialClassFactId || input.explanationFactId
      || input.actualMetNpcConfirmed || input.actualSocialClassConfirmed || input.actualRelationshipExplanationConfirmed)
      toolkitError('XGE_CAROUSING_ASSIGNMENT_ARGUMENTS', 'An unspecified contact has no invented person, explanation or social-class fact.')
    if (contact!.kind === 'allied' && unspecifiedBefore.length >= cap)
      toolkitError('XGE_CAROUSING_UNSPECIFIED_CAP', 'The global real Charisma cap covers unspecified allied contacts only; named contacts do not count.')
  } else {
    if (!input.targetId || input.socialClass !== contact!.socialClass || !input.socialClassFactId || !input.explanationFactId || !input.actualMetNpcConfirmed
      || !input.actualSocialClassConfirmed || !input.actualRelationshipExplanationConfirmed || input.socialClassFactId === input.explanationFactId)
      toolkitError('XGE_CAROUSING_NAMED_QUALIFICATION_REQUIRED', 'Choose the real NPC just met, distinct local class and reasonable relationship facts, and the actual confirmations.')
    target = person(input.targetId!); site = siteHere()
    socialClassFact = fact(input.socialClassFactId!, site); explanationFact = fact(input.explanationFactId!, site)
    if (carousingContacts(state).some(c => c.state === 'named' && c.target?.relationshipId === target!.relationshipId))
      toolkitError('XGE_CAROUSING_CONTACT_IDENTITY_EXISTS', 'Keep the existing named contact and help history. Only explicit renew_xge_carousing_contact can link one new later-week gain to its last consumed promise, never a nonce refill.')
  }
  const event = stamp({ input, at: now(), ledgerIndex: nextCarousingLedgerIndex(state), charismaScore, cap, unspecifiedBefore,
    ...(target ? { site, target, socialClassFact, explanationFact } : {}) })
  data().assignments.push(event)
  return { success: true, replayed: false, event, ...summary(), grantedBenefit: false }
}
export function renewXgeCarousingContact(raw: unknown) {
  const input = RenewCarousingContactSchema.parse(raw), oldEvent = replay(input); if (oldEvent) return oldEvent
  ready()
  const state = gs.getState(), issue = carousingRenewalIssue(state, input)
  if (issue) toolkitError(issue.code, issue.message)
  if ((state.dmTools?.xgeCarousing?.renewals?.length ?? 0) >= 256) toolkitError('XGE_CAROUSING_HISTORY_LIMIT', 'Retain every renewal and its previous promise; no history is evicted.')
  const contacts = carousingContacts(state), old = contacts.find(c => c.id === input.consumedContactId)!, gain = contacts.find(c => c.id === input.sourceContactId)!
  if (state.currentMapId !== old.mapId) toolkitError('XGE_CAROUSING_ORIGIN_AREA_REQUIRED', 'Meet the same actual named person in the original represented map area; no map/class change is inferred.')
  const target = person(input.targetId), site = siteHere()
  if (target.relationshipId !== old.target!.relationshipId) toolkitError('XGE_CAROUSING_CONTACT_IDENTITY_CHANGED', 'Choose the same actual social identity, never a substitute person or an invented contact.')
  if (new Set([input.meetingFactId, input.socialClassFactId, input.renewalFactId]).size !== 3)
    toolkitError('XGE_CAROUSING_RENEWAL_FACTS_REQUIRED', 'Qualify the actual new meeting, unchanged current social class and renewed good graces with distinct local facts.')
  const meetingFact = fact(input.meetingFactId, site), socialClassFact = fact(input.socialClassFactId, site), renewalFact = fact(input.renewalFactId, site)
  const previous = state.dmTools!.xgeCarousing!.consumptions.find(s => s.input.eventId === input.consumedEventId)!, sourceWeek = weekById(gain.weekId)
  readXgeCarousingSource()
  const event = stamp({ input, at: now(), site, target, meetingFact, socialClassFact, renewalFact,
    ledgerIndex: nextCarousingLedgerIndex(state), rootContactId: old.rootContactId ?? old.id, sourceWeekId: gain.weekId,
    previousConsumptionCommand: previous.command, sourceResolutionCommand: sourceWeek.resolution!.command,
    unspecifiedBefore: unspecifiedAlliedContacts(state).map(c => c.id), convention: 'user_one_new_ally_same_class_area_v1' as const })
  ;(data().renewals ??= []).push(event)
  return { success: true, replayed: false, event, ...summary(), seconds: 0, paidCp: 0, grantedBenefit: false,
    notice: 'Explicit user convention consumes one actual later-week allied gain for one new single-use named promise of the same class/area. Old consumption and relationship receipts remain untouched; no aid, attitude, information, action, die or extra fee is produced.' }
}
export function consumeXgeCarousingContact(raw: unknown) {
  const input = ConsumeCarousingContactSchema.parse(raw), old = replay(input); if (old) return old
  ready(); const state = gs.getState(), contact = carousingContacts(state).find(c => c.id === input.contactId)
  if (!contact || contact.state !== 'named' || contact.consumed || contact.target?.id !== input.targetId)
    toolkitError('XGE_CAROUSING_UNUSED_NAMED_CONTACT_REQUIRED', 'Choose the actual unused named contact; an unspecified promise cannot invent a person or an aid event.')
  if (state.currentMapId !== contact!.mapId) toolkitError('XGE_CAROUSING_ORIGIN_AREA_REQUIRED', 'This slice records actual contacts and their aid or obstacles in their original represented map area.')
  if ((state.dmTools?.xgeCarousing?.consumptions.length ?? 0) >= 256) toolkitError('XGE_CAROUSING_HISTORY_LIMIT', 'Retain all actual contact consumption history.')
  if (contact!.kind === 'allied' ? !input.noLifeRiskConfirmed || input.nonviolentNoncriminalObstacleConfirmed : !input.nonviolentNoncriminalObstacleConfirmed || input.noLifeRiskConfirmed)
    toolkitError('XGE_CAROUSING_CONTACT_LIMITS_REQUIRED', 'Allied aid cannot risk the contact’s life; a hostile obstacle cannot be criminal or violent. Qualify the actual applicable source limits.')
  if (contact!.renewedFrom) {
    const root = contact!.rootContactId!, chainIds = new Set(carousingContacts(state).filter(c => (c.rootContactId ?? c.id) === root).map(c => c.id))
    if (!input.actualNewAidAfterRenewalConfirmed || (state.dmTools?.xgeCarousing?.consumptions ?? []).some(s => chainIds.has(s.input.contactId) && s.input.actualAidOrObstacleFactId === input.actualAidOrObstacleFactId))
      toolkitError('XGE_CAROUSING_NEW_AID_REQUIRED', 'Qualify a distinct actual aid after this renewal; the old aid fact and receipt cannot be used again, even at an unchanged worldTime.')
  } else if (input.actualNewAidAfterRenewalConfirmed !== undefined)
    toolkitError('XGE_CAROUSING_AID_CAUSALITY_ARGUMENTS', 'The after-renewal qualification belongs only to an actual renewed promise.')
  const target = person(input.targetId)
  if (target.relationshipId !== contact!.target?.relationshipId) toolkitError('XGE_CAROUSING_CONTACT_IDENTITY_CHANGED', 'Retain this original real social identity.')
  const site = siteHere()
  const event = stamp({ input, at: now(), site, target, actualAidOrObstacleFact: fact(input.actualAidOrObstacleFactId, site),
    ledgerIndex: nextCarousingLedgerIndex(state) })
  data().consumptions.push(event)
  return { success: true, replayed: false, event, ...summary(), grantedBenefit: false,
    notice: 'Only the actual single aid/obstacle is recorded. No attitude, secret, information, help, damage, crime, violence or physical effect is produced. The original relationship history remains.' }
}
export function abandonXgeCarousing(raw: unknown) {
  const input = AbandonCarousingSchema.parse(raw), old = replay(input); if (old) return old
  ready(); const week = weekById(input.weekId)
  if (week.abandonment || week.segments.length >= 5 || week.resolution) toolkitError('XGE_CAROUSING_ABANDONMENT_UNAVAILABLE', 'Abandon only unfinished actual effort; complete results and contacts are retained.')
  const event = stamp({ input, at: now() }); week.abandonment = event
  return { ...result(week), event, refundedCp: 0 }
}
export function inspectXgeCarousing() { return { readOnly: true, weeks: weeks(), assignments: gs.getState().dmTools?.xgeCarousing?.assignments ?? [],
  consumptions: gs.getState().dmTools?.xgeCarousing?.consumptions ?? [], renewals: gs.getState().dmTools?.xgeCarousing?.renewals ?? [],
  source: readXgeCarousingSource(), ...summary() } }
