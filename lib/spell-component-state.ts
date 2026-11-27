import { z } from 'zod'

// Established scene facts, never inferred from dialogue or generic conditions.
// A silenced record is not a newly cast Silence spell or an inferred area.
export const SpellComponentConstraintSchema = z.object({
  id: z.string().trim().min(1).max(80), targetId: z.string().trim().min(1).max(100),
  kind: z.enum(['gagged', 'silenced', 'hands-bound']),
  source: z.string().trim().min(1).max(600),
}).strict()
export const SpellComponentStateSchema = z.object({
  constraints: z.record(z.string(), SpellComponentConstraintSchema).refine(records =>
    Object.keys(records).length <= 256 && Object.entries(records).every(([id, fact]) => id === fact.id),
  { message: 'At most 256 component facts, each stored under its exact ID.' }),
}).strict()
export type SpellComponentConstraint = z.infer<typeof SpellComponentConstraintSchema>
export type SpellComponentState = z.infer<typeof SpellComponentStateSchema>
