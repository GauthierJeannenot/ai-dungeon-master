import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { MovementMediumInputSchema,SpecialMovementInputSchema } from '../../lib/locomotion-state'
import { recordMovementMedium,startSpecialMovement,resumeSpecialMovement,inspectSpecialMovement,completeLocomotionFall,registerSpecialMovementResolutions } from '../special-movement'
import { toolkitTransaction,toolkitResult } from '../toolkit'
export function registerSpecialMovementTools(server:McpServer){
  registerSpecialMovementResolutions()
  server.registerTool('record_movement_medium',{
    description:'MJ observation of ONE actual surface-water interval or measured existing climbing face on this active map. Existing physical fact, exact cells and local bounds are required. This creates no water, wall, position, speed or handhold. Difficult terrain, actual required hands and optional source-circumstance Athletics DC are explicit MJ adjudications, never parsed from names or player text. A new ID cannot replace the same retained physical medium.',
    inputSchema:MovementMediumInputSchema.shape,
  },async input=>toolkitTransaction(()=>toolkitResult(recordMovementMedium(input))))
  server.registerTool('move_by_climbing_or_swimming',{
    description:'One actual explicitly chosen climbing/surface-swimming route with exact current first point and next adjacent horizontal or vertical points. Standard PHB2014 extra movement cost and real native mode speed, armor, exhaustion, Dash and all already-used movement apply. A real final support is selected explicitly; observation grants no arrival. Optional Athletics resolves once with its original held die. No submerged breathing, paired load, free turn, vertical OA/effect geometry or destination is invented. Actual hazards stop on their exact retained contact.',
    inputSchema:SpecialMovementInputSchema.shape,
  },async input=>toolkitTransaction(()=>startSpecialMovement(input)))
  server.registerTool('continue_special_movement',{
    description:'Continue only the exact original retained climbing/swimming decision after its actual reaction/contact. No new path, goal, movement budget, skill roll or action is selected. A completed event replays its receipt.',
    inputSchema:{eventId:z.string().min(1).max(80)},
  },async({eventId})=>toolkitTransaction(()=>resumeSpecialMovement(eventId)))
  server.registerTool('complete_locomotion_fall',{
    description:'Explicit MJ resolution of one already completed actual fall from a measured swimming/suspended position to a selected existing lower support at the same XY cell. The real measured descent controls ordinary Falling damage. Never grants horizontal movement, a platform, an action, time, or an automatic fall on a failed Athletics check. Exact receipts prevent repeated damage/contact.',
    inputSchema:{eventId:z.string().min(1).max(80),entityId:z.string().min(1).max(180),landingSurfaceId:z.string().min(1).max(80),reason:z.string().trim().min(1).max(1000)},
  },async input=>toolkitTransaction(()=>toolkitResult(completeLocomotionFall(input))))
  server.registerTool('inspect_special_movement',{
    description:'Read the actual recorded climbing faces, water surfaces, local body positions and route receipts. No position, support, hand state, speed, test or movement is changed.',
    inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true},
  },async()=>toolkitTransaction(()=>toolkitResult(inspectSpecialMovement())))
}
