import { z } from 'zod'
import { LowObstacleInputSchema,JumpIdSchema } from '../../lib/jumping-state'
import { recordJumpObstacle,continueActualJump,completeActualJumpFall } from '../actual-jump'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { VerticalSurfaceInputSchema,StandingSupportInputSchema,PhysicalBodyInputSchema } from '../../lib/jumping-state'
import { inspectVerticalMovement,recordVerticalSurface,observeStandingSupport,recordPhysicalBody } from '../vertical-observations'
import { toolkitResult,toolkitTransaction } from '../toolkit'
export function registerVerticalTools(server:McpServer){
  server.registerTool('inspect_vertical_movement',{
    description:'MJ read-only actual map support surfaces, gaps, body measurements, retained on-foot steps and pending jump/landing/fall. Elevation is feet in THIS map datum, unrelated to sea-level altitude. Unknown real flight/arc/body height stays unknown, never guessed from a name or creature size. No movement, landing, fall, die, source geometry or body is created.',
    inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true},
  },async()=>toolkitTransaction(()=>toolkitResult(inspectVerticalMovement())))
  server.registerTool('record_vertical_surface',{
    description:'Explicit MJ measurement of ONE actual support surface or gap in existing cells of an actual room/map, with signed elevation in the map datum and provenance. Records physical facts only: no floor, bridge, chasm, wall, room or actor displacement is created. Unknown relief is not inferred from narrative or an image. Existing surface IDs retain their actual measured footprint/elevation; a new nonce cannot move that surface or a body.',
    inputSchema:VerticalSurfaceInputSchema.shape,
  },async input=>toolkitTransaction(()=>toolkitResult(recordVerticalSurface(input))))
  server.registerTool('observe_standing_surface',{
    description:'MJ confirms where an actual currently grounded body already stands on a measured support surface containing its current cell. First actual observation or a new-map datum may establish unknown context. A body with an already known different elevation must actually move/jump/fall; observation never relocates it or grants a free landing. Actual observed flight or a pending leap cannot be declared grounded by a nonce. Optional true measured body height supports exact reach/volume calculations without inferring anatomy from a name or size.',
    inputSchema:StandingSupportInputSchema.shape,
  },async input=>toolkitTransaction(()=>toolkitResult(observeStandingSupport(input))))
  server.registerTool('record_physical_body',{
    description:'MJ records the actual measured vertical extent of ONE real existing body on the current map, without actor/stat activation, movement, size change or trait grant. This is the real measured vertical extent in the current prone/upright posture, not spell area size, geographic altitude or a creature-size guess. Actual transformations require their source procedure; another nonce cannot grow this body. The independent measurement can describe an actual airborne body without landing it.',
    inputSchema:PhysicalBodyInputSchema.shape,
  },async input=>toolkitTransaction(()=>toolkitResult(recordPhysicalBody(input))))
  server.tool('record_jump_obstacle','MJ records the explicit PHB low-obstacle circumstance from one actual measured barrier and actual collision support. Optional AthleticsDC10 is used only when explicitly required; no blocker or height is created.',LowObstacleInputSchema.shape,async input=>toolkitTransaction(()=>toolkitResult(recordJumpObstacle(input))))
  server.tool('continue_jump','Resume the same actual jump after an explicitly resolved reaction. No new jump, running start, die, action or movement budget is created.',{jumpId:JumpIdSchema},async input=>toolkitTransaction(()=>continueActualJump(input)))
  server.tool('complete_jump_fall','Explicit MJ completion of a real interrupted airborne jump at its current actual cell, with measured fall distance and existing landing surface. Applies canonical falling once, then actual ground contact. Never invents a surface, displacement or saved jump.',{eventId:JumpIdSchema,jumpId:JumpIdSchema,landingSurfaceId:JumpIdSchema,distanceFeet:z.number().finite().nonnegative().max(100000),actualCompletedFallConfirmed:z.literal(true),source:z.string().trim().min(1).max(1000)},async input=>toolkitTransaction(()=>completeActualJumpFall(input)))
}
