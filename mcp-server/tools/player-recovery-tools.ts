import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { inspectPlayerRecovery } from '../player-recovery'
import { toolkitResult,toolkitTransaction } from '../toolkit'

export function registerPlayerRecoveryTools(server:McpServer):void {
  server.registerTool('inspect_player_recovery',{
    description:'Read the actual player stable zero-HP recovery: its one observed d4, real stabilization/deadline, breathing hold and last true closure. Legacy stable saves without a source die remain explicitly unknown; reading never creates, rerolls or restarts a timer.',
    inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async()=>toolkitTransaction(()=>toolkitResult(inspectPlayerRecovery())))
}
