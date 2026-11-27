import { z } from 'zod'

const Id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
  .refine(value => !['constructor', 'prototype', '__proto__'].includes(value))
export const SURVIVAL_DAY_SECONDS = 86400
export const SurvivalBeginSchema = z.object({
  eventId: Id, operation: z.enum(['begin', 'resume_after_death']),
  standardNeedsConfirmed: z.literal(true), hotWeather: z.boolean(), source: z.string().trim().min(1).max(600),
  foodDebtHalfDays: z.number().int().min(0).max(20000).optional(),
  priorDeprivation: z.enum(['none', 'known', 'unknown']).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.operation === 'begin' && (input.foodDebtHalfDays === undefined || input.priorDeprivation === undefined))
    ctx.addIssue({ code: 'custom', message: 'Beginning requires explicit known food history and deprivation provenance; do not guess legacy history.' })
  if (input.operation === 'resume_after_death' && (input.foodDebtHalfDays !== undefined || input.priorDeprivation !== undefined))
    ctx.addIssue({ code: 'custom', message: 'Resuming preserves existing deprivation history; it cannot reset it.' })
})
export const ConsumeProvisionsSchema = z.object({ eventId: Id, poisonPortionAdjudicationId: Id.optional(),midnightAt:z.number().int().nonnegative().optional(), itemId: z.string().min(1).max(160), units: z.number().min(0.25).max(16).multipleOf(0.25) }).strict()
export const SurvivalDaySchema = z.object({
  eventId: Id, order: z.enum(['food_then_water', 'water_then_food']).optional(),
  nextHotWeather: z.boolean(), source: z.string().trim().min(1).max(600),
}).strict()
const Day = z.object({ index: z.number().int().nonnegative(), startsAt: z.number().nonnegative(),
  endsAt: z.number().nonnegative(), hotWeather: z.boolean(), foodHalfPounds: z.number().int().nonnegative(),
  waterPints: z.number().nonnegative().multipleOf(0.25) }).strict().refine(day => day.endsAt === day.startsAt + SURVIVAL_DAY_SECONDS,
  'A tracked nutrition day lasts exactly 24 hours.')
export const SurvivalStateSchema = z.object({
  version: z.literal(1), status: z.enum(['active', 'suspended']), startedAt: z.number().nonnegative(),
  source: z.string().trim().min(1).max(600), lastDeathAt: z.number().nonnegative().optional(),
  foodDebtHalfDays: z.number().int().min(0).max(20000), foodDebtAtLeast: z.boolean().optional(), priorDeprivation: z.enum(['none', 'known', 'unknown']),
  day: Day,
  recoveryIntake: z.object({ foodHalfPounds: z.number().int().nonnegative(), waterPints: z.number().nonnegative().multipleOf(0.25) }).strict(),
  provisions: z.record(z.string(), z.object({ kind: z.enum(['ration_1_day', 'waterskin_full']),
    remainingUnits: z.number().int().min(0).max(4) }).strict()),
  receipts: z.record(z.string(), z.object({ command: z.string(), result: z.record(z.string(), z.unknown()) }).strict()),
  pendingCombatRound: z.object({ round: z.number().int().positive(), dayIndex: z.number().int().nonnegative(), combatGeneration: z.number().int().nonnegative(), mapId: z.string().min(1) }).strict().optional(),
  pendingDay: z.object({ input: SurvivalDaySchema, dayIndex: z.number().int().nonnegative(),
    foodLevels: z.number().int().min(0).max(1), waterNeedsSave: z.boolean(), foodDebtAfter: z.number().int().min(0).max(20000), foodDebtAtLeastAfter: z.boolean().optional(),
    phases: z.array(z.enum(['food', 'water'])).length(2), phase: z.number().int().min(0).max(2),
    foodApplied: z.boolean(), waterApplied: z.boolean(), waterSaveSuccess: z.boolean().optional(),
    waterSave: z.record(z.string(), z.unknown()).optional(), exhaustionBefore: z.number().int().min(0).max(6),
  }).strict().optional(),
}).strict().superRefine((state, ctx) => {
  if (Object.keys(state.receipts).length > 512 || Object.keys(state.provisions).length > 256)
    ctx.addIssue({ code: 'custom', message: 'Nutrition histories are bounded and cannot evict old receipts.' })
  if (state.status === 'suspended' && state.lastDeathAt === undefined)
    ctx.addIssue({ code: 'custom', message: 'Suspension requires an actual engine death timestamp.' })
  if (state.foodDebtAtLeast && state.foodDebtHalfDays !== 20000)
    ctx.addIssue({ code: 'custom', message: 'A saturated deprivation lower bound must retain its 20000 half-day floor.' })
  if (state.pendingDay?.foodDebtAtLeastAfter && state.pendingDay.foodDebtAfter !== 20000)
    ctx.addIssue({ code: 'custom', message: 'A pending saturated deprivation floor must be 20000 half-days.' })
  if (state.pendingCombatRound && state.pendingCombatRound.dayIndex !== state.day.index)
    ctx.addIssue({ code: 'custom', message: 'A deferred combat round belongs to this exact unresolved nutrition day.' })
  if (state.pendingDay && state.pendingDay.dayIndex !== state.day.index)
    ctx.addIssue({ code: 'custom', message: 'A held daily event belongs to the exact active nutrition day.' })
})
export type SurvivalState = z.infer<typeof SurvivalStateSchema>
export type SurvivalBeginInput = z.infer<typeof SurvivalBeginSchema>
export type ConsumeProvisionsInput = z.infer<typeof ConsumeProvisionsSchema>
export type SurvivalDayInput = z.infer<typeof SurvivalDaySchema>

export const dailyWaterPints = (hotWeather: boolean) => hotWeather ? 16 : 8
/** Internal clock facts only; never a public way to select a free time jump. */
export function nutritionClockBlocked(record: SurvivalState | undefined, at: number, seconds: number,
  facts: { dead?: boolean; rest?: boolean; combatStep?: boolean; combatPhase?: boolean } = {}) {
  if (!record || record.status !== 'active' || facts.dead || seconds <= 0) return false
  const realRoundStep = facts.combatStep && facts.combatPhase && !facts.rest && seconds <= 6
    && at < record.day.endsAt && !record.pendingDay
  if (realRoundStep) return false
  return Boolean(record.pendingDay || at + seconds > record.day.endsAt || facts.rest && at + seconds >= record.day.endsAt)
}
export function foodDeprivationAfter(foodDebtHalfDays: number, foodHalfPounds: number, constitution: number) {
  if (!Number.isInteger(constitution) || constitution < 1 || constitution > 30)
    throw new RangeError('PHB standard Constitution must be an integer from 1 to 30; nonstandard physiology is not modeled.')
  const debt = foodHalfPounds >= 2 ? 0 : foodDebtHalfDays + (foodHalfPounds === 1 ? 1 : 2)
  const limitDays = Math.max(1, 3 + Math.floor((constitution - 10) / 2))
  return { debtHalfDays: Math.min(20000,debt), ...(debt>20000?{debtAtLeast:true}:{}), limitDays, exhaustionLevels: debt > limitDays * 2 ? 1 : 0 }
}
export function nutritionRestEligibility(record: SurvivalState | undefined) {
  if (!record) return { eligible: false, code: 'NUTRITION_NOT_TRACKED', reason: 'No quantified intake history exists.' }
  if (record.status !== 'active') return { eligible: false, code: 'NUTRITION_SUSPENDED', reason: 'Reconcile the actual post-death history explicitly.' }
  const intake = record.recoveryIntake, fullRequired = record.priorDeprivation !== 'none'
  const eligible = fullRequired ? intake.foodHalfPounds >= 2 && intake.waterPints >= dailyWaterPints(record.day.hotWeather)
    : intake.foodHalfPounds > 0 && intake.waterPints > 0
  return { eligible, code: eligible ? 'NUTRITION_VERIFIED' : 'NUTRITION_INSUFFICIENT', fullRequired,
    deprivationProvenance: record.priorDeprivation, intake: { ...intake },
    reason: fullRequired ? 'Known or unknown deprivation requires full current standard food and water amounts.' : 'Ordinary exhaustion requires some actual food and drink since the previous rested intake receipt.' }
}
