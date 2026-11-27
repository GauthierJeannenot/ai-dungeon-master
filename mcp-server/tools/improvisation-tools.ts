import { assertGreaterBrewingIdAvailable } from '../toolkit'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getMonsterRecord, listMonsterTypes } from '../../lib/srd/monsters'
import { getAdventureMap } from '../../lib/adventure-map'
import { createNpcState } from '../../lib/npc-stat-blocks'
import { ToolkitCellSchema, ToolkitDescriptionSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import * as gs from '../game-state'
import { validateSpawn } from '../rules'
import { toolkitState, toolkitResult, toolkitError, toolkitLocation, toolkitTransaction, assertToolkitPreparation } from '../toolkit'

export function registerImprovisationTools(server: McpServer) {
  server.registerTool('create_npc', {
    description: 'Persist one explicitly improvised noncombat NPC in an existing room of the active adventure, outside combat. Choose a unique npcId, exact source statBlock, cell, disposition and visibility. Personality/secret are confidential MJ data, not discoveries. Existing actors cannot be overwritten. Repeating the identical creation is idempotent. Does not start combat or grant a quest/reward. Source statistics come only from the local SRD catalog.',
    inputSchema: { npcId: ToolkitIdSchema, name: z.string().trim().min(1).max(80),
      statBlock: z.string().describe(`Exact catalog type: ${listMonsterTypes().join(', ')}`),
      cell: ToolkitCellSchema, disposition: z.enum(['hostile', 'wary', 'neutral', 'helpful', 'offended']),
      visible: z.boolean(), description: ToolkitDescriptionSchema,
      personality: z.object({ ideal: ToolkitDescriptionSchema.optional(), bond: ToolkitDescriptionSchema.optional(),
        flaw: ToolkitDescriptionSchema.optional(), secret: ToolkitDescriptionSchema.optional() }).strict().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => toolkitTransaction(() => {
    assertToolkitPreparation()
    const record = getMonsterRecord(input.statBlock)
    if (!record) toolkitError('NPC_SOURCE_UNKNOWN', 'Choose an exact existing SRD stat block, never custom combat statistics.')
    const location = toolkitLocation(input.cell), state = gs.getState(), data = toolkitState()
    const creation = JSON.stringify(input), existing = state.npcs?.[input.npcId]
    if (existing) {
      if (data.npcs[input.npcId]?.creation === creation) return toolkitResult({ success: true, alreadyCreated: true, npc: existing })
      toolkitError('NPC_ID_CONFLICT', 'An NPC already has this ID; do not replace an existing actor.')
    }
    assertGreaterBrewingIdAvailable(input.npcId)
    if (state.monsters[input.npcId] || input.npcId === 'player' || getAdventureMap(state).npcs.some(npc => npc.id === input.npcId))
      toolkitError('NPC_ID_CONFLICT', 'This ID belongs to an existing actor.')
    if (Object.keys(data.npcs).length >= 64) toolkitError('NPC_LIMIT_REACHED', 'At most 64 improvised NPCs per adventure session.')
    validateSpawn(input.cell)
    const npc = createNpcState({ id:input.npcId,name:input.name,kind:input.statBlock,statBlock:input.statBlock,
      cell:{...input.cell},...location,visibleFromStart:input.visible,disposition:input.disposition,description:input.description },location.mapId)
    state.npcs ??= {}; state.npcs[npc.id] = npc
    data.npcs[npc.id] = { statBlock: input.statBlock, creation, personality: input.personality ?? {} }
    gs.addLogEntry({ round: state.round, turn: 'system', action: 'PNJ créé', mechanicalDetail: `${npc.id}, ${location.mapId}/${location.roomId}` })
    return toolkitResult({ success: true, npc, personality: data.npcs[npc.id].personality,
      source: { ruleset: '2014', url: record!.sourceUrl, sha256: record!.sourceSha256 },
      mechanicalSummary: `PNJ ${npc.name} créé dans la salle ${location.roomId}, ${input.visible ? 'visible' : 'encore caché'}. Aucun combat engagé.` })
  }))
  server.registerTool('inspect_scene', {
    description: 'Read confidential MJ data for improvised NPCs, objects, traps and coin treasures in the CURRENT room/map. Five entries per page. Does not discover or reveal anything to the player. Use exact returned IDs in dedicated tools; source/module secrets and discovery requirements still apply.',
    inputSchema: { category: z.enum(['npcs', 'objects', 'traps', 'treasures']), offset: z.number().int().nonnegative().default(0) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ category, offset }) => toolkitTransaction(() => {
    const state = gs.getState(), data = state.dmTools
    const entries = category === 'npcs'
      ? Object.entries(data?.npcs ?? {}).flatMap(([id, info]) => {
        const npc = state.npcs?.[id]
        return npc && npc.mapId === state.currentMapId && npc.roomId === state.currentRoomId
          ? [{ ...npc, personality: info.personality, statBlock: info.statBlock }] : []
      })
      : Object.values(data?.[category] ?? {}).filter(item => item.mapId === state.currentMapId && item.roomId === state.currentRoomId)
        .map(({ creation: _creation, ...item }) => item)
    return toolkitResult({ category, total: entries.length, offset, entries: entries.slice(offset, offset + 5),
      nextOffset: offset + 5 < entries.length ? offset + 5 : null, notice: 'Confidential MJ reference; no player discovery or state change.' })
  }))
}
