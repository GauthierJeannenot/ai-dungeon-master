import { swallowedBy } from '../lib/swallow-state'
import { greaterBrewingIdReserved } from '../lib/xge-greater-brewing-state'
import { multiDayScribingIdReserved } from '../lib/xge-multiday-scribing-state'
import { initialDmToolState } from '../lib/dm-tool-state'
import { firstMapId, getMapSpec, inferRoomIdOnMap } from '../lib/adventure-map'
import type { GridCell } from '../lib/adventure-map'
import * as gs from './game-state'
import { ruleErrorResult, RuleViolation, validateMapCell } from './rules'
import { distance, available } from './hero-rules'
import { visibleCell } from './monster-perception'
import { weatherHeightPointIssue } from '../lib/weather-state'
import { physicalHeightPointIssue,entityVerticalContext } from '../lib/jumping-state'

export const toolkitResult = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] })
export function toolkitState() { return gs.getState().dmTools ??= initialDmToolState() }
export function toolkitError(code: string, message: string): never { throw new RuleViolation(code, message, {}) }
export function assertGreaterBrewingIdAvailable(id: string) {
  if (greaterBrewingIdReserved(gs.getState(), id))
    toolkitError('XGE_BREW_OUTPUT_ID_RESERVED', 'This exact physical identity belongs to the original greater-potion project, including its abandoned or consumed history.')
  if (multiDayScribingIdReserved(gs.getState(), id))
    toolkitError('XGE_SCRIBE_OUTPUT_ID_RESERVED', 'This exact physical identity belongs to its original multi-day scroll project, including abandoned and consumed history.')
}
export function toolkitTransaction<T>(operation: () => T) {
  const before = structuredClone(gs.getState())
  try { return operation() }
  catch (error) {
    const live = gs.getState()
    for (const key of Object.keys(live)) delete (live as unknown as Record<string, unknown>)[key]
    Object.assign(live, before)
    return ruleErrorResult(error)
  }
}
export function toolkitLocation(cell: GridCell) {
  const state = gs.getState(), mapId = getMapSpec(state.currentMapId, state).id
  validateMapCell(cell)
  const roomId = inferRoomIdOnMap(cell, mapId, state)
  if (!roomId) toolkitError('SCENE_LOCATION_REQUIRED', 'Choose a cell in an existing room of the active map.')
  return { mapId, roomId: roomId! }
}
export function assertToolkitPreparation() {
  available()
  if (gs.getState().phase === 'combat') toolkitError('PREPARATION_OUTSIDE_COMBAT', 'Create scene content outside combat, before resolving its interactions.')
}
export function assertToolkitReach(item: { mapId: string; roomId: string; cell: GridCell;surfaceZFeet?:number }, actorId = 'player', range = 1, ignoredObjectId?: string) {
  const state = gs.getState(), actor = gs.getEntity(actorId)
  if(swallowedBy(state,actorId))toolkitError('SWALLOW_EXTERNAL_REACH_BLOCKED','A contained body cannot reach an outside scene object through its host; no exterior contact is invented.')
  if (!actor) toolkitError('ENTITY_NOT_FOUND', 'Choose an existing actor.')
  const vertical=entityVerticalContext(state,actorId)
  if(item.surfaceZFeet!==undefined&&(!Number.isFinite(item.surfaceZFeet)||!vertical.known||vertical.zFeet!==item.surfaceZFeet))toolkitError('PHYSICAL_HEIGHT_POINT_GEOMETRY_REQUIRED','Reach the actual measured surface at its real level; no XY-only contact or source height is inferred.')
  const heightIssue=(item.surfaceZFeet===undefined?physicalHeightPointIssue(state,[actorId]):null)??weatherHeightPointIssue(state,[actorId]);if(heightIssue)toolkitError(heightIssue.code,heightIssue.message)
  const mapId = state.currentMapId ?? firstMapId(state)
  if (item.mapId !== mapId || inferRoomIdOnMap(actor!.position, mapId, state) !== item.roomId
    || distance(actor!.position, item.cell) > range
    || !visibleCell({ ...actor!, conditions: actor!.conditions.filter(condition => condition !== 'blinded') }, item.cell, ignoredObjectId))
    toolkitError('SCENE_TARGET_OUT_OF_REACH', 'Approach the exact target in the same room/map with an unobstructed path.')
  return actor!
}
