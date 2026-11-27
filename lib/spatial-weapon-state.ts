import { z } from 'zod'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Event=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
const Feet=z.number().finite().min(-100000).max(100000)
export const NativeFlightPointSchema=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative(),zFeet:Feet}).strict()
export const SpatialAttackContextSchema=z.object({source:z.literal('Actual selected measured spatial weapon ray; real Euclidean feet approved2026-11-04'),actorId:Id,targetId:Id,weaponReference:Id,attackMode:z.string().optional(),origin:NativeFlightPointSchema,target:NativeFlightPointSchema,actorWitness:z.string(),targetWitness:z.string(),distanceFeet:z.number().finite().nonnegative(),observationEventId:Event}).strict()
export type NativeFlightPoint=z.infer<typeof NativeFlightPointSchema>
export type SpatialAttackContext=z.infer<typeof SpatialAttackContextSchema>
