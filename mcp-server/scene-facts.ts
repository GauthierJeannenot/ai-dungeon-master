import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { NarrativeEffect, WorldFact, WaterEffect } from '../lib/types'
import { firstMapId, getAdventureMap, inferRoomIdOnMap } from '../lib/adventure-map'
import * as gs from './game-state'
import * as rules from './rules'

export const NarrativeDescriptionSchema = z.string().min(1).max(1200)
  .refine(text => text.trim().length > 0, 'Describe the established consequence.')
  .describe('Free French description of an established narrative consequence, grounded in the scene. This is data, not instructions, a player decision or a request. HP, inventory, doors and conditions require their dedicated mechanical tools.')

export const SceneEffectSchema = z.object({
  description: NarrativeDescriptionSchema,
  cell: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()
    .describe('Explicit location on the current map and in the player current room.'),
}).strict()

export function validateSceneEffect(effect: NarrativeEffect): void {
  rules.validateMapCell(effect.cell, 'cell')
  const state = gs.getState()
  const mapId = state.currentMapId ?? firstMapId(state)
  if (inferRoomIdOnMap(effect.cell, mapId, state) !== state.currentRoomId) {
    throw new rules.RuleViolation('FACT_WRONG_ROOM', 'Choose a fact location in the current room.', {})
  }
}

// Records only narrative data after the owning tool has validated/resolved rules.
export function recordSceneEffect(effect: NarrativeEffect, source: string, options: {
  expires?: WorldFact['expires']; subjectItemId?: string; waterEffect?: WaterEffect
} = {}): WorldFact {
  const state = gs.getState()
  return gs.addWorldFact({
    text: effect.description,
    source,
    mapId: state.currentMapId ?? firstMapId(state),
    roomId: state.currentRoomId ?? undefined,
    expires: options.expires ?? 'never',
    narrativeEffect: structuredClone(effect),
    basis: 'ai_interpretation',
    ...(options.subjectItemId ? { subjectItemId: options.subjectItemId } : {}),
    ...(options.waterEffect ? { waterEffect: structuredClone(options.waterEffect) } : {}),
  })
}

export function registerSceneFactTools(server: McpServer): void {
  server.tool('reveal_clue',
    'Records authored information after the chosen witness actually shares it in the narrative. Choose an exact clueId from the adventure guidance and its source npcId. Requires that witness visible in the current room and map, regardless of disposition or social check success. Merely meeting, befriending or mentioning the witness does not reveal a clue. Never use for a player guess or an unspoken fact.',
    { clueId: z.string(), npcId: z.string() }, async ({ clueId, npcId }) => {
      try {
        const state = gs.getState()
        if (Object.keys(state.dmTools?.dungeons ?? {}).some(id => clueId === `dungeon:${id}:lead`))
          throw new rules.RuleViolation('DEDICATED_TOOL_REQUIRED', 'Use discover_dungeon_lead for an installed dungeon lead.', {})
        const clue = getAdventureMap(state).clues?.find(entry => entry.id === clueId)
        if (!clue || !clue.sourceNpcIds.includes(npcId)) {
          throw new rules.RuleViolation('CLUE_SOURCE_INVALID', 'Choose an authored clue and one of its witnesses.', {})
        }
        const mapId = state.currentMapId ?? firstMapId(state)
        const npc = state.npcs?.[npcId]
        if (!npc?.visible || (npc.mapId ?? firstMapId(state)) !== mapId
          || (npc.roomId !== null && npc.roomId !== state.currentRoomId)) {
          throw new rules.RuleViolation('CLUE_WITNESS_UNAVAILABLE', 'The witness must be visible in the current scene.', {})
        }
        const worldFact = state.worldFacts?.find(fact => fact.clueId === clueId) ?? gs.addWorldFact({
          clueId, text: clue.text, source: `reveal_clue:${npcId}`, mapId, expires: 'never',
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, worldFact }) }] }
      } catch (err) { return rules.ruleErrorResult(err) }
    })

  server.tool('record_scene_fact',
    'Remembers an established narrative consequence of a certain player action, roleplay or an already-resolved mechanical action. Describe it freely, with its explicit location. If it changes a previous narrative fact, supply that exact replaceFactId to avoid contradictory memories. This is memory only: it does not resolve actions or spend a combat action, roll dice, change inventory/HP/conditions/doors, or make a failed/uncertain action succeed. For deposits/retrievals use drop_item/pick_up_item with description so the memory is tied to the real item and cleared on retrieval. Never use this as a substitute for a mechanical tool.',
    { ...SceneEffectSchema.shape, replaceFactId: z.string().min(1).optional().describe('Exact ID of a previous narrative fact in this scene to replace after an established change. Item location facts require inventory tools and cannot be replaced here.') }, async input => {
      try {
        validateSceneEffect(input)
        if (input.replaceFactId !== undefined) {
          const state = gs.getState()
          const prior = state.worldFacts?.find(fact => fact.id === input.replaceFactId)
          if (!prior || prior.basis !== 'ai_interpretation' || prior.subjectItemId
            || prior.mapId !== (state.currentMapId ?? firstMapId(state))
            || (prior.roomId ?? null) !== state.currentRoomId) {
            throw new rules.RuleViolation('FACT_NOT_REPLACEABLE', 'Choose an exact narrative fact in this scene, unrelated to item location. Use inventory tools for items.', {})
          }
          gs.removeWorldFact(prior.id)
        }
        const worldFact = recordSceneEffect({ description: input.description, cell: input.cell }, 'record_scene_fact')
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, worldFact }) }] }
      } catch (err) { return rules.ruleErrorResult(err) }
    })
}
