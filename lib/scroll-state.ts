import { z } from 'zod'

export const SCRIBED_SCROLL_CREATION_PREFIX = 'xge-scribe:'
export const MULTIDAY_SCRIBED_SCROLL_CREATION_PREFIX = 'xge-scribe-multiday:'

export const SpellScrollRecordSchema = z.object({
  id: z.string().min(1).max(80), spellId: z.string().min(1).max(80), creation: z.string(),
  scribedCantripCasterLevel: z.literal(1).optional(),
  identified: z.boolean(), status: z.enum(['active', 'consumed']),
}).strict()
export type SpellScrollRecord = z.infer<typeof SpellScrollRecordSchema>
