import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PurifyDesecratedGroundSchema, RecordDesecratedGroundSchema } from '../../lib/desecrated-ground-state'
import { detectDesecratedGround, purifyDesecratedGround, recordDesecratedGround } from '../desecrated-ground'
import { getState } from '../game-state'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerDesecratedGroundTools(server: McpServer) {
  server.registerTool('record_desecrated_ground', {
    description: 'MJ qualifies actual known magically desecrated terrain, on exact cells of one real measured ground support and a durable public scene fact. No new terrain, hidden data, age, curse, creature, discovery or action is created. Replays cannot re-desecrate cleansed cells.',
    inputSchema: RecordDesecratedGroundSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(recordDesecratedGround(input))))
  server.registerTool('inspect_detected_desecration', {
    description: 'Read presence only, from the actual active Detect Evil and Good spell. Open coplanar rays within 30 feet can establish presence; unmeasured barriers or decisive heights remain unresolved. No coordinates, creature, consecration, discovery, action or spell are created.',
    inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: true },
  }, async () => toolkitResult(detectDesecratedGround(getState())))
  server.registerTool('purify_desecrated_ground', {
    description: 'Sprinkle one actual owned holy-water flask over an explicit 10-foot square of the exact measured reachable ground. Four coplanar contiguous cells; purifies only actual profaned portions. One actual action in combat or choose the measured outside-combat interval. No attack roll, damage, Hallow, free flask or new discovery.',
    inputSchema: PurifyDesecratedGroundSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(purifyDesecratedGround(input))))
}
