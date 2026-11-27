import { z } from 'zod'

export const ExhaustionLevelSchema = z.number().int().min(0).max(6)
export const ExhaustionCreatureSchema = z.object({
  level: ExhaustionLevelSchema,
  // Only present while the level-4 maximum-HP multiplier is active.
  unexhaustedHpMax: z.number().int().nonnegative().optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.level >= 4) !== (value.unexhaustedHpMax !== undefined))
    ctx.addIssue({ code: 'custom', message: 'A level >= 4 requires its unexhausted HP maximum; lower levels must not retain it.' })
})
export const ExhaustionReceiptSchema = z.object({
  eventId: z.string(), command: z.string(), targetId: z.string(),
  chaseSourceId:z.string().optional(),removalSource:z.enum(['chase','other']).optional(),
  operation: z.enum(['add', 'remove', 'raised_from_dead']), reason: z.string(),
  levels: z.number().int().min(1).max(6), beforeLevel: ExhaustionLevelSchema, afterLevel: ExhaustionLevelSchema,
  hpBefore: z.object({ current: z.number(), max: z.number() }).strict(),
  hpAfter: z.object({ current: z.number(), max: z.number() }).strict(),
  died: z.boolean(), at: z.number().nonnegative(),
}).strict()
export const ExhaustionStateSchema = z.object({
  creatures: z.record(z.string(), ExhaustionCreatureSchema),
  receipts: z.record(z.string(), ExhaustionReceiptSchema),
}).strict()
export type ExhaustionCreature = z.infer<typeof ExhaustionCreatureSchema>
export type ExhaustionReceipt = z.infer<typeof ExhaustionReceiptSchema>
export type ExhaustionState = z.infer<typeof ExhaustionStateSchema>
export type ExhaustionStateView = { dmTools?: { exhaustion?: ExhaustionState } }
