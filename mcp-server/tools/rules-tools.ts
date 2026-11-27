import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { consultRules, IMPROVISATION_TOPICS, RULE_BOOK_IDS, RulesLookupError } from '../rules-library'
import { readRollableTable } from '../rules-library'
import { rollSourceTableDice } from '../source-table-dice'
import { guidesForDomain } from '../../lib/rule-guides'
import { TOOLKIT_DOMAINS, TOOLKIT_SUPPORT } from '../toolkit-support'
import type { CatalogTool } from '../../lib/tool-catalog'
import { selectToolsForPhase } from '../../lib/tool-exposure'
import { getState } from '../game-state'
import { withRuleToolGuidance } from '../rules-tool-guidance'

export function registerRulesTools(server: McpServer, registeredTools: () => CatalogTool[]): void {
  server.registerTool('get_rules_support', {
    description: 'Read the implemented coverage, source references and explicit limitations of the new PHB/DMG/Xanathar toolkit. Without domain returns a compact domain index; select one domain for its coverage and detailed GM procedures. This is a capability report, not activation of optional rules or a gameplay action. For monster-specific support use get_monster_stat_block.engineSupport.',
    inputSchema: { domain: z.enum(TOOLKIT_DOMAINS).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ domain }) => ({ content: [{ type: 'text' as const, text: JSON.stringify(domain ? { domain, ...TOOLKIT_SUPPORT[domain], procedures: guidesForDomain(domain) } : { domains: TOOLKIT_DOMAINS, notice: 'Choose one domain to read its coverage, limitations and procedures. No gameplay action or optional rule activated.' }) }] }))
  server.registerTool('roll_table', {
    description: 'Roll on ONE exact local source table selected by tableId from consult_rules. Source origin explicitly distinguishes labelled project homebrew from supplied transcription. The engine validates the literal dice column/ranges before rolling: one source die or a sum of up to four source dice, including the DMG Sylvan Forest d12+d8. Returns every die, the matching source row and its exact combination probability. dieColumn is zero-based, default 0. No game effect, NPC creation or secret discovery. Nested/incomplete ranges are refused. Random inspiration only, never a substitute for resolving a player action.',
    inputSchema: { tableId: z.string().min(1).max(100), dieColumn: z.number().int().min(0).max(8).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ tableId, dieColumn }) => {
    try {
      const table = readRollableTable(tableId, dieColumn)
      const roll = rollSourceTableDice(table.dice)
      const row = table.rows.find(row => row.low <= roll.total && roll.total <= row.high)!
      return { content: [{ type: 'text' as const, text: JSON.stringify({ kind: 'table_roll',
        ...table, rows: undefined, roll, row,
        notice: 'Inspiration only. No game state, action, resource or discovery changed. Interpret subtable instructions yourself; no secondary draw is automatic.',
      }) }] }
    } catch (error) {
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({
        code: error instanceof RulesLookupError ? error.code : 'RULES_LIBRARY_UNAVAILABLE',
        error: error instanceof RulesLookupError ? error.message : 'The selected table could not be loaded.',
      }) }] }
    }
  })
  server.registerTool('consult_rules', {
    description: 'Read unchanged source text with separate engineGuidance project annotations: linked available tools, usage procedures and engine limits. Search previews links; passage/table reads provide procedures and load available schemas. Consult the local Player\'s Handbook, Dungeon Master\'s Guide, Xanathar\'s Guide to Everything and Monster Manual, D&D 5e 2014, plus the official CC-BY-4.0 SRD 5.1 supplement (book=srd-5.1-2014, never SRD 5.2). No arguments lists books. Search with query using English book terms; optional book filters the search. The SRD returns PDF page, source URL, license and checksums; query Page to browse its page index, five results per resultOffset. For monsters, use the current campaign bestiary first (names, roles, variants); book=mm-2014 searches the shared Monster Manual by English creature name, optionally with an ability/action name. Then read one returned sectionId, continuing with nextOffset; traits and actions may be separate sections, and SRD entries may continue onto the next PDF page. get_monster_stat_block.engineSupport reports actual engine capabilities; consulting a source never creates an active item, playable monster or ability. For improvisation, topic=npc|adventure|dungeon lists original DMG tables (personality, secrets, plots, twists, dungeon rooms); read a returned tableId. Choose an entry or explicitly use roll_dice for random inspiration. Adapt to established adventure facts; never invent an engine effect, secret discovery or player decision. Read-only: no dice, state changes or action costs. Results bounded, never full books. Available in exploration and combat.',
    inputSchema: {
      book: z.enum(RULE_BOOK_IDS).optional(),
      query: z.string().trim().min(1).max(160).optional(),
      sectionId: z.string().min(1).max(80).optional(),
      topic: z.enum(IMPROVISATION_TOPICS).optional().describe('List tables: npc/adventure/dungeon/treasure (DMG), life (Xanathar), names (project homebrew in Xanathar), trinkets (project homebrew in PHB). Exclusive with query, sectionId and tableId.'),
      tableId: z.string().min(1).max(100).optional().describe('Read one exact table ID returned by a topic catalog; paginate with offset/limit.'),
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(5000).optional(),
      resultOffset: z.number().int().min(0).optional().describe('Search or topic catalog pagination; continue with nextResultOffset.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => {
    try {
      const state = getState()
      const available = selectToolsForPhase(registeredTools(), state.phase, state.player.ruleset === 'srd2014')
      return { content: [{ type: 'text' as const, text: JSON.stringify(withRuleToolGuidance(consultRules(input), available)) }] }
    } catch (err) {
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({
        code: err instanceof RulesLookupError ? err.code : 'RULES_LIBRARY_UNAVAILABLE',
        error: err instanceof RulesLookupError ? err.message : 'The local rules library could not be loaded. Do not invent a source or apply an unconfirmed rule.',
      }) }] }
    }
  })
}
