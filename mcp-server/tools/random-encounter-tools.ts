import { configureRandomEncounterCadence,inspectRandomEncounterCadence } from '../encounter-cadence'
import { EncounterCadenceConfigureSchema } from '../../lib/encounter-cadence-state'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitIdSchema } from '../../lib/dm-tool-state'
import { EncounterCheckMethodSchema } from '../../lib/random-encounter-state'
import { checkRandomEncounter,drawRandomEncounter,inspectRandomEncounters } from '../random-encounters'
import { toolkitResult,toolkitTransaction } from '../toolkit'
export function registerRandomEncounterTools(server:McpServer){
 server.registerTool('configure_random_encounter_cadence',{description:'Explicit optional DMG2014 whole-current-map wilderness/dungeon cadence outside combat. operation=start selects start:{factId,environment,intervalHours:1 or4-8,actualMapScopeConfirmed:true}, current durable map fact and reason; first boundary is strictly future from actual now. No previous interval, encounter, die, actor, table, scene or work is created. One active cadence. operation=stop omits start and retains all history; cannot discard an actually due check. Stop before combat/map departure. An indivisible8h activity may refuse under a shorter selected cadence; no fake pause/resume or completed effort.',inputSchema:EncounterCadenceConfigureSchema.shape},async input=>toolkitTransaction(()=>toolkitResult(configureRandomEncounterCadence(input))))
 server.registerTool('inspect_random_encounter_cadence',{description:'Read the actual adopted cadence, original source/context, next exact world-time boundary and retained linked occurrence checks. No die, time, actor, scene or automatic check.',inputSchema:{},annotations:{readOnlyHint:true}},async()=>toolkitTransaction(()=>toolkitResult(inspectRandomEncounterCadence())))
 server.registerTool('check_random_encounter',{description:'Explicit MJ DMG2014 occurrence check at the actual current scene. method=d20 rolls exactly one unmodified d20, encounter on18+; dm_occurrence or dm_no_occurrence records the explicit MJ decision without dice. Choose checkId and reason. An explicitly adopted general cadence due now also needs its exact cadenceId; the same original occurrence producer fills only that one exact retained window. No default hourly/rest/travel frequency, elapsed interval, actor, combat, player action, discovery or reward is created. Keep the same checkId on retry; changing its method cannot reroll it.',
  inputSchema:{checkId:ToolkitIdSchema,method:EncounterCheckMethodSchema,reason:z.string().trim().min(1).max(1000),cadenceId:ToolkitIdSchema.optional()},
 },async input=>toolkitTransaction(()=>toolkitResult(checkRandomEncounter(input))))
 server.registerTool('draw_random_encounter',{description:'Draw ONE exact supplied source table for an actual retained positive encounter check in the same scene. tableId comes from consult_rules. Keep drawId on retry. Additional draw requires the exact latest previousDrawId and explicit incompatible-context confirmation/reason; never auto-reroll for a preferred result. Actual source dice and row probabilities are retained. No nested quantity, creature, hostility, clue, loot, world fact or combat is created; the model chooses any subsequent real scene tools.',
  inputSchema:{checkId:ToolkitIdSchema,drawId:ToolkitIdSchema,tableId:z.string().min(1).max(100),dieColumn:z.number().int().min(0).max(8).optional(),
   reroll:z.object({previousDrawId:ToolkitIdSchema,contextIncompatibleConfirmed:z.literal(true),reason:z.string().trim().min(1).max(1000)}).strict().optional()},
 },async input=>toolkitTransaction(()=>toolkitResult(drawRandomEncounter(input))))
 server.registerTool('inspect_random_encounters',{description:'Confidential MJ read-only persisted encounter checks/draws and contextual reroll history for this same adventure, optionally one actual checkId. No occurrence, frequency, actor, action, clock, discovery or scene is created.',
  inputSchema:{checkId:ToolkitIdSchema.optional(),view:z.enum(['checks','draws']).default('checks'),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(10).default(5)},annotations:{readOnlyHint:true,idempotentHint:true},
 },async input=>toolkitTransaction(()=>toolkitResult(inspectRandomEncounters(input))))
}
