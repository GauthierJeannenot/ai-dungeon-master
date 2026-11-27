import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { BreathingContextSchema, BreathingIdSchema } from '../../lib/breathing-state'
import { hero } from '../hero-rules'
import { installBreathingHooks, inspectBreathing, setBreathingContext, type BreathingHooks } from '../breathing'
import { toolkitError, toolkitResult, toolkitTransaction } from '../toolkit'

export function registerBreathingTools(server: McpServer, hooks: BreathingHooks): void {
  installBreathingHooks(hooks)
  server.registerTool('inspect_breathing', {
    description: 'Read the actual active or archived actor breathing episode, original Constitution limits, air/recovery lock and due own-turn collapse. Does not spend time, activate a saved creature or infer underwater context from narration.',
    inputSchema: { entityId: BreathingIdSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => toolkitTransaction(() => toolkitResult(inspectBreathing(input.entityId))))
  server.registerTool('set_breathing_context', {
    description: 'Explicit MJ physical fact for one actual active actor: start holding breath, start choking, or confirm actual air. Retains immutable event receipts and original Constitution deadlines. Choking never resets from a new eventId. Actual air removes the healing/stability lock without granting HP. An NPC needs a death-save policy declared before injury or an existing real zero-HP episode; no narrative statistics or initiative slot is invented.',
    inputSchema: BreathingContextSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => toolkitTransaction(() => {
    if (hero()?.pending) toolkitError('REACTION_PENDING', 'Resolve the held reaction before changing the physical breathing context.')
    return toolkitResult(setBreathingContext(input))
  }))
}
