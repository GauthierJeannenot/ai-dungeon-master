import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CreateAdamantineStockSchema } from '../../lib/adamantine-state'
import { prepareAdamantineStock,inspectAdamantine } from '../adamantine'
import { toolkitTransaction,toolkitResult } from '../toolkit'
export function registerAdamantineTools(server:McpServer){
 server.registerTool('prepare_adamantine_stock',{description:'MJ establishes one NEW actual already-made/coated adamantine canonical melee weapon OR exactly ten actual ammunition pieces, in the selected real merchant custody from its original physical fact. Never modifies or replaces any existing instance, old ordinary item or source receipt; no inventory, pickup, forging/coating service, magic, money or past ownership is granted. Actual acquisition uses the existing explicit offer/purchase with source normal version +500gp. Partial ammunition material pricing is unsupported.',inputSchema:CreateAdamantineStockSchema},async input=>toolkitTransaction(()=>toolkitResult(prepareAdamantineStock(input))))
 server.registerTool('inspect_adamantine',{description:'Read only actual initial material source, specific instances and retained provenance. No material, stock acquisition, magic, price of a partial batch, transformation or attack is created.',inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true}},async()=>toolkitResult(inspectAdamantine()))
}
