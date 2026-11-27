import { getAdventureMap, inferRoomIdOnMap } from '../lib/adventure-map'
import { navigationGrid } from '../lib/navigation'
import { rememberMapDiscovery } from '../lib/map-discovery'
import { engineGeometry } from './navigation'
import * as gs from './game-state'
import { RuleViolation } from './rules'
import { sphereBlocksDoor } from '../lib/complex-trap-state'
import { playerKnowsDoor } from '../lib/door-discovery'

export type DoorState = 'open' | 'closed' | 'broken'

export function getDoor(doorId: string, actorId = 'player') {
  const state = gs.getState()
  const door = getAdventureMap(state).doors?.find(door => door.id === doorId)
  const actor = gs.getEntity(actorId) ?? gs.getNpc(actorId)
  const roomId = actor ? inferRoomIdOnMap(actor.position, state.currentMapId, state) : null
  const side = door?.sides.find(side => side.roomId === roomId)
  if (!door || !side ||actorId==='player'&&!playerKnowsDoor(state,doorId)) throw new RuleViolation('DOOR_NOT_ACCESSIBLE', 'No such known door in the current room.', { doorId })
  return { door, side, other: door.sides.find(candidate => candidate !== side)! }
}

export function getDoorState(doorId: string): DoorState {
  if(sphereBlocksDoor(gs.getState(),doorId))throw new RuleViolation('SPHERE_BLOCKS_DOOR','The stopped crushing sphere physically blocks this door; opening or forcing the door cannot move that sphere.',{doorId})
  const door = getAdventureMap(gs.getState()).doors?.find(d => d.id === doorId)
  if (!door) throw new RuleViolation('UNKNOWN_DOOR', 'Unknown door ID.', { doorId })
  if (door.opening) return 'open'
  const saved = gs.getState().sceneMemory?.doorStates as Record<string, unknown> | undefined
  const value = saved?.[doorId]
  return value === 'open' || value === 'closed' || value === 'broken' ? value : door.initialState
}

export function setDoorState(doorId: string, value: DoorState): void {
  const state = gs.getState()
  if(sphereBlocksDoor(state,doorId))throw new RuleViolation('SPHERE_BLOCKS_DOOR','The stopped crushing sphere physically blocks this door; changing the door state cannot remove it.',{doorId})
  if (getAdventureMap(state).doors?.find(d => d.id === doorId)?.opening && value !== 'open') {
    throw new RuleViolation('NO_DOOR_PANEL', 'This is an empty opening, with no door to close or force.', { doorId })
  }
  state.sceneMemory ??= {}
  const previous = state.sceneMemory.doorStates
  state.sceneMemory.doorStates = { ...(previous && typeof previous === 'object' ? previous : {}), [doorId]: value }
  rememberMapDiscovery(state)
}

export function assertDoorReach(doorId: string, actorId = 'player'): void {
  const { side } = getDoor(doorId, actorId)
  const position = (gs.getEntity(actorId) ?? gs.getNpc(actorId))!.position
  const distance = Math.max(Math.abs(position.x - side.cell.x), Math.abs(position.y - side.cell.y))
  if (distance > 1 || (distance === 1 && !navigationGrid(gs.getState(), actorId, engineGeometry()).step(position, side.cell, false, false))) {
    throw new RuleViolation('DOOR_OUT_OF_REACH', 'Approach this side of the door before interacting or crossing.', { doorId, approachCell: side.cell, position })
  }
}
