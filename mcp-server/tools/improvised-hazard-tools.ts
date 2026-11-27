import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ResolveImprovisedHazardSchema } from '../../lib/improvised-hazard-state'
import { resolveImprovisedHazard,inspectImprovisedHazards,registerImprovisedHazardResolutions } from '../improvised-hazards'
import { toolkitTransaction,toolkitResult } from '../toolkit'
export function registerImprovisedHazardTools(server:McpServer){
 registerImprovisedHazardResolutions()
 server.registerTool('resolve_improvised_hazard',{description:'Explicit MJ ONE instantaneous external environmental damage-only occurrence ALREADY physically established at one actual local ground body/cell. Select its durable scene fact, exact victim, one DMG suggested d10 packet/type, magical defense status and optional save/DC/no_damage or half_damage policy. Tables are suggestions, never a universal DC, level-based automatic damage, action or duration. Explicit actorCost none and elapsedSeconds0 attest this occurrence itself adds no player action/time. Not an attack/spell/automatic trigger, arbitrary condition or movement; no neutralized module hazard is reactivated. Source defenses, HP, concentration, death and a real held Bardic save use canonical resolution. One fact owns one occurrence: exact replay preserves it, another nonce refuses before dice.',inputSchema:ResolveImprovisedHazardSchema.shape,annotations:{idempotentHint:true}},async input=>toolkitTransaction(()=>resolveImprovisedHazard(input)))
 server.registerTool('inspect_improvised_hazards',{description:'MJ read-only original DMG damage suggestions and actual improvised occurrence receipts/windows. Creates no exposure, target, die, time, action, condition, attack or spell.',inputSchema:{eventId:z.string().min(1).max(80).optional()},annotations:{readOnlyHint:true,idempotentHint:true}},async input=>toolkitTransaction(()=>toolkitResult(inspectImprovisedHazards(input.eventId))))
}
