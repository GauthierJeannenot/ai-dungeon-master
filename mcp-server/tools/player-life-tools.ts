import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PlayerLifeCheckpointSchema } from '../../lib/player-life-state'
import { inspectPlayerLife,checkpointPlayerDying } from '../player-life'
import { toolkitResult,toolkitTransaction } from '../toolkit'
export function registerPlayerLifeTools(server:McpServer):void {
 server.registerTool('inspect_player_life',{
  description:'Read the actual player zero-HP life episode, retained counters, exact current turn or six-second death-save event, and unresolved legacy timeline. No die, time, HP, action or historical reconstruction.',
  inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 },async()=>toolkitTransaction(()=>toolkitResult(inspectPlayerLife())))
 server.registerTool('checkpoint_player_dying',{
  description:'Explicit MJ present-time observation of the actual living unstable zero-HP player whose original dying timestamp is unknown. Anchors the next known six-second boundary, preserves counters, never reconstructs earlier saves or resets an existing episode/deadline. Immutable eventId/reason replays without healing, resurrection, action cost or a die.',
  inputSchema:PlayerLifeCheckpointSchema.shape,
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 },async input=>toolkitTransaction(()=>toolkitResult(checkpointPlayerDying(input))))
}
