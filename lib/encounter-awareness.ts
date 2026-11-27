import { getAdventureMap, getMapSpec, resolveRoomMapId, type GridCell } from './adventure-map'
import type { GameState } from './types'

export interface EncounterAwareness {
  mapId: string
  status: 'alert' | 'investigating' | 'ambushing'
  doorId?: string
  entryPending?: boolean
  sourceRoomId: string
  reason: string
  lastActivation: string
  revision: number
  positions: GridCell[]
  speeds: number[]
}

// Saved in sceneMemory, which already survives engine hydration and Postgres.
export function encounterAwareness(state: GameState): Record<string, EncounterAwareness> {
  return (state.sceneMemory?.encounterAwareness ?? {}) as Record<string, EncounterAwareness>
}

export const encounterActorId = (encounterId: string, index: number) => `encounter:${encounterId}:${index}`

export function pendingEncounterActors(state: GameState) {
  const map = getMapSpec(state.currentMapId, state)
  return Object.entries(encounterAwareness(state)).flatMap(([id, awareness]) => {
    const encounter = getAdventureMap(state).encounters[id]
    if (!encounter || awareness.mapId !== map.id || resolveRoomMapId(encounter.roomId, state) !== map.id
      || state.encountersTriggered?.includes(id) || awareness.status === 'alert') return []
    return awareness.positions.map((position, index) => ({ id: encounterActorId(id, index), position, speed: awareness.speeds?.[index] ?? 0,
      encounterId: id, monsterIndex: index, spec: encounter.monsters[index] })).filter(actor => actor.spec)
  })
}

// A decision boundary only: the model must explicitly resolve the encounter.
export function pendingDoorAmbush(state: GameState, cell = state.player.position, from?: GridCell) {
  const data = getAdventureMap(state)
  return Object.entries(encounterAwareness(state)).find(([id, awareness]) => {
    if (awareness.mapId !== getMapSpec(state.currentMapId, state).id
      || awareness.status !== 'ambushing' || state.encountersTriggered?.includes(id)) return false
    const door = data.doors?.find(door => door.id === awareness.doorId)
    const side = door?.sides.find(side => side.roomId === data.encounters[id]?.roomId)
    const outside = door?.sides.find(side => side.roomId !== data.encounters[id]?.roomId)
    return side?.cell.x === cell.x && side.cell.y === cell.y && (from
      ? outside?.cell.x === from.x && outside.cell.y === from.y
      : awareness.entryPending === true)
  })?.[0]
}
