import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitIdSchema, ToolkitCellSchema } from '../../lib/dm-tool-state'
import { CheckSelectionSchema, GroupCheckInputSchema, CheckHelpInputSchema } from '../../lib/check-mode-state'
import { resolvePassiveCheck, provideCheckHelp, resolveGroupCheck, registerGroupCheckContinuation } from '../check-modes'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerCheckModeTools(server: McpServer) {
  registerGroupCheckContinuation()
  server.registerTool('resolve_passive_check', {
    description: 'PHB2014 passive check outside combat: 10 + actual ability/skill modifiers, +5 advantage/-5 disadvantage, normal cancellation. No dice, help consumption, action, Bardic die or DM Inspiration spend. Canonical skill/ability only. Does not discover/reveal content or bypass dedicated social, hiding, secret-door, trap or affliction resolvers. Sight-based blindness automatically fails. Explicit situational flags require reason.',
    inputSchema: { ...CheckSelectionSchema.shape, entityId: ToolkitIdSchema, dc: z.number().int().min(0).max(100).optional(), sightBased: z.boolean().optional(), targetCell: ToolkitCellSchema.optional(),
      advantage: z.boolean().optional(), disadvantage: z.boolean().optional(), advantageReason: z.string().trim().min(1).max(600).optional() },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
  }, async input => toolkitTransaction(() => toolkitResult(resolvePassiveCheck(input))))
  server.registerTool('provide_check_help', {
    description: 'PHB2014 Working Together for one immediate out-of-combat task. Exact different helper/beneficiary must be active living actors in the same room and adjacent; NPC requires existing real statistics, visible helpful disposition and nonhostility, never fabricated proficiency. AI must explicitly establish that helper can attempt task alone and collaboration is productive; requiredToolId additionally validates actual tool ownership/proficiency (NPC tool data unsupported). One advantage for next matching canonical ability/skill attempt in same scene/time; no stacking. Use dedicated combat Help in combat. Event receipt never refreshes consumed help.',
    inputSchema: CheckHelpInputSchema.shape,
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false, destructiveHint: false },
  }, async input => toolkitTransaction(() => toolkitResult(provideCheckHelp(input))))
  server.registerTool('resolve_group_check', {
    description: 'PHB2014 explicit out-of-combat group check for 2-8 actual present cooperating actors, including the sole player. Every distinct participant is validated before any d20/resource. NPCs need already active living statistics, visible helpful disposition and nonhostility, no reactive controller. No invented party, stats, proficiency, social target, skill/ability variant or narrated hazard effect. Exact shared canonical ability/skill and DC; at least half successes required. Rolls use existing engine and pause for Bardic reactions; immutable eventId receipts preserve resolved and held rolls across retry/restore without rerolling. Returned group outcome must be applied through dedicated content resolver where appropriate.',
    inputSchema: GroupCheckInputSchema.shape,
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false, destructiveHint: false },
  }, async input => toolkitTransaction(() => resolveGroupCheck(input)))
}
