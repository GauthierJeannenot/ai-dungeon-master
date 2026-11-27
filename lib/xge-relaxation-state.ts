import { z } from 'zod'
import type { GameState } from './types'
import { CoinsSchema, copperValue } from './srd/currency'
import { sharedDowntimeIntervalIssues } from './downtime-ledger'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'

const Id = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_:.-]*$/)
const Note = z.string().trim().min(1).max(600)
const Time = z.number().int().nonnegative()
const Cell = z.object({ x: z.number().int(), y: z.number().int() }).strict()
const Site = z.object({ mapId: Id, roomId: Id, cell: Cell, zFeet: z.number().finite() }).strict()
const Source = z.object({ book: z.enum(['xge','phb-2014']), sectionId: z.string(), sha256: z.string(),
  startLine: Time, endLine: Time }).strict()
export const RELAX_DAY_SECONDS = 86400
export const RELAX_HOURS_SECONDS = 28800
export const RELAX_DAYS = 7
export const RELAX_RATE_CP = { modest: 100, comfortable: 200, wealthy: 400 } as const

export const StartRelaxationSchema = z.object({
  eventId: Id, siteFactId: Id, explicitlyAdopted: z.literal(true), actualLifestyleAvailable: z.literal(true),
  lifestyle: z.enum(['modest', 'comfortable', 'wealthy']), paid: CoinsSchema,
}).strict()
export const AdvanceRelaxationSchema = z.object({
  eventId: Id, weekId: Id, seconds: z.number().int().min(1).max(RELAX_HOURS_SECONDS), activitySource: Note,
}).strict()
export const FinishRelaxationSchema = z.object({
  eventId: Id, weekId: Id, outcome: z.enum(['decline_benefit','release_pale_tincture_block','abandon']),
  afflictionId: z.string().min(1).max(180).optional(), reason: Note,
}).strict()

const Start = z.object({
  input: StartRelaxationSchema, at: Time, day: Time, site: Site,
  siteFact: z.record(z.string(), z.unknown()), sources: z.tuple([Source,Source]),
  paidCp: Time, command: z.string(),
}).strict()
const Segment = z.object({
  input: AdvanceRelaxationSchema, from: Time, to: Time, day: Time, restId: z.string().optional(), command: z.string(),
}).strict()
const Finish = z.object({
  input: FinishRelaxationSchema, at: Time, releasedDamage: Time, command: z.string(),
}).strict()
const Week = z.object({ start: Start, segments: z.array(Segment).max(512), finish: Finish.optional() }).strict()
export const RelaxationStateSchema = z.object({ version: z.literal(1), weeks: z.array(Week).max(64) }).strict()
export type RelaxationWeek = z.infer<typeof Week>

export const relaxationDay = (time: number) => Math.floor(time / RELAX_DAY_SECONDS)
export const relaxationWitness = witness
export function relaxationSeconds(week: RelaxationWeek, day: number) {
  return week.segments.filter(segment => segment.day === day).reduce((sum, segment) => sum + segment.input.seconds, 0)
}
export function relaxationDays(week: RelaxationWeek) {
  return Array.from({ length: RELAX_DAYS }, (_, index) => week.start.day + index)
    .filter(day => relaxationSeconds(week, day) === RELAX_HOURS_SECONDS)
}
export function openRelaxation(state: GameState) {
  return state.dmTools?.xgeRelaxation?.weeks.find(week => !week.finish)
}

export function validateRelaxationState(state: GameState) {
  const weeks = state.dmTools?.xgeRelaxation?.weeks ?? []
  const markers = Object.values(state.dmTools?.afflictions?.records ?? {}).filter(record => record.relaxationHealingRelease)
  if (!weeks.length && !markers.length) return []
  const issues: string[] = [], seen = new Set<string>(), released = new Set<string>()
  let previousEnd = 0
  const clock = state.worldTimeSeconds ?? 0
  const rests = state.dmTools?.rests
  function validEvent<T extends { input: { eventId: string }; command: string }>(event: T) {
    const { command, ...data } = event
    const id = event.input.eventId
    const valid = !seen.has(id) && command === witness(data)
    seen.add(id)
    return valid
  }
  for (const [index, week] of weeks.entries()) {
    const { start, segments, finish } = week, { site, siteFact } = start
    const factCell = (siteFact.narrativeEffect as { cell?: unknown } | undefined)?.cell
    if (!validEvent(start) || start.at < previousEnd || start.at > clock || start.day !== relaxationDay(start.at)
      || (start.day + 1) * RELAX_DAY_SECONDS - start.at < RELAX_HOURS_SECONDS
      || start.paidCp !== copperValue(start.input.paid) || start.paidCp !== RELAX_DAYS * RELAX_RATE_CP[start.input.lifestyle]
      || siteFact.id !== start.input.siteFactId || siteFact.mapId !== site.mapId || siteFact.roomId !== site.roomId
      || siteFact.expires !== 'never' || siteFact.clueId || siteFact.subjectItemId || witness(factCell) !== witness(site.cell))
      issues.push('Relaxation must retain the exact chosen paid lifestyle, local site and actual first day.')
    let cursor = start.at
    const secondsByDay = new Map<number, number>()
    for (const segment of segments) {
      const day = relaxationDay(segment.from)
      const sum = (secondsByDay.get(day) ?? 0) + segment.input.seconds
      if (!validEvent(segment) || segment.input.weekId !== start.input.eventId || segment.from < cursor
        || segment.to !== segment.from + segment.input.seconds || segment.day !== day || segment.to > clock
        || day < start.day || day >= start.day + RELAX_DAYS || segment.to > (day + 1) * RELAX_DAY_SECONDS
        || sum > RELAX_HOURS_SECONDS || day > start.day && secondsByDay.get(day - 1) !== RELAX_HOURS_SECONDS)
        issues.push('Relaxation segments must retain their actual consecutive dates and measured intervals.')
      if (segment.restId) {
        const receipt = rests && Object.hasOwn(rests.receipts, segment.restId) ? rests.receipts[segment.restId] : undefined
        const session = rests?.active?.restId === segment.restId ? rests.active : receipt?.session
        if (!session?.segments.some(activity => activity.from === segment.from && activity.to === segment.to
            && activity.activity === 'light' && activity.reason === segment.input.activitySource))
          issues.push('Relaxation within a rest requires its original measured light activity segment.')
      }
      secondsByDay.set(day, sum)
      cursor = segment.to
    }
    if (finish) {
      const { input, releasedDamage } = finish
      const release = input.outcome === 'release_pale_tincture_block'
      const affliction = input.afflictionId ? state.dmTools?.afflictions?.records[input.afflictionId] : undefined
      const marker = affliction?.relaxationHealingRelease
      if (!validEvent(finish) || input.weekId !== start.input.eventId || finish.at < cursor || finish.at > clock
        || input.outcome !== 'abandon' && relaxationDays(week).length !== RELAX_DAYS
        || release && finish.at !== cursor || release !== (releasedDamage > 0) || release !== Boolean(input.afflictionId)
        || release && (!affliction || affliction.templateId !== 'pale_tincture' || affliction.targetId !== 'player'
          || affliction.appliedAt > finish.at || released.has(affliction.id) || marker?.weekId !== input.weekId
          || marker?.eventId !== input.eventId || marker?.at !== finish.at))
        issues.push('Relaxation must keep the chosen final outcome and exact nonmagical affliction provenance.')
      if (release && affliction) released.add(affliction.id)
    } else if (index !== weeks.length - 1) issues.push('Only the latest relaxation week may still be open.')
    previousEnd = finish?.at ?? cursor
  }
  if (markers.some(record => !released.has(record.id)))
    issues.push('A released Pale Tincture dose requires its original completed Relaxation week.')
  return [...new Set([...issues, ...sharedDowntimeIntervalIssues(state)])]
}
