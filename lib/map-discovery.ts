import { firstMapId, getAdventureMap, getMapSpec, inferRoomIdOnMap, roomContainsCell, type GridCell } from './adventure-map'
import type { GameState } from './types'
import { nearbyRoomPerception } from './scene-perception'

export function visibleThroughDoorRooms(state: GameState): string[] {
  const map = getMapSpec(state.currentMapId, state)
  if (!map.fogOfWar || map.fogReveal !== 'open-door' || state.player.hp.current <= 0
    || state.player.conditions.some(condition => ['blinded', 'unconscious'].includes(condition))) return []
  const current = inferRoomIdOnMap(state.player.position, map.id, state)
  if (!current) return []
  return nearbyRoomPerception(state).filter(room => room.visibleCells.length > 0
    && room.doors.some(door => ['open', 'broken'].includes(door.state ?? ''))).map(room => room.roomId)
}

// Engine mutation only, after an actual movement or door interaction. Looking
// into a room never completes a roomVisited objective or reveals a hidden NPC.
export function rememberMapDiscovery(state: GameState): void {
  if (getMapSpec(state.currentMapId, state).fogReveal !== 'open-door') return
  const seen = visibleThroughDoorRooms(state)
  if (!seen.length) return
  const stored = state.sceneMemory?.discoveredRoomIds
  const previous = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []
  const ids = [...new Set([...previous, ...seen])]
  if (ids.length !== previous.length) state.sceneMemory = { ...state.sceneMemory, discoveredRoomIds: ids }
}

// Room IDs are unique across the adventure. No browser-local discovery state:
// engine saves, session hydration and other campaigns use this same projection.
export function discoveredMapRooms(state: GameState) {
  const map = getMapSpec(state.currentMapId, state)
  const visited = new Set(state.roomsVisited)
  if (map.fogReveal === 'open-door') {
    const stored = state.sceneMemory?.discoveredRoomIds
    if (Array.isArray(stored)) for (const id of stored) if (typeof id === 'string') visited.add(id)
    for (const id of visibleThroughDoorRooms(state)) visited.add(id)
  }
  const current = inferRoomIdOnMap(state.player.position, map.id, state)
  if (current) visited.add(current)
  return getAdventureMap(state).rooms.filter(room =>
    (room.mapId ?? firstMapId(state)) === map.id
    && (!map.fogOfWar || (map.fogHiddenRoomIds && !map.fogHiddenRoomIds.includes(room.id)) || visited.has(room.id)))
}

export function isMapCellDiscovered(state: GameState, cell: GridCell): boolean {
  const map = getMapSpec(state.currentMapId, state)
  if (!map.fogOfWar) return true
  if (map.fogHiddenRoomIds) {
    const discovered = new Set(discoveredMapRooms(state).map(room => room.id))
    return !getAdventureMap(state).rooms.some(room => map.fogHiddenRoomIds!.includes(room.id)
      && !discovered.has(room.id) && roomContainsCell(room, cell))
  }
  return discoveredMapRooms(state).some(room => roomContainsCell(room, cell))
}
