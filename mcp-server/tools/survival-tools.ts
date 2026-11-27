import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SurvivalBeginSchema, ConsumeProvisionsSchema, SurvivalDaySchema } from '../../lib/survival-state'
import { inspectSurvival, beginNutritionTracking, consumeProvisions, resolveSurvivalDay, registerSurvivalContinuations } from '../survival'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerSurvivalTools(server: McpServer) {
  registerSurvivalContinuations()
  server.registerTool('inspect_survival', {
    description: 'Read the actual single-player nutrition day, quantified provisions, intake, pending deprivation and long-rest eligibility. No food, water, consumption, clock advance, save or exhaustion change. Missing legacy history remains unknown.',
    inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: true },
  }, async () => toolkitTransaction(() => toolkitResult(inspectSurvival())))
  server.registerTool('begin_nutrition_tracking', {
    description: 'Explicit MJ establishment of standard PHB2014 food/water needs, actual hot-weather fact and known initial food-deprivation history. No racial need or past meal is inferred and no provision is granted. One initial begin only; stable eventId replays without resetting. resume_after_death requires actual engine-suspended history and successful resurrection; preserves deprivation and inventory, never resurrects or removes exhaustion.',
    inputSchema: SurvivalBeginSchema,
  }, async input => toolkitTransaction(() => toolkitResult(beginNutritionTracking(input))))
  server.registerTool('consume_provisions', {
    description: 'Player explicitly consumes actual quantified contents of one exact owned ration, collected foraged-food instance, legacy waterskin or tracked real water container. Food units are whole half-pounds; tracked-water units are PINTS in quarter-pint increments. Actual remaining owned contents only, outside combat, current unexpired nutrition day. No purchase, new forage yield, refill, free vessel/food/water or retroactive intake. Known explicitly established hazards require their specific source resolution; ordinary resources need no purity certificate. Empty water containers remain and fully eaten food is removed. Immutable event receipt prevents double consumption. For a real ingested poison, the entire dose follows the same committed intake and original CON/retained midnight. Partial portions need poisonPortionAdjudicationId from the explicit whole-dose physical ruling; no proportional potency is inferred.',
    inputSchema: ConsumeProvisionsSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(consumeProvisions(input))))
  server.registerTool('resolve_survival_day', {
    description: 'Resolve exactly one actually elapsed tracked PHB2014 nutrition day. Food threshold uses actual Constitution; half-ration is half a deprivation day. Water needs one gallon/eight pints or two gallons/sixteen pints in actual hot weather; half supply requires CON save DC15, less is automatic exhaustion, doubled if already exhausted. If food and water effects are simultaneous, explicit MJ order is required because PHB gives no order. Held Bardic save resumes original dice; corpse receives no further phases. nextHotWeather and source establish next day facts; no time advance, intake or invented MCP action. Stable eventId replays exact completed result.',
    inputSchema: SurvivalDaySchema.shape,
  }, async input => toolkitTransaction(() => resolveSurvivalDay(input)))
}
