import { z } from 'zod'
const Id=z.string().min(1).max(180).refine(s=>!['constructor','prototype','__proto__'].includes(s))
/** An immutable actual stock origin, never a name-derived or magical property. */
export const AdamantineWitnessSchema=z.object({originEventId:Id,rootItemId:Id}).strict()
export type AdamantineWitness=z.infer<typeof AdamantineWitnessSchema>
