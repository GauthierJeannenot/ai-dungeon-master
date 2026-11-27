import { z } from 'zod'
import { sharedDowntimeIntervalIssues } from './downtime-ledger'
import { CoinsSchema, copperValue } from './srd/currency'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'
import type { GameState } from './types'

const Id = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_:.-]*$/)
const Int = z.number().int()
const Time = Int.nonnegative()
const Event = z.object({ eventId: Id, weekId: Id }).strict()
export const GAMBLING_DAY_SECONDS = 28800
export const GAMBLING_CHECK_DOMAIN = 'xge-gambling'
export const GAMBLING_CHECKS = [
  { ability: 'wis', skill: 'insight', label: 'XGE Gambling — Insight' },
  { ability: 'cha', skill: 'deception', label: 'XGE Gambling — Deception' },
  { ability: 'cha', skill: 'intimidation', label: 'XGE Gambling — Intimidation' },
] as const
export const StartGamblingSchema = z.object({ eventId: Id, venueFactId: Id, creditorId: Id, paid: CoinsSchema,
  explicitlyAdopted: z.literal(true), actualGamblingVenueConfirmed: z.literal(true) }).strict()
export const WorkGamblingSchema = Event
const GamingSet = z.object({ itemId: Id, equipmentId: z.enum(['dice_set', 'dragonchess_set']), factId: Id,
  replaceSkills: z.array(z.enum(['insight', 'deception', 'intimidation'])).min(1).max(3),
  actualVenueGameConfirmed: z.literal(true) }).strict()
export const ResolveGamblingSchema = Event.extend({ useThreeSourceChecks: z.literal(true), gamingSet: GamingSet.optional() })
export const SettleGamblingSchema = Event.extend({ received: CoinsSchema, actualVenuePaymentConfirmed: z.literal(true) })
export const PayGamblingDebtSchema = Event.extend({ paid: CoinsSchema, creditorId: Id })
export const AbandonGamblingSchema = Event.extend({ forfeitStakeConfirmed: z.literal(true) })

const Site = z.object({ mapId: Id, roomId: Id, cell: z.object({ x: Int, y: Int }).strict(), zFeet: z.number().finite() }).strict()
const Source = z.object({ book: z.literal('xge'), sectionId: z.string(), sha256: z.string(),
  foundationLine: Time, startLine: Time, endLine: Time, examples: z.array(z.string().min(1)).length(6) }).strict()
const Roll = z.object({ notation: z.string(), rolls: z.array(Int).max(3), modifier: Int, total: Int, detail: z.string() }).passthrough()
const Check = z.object({ entityId: z.literal('player'), ability: z.enum(['wis', 'cha']), label: z.string(), dc: Int,
  proficient: z.boolean(), expertise: z.boolean(), roll: Roll, success: z.boolean(), mechanicalSummary: z.string() }).passthrough()
const Start = z.object({ input: StartGamblingSchema, at: Time, site: Site, venueFact: z.record(z.string(), z.unknown()),
  source: Source, command: z.string() }).strict()
const Segment = z.object({ input: WorkGamblingSchema, from: Time, to: Time, day: Time, command: z.string() }).strict()
const Results = z.object({ chance: Roll, example: z.object({ roll: Roll, text: z.string() }).strict().optional(),
  successes: Int.min(0).max(3), returnCp: Time, debtCp: Time }).strict()
const Resolution = z.object({ input: ResolveGamblingSchema, at: Time, dcs: z.array(Roll).length(3),
  checks: z.array(Check).max(3), setFact: z.record(z.string(), z.unknown()).optional(), heldWitness: z.string().optional(), outcome: Results.optional(), command: z.string() }).strict()
const stamped = <T extends z.ZodType>(input: T) => z.object({ input, at: Time, command: z.string() }).strict()
const Week = z.object({ start: Start, segments: z.array(Segment).max(5), resolution: Resolution.optional(),
  settlement: stamped(SettleGamblingSchema).optional(), payments: z.array(stamped(PayGamblingDebtSchema)).max(64),
  abandonment: stamped(AbandonGamblingSchema).optional() }).strict()
export const XgeGamblingStateSchema = z.object({ version: z.literal(1), weeks: z.array(Week).max(64) }).strict()
export type GamblingWeek = z.infer<typeof Week>
export type GamblingSource = z.infer<typeof Source>
export function gamblingCheckInput(input: z.infer<typeof ResolveGamblingSchema>, index: number) {
  const check = GAMBLING_CHECKS[index]
  if (!check) return undefined
  if (input.gamingSet?.replaceSkills.includes(check.skill))
    return { ability: check.ability, label: check.label, skill: undefined, toolId: input.gamingSet.equipmentId }
  return { ...check, toolId: undefined }
}
export const gamblingWitness = groundGearPhysicalWitness
export const gamblingDay = (time: number) => Math.floor(time / 86400)
export const validGamblingStake = (cp: number) => cp >= 1000 && cp <= 100000 && cp % 2 === 0
export const gamblingReturn = (stakeCp: number, wins: number) => [0, stakeCp / 2, stakeCp * 1.5, stakeCp * 2][wins]
export function gamblingDebtBalance(week: GamblingWeek) {
  return (week.resolution?.outcome?.debtCp ?? 0) - week.payments.reduce((sum, entry) => sum + copperValue(entry.input.paid), 0)
}
export const openGamblingWeek = (state: GameState) => state.dmTools?.xgeGambling?.weeks.find(week =>
  !week.abandonment && !week.resolution?.outcome)

export function gamblingReceiptWitness(receipt: { command: string }) {
  const { command: _, ...body } = receipt
  return gamblingWitness(body)
}

function witnessMatches(receipt: { command: string }) {
  return receipt.command === gamblingReceiptWitness(receipt)
}

function diceMatch(roll: z.infer<typeof Roll>, count: number, sides: number, modifier = 0) {
  return roll.notation === `${count}d${sides}${modifier ? '+' + modifier : ''}` && roll.rolls.length === count
    && roll.modifier === modifier && roll.rolls.every(face => face >= 1 && face <= sides)
    && roll.total === roll.rolls.reduce((total, face) => total + face, modifier)
}

export function validateXgeGamblingState(state: GameState) {
  const weeks = state.dmTools?.xgeGambling?.weeks ?? []
  const issues: string[] = [], events = new Set<string>()
  const time = state.worldTimeSeconds ?? 0
  let open = 0, heldWeek: GamblingWeek | undefined
  for (const week of weeks) {
    const { start, segments, resolution, settlement, payments, abandonment } = week
    const venue = start.venueFact
    const stake = copperValue(start.input.paid)
    if (!validGamblingStake(stake) || venue.id !== start.input.venueFactId || venue.source !== 'record_scene_fact'
      || venue.expires !== 'never' || venue.clueId || venue.subjectItemId || venue.mapId !== start.site.mapId || venue.roomId !== start.site.roomId
      || gamblingWitness((venue.narrativeEffect as { cell?: unknown } | undefined)?.cell) !== gamblingWitness(start.site.cell))
      issues.push('The stake needs valid source denominations and the original public local gambling venue.')
    for (const event of [start, ...segments, settlement, ...payments, abandonment]) {
      if (!event) continue
      const when = 'from' in event ? event.from : event.at
      if (when > time || when < start.at || events.has(event.input.eventId) || !witnessMatches(event)
        || 'weekId' in event.input && event.input.weekId !== start.input.eventId)
        issues.push('Each gambling receipt must retain its original event, stake, venue, clock and workweek.')
      events.add(event.input.eventId)
    }
    for (const [i, segment] of segments.entries()) {
      if (segment.day !== gamblingDay(segment.from) || segment.to !== segment.from + GAMBLING_DAY_SECONDS
        || segment.to > (segment.day + 1) * 86400 || segment.to > time || segment.day > segments[0].day + 9
        || i > 0 && segment.day <= segments[i - 1].day)
        issues.push('A gambling workweek needs five distinct actual eight-hour blocks within its supported span.')
    }
    const end = segments.at(-1)?.to ?? start.at
    if (abandonment && (segments.length === 5 || abandonment.at < end || resolution))
      issues.push('Abandonment cannot erase a completed workweek, a retained result or later effort.')
    if (!abandonment && !resolution?.outcome) open++
    if (!resolution) {
      if (settlement || payments.length) issues.push('Gambling transfers require an actual resolved outcome.')
      continue
    }
    const { input, at, dcs, checks, outcome, heldWitness, setFact } = resolution
    const set = input.gamingSet
    if (set ? !setFact || setFact.id !== set.factId || setFact.source !== 'record_scene_fact'
      || setFact.mapId !== start.site.mapId || setFact.roomId !== start.site.roomId
      || gamblingWitness((setFact.narrativeEffect as { cell?: unknown } | undefined)?.cell) !== gamblingWitness(start.site.cell)
      || new Set(set.replaceSkills).size !== set.replaceSkills.length : Boolean(setFact))
      issues.push('A substituted gaming set needs the original choice of checks and actual local game fact.')
    if (segments.length !== 5 || at < end || at > time || input.weekId !== start.input.eventId || events.has(input.eventId)
      || !witnessMatches(resolution) || dcs.some(roll => !diceMatch(roll, 2, 10, 5))
      || checks.some((check, index) => check.label !== GAMBLING_CHECKS[index].label || check.ability !== GAMBLING_CHECKS[index].ability
        || (set?.replaceSkills.includes(GAMBLING_CHECKS[index].skill) && (!check.proficient || check.expertise))
        || check.dc !== dcs[index].total || check.success !== (check.roll.total >= check.dc)))
      issues.push('The result needs the original ordered skill checks and three separately rolled DCs.')
    events.add(input.eventId)
    if (!outcome) {
      if (!heldWitness || heldWeek || checks.length >= 3 || settlement || payments.length)
        issues.push('An unfinished gambling resolution must keep its single original held check.')
      heldWeek = week
      continue
    }
    const successes = checks.filter(check => check.success).length
    if (heldWitness || checks.length !== 3 || successes !== outcome.successes
      || outcome.returnCp !== gamblingReturn(stake, successes) || outcome.debtCp !== (successes === 0 ? stake : 0)
      || !diceMatch(outcome.chance, 1, 100) || Boolean(outcome.example) !== (outcome.chance.total <= 10)
      || outcome.example && (!diceMatch(outcome.example.roll, 1, 6) || outcome.example.text !== start.source.examples[outcome.example.roll.total - 1]))
      issues.push('Retain the exact successes, gross return/debt, and one original source complication roll and example.')
    if (settlement && (!outcome.returnCp || copperValue(settlement.input.received) !== outcome.returnCp || settlement.at < at)
      || payments.some(entry => entry.input.creditorId !== start.input.creditorId || copperValue(entry.input.paid) <= 0 || entry.at < at)
      || gamblingDebtBalance(week) < 0 || payments.length === 64 && gamblingDebtBalance(week) !== 0)
      issues.push('Gambling coins must settle exactly once or pay the original creditor without exceeding the debt.')
  }
  if (open > 1) issues.push('Only one unfinished gambling workweek is represented.')
  const pending = state.hero?.pending
  const continuation = pending?.command.toolkitResolution as { domain?: string; command?: { weekId?: string } } | undefined
  if (heldWeek || continuation?.domain === GAMBLING_CHECK_DOMAIN) {
    const resolution = heldWeek?.resolution, index = resolution?.checks.length ?? 0
    const check = pending?.command.result as { entityId?: string; ability?: string; dc?: number; label?: string } | undefined
    if (!resolution || continuation?.domain !== GAMBLING_CHECK_DOMAIN || continuation.command?.weekId !== heldWeek?.start.input.eventId
      || pending?.command.type !== 'check' || check?.entityId !== 'player' || check?.ability !== GAMBLING_CHECKS[index]?.ability
      || check?.dc !== resolution.dcs[index]?.total || check?.label !== GAMBLING_CHECKS[index]?.label
      || resolution.heldWitness !== gamblingWitness(pending))
      issues.push('The original gambling check and reaction window must survive together.')
  }
  return weeks.length ? [...new Set([...issues, ...sharedDowntimeIntervalIssues(state)])] : issues
}
