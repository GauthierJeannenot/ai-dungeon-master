import { z } from 'zod'

export const OBJECT_MATERIAL_AC = {
  cloth:11,paper:11,rope:11,crystal:13,glass:13,ice:13,wood:15,bone:15,
  stone:17,iron:19,steel:19,mithral:21,adamantine:23,
} as const
export const ObjectMaterialSchema=z.enum(['cloth','paper','rope','crystal','glass','ice','wood','bone','stone','iron','steel','mithral','adamantine'])
export const ObjectDamageTypeSchema=z.enum(['acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder'])
const types=z.array(ObjectDamageTypeSchema).max(13).refine(value=>new Set(value).size===value.length,'Choose each damage type only once.')
/** A declared MJ ruling for this actual scene object; material names never
 * invent an immunity, vulnerability, resistance or threshold. */
export const ObjectDamageProfileSchema=z.object({
  reason:z.string().trim().min(1).max(1000),
  immunities:types.default([]),resistances:types.default([]),vulnerabilities:types.default([]),
  damageThreshold:z.number().int().nonnegative().default(0),
  magicalResilience:z.boolean().default(false),
}).strict()
export type ObjectDamageProfile=z.infer<typeof ObjectDamageProfileSchema>
