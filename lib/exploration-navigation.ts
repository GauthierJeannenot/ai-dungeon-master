import { getAdventureMap, getMapSpec, firstMapId, type AdventureRoom } from './adventure-map'
import { discoveredMapRooms } from './map-discovery'
import { explorationMovementRooms, navigationActor, NavigationError } from './navigation'
import type { GameState } from './types'

// Shared by illustrated map pins, their legend and tactical-map room buttons.
// These are player requests only; the agent chooses tools and MCP revalidates.
export function explorationDestinationRooms(state: GameState, includeCurrent = false): AdventureRoom[] {
  if (state.phase !== 'exploration' || state.hero?.pending) return []
  try { if (navigationActor(state, 'player').speed <= 0) return [] }
  catch (error) { if (error instanceof NavigationError) return []; throw error }
  const map = getMapSpec(state.currentMapId, state)
  const accessible = new Set(explorationMovementRooms(state).map(room => room.id))
  if (includeCurrent && state.currentRoomId) accessible.add(state.currentRoomId)
  const discovered = new Set(discoveredMapRooms(state).map(room => room.id))
  return getAdventureMap(state).rooms.filter(room =>
    (room.mapId ?? firstMapId(state)) === map.id
    && accessible.has(room.id) && discovered.has(room.id))
}
