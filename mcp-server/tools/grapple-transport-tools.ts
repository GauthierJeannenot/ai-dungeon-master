import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitCellSchema } from '../../lib/dm-tool-state'
import { available } from '../hero-rules'
import { executeNavigation, planNavigation } from '../navigation'
import { toolkitResult, toolkitTransaction, toolkitError } from '../toolkit'
import * as gs from '../game-state'

export function registerGrappleTransportTools(server: McpServer) {
  const inputSchema = { actorId: z.string().min(1), targetId: z.string().min(1),
    toCell: ToolkitCellSchema, targetToCell: ToolkitCellSchema,
    allowPartial: z.boolean().default(false), acknowledgeEventIds: z.array(z.string()).max(32).optional() }
  server.registerTool('preview_grapple_transport', {
    description: 'Read-only legal paired path for an actual grapple. Explicit grappler, held creature and BOTH final cells required. Source 2014 speed is halved unless target is at least two sizes smaller. Walls, occupancy, doors, diagonal costs and difficult terrain apply. No actor moves or die rolls.',
    inputSchema, annotations: { readOnlyHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(planNavigation(input.actorId, { kind: 'cell', cell: input.toCell },
    input.allowPartial, input.acknowledgeEventIds, false, { targetId: input.targetId, targetToCell: input.targetToCell }))))
  server.registerTool('move_grappled_creature', {
    description: 'Move the explicitly selected grappler and its actually grappled creature to two explicit distinct adjacent final cells. Engine jointly finds both paths; never moves another target or creates a grapple. 2014 half speed except two sizes smaller, real budget and geometry. Only grappler voluntary movement provokes opportunity attacks; held target movement is forced. A pending reaction saves the exact paired movement for continuation. No action spent. Multiple holds, anchored traps, readied paired moves and corpse carrying are not represented. Current grid uses one-cell creature footprints.',
    inputSchema,
  }, async input => toolkitTransaction(() => {
    available()
    const actor = gs.getMonster(input.actorId)
    if (gs.getNpc(input.actorId) && (!actor || actor.controller === 'reactive_npc')) toolkitError('NPC_ACTIVATION_REQUIRED', 'Use the current reactive NPC activation; this tool cannot bypass it.')
    const result = executeNavigation(input.actorId, { kind: 'cell', cell: input.toCell }, input.allowPartial,
      input.acknowledgeEventIds, [], false, { targetId: input.targetId, targetToCell: input.targetToCell })
    if (result.costCells > 0) gs.addLogEntry({ round: gs.getState().round, turn: input.actorId,
      action: 'Transport pendant une prise', mechanicalDetail: `${input.actorId} déplace ${input.targetId} ; coût ${result.costCells} cases ; ${result.stopReason}` })
    return toolkitResult({ success: true, actorId: input.actorId, targetId: input.targetId, ...result,
      ...(gs.getState().hero?.pending ? { pendingReaction: gs.getState().hero!.pending } : {}) })
  }))
}
