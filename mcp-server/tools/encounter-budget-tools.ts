import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { EncounterBudgetInputSchema } from '../../lib/encounter-budget'
import { inspectEncounterBudget } from '../encounter-budget'
import { assessXgeEncounter, XgeEncounterInputSchema } from '../xge-encounter'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerEncounterBudgetTools(server: McpServer) {
  server.registerTool('assess_encounter_budget', {
    description: 'Read-only DMG2014 estimate for the real player and actual local declared NPCparty, civilians and real group members included. NPC source CR never supplies a character level: party thresholds/daily reference/difficulty are indeterminate when a real NPC has no represented level. Actual off-scene NPCs remain separate. Choose mode=planned with groups[{monsterType,count,countsForMultiplier}], OR mode=active with monsters[{monsterId,countsForMultiplier}], never both. Only frozen registered source types or actual living hostile actors are accepted; no imagined party, public level/party-size override, generic NPC stats or arbitrary XP. Explicit MJ countsForMultiplier decides whether weaker participants meaningfully affect the number multiplier; all selected source XP still sums. Returns raw/adjusted XP, actual-party-size-adjusted multiplier, four thresholds, difficulty, source and limitations. Daily XP is reference only. Does not spawn/select a creature, roll, award XP, spend budget, change a quest, advance time, grant rest or guarantee a balanced solo encounter. Unsupported source powers and HP variants remain visible limitations. Available during pending reactions because it performs no game action.',
    inputSchema: EncounterBudgetInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => toolkitTransaction(() => toolkitResult(inspectEncounterBudget(input))))
  server.registerTool('assess_xge_encounter', {
    description: 'Confidential MJ reference for the actual sole player level and the printed Xanathar Multiple Monsters row. Choose mode=catalogue without groups for literal cells, frozen profiles and the separate weak-monster list, or mode=planned with exact groups[{monsterType,count}]. A published CR strictly below this band’s smallest column uses the separately sourced1:12 guideline; blank cells, higher outside CR and unknown CR remain indeterminate. Exact fractional sums, no legendary Solo Monster table, party or CR overrides, scene actors, roster selection, difficulty verdict, gameplay, dice or XP.',
    inputSchema: XgeEncounterInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => toolkitTransaction(() => toolkitResult(assessXgeEncounter(input))))
}
