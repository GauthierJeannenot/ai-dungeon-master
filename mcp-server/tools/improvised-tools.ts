import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ImprovisedRulingFields } from '../../lib/improvised-state'
import { ToolkitIdSchema } from '../../lib/dm-tool-state'
import { adjudicateImprovised,manageSlingLoad } from '../improvised'
import { toolkitTransaction,toolkitResult } from '../toolkit'
export function registerImprovisedTools(server:McpServer){
  server.registerTool('adjudicate_improvised_weapon',{
    description:'MJ explicitly adjudicates ONE real owned object or actually carried scene object/dead body. No item, proficiency or feat is granted. Select mode melee/thrown for actual1d4 and explicit physical damage type, or similar plus exact published profile and explicit allowProficiency: only a real acquired class proficiency can then apply. Use the returned referenceId as weaponOrSpell/weaponId for this exact usage; ordinary profiles stay available separately. Generic thrown usage has20/60ft, DEX and no fake shot/ammunition. A sling must contain a real loaded projectile for improper melee use. A carried body/large obstacle requires its actual mass/grip/positions; thrown landingCell is an explicit MJ adjudication, never mass damage or an invented trajectory.',
    inputSchema:ImprovisedRulingFields.omit({physicalContext:true,physicalFactWitness:true,at:true}).shape,
  },async input=>toolkitTransaction(()=>toolkitResult(adjudicateImprovised(input))))
  server.registerTool('manage_sling_projectile',{
    description:'Explicitly load/unload ONE existing counted sling bullet into/from the exact actually held sling, using the real object interaction and free loading hand. The reserved projectile leaves its real stack and stays physically attached through drop/throw/pickup, with actual silver, source poison and weight. To fire it explicitly choose the host ID as ammunitionItemId; no second shot/unit is created. Default unload returns to the original actually carried matching stack. Explicit separate:true unloads that SAME unit to its own real one-piece stack, preserving silver/remaining poison when merging is incompatible; never spread, refresh or discard a coating implicitly.',
    inputSchema:{eventId:ToolkitIdSchema,hostItemId:ToolkitIdSchema,operation:z.enum(['load','unload']),ammunitionItemId:ToolkitIdSchema.optional(),separate:z.boolean().optional().describe('Unload only: explicitly preserve this same reserved unit in its own actual one-piece stack. Required instead of merging when the original stack is absent or its actual silver/active poison differs; no quantity, coating or mass is created.')},
  },async input=>toolkitTransaction(()=>toolkitResult(manageSlingLoad(input))))
}
