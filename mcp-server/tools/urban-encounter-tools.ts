import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { UrbanCheckInputSchema, UrbanRerollInputSchema } from '../../lib/urban-encounter-state'
import { checkUrbanEncounter, inspectUrbanEncounters, rerollUrbanEncounter } from '../urban-encounters'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerUrbanEncounterTools(server: McpServer) {
  server.registerTool('check_urban_encounter', {
    description: 'Explicit confidential MJ check for the actual current urban district, backed by a durable local district fact and two exact daily local physical calendar references for day/night. Night requires an actual outing confirmation. Choose draw for one printed d12+d8 proposal, no_encounter without dice, or d20 for one unmodified d20 followed by d12+d8 only on 18+. An additional daytime check requires the latest check ID, the original district fact and a separate one-time local calendar reference recorded at a later actual instant. Night retains one check. No gameplay, scene occurrence, action or time.',
    inputSchema: UrbanCheckInputSchema,
    annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(checkUrbanEncounter(input))))
  server.registerTool('reroll_urban_encounter', {
    description: 'Confidential actual d12+d8 redraw for the exact latest proposal of one retained check, only at its original actual hour and district after explicit MJ time incompatibility confirmation and reason. The occurrence decision and its die are retained unchanged. Reconfirm an actual outing at night. Reuse the original eventId and inputs for a retry. Never stages an encounter.',
    inputSchema: UrbanRerollInputSchema,
    annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(rerollUrbanEncounter(input))))
  server.registerTool('inspect_urban_encounters', {
    description: 'Confidential read-only projection of the current adopted urban hours, phase coverage and retained checks. With checkId, read that original decision and exact redraw chain. No check, dice, encounter or time.',
    inputSchema: { checkId: UrbanCheckInputSchema.shape.eventId.optional(), offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(10).default(5) },
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(inspectUrbanEncounters(input))))
}
