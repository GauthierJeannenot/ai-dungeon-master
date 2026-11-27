import { z } from 'zod'
import { resolveStartTurnFire } from '../weapon-consumables'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { UnderwaterObservationSchema,UnderwaterSubjectSchema } from '../../lib/underwater-state'
import { recordUnderwaterContext,inspectUnderwaterContext } from '../underwater'
import { toolkitTransaction,toolkitResult } from '../toolkit'
export function registerUnderwaterTools(server:McpServer){
 server.registerTool('resolve_start_turn_fire',{description:'Resolve only the exact already due alchemist-fire event of the actual opened creature turn after physical context is established; no initiative, action, movement or time is replayed.',inputSchema:{entityId:z.string().min(1),eventId:z.string().min(1)}},async input=>toolkitTransaction(()=>toolkitResult(resolveStartTurnFire(input))))
 server.registerTool('record_underwater_context',{
  description:'Explicit MJ physical observation for ONE actual current-map creature or destructible scene object in existing observed water. Whole immersion and the exact selected weapon attack made underwater are distinct qualifications. Match real position/posture/measured extents and existing physical fact; no body, water, movement, breath, swimming speed, immunity, gear or weapon is created. A nonce cannot immerse/emerge an unchanged body. A living fully immersed air breather requires its actual already established holding/choking episode, unless a genuine source physiology breathes this water. An initial pending opportunity can be qualified before its first die; already rolled attacks/saves keep their original context.',
  inputSchema:UnderwaterObservationSchema.shape,
 },async input=>toolkitTransaction(()=>toolkitResult(recordUnderwaterContext(input))))
 server.registerTool('inspect_underwater_context',{
  description:'Read actual observed whole-immersion/weapon qualifications and whether they still match their real subject/water. Unknown remains unresolved. No roll, position, breathing, swimming speed, wetness, wash, coating loss or discovery is created.',
  inputSchema:{subject:UnderwaterSubjectSchema.optional()},annotations:{readOnlyHint:true,idempotentHint:true},
 },async({subject})=>toolkitTransaction(()=>toolkitResult(inspectUnderwaterContext(subject))))
}
