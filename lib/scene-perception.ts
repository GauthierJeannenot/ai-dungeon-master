import { firstMapId, getAdventureMap, getMapSpec, inferRoomIdOnMap, roomContainsCell, type GridCell } from './adventure-map'
import { navigationGrid, savedDoorState } from './navigation'
import type { GameState } from './types'
import { visualPerceptionAt } from './lighting'
import { playerKnowsDoor } from './door-discovery'

// Topology, not movement availability: a closed door still connects two rooms.
// Do not use exploration destinations here (they can include remote locations).
export function adjacentRoomConnections(state: GameState, roomId = state.currentRoomId) {
  const data = getAdventureMap(state), map = getMapSpec(state.currentMapId, state)
  const current = data.rooms.find(room => room.id === roomId && (room.mapId ?? firstMapId(state)) === map.id)
  if (!current) return []
  const grid = navigationGrid(state, 'player', map.geometry, { ignoreActorEffects: true })
  const connected = new Set<string>()
  for (let y = current.zone.minY; y <= current.zone.maxY; y++) for (let x = current.zone.minX; x <= current.zone.maxX; x++) {
    const cell = { x, y }
    if (grid.roomAt(cell) !== current.id || !grid.free(cell, false)) continue
    for (const next of grid.neighbors(cell)) {
      if (cell.x !== next.x && cell.y !== next.y) continue
      const other = grid.roomAt(next)
      if (other && other !== current.id && grid.step(cell, next, true, false)) connected.add(other)
    }
  }
  const doors = (data.doors ?? []).filter(door => playerKnowsDoor(state,door.id)&&door.sides.some(side => side.roomId === current.id))
  for (const door of doors) for (const side of door.sides) if (side.roomId !== current.id) connected.add(side.roomId)
  return data.rooms.filter(room => connected.has(room.id) && (room.mapId ?? firstMapId(state)) === map.id)
    .map(room => ({ room, doors: doors.filter(door => door.sides.some(side => side.roomId === room.id))
      .map(door => ({ doorId: door.id, state: savedDoorState(state, door.id), opening: Boolean(door.opening) })) }))
}

// Seeing an occupied square does not require entering it. Illumination changes
// sight only after the MJ explicitly configures a room's ambient lighting.
export function playerSeesCell(state: GameState, cell: GridCell): boolean {
  return playerSight(state)(cell)
}

function playerSight(state: GameState) {
  return (cell:GridCell):boolean=>visualPerceptionAt(state,state.player,cell).canSee
}

export function nearbyRoomPerception(state: GameState) {
  const map = getMapSpec(state.currentMapId, state)
  const sees = playerSight(state)
  return adjacentRoomConnections(state).map(connection => {
    const visibleCells: GridCell[] = []
    const room = connection.room
    for (let y = room.zone.minY; y <= room.zone.maxY; y++) for (let x = room.zone.minX; x <= room.zone.maxX; x++) {
      const cell = { x, y }
      if (roomContainsCell(room, cell) && inferRoomIdOnMap(cell, map.id, state) === room.id && sees(cell)) visibleCells.push(cell)
    }
    const visible = (cell: GridCell) => visibleCells.some(c => c.x === cell.x && c.y === cell.y)
    return { roomId: room.id, name: room.name, doors: connection.doors,
      visibleCells,
      visibleNpcIds: Object.values(state.npcs ?? {}).filter(npc => npc.visible
        && (npc.mapId ?? firstMapId(state)) === map.id && visible(npc.position)).map(npc => npc.id),
      visibleMonsterIds: Object.values(state.monsters).filter(monster => monster.isAlive
        && (!monster.conditions.includes('invisible') || state.hero?.effects.some(effect => effect.kind === 'see-invisibility'
          && effect.targetIds.includes('player') && effect.expiresAt > (state.worldTimeSeconds ?? 0))) && visible(monster.position)).map(monster => monster.id) }
  })
}
