import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { SpatialCoverInputSchema,CoverPointCellSchema } from '../../lib/cover-state'
import { CoverDegreeSchema } from '../../lib/cover-state'
import { ToolkitCellSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import { configureCover, inspectCover } from '../cover'
import { toolkitError, toolkitResult, toolkitTransaction } from '../toolkit'

export function registerCoverTools(server: McpServer) {
  server.registerTool('configure_cover', {
    description: 'Explicit MJ adjudication of PHB/SRD 2014 directional cover, never inferred from player text or token occupation. operation=set requires exactly originId (actual actor) OR originCell (actual effect origin point), targetId (actual creature or existing coplanar scene object), obstacleCell strictly between them, degree half/three_quarters/total and factual reason. For rooted razorvine only, targetCell selects one exact physical footprint face. Stores exact active-map room/cell anchors; movement makes the declaration inapplicable. Highest degree only: +2/+5 AC and Dexterity saves, never STR/CON or cumulative sources. Total cover blocks direct attacks/spells before costs/dice. No obstacle, move, hiding or discovery is created. May update before a roll, never during a held reaction. operation=remove requires only coverId. No optional shooting-through-cover variant.',
    inputSchema: { coverId: ToolkitIdSchema, operation: z.enum(['set', 'remove']),
      originId: z.string().min(1).max(100).optional(), originCell: CoverPointCellSchema.optional(),
      spatial:SpatialCoverInputSchema.optional(),
      targetId: z.string().min(1).max(100).optional(), targetCell:ToolkitCellSchema.optional().describe('Exact physical footprint face of a rooted razorvine only. Omit for generic objects and creatures.'), obstacleCell: ToolkitCellSchema.optional(),
      degree: CoverDegreeSchema.optional(), reason: z.string().trim().min(1).max(600).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async input => toolkitTransaction(() => toolkitResult(configureCover(input))))
  server.registerTool('inspect_cover', {
    description: 'Read directional PHB/SRD2014 cover from exactly originId OR originCell toward targetId. Returns highest active degree, exact AC/DEX bonus and current/stale source declarations. Origin actors, effect points and other sides are distinct. No mutation, die, player action, secret discovery or automatic geometry-derived cover.',
    inputSchema: { originId: z.string().min(1).max(100).optional(), originCell: CoverPointCellSchema.optional(),originZFeet:z.number().finite().optional(), targetId: z.string().min(1).max(100),targetCell:ToolkitCellSchema.optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => toolkitTransaction(() => {
    if ((input.originId !== undefined) === (input.originCell !== undefined)) toolkitError('COVER_SELECTION_INVALID', 'Choose exactly originId OR originCell.')
    return toolkitResult(inspectCover(input.originId ?? input.originCell!, input.targetId,input.originZFeet,input.targetCell))
  }))
}
