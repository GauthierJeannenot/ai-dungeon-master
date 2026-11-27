import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { DM_INSPIRATION_ROLL_KINDS } from '../../lib/dm-inspiration-state'
import { ToolkitIdSchema } from '../../lib/dm-tool-state'
import { grantDmInspiration, prepareDmInspiration } from '../dm-inspiration'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerDmInspirationTools(server: McpServer) {
  server.registerTool('grant_inspiration', {
    description: 'Explicit MJ award of PHB/DMG 2014 Inspiration to the one SRD player, with a unique eventId and concrete reason chosen by the AI. Maximum one capacity, including a token already reserved for a roll; never stacks or rewards text automatically. A capped award is remembered, so replay after later spending cannot grant it again. Identical events are idempotent, changed reasons refuse. No numeric roleplay bonus, Bardic Inspiration die, action or d20 is granted. No grant during an already rolled held reaction. Does not satisfy a planned player action.',
    inputSchema: { eventId: ToolkitIdSchema, reason: z.string().trim().min(1).max(300) },
    annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ eventId, reason }) => toolkitTransaction(() => toolkitResult(grantDmInspiration(eventId, reason))))
  server.registerTool('spend_inspiration', {
    description: 'Before a roll, explicitly reserve the held PHB2014 Dungeon Master Inspiration for the next actual player attack/check/save d20. Requires unique spendId and exact rollKind; no inferred category, target, attack or check. Gives advantage, not a numerical bonus or a reroll of an existing result. The first valid matching d20 consumes it even if advantage is redundant or cancelled by disadvantage. Invalid actions, another actor/category, automatic failures and generic roll_dice do not consume it. No use during a held Bardic/reaction result. Replaying an old consumed spend never prepares it again. This preparation is not a player action or resolution of the planned roll; the AI must explicitly call that actual resolver afterwards.',
    inputSchema: { spendId: ToolkitIdSchema, rollKind: z.enum(DM_INSPIRATION_ROLL_KINDS) },
    annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ spendId, rollKind }) => toolkitTransaction(() => toolkitResult(prepareDmInspiration(spendId, rollKind))))
}
