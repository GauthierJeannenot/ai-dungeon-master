import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StartPitSchema, WorkPitSchema, ResolvePitSchema, SettlePitSchema, AbandonPitSchema } from '../../lib/xge-pit-fighting-state'
import { startXgePitFighting, workXgePitFighting, resolveXgePitFighting, settleXgePitFighting,
  abandonXgePitFighting, inspectXgePitFighting, registerPitResolution } from '../xge-pit-fighting'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerPitFightingTools(server: McpServer) {
  registerPitResolution()
  server.registerTool('start_xge_pit_fighting', {
    description: 'Explicit optional Xanathar pit-fighting downtime, organized predetermined nonlethal bouts only. Choose the actual supported dry current venue fact, real present promoter and distinct actual present opponent IDs. No entry fee, wager, effort, physical encounter, injury, weapon/ammunition expenditure or die is invented. Battles to the death require ordinary combat. Exact retry keeps the original week.',
    inputSchema: StartPitSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(startXgePitFighting(input))))
  server.registerTool('work_xge_pit_fighting', {
    description: 'Spend one real uninterrupted8hour date at the original supported organized pit-fighting venue with its actual qualified participants. Shared downtime budget applies across activities. Five distinct dates; gaps allowed within the represented ten-date window. Further delay refuses before effort pending a future explicit adjudication. No actual attack, combat action, HP change, rest, payment or check is resolved here.',
    inputSchema: WorkPitSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(workXgePitFighting(input))))
  server.registerTool('resolve_xge_pit_fighting', {
    description: 'After five actual pit-fighting workdays resolve STR(Athletics), DEX(Acrobatics) and special CON with one retained roll of the real single-class largest Hit Die, without spending it. Each check has a separate DC 5+2d10; one 10 percent complication chance and source d6 example follow. Optionally replace one chosen skill with an actual held canonical weapon attack roll, retaining real grip, ability, proficiency, properties, conditions and Inspiration. Natural 1 fails and natural 20 succeeds by explicit user convention. No physical attack, target AC, damage, ammunition expense, wound, actor or automatic coin payout is created. Improvised and target-dependent special weapons refuse before dice.',
    inputSchema: ResolvePitSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => resolveXgePitFighting(input)))
  server.registerTool('settle_xge_pit_fighting', {
    description: 'At the actual original venue receive the retained50/100/200gp prize once, using exact selected received coin denominations and a real capable promoter at reach with actual payment explicitly confirmed. Zero successes earns nothing, never debt or negative coins. No promoter purse, scene event or complication consequence is inferred.',
    inputSchema: SettlePitSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(settleXgePitFighting(input))))
  server.registerTool('abandon_xge_pit_fighting', {
    description: 'Explicitly abandon only an unfinished original pit-fighting week. Keep every actual workday and receipt. No entry fee existed, no refund or partial prize is created. A complete result cannot be cancelled.',
    inputSchema: AbandonPitSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(abandonXgePitFighting(input))))
  server.registerTool('inspect_xge_pit_fighting', {
    description: 'Read retained pit-fighting workweeks, source DCs/checks/largest-HD bonus, documentary complication examples and exact prize transfers. No work, dice, payment, injury or encounter.',
    inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: true },
  }, async () => toolkitResult(inspectXgePitFighting()))
}
