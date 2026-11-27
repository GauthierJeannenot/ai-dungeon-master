import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as gs from '../game-state'
import * as rules from '../rules'
import { available, hero, now, distance, fail, spendHeroAction, removeHeroEffect } from '../hero-rules'
import { visibleCell } from '../monster-perception'
import { getSpell } from '../../lib/srd/spells'

export function registerNarrativeSpellTools(server: McpServer): void {
  server.tool('dismiss_prestidigitation', 'Dismiss one explicitly chosen lasting Prestidigitation effect as an action. No other effect is selected or ended automatically.',
    { effectId: z.string() }, async input => {
      try {
        available()
        const effect = hero().effects.find(e => e.id === input.effectId && e.kind === 'prestidigitation' && e.sourceId === 'player' && e.expiresAt > now())
        if (!effect) fail('SPELL_EFFECT_UNAVAILABLE', 'Choose an exact active owned Prestidigitation effect.')
        rules.validateActionUse('player'); spendHeroAction(); removeHeroEffect(effect.id)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ dismissedEffectId: effect.id, mechanicalSummary: 'Effet de Prestidigitation dissipé par une action explicite.' }) }] }
      } catch (error) { return rules.ruleErrorResult(error) }
    })
  server.tool('use_narrative_spell_effect',
    'Explicitly move an existing Silent Image (action), Dancing Lights or Unseen Servant (bonus action). Select the exact active effectId, destination and narrative description. Never casts a spell, spends another slot, moves a creature or modifies inventory/doors. Other narrative uses stay within the original srdNote and need their dedicated tools for mechanical changes.',
    { effectId: z.string(), toCell: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict(),
      narrative: z.string().trim().min(1).max(1200) }, async input => {
      try {
        available()
        const state = gs.getState(), player = gs.getPlayer()
        const effect = hero().effects.find(e => e.id === input.effectId && e.sourceId === player.id && e.expiresAt > now())
        if (!effect || !['silent-image', 'dancing-lights', 'unseen-servant'].includes(effect.kind)) fail('SPELL_EFFECT_UNAVAILABLE', 'Select an active controllable narrative spell effect.')
        if (effect.data.mapId !== state.currentMapId) fail('SPELL_EFFECT_OTHER_MAP', 'The effect is on another map.')
        const bonus = effect.kind !== 'silent-image'
        if (bonus) rules.validateBonusActionUse(player.id)
        else rules.validateActionUse(player.id)
        rules.validateMapCell(input.toCell)
        const spell = getSpell(effect.kind)!
        if (distance(player.position, input.toCell) > spell.rangeCells || !visibleCell(player, input.toCell)) fail('SPELL_DESTINATION_BLOCKED', 'Destination must be in spell range with a clear path.')
        const previous = effect.data.cell as { x: number; y: number }
        const movement = effect.kind === 'dancing-lights' ? 12 : effect.kind === 'unseen-servant' ? 3 : Infinity
        if (distance(previous, input.toCell) > movement) fail('SPELL_EFFECT_MOVEMENT_EXCEEDED', 'That command exceeds the effect movement budget.')
        if (state.phase === 'combat') {
          if (bonus) gs.markBonusActionUsed(player.id)
          else spendHeroAction()
        }
        effect.data = { ...effect.data, cell: { ...input.toCell }, narrative: input.narrative }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ effect, srdNote: spell.effect.kind === 'utility' ? spell.effect.srdNote : undefined,
          mechanicalSummary: 'Effet narratif déplacé ; coût de commande appliqué, aucun emplacement dépensé.' }) }] }
      } catch (error) { return rules.ruleErrorResult(error) }
    })
}
