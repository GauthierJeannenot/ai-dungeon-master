import type { GameState, SavingThrowResult } from '../lib/types'
import type { GridCell } from '../lib/adventure-map'
import type { SceneObject } from '../lib/dm-tool-state'
import { getAdventureMap, inferRoomIdOnMap } from '../lib/adventure-map'
import { activeVerticalSurface, actualSurfaceAt, entityGroundContact, entityVerticalContext } from '../lib/jumping-state'
import { navigationGrid } from '../lib/navigation'
import { locomotionStateOf } from '../lib/locomotion-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import {
  activeRazorvineObjects, adjacentRazorvineFace, razorvineHedgeWitness, razorvineStateOf, razorvineTurnKey,
  RecordRazorvineSchema, ResolveRazorvineContactSchema, sameRazorvineCell, sceneObjectFootprint,
  RAZORVINE_IMMUNITIES, RAZORVINE_SAVE, RAZORVINE_SOURCE, type RazorvineContact,
} from '../lib/razorvine-state'
import { engineGeometry } from './navigation'
import { available, now } from './hero-rules'
import { savedResolution, registerCheckedResolution } from './toolkit-checks'
import { assertKnockoutDamageSupported } from './nonlethal'
import { groundDamageIssue } from './ground-damage-preflight'
import { dealDamage } from './monster-rules'
import { rollDice } from './dice'
import { assertGreaterBrewingIdAvailable, assertToolkitPreparation, toolkitError, toolkitResult, toolkitState } from './toolkit'
import * as gs from './game-state'

export function recordRazorvine(raw: unknown) {
  const input = RecordRazorvineSchema.parse(raw), state = gs.getState()
  const existing = state.dmTools?.objects[input.hedgeId]
  if (existing) {
    if (existing.razorvine && witness(existing.razorvine.input) === witness(input))
      return { success: true, hedge: existing, replayed: true, source: RAZORVINE_SOURCE }
    toolkitError('RAZORVINE_ID_CONFLICT', 'Keep the exact original physical hedge ID and measured location.')
  }
  assertGreaterBrewingIdAvailable(input.hedgeId)
  assertToolkitPreparation()
  if (Object.keys(state.dmTools?.objects ?? {}).length >= 64) toolkitError('OBJECT_LIMIT_REACHED', 'The actual scene object capacity is full.')
  if (getAdventureMap(state).doors?.some(door => door.id === input.hedgeId) || gs.getNpc(input.hedgeId) || gs.getEntity(input.hedgeId))
    toolkitError('RAZORVINE_ID_CONFLICT', 'The sourced hedge cannot replace a real door or creature.')
  const cells = [input.firstCell, input.secondCell]
  const surface = state.dmTools?.jumping?.surfaces[input.baseSurfaceId]
  if (!surface || surface.kind !== 'support' || surface.objectId || surface.mapId !== state.currentMapId
    || surface.roomId !== state.currentRoomId || surface.elevationFeet !== 0
    || cells.some(cell => {
      const observed = actualSurfaceAt(state, cell)
      return observed.length !== 1 || observed[0].surfaceId !== surface.surfaceId
    })) toolkitError('RAZORVINE_MEASURED_BASE_REQUIRED', 'Choose one actual unambiguous ground-level terrain support across both cells.')
  const grid = navigationGrid(state, 'player', engineGeometry(), { ignoreActorEffects: true, ignoreDoorKnowledge: true })
  const bodies = [state.player, ...Object.values(state.monsters), ...Object.values(state.npcs ?? {}).filter(body => body.mapId === state.currentMapId)]
  if (!adjacentRazorvineFace(input.firstCell, input.secondCell) || !grid.step(input.firstCell, input.secondCell)
    || cells.some(cell => !grid.free(cell) || inferRoomIdOnMap(cell, surface.mapId, state) !== surface.roomId
      || bodies.some(body => sameRazorvineCell(cell, body.position))))
    toolkitError('RAZORVINE_FOOTPRINT_REQUIRED', 'Both actual orthogonally adjacent cells of the 10-by-5-foot rooted footprint must be accessible, clear and in the same room.')
  if (Object.values(state.dmTools?.objects ?? {}).some(object => object.razorvine && object.mapId === state.currentMapId
    && sceneObjectFootprint(object).some(cell => cells.some(other => sameRazorvineCell(cell, other)))))
    toolkitError('RAZORVINE_FOOTPRINT_RETAINED', 'The rooted source footprint has already been qualified, even if its plant was later destroyed.')
  const fact = state.worldFacts?.find(value => value.id === input.factId)
  if (!fact?.narrativeEffect || fact.source !== 'record_scene_fact' || fact.expires !== 'never'
    || fact.mapId !== surface.mapId || fact.roomId !== surface.roomId
    || !cells.some(cell => sameRazorvineCell(cell, fact.narrativeEffect!.cell)))
    toolkitError('RAZORVINE_FACT_REQUIRED', 'Choose the actual durable public scene fact that establishes this rooted hedge at one of its measured cells.')
  const hedge: SceneObject = {
    id: input.hedgeId, name: 'Razorvine', description: fact.narrativeEffect.description,
    mapId: surface.mapId, roomId: surface.roomId, cell: { ...input.firstCell }, kind: 'obstacle',
    material: 'razorvine', size: 'large', resilience: 'resilient', ac: 11, hp: { current: 25, max: 25 },
    state: 'intact', blocksSight: input.observedBlocksSight, locked: false, creation: witness(input), contents: [], contentsReleased: false,
    damageProfile: { reason: RAZORVINE_SOURCE, immunities: [...RAZORVINE_IMMUNITIES], resistances: [], vulnerabilities: [],
      damageThreshold: 0, magicalResilience: false },
    razorvine: { input, at: now(), baseZFeet: surface.elevationFeet, surfaceWitness: witness(surface), factWitness: witness(fact) },
  }
  toolkitState().objects[hedge.id] = hedge
  return { success: true, hedge, dimensionsFeet: { width: 10, thickness: 5, height: 10 }, source: RAZORVINE_SOURCE }
}

export function razorvineAtFace(state: GameState, hedge: SceneObject, creatureId: string, from: GridCell, face: GridCell) {
  if (!hedge.razorvine || hedge.mapId !== state.currentMapId || hedge.state === 'destroyed' || hedge.hp.current <= 0
    || !sceneObjectFootprint(hedge).some(cell => sameRazorvineCell(cell, face))
    || !adjacentRazorvineFace(from, face)
    || inferRoomIdOnMap(from, hedge.mapId, state) !== hedge.roomId) return false
  const support = entityGroundContact(state, creatureId, from, hedge.razorvine.baseZFeet)
  if (support.contact !== true || !support.context.surfaceId || !activeVerticalSurface(state, support.context.surfaceId)) return false
  const view = { ...state, dmTools: { ...state.dmTools!,
    objects: Object.fromEntries(Object.entries(state.dmTools!.objects).filter(([id]) => id !== hedge.id)) } }
  const grid = navigationGrid(view, creatureId, engineGeometry(), { ignoreActorEffects: true, ignoreDoorKnowledge: true })
  return grid.free(from) && grid.step(from, face)
}

/** Bounded dry, coplanar projectile path. Cardinal cells give an exact first
 * physical face; other rays await a measured impact point, never an XY guess. */
export function razorvineRangedFacePlan(state: GameState, hedge: SceneObject, from: GridCell, face: GridCell) {
  if (from.x !== face.x && from.y !== face.y) return razorvineDiagonalRangedFacePlan(state, hedge, from, face)
  if (!hedge.razorvine || hedge.mapId !== state.currentMapId || hedge.state === 'destroyed' || !hedge.hp.current
    || !sceneObjectFootprint(hedge).some(cell => sameRazorvineCell(cell, face))
    || sameRazorvineCell(from, face) || from.x !== face.x && from.y !== face.y)
    toolkitError('RAZORVINE_RANGED_FACE_REQUIRED', 'Choose the actual nearest hedge cell on a cardinal dry coplanar projectile ray; diagonal or inferred impact points are not represented.')
  const support = entityGroundContact(state, 'player', from, hedge.razorvine!.baseZFeet)
  if (support.contact !== true || !support.context.surfaceId || !activeVerticalSurface(state, support.context.surfaceId))
    toolkitError('RAZORVINE_RANGED_SUPPORT_REQUIRED', 'The actual shooter must stand on a measured support at the hedge base level; no airborne or elevated ray is inferred.')
  const count = Math.abs(face.x - from.x) + Math.abs(face.y - from.y)
  const rayCells = Array.from({ length: count + 1 }, (_, step) => ({
    x: from.x + Math.sign(face.x - from.x) * step, y: from.y + Math.sign(face.y - from.y) * step,
  }))
  if (rayCells.slice(0, -1).some(cell => sceneObjectFootprint(hedge).some(other => sameRazorvineCell(cell, other))))
    toolkitError('RAZORVINE_RANGED_FAR_FACE', 'The selected impact cell is behind the same physical hedge. Choose its first actually exposed face before any projectile or die.')
  if (Object.values(locomotionStateOf(state)?.media ?? {}).some(medium => medium.mode === 'swim'
    && medium.mapId === state.currentMapId && medium.cells.some(cell => rayCells.some(point => sameRazorvineCell(cell, point)))))
    toolkitError('RAZORVINE_RANGED_WATER_UNREPRESENTED', 'This bounded hedge projectile path must be physically dry along its complete ray.')
  const surfaces = rayCells.map(cell => {
    const candidates = actualSurfaceAt(state, cell)
    if (candidates.length !== 1 || candidates[0].kind !== 'support' || candidates[0].elevationFeet !== hedge.razorvine!.baseZFeet
      || !activeVerticalSurface(state, candidates[0].surfaceId))
      toolkitError('RAZORVINE_RANGED_PLANE_REQUIRED', 'Measure one unambiguous dry support plane along this complete cardinal ray before the attack; no gap or relief is inferred flat.')
    return { cell, surface: candidates[0] }
  })
  const view = { ...state, dmTools: { ...state.dmTools!,
    objects: Object.fromEntries(Object.entries(state.dmTools!.objects).filter(([id]) => id !== hedge.id)) } }
  const grid = navigationGrid(view, 'player', engineGeometry(), { ignoreActorEffects: true, ignoreDoorKnowledge: true })
  for (let step = 1; step < rayCells.length; step++)
    if (!grid.step(rayCells[step - 1], rayCells[step], false, false))
      toolkitError('RAZORVINE_RANGED_PATH_BLOCKED', 'The exact selected face ray crosses a represented wall, closed door or physical obstacle before any die or projectile.')
  return { mapId: hedge.mapId, roomId: hedge.roomId, from: { ...from }, face: { ...face },
    baseZFeet: hedge.razorvine!.baseZFeet, rayCells, supportWitness: witness(support), surfacesWitness: witness(surfaces) }
}

/** First diagonal slice: exact45degree centre ray only. A target CELL corner
 * is not automatically a corner/tangency of the entire continuous hedge.
 * Fractions use denominator2*steps, so every decision is exact integer math. */
function razorvineDiagonalRangedFacePlan(state: GameState, hedge: SceneObject, from: GridCell, face: GridCell) {
  const dx = face.x - from.x, dy = face.y - from.y, steps = Math.abs(dx)
  if (!hedge.razorvine || hedge.mapId !== state.currentMapId || hedge.state === 'destroyed' || !hedge.hp.current
    || !sceneObjectFootprint(hedge).some(cell => sameRazorvineCell(cell, face))
    || !steps || steps !== Math.abs(dy))
    toolkitError('RAZORVINE_RANGED_FACE_REQUIRED', 'Select an actual first hedge cell on a cardinal or exact45degree dry coplanar centre ray; other oblique impacts remain unrepresented.')
  const vine = hedge.razorvine!, footprint = sceneObjectFootprint(hedge), sx = Math.sign(dx), sy = Math.sign(dy), denominator = 2 * steps
  const interval = (cells: GridCell[]) => {
    const bounds = { minX: Math.min(...cells.map(cell => cell.x)) * 2 - 1, maxX: Math.max(...cells.map(cell => cell.x)) * 2 + 1,
      minY: Math.min(...cells.map(cell => cell.y)) * 2 - 1, maxY: Math.max(...cells.map(cell => cell.y)) * 2 + 1 }
    const x = [(bounds.minX - 2 * from.x) * sx, (bounds.maxX - 2 * from.x) * sx]
    const y = [(bounds.minY - 2 * from.y) * sy, (bounds.maxY - 2 * from.y) * sy]
    return { bounds, low: Math.max(0, Math.min(...x), Math.min(...y)), high: Math.min(denominator, Math.max(...x), Math.max(...y)) }
  }
  const whole = interval(footprint), cells = footprint.map(cell => ({ cell, ...interval([cell]) }))
  if (whole.low >= whole.high)
    toolkitError('RAZORVINE_DIAGONAL_IMPACT_UNREPRESENTED', 'A tangent point of the whole hedge does not establish one actual entered plant cell before any projectile or die.')
  const first = cells.filter(cell => cell.low < cell.high && cell.low === whole.low)
  if (first.length !== 1 || !sameRazorvineCell(first[0].cell, face))
    toolkitError('RAZORVINE_RANGED_FAR_FACE', 'The explicitly selected cell is not the uniquely first entered hedge cell; do not infer another target or pass through the plant.')
  const entryPointHalfCells = { x: 2 * from.x + sx * whole.low, y: 2 * from.y + sy * whole.low }
  const boundaryX = entryPointHalfCells.x === whole.bounds.minX || entryPointHalfCells.x === whole.bounds.maxX
  const boundaryY = entryPointHalfCells.y === whole.bounds.minY || entryPointHalfCells.y === whole.bounds.maxY
  if (boundaryX === boundaryY)
    toolkitError('RAZORVINE_DIAGONAL_CORNER_UNREPRESENTED', 'The actual first intersection must lie on one represented hedge edge, not an unresolved whole-hedge corner or interior starting point.')
  const support = entityGroundContact(state, 'player', from, vine.baseZFeet)
  if (support.contact !== true || !support.context.surfaceId || !activeVerticalSurface(state, support.context.surfaceId))
    toolkitError('RAZORVINE_RANGED_SUPPORT_REQUIRED', 'The actual shooter must stand on its measured support at the hedge base; no raised, airborne or guessed diagonal plane.')
  const rayCells = Array.from({ length: steps + 1 }, (_, index) => ({ x: from.x + sx * index, y: from.y + sy * index }))
  const clearanceCells = rayCells.slice(1).flatMap((cell, index) => [
    { x: cell.x, y: rayCells[index].y }, { x: rayCells[index].x, y: cell.y },
  ])
  const planeCells = [...new Map([...rayCells, ...clearanceCells].map(cell => [JSON.stringify(cell), cell])).values()]
  if (Object.values(locomotionStateOf(state)?.media ?? {}).some(medium => medium.mode === 'swim'
    && medium.mapId === state.currentMapId && medium.cells.some(cell => planeCells.some(point => sameRazorvineCell(cell, point)))))
    toolkitError('RAZORVINE_RANGED_WATER_UNREPRESENTED', 'This bounded actual diagonal ray and corner clearance must remain measured dry ground.')
  const surfaces = planeCells.map(cell => {
    const candidates = actualSurfaceAt(state, cell)
    if (candidates.length !== 1 || candidates[0].kind !== 'support' || candidates[0].elevationFeet !== vine.baseZFeet
      || !activeVerticalSurface(state, candidates[0].surfaceId) || inferRoomIdOnMap(cell, hedge.mapId, state) !== hedge.roomId)
      toolkitError('RAZORVINE_RANGED_PLANE_REQUIRED', 'Measure one unambiguous same-level dry support for every exact ray and corner-clearance cell; no gap or relief is inferred flat.')
    return { cell, surface: candidates[0] }
  })
  const view = { ...state, dmTools: { ...state.dmTools!,
    objects: Object.fromEntries(Object.entries(state.dmTools!.objects).filter(([id]) => id !== hedge.id)) } }
  const grid = navigationGrid(view, 'player', engineGeometry(), { ignoreActorEffects: true, ignoreDoorKnowledge: true })
  for (let index = 1; index < rayCells.length; index++) if (!grid.step(rayCells[index - 1], rayCells[index], false, false))
    toolkitError('RAZORVINE_RANGED_PATH_BLOCKED', 'The exact diagonal and both represented corner routes must clear actual walls, closed doors and other obstacles before dice, action or projectile.')
  return { mapId: hedge.mapId, roomId: hedge.roomId, from: { ...from }, face: { ...face }, baseZFeet: vine.baseZFeet,
    rayCells, supportWitness: witness(support), surfacesWitness: witness(surfaces),
    diagonal: { kind: 'exact45degree' as const, denominator, entryNumerator: whole.low,
      entryPointHalfCells, hedgeBoundsHalfCells: whole.bounds, entryBoundaryAxis: boundaryX ? 'x' as const : 'y' as const,
      enteredCell: { ...first[0].cell }, enteredInterval: { fromNumerator: first[0].low, toNumerator: first[0].high },
      tangentCells: cells.filter(cell => cell.low === cell.high && cell.low >= 0 && cell.low <= denominator)
        .map(cell => ({ cell: { ...cell.cell }, atNumerator: cell.low })), clearanceCells } }
}

export function razorvinePreparationWitness(state: GameState, hedgeId: string) {
  const hedge = activeRazorvineObjects(state).find(value => value.id === hedgeId)
  if (!hedge) return undefined
  return sceneObjectFootprint(hedge).find(face => razorvineAtFace(state, hedge, 'player', state.player.position, face))
}

function contactBody(input: RazorvineContact['input'], expected?: RazorvineContact) {
  const state = gs.getState(), body = gs.getPhysicalCreature(input.creatureId), hedge = state.dmTools?.objects[input.hedgeId]
  if (state.phase !== 'combat' || !state.currentTurn || !state.initiativeOrder.includes(input.creatureId))
    toolkitError('RAZORVINE_TURNS_REQUIRED', 'The actual body and contact require active initiative in this supported slice.')
  if (!body || 'group' in body && body.group)
    toolkitError('RAZORVINE_ACTUAL_BODY_REQUIRED', 'Choose one actual individual body already participating in this initiative.')
  if (!hedge || !razorvineAtFace(state, hedge, body.id, body.position, input.faceCell))
    toolkitError('RAZORVINE_DIRECT_FACE_REQUIRED', 'Establish actual direct contact with an exact reachable cardinal face at the same real ground height; proximity, flight, a wall or a guessed touch is insufficient.')
  const bodyWitness = witness({ id: body.id, position: body.position, vertical: entityVerticalContext(state, body.id),
    hp: body.hp, conditions: body.conditions })
  const hedgeWitness = razorvineHedgeWitness(hedge)
  if (expected && (expected.mapId !== state.currentMapId || expected.turnKey !== razorvineTurnKey(state)
    || expected.bodyWitness !== bodyWitness || expected.hedgeWitness !== hedgeWitness))
    toolkitError('RAZORVINE_CONTACT_CHANGED', 'Retain the actual original body, thorn face and initiative turn before any held reaction die.')
  return { body, bodyWitness, hedgeWitness }
}

function assertRazorvineDamage(state: GameState, body: NonNullable<ReturnType<typeof gs.getPhysicalCreature>>) {
  if (body.hp.current <= 0 || 'isAlive' in body && !body.isAlive)
    toolkitError('RAZORVINE_ACTUAL_BODY_REQUIRED', 'This first injury needs the actual living individual with a supported damage lifecycle.')
  const issue = groundDamageIssue(state, body.id, 10)
  if (issue) toolkitError(issue.code, issue.message)
  assertKnockoutDamageSupported(body, 10)
}

function finishRazorvineContact(command: Record<string, unknown>, save: SavingThrowResult) {
  const contact = razorvineStateOf(gs.getState())?.contacts[String(command.eventId)]
  if (!contact || contact.result) toolkitError('RAZORVINE_CONTACT_CHANGED', 'Retain the original actual thorn contact for one save and possible damage.')
  const { body } = contactBody(contact.input, contact)
  if (save.entityId !== body.id || save.ability !== 'dex' || save.dc !== 10)
    toolkitError('RAZORVINE_SAVE_CHANGED', 'This source requires the original DC 10 Dexterity saving throw.')
  const roll = save.success ? undefined : rollDice('1d10')
  const damage = roll ? gs.withPhysicalCreatureResolution([body.id], () => dealDamage(body.id, roll.total, 'slashing')) : undefined
  const result = { success: true, eventId: contact.input.eventId, creatureId: body.id, hedgeId: contact.input.hedgeId,
    turnKey: contact.turnKey, save, ...(roll ? { damageRoll: roll, damageResolution: damage } : {}),
    damageDealt: damage?.damageDealt ?? 0, actionSpent: false, movementSpent: false, source: RAZORVINE_SOURCE }
  contact.result = structuredClone(result)
  contact.resultWitness = witness(result)
  return toolkitResult(result)
}

export function resolveRazorvineContact(raw: unknown) {
  const input = ResolveRazorvineContactSchema.parse(raw), state = gs.getState()
  const contacts = razorvineStateOf(state)?.contacts, old = contacts?.[input.eventId]
  if (old) {
    if (witness(input) !== witness(old.input)) toolkitError('RAZORVINE_EVENT_CONFLICT', 'This event retains the original exact physical contact and reason.')
    if (old.result) return toolkitResult({ ...old.result, replayed: true })
    const pending = state.hero?.pending
    validateHeldRazorvineSave(pending?.command ?? {})
    if (!pending || witness(pending) !== old.heldWitness) toolkitError('RAZORVINE_SAVE_CHANGED', 'Retain the already offered original save.')
    return toolkitResult({ eventId: input.eventId, pendingReaction: pending, alreadyPending: true })
  }
  available()
  const { body, bodyWitness, hedgeWitness } = contactBody(input)
  const turnKey = razorvineTurnKey(state)
  const first = Object.values(contacts ?? {}).find(value => value.turnKey === turnKey && value.input.creatureId === body.id)
  if (first) return toolkitResult({ success: true, alreadyCheckedThisTurn: true, originalEventId: first.input.eventId,
    creatureId: body.id, turnKey, actionSpent: false, movementSpent: false, source: RAZORVINE_SOURCE })
  assertRazorvineDamage(state, body)
  if (Object.keys(contacts ?? {}).length >= 512) toolkitError('RAZORVINE_CONTACT_LIMIT', 'The retained actual source contact capacity is full.')
  const contact: RazorvineContact = { input, mapId: state.currentMapId!, cell: { ...body.position }, turnKey, at: now(), bodyWitness, hedgeWitness }
  const tools = toolkitState()
  ;(tools.razorvine ??= { version: 1, contacts: {} }).contacts[input.eventId] = contact
  const result = gs.withPhysicalCreatureResolution([body.id], () => savedResolution({ entityId: body.id, ability: 'dex', dc: 10, ignoreCoverForSave: true },
    { domain: RAZORVINE_SAVE, command: { eventId: input.eventId } }))
  if (!contact.result && gs.getState().hero?.pending) contact.heldWitness = witness(gs.getState().hero!.pending)
  return result
}

export function validateHeldRazorvineSave(command: Record<string, unknown>) {
  const resolution = command.toolkitResolution as { domain?: string; command?: { eventId?: string } } | undefined
  if (resolution?.domain !== RAZORVINE_SAVE) return
  const state = gs.getState(), contact = razorvineStateOf(state)?.contacts[String(resolution.command?.eventId)]
  if (!contact || contact.result || !state.hero?.pending || contact.heldWitness !== witness(state.hero.pending))
    toolkitError('RAZORVINE_SAVE_CHANGED', 'Keep the original exact razorvine save before any reaction dice.')
  const { body } = contactBody(contact.input, contact)
  assertRazorvineDamage(state, body)
}

export function inspectRazorvine(state: GameState, hedgeId?: string) {
  const hedges = Object.values(state.dmTools?.objects ?? {}).filter(hedge => hedge.razorvine
    && hedge.mapId === state.currentMapId && (!hedgeId || hedge.id === hedgeId))
  const contacts = Object.values(razorvineStateOf(state)?.contacts ?? {}).filter(contact =>
    contact.mapId === state.currentMapId && (!hedgeId || contact.input.hedgeId === hedgeId))
  return { source: RAZORVINE_SOURCE, dimensionsFeet: { width: 10, thickness: 5, height: 10 }, hedges, contacts }
}

export function registerRazorvineResolutions() {
  registerCheckedResolution(RAZORVINE_SAVE, (command, result) => finishRazorvineContact(command, result as SavingThrowResult))
}
