import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitCellSchema,ToolkitIdSchema } from '../../lib/dm-tool-state'
import { continueCasting,finishCasting,cancelCasting,castingSnapshot } from '../casting'
import { toolkitTransaction,toolkitResult,toolkitError } from '../toolkit'
import * as gs from '../game-state'

export function registerCastingTools(server:McpServer) {
  server.registerTool('continue_casting',{
    description:'Perform actual work on the exact long incantation begun by cast_spell or Identify. Outside combat choose positive whole seconds, bounded by remaining work and actual time-event preflight. Combat: omit seconds; spends one real action on the caster’s own turn, at most one casting contribution per turn even with Action Surge. Other elapsed time grants no work. Requires the original concentration, voice, hands and real components; Identify retains the same touched physical item. Interrupted progress cannot be resumed. Does not resolve the spell or spend its slot.',
    inputSchema:{castingId:ToolkitIdSchema,eventId:ToolkitIdSchema,seconds:z.number().int().positive().max(86400).optional()},
  },async input=>toolkitTransaction(()=>toolkitResult(continueCasting(input))))
  server.registerTool('finish_casting',{
    description:'Explicitly resolve one ready incantation after BOTH its actual source duration and casting work. No extra action or time is charged. Revalidates the original chosen slot, knowledge, physical materials, hands and targets before costs/dice. Optional target fields are a NEW explicit agent choice, never automatic replacement; Identify and Alarm keep their original physical selections. Exact repeats return the same outcome without costs. Ready incantations must be finished or cancelled before other actions; no engine MCP call is invented.',
    inputSchema:{castingId:ToolkitIdSchema,targetId:z.string().min(1).optional(),targetIds:z.array(z.string().min(1)).max(100).optional(),
      toCell:ToolkitCellSchema.optional(),direction:z.object({x:z.number().int().min(-1).max(1),y:z.number().int().min(-1).max(1)}).strict().optional()},
  },async input=>toolkitTransaction(()=>toolkitResult(finishCasting(input))))
  server.registerTool('cancel_casting',{
    description:'Cancel one exact active or ready incantation without spending its spell slot. Ends its concentration and preserves a persistent interruption record. Time and actions already performed remain spent; restarting requires a fresh cast_spell with zero progress.',
    inputSchema:{castingId:ToolkitIdSchema},
  },async input=>toolkitTransaction(()=>toolkitResult(cancelCasting(input.castingId))))
  server.registerTool('get_casting',{
    description:'Read persistent work/status for an exact incantation, including an interruption. Does not grant work, change time, choose targets or resolve effects.',
    inputSchema:{castingId:ToolkitIdSchema},annotations:{readOnlyHint:true},
  },async input=>toolkitTransaction(()=>{const cast=gs.getState().dmTools?.casting?.records[input.castingId];if(!cast)toolkitError('CASTING_NOT_FOUND','Choose an exact recorded incantation ID.');return toolkitResult(castingSnapshot(cast!))}))
}
