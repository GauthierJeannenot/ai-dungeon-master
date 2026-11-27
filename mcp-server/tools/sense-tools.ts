import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { inspectCreatureSenses } from '../senses'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerSenseTools(server: McpServer) {
  server.registerTool('inspect_creature_senses', {
    description: 'Read the exact existing observer creature native PHB/SRD2014 sense profile from the frozen monster source; optionally evaluate perception of one explicit target creature. Range uses the current 5-foot grid, physical walls/closed doors and anchored total cover still block. Blindsight perceives without sight in range (including invisible targets/blinded observer); naturally blind creatures cannot see beyond that source radius. Truesight visibility facets require a real native source and do not restore blinded sight. Existing See Invisibility effects alone do not illuminate darkness. Tremorsense reports a source range only: contact/vibrations/flying/incorporeal rules are not modeled, so it grants no sight. No racial grant, condition removal, hidden-target discovery, search check, spell, die, action, movement or state mutation. Magical darkness, fog, illusion, shape/plane revelations are not established or inferred by this tool.',
    inputSchema: { observerId: z.string().min(1).max(100), targetId: z.string().min(1).max(100).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => toolkitTransaction(() => toolkitResult(inspectCreatureSenses(input.observerId, input.targetId))))
}
