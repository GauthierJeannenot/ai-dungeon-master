import { SCENE_SUPPLY_LABELS } from '../lib/srd/equipment'
import { toolkitError } from './toolkit'
import * as gs from './game-state'
export function objectById(id: string) {
  const object = gs.getState().dmTools?.objects[id]
  if (!object) toolkitError('SCENE_OBJECT_NOT_FOUND', 'Choose an exact registered scene object ID.')
  return object!
}
export function releaseContents(id: string) {
  const object = objectById(id), state = gs.getState()
  if (object.contentsReleased) return []
  const items = object.contents.map((id, index) => ({ id: `${object.id}:content:${index}`, name: SCENE_SUPPLY_LABELS[id], equipmentId: id, type: 'misc' as const }))
  for (const item of items) if (state.player.inventory.some(existing => existing.id === item.id) || state.droppedItems?.[item.id])
    toolkitError('ITEM_ID_CONFLICT', 'A prepared content ID is already in use.')
  state.droppedItems ??= {}
  for (const item of items) state.droppedItems[item.id] = { item, mapId: object.mapId, roomId: object.roomId, position: { ...object.cell } }
  object.contentsReleased = true
  return items
}
export function objectSnapshot(id: string) {
  const { creation: _creation, contents: _contents, ...object } = objectById(id)
  return object
}
