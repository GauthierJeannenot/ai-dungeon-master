import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { RecordRazorvineSchema, ResolveRazorvineContactSchema } from '../../lib/razorvine-state'
import { inspectRazorvine, recordRazorvine, registerRazorvineResolutions, resolveRazorvineContact } from '../razorvine'
import { getState } from '../game-state'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerRazorvineTools(server: McpServer) {
  registerRazorvineResolutions()
  server.registerTool('record_razorvine', {
    description: 'MJ qualifies an existing rooted razorvine hedge from a durable public scene fact and a single measured ground support. Its exact 10x10x5-foot source profile is 11 AC, 25 HP, and bludgeoning/piercing/psychic immunity. Choose both real orthogonally adjacent footprint cells and state the hedge’s actually observed opacity. No creature, touch, movement or discovery is created.',
    inputSchema: RecordRazorvineSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(recordRazorvine(input))))
  server.registerTool('inspect_razorvine', {
    description: 'Read the actual sourced hedges, fixed dimensions and retained direct contact receipts on the current map.',
    inputSchema: { hedgeId: z.string().optional() }, annotations: { readOnlyHint: true, idempotentHint: true },
  }, async input => toolkitResult(inspectRazorvine(getState(), input.hedgeId)))
  server.registerTool('resolve_razorvine_contact', {
    description: 'MJ attests a direct contact that actually occurred with the exact reachable face and real body on the same ground level during active initiative. On this creature’s first direct contact with any razorvine this actual turn, resolve DC 10 Dexterity save and 1d10 slashing only on failure. No action, movement or touching choice is created by this call.',
    inputSchema: ResolveRazorvineContactSchema.shape,
  }, async input => toolkitTransaction(() => resolveRazorvineContact(input)))
}
