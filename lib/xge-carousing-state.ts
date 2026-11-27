import { z } from 'zod'
import type { GameState } from './types'
import { CoinsSchema, copperValue } from './srd/currency'
import { sharedDowntimeIntervalIssues } from './downtime-ledger'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'

const Id = z.string().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9_:.-]*$/)
const ContactId = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9_:.-]*$/)
const Time = z.number().int().nonnegative(), Value = z.record(z.string(), z.unknown())
export const CarousingClassSchema = z.enum(['lower', 'middle', 'upper'])
export type CarousingClass = z.infer<typeof CarousingClassSchema>
export const CAROUSING_DAY_SECONDS = 28800
export const CAROUSING_CHECK_DOMAIN = 'xge-carousing'
export const CAROUSING_CHECK = { ability: 'cha', skill: 'persuasion', label: 'XGE Carousing — Persuasion' } as const
export const carousingExpenseCp = (socialClass: CarousingClass) => ({ lower: 1000, middle: 5000, upper: 25000 })[socialClass]
export const carousingCap = (charisma: number) => Math.max(1, 1 + Math.floor((charisma - 10) / 2))
const Event = z.object({ eventId: Id, weekId: Id }).strict()
export const StartCarousingSchema = z.object({ eventId: Id, venueId: Id, venueFactId: Id, hostId: Id,
  socialClass: CarousingClassSchema, explicitlyAdopted: z.literal(true), actualSocializingAccessConfirmed: z.literal(true),
  actualSocialClassConfirmed: z.literal(true), actualVenueHostConfirmed: z.literal(true),
  nobilityAccessFactId: Id.optional(), actualNobilityAccessThroughContactsConfirmed: z.literal(true).optional(),
  nobilityContactIds: z.array(Id).min(1).max(8).optional(),
}).strict()
export const WorkCarousingSchema = Event.extend({ paid: CoinsSchema.optional() })
export const ResolveCarousingSchema = Event
export const AbandonCarousingSchema = Event.extend({ abandonUnfinishedWeekConfirmed: z.literal(true) })
export const AssignCarousingContactSchema = z.object({ eventId: Id, contactId: ContactId,
  assignment: z.enum(['unspecified', 'named']), targetId: Id.optional(), socialClass: CarousingClassSchema.optional(), socialClassFactId: Id.optional(),
  explanationFactId: Id.optional(), actualMetNpcConfirmed: z.literal(true).optional(),
  actualSocialClassConfirmed: z.literal(true).optional(), actualRelationshipExplanationConfirmed: z.literal(true).optional(),
}).strict()
export const ConsumeCarousingContactSchema = z.object({ eventId: Id, contactId: ContactId, targetId: Id,
  actualAidOrObstacleFactId: Id, actualAidOrObstacleConfirmed: z.literal(true),
  noLifeRiskConfirmed: z.literal(true).optional(), nonviolentNoncriminalObstacleConfirmed: z.literal(true).optional(),
  actualNewAidAfterRenewalConfirmed: z.literal(true).optional(),
}).strict()
export const RenewCarousingContactSchema = z.object({ eventId: Id, sourceContactId: ContactId, consumedContactId: ContactId,
  consumedEventId: Id, targetId: Id, socialClass: CarousingClassSchema, meetingFactId: Id, socialClassFactId: Id, renewalFactId: Id,
  actualSameNamedAllyMetConfirmed: z.literal(true), actualCurrentClassAndGoodGracesConfirmed: z.literal(true),
}).strict()
export type RenewCarousingContactInput = z.infer<typeof RenewCarousingContactSchema>
export const CarousingSiteSchema = z.object({ mapId: Id, roomId: Id, cell: z.object({ x: Time, y: Time }).strict(), zFeet: z.number().finite() }).strict()
export const CarousingSourceSchema = z.object({ book: z.literal('xge'), sectionId: z.string(), sha256: z.string(),
  foundationLine: Time, startLine: Time, endLine: Time,
  examples: z.object({ lower: z.array(z.string()).length(8), middle: z.array(z.string()).length(8), upper: z.array(z.string()).length(8) }).strict(),
}).strict()
export type CarousingSource = z.infer<typeof CarousingSourceSchema>
export type CarousingSite = z.infer<typeof CarousingSiteSchema>
const Roll = z.object({ notation: z.string(), rolls: z.array(z.number().int()).max(4), modifier: z.number().int(), total: z.number().int(), detail: z.string() }).passthrough()
const Check = z.object({ entityId: z.literal('player'), ability: z.literal('cha'), label: z.string(),
  proficient: z.boolean(), expertise: z.boolean(), roll: Roll, mechanicalSummary: z.string() }).passthrough()
const Start = z.object({ input: StartCarousingSchema, at: Time, site: CarousingSiteSchema, venueFact: Value, host: Value,
  nobilityAccessFact: Value.optional(), nobilityContacts: z.array(Value).max(8).optional(), source: CarousingSourceSchema, command: z.string() }).strict()
const Segment = z.object({ input: WorkCarousingSchema, from: Time, to: Time, day: Time, command: z.string() }).strict()
const Outcome = z.object({ kind: z.enum(['allied', 'hostile', 'none']), count: Time.max(3), contactIds: z.array(ContactId).max(3),
  charismaScore: z.number().int().min(1).max(30), cap: Time.positive(), ledgerIndex: Time.positive(), chance: Roll,
  example: z.object({ roll: Roll, text: z.string() }).strict().optional(),
  nonpositiveTotalConvention: z.literal('user_hostile_2026_11_07').optional(),
}).strict()
const Resolution = z.object({ input: ResolveCarousingSchema, at: Time, actor: Value, check: Check.optional(), heldWitness: z.string().optional(),
  outcome: Outcome.optional(), command: z.string() }).strict()
const Week = z.object({ start: Start, segments: z.array(Segment).max(5), resolution: Resolution.optional(),
  abandonment: z.object({ input: AbandonCarousingSchema, at: Time, command: z.string() }).strict().optional(),
}).strict()
const Assignment = z.object({ input: AssignCarousingContactSchema, at: Time, ledgerIndex: Time.positive(),
  site: CarousingSiteSchema.optional(), target: Value.optional(), socialClassFact: Value.optional(), explanationFact: Value.optional(),
  charismaScore: z.number().int().min(1).max(30), cap: Time.positive(), unspecifiedBefore: z.array(ContactId).max(256), command: z.string() }).strict()
const Consumption = z.object({ input: ConsumeCarousingContactSchema, at: Time, site: CarousingSiteSchema, target: Value, actualAidOrObstacleFact: Value,
  ledgerIndex: Time.positive(), command: z.string() }).strict()
const Renewal = z.object({ input: RenewCarousingContactSchema, at: Time, site: CarousingSiteSchema, target: Value,
  meetingFact: Value, socialClassFact: Value, renewalFact: Value, ledgerIndex: Time.positive(), rootContactId: ContactId,
  sourceWeekId: Id, previousConsumptionCommand: z.string(), sourceResolutionCommand: z.string(), unspecifiedBefore: z.array(ContactId).max(256),
  convention: z.literal('user_one_new_ally_same_class_area_v1'), command: z.string() }).strict()
export const XgeCarousingStateSchema = z.object({ version: z.literal(1), weeks: z.array(Week).max(64),
  assignments: z.array(Assignment).max(512), consumptions: z.array(Consumption).max(256),
  renewals: z.array(Renewal).max(256).optional() }).strict()
export type CarousingWeek = z.infer<typeof Week>
export type CarousingState = z.infer<typeof XgeCarousingStateSchema>
export const carousingWitness = witness
export const carousingReceiptWitness = ({ command: _, ...body }: { command: string }) => witness(body)

/** User decision 7 November 2026 extends the printed 1–5 hostile row to all totals <=5. */
export function printedCarousingContacts(total: number) {
  if (total <= 5) return { kind: 'hostile' as const, count: 1 }
  if (total <= 10) return { kind: 'none' as const, count: 0 }
  return { kind: 'allied' as const, count: total <= 15 ? 1 : total <= 20 ? 2 : 3 }
}

export const openCarousingWeek = (state: GameState) => state.dmTools?.xgeCarousing?.weeks.find(week => !week.abandonment && !week.resolution?.outcome)
export function carousingJournal(state: GameState) {
  const data = state.dmTools?.xgeCarousing
  return [
    ...(data?.weeks ?? []).filter(week => week.resolution?.outcome).map(week => ({ kind: 'earn' as const, index: week.resolution!.outcome!.ledgerIndex, at: week.resolution!.at, week })),
    ...(data?.assignments ?? []).map(assignment => ({ kind: 'assign' as const, index: assignment.ledgerIndex, at: assignment.at, assignment })),
    ...(data?.consumptions ?? []).map(consumption => ({ kind: 'consume' as const, index: consumption.ledgerIndex, at: consumption.at, consumption })),
    ...(data?.renewals ?? []).map(renewal => ({ kind: 'renew' as const, index: renewal.ledgerIndex, at: renewal.at, renewal })),
  ].sort((a, b) => a.index - b.index)
}
export type CarousingContact = { id: string; kind: 'allied' | 'hostile'; weekId: string; socialClass: CarousingClass; mapId: string;
  state: 'unallocated' | 'unspecified' | 'named'; target?: Record<string, unknown>; consumed: boolean;
  rootContactId?: string; renewedFrom?: string; renewalEventId?: string; renewedAt?: number }
export function carousingContacts(state: GameState) {
  const contacts = new Map<string, CarousingContact>()
  for (const row of carousingJournal(state)) {
    if (row.kind === 'earn') {
      const outcome = row.week.resolution!.outcome!
      for (const id of outcome.contactIds) if (outcome.kind !== 'none') contacts.set(id, { id, kind: outcome.kind,
        weekId: row.week.start.input.eventId, socialClass: row.week.start.input.socialClass, mapId: row.week.start.site.mapId,
        state: 'unallocated', consumed: false })
    } else if (row.kind === 'assign') {
      const c = contacts.get(row.assignment.input.contactId)
      if (c) { c.state = row.assignment.input.assignment; c.target = row.assignment.target }
    } else if (row.kind === 'consume') {
      const c = contacts.get(row.consumption.input.contactId)
      if (c) c.consumed = true
    } else {
      const r = row.renewal, c = contacts.get(r.input.sourceContactId)
      if (c) Object.assign(c, { state: 'named', target: r.target, rootContactId: r.rootContactId,
        renewedFrom: r.input.consumedContactId, renewalEventId: r.input.eventId, renewedAt: r.at })
    }
  }
  return [...contacts.values()]
}
export const nextCarousingLedgerIndex = (state: GameState) => carousingJournal(state).length + 1
export const unspecifiedAlliedContacts = (state: GameState) => carousingContacts(state).filter(c => c.kind === 'allied' && c.state === 'unspecified' && !c.consumed)

function renewalEligibility(weeks: z.infer<typeof Week>[], contacts: CarousingContact[], consumptions: z.infer<typeof Consumption>[],
  input: RenewCarousingContactInput, at: number, index: number) {
  const old = contacts.find(c => c.id === input.consumedContactId), gain = contacts.find(c => c.id === input.sourceContactId)
  if (!old || old.kind !== 'allied' || old.state !== 'named' || !old.consumed || !old.target)
    return { code: 'XGE_CAROUSING_CONSUMED_ALLY_REQUIRED', message: 'Choose the actual last consumed named allied promise, retaining its old receipt.' }
  if (!gain || gain.id === old.id || gain.kind !== 'allied' || gain.consumed || !['unallocated', 'unspecified'].includes(gain.state))
    return { code: 'XGE_CAROUSING_NEW_ALLIED_GAIN_REQUIRED', message: 'Choose one unused unallocated or unspecified allied gain; never a hostile, nonexistent or already named promise.' }
  if (gain.socialClass !== old.socialClass || input.socialClass !== old.socialClass || gain.mapId !== old.mapId)
    return { code: 'XGE_CAROUSING_RENEWAL_CLASS_AREA_REQUIRED', message: 'The new real week, original contact and current qualification must retain the same social class and represented map area.' }
  if (contacts.some(c => c.renewedFrom === old.id) || contacts.some(c => c.state === 'named' && !c.consumed && c.target?.relationshipId === old.target!.relationshipId))
    return { code: 'XGE_CAROUSING_LATEST_PROMISE_REQUIRED', message: 'Use the last consumed promise of this person; never stack available promises or renew an old ancestor again.' }
  const consumed = consumptions.find(c => c.input.eventId === input.consumedEventId && c.input.contactId === old.id)
  const week = weeks.find(w => w.start.input.eventId === gain.weekId), outcome = week?.resolution?.outcome
  if (!consumed || !week || !outcome || week.start.input.eventId === old.weekId || week.segments.length !== 5
    || outcome.kind !== 'allied' || !outcome.contactIds.includes(gain.id) || consumed.ledgerIndex >= outcome.ledgerIndex || outcome.ledgerIndex >= index
    || week.segments.some(s => s.from < consumed.at) || week.resolution!.at > at)
    return { code: 'XGE_CAROUSING_NEW_WEEK_AFTER_AID_REQUIRED', message: 'All five actual new-week efforts follow the consumed aid receipt causally. Equal worldTime is allowed; no old saved gain or retroactive effort.' }
}
export function carousingRenewalIssue(state: GameState, input: RenewCarousingContactInput) {
  const data = state.dmTools?.xgeCarousing
  return renewalEligibility(data?.weeks ?? [], carousingContacts(state), data?.consumptions ?? [], input,
    state.worldTimeSeconds ?? 0, nextCarousingLedgerIndex(state))
}

export function validateXgeCarousingState(state: GameState) {
  const data = state.dmTools?.xgeCarousing
  if (!data) return (state.hero?.pending?.command.toolkitResolution as { domain?: string } | undefined)?.domain === CAROUSING_CHECK_DOMAIN
    ? ['Retain the actual Carousing registry for its original pending source check; no replacement may detach this continuation.'] : []
  if (!XgeCarousingStateSchema.safeParse(data).success) return ['Invalid retained Carousing schema.']
  const issues: string[] = [], events = new Set<string>(), clock = state.worldTimeSeconds ?? 0
  let open = 0, held: CarousingWeek | undefined
  function receipt(r: { input: { eventId: string }; command: string }, at: number) {
    if (events.has(r.input.eventId) || r.command !== carousingReceiptWitness(r) || at > clock) issues.push('Retain every unique original Carousing event and its receipt.')
    events.add(r.input.eventId)
  }
  function factMatches(fact: Record<string, unknown> | undefined, id: string | undefined, site: z.infer<typeof CarousingSiteSchema>) {
    return fact && id && fact.id === id && fact.source === 'record_scene_fact' && fact.expires === 'never' && !fact.clueId && !fact.subjectItemId
      && fact.mapId === site.mapId && fact.roomId === site.roomId && witness((fact.narrativeEffect as { cell?: unknown })?.cell) === witness(site.cell)
  }
  function originalPerson(p: Record<string, unknown>, id: string) { return p.id === id && typeof p.relationshipId === 'string' && typeof p.mapId === 'string' && typeof p.roomId === 'string' && typeof p.zFeet === 'number' }
  function die(roll: z.infer<typeof Roll>, sides: number) { return roll.notation === `1d${sides}` && roll.rolls.length === 1 && roll.modifier === 0 && roll.total === roll.rolls[0] && roll.total >= 1 && roll.total <= sides }
  for (const week of data.weeks) {
    const { start, segments, resolution, abandonment } = week
    receipt(start, start.at)
    for (const prior of data.weeks) if (prior !== week && prior.resolution?.outcome && prior.resolution.at <= start.at) {
      for (const id of prior.resolution.outcome.contactIds) if (!data.assignments.some(a => a.input.contactId === id && a.at <= start.at)
        && !(data.renewals ?? []).some(r => r.input.sourceContactId === id && r.at <= start.at))
        issues.push('A new actual week cannot bypass a retained earlier result still awaiting explicit contact assignment.')
    }
    if (!factMatches(start.venueFact, start.input.venueFactId, start.site) || !originalPerson(start.host, start.input.hostId)
      || start.host.mapId !== start.site.mapId || start.host.roomId !== start.site.roomId)
      issues.push('Retain the actual local venue, host and qualified social class.')
    if (start.input.socialClass === 'upper') {
      if (!start.input.actualNobilityAccessThroughContactsConfirmed || !factMatches(start.nobilityAccessFact, start.input.nobilityAccessFactId, start.site)
        || !start.input.nobilityContactIds?.length || !start.nobilityContacts || start.nobilityContacts.length !== start.input.nobilityContactIds.length
        || new Set(start.input.nobilityContactIds).size !== start.input.nobilityContactIds.length
        || start.nobilityContacts.some((p, i) => !originalPerson(p, start.input.nobilityContactIds![i]) || p.mapId !== start.site.mapId || p.roomId !== start.site.roomId))
        issues.push('Retain actual sufficient contacts and qualified access to local nobility.')
    } else if (start.nobilityAccessFact || start.nobilityContacts || start.input.nobilityAccessFactId || start.input.nobilityContactIds || start.input.actualNobilityAccessThroughContactsConfirmed)
      issues.push('Only upper-class Carousing uses nobility access qualifications.')
    for (const [i, s] of segments.entries()) {
      receipt(s, s.from)
      if (s.input.weekId !== start.input.eventId || s.from < start.at || s.day !== Math.floor(s.from / 86400) || s.to !== s.from + CAROUSING_DAY_SECONDS
        || s.to > clock || s.to > (s.day + 1) * 86400 || s.day > segments[0].day + 9 || i > 0 && s.day <= segments[i - 1].day)
        issues.push('Retain five distinct actual eight-hour effort dates in the represented ten-date span.')
      if (i === 0 ? !s.input.paid || copperValue(s.input.paid) !== carousingExpenseCp(start.input.socialClass) : s.input.paid !== undefined)
        issues.push('Pay the whole actual social-class week expense once at the first real eight-hour effort, without later implicit refunds.')
    }
    const end = segments.at(-1)?.to ?? start.at
    if (abandonment) {
      receipt(abandonment, abandonment.at)
      if (segments.length >= 5 || resolution || abandonment.at < end || abandonment.input.weekId !== start.input.eventId)
        issues.push('Abandon only unfinished actual Carousing while retaining effort and expenses.')
    }
    if (!abandonment && !resolution?.outcome) open++
    if (!resolution) continue
    receipt(resolution, resolution.at)
    if (segments.length !== 5 || resolution.at < end || resolution.input.weekId !== start.input.eventId) issues.push('One original Carousing check follows five actual dates.')
    if (!resolution.outcome) {
      if (!resolution.heldWitness || held || resolution.check) issues.push('Retain the original pending Carousing check, never a substituted roll.')
      held = week
    } else {
      const outcome = resolution.outcome, check = resolution.check, printed = check && printedCarousingContacts(check.roll.total)
      if (!check || !printed || resolution.heldWitness || check.ability !== 'cha' || check.label !== CAROUSING_CHECK.label || check.dc !== undefined || check.success !== undefined
        || outcome.kind !== printed?.kind || outcome.count !== printed?.count || outcome.contactIds.length !== outcome.count
        || outcome.contactIds.some((id, i) => id !== start.input.eventId + ':contact:' + (i + 1))
        || outcome.cap !== carousingCap(outcome.charismaScore) || (resolution.actor.stats as { cha?: number })?.cha !== outcome.charismaScore
        || Boolean(outcome.nonpositiveTotalConvention) !== (check.roll.total <= 0)
        || !die(outcome.chance, 100) || Boolean(outcome.example) !== (outcome.chance.total <= 10)
        || outcome.example && (!die(outcome.example.roll, 8) || outcome.example.text !== start.source.examples[start.input.socialClass][outcome.example.roll.total - 1]))
        issues.push('Retain the original CHA Persuasion total, its exact contacts and its own documentary class complication.')
    }
  }
  if (open > 1) issues.push('Keep at most one unfinished actual Carousing week.')
  const contacts = new Map<string, CarousingContact>(); let lastAt = 0
  const seenConsumptions: z.infer<typeof Consumption>[] = [], aidFactsByRoot = new Map<string, Set<string>>()
  for (const [i, row] of carousingJournal(state).entries()) {
    if (row.index !== i + 1 || row.at < lastAt || row.at > clock) issues.push('Retain the original ordered Carousing contact ledger.')
    lastAt = row.at
    if (row.kind === 'earn') {
      const o = row.week.resolution!.outcome!
      for (const id of o.contactIds) if (o.kind !== 'none') contacts.set(id, { id, kind: o.kind, weekId: row.week.start.input.eventId, mapId: row.week.start.site.mapId,
        socialClass: row.week.start.input.socialClass, state: 'unallocated', consumed: false })
    } else if (row.kind === 'assign') {
      const a = row.assignment, input = a.input, c = contacts.get(input.contactId)
      receipt(a, a.at)
      const before = [...contacts.values()].filter(v => v.kind === 'allied' && v.state === 'unspecified' && !v.consumed).map(v => v.id)
      if (!c || c.consumed || c.state === 'named' || a.cap !== carousingCap(a.charismaScore) || witness(a.unspecifiedBefore) !== witness(before)) issues.push('Assign only an actual unused original contact under its historical global cap.')
      if (input.assignment === 'unspecified') {
        if (c?.state !== 'unallocated' || a.site || a.target || a.socialClassFact || a.explanationFact || input.targetId || input.socialClass || input.socialClassFactId || input.explanationFactId
          || input.actualMetNpcConfirmed || input.actualSocialClassConfirmed || input.actualRelationshipExplanationConfirmed || c?.kind === 'allied' && before.length >= a.cap)
          issues.push('Only unspecified allied contacts consume actual global Charisma capacity; never invent a target.')
      } else {
        const target = a.target, site = a.site
        if (!target || !originalPerson(target, input.targetId!) || target.mapId !== c?.mapId || input.socialClass !== c?.socialClass || !input.actualMetNpcConfirmed || !input.actualSocialClassConfirmed || !input.actualRelationshipExplanationConfirmed
          || input.socialClassFactId === input.explanationFactId || !site || site.mapId !== target.mapId || site.roomId !== target.roomId
          || !factMatches(a.socialClassFact, input.socialClassFactId, site) || !factMatches(a.explanationFact, input.explanationFactId, site)
          || [...contacts.values()].some(other => other.state === 'named' && other.target?.relationshipId === target.relationshipId))
          issues.push('A named contact requires its actual met stable identity, class and distinct reasonable relationship facts in the origin area.')
      }
      if (c) { c.state = input.assignment; c.target = a.target }
    } else if (row.kind === 'consume') {
      const s = row.consumption, c = contacts.get(s.input.contactId); receipt(s, s.at)
      const f = s.actualAidOrObstacleFact
      if (!c || c.state !== 'named' || c.consumed || c.target?.id !== s.input.targetId || c.target?.relationshipId !== s.target.relationshipId
        || !originalPerson(s.target, s.input.targetId) || s.target.mapId !== c.mapId || f.id !== s.input.actualAidOrObstacleFactId
        || s.site.mapId !== s.target.mapId || s.site.roomId !== s.target.roomId || !factMatches(f, s.input.actualAidOrObstacleFactId, s.site)
        || (c.kind === 'allied' ? !s.input.noLifeRiskConfirmed || s.input.nonviolentNoncriminalObstacleConfirmed : !s.input.nonviolentNoncriminalObstacleConfirmed || s.input.noLifeRiskConfirmed))
        issues.push('Consume an actual named contact only once after actual aid or a noncriminal nonviolent obstacle, without generating effects.')
      const rootId = c?.rootContactId ?? c?.id ?? '', used = aidFactsByRoot.get(rootId) ?? new Set<string>()
      if (c?.renewedFrom ? !s.input.actualNewAidAfterRenewalConfirmed || used.has(s.input.actualAidOrObstacleFactId) || s.at < c.renewedAt!
        : s.input.actualNewAidAfterRenewalConfirmed !== undefined)
        issues.push('A renewed promise consumes a distinct actual new aid after renewal, with causal equality allowed; old aid facts never replay into a new use.')
      used.add(s.input.actualAidOrObstacleFactId); aidFactsByRoot.set(rootId, used); seenConsumptions.push(s)
      if (c) c.consumed = true
    } else {
      const r = row.renewal, input = r.input, old = contacts.get(input.consumedContactId), gain = contacts.get(input.sourceContactId)
      receipt(r, r.at)
      const eligibility = renewalEligibility(data.weeks, [...contacts.values()], seenConsumptions, input, r.at, r.ledgerIndex)
      const previousUse = seenConsumptions.find(s => s.input.eventId === input.consumedEventId), sourceWeek = data.weeks.find(w => w.start.input.eventId === gain?.weekId)
      const unspecified = [...contacts.values()].filter(c => c.kind === 'allied' && c.state === 'unspecified' && !c.consumed).map(c => c.id)
      if (eligibility || !old || !gain || r.rootContactId !== (old.rootContactId ?? old.id) || r.sourceWeekId !== gain.weekId
        || r.previousConsumptionCommand !== previousUse?.command || r.sourceResolutionCommand !== sourceWeek?.resolution?.command
        || witness(r.unspecifiedBefore) !== witness(unspecified) || !originalPerson(r.target, input.targetId)
        || r.target.relationshipId !== old.target?.relationshipId || r.target.mapId !== old.mapId || r.site.mapId !== old.mapId || r.site.roomId !== r.target.roomId
        || new Set([input.meetingFactId, input.socialClassFactId, input.renewalFactId]).size !== 3
        || !factMatches(r.meetingFact, input.meetingFactId, r.site) || !factMatches(r.socialClassFact, input.socialClassFactId, r.site)
        || !factMatches(r.renewalFact, input.renewalFactId, r.site))
        issues.push('Renew exactly one consumed named ally using one actual later-week gain of the same class/area, physical identity and retained predecessor receipts; no source receipt is reset.')
      if (gain) Object.assign(gain, { state: 'named', target: r.target, rootContactId: r.rootContactId,
        renewedFrom: input.consumedContactId, renewalEventId: input.eventId, renewedAt: r.at })
    }
  }
  const pending = state.hero?.pending, continuation = pending?.command.toolkitResolution as { domain?: string; command?: { weekId?: string } } | undefined
  if (held || continuation?.domain === CAROUSING_CHECK_DOMAIN) {
    const r = held?.resolution, check = pending?.command.result as { entityId?: string; ability?: string; label?: string; dc?: number } | undefined
    if (!r || r.heldWitness !== witness(pending) || continuation?.domain !== CAROUSING_CHECK_DOMAIN || continuation.command?.weekId !== held?.start.input.eventId
      || pending?.command.type !== 'check' || check?.entityId !== 'player' || check?.ability !== 'cha' || check?.label !== CAROUSING_CHECK.label || check?.dc !== undefined)
      issues.push('Retain the original pending Carousing total and exact continuation.')
  }
  return [...new Set([...issues, ...sharedDowntimeIntervalIssues(state)])]
}
