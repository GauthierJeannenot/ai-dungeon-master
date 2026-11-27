import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TemporaryHpDurationSchema } from '../../lib/temporary-hp-state'
import { ToolkitIdSchema } from '../../lib/dm-tool-state'
import { available } from '../hero-rules'
import { grantTemporaryHp, inspectTemporaryHp } from '../temporary-hp'
import { toolkitResult, toolkitTransaction } from '../toolkit'
import * as gs from '../game-state'

export function registerTemporaryHpTools(server: McpServer) {
  server.registerTool('inspect_temporary_hp', {
    description: 'Read PHB 2014 temporary HP as a separate buffer, actual HP, and exact remaining source. No grant, roll, healing, action or recovery.',
    inputSchema: { targetId: z.string().default('player') }, annotations: { readOnlyHint: true },
  }, async ({ targetId }) => toolkitTransaction(() => toolkitResult(inspectTemporaryHp(targetId))))
  server.registerTool('grant_temporary_hp', {
    description: 'Exceptional explicit MJ adjudication of an established temporary-HP source, with unique immutable eventId and exact target/amount/source/duration. Never a free player ability, spell cast, healing or resurrection. If an active pool remains the PLAYER must explicitly choose keep or replace; no automatic maximum or stacking. No-duration sources end at a completed long rest; a source duration instead governs timed expiry.',
    inputSchema: { eventId: ToolkitIdSchema, targetId: z.string().min(1), sourceId: ToolkitIdSchema,
      sourceDescription: z.string().trim().min(1).max(300), amount: z.number().int().min(1).max(10000),
      duration: TemporaryHpDurationSchema, choice: z.enum(['keep', 'replace']).optional() },
  }, async input => toolkitTransaction(() => {
    if (!gs.getState().dmTools?.temporaryHp?.receipts[input.eventId]) available()
    return toolkitResult(grantTemporaryHp(input))
  }))
}
