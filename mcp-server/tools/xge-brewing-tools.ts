import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { BrewHealingPotionSchema } from '../../lib/xge-brewing-state'
import { brewHealingPotion, inspectXgeBrewing } from '../xge-brewing'
import { AbandonGreaterBrewingSchema, AdjudicateGreaterBrewingDelaySchema, StartGreaterBrewingSchema, StartHealingPotionProjectSchema, WorkGreaterBrewingSchema } from '../../lib/xge-greater-brewing-state'
import { abandonGreaterHealingPotion, adjudicateGreaterHealingDelay, startGreaterHealingPotion, workGreaterHealingPotion } from '../xge-greater-brewing'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerXgeBrewingTools(server: McpServer) {
  server.registerTool('start_xge_healing_potion_project', {
    description: 'Explicit Xanathar superior or supreme healing potion project. Choose potionType superior for 15 distinct actual eight-hour workdates and 1,000 gp supplies, or supreme for 20 dates and 10,000 gp. Select the owned proficient herbalism kit, unused real one-dose ordinary supplies at the supported dry worksite, future physical item ID and exact held denominations. The adopted MJ convention buys supplies once at start, with no automatic refund after abandonment. No time, workday, potion, crafting check, exotic ingredient or formula is granted. Actual acquisition and use remain separate.',
    inputSchema: StartHealingPotionProjectSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(startGreaterHealingPotion(input, true))))
  server.registerTool('work_xge_healing_potion_project', {
    description: 'Contribute one distinct actual uninterrupted eight-hour date to the original superior or supreme project at its original supported dry worksite using the same owned proficient herbalism kit. Shared downtime budget and all real event boundaries apply. Only the 15th superior or 20th supreme workdate creates the canonical physical potion, with 8d4+8 or 10d4+20 healing. Initial calendar window is 30 or 40 dates from first effort. After a retained deadline expires, the MJ must explicitly adjudicate the real delay. No automatic payment, rest, crafting roll or complication roll is created.',
    inputSchema: WorkGreaterBrewingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(workGreaterHealingPotion(input, true))))
  server.registerTool('adjudicate_xge_healing_potion_delay', {
    description: 'MJ decision for a real unfinished superior or supreme project only after its actual retained deadline has elapsed. Choose distinct durable local decision and actually introduced extra-complication facts, confirm any mechanical consequences are already resolved or absent, and a finite new engine-date deadline within 365 dates of first effort. Select explicit held payment denominations, including zero. All supplementary expenses combined are capped at the original recipe cost, 1,000 or 10,000 gp, across the whole project including repeated delays, by the chosen MJ convention. No automatic expense, effect, time, supplies, workday, refund or potion. The original actual effort remains required.',
    inputSchema: AdjudicateGreaterBrewingDelaySchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(adjudicateGreaterHealingDelay(input, true))))
  server.registerTool('abandon_xge_healing_potion_project', {
    description: 'Explicitly abandon only an unfinished superior or supreme healing-potion project, retaining original spending, supplementary expenses, supplies and all actual effort. No automatic refund or potion. Completed doses and prior abandonment cannot be erased. The physical output identity remains reserved and the supplies cannot be reused for a second dose.',
    inputSchema: AbandonGreaterBrewingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(abandonGreaterHealingPotion(input, true))))
  server.registerTool('adjudicate_xge_greater_healing_delay', {
    description: 'MJ adjudication for the actual unfinished greater-potion project only after its retained deadline has really elapsed. Choose distinct durable public local decision and actually introduced extra-complication facts, confirm its mechanical consequences are already separately resolved or absent, and set a finite engine-date deadline within 365 dates of the first effort. Explicit held denominations pay zero or discretionary supplementary expenses, globally capped at 100 gp over the entire project including repeated delays, by the adopted MJ convention. No automatic complication roll, effect, action, time, refund, new supplies, potion or workday is granted. Original five real eight-hour dates and physical worksite/kit still apply.',
    inputSchema: AdjudicateGreaterBrewingDelaySchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(adjudicateGreaterHealingDelay(input))))
  server.registerTool('start_xge_greater_healing_potion', {
    description: 'Explicit optional Xanathar greater-healing potion project. At the actual supported dry worksite choose owned proficient herbalism kit, unused one-dose ordinary supplies and exact held denominations worth 100 gp. Supplies are bought once now by the explicitly chosen MJ convention. No effort, clock, potion or crafting roll is granted. Five later distinct actual eight-hour workdays are required. No automatic refund on abandonment.',
    inputSchema: StartGreaterBrewingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(startGreaterHealingPotion(input))))
  server.registerTool('work_xge_greater_healing_potion', {
    description: 'Contribute one actual uninterrupted eight-hour date to the selected original greater-healing project using the original owned proficient kit at its actual supported dry worksite. Shared downtime budget applies. Five distinct dates produce one canonical 4d4+4 potion physically at the site for explicit pickup/use. The initial deadline is ten dates from first effort; after any retained deadline elapses, explicitly adjudicate the actual delay before more work. No automatic expense, complication, rest or crafting roll.',
    inputSchema: WorkGreaterBrewingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(workGreaterHealingPotion(input))))
  server.registerTool('abandon_xge_greater_healing_potion', {
    description: 'Explicitly abandon only an unfinished greater-healing project. Retain all original actual effort, supply use and 100 gp payment, without automatic refund or free potion. Completed potions and previous abandonment cannot be erased.',
    inputSchema: AbandonGreaterBrewingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(abandonGreaterHealingPotion(input))))
  server.registerTool('brew_xge_healing_potion', {
    description: 'Explicit Xanathar downtime option for exactly one normal healing potion. At the supported worksite choose one durable unused fact of actually available ordinary supplies, the exact owned herbalism kit and held denominations totaling 25 gp. Actual herbalism proficiency and a free hand are required. Spend eight uninterrupted hours in one real engine date. No roll, exotic ingredient, generic magic-item recipe or rest is created. The identified canonical potion appears at the worksite for ordinary pickup and use_magic_item.',
    inputSchema: BrewHealingPotionSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(brewHealingPotion(input))))
  server.registerTool('inspect_xge_brewing', {
    description: 'Read normal-potion receipts and greater, superior or supreme projects, original supplies, exact payments and real workdates without advancing them.',
    inputSchema: {}, annotations: { readOnlyHint: true },
  }, async () => toolkitResult(inspectXgeBrewing()))
}
