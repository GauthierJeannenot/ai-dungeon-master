import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { GroundGearRecoveryStartSchema,GroundGearRecoveryWorkSchema,GroundGearRecoveryFinishSchema,GroundGearRecoveryCancelSchema } from '../../lib/ground-gear-recovery-state'
import { startGroundGearRecovery,continueGroundGearRecovery,finishGroundGearRecovery,cancelGroundGearRecovery } from '../ground-gear-recovery'
import { toolkitResult,toolkitTransaction } from '../toolkit'
export function registerGroundGearRecoveryTools(server:McpServer){
 server.registerTool('start_ground_gear_recovery',{
  description:'Begin actual quantified collection of an existing placed ball-bearing/caltrops lot or safely recover one empty hunting trap. Explicit requiredSeconds and real workSeconds are physical MJ adjudication, not a published PHB tariff. Loose units require one REAL owned container or the original pouch still on the ground, its current fact and available capacity for the selected units. Partial collection requires explicitly observed remaining cells and coverage fact, never a density/DC guessed from a count. Measured stock weight means the TOTAL resulting same-kind stock contents, not a fraction of the full bag weight; mass facts required when standard carrying depends on them. An empty original pouch dry mass is separate. Whole actual original lot/trap may return its exact original item. Trap must be unoccupied and have an established safe handling fact, no invented universal disarm check. Work keeps every danger in place until finish. Exploration advances actual time; combat at most6seconds of work per actual action, without clock advance. No free hand, item, container, source, step, die, extra action or refund is fabricated.',
  inputSchema:GroundGearRecoveryStartSchema.shape,annotations:{idempotentHint:true},
 },async input=>toolkitTransaction(()=>toolkitResult(startGroundGearRecovery(input))))
 server.registerTool('continue_ground_gear_recovery',{
  description:'Perform the explicitly selected remaining collection work on the SAME original attempt, placement and real container. Revalidate actual units, cells, empty-trap safety, physical facts, hand, capacity, time/events and actor capability BEFORE credit or payment. Combat work is at most6seconds per actual action and never advances the round clock. Exploration records the actual declared light/strenuous activity interval. No danger, unit or item is removed before finish; merely waiting supplies no work. Exact event replay pays nothing twice.',
  inputSchema:GroundGearRecoveryWorkSchema.shape,annotations:{idempotentHint:true},
 },async input=>toolkitTransaction(()=>toolkitResult(continueGroundGearRecovery(input))))
 server.registerTool('finish_ground_gear_recovery',{
  description:'Complete one exact real collection attempt only when BOTH performed work and actual elapsed time meet its explicit established duration, and actor/place/units/container/capacity are still valid. Auxiliary completion spends no new action or time; it cannot complete early or operate while incapacitated. Transfers exactly selected units, preserves actual remaining dangerous cells and puts contents in the chosen existing container. Same-kind contents in that exact container combine by real counts only. Partial contents never become a free full bag; unmeasured partial/dry-container masses remain unknown. Dropping/retrieving a container physically transfers its real counted contents together, with acquisition capacity checked first. Exact completion replay cannot duplicate anything.',
  inputSchema:GroundGearRecoveryFinishSchema.shape,annotations:{idempotentHint:true},
 },async input=>toolkitTransaction(()=>toolkitResult(finishGroundGearRecovery(input))))
 server.registerTool('cancel_ground_gear_recovery',{
  description:'Explicit bookkeeping cancellation of one unfinished actual collection attempt, including one whose original place/container changed. No unit removed, danger disabled, body activated, time/action refunded or item granted. Retains performed work and immutable receipts. A genuinely completed collection cannot be undone by cancellation.',
  inputSchema:GroundGearRecoveryCancelSchema.shape,annotations:{idempotentHint:true},
 },async input=>toolkitTransaction(()=>toolkitResult(cancelGroundGearRecovery(input))))
}
