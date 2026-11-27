import { z } from 'zod'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id)),Value=z.record(z.string(),z.unknown())
export const ObserveLegacyNpcLifeSchema=z.object({eventId:Id,entityId:Id,physicalFactId:Id,observedState:z.enum(['dead','living_zero_unresolved']),actualCurrentLifeObservedConfirmed:z.literal(true),pastLifeHistoryUnknownConfirmed:z.literal(true)}).strict()
/** A present observation is neither the original death nor a stabilization. */
export const LegacyNpcLifeObservationSchema=z.object({input:ObserveLegacyNpcLifeSchema,command:z.string(),at:z.number().nonnegative(),sourceStatBlock:Id,sourceCreation:z.string(),originalNpc:Value,physicalFact:Value,
 unknownHistory:z.object({injuryAt:z.literal('unknown'),deathAt:z.literal('unknown'),deathSaveCounters:z.literal('unknown'),stability:z.literal('unknown')}).strict(),
 resolution:z.object({kind:z.enum(['healed','stabilized','actual_death']),at:z.number().nonnegative()}).strict().optional(),result:Value,
}).strict()
