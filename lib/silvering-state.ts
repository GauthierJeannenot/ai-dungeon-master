import { z } from 'zod'
const Id=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(id=>!['constructor','prototype','__proto__'].includes(id)),Text=z.string().trim().min(1).max(600)
export const SilveringServiceInputSchema=z.object({serviceId:Id,artisanId:Id,workSeconds:z.number().int().positive().max(86400),
  expertiseConfirmed:z.literal(true),materialsAvailable:z.literal(true),willing:z.literal(true),source:Text,reason:Text}).strict()
export const SilveringStateSchema=z.object({version:z.literal(1),services:z.record(z.string(),SilveringServiceInputSchema.extend({
  mapId:Id,roomId:Id,at:z.number().nonnegative(),
}).strict()),receipts:z.record(z.string(),z.object({command:z.string().max(10000),result:z.record(z.string(),z.unknown())}).strict())}).strict()
export type SilveringState=z.infer<typeof SilveringStateSchema>
