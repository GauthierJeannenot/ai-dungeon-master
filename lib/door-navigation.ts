import { getAdventureMap, getMapSpec, inferRoomIdOnMap } from './adventure-map'
import { geometricDistanceCells, navigationActor, navigationGrid, savedDoorState } from './navigation'
import type { GameState } from './types'
import { discoveredMapRooms } from './map-discovery'
import { playerKnowsDoor } from './door-discovery'

// Advisory UI only. Every request still goes to the agent and MCP validation.
export function roomDoorActions(state: GameState) {
  if (state.hero?.pending || (state.phase === 'combat' && state.currentTurn !== 'player')) return []
  try { if (navigationActor(state, 'player').speed <= 0) return [] } catch { return [] }
  const map = getMapSpec(state.currentMapId, state)
  const roomId = inferRoomIdOnMap(state.player.position, map.id, state)
  const data = getAdventureMap(state)
  const grid = navigationGrid(state, 'player', map.geometry)
  const atReach = (cell: { x: number; y: number }) => {
    const distance = geometricDistanceCells(state.player.position, cell)
    return distance === 0 || (distance === 1 && grid.step(state.player.position, cell, false, false))
  }
  const doors = (data.doors ?? []).filter(door => playerKnowsDoor(state,door.id)&&door.sides.some(side => side.roomId === roomId)).flatMap((door, index) => {
    const side = door.sides.find(side => side.roomId === roomId)
    if (!side) return []
    const other = door.sides.find(other => other !== side)!
    const known = discoveredMapRooms(state).some(room => room.id === other.roomId)
    const destination = known ? data.rooms.find(room => room.id === other.roomId)?.name : 'Pièce inexplorée'
    const reachable = atReach(side.cell)
    const closed = savedDoorState(state, door.id) === 'closed'
    const verb = reachable ? closed ? 'Ouvrir et traverser' : 'Traverser' : 'Approcher'
    const type = door.opening ? 'Passage' : 'Porte'
    return [{ id: door.id, cell: side.cell, marker: String(index + 1),
      anchor: { x: (side.cell.x + other.cell.x + 1) / 2, y: (side.cell.y + other.cell.y + 1) / 2 },
      reachable, label: `${verb} · ${type} ${index + 1} · ${side.direction} · ${destination}`,
      message: reachable
        ? `Je veux ${closed ? 'ouvrir puis traverser' : 'traverser'} ${door.opening ? 'le passage vide' : 'la porte'} doorId=${JSON.stringify(door.id)}, depuis la salle roomId=${JSON.stringify(side.roomId)} vers roomId=${JSON.stringify(other.roomId)}.${door.opening ? '' : ' Si elle résiste ou exige de forcer, je m’arrête et attends.'} Je ne termine pas mon tour.`
        : `Je m’approche uniquement ${door.opening ? 'du passage vide' : 'de la porte'} doorId=${JSON.stringify(door.id)}, côté roomId=${JSON.stringify(side.roomId)}, sans ${door.opening ? 'le traverser' : 'l’ouvrir ni la traverser'}. Je ne termine pas mon tour.` }]
  })
  const passages = data.mapTransitions.filter(t => state.phase !== 'combat' && t.fromMapId === map.id && t.passage?.roomId === roomId).map(t => {
    const passage = t.passage!
    const reachable = atReach(passage.cell)
    return { id: t.id, cell: passage.cell, marker: '↕', anchor: { x: passage.cell.x + .5, y: passage.cell.y + .5 },
      reachable, label: reachable ? passage.label : `Approcher · ${passage.label}`,
      message: reachable ? `Je souhaite emprunter ${t.generatedDungeonId?'le passage du donjon':'l’escalier'} transitionId=${JSON.stringify(t.id)} avec travel_to_map.`
        : `Je me déplace uniquement jusqu’à la case (${passage.cell.x}, ${passage.cell.y}), dans la salle roomId=${JSON.stringify(passage.roomId)}, pour approcher l’escalier, sans changer de carte.` }
  })
  return [...doors, ...passages]
}
