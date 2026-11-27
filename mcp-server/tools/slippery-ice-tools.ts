import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { RecordSlipperyIceSchema } from '../../lib/slippery-ice-state'
import { inspectSlipperyIce, recordSlipperyIce, registerSlipperyIceResolution, resolveSlipperyIceEntry } from '../slippery-ice'
import { getState } from '../game-state'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerSlipperyIceTools(server: McpServer) {
  registerSlipperyIceResolution()
  server.registerTool('record_slippery_ice', {
    description: 'Qualify actual slippery ice on explicitly chosen cells of a real previously measured terrain support, backed by a durable public scene fact. Does not move a body, start initiative, or create thin ice.',
    inputSchema: RecordSlipperyIceSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(recordSlipperyIce(input))))
  server.registerTool('inspect_slippery_ice', {
    description: 'Read actual measured slippery ice and existing pending or resolved entry receipts on this map.',
    inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: true },
  }, async () => toolkitResult(inspectSlipperyIce(getState())))
  server.registerTool('resolve_slippery_ice_entry', {
    description: 'Resolve the exact first committed supported ice entry on the actual initiative turn: ordinary paid walking, or the one real five-foot player Shove Aside with its original paid attack and source-linked contact. Dexterity (Acrobatics) DC 10 ability check; on failure apply prone once. An offered reaction retains the original check. No extra action, forced-target movement cost, destination or repeated check.',
    inputSchema: { contactId: z.string().min(1).max(180) },
  }, async input => toolkitTransaction(() => resolveSlipperyIceEntry(input.contactId)))
}
