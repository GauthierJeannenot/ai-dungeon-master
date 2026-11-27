import { z } from 'zod'
import type { GameState } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
import { sharedDowntimeIntervalIssues } from './downtime-ledger'
const Id = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_:.-]*$/)
const FavorId = z.string().min(1).max(100)
const Time = z.number().int().nonnegative(), Value = z.record(z.string(), z.unknown())
const Event = z.object({ eventId: Id, weekId: Id }).strict()
export const SERVICE_DAY_SECONDS = 28800
export const SERVICE_CHECK_DOMAIN = 'xge-religious-service'
export const SERVICE_CHECKS = {
  religion: { ability: 'int', skill: 'religion', label: 'XGE Religious Service — Religion' },
  persuasion: { ability: 'cha', skill: 'persuasion', label: 'XGE Religious Service — Persuasion' },
} as const
export const StartServiceSchema = z.object({ eventId: Id, templeId: Id, templeFactId: Id, representativeId: Id,
  explicitlyAdopted: z.literal(true), actualTempleAccessConfirmed: z.literal(true), actualAlignedBeliefsAndEthosConfirmed: z.literal(true),
  actualTempleRepresentativeConfirmed: z.literal(true) }).strict()
export const WorkServiceSchema = Event
export const ResolveServiceSchema = Event.extend({ skill: z.enum(['religion', 'persuasion']) })
export const AbandonServiceSchema = Event.extend({ abandonUnfinishedWeekConfirmed: z.literal(true) })
export const SpendServiceFavorSchema = z.object({ eventId: Id, favorId: FavorId, representativeId: Id,
  purpose: z.enum(['specific_problem', 'political_or_social_support']), requestFactId: Id, acceptanceFactId: Id,
  actualRequestAndAcceptanceConfirmed: z.literal(true), actualTempleRepresentativeConfirmed: z.literal(true) }).strict()
const Site = z.object({ mapId: Id, roomId: Id, cell: z.object({ x: z.number().int(), y: z.number().int() }).strict(), zFeet: z.number().finite() }).strict()
const Source = z.object({ book: z.literal('xge'), sectionId: z.string(), sha256: z.string(), foundationLine: Time,
  startLine: Time, endLine: Time, examples: z.array(z.string()).length(6) }).strict()
const Roll = z.object({ notation: z.string(), rolls: z.array(z.number().int()).max(4), modifier: z.number().int(), total: z.number().int(), detail: z.string() }).passthrough()
const Check = z.object({ entityId: z.literal('player'), ability: z.enum(['int', 'cha']), label: z.string(),
  proficient: z.boolean(), expertise: z.boolean(), roll: Roll, mechanicalSummary: z.string() }).passthrough()
const Outcome = z.object({ printedFavors: Time.max(2), earned: Time.max(2), favorIds: z.array(FavorId).max(2),
  nonpositiveTotalConvention: z.literal('user_no_gain_2026_11_07').optional(),
  charismaScore: z.number().int().min(1).max(30), cap: Time.positive(), unusedBefore: z.array(FavorId).max(128), ledgerIndex: Time.positive(),
  chance: Roll, example: z.object({ roll: Roll, text: z.string() }).strict().optional() }).strict()
const Resolution = z.object({ input: ResolveServiceSchema, at: Time, actor: Value, check: Check.optional(),
  heldWitness: z.string().optional(), outcome: Outcome.optional(), command: z.string() }).strict()
const Start = z.object({ input: StartServiceSchema, at: Time, site: Site, templeFact: Value, representative: Value,
  source: Source, command: z.string() }).strict()
const Segment = z.object({ input: WorkServiceSchema, from: Time, to: Time, day: Time, command: z.string() }).strict()
const Week = z.object({ start: Start, segments: z.array(Segment).max(5), resolution: Resolution.optional(),
  abandonment: z.object({ input: AbandonServiceSchema, at: Time, command: z.string() }).strict().optional() }).strict()
const Spend = z.object({ input: SpendServiceFavorSchema, at: Time, templeId: Id, originWeekId: Id, site: Site,
  requestFact: Value, acceptanceFact: Value, representative: Value, ledgerIndex: Time.positive(), command: z.string() }).strict()
export const XgeReligiousServiceStateSchema = z.object({ version: z.literal(1), weeks: z.array(Week).max(64), spends: z.array(Spend).max(128) }).strict()
export type ServiceWeek = z.infer<typeof Week>
export type ServiceSource = z.infer<typeof Source>
export const serviceWitness = witness
export const serviceReceiptWitness = ({ command: _, ...body }: { command: string }) => witness(body)
export const serviceCap = (score: number) => Math.max(1, 1 + Math.floor((score - 10) / 2))
// Explicit user decision of 7 November 2026 extends the printed 1–10 row to all totals <=10.
export const printedServiceFavors = (total: number) => total <= 10 ? 0 : total <= 20 ? 1 : 2
export const openServiceWeek = (state: GameState) => state.dmTools?.xgeReligiousService?.weeks.find(week => !week.abandonment && !week.resolution?.outcome)
export function unusedServiceFavors(state: GameState) {
  const data = state.dmTools?.xgeReligiousService, spent = new Set(data?.spends.map(receipt => receipt.input.favorId))
  return (data?.weeks ?? []).flatMap(week => (week.resolution?.outcome?.favorIds ?? []).map(id => ({ id, weekId: week.start.input.eventId,
    templeId: week.start.input.templeId, representativeId: week.start.input.representativeId, site: week.start.site }))).filter(favor => !spent.has(favor.id))
}
export const nextServiceLedgerIndex = (state: GameState) => (state.dmTools?.xgeReligiousService?.spends.length ?? 0)
  + (state.dmTools?.xgeReligiousService?.weeks.filter(week => week.resolution?.outcome).length ?? 0) + 1
function die(roll: z.infer<typeof Roll>, sides: number) {
  return roll.notation === `1d${sides}` && roll.rolls.length === 1 && roll.modifier === 0
    && roll.rolls[0] >= 1 && roll.rolls[0] <= sides && roll.total === roll.rolls[0]
}
export function validateXgeReligiousServiceState(state: GameState) {
  const data = state.dmTools?.xgeReligiousService
  if (!data) return []
  if (!XgeReligiousServiceStateSchema.safeParse(data).success) return ['Invalid retained religious-service state schema.']
  const issues: string[] = [], events = new Set<string>(), clock = state.worldTimeSeconds ?? 0
  let open = 0, held: ServiceWeek | undefined
  function receipt(event: { input: { eventId: string }; command: string }, at: number) {
    if (events.has(event.input.eventId) || event.command !== serviceReceiptWitness(event) || at > clock) issues.push('Retain each original religious-service event and receipt.')
    events.add(event.input.eventId)
  }
  function factMatches(fact: Record<string, unknown>, id: string, site: z.infer<typeof Site>) {
    return fact.id === id && fact.source === 'record_scene_fact' && fact.expires === 'never' && !fact.clueId && !fact.subjectItemId
      && fact.mapId === site.mapId && fact.roomId === site.roomId && witness((fact.narrativeEffect as { cell?: unknown })?.cell) === witness(site.cell)
  }
  for (const week of data.weeks) {
    const { start, segments, resolution, abandonment } = week
    receipt(start, start.at)
    if (!factMatches(start.templeFact, start.input.templeFactId, start.site) || start.representative.id !== start.input.representativeId
      || start.representative.mapId !== start.site.mapId || start.representative.roomId !== start.site.roomId)
      issues.push('Keep the actual qualified temple, representative, beliefs, ethos and access origin.')
    for (const [i, segment] of segments.entries()) {
      receipt(segment, segment.from)
      if (segment.input.weekId !== start.input.eventId || segment.from < start.at || segment.day !== Math.floor(segment.from / 86400)
        || segment.to !== segment.from + SERVICE_DAY_SECONDS || segment.to > clock || segment.to > (segment.day + 1) * 86400
        || segment.day > segments[0].day + 9 || i > 0 && segment.day <= segments[i - 1].day)
        issues.push('Keep five real separate eight-hour dates within the represented ten-date span.')
    }
    const end = segments.at(-1)?.to ?? start.at
    if (abandonment) {
      receipt(abandonment, abandonment.at)
      if (segments.length >= 5 || resolution || abandonment.at < end || abandonment.input.weekId !== start.input.eventId)
        issues.push('Abandon only unfinished service, retaining actual effort.')
    }
    if (!abandonment && !resolution?.outcome) open++
    if (!resolution) continue
    receipt(resolution, resolution.at)
    const expected = SERVICE_CHECKS[resolution.input.skill], check = resolution.check, outcome = resolution.outcome
    if (segments.length !== 5 || resolution.at < end || resolution.input.weekId !== start.input.eventId
      || check && (check.ability !== expected.ability || check.label !== expected.label || check.dc !== undefined || check.success !== undefined))
      issues.push('Retain the exact Religion or Persuasion source total without inventing a DC or success flag.')
    if (!outcome) {
      if (!resolution.heldWitness || held || check) issues.push('An unfinished religious-service roll retains its original pending check.'); held = week
    } else if (!check || resolution.heldWitness || outcome.printedFavors !== printedServiceFavors(check.roll.total)
      || Boolean(outcome.nonpositiveTotalConvention) !== (check.roll.total <= 0)
      || outcome.cap !== serviceCap(outcome.charismaScore) || (resolution.actor.stats as { cha?: number })?.cha !== outcome.charismaScore
      || outcome.earned !== Math.min(outcome.printedFavors, Math.max(0, outcome.cap - outcome.unusedBefore.length))
      || outcome.favorIds.length !== outcome.earned || outcome.favorIds.some((id, i) => id !== start.input.eventId + ':favor:' + (i + 1))
      || !die(outcome.chance, 100) || Boolean(outcome.example) !== (outcome.chance.total <= 10)
      || outcome.example && (!die(outcome.example.roll, 6) || outcome.example.text !== start.source.examples[outcome.example.roll.total - 1]))
      issues.push('Retain original total, actual historical Charisma cap, favors and documentary source complication.')
  }
  const ledger = [ ...data.weeks.filter(week => week.resolution?.outcome).map(week => ({ kind: 'earn' as const, at: week.resolution!.at, index: week.resolution!.outcome!.ledgerIndex, week })),
    ...data.spends.map(spend => ({ kind: 'spend' as const, at: spend.at, index: spend.ledgerIndex, spend })) ].sort((a, b) => a.index - b.index)
  const stored = new Map<string, { templeId: string; weekId: string; site: z.infer<typeof Site> }>()
  let previousAt = 0
  for (const [i, row] of ledger.entries()) {
    if (row.index !== i + 1 || row.at < previousAt) issues.push('Retain the original ordered global favor ledger without rebasing historical caps.')
    previousAt = row.at
    if (row.kind === 'earn') {
      const outcome = row.week.resolution!.outcome!
      if (witness(outcome.unusedBefore) !== witness([...stored.keys()]) || stored.size > outcome.cap) issues.push('All temples share one actual global favor cap, preserving earlier receipts.')
      for (const id of outcome.favorIds) stored.set(id, { templeId: row.week.start.input.templeId, weekId: row.week.start.input.eventId, site: row.week.start.site })
    } else {
      const s = row.spend, origin = stored.get(s.input.favorId)
      receipt(s, s.at)
      if (!origin || origin.templeId !== s.templeId || origin.weekId !== s.originWeekId || witness(s.site) !== witness(origin.site)
        || !factMatches(s.requestFact, s.input.requestFactId, s.site) || !factMatches(s.acceptanceFact, s.input.acceptanceFactId, s.site)
        || s.input.requestFactId === s.input.acceptanceFactId || s.representative.id !== s.input.representativeId
        || s.representative.mapId !== s.site.mapId || s.representative.roomId !== s.site.roomId)
        issues.push('Spend exactly one previously unused promise at its actual temple with a real request and acceptance.')
      stored.delete(s.input.favorId)
    }
  }
  if (open > 1) issues.push('Only one unfinished religious-service week is represented.')
  const pending = state.hero?.pending, continuation = pending?.command.toolkitResolution as { domain?: string; command?: { weekId?: string } } | undefined
  if (held || continuation?.domain === SERVICE_CHECK_DOMAIN) {
    const resolution = held?.resolution, check = pending?.command.result as { entityId?: string; ability?: string; label?: string; dc?: number } | undefined
    const expected = resolution && SERVICE_CHECKS[resolution.input.skill]
    if (!resolution || resolution.heldWitness !== witness(pending) || continuation?.domain !== SERVICE_CHECK_DOMAIN
      || continuation.command?.weekId !== held?.start.input.eventId || pending?.command.type !== 'check'
      || check?.entityId !== 'player' || check?.ability !== expected?.ability || check?.label !== expected?.label || check?.dc !== undefined)
      issues.push('Keep the original held religious-service total and source choice.')
  }
  return [...new Set([...issues, ...sharedDowntimeIntervalIssues(state)])]
}
