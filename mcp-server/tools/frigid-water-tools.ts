import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { RecordFrigidWaterSchema } from '../../lib/frigid-water-state'
import { inspectFrigidWater, recordFrigidWater, registerFrigidWaterContinuation, resolveFrigidWaterSave } from '../frigid-water'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerFrigidWaterTools(server: McpServer) {
  registerFrigidWaterContinuation()
  server.registerTool('record_frigid_water', {
    description: 'Before entry, classify one actual measured water medium as frigid using its existing exact local scene fact and an explicit MJ confirmation. No temperature threshold, water, wet body, adaptation, past duration or roll is created.',
    inputSchema: RecordFrigidWaterSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(recordFrigidWater(input))))
  server.registerTool('inspect_frigid_water', {
    description: 'Read actual retained water classifications, the current player immersion episode and its next or due save. No movement, time, action or die.',
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async () => toolkitResult(inspectFrigidWater()))
  server.registerTool('resolve_frigid_water_save', {
    description: 'Resolve one exact actually due DMG2014 frigid-water CON DC10 save, after the real Constitution-score minutes and one completed additional minute. Cold resistance can automatically succeed. A failed save adds one actual exhaustion level. A held save retains its original dice and replay never applies exhaustion twice. No player action or arbitrary time is spent.',
    inputSchema: { eventId: z.string().min(1).max(180) },
  }, async ({ eventId }) => toolkitTransaction(() => resolveFrigidWaterSave(eventId)))
}
