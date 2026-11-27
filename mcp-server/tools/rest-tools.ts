import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitIdSchema, ToolkitDescriptionSchema } from '../../lib/dm-tool-state'
import { beginRest, advanceRest, observeRestActivity, finishRest, spendRestHitDie, abandonRest, inspectRest } from '../resting'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerRestTools(server: McpServer) {
  server.registerTool('inspect_rest', {
    description: 'Read the current or exact saved rest period, actual credited activity, eligibility and unobserved gaps. No time, sleep, dice, resource recovery or completion is granted.',
    inputSchema: { restId: ToolkitIdSchema.optional() }, annotations: { readOnlyHint: true, idempotentHint: true },
  }, async ({ restId }) => toolkitTransaction(() => toolkitResult(inspectRest(restId))))
  server.registerTool('begin_rest', {
    description: 'Begin one explicitly selected standard 2014 short or long rest at the current real clock and HP. Does not advance time, grant sleep, heal or renew resources. Exact retries retain progress. A long rest needs at least 1 HP at its actual start; a stable living zero-HP player may begin a short rest. Finish or explicitly abandon an existing period before another one.',
    inputSchema: { restId: ToolkitIdSchema, kind: z.enum(['short', 'long']) },
    annotations: { readOnlyHint: false, idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(beginRest(input))))
  server.registerTool('advance_rest', {
    description: 'Perform an explicitly chosen positive duration of actual sleep or light activity in the recorded rest, outside combat. Advances real time with all due-event gates before costs. Sleep has a real timed unconscious source, drops actually held objects and ends concentration; wake at the chosen interval end does not remove another unconscious source or stand/rearm. Stop at an actual hazard boundary, resolve it explicitly, then continue the saved period. This grants no rest benefits yet. An outside time gap must first be observed, never credited as sleep. Exact activity retries do not repeat time.',
    inputSchema: { restId: ToolkitIdSchema, eventId: ToolkitIdSchema,
      seconds: z.number().int().min(1).max(28800), activity: z.enum(['sleep', 'light']), reason: ToolkitDescriptionSchema },
    annotations: { readOnlyHint: false, idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(advanceRest(input))))
  server.registerTool('record_rest_activity', {
    description: 'Explicit MJ observation of the actual interval or state change since this rest last progressed. Classify it as light or strenuous, with factual reason; cannot invent sleep, backdate before this period, perform an action or advance time. Known movement and combat must be strenuous. A short rest breaks on strenuous activity; a recorded long period breaks at one accumulated hour, a documented engine interpretation. Actual gaps and zero-time mechanical events remain witnessed and retries never add credit.',
    inputSchema: { restId: ToolkitIdSchema, eventId: ToolkitIdSchema, activity: z.enum(['light', 'strenuous']), reason: ToolkitDescriptionSchema },
    annotations: { readOnlyHint: false, idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(observeRestActivity(input))))
  server.registerTool('finish_rest', {
    description: 'Complete ONE actual recorded rest only when real duration, sleep/light limits, interruptions and start HP satisfy standard 2014 rules. Short-rest hit dice, Song of Rest and Arcane Recovery are explicit choices, validated before their rolls/costs. Long-rest benefits remain limited to once per 24 hours. Symptomatic Sewer Plague prevents its HP recovery and halves healing from actual spent Hit Dice. After real long-rest recovery, resolve its exact retained CON11 event separately. Uses existing authoritative recovery effects and pays no second hour/eight hours. Exact immutable completion retries never repeat healing, dice or resources. Unresolved hazards, absent air and missing activity observations still refuse.',
    inputSchema: { restId: ToolkitIdSchema, hitDice: z.number().int().min(0).max(7).optional(),
      arcaneRecovery: z.array(z.number().int().min(1).max(4)).optional(), songOfRest: z.boolean().optional() },
    annotations: { readOnlyHint: false, idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(finishRest(input))))
  server.registerTool('abandon_rest', {
    description: 'Explicitly abandon the exact recorded rest without benefits. Keeps its real performed history and an immutable conclusion; never rewinds time, refunds an action, heals or resets a hazard.',
    inputSchema: { restId: ToolkitIdSchema, reason: ToolkitDescriptionSchema },
    annotations: { readOnlyHint: false, idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(abandonRest(input))))
  server.registerTool('spend_rest_hit_die', {
    description: 'At the SAME actually completed short-rest end, explicitly choose ONE additional remaining hit die after seeing the previous result, with unique immutable eventId. No extra hour, resource renewal or later-injury healing. Optional eligible Song of Rest can apply only once and only when the hit die actually restores HP. Exact retries return their die without rolling or spending twice. Time, combat or intervening actual activity closes this end-of-rest decision.',
    inputSchema: { restId: ToolkitIdSchema, eventId: ToolkitIdSchema, songOfRest: z.boolean().optional() },
    annotations: { readOnlyHint: false, idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(spendRestHitDie(input))))
}
