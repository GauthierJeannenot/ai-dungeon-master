import { z } from 'zod'

export const FallReceiptSchema = z.object({
  eventId: z.string().min(1).max(80),
  entityId: z.string().min(1),
  distanceFeet: z.number().finite().min(0).max(1000000),
  reason: z.string().min(1).max(600),
  mapId: z.string(),
  at: z.number().nonnegative(),
  result: z.record(z.string(), z.unknown()),
}).strict()
export const FallStateSchema = z.object({
  receipts: z.record(z.string(), FallReceiptSchema),
}).strict()
export type FallState = z.infer<typeof FallStateSchema>
