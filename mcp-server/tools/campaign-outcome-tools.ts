import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { RecordCampaignOutcomeSchema,recordCampaignOutcome,inspectCampaignOutcomes } from '../campaign-outcomes'
import { toolkitTransaction } from '../toolkit'
export function registerCampaignOutcomeTools(server:McpServer){
 server.registerTool('inspect_campaign_outcomes',{description:'Read the actual tracked engagements, pre-retirement closures and explicit MJ outcomes. Legacy triggered alone means engaged, never victory. History snapshots do not materialize loot or a retired body.',inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true}},async()=>inspectCampaignOutcomes())
 server.registerTool('record_campaign_outcome',{description:'Record one explicit MJ issue for an exact already closed authored encounter: victory, player_fled, opponents_fled, surrender, capture or agreement. Mechanical closure/body/room/custody evidence is validated; reason is only stored, never interpreted. A real flight is not victory. No XP, reward, movement, capture condition or ritual effect is created. Exact replay retains the same outcome.',inputSchema:RecordCampaignOutcomeSchema.shape,annotations:{idempotentHint:true}},async input=>toolkitTransaction(()=>recordCampaignOutcome(input)))
}
