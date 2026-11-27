import { activeNpcPartyRegistration } from './npc-party-state'
import { isStatBackedNpc } from './npc-stat-blocks'
import { sceneObjectFootprint } from './razorvine-state'
import { slipperyIceWalkingCost } from './slippery-ice-state'
import { chaseTerrainDifficult } from './chase-state'
import { dashMovementMultiplier,chaseWildernessSpeedMultiplier } from './chase-state'
import { actualNativeFlightLocation } from './native-flight-state'
import { actualLocomotionLocation } from './locomotion-state'
import { swallowedBy,swallowTurnIssue } from './swallow-state'
import { carefulGroundPace,groundGearStoppedThisTurn,groundGearWalkingPenalty } from './ground-gear-state'
import type { VerticalBarrierReference } from './vertical-barrier-state'
import type { GameState } from './types'
import { getAdventureMap, getMapSpec, getNavigationMode, firstMapId, inferRoomIdOnMap, type AdventureRoom, type GridCell } from './adventure-map'
import { cellKey, edgeKey, type BattlemapGeometry } from './battlemap-geometry'
import { pendingEncounterActors } from './encounter-awareness'
import { activeMapTerrain } from './combat-round-events'
import { sphereBlocksDoor } from './complex-trap-state'
import { playerKnowsDoor } from './door-discovery'
import { exhaustionSpeed } from './exhaustion'
import { armorAdjustedSpeed } from './armor-penalties'
import { actorMovementStepCost } from './movement-modes'
import { getMonsterRecord } from './srd/monsters'
import { carryingMovementIssue } from './carrying-state'

export type NavigationMovementMode = 'walk' | 'fly'

export type NavigationGoal =
  | { kind: 'cell'; cell: GridCell }
  | { kind: 'room'; roomId: string }
  | { kind: 'door'; doorId: string; mode: 'approach' | 'cross' }
  | { kind: 'entity'; entityId: string; relation: 'adjacent' }

export class NavigationError extends Error {
  constructor(public code: string, message: string, public detail: Record<string, unknown> = {}) { super(message) }
}
const fail = (code: string, message: string): never => { throw new NavigationError(code, message) }
const same = (a: GridCell, b: GridCell) => a.x === b.x && a.y === b.y
export const geometricDistanceCells = (a: GridCell, b: GridCell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

export const isDiagonalStep = (a: GridCell, b: GridCell) => a.x !== b.x && a.y !== b.y
export const navigationDiagonalsUsed = (state: GameState, actorId: string) =>
  state.phase === 'combat' ? state.diagonalMovementUsed?.[actorId] ?? 0 : 0
const routeKey = (cell: GridCell, diagonals: number) => `${cellKey(cell)}:${diagonals % 2}`

export function navigationPathCost(state: GameState, path: GridCell[], actorId = 'player', movementMode: NavigationMovementMode = 'walk'): number {
  const grid = navigationGrid(state, actorId, undefined, { movementMode })
  let diagonals = navigationDiagonalsUsed(state, actorId), cost = 0
  for (let i = 1; i < path.length; i++) {
    cost += grid.stepCost(path[i], path[i - 1], diagonals)
    if (isDiagonalStep(path[i - 1], path[i])) diagonals++
  }
  return cost
}

export function navigationActor(state: GameState, id: string, movementMode: NavigationMovementMode = 'walk',options:{allowLocomotion?:boolean}={}) {
  if(swallowedBy(state,id))fail('SWALLOW_EXPLICIT_EXIT_REQUIRED','A real contained body cannot walk onto an exterior cell; use its actual source corpse exit.')
  const swallowIssue=swallowTurnIssue(state);if(swallowIssue)fail(swallowIssue.code,swallowIssue.message)
  if(actualNativeFlightLocation(state,id)?.airborne)fail('NATIVE_FLIGHT_PATH_REQUIRED','This actual measured airborne source must use its explicitly chosen nativeXYZ route; an ordinary walk/fly projection cannot erase altitude or grant a landing.')
  if(!options.allowLocomotion&&actualLocomotionLocation(state,id))fail('LOCOMOTION_PATH_REQUIRED','This body is actually swimming or suspended on its recorded face. Choose its real climbing/swimming route to a support; ordinary XY movement cannot grant a floor.')
  if(groundGearStoppedThisTurn(state,id))fail('CALTROPS_MOVEMENT_STOPPED','The actual source contact stopped voluntary movement for this global turn; choosing another speed does not grant a fresh turn.')
  if (movementMode !== 'walk' && movementMode !== 'fly') fail('MOVEMENT_MODE_INVALID', 'Choose an exact supported movement mode.')
  const pending = pendingEncounterActors(state).find(actor => actor.id === id)
  if (pending) {
    if (movementMode !== 'walk') fail('HOVER_FLIGHT_ACTOR_UNSUPPORTED', 'Only an active native hover creature with no walking speed supports this horizontal flight mode.')
    return { position: pending.position, speed: pending.speed }
  }
  const partyNpc=state.npcs?.[id]
  const entity = id === 'player' ? state.player : state.monsters[id]??(activeNpcPartyRegistration(state,id)&&isStatBackedNpc(partyNpc)&&partyNpc.visible&&(partyNpc.mapId??firstMapId(state))===(state.currentMapId??firstMapId(state))?partyNpc:undefined)
  if (entity) {
    const carryingIssue = carryingMovementIssue(state, id)
    if (carryingIssue) throw new NavigationError(carryingIssue.code, carryingIssue.message, carryingIssue.detail)
    if (entity.conditions.includes('exhaustion') && !state.dmTools?.exhaustion?.creatures[id])
      fail('EXHAUSTION_LEVEL_REQUIRED', 'This legacy exhaustion condition has no level; supply an explicit authoritative level before movement.')
    if (entity.hp.current <= 0) fail('ENTITY_DEAD', 'Actor is dead or unconscious.')
    if (entity.conditions.some(c => ['grappled', 'restrained', 'incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(c)))
      fail('ACTOR_IMMOBILE', 'Actor cannot move in this condition.')
    let baseSpeed=entity.speed
    if (movementMode === 'fly') {
      const native = 'type' in entity ? getMonsterRecord(entity.type)?.engine.movementModes : undefined
      if (!native?.hover || native.walk !== 0 || !native.fly || native.fly <= 0)
        fail('HOVER_FLIGHT_ACTOR_UNSUPPORTED', 'Horizontal flight currently requires a native hover profile with zero walking speed; no player flight or altitude is inferred.')
      if (entity.conditions.includes('prone')) fail('HOVER_FLIGHT_POSTURE_UNSUPPORTED', 'Resolve this unsupported prone state before horizontal hover flight.')
      baseSpeed=native!.fly!
    }
    const heroEffects=state.hero?.effects.filter(e=>e.targetIds.includes(id)&&e.expiresAt>(state.worldTimeSeconds??0)) ?? []
    if (heroEffects.some(effect => effect.data.speedZero === true)) fail('ACTOR_IMMOBILE', 'A tracked trap currently reduces this actor speed to zero.')
    const speed=exhaustionSpeed(state,id,armorAdjustedSpeed(state,id,Math.max(0,baseSpeed-(heroEffects.some(e=>e.kind==='ray-of-frost')?10:0)-(movementMode==='walk'?groundGearWalkingPenalty(state,id):0))))*chaseWildernessSpeedMultiplier(state,id)*dashMovementMultiplier(state,id)
    return { position: entity.position, speed }
  }
  if (movementMode !== 'walk') fail('HOVER_FLIGHT_ACTOR_UNSUPPORTED', 'This actor has no modeled native horizontal hover profile.')
  const npc = state.npcs?.[id]
  if (npc?.hp && npc.hp.current <= 0) fail('ENTITY_DEAD', 'Actor is dead or unconscious.')
  const spec = getAdventureMap(state).npcs.find(n => n.id === id)
  if (!npc || !spec?.reactive || !spec.reactive.capabilities.includes('move')) fail('ACTOR_CANNOT_MOVE', 'Unknown actor or movement capability absent.')
  if ((npc!.mapId ?? firstMapId(state)) !== (state.currentMapId ?? firstMapId(state))) fail('ACTOR_OTHER_MAP', 'Actor is on another map.')
  return { position: npc!.position, speed: spec!.reactive!.speed }
}

export function savedDoorState(state: GameState, id: string): string | undefined {
  if(sphereBlocksDoor(state,id))return 'closed'
  const door = getAdventureMap(state).doors?.find(d => d.id === id)
  if (door?.opening) return 'open'
  const saved = state.sceneMemory?.doorStates as Record<string, string> | undefined
  return saved?.[id] ?? door?.initialState
}

// Occupied squares are impassable, including allies and hidden NPCs; dead monsters do not block.
// An NPC converted to a combatant is represented by the combatant only.
export function navigationGrid(state: GameState, actorId: string, geometry?: BattlemapGeometry, options: { jumpClearance?: readonly VerticalBarrierReference[]; ignoreActorEffects?: boolean; ignoreDoorKnowledge?:boolean; ignoreOccupantIds?: string[]; movementMode?: NavigationMovementMode } = {}) {
  const data = getAdventureMap(state)
  const spec = getMapSpec(state.currentMapId, state)
  const roomAt = (c: GridCell) => inferRoomIdOnMap(c, spec.id, state)
  const clearedCell=(cell:GridCell)=>options.jumpClearance?.some(reference=>reference.kind==='cell'&&same(reference.cell,cell))??false
  const blocked = new Set((geometry?.blockedCells ?? []).filter(cell=>!clearedCell(cell)).map(cellKey))
  for (const object of Object.values(state.dmTools?.objects ?? {})) if (object.mapId === spec.id && object.kind === 'obstacle' && object.state !== 'destroyed') {
    for (const cell of sceneObjectFootprint(object)){const cleared=options.jumpClearance?.some(reference=>reference.kind==='object'&&reference.objectId===object.id&&cell.x*5>=reference.footprint.minXFeet&&cell.x*5<=reference.footprint.maxXFeet&&cell.y*5>=reference.footprint.minYFeet&&cell.y*5<=reference.footprint.maxYFeet);if(!cleared)blocked.add(cellKey(cell))}
  }
  const terrain = activeMapTerrain(state)
  for (const feature of terrain) if (feature.kind === 'blocked') feature.cells.filter(cell=>!clearedCell(cell)).forEach(c => blocked.add(cellKey(c)))
  const difficult = new Set(terrain.filter(t => t.kind === 'difficult').flatMap(t => t.cells.map(cellKey)))
  const stepCost = (cell: GridCell, from?: GridCell, diagonals = 0) =>
    actorMovementStepCost(state, actorId,
      from && isDiagonalStep(from, cell) && diagonals % 2 === 1 ? 2 : 1,
      options.movementMode !== 'fly' && (difficult.has(cellKey(cell))||chaseTerrainDifficult(state,actorId,cell)||slipperyIceWalkingCost(state,actorId,cell)),
      options.movementMode === 'fly' ? { ...options, ignoreActorEffects: true } : options).totalCells*(options.movementMode!=='fly'&&!options.ignoreActorEffects&&carefulGroundPace(state,actorId)?2:1)
  const guardianOccupied = new Set<string>()
  for(const e of state.hero?.effects??[])if(e.kind==='guardian-of-faith'&&e.expiresAt>(state.worldTimeSeconds??0)&&e.data.mapId===spec.id){
    const cell=e.data.cell as GridCell;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)guardianOccupied.add(cellKey({x:cell.x+dx,y:cell.y+dy}))
  }
  const clearedEdge=(from:GridCell,to:GridCell)=>options.jumpClearance?.some(reference=>reference.kind==='edge'&&edgeKey(reference.from,reference.to)===edgeKey(from,to))??false
  const edges = new Map((geometry?.edges ?? []).filter(edge=>!clearedEdge(edge.from,edge.to)).map(e => [edgeKey(e.from, e.to), e]))
  for (const u of geometry?.uncertainties ?? []) {
    u.cells.forEach(c => blocked.add(cellKey(c)))
    u.edges.forEach(e => edges.set(edgeKey(e.from, e.to), { ...e, kind: 'wall' }))
  }
  const ignoredOccupants = new Set(options.ignoreOccupantIds ?? [])
  const occupied = new Set([
    ...pendingEncounterActors(state).filter(actor => actor.id !== actorId && !ignoredOccupants.has(actor.id)).map(actor => cellKey(actor.position)),
    ...guardianOccupied,
    ...[state.player, ...Object.values(state.monsters)].filter(e => !swallowedBy(state,e.id) && e.id !== actorId && !ignoredOccupants.has(e.id) &&
      ('isAlive' in e ? e.isAlive : !e.deathSaves?.dead)).map(e => cellKey(e.position)),
    ...Object.values(state.npcs ?? {}).filter(n => n.id !== actorId && !ignoredOccupants.has(n.id) && !state.monsters[n.id] && (n.hp?.current ?? 1) > 0 &&
      (n.mapId ?? firstMapId(state)) === spec.id).map(n => cellKey(n.position)),
  ])
  const valid = (c: GridCell) => Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < spec.grid.cols && c.y < spec.grid.rows
  const free = (c: GridCell, occupancy = true) => valid(c) && !blocked.has(cellKey(c)) && (!occupancy || !occupied.has(cellKey(c)))
  function cardinal(a: GridCell, b: GridCell, ignoreClosed: boolean, occupancy: boolean): boolean {
    if (!free(b, occupancy)) return false
    for(const e of state.hero?.effects??[])if(!options.ignoreActorEffects&&e.kind==='turned'&&e.targetIds.includes(actorId)&&e.expiresAt>(state.worldTimeSeconds??0)){
      const source=e.sourceId==='player'?state.player:state.monsters[e.sourceId]
      if(source&&geometricDistanceCells(b,source.position)<geometricDistanceCells(a,source.position))return false
    }
    const edge = edges.get(edgeKey(a, b))
    if (edge?.kind === 'wall') return false
    if(clearedEdge(a,b)&&!edge)return true // Exact measured jump clearance only; unknown geometry edges above still block.
    if (edge?.kind === 'door') return (options.ignoreDoorKnowledge||actorId!=='player'||playerKnowsDoor(state,edge.doorId!))&&!sphereBlocksDoor(state,edge.doorId!) && (ignoreClosed || savedDoorState(state, edge.doorId!) !== 'closed')
    // Reviewed geometry is authoritative, including open boundaries. Legacy
    // room boxes/partitions must not add invisible walls on top of that graph.
    if (geometry) return true
    // Authored thresholds gate the entire room boundary, including raw coordinates.
    // For imported geometry, every door edge must be explicitly reviewed.
    const ar = roomAt(a), br = roomAt(b)
    if (ar !== br) {
      const doors = (data.doors ?? []).filter(d => d.sides.some(s => s.roomId === ar) && d.sides.some(s => s.roomId === br))
      if (doors.length) return doors.some(d => {
        const s = d.sides.find(s => s.roomId === ar)!, t = d.sides.find(s => s.roomId === br)!
        return (options.ignoreDoorKnowledge||actorId!=='player'||playerKnowsDoor(state,d.id))&&same(a, s.cell) && same(b, t.cell) && !sphereBlocksDoor(state,d.id) && (ignoreClosed || savedDoorState(state, d.id) !== 'closed')
      })
      if (!geometry && data.rooms.some(r => r.enclosed && (r.id === ar || r.id === br))) return false
      if ((data.partitions ?? []).some(([x, y]) => (x === ar && y === br) || (x === br && y === ar))) return false
    }
    return true
  }
  function step(a: GridCell, b: GridCell, ignoreClosed = false, occupancy = true): boolean {
    if (!valid(a) || !free(b, occupancy) || geometricDistanceCells(a, b) !== 1) return false
    if (a.x === b.x || a.y === b.y) return cardinal(a, b, ignoreClosed, occupancy)
    // Both orthogonal routes must be clear: no corner cutting, even past occupied squares.
    const h = { x: b.x, y: a.y }, v = { x: a.x, y: b.y }
    return cardinal(a, h, ignoreClosed, occupancy) && cardinal(h, b, ignoreClosed, occupancy)
      && cardinal(a, v, ignoreClosed, occupancy) && cardinal(v, b, ignoreClosed, occupancy)
  }
  // Fixed neighbor order preserves stable paths when movement costs tie.
  const neighbors = (a: GridCell) => [[0,-1],[-1,0],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]
    .map(([x,y]) => ({ x: a.x+x, y: a.y+y }))
  return { valid, free, step, neighbors, roomAt, stepCost }
}

// Advisory UI preview only. The AI still emits move_token and the engine
// revalidates the chosen destination against the live session before moving.
export function explorationMovementRooms(state: GameState): AdventureRoom[] {
  if (state.phase !== 'exploration' || state.hero?.pending) return []
  try { if (navigationActor(state, 'player').speed <= 0) return [] }
  catch (err) { if (err instanceof NavigationError) return []; throw err }
  const data = getAdventureMap(state)
  const spec = getMapSpec(state.currentMapId, state)
  if (spec.geometry && (spec.geometry.review !== 'approved' || spec.geometry.mapId !== spec.id
    || spec.geometry.grid.cols !== spec.grid.cols || spec.geometry.grid.rows !== spec.grid.rows)) return []
  const current = data.rooms.find(room => room.id === state.currentRoomId
    && (room.mapId ?? firstMapId(state)) === spec.id)
  if (!current) return []
  const grid = navigationGrid(state, 'player', spec.geometry)
  if (getNavigationMode(state) === 'exploration' && !spec.explorationRoomIds) {
    return data.rooms.filter(room => room.id !== current.id
      && (room.mapId ?? firstMapId(state)) === spec.id
      && data.entryCells[room.id] && grid.valid(data.entryCells[room.id]))
  }
  const connected = new Set<string>()
  // Topology only: a closed door still connects two rooms. Clicking requests
  // the room, without authorizing opening a door or resolving an entry event.
  for (let y = current.zone.minY; y <= current.zone.maxY; y++) {
    for (let x = current.zone.minX; x <= current.zone.maxX; x++) {
      const cell = { x, y }
      if (grid.roomAt(cell) !== current.id || !grid.free(cell, false)) continue
      for (const next of grid.neighbors(cell)) {
        // Corner contact alone does not connect zones.
        if (cell.x !== next.x && cell.y !== next.y) continue
        const roomId = grid.roomAt(next)
        if (roomId && roomId !== current.id && grid.step(cell, next, true, false)) connected.add(roomId)
      }
    }
  }
  // Mixed maps offer remote outdoor destinations alongside local thresholds.
  if (getNavigationMode(state) === 'exploration') {
    for (const roomId of spec.explorationRoomIds ?? []) if (roomId !== current.id) connected.add(roomId)
  }
  return data.rooms.filter(room => connected.has(room.id)
    && (room.mapId ?? firstMapId(state)) === spec.id
    && data.entryCells[room.id] && grid.valid(data.entryCells[room.id]))
}

export function combatMovementCells(state: GameState): Array<{ cell: GridCell; costCells: number }> {
  if (state.phase !== 'combat' || state.currentTurn !== 'player' || !state.initiativeOrder.includes('player')) return []
  let actor
  try { actor = navigationActor(state, 'player') }
  catch (err) { if (err instanceof NavigationError) return []; throw err }
  const remaining = Math.max(0, Math.floor(actor.speed / 5) - (state.movementUsed.player ?? 0))
  if (remaining === 0) return []
  const map = getMapSpec(state.currentMapId, state)
  const geometry = map.geometry
  if (geometry && (geometry.review !== 'approved' || geometry.mapId !== map.id
    || geometry.grid.cols !== map.grid.cols || geometry.grid.rows !== map.grid.rows)) return []
  const grid = navigationGrid(state, 'player', geometry)
  if (!grid.valid(actor.position)) return []
  const decisionRooms = new Set(getAdventureMap(state).rooms
    .filter(room => room.navigationEvent && !state.roomsVisited.includes(room.id)).map(room => room.id))
  const fearSources = (state.monsterEffects ?? []).flatMap(effect => {
    const source = effect.sourceId === 'player' ? state.player : state.monsters[effect.sourceId]
    return source && effect.targetId === 'player' && effect.conditions.includes('frightened')
      && state.player.conditions.includes('frightened')
      ? [{ position: source.position, distance: geometricDistanceCells(actor.position, source.position) }] : []
  })
  const initial = navigationDiagonalsUsed(state, 'player')
  const queue = [{ cell: actor.position, costCells: 0, diagonals: initial, allowed: true }]
  const costs = new Map([[routeKey(actor.position, initial), 0]])
  const settledCells = new Set<string>()
  const reachable: Array<{ cell: GridCell; costCells: number }> = []
  while (queue.length) {
    queue.sort((a, b) => a.costCells - b.costCells)
    const current = queue.shift()!
    if (current.costCells !== costs.get(routeKey(current.cell, current.diagonals))) continue
    const cellId = cellKey(current.cell)
    if (!settledCells.has(cellId)) {
      settledCells.add(cellId)
      if (current.costCells > 0 && current.allowed) reachable.push({ cell: current.cell, costCells: current.costCells })
    }
    for (const cell of grid.neighbors(current.cell)) {
      const diagonals = current.diagonals + Number(isDiagonalStep(current.cell, cell))
      const key = routeKey(cell, diagonals)
      const costCells = current.costCells + grid.stepCost(cell, current.cell, current.diagonals)
      if (costCells > remaining || costCells >= (costs.get(key) ?? Infinity) || !grid.step(current.cell, cell)) continue
      costs.set(key, costCells)
      const roomId = grid.roomAt(cell)
      const allowed = current.allowed && !(roomId && decisionRooms.has(roomId))
        && !fearSources.some(source => geometricDistanceCells(cell, source.position) < source.distance)
      queue.push({ cell, costCells, diagonals, allowed })
    }
  }
  return reachable
}

export function findNavigationPath(state: GameState, actorId: string, goal: NavigationGoal, options: {
  geometry?: BattlemapGeometry; ignoreClosed?: boolean; ignoreOccupancy?: boolean; movementMode?: NavigationMovementMode
} = {}): GridCell[] {
  const actor = navigationActor(state, actorId, options.movementMode)
  const data = getAdventureMap(state)
  const mapId = state.currentMapId ?? firstMapId(state)
  const grid = navigationGrid(state, actorId, options.geometry, { movementMode: options.movementMode })
  let targets: GridCell[]
  if (goal.kind === 'cell') targets = [goal.cell]
  else if (goal.kind === 'room') {
    const room = data.rooms.find(r => r.id === goal.roomId && (r.mapId ?? firstMapId(state)) === mapId)
    if (!room) fail('ROOM_NOT_ON_MAP', 'Choose an exact room ID on the current map; map travel is explicit.')
    const entry = data.entryCells[goal.roomId]
    if (!entry) fail('ROOM_ENTRY_MISSING', 'Room has no authored arrival point.')
    targets = [entry]
  } else if (goal.kind === 'door') {
    const door = data.doors?.find(d => d.id === goal.doorId)
    const side = door?.sides.find(s => s.roomId === grid.roomAt(actor.position))
    if (!door || !side ||actorId==='player'&&!playerKnowsDoor(state,goal.doorId)) fail('DOOR_NOT_ACCESSIBLE', 'No such known door from the actor room.')
    const other = door!.sides.find(s => s !== side)!
    if (goal.mode === 'cross' && geometricDistanceCells(actor.position, side!.cell) > 1)
      fail('DOOR_OUT_OF_REACH', 'Approach before explicitly crossing.')
    if (goal.mode === 'cross' && savedDoorState(state, door!.id) === 'closed') fail('DOOR_CLOSED', 'Open or force before crossing.')
    targets = [goal.mode === 'approach' ? side!.cell : other.cell]
  } else {
    const entity = goal.entityId === 'player' ? state.player : state.monsters[goal.entityId] ?? state.npcs?.[goal.entityId]
    if (!entity || goal.entityId === actorId) fail('INVALID_TARGET', 'Choose a different exact entity ID.')
    if ('mapId' in entity! && (entity!.mapId ?? firstMapId(state)) !== mapId) fail('TARGET_OTHER_MAP', 'Target is on another map.')
    targets = grid.neighbors(entity!.position).filter(c => grid.valid(c) &&
      grid.step(c, entity!.position, options.ignoreClosed, false))
  }
  if (targets.some(c => !grid.valid(c))) {
    const { cols, rows } = getMapSpec(mapId, state).grid
    throw new NavigationError('INVALID_GRID_CELL', 'Destination outside current map.', { bounds: { minX: 0, maxX: cols-1, minY: 0, maxY: rows-1 } })
  }
  const targetKeys = new Set(targets.filter(c => same(c, actor.position) || grid.free(c, !options.ignoreOccupancy)).map(cellKey))
  if (!targetKeys.size) fail(targets.some(c => grid.free(c, false)) ? 'CELL_OCCUPIED' : 'DESTINATION_BLOCKED', 'The exact destination is blocked or occupied.')
  const diagonals = navigationDiagonalsUsed(state, actorId)
  const start = { cell: { ...actor.position }, cost: 0, diagonals, key: routeKey(actor.position, diagonals) }
  const queue = [start]
  const parents = new Map<string, typeof start | null>([[start.key, null]])
  const costs = new Map([[start.key, 0]])
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost)
    const current = queue.shift()!
    const { cell, cost, diagonals } = current
    if (cost !== costs.get(current.key)) continue
    if (targetKeys.has(cellKey(cell))) {
      const path = [cell]
      let parent = parents.get(current.key)
      while (parent) { path.push(parent.cell); parent = parents.get(parent.key) }
      return path.reverse()
    }
    for (const next of grid.neighbors(cell)) {
      const nextCost = cost + grid.stepCost(next, cell, diagonals)
      const nextDiagonals = diagonals + Number(isDiagonalStep(cell, next))
      const key = routeKey(next, nextDiagonals)
      if (nextCost < (costs.get(key) ?? Infinity) && grid.step(cell, next, options.ignoreClosed, !options.ignoreOccupancy)) {
        costs.set(key, nextCost)
        parents.set(key, current); queue.push({ cell: next, cost: nextCost, diagonals: nextDiagonals, key })
      }
    }
  }
  return fail('NO_PATH', 'No legal path to the selected goal.')
}
