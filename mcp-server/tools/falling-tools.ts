import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitDescriptionSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import { resolveFall } from '../falling'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerFallingTools(server: McpServer) {
  server.registerTool('resolve_fall', {
    description: 'Explicit MJ resolution of ONE completed, established fall for an exact active-map creature. Supply factual distanceFeet and reason, and an immutable eventId. Standard D&D 2014: 1d6 bludgeoning per full 10 feet, maximum 20d6; lands prone if it takes damage, subject to source condition immunity. Real defenses, temporary HP, concentration, zero-HP lifecycle and damage effects apply. Replaying the exact event returns its receipt without rolling or damage. Does not decide that a creature fell, move it, assign altitude, spend an action, advance time, silently adopt optional rules, or grant an unregistered protective ability. An explicitly adopted XGE flying option uses current source flying speed; adopted rate500 distances over500ft require begin_xge_fall and actual later turns. Not a free player damage action.',
    inputSchema: { eventId: ToolkitIdSchema, entityId: z.string().min(1),
      distanceFeet: z.number().finite().min(0).max(1000000), reason: ToolkitDescriptionSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => toolkitTransaction(() => toolkitResult(resolveFall(input))))
}
