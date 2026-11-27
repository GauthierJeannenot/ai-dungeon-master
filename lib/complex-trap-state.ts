import { z } from 'zod'
const cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const portal=z.object({cell,roomId:z.string(),successes:z.number().int().min(0).max(3),examinedBy:z.array(z.string()).max(32)}).strict()
export const ComplexTrapRecordSchema=z.object({id:z.string().min(1).max(80),name:z.string().min(1).max(80),template:z.literal('crushing_sphere'),
  mapId:z.string(),roomId:z.string(),fromCell:cell,toCell:cell,triggerDoorId:z.string(),geometryAdaptation:z.string().min(1).max(600),
  status:z.enum(['armed','active','disabled']),activated:z.boolean(),damageDice:z.number().int().nonnegative(),creation:z.string(),
  initiativeGeneration:z.number().int().nonnegative().optional(),
  portals:z.object({north:portal,south:portal}).strict(),
  pulses:z.record(z.string(),z.object({status:z.enum(['pending','resolved']),damageDice:z.number().int().nonnegative(),
    results:z.array(z.record(z.string(),z.unknown())).max(32)}).strict()),
  source:z.object({book:z.literal('xge'),sectionId:z.string(),sha256:z.string(),startLine:z.number().int(),endLine:z.number().int()}).strict(),
}).strict()
export type ComplexTrapRecord=z.infer<typeof ComplexTrapRecordSchema>

export function sphereBlocksDoor(state:Pick<import('./types').GameState,'dmTools'|'currentMapId'>,doorId:string){
  return Object.values(state.dmTools?.complexTraps??{}).some(trap=>trap.mapId===state.currentMapId&&trap.triggerDoorId===doorId
    &&trap.status==='disabled'&&trap.activated&&trap.portals.south.successes>=3)
}
