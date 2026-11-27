import { z } from 'zod'
import { MAGIC_ITEM_IDS } from './srd/magic-items'

export const MagicItemRecordSchema = z.object({
  id: z.string().min(1).max(80), templateId: z.enum(MAGIC_ITEM_IDS), creation: z.string(),
  activationIds:z.array(z.string().min(1).max(80)).max(256).optional(),
  identified: z.boolean(), chargesKnown: z.boolean(), charges: z.number().int().min(0).max(10),
  status: z.enum(['active', 'consumed', 'destroyed']),
  attunedTo: z.literal('player').optional(), worn: z.boolean(), awaySince: z.number().nonnegative().optional(),
  lastRechargeDay: z.number().int().nonnegative(),
}).strict()
export type MagicItemRecord = z.infer<typeof MagicItemRecordSchema>
