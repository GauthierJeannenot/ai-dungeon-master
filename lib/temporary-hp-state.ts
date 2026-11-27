import { z } from 'zod'

export const TemporaryHpDurationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('until_long_rest') }).strict(),
  z.object({ kind: z.literal('seconds'), seconds: z.number().int().min(1).max(31536000) }).strict(),
])
export const TemporaryHpPoolSchema = z.object({
  eventId: z.string(), sourceId: z.string(), sourceDescription: z.string(),
  initial: z.number().int().min(1).max(10000), current: z.number().int().nonnegative(),
  grantedAt: z.number().nonnegative(), expiresAt: z.number().nonnegative().optional(), endOnLongRest: z.boolean(),
}).strict().superRefine((pool, ctx) => {
  if (pool.current > pool.initial) ctx.addIssue({ code: 'custom', message: 'Temporary HP cannot exceed their actual source grant.' })
  if (pool.endOnLongRest === (pool.expiresAt !== undefined)) ctx.addIssue({ code: 'custom', message: 'Choose either source duration or the no-duration long-rest lifetime.' })
})
export const TemporaryHpReceiptSchema = z.object({
  eventId: z.string(), command: z.string(), targetId: z.string(), outcome: z.enum(['granted', 'kept', 'replaced']),
  before: TemporaryHpPoolSchema.optional(), after: TemporaryHpPoolSchema, at: z.number().nonnegative(),
}).strict()
export const TemporaryHpStateSchema = z.object({
  pools: z.record(z.string(), TemporaryHpPoolSchema), receipts: z.record(z.string(), TemporaryHpReceiptSchema),
}).strict()
export type TemporaryHpPool = z.infer<typeof TemporaryHpPoolSchema>
export type TemporaryHpState = z.infer<typeof TemporaryHpStateSchema>
export type TemporaryHpDuration = z.infer<typeof TemporaryHpDurationSchema>
export interface TemporaryHpDamageContext { damageReceived: number; temporaryHpResolved: true; critical?: boolean }
export type TemporaryHpStateView = { dmTools?: { temporaryHp?: TemporaryHpState }; worldTimeSeconds?: number }
/** Read-only effective value: source expiration never becomes fictitious HP. */
export function temporaryHpFor(state: TemporaryHpStateView, targetId: string): number {
  const pool = state.dmTools?.temporaryHp?.pools[targetId]
  return pool && (pool.expiresAt === undefined || pool.expiresAt > (state.worldTimeSeconds ?? 0)) ? pool.current : 0
}
