import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ScribeSpellScrollSchema } from '../../lib/xge-scroll-scribing-state'
import { scribeXgeSpellScroll, inspectXgeScrollScribing } from '../xge-scroll-scribing'
import { toolkitResult, toolkitTransaction } from '../toolkit'
import { StartMultiDayScribingSchema, WorkMultiDayScribingSchema, AbandonMultiDayScribingSchema, AdjudicateMultiDayScribingSchema } from '../../lib/xge-multiday-scribing-state'
import { startMultiDayScribing, workMultiDayScribing, abandonMultiDayScribing, adjudicateMultiDayScribing } from '../xge-multiday-scribing'

export function registerXgeScrollScribingTools(server: McpServer) {
  server.registerTool('start_xge_spell_scroll_project', {
    description: 'Explicit Xanathar three-workdate Misty Step scroll project. Actual Arcana proficiency, known/prepared spell, physical unique paper/ink and measured dry site. Pay exactly250gp at start by explicit user convention; no time, spell cast, slot or die. Output identity and supplies stay reserved, including abandoned history. Other scroll recipes remain separate.',
    inputSchema: StartMultiDayScribingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(startMultiDayScribing(input))))
  server.registerTool('work_xge_spell_scroll_project', {
    description: 'Spend one distinct actual eight-hour engine date at the original site, sharing the real downtime budget. Three dates produce exactly one physical Misty Step scroll for separate pickup/use. No V/S casting or material component is required while writing. After the original six-date window or an adjudicated deadline, refuse before effort until explicit real delay adjudication. No workweek complication roll for a three-day recipe.',
    inputSchema: WorkMultiDayScribingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(workMultiDayScribing(input))))
  server.registerTool('abandon_xge_spell_scroll_project', {
    description: 'Explicitly abandon the actual unfinished multi-day scroll. Retain spent supplies, real effort and reserved physical identity; no automatic refund by user convention. Exact replay changes nothing.',
    inputSchema: AbandonMultiDayScribingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(abandonMultiDayScribing(input))))
  server.registerTool('adjudicate_xge_spell_scroll_delay', {
    description: 'Explicit MJ decision for the real overdue unfinished three-date scroll: distinct actual local decision and introduced extra complication, finite new engine-date deadline, real chosen supplement0..250gp cumulatively over the entire project by user convention (500gp maximum total). No automatic consequence, work, die or time; no repeated doubling. Consequences must already be separately resolved or absent.',
    inputSchema: AdjudicateMultiDayScribingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(adjudicateMultiDayScribing(input))))
  server.registerTool('scribe_xge_spell_scroll', {
    description: 'Explicit Xanathar option for one actual Ray of Frost (15 gp), Magic Missile or Mage Armor (25 gp) scroll. Actual Arcana proficiency, that known or prepared spell, free hand and one established batch of ordinary paper and ink at the current supported site. Mage Armor also needs a real owned component pouch. Spend eight uninterrupted hours on one actual engine date, with no casting, slot, check or rest. Pick up the canonical scroll separately and use the existing scroll tool. Scribed Ray of Frost has a level-one caster effect.',
    inputSchema: ScribeSpellScrollSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(scribeXgeSpellScroll(input))))
  server.registerTool('inspect_xge_scroll_scribing', {
    description: 'Read the supported legacy one-day recipes and receipts, and the actual three-date Misty Step projects with retained original payment, effort and decisions. Documentary only: no casting, material supply, work, adjudication or payment is committed.',
    inputSchema: {}, annotations: { readOnlyHint: true },
  }, async () => toolkitResult(inspectXgeScrollScribing()))
}
