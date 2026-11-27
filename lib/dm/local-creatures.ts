import { firstMapId, getAdventureMap, getMapSpec, getNavigationMode, inferRoomIdOnMap, resolveRoomMapId, type GridCell } from '@/lib/adventure-map'
import { encounterAwareness } from '@/lib/encounter-awareness'
import { adjacentRoomConnections } from '@/lib/scene-perception'
import type { GameState } from '@/lib/types'

// A prompt projection only. The engine and saved session retain every actor.
export function localCreatureScope(state: GameState) {
  const mapId = getMapSpec(state.currentMapId, state).id
  const roomIds = new Set<string>()
  if (state.currentRoomId && resolveRoomMapId(state.currentRoomId, state) === mapId) {
    roomIds.add(state.currentRoomId)
    if (getNavigationMode(state) === 'tactical') {
      for (const { room } of adjacentRoomConnections(state)) roomIds.add(room.id)
    }
  }
  const contains = (cell: GridCell, actorMapId = mapId) => actorMapId === mapId
    && roomIds.has(inferRoomIdOnMap(cell, mapId, state) ?? '')
  return { mapId, roomIds, contains }
}

export function localLivingMonsters(state: GameState, scope = localCreatureScope(state)) {
  // Runtime monsters belong to currentMapId; other floors are stored separately.
  return Object.values(state.monsters).filter(monster => monster.isAlive && scope.contains(monster.position))
}

export function localNpcs(state: GameState, scope = localCreatureScope(state)) {
  return Object.values(state.npcs ?? {}).filter(npc => scope.contains(npc.position,
    npc.mapId ?? resolveRoomMapId(npc.roomId, state) ?? firstMapId(state)))
}

export function localPendingEncounters(state: GameState, scope = localCreatureScope(state)) {
  const awareness = encounterAwareness(state)
  return Object.values(getAdventureMap(state).encounters).flatMap(encounter => {
    if (state.encountersTriggered?.includes(encounter.id)
      || resolveRoomMapId(encounter.roomId, state) !== scope.mapId) return []
    const saved = awareness[encounter.id]
    if (saved && saved.mapId !== scope.mapId) return []
    const monsters = encounter.monsters.flatMap((monster, monsterIndex) => {
      const position = saved?.positions[monsterIndex] ?? monster.cell
      return scope.contains(position) ? [{ monsterIndex, monsterType: monster.monsterType,
        name: monster.name, position, roomId: inferRoomIdOnMap(position, scope.mapId, state) }] : []
    })
    return monsters.length ? [{ encounterId: encounter.id, roomId: encounter.roomId,
      noiseAmbush: encounter.noiseAmbush,
      awareness: saved ? { status: saved.status, doorId: saved.doorId, entryPending: saved.entryPending, revision: saved.revision, lastActivation: saved.lastActivation } : null,
      monsters }] : []
  })
}
