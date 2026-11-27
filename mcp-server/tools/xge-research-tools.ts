import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  AdoptXgeResearchSchema, StartXgeResearchSchema, WorkXgeResearchSchema, ResolveXgeResearchSchema,
  SettleXgeResearchSchema, CancelXgeResearchSchema,
} from '../../lib/xge-research-state'
import {
  adoptXgeResearch, startXgeResearch, workXgeResearch, resolveXgeResearch, settleXgeResearch,
  cancelXgeResearch, inspectXgeResearch, registerXgeResearchResolution,
} from '../xge-research'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerXgeResearchTools(server: McpServer) {
  registerXgeResearchResolution()
  server.registerTool('adopt_xge_research', {
    description: 'Explicitly adopt the optional XGE Research procedure with the actual durable MJ decision fact. No time, cost or discoveries on adoption.',
    inputSchema: AdoptXgeResearchSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(adoptXgeResearch(input))))
  server.registerTool('start_xge_research', {
    description: 'Open one actual Research project about an existing published profileId, with real library or present willing sage access and durable local fact. Exceptional source advantage requires its own separately established fact. A profile topic never identifies a hidden instance, location, quest clue or password.',
    inputSchema: StartXgeResearchSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(startXgeResearch(input))))
  server.registerTool('work_xge_research', {
    description: 'Spend actual time at the retained supported site with the shared 8h day budget. Only the first real interval pays explicit wallet denominations totaling at least 50gp. Five distinct actual 8h dates within ten dates from first effort. Waiting, a calendar label and an old project give no effort. The original deadline, expenses and work persist on refusal.',
    inputSchema: WorkXgeResearchSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(workXgeResearch(input))))
  server.registerTool('resolve_xge_research', {
    description: 'After the actual five days, resolve one retained INT check with normal check rules and +1 per full 50gp beyond the initial 50gp (maximum +6). The separate d100 grants a complication on 1–10. Explicitly choose the real d6 table or source row with its fact. The result earns a 0–3 statement quota; it reveals no statement.',
    inputSchema: ResolveXgeResearchSchema.shape,
  }, async input => toolkitTransaction(() => resolveXgeResearch(input)))
  server.registerTool('settle_xge_research', {
    description: 'Choose exactly the earned distinct eligible loreIds from inspect_xge_research, and explicitly adjudicate any actual complication with its durable fact. Records only source-derived profile truths. No free-form assertion, clue, quest outcome, item, effect or false lead.',
    inputSchema: SettleXgeResearchSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(settleXgeResearch(input))))
  server.registerTool('cancel_xge_research', {
    description: 'Explicitly cancel the original incomplete Research project. Keep all actual days and expenses. A completed workweek must receive its original result and complication.',
    inputSchema: CancelXgeResearchSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(cancelXgeResearch(input))))
  server.registerTool('inspect_xge_research', {
    description: 'Read actual project stages and settled lore. Only after the result, exposes opaque eligible lore IDs without their assertion values. No roll, cost, effort or discovery.',
    inputSchema: {}, annotations: { readOnlyHint: true },
  }, async () => toolkitResult(inspectXgeResearch()))
}
