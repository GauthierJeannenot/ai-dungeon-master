import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { AbandonGamblingSchema, PayGamblingDebtSchema, ResolveGamblingSchema, SettleGamblingSchema,
  StartGamblingSchema, WorkGamblingSchema } from '../../lib/xge-gambling-state'
import { abandonXgeGambling, inspectXgeGambling, payXgeGamblingDebt, registerGamblingResolution, resolveXgeGambling,
  settleXgeGambling, startXgeGambling, workXgeGambling } from '../xge-gambling'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerXgeGamblingTools(server: McpServer) {
  registerGamblingResolution()
  server.registerTool('start_xge_gambling', {
    description: 'Explicitly adopt this optional Xanathar activity. Choose the actual gambling venue fact at the current supported location, the actual capable venue creditor, and exact held coins worth 10–1,000 gp and divisible into whole copper halves. Places the real stake once, with no effort, roll or result.',
    inputSchema: StartGamblingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(startXgeGambling(input))))
  server.registerTool('work_xge_gambling', {
    description: 'Spend one uninterrupted eight-hour workday at the original actual gambling venue outside combat and rest. Uses the shared physical downtime ledger. Five distinct dates, with gaps allowed within the supported ten-date span. No automatic roll or money transfer.',
    inputSchema: WorkGamblingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(workXgeGambling(input))))
  server.registerTool('resolve_xge_gambling', {
    description: 'After five actual gambling workdays, explicitly choose the three published checks. One actual mastered dice or dragonchess set can replace chosen skills in a locally qualified game, with the same ability and one tool proficiency. Roll a separate 5+2d10 DC for Wisdom (Insight), Charisma (Deception) and Charisma (Intimidation), then a 10% complication with the actual retained source example when triggered. React to any original held check via resolve_reaction. No automatic narrative consequence or coin payout.',
    inputSchema: ResolveGamblingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => resolveXgeGambling(input)))
  server.registerTool('settle_xge_gambling', {
    description: 'At the original gambling venue, receive exactly the resolved gross return in explicitly chosen denominations from the actual venue representative. This is 50%, 150% or 200% of the original stake according to the retained successes. No reroll, time or invented debt repayment.',
    inputSchema: SettleGamblingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(settleXgeGambling(input))))
  server.registerTool('pay_xge_gambling_debt', {
    description: 'Pay part or all of the actual outstanding gambling debt to the exact original present creditor in actual held denominations. No interest, overpayment, automatic collection or reset.',
    inputSchema: PayGamblingDebtSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(payXgeGamblingDebt(input))))
  server.registerTool('abandon_xge_gambling', {
    description: 'Explicitly abandon an unfinished gambling workweek and confirm forfeiting the paid stake. Keep elapsed work, history and money already paid. Cannot cancel a complete week, outcome or debt.',
    inputSchema: AbandonGamblingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(abandonXgeGambling(input))))
  server.registerTool('inspect_xge_gambling', {
    description: 'Read the exact gambling workweek, results, transfers and outstanding balance. No work, roll or transfer.',
    inputSchema: {}, annotations: { readOnlyHint: true },
  }, async () => toolkitResult(inspectXgeGambling()))
}
