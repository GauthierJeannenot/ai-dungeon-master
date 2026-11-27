import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CleavingChoiceSchema } from '../../lib/cleaving-state'
import { resolveCleavingChoice } from '../cleaving'
import { toolkitTransaction } from '../toolkit'
export function registerCleavingTools(server:McpServer){
 server.registerTool('resolve_cleaving',{description:'Explicitly choose one carry target or stop for an actual retained DMG2014 Cleaving Through Creatures cursor. Exact cleaveId+unique stepId, choice carry requires one targetId; choice stop must omit it. Reuses the one original chosen attack d20 and numeric remaining damage, no new attack/damage dice, modifier, action, movement or time. An admissible secondary MISS ENDS the chain; a wounded secondary can take damage then ends it. Only a full-HP secondary reduced to0 with positive remainder offers another explicit choice. Stop is allowed even while eligible targets remain by the user convention of 7Nov2026, distinct from printed RAW. Exact nonce retries return their receipt without repeating HP/costs. No automatic target/stop, new attack, unmodeled defense or nonlethal victim.',inputSchema:CleavingChoiceSchema.shape,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async input=>toolkitTransaction(()=>resolveCleavingChoice(input)))
}
