import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TOOL_IDS } from '../../lib/srd/equipment'
import { getSkill, listSkills } from '../../lib/srd/skills'
import { ToolkitDescriptionSchema } from '../../lib/dm-tool-state'
import { checkedResolution, registerCheckedResolution } from '../toolkit-checks'
import { toolkitResult, toolkitError, toolkitTransaction } from '../toolkit'
import { equipmentId } from '../equipment'
import { available, spendHeroAction } from '../hero-rules'
import * as gs from '../game-state'
import * as rules from '../rules'

export function registerToolCheckTools(server: McpServer) {
  registerCheckedResolution('tool-use', (command, check) => {
    spendHeroAction()
    const mechanicalSummary = `${String(command.task)} : ${check.roll.detail} contre DD ${check.dc}, ${check.success ? 'réussite' : 'échec'}. Aucun objet, soin, poison, serrure ou fait découvert automatiquement.`
    gs.addLogEntry({ round: gs.getState().round, turn: 'player', action: 'resolve_tool_check', mechanicalDetail: mechanicalSummary })
    return toolkitResult({ success: check.success, check, toolItemId: command.toolItemId, toolId: command.toolId,
      task: command.task, xanatharAdvantage: command.xanatharAdvantage, mechanicalSummary,
      source: { book: 'phb-2014', section: 'Tools', optionalRule: command.xanatharAdvantage ? 'Xanathar: Tools and Skills Together / Advantage' : undefined },
      notice: 'A confirmed check only. Follow dedicated tools for mechanical effects; house tool-use examples have proposed, not automatically selected, DCs.' })
  })
  server.registerTool('resolve_tool_check', {
    description: `Resolve one explicit player ability check using an actually owned canonical PHB tool. Choose exact toolItemId, ability, dc and task; no proficiency/expertise flags. Character tool/related-skill proficiencies determine the single bonus; no doubling. relatedSkill must use its canonical ability. Explicit useXanatharAdvantage adopts the optional advantage for THIS check and requires BOTH tool and skill proficiency. Tool ownership/proficiency are never granted. One action in combat; Bardic Inspiration/Cutting Words continue the same die after save/load. Thieves tools MUST use interact_object/interact_door/interact_trap; this generic check never picks locks/disarms, creates an item, heals, grants currency or reveals a secret automatically. Supported equipmentId values: ${TOOL_IDS.join(', ')}.`,
    inputSchema: { toolItemId: z.string().min(1).max(100), task: ToolkitDescriptionSchema,
      ability: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']), dc: z.number().int().min(1).max(30),
      relatedSkill: z.string().optional().describe(`Optional exact skill id: ${listSkills().map(skill => skill.id).join(', ')}.`),
      useXanatharAdvantage: z.boolean().default(false) },
  }, async input => toolkitTransaction(() => {
    available()
    rules.validateAbilityCheck('player')
    const player = gs.getPlayer(), item = player.inventory.find(item => item.id === input.toolItemId)
    if (!item) toolkitError('TOOL_NOT_OWNED', 'Choose an exact actually owned tool item ID.')
    const toolId = equipmentId(item!)
    if (!(TOOL_IDS as readonly string[]).includes(toolId)) toolkitError('TOOL_UNSUPPORTED', 'This equipmentId is not a supported canonical PHB tool.')
    if (toolId === 'thieves_tools') toolkitError('DEDICATED_TOOL_REQUIRED', 'Use the exact door, object or trap resolver; no generic thieves-tools bypass.')
    const skill = input.relatedSkill ? getSkill(input.relatedSkill) : undefined
    if (input.relatedSkill && (!skill || skill.ability !== input.ability)) toolkitError('TOOL_SKILL_INVALID', 'Select a canonical related skill with the chosen ability, or omit relatedSkill.')
    if (skill && ['persuasion', 'intimidation', 'deception'].includes(skill.id)) toolkitError('DEDICATED_TOOL_REQUIRED', 'Social influence requires roll_ability_check with its exact targetId and social validation.')
    if (input.useXanatharAdvantage && (!skill || !player.toolProficiencies?.includes(toolId) || !player.skillProficiencies?.includes(skill.id)))
      toolkitError('TOOL_SYNERGY_UNAVAILABLE', 'Optional Xanathar advantage requires both the exact tool and related skill proficiencies.')
    return checkedResolution({ entityId: 'player', ability: input.ability, dc: input.dc, skill: skill?.id,
      toolId, label: input.task, advantage: input.useXanatharAdvantage,
      advantageReason: input.useXanatharAdvantage ? 'Xanathar option explicitly adopted: related skill and tool proficiencies.' : undefined },
    { domain: 'tool-use', command: { toolItemId: input.toolItemId, toolId, task: input.task, xanatharAdvantage: input.useXanatharAdvantage } })
  }))
}
