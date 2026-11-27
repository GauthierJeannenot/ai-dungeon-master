import { cackleOnsetRemediationAt } from '../cackle-fever'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitIdSchema } from '../../lib/dm-tool-state'
import { available } from '../hero-rules'
import { changeExhaustion, inspectExhaustion } from '../exhaustion'
import { toolkitResult, toolkitTransaction } from '../toolkit'
import { getState } from '../game-state'
import { sewerOnsetRemediationAt } from '../sewer-plague'
import { weatherDueEvents } from '../../lib/weather-state'
import { dueSleepDeprivation } from '../../lib/sleep-state'
import { frigidWaterWardRemediationAt } from '../frigid-water'

export function registerExhaustionTools(server: McpServer) {
  server.registerTool('inspect_exhaustion', {
    description: 'Read exact cumulative PHB 2014 exhaustion level 0–6 and real HP maximum. No roll, rest, recovery, discovery, resurrection or action. Player long-rest recovery requires actual verified nutrition intake; absent or insufficient history remains blocked.',
    inputSchema: { targetId: z.string().default('player') }, annotations: { readOnlyHint: true },
  }, async ({ targetId }) => toolkitTransaction(() => toolkitResult(inspectExhaustion(targetId))))
  for (const operation of ['add', 'remove'] as const) server.registerTool(`${operation}_exhaustion`, {
    description: operation === 'add'
      ? 'Explicit exceptional MJ adjudication: apply 1–6 cumulative PHB 2014 exhaustion levels with factual reason and unique eventId. No player-intent parsing or automatic hazard. Real check/speed/attack/save/maxHP/death effects. Repeat exact eventId returns its receipt without repeating effects.'
      : 'Explicit exceptional MJ adjudication: remove 1–6 exhaustion levels with factual source/reason and unique eventId. When actual exhaustion mixes chase and other sources, select removalSource explicitly; reductions cannot spill into another source. Does not heal current HP, resurrect a corpse, grant rest or certify food/water intake. This is an adjudicated source effect, not automatic long-rest recovery.',
    inputSchema: { eventId: ToolkitIdSchema, targetId: z.string().min(1),
      removalSource:z.enum(['chase','other']).optional(),levels: z.number().int().min(1).max(6), reason: z.string().trim().min(1).max(600) },
  }, async input => toolkitTransaction(() => {
    // A receipt remains readable during a pending reaction: no re-execution occurs.
    const previous = getState().dmTools?.exhaustion?.receipts[input.eventId]
    if (!previous) {
      const state = getState()
      const remedyAt = operation === 'remove' ? sewerOnsetRemediationAt(input.targetId) : undefined
      const frigidRemedyAt = operation === 'remove' ? frigidWaterWardRemediationAt(input.targetId) : undefined
      const cackleRemedyAt=operation==='remove'?cackleOnsetRemediationAt(input.targetId):undefined
      const actualRemedyAt = remedyAt ?? frigidRemedyAt ?? cackleRemedyAt
      // The separate MJ reduction must remain reachable when all simultaneous
      // sources could refuse lethal exhaustion under the same real Ward.
      available({
        allowSewerOnsetAt: remedyAt,
        allowCackleOnsetAt:cackleRemedyAt,
        allowNutritionDue: actualRemedyAt !== undefined && state.dmTools?.survival?.day.endsAt === actualRemedyAt,
        allowWeatherDue: actualRemedyAt !== undefined && weatherDueEvents(state).every(event => event.at === actualRemedyAt),
        allowSleepDue: actualRemedyAt !== undefined && dueSleepDeprivation(state)?.at === actualRemedyAt,
        allowFrigidWaterDue: frigidRemedyAt !== undefined,
      })
    }
    const {removalSource,...command}=input
    return toolkitResult(changeExhaustion({ ...command, operation },removalSource?{removalSource}:{}))
  }))
}
