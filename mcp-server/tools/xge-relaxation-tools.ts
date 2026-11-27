import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StartRelaxationSchema, AdvanceRelaxationSchema, FinishRelaxationSchema } from '../../lib/xge-relaxation-state'
import { startRelaxation, advanceRelaxation, finishRelaxation, inspectRelaxation } from '../xge-relaxation'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerXgeRelaxationTools(server: McpServer) {
  server.registerTool('start_xge_relaxation', {
    description: 'Explicitly adopt one actual XGE Relaxation week at the durable local supported lifestyle site. Pay exact held denominations for seven days at PHB Modest, Comfortable or Wealthy prices. This buys lifestyle coverage, with no separate coins spent for modeled provisions, and creates no food item, intake or long rest.',
    inputSchema: StartRelaxationSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(startRelaxation(input))))
  server.registerTool('advance_xge_relaxation', {
    description: 'Spend one measured interval of actual quiet leisure at the paid site. This tranche tracks eight hours on each of seven consecutive engine dates. Existing calendar, breathing, rest, nutrition and source boundaries remain real. During an observed rest this is light activity only. A genuine affliction recovery save at the measured endpoint can qualify for advantage.',
    inputSchema: AdvanceRelaxationSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(advanceRelaxation(input))))
  server.registerTool('finish_xge_relaxation', {
    description: 'At the exact endpoint of the interval that completes seven actual qualified dates, choose one active nonmagical Pale Tincture healing restriction. You can decline the benefit later. Release permanently removes the healing block of this dose, restores no HP, and retains its poison, future saves and healable damage. Or explicitly abandon the original paid week and retain all actual expenses and time.',
    inputSchema: FinishRelaxationSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(finishRelaxation(input))))
  server.registerTool('inspect_xge_relaxation', {
    description: 'Read the exact paid lifestyle, measured leisure dates and selected conclusion. Inspection consumes no time, funds or dice.',
    inputSchema: {}, annotations: { readOnlyHint: true },
  }, async () => toolkitResult(inspectRelaxation()))
}
