import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PrepareAdventureRewardSchema } from '../../lib/adventure-reward-state'
import { inspectAdventureRewards,prepareAdventureReward } from '../adventure-rewards'
import { toolkitTransaction,toolkitResult } from '../toolkit'
export function registerAdventureRewardTools(server:McpServer){
 server.registerTool('inspect_adventure_rewards',{description:'Read the current adventure/map exact authored reward sources and their once-only preparation receipts, confidential to MJ. No player discovery, ownership, search, coins, creature equipment, death or magic knowledge follows from this read.',inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true}},async()=>toolkitTransaction(()=>toolkitResult(inspectAdventureRewards())))
 server.registerTool('prepare_adventure_reward',{description:'Explicitly materialize one exact source-authored adventure reward after a real search/access fact at the source room/cell. Locked source containers must already be open/destroyed. Enemy goods additionally need their actual tracked issue/current body and physical release; victim property needs an actual explicit ownership transfer. Source amounts/objects/owner identities are immutable. Nothing enters the player inventory or wallet; use actual pickup/coin collection/identification/attunement afterwards. Exact repeat never refills or clones.',inputSchema:PrepareAdventureRewardSchema.shape,annotations:{idempotentHint:true}},async input=>toolkitTransaction(()=>toolkitResult(prepareAdventureReward(input))))
}
