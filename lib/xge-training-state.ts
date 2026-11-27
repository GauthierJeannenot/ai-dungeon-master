import { z } from 'zod'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'
import type { GameState } from './types'
import { sharedDowntimeIntervalIssues } from './downtime-ledger'
import { CoinsSchema, copperValue, emptyCoins } from './srd/currency'
import { trainingSubjectSupported, PERMISSION_TRAINING_LANGUAGES } from './training-state'

// Source arithmetic only. In particular, this does NOT invent a one-week floor
// or award knowledge when exceptional INT yields zero/nonpositive duration.
export function typicalXgeTrainingWorkweeks(intelligence: number): number {
  if (!Number.isSafeInteger(intelligence)) throw new Error('Actual finite safe-integer Intelligence required.')
  return 10 - Math.max(0, Math.floor((intelligence - 10) / 2))
}

export const XGE_TRAINING_SECONDS_PER_DAY = 28800
export const XGE_TRAINING_DAYS_PER_WORKWEEK = 5
export const XGE_TRAINING_WEEK_PRICE_CP = 2500
export const XGE_TRAINING_COMPLICATION_WORKWEEKS = 10
export const xgeTrainingDay = (at: number) => Math.floor(at / 86400)
export const xgeTrainingWitness = (operation: string, data: unknown) => groundGearPhysicalWitness({ operation, data })

const Id = z.string().min(1).max(100).refine(id => !['__proto__', 'prototype', 'constructor'].includes(id))
const Value = z.record(z.string(), z.unknown())
const Time = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
const Day = z.number().int().nonnegative().max(Math.floor(Number.MAX_SAFE_INTEGER / 86400) - 1000)
const Text = z.string().trim().min(1).max(1000)
const Cell = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()
export const AdoptXgeTrainingSchema = z.object({
  eventId: Id, decisionFactId: Id, explicitlyAdopted: z.literal(true),
  initialIntelligenceConventionConfirmed: z.literal(true),
  prepaidBlockWithoutAutomaticProrataOrRefundConfirmed: z.literal(true),
  refuseNonpositiveDurationConventionConfirmed: z.literal(true),
}).strict()
export const XgeTrainingSourceSchema = z.object({
  book: z.literal('xge'), sectionId: z.string(), sha256: z.string(),
  foundationStartLine: z.number().int(), foundationEndLine: z.number().int(),
  startLine: z.number().int(), endLine: z.number().int(),
}).strict()

const InstructorFields = {
  instructorId: Id, teachingFactId: Id, actualQualifiedInstructorConfirmed: z.literal(true),
  actualWillingInstructorConfirmed: z.literal(true), practiceToolItemId: Id.optional(),
  actualPracticeToolAvailableConfirmed: z.literal(true).optional(), languagePermissionFactId: Id.optional(),
  actualLanguagePermissionConfirmed: z.literal(true).optional(),
}
export const StartXgeTrainingSchema = z.object({
  eventId: Id, courseId: Id, kind: z.enum(['language', 'tool']), subjectId: Id,
  actualCourseConventionsConfirmed: z.literal(true), ...InstructorFields,
}).strict()
export const WorkXgeTrainingSchema = z.object({
  eventId: Id, courseId: Id, activity: z.enum(['instruction', 'instructor_search']),
  seconds: z.number().int().min(1).max(28800), paid: CoinsSchema.optional(),
  practiceToolItemId: Id.optional(), actualLessonConfirmed: z.literal(true).optional(),
  searchComplicationId: Id.optional(), searchFactId: Id.optional(), actualSearchConfirmed: z.literal(true).optional(),
  restActivity: z.enum(['light', 'strenuous']), activitySource: Text,
}).strict()
export const ResolveXgeTrainingComplicationSchema = z.object({
  eventId: Id, courseId: Id, selection: z.enum(['roll', 'choose']),
  chosenRow: z.number().int().min(1).max(6).optional(), selectionFactId: Id.optional(),
}).strict()
const Rival = { rivalId: Id.optional(), rivalFactId: Id.optional() }
export const AdjudicateXgeTrainingSchema = z.discriminatedUnion('kind', [
  z.object({ eventId: Id, courseId: Id, kind: z.literal('complication'), complicationId: Id,
    decisionFactId: Id, actualConsequenceConfirmed: z.literal(true),
    actualInstructorServiceUnavailableConfirmed: z.literal(true).optional(), ...Rival }).strict(),
  z.object({ eventId: Id, courseId: Id, kind: z.literal('delay'), decisionFactId: Id,
    newDeadlineDay: Day, extraComplication: z.number().int().min(1).max(6), extraComplicationFactId: Id,
    paid: CoinsSchema, expenseRecipientId: Id.optional(), actualDiscretionaryDecisionConfirmed: z.literal(true),
    actualInstructorServiceUnavailableConfirmed: z.literal(true).optional(), ...Rival }).strict(),
])
export const ReplaceXgeInstructorSchema = z.object({
  eventId: Id, courseId: Id, ...InstructorFields, actualNextFeesRecipientConfirmed: z.literal(true),
  honoredAlreadyPaidBlockConfirmed: z.literal(true).optional(), complicationId: Id.optional(),
}).strict()
export const ManageXgeTrainingSchema = z.object({
  eventId: Id, courseId: Id, operation: z.enum(['pause', 'resume', 'abandon']), reason: Text,
}).strict()
export const CompleteXgeTrainingSchema = z.object({ eventId: Id, courseId: Id }).strict()
const Teacher = z.object({
  identity: z.string(), npc: Value, teachingFact: Value, permissionFact: Value.optional(),
  practiceItem: Value.optional(),
}).strict()
const Location = z.object({
  mapId: Id, roomId: Id, learnerCell: Cell, learnerZFeet: z.number().finite(),
  instructorCell: Cell.optional(), instructorZFeet: z.number().finite().optional(),
}).strict()
const Base = { id: Id, sequence: z.number().int().positive(), at: Time, command: z.string() }
const Money = z.object({ coins: CoinsSchema, recipientId: Id, weekIndex: z.number().int().nonnegative() }).strict()
const StartEvent = z.object({ ...Base, operation: z.literal('start'), input: StartXgeTrainingSchema,
  payload: z.object({ intelligenceAtStart: z.number().int(), requiredWeeks: z.number().int().min(1).max(10),
    adoptionCommand: z.string(), knowledgeInitiallyAbsent: z.literal(true), teacher: Teacher }).strict() }).strict()
const WorkEvent = z.object({ ...Base, operation: z.literal('work'), input: WorkXgeTrainingSchema,
  payload: z.object({ startEventId: Id, from: Time, to: Time, day: Day, location: Location,
    agreementEventId: Id, instructorId: Id.optional(), payment: Money.optional(),
    practiceItem: Value.optional(), searchFact: Value.optional() }).strict() }).strict()
const ChanceEvent = z.object({ ...Base, operation: z.literal('chance'), input: ResolveXgeTrainingComplicationSchema,
  payload: z.object({ startEventId: Id, thresholdDays: z.number().int().positive(), thresholdDay: Day,
    agreementEventId: Id, occurrence: Value, tableRoll: Value.optional(), selectionFact: Value.optional() }).strict() }).strict()
const JudgmentEvent = z.object({ ...Base, operation: z.literal('adjudicate'), input: AdjudicateXgeTrainingSchema,
  payload: z.object({ startEventId: Id, agreementEventId: Id, fact: Value, extraFact: Value.optional(),
    expenseRecipient: Value.optional(), rival: Value.optional(), rivalFact: Value.optional() }).strict() }).strict()
const ReplaceEvent = z.object({ ...Base, operation: z.literal('replace'), input: ReplaceXgeInstructorSchema,
  payload: z.object({ startEventId: Id, teacher: Teacher }).strict() }).strict()
const ManageEvent = z.object({ ...Base, operation: z.literal('manage'), input: ManageXgeTrainingSchema,
  payload: z.object({ startEventId: Id, previousStatus: z.enum(['active', 'paused', 'abandoned']),
    nextStatus: z.enum(['active', 'paused', 'abandoned']) }).strict() }).strict()
const CompleteEvent = z.object({ ...Base, operation: z.literal('complete'), input: CompleteXgeTrainingSchema,
  payload: z.object({ startEventId: Id, kind: z.enum(['language', 'tool']), subjectId: Id,
    instructionDays: z.number().int().positive(), acquired: z.literal(true) }).strict() }).strict()
export const XgeTrainingEventSchema = z.discriminatedUnion('operation', [StartEvent, WorkEvent, ChanceEvent, JudgmentEvent, ReplaceEvent, ManageEvent, CompleteEvent])
export const XgeTrainingStateSchema = z.object({
  version: z.literal(1),
  adoption: z.object({ input: AdoptXgeTrainingSchema, at: Time, fact: Value, source: XgeTrainingSourceSchema,
    clockBasis: z.literal('engine_epoch_0_86400_seconds'), command: z.string() }).strict(),
  events: z.array(XgeTrainingEventSchema).max(8192),
  receipts: z.record(z.string(), z.object({ command: z.string(), at: Time, result: Value, witness: z.string() }).strict()),
}).strict()
export type XgeTrainingState = z.infer<typeof XgeTrainingStateSchema>
export type XgeTrainingEvent = z.infer<typeof XgeTrainingEventSchema>
export type XgeTrainingCourse = {
  start: z.infer<typeof StartEvent>; work: z.infer<typeof WorkEvent>[];
  chance: z.infer<typeof ChanceEvent>[]; judgments: z.infer<typeof JudgmentEvent>[];
  agreements: Array<z.infer<typeof StartEvent> | z.infer<typeof ReplaceEvent>>;
  lifecycle: z.infer<typeof ManageEvent>[]; completion?: z.infer<typeof CompleteEvent>;
  status: 'active' | 'paused' | 'abandoned' | 'completed';
}
export type TrainingComplication = { id: string; row: number; at: number; origin: 'chance' | 'delay'; agreementEventId: string }
export const eventCommand = (event: Omit<XgeTrainingEvent, 'command'>) => xgeTrainingWitness('event', event)
export function xgeTrainingCourses(data: XgeTrainingState | undefined): Record<string, XgeTrainingCourse> {
  const courses: Record<string, XgeTrainingCourse> = {}
  for (const e of data?.events ?? []) {
    if (e.operation === 'start') courses[e.input.courseId] = { start: e, work: [], chance: [], judgments: [], agreements: [e], lifecycle: [], status: 'active' }
    else {
      const c = courses[e.input.courseId]; if (!c) continue
      if (e.operation === 'work') c.work.push(e)
      else if (e.operation === 'chance') c.chance.push(e)
      else if (e.operation === 'adjudicate') c.judgments.push(e)
      else if (e.operation === 'replace') c.agreements.push(e)
      else if (e.operation === 'manage') { c.lifecycle.push(e); c.status = e.payload.nextStatus }
      else { c.completion = e; c.status = 'completed' }
    }
  }
  return courses
}
function qualifiedDays(events: z.infer<typeof WorkEvent>[]) {
  const totals = new Map<number, number>()
  for (const e of events) totals.set(e.payload.day, (totals.get(e.payload.day) ?? 0) + e.input.seconds)
  return [...totals].filter(([, seconds]) => seconds === 28800).map(([day]) => day).sort((a, b) => a - b)
}
export const xgeInstructionDays = (c: XgeTrainingCourse, until = Infinity) => qualifiedDays(c.work.filter(e => e.input.activity === 'instruction' && e.at <= until))
export const xgeSearchDays = (c: XgeTrainingCourse, id: string) => qualifiedDays(c.work.filter(e => e.input.activity === 'instructor_search' && e.input.searchComplicationId === id))
export const xgeCurrentAgreement = (c: XgeTrainingCourse) => c.agreements[c.agreements.length - 1]
export function xgeComplications(c: XgeTrainingCourse): TrainingComplication[] {
  return [
    ...c.chance.filter(e => Number(e.payload.occurrence.total) <= 10).map(e => ({ id: e.id, row: e.input.selection === 'choose' ? e.input.chosenRow! : Number(e.payload.tableRoll?.total), at: e.at, origin: 'chance' as const, agreementEventId: e.payload.agreementEventId })),
    ...c.judgments.filter(e => e.input.kind === 'delay').map(e => ({ id: e.id, row: e.input.kind === 'delay' ? e.input.extraComplication : 0, at: e.at, origin: 'delay' as const, agreementEventId: e.payload.agreementEventId })),
  ].sort((a, b) => a.at - b.at)
}
export const xgeUndecidedComplications = (c: XgeTrainingCourse) => xgeComplications(c).filter(comp => comp.origin === 'chance' && !c.judgments.some(e => e.input.kind === 'complication' && e.input.complicationId === comp.id))
export const xgeSearchDebt = (c: XgeTrainingCourse) => xgeComplications(c).find(comp => comp.row === 1 && !xgeUndecidedComplications(c).some(u => u.id === comp.id) && !c.agreements.some(e => e.operation === 'replace' && e.input.complicationId === comp.id))
export function xgeGlobalInstructionDays(data: XgeTrainingState | undefined) {
  return qualifiedDays((data?.events ?? []).filter((e): e is z.infer<typeof WorkEvent> => e.operation === 'work' && e.input.activity === 'instruction'))
}
export function xgeTrainingChanceDue(data: XgeTrainingState | undefined) {
  const count = (data?.events ?? []).filter(e => e.operation === 'chance').length
  const days = xgeGlobalInstructionDays(data), thresholdDays = (count + 1) * 50, thresholdDay = days[thresholdDays - 1]
  if (thresholdDay === undefined) return null
  const owner = (data?.events ?? []).filter((e): e is z.infer<typeof WorkEvent> => e.operation === 'work' && e.input.activity === 'instruction' && e.payload.day === thresholdDay).at(-1)!
  return { thresholdDays, thresholdDay, courseId: owner.input.courseId, agreementEventId: owner.payload.agreementEventId }
}
export function xgeTrainingPhase(data: XgeTrainingState, c: XgeTrainingCourse) {
  if (c.status === 'completed') return 'completed'
  const due = xgeTrainingChanceDue(data)
  if (due) return due.courseId === c.start.input.courseId ? 'complication_due' : 'other_complication_due'
  if (xgeUndecidedComplications(c).length) return 'adjudication_due'
  const search = xgeSearchDebt(c)
  if (search) return xgeSearchDays(c, search.id).length < 5 ? 'instructor_search' : 'replacement_due'
  return xgeInstructionDays(c).length >= c.start.payload.requiredWeeks * 5 ? 'completion_due' : 'instruction'
}
export function xgeTrainingDeadline(c: XgeTrainingCourse) {
  const latest = c.judgments.filter(e => e.input.kind === 'delay').at(-1)
  return latest?.input.kind === 'delay' ? latest.input.newDeadlineDay : c.work[0] ? c.work[0].payload.day + 2 * c.start.payload.requiredWeeks * 5 - 1 : null
}
export function xgeTrainingIntervals(state: GameState) {
  return (state.dmTools?.xgeTraining?.events ?? []).filter((e): e is z.infer<typeof WorkEvent> => e.operation === 'work').map(e => ({ from: e.payload.from, to: e.payload.to, day: e.payload.day, domain: 'xge_training', id: e.input.courseId }))
}
export function protectedXgeTrainingFactIds(state: GameState) {
  return [...new Set(Object.values(xgeTrainingCourses(state.dmTools?.xgeTraining)).filter(c => ['active', 'paused'].includes(c.status)).flatMap(c => {
    const a = xgeCurrentAgreement(c); return [a.input.teachingFactId, ...a.input.languagePermissionFactId ? [a.input.languagePermissionFactId] : []]
  }))]
}
export function xgeTrainingMoney(data: XgeTrainingState) {
  const instruction: Record<string, ReturnType<typeof emptyCoins>> = {}, discretionary: Record<string, ReturnType<typeof emptyCoins>> = {}
  for (const e of data.events) {
    const payment = e.operation === 'work' ? e.payload.payment : undefined
    const recipient = payment?.recipientId ?? (e.operation === 'adjudicate' && e.input.kind === 'delay' ? e.input.expenseRecipientId : undefined)
    const coins = payment?.coins ?? (e.operation === 'adjudicate' && e.input.kind === 'delay' ? e.input.paid : undefined)
    if (!recipient || !coins) continue
    const bucket = (payment ? instruction : discretionary)[recipient] ??= emptyCoins()
    for (const key of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) bucket[key] += coins[key]
  }
  return { instruction, discretionary }
}

function factIsDurable(fact: Record<string, unknown> | undefined, id: string | undefined) { return Boolean(fact && fact.id === id && fact.expires === 'never' && !fact.subjectItemId) }
function canonicalEvent(e: XgeTrainingEvent) { const { command: _command, ...body } = e; return eventCommand(body) }
export function validateXgeTrainingState(state: GameState): string[] {
  const d = state.dmTools?.xgeTraining; if (!d) return []
  if (!XgeTrainingStateSchema.safeParse(d).success) return ['Invalid optional XGE Training event/source registry.']
  const issues: string[] = [], at = state.worldTimeSeconds ?? 0, a = d.adoption
  if (a.command !== xgeTrainingWitness('adopt', { input: a.input, at: a.at, fact: a.fact, source: a.source, clockBasis: a.clockBasis }) || a.at > at || a.fact.id !== a.input.decisionFactId) issues.push('Original explicit XGE adoption/conventions/source must survive first SQL.')
  const expected = new Map<string, { operation: string; input: unknown; at: number }>([[a.input.eventId, { operation: 'adopt', input: a.input, at: a.at }]])
  const prefix: XgeTrainingState = { ...d, events: [] }
  for (const [index, e] of d.events.entries()) {
    if (e.sequence !== index + 1 || e.id !== e.input.eventId || expected.has(e.id) || e.command !== canonicalEvent(e) || e.at > at || e.at < (prefix.events.at(-1)?.at ?? a.at)) issues.push('Retain each original event command, order, actual time and unique identity.')
    const courses = xgeTrainingCourses(prefix), c = courses[e.input.courseId]
    if (e.operation === 'start') {
      if (c || Object.values(courses).some(c => ['active', 'paused'].includes(c.status) || c.start.input.kind === e.input.kind && c.start.input.subjectId === e.input.subjectId) || !trainingSubjectSupported(e.input.kind, e.input.subjectId) || e.payload.requiredWeeks !== typicalXgeTrainingWorkweeks(e.payload.intelligenceAtStart) || e.payload.adoptionCommand !== a.command) issues.push('One original actual course retains its subject, initial INT, duration and adopted conventions; no aliases/free nonpositive course.')
    } else if (!c || e.payload.startEventId !== c.start.id) issues.push('An actual retained course/start event is required before this operation.')
    if (c) {
      const phase = xgeTrainingPhase(prefix, c), agreement = xgeCurrentAgreement(c)
      if (e.operation === 'work') {
        const s = e.payload, beforeDays = xgeInstructionDays(c), week = Math.floor(beforeDays.length / 5)
        if (c.status !== 'active' || s.to !== e.at || s.to - s.from !== e.input.seconds || s.from < c.start.at || s.day !== xgeTrainingDay(s.from) || s.to > (s.day + 1) * 86400 || s.agreementEventId !== agreement.id || (xgeTrainingDeadline(c) !== null && s.day > xgeTrainingDeadline(c)!)) issues.push('Every original actual effort belongs to one engine date and original teacher/course; overdue work requires explicit arbitration.')
        if (e.input.activity === 'instruction') {
          const paid = c.work.some(q => q.payload.payment?.weekIndex === week)
          if (phase !== 'instruction' || !e.input.actualLessonConfirmed || e.input.searchComplicationId || e.input.searchFactId || e.input.actualSearchConfirmed || s.instructorId !== agreement.input.instructorId || !s.location.instructorCell || s.location.instructorZFeet === undefined) issues.push('Only a real explicitly taught lesson with the actual current instructor qualifies instruction.')
          if (!paid ? !s.payment || s.payment.weekIndex !== week || s.payment.recipientId !== agreement.input.instructorId || copperValue(s.payment.coins) !== 2500 || xgeTrainingWitness('coins', s.payment.coins) !== xgeTrainingWitness('coins', e.input.paid) : Boolean(s.payment) || e.input.paid !== undefined && copperValue(e.input.paid) > 0) issues.push('Exactly25gp chosen denominations before the block first effort, never a second debit, prorata or implicit refund.')
          if (c.start.input.kind === 'tool' ? !s.practiceItem || (s.practiceItem.equipmentId ?? s.practiceItem.id) !== c.start.input.subjectId : Boolean(s.practiceItem) || e.input.practiceToolItemId !== undefined) issues.push('Only the actual matching practice kit supports tool training; language training creates/selects no kit.')
        } else {
          const search = xgeSearchDebt(c)
          if (phase !== 'instructor_search' || !search || e.input.searchComplicationId !== search.id || !e.input.actualSearchConfirmed || !factIsDurable(s.searchFact, e.input.searchFactId) || e.input.paid !== undefined || s.payment || s.instructorId || s.practiceItem || e.input.actualLessonConfirmed || e.input.practiceToolItemId) issues.push('Source replacement search needs five actual8hour dates, exact cause and fact; no lesson/fee/proficiency inferred.')
        }
      } else if (e.operation === 'chance') {
        const due = xgeTrainingChanceDue(prefix), p = e.payload, chance = Number(p.occurrence.total), table = Number(p.tableRoll?.total)
        if (!due || due.courseId !== e.input.courseId || due.thresholdDays !== p.thresholdDays || due.thresholdDay !== p.thresholdDay || due.agreementEventId !== p.agreementEventId || !Number.isInteger(chance) || chance < 1 || chance > 100 || p.occurrence.notation !== '1d100') issues.push('Each actual ten instruction workweeks has one original10percent occurrence roll, global across courses.')
        if (e.input.selection === 'choose' ? e.input.chosenRow === undefined || !factIsDurable(p.selectionFact, e.input.selectionFactId) || p.tableRoll !== undefined : e.input.chosenRow !== undefined || e.input.selectionFactId !== undefined || p.selectionFact !== undefined || chance <= 10 && (!Number.isInteger(table) || table < 1 || table > 6) || chance > 10 && p.tableRoll !== undefined) issues.push('Keep the separate actual occurrence and actual table roll or explicit MJ selection; never Inspiration/reroll.')
      } else if (e.operation === 'adjudicate') {
        const input = e.input, p = e.payload
        if (['completed', 'abandoned'].includes(c.status) || p.fact.id !== input.decisionFactId || p.agreementEventId !== agreement.id) issues.push('Actual unfinished course and original MJ decision/teacher are required.')
        let row = 0
        if (input.kind === 'complication') {
          const comp = xgeUndecidedComplications(c).find(q => q.id === input.complicationId); row = comp?.row ?? 0
          if (!comp || p.extraFact || p.expenseRecipient) issues.push('One actual source complication receives its one original explicit consequence decision.')
        } else {
          const deadline = xgeTrainingDeadline(c); row = input.extraComplication
          if (xgeInstructionDays(c).length>=c.start.payload.requiredWeeks*5&&!xgeSearchDebt(c)&&!xgeUndecidedComplications(c).some(q=>q.row===1)||deadline === null || xgeTrainingDay(e.at) <= deadline || input.newDeadlineDay < xgeTrainingDay(e.at) || input.newDeadlineDay > c.work[0].payload.day + 365 || !factIsDurable(p.extraFact, input.extraComplicationFactId) || (copperValue(input.paid) > 0 ? p.expenseRecipient?.id !== input.expenseRecipientId : p.expenseRecipient !== undefined || input.expenseRecipientId !== undefined)) issues.push('An actual delayed course retains the explicit extra consequence/new deadline and actually chosen payable cost, never a RAW invented tariff.')
          if (row === 1 && (xgeSearchDebt(c) || xgeUndecidedComplications(c).some(q => q.row === 1))) issues.push('No second unresolved disappearance is invented for the same unavailable instructor.')
        }
        if (row === 1 ? !input.actualInstructorServiceUnavailableConfirmed : input.actualInstructorServiceUnavailableConfirmed !== undefined) issues.push('Only the actual disappearance line explicitly establishes unavailable instruction before its real search.')
        if (Boolean(input.rivalId) !== Boolean(input.rivalFactId) || input.rivalId && (![1, 3].includes(row) || p.rival?.id !== input.rivalId || p.rivalFact?.id !== input.rivalFactId)) issues.push('Only source rival hooks use an existing real actor and actual prior rivalry fact.')
      } else if (e.operation === 'replace') {
        const search = xgeSearchDebt(c), week = Math.floor(xgeInstructionDays(c).length / 5), paid = c.work.some(q => q.payload.payment?.weekIndex === week)
        if (c.status === 'completed' || xgeTrainingChanceDue(prefix) || xgeUndecidedComplications(c).length || (search ? xgeSearchDays(c, search.id).length !== 5 || e.input.complicationId !== search.id : e.input.complicationId !== undefined) || e.input.instructorId === agreement.input.instructorId) issues.push('Replace only by the exact actual different qualified instructor after any real required search; never erase history or source debt.')
        if (paid ? !e.input.honoredAlreadyPaidBlockConfirmed : e.input.honoredAlreadyPaidBlockConfirmed !== undefined) issues.push('A replacement explicitly agrees to honor the already-paid remaining block; old coins never transfer between teachers.')
      } else if (e.operation === 'manage') {
        const status = e.input.operation === 'pause' ? 'paused' : e.input.operation === 'resume' ? 'active' : 'abandoned'
        if (c.status === 'completed' || e.payload.previousStatus !== c.status || e.payload.nextStatus !== status || e.input.operation === 'pause' && c.status !== 'active' || e.input.operation === 'resume' && (!['paused', 'abandoned'].includes(c.status) || Object.values(courses).some(q => q !== c && ['active', 'paused'].includes(q.status))) || e.input.operation === 'abandon' && (c.status === 'abandoned' || xgeInstructionDays(c).length >= c.start.payload.requiredWeeks * 5 || xgeUndecidedComplications(c).length || xgeSearchDebt(c) || xgeTrainingChanceDue(prefix)?.courseId === e.input.courseId)) issues.push('Explicit pause/resume/abandon retains original work, fees, INT, every global complication and source search; completed teaching still completes once.')
      } else if (e.operation === 'complete') {
        if (c.status !== 'active' || phase !== 'completion_due' || e.payload.kind !== c.start.input.kind || e.payload.subjectId !== c.start.input.subjectId || e.payload.instructionDays !== c.start.payload.requiredWeeks * 5) issues.push('One final proficiency requires all actual original instruction, paid blocks and source complications; never identity/level/kit changes.')
        const known = e.payload.kind === 'tool' ? state.player.toolProficiencies : state.player.languages
        if (!known?.includes(e.payload.subjectId)) issues.push('Actually learned knowledge must survive authoritative SQL hydration.')
      }
    }
    if (e.operation === 'start' || e.operation === 'replace') {
      const teacher = e.payload.teacher, input = e.input, kind = e.operation === 'start' ? e.input.kind : c?.start.input.kind
      const subject = e.operation === 'start' ? e.input.subjectId : c?.start.input.subjectId
      if (teacher.npc.id !== input.instructorId || !factIsDurable(teacher.teachingFact, input.teachingFactId)) issues.push('Actual teacher identity and durable nonsubject qualification survive from the first agreement.')
      const permission = kind === 'language' && (PERMISSION_TRAINING_LANGUAGES as readonly string[]).includes(subject ?? '')
      if (permission ? !input.actualLanguagePermissionConfirmed || !factIsDurable(teacher.permissionFact, input.languagePermissionFactId) : teacher.permissionFact !== undefined || input.languagePermissionFactId !== undefined || input.actualLanguagePermissionConfirmed !== undefined) issues.push('Exceptional language permission is an actual explicit durable fact, not a race/name inference.')
      if (kind === 'tool' ? !input.actualPracticeToolAvailableConfirmed || !teacher.practiceItem || (teacher.practiceItem.equipmentId ?? teacher.practiceItem.id) !== subject || teacher.practiceItem.id !== input.practiceToolItemId : teacher.practiceItem !== undefined || input.practiceToolItemId !== undefined || input.actualPracticeToolAvailableConfirmed !== undefined) issues.push('The original actual practice set does not appear from a payment or future proficiency.')
    }
    expected.set(e.id, { operation: e.operation, input: e.input, at: e.at }); prefix.events.push(e)
  }
  for (const [id, r] of Object.entries(d.receipts)) {
    const e = expected.get(id)
    if (!e || r.command !== xgeTrainingWitness(e.operation, e.input) || r.at !== e.at || r.witness !== groundGearPhysicalWitness({ command: r.command, at: r.at, result: r.result })) issues.push('Every original exact command/receipt remains linked before fees, progress or knowledge; no independent receipt forgery.')
  }
  if ([...expected.keys()].some(id => !d.receipts[id]) || expected.size > 8192) issues.push('No actual source event receipt is dropped or evicted.')
  const courses = xgeTrainingCourses(d)
  if (Object.keys(courses).length > 64 || Object.values(courses).filter(c => ['active', 'paused'].includes(c.status)).length > 1) issues.push('This bounded first tranche retains64courses and one unfinished course, even while paused.')
  for (const c of Object.values(courses)) {
    if (c.work.length > 4096 || c.judgments.length > 32 || c.agreements.length > 32 || c.lifecycle.length > 128 || xgeInstructionDays(c).length > c.start.payload.requiredWeeks * 5) issues.push('Bounded retained instruction history cannot overflow or create extra taught days.')
    if (['active', 'paused'].includes(c.status)) for (const fact of [xgeCurrentAgreement(c).payload.teacher.teachingFact, xgeCurrentAgreement(c).payload.teacher.permissionFact].filter(Boolean)) if (!state.worldFacts?.some(f => f.id === fact!.id && groundGearPhysicalWitness(f) === groundGearPhysicalWitness(fact))) issues.push('Retain current active durable teaching/permission qualification; public replacement must not strand acquired work.')
  }
  return [...new Set([...issues,...sharedDowntimeIntervalIssues(state)])]
}
