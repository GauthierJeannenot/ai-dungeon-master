import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { assertCanDrop, afterInventoryChange } from '../equipment'
import { z } from 'zod'
import { firstMapId, inferRoomIdOnMap } from '../../lib/adventure-map'
import type { DroppedItem } from '../../lib/types'
import { navigationGrid } from '../../lib/navigation'
import { engineGeometry } from '../navigation'
import { NarrativeDescriptionSchema, recordSceneEffect } from '../scene-facts'
import * as gs from '../game-state'
import * as rules from '../rules'
import { assertCarryingPickup } from '../carrying'
import { toolkitTransaction } from '../toolkit'
import { weatherHeightPointIssue } from '../../lib/weather-state'

const ItemIdSchema = z.string().min(1).describe('Exact owned item id, or exact dropped item id for retrieval.')
const CellSchema = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()

function assertItemReach(position: { x: number; y: number }, mapId: string, roomId: string | null): void {
  const state = gs.getState()
  const heightIssue=weatherHeightPointIssue(state,['player']);if(heightIssue)throw new rules.RuleViolation(heightIssue.code,heightIssue.message,{})
  const distance = rules.distanceCells(state.player.position, position)
  if (mapId !== (state.currentMapId ?? firstMapId(state)) || roomId !== state.currentRoomId
    || inferRoomIdOnMap(position, mapId, state) !== roomId
    || distance > 1 || (distance === 1 && !navigationGrid(state, 'player', engineGeometry()).step(state.player.position, position, false, false))) {
    throw new rules.RuleViolation('ITEM_OUT_OF_REACH', 'Approach this location before depositing or retrieving the item; no remote interaction or reaching through walls.', { position, mapId, roomId })
  }
}

function dropPlacement(input: { toCell?: { x: number; y: number }; nearEntityId?: string; description?: string }) {
  if (input.toCell && input.nearEntityId !== undefined) {
    throw new rules.RuleViolation('ITEM_LOCATION_CONFLICT', 'Choose a cell OR a nearby entity, not both.', {})
  }
  const state = gs.getState()
  const mapId = state.currentMapId ?? firstMapId(state)
  let anchor: DroppedItem['anchor']
  if (input.nearEntityId !== undefined) {
    const npc = state.npcs?.[input.nearEntityId]
    const entity = npc ?? gs.getEntity(input.nearEntityId)
    if (!entity || (npc && !npc.visible)) {
      throw new rules.RuleViolation('ITEM_ANCHOR_NOT_AVAILABLE', 'Choose an exact visible scene entity id.', {})
    }
    const anchorMap = npc ? npc.mapId ?? firstMapId(state) : mapId
    const anchorRoom = inferRoomIdOnMap(entity.position, anchorMap, state)
    assertItemReach(entity.position, anchorMap, anchorRoom)
    anchor = { entityId: input.nearEntityId, name: entity.name, position: { ...entity.position } }
  }
  // An explicit nearby landmark means ground at the player's feet beside it,
  // never inside the actor or transferred to its inventory.
  const position = { ...(input.toCell ?? state.player.position) }
  rules.validateMapCell(position, 'toCell')
  assertItemReach(position, mapId, inferRoomIdOnMap(position, mapId, state))
  return { position, ...(anchor ? { anchor } : {}), ...(input.description ? { description: input.description } : {}) }
}

function inventoryResult(operation: 'drop_item' | 'pick_up_item', itemId: string, result: unknown,
  position: { x: number; y: number }, mechanicalSummary: string, description?: string) {
  const state = gs.getState()
  const expires = operation === 'drop_item' ? 'never' : state.currentRoomId ? 'room' : 'map'
  const worldFact = description
    ? recordSceneEffect({ description, cell: position }, operation, { subjectItemId: itemId, expires })
    : gs.addWorldFact({ text: mechanicalSummary, source: operation, subjectItemId: itemId,
      mapId: state.currentMapId ?? firstMapId(state), roomId: state.currentRoomId ?? undefined, expires })
  if (state.phase === 'combat') rules.recordAction('player')
  gs.addLogEntry({ round: state.round, turn: state.currentTurn ?? 'player',
    action: `${state.player.name} — ${operation}: ${itemId}`, mechanicalDetail: mechanicalSummary })
  return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, operation, itemId, result,
    mechanicalSummary, worldFact, inventory: state.player.inventory, droppedItems: state.droppedItems, ac: state.player.ac }) }] }
}

export function registerInventoryTools(server: McpServer): void {
  server.tool('drop_item',
    'Deposits an owned item and remembers its exact ground location and your free French description atomically. Default: player current cell. Explicit toCell must be within one unobstructed cell in the same room/map. Alternatively nearEntityId leaves it at the player feet beside that exact visible entity, which must be adjacent; saves a landmark snapshot, never follows the entity or transfers ownership. Approach first if out of reach. Choose cell OR entity. Uses an action in combat. Retrieval clears the matching deposit memory.',
    { itemId: ItemIdSchema, toCell: CellSchema.optional(),
      nearEntityId: z.string().min(1).optional().describe('Exact visible nearby entity id selected by the AI; never its name or an inferred target.'),
      description: NarrativeDescriptionSchema.optional() }, async input => toolkitTransaction(() => {
        rules.validateActionUse('player')
        assertCanDrop(input.itemId)
        const state = gs.getState()
        if (!state.player.inventory.some(item => item.id === input.itemId) || state.droppedItems?.[input.itemId]) {
          throw new rules.RuleViolation('ITEM_NOT_OWNED', 'The item is not uniquely available in player inventory.', { itemId: input.itemId })
        }
        const placement = dropPlacement(input)
        const dropped = gs.dropPlayerItem(input.itemId, placement)
        afterInventoryChange()
        const summary = `${dropped.item.name} déposé en (${dropped.position.x},${dropped.position.y}), salle ${dropped.roomId ?? 'extérieure'}${dropped.anchor ? `, près de ${JSON.stringify(dropped.anchor.name)} à cet instant` : ''}. L'objet n'est plus dans l'inventaire et ne suit pas ce repère.`
        return inventoryResult('drop_item', input.itemId, dropped, dropped.position, summary, input.description)
    }))

  server.tool('pick_up_item',
    'Collects an exact authored ground item or retrieves a deposited item at its saved location within one unobstructed cell in the same room/map. Adds it to inventory with its armor bonus, removes the old deposit fact, and optionally remembers your free French description of retrieval. Cannot retrieve remotely, through walls, or by following a landmark that moved. Uses an action in combat.',
    { itemId: ItemIdSchema, description: NarrativeDescriptionSchema.optional() }, async input => toolkitTransaction(() => {
        rules.validateActionUse('player')
        const state = gs.getState()
        const dropped = state.droppedItems?.[input.itemId]
        if (!dropped) throw new rules.RuleViolation('ITEM_NOT_DROPPED', 'No deposited item has this id.', { itemId: input.itemId })
        if (state.player.inventory.some(item => item.id === input.itemId)) {
          throw new rules.RuleViolation('ITEM_ALREADY_OWNED', 'This item is already in inventory.', { itemId: input.itemId })
        }
        assertItemReach(dropped.position, dropped.mapId, dropped.roomId)
        assertCarryingPickup(dropped.item)
        const item = gs.pickUpPlayerItem(input.itemId)
        afterInventoryChange()
        const summary = `${item.name} repris depuis (${dropped.position.x},${dropped.position.y}). L'objet est de nouveau dans l'inventaire ; son ancien emplacement de dépôt est effacé.`
        return inventoryResult('pick_up_item', input.itemId, item, { ...state.player.position }, summary, input.description)
    }))
}
