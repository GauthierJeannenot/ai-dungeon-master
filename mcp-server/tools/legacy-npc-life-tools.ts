import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ObserveLegacyNpcLifeSchema } from '../../lib/legacy-npc-life-state'
import { observeLegacyNpcLife,inspectLegacyNpcLife } from '../legacy-npc-life'
import { toolkitTransaction } from '../toolkit'
export function registerLegacyNpcLifeTools(server:McpServer){
 server.registerTool('observe_legacy_npc_life',{description:'Explicit MJ CURRENT physical observation only for an existing improvised0HP NPC whose legacy isAlive/life was absent. Retain exact original creation/stat block, current same-body scene fact and all unknown history. Record dead OR living_zero_unresolved; no HP, clock, revival, stability, old death date/counters, d4, reveal or combat activation. Living unknown can receive a real heal or actual Medicine10 stabilization; only a successful real stabilization creates a new dated stable episode and true d4. Failed Medicine leaves unknown. Same exact observation replays; no known life is rewritten. Uncertainty bound is a conservative engine policy, never a recovered RAW timing/history.',inputSchema:ObserveLegacyNpcLifeSchema.shape,annotations:{idempotentHint:true}},async input=>toolkitTransaction(()=>observeLegacyNpcLife(input)))
 server.registerTool('inspect_legacy_npc_life',{description:'Confidential MJ read-only current legacy-life observations, persistent unknown historical fields and real later normalization. No recovery, roll, time, death or corpse age inferred.',inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true}},async()=>toolkitTransaction(inspectLegacyNpcLife))
}
