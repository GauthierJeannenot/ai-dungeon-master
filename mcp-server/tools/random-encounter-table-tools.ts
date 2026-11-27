import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CampaignEncounterTableInputSchema } from '../../lib/random-encounter-table-state'
import { createCampaignEncounterTable,inspectCampaignEncounterTables } from '../random-encounter-tables'
import { toolkitResult,toolkitTransaction } from '../toolkit'
export function registerCampaignEncounterTableTools(server:McpServer){
 server.registerTool('create_random_encounter_table',{description:'MJ authors one immutable campaign: reference table using standard DMG2014 table creation. Explicit title/theme, adventure or existing-map scope,1–4real standard dice and complete nonoverlapping entry ranges determine exact likelihood. Table content is campaign authored, never claimed supplied book text. No actor, hostility, clue, reward, event, time, occurrence, adopted house rule or combat is created. Revisions require a distinct tableId; retries cannot replace entries/dice or rewind prior draws.',inputSchema:CampaignEncounterTableInputSchema,annotations:{idempotentHint:true}},async input=>toolkitTransaction(()=>toolkitResult(createCampaignEncounterTable(input))))
 server.registerTool('inspect_random_encounter_tables',{description:'Read-only confidential MJ pagination of actual campaign-authored table summaries, or explicit entries of one chosen table. No draw, occurrence, player knowledge, frequency or gameplay effect.',inputSchema:{tableId:z.string().min(1).max(100).optional(),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(10).default(5)},annotations:{readOnlyHint:true,idempotentHint:true}},async input=>toolkitTransaction(()=>toolkitResult(inspectCampaignEncounterTables(input))))
}
