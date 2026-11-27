import { dashMovementMultiplier } from '../lib/chase-state'
import type { GameState } from '../lib/types'
import type { GridCell } from '../lib/adventure-map'
import type { BattlemapGeometry } from '../lib/battlemap-geometry'
import { navigationActor, navigationGrid, navigationDiagonalsUsed, isDiagonalStep, geometricDistanceCells } from '../lib/navigation'
import { getMonsterRecord } from '../lib/srd/monsters'
import { RuleViolation } from './rules'

export interface GrappleTransportInput { targetId: string; targetToCell: GridCell; loadId?: string }
const same = (a: GridCell, b: GridCell) => a.x === b.x && a.y === b.y
const sizes = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']
const entity = (state: GameState, id: string) => id === 'player' ? state.player : state.monsters[id]
const fail = (code: string, message: string): never => { throw new RuleViolation(code, message, {}) }

export function heldGrappleTargets(state: GameState, actorId: string): string[] {
  const time = state.worldTimeSeconds ?? 0
  return [...new Set([
    ...(state.hero?.effects ?? []).filter(e => e.kind === 'grapple' && e.sourceId === actorId && e.expiresAt > time).flatMap(e => e.targetIds),
    ...(state.monsterEffects ?? []).filter(e => e.kind === 'grapple' && e.sourceId === actorId && (e.expiresAt===undefined||e.expiresAt>time)).map(e => e.targetId),
  ])]
}

export function inspectGrappleTransport(state: GameState, actorId: string, targetId: string) {
  const actor = entity(state, actorId), target = entity(state, targetId)
  if (!actor || !target || actorId === targetId) fail('GRAPPLE_TRANSPORT_TARGET_REQUIRED', 'Choose the exact existing grappler and a different held creature.')
  const held = heldGrappleTargets(state, actorId)
  if (!held.includes(targetId) || !target!.conditions.includes('grappled')) fail('GRAPPLE_EFFECT_REQUIRED', 'Transport requires an actual active grapple from this actor to the chosen target.')
  if (held.length !== 1 || heldGrappleTargets(state, targetId).length) fail('MULTIPLE_GRAPPLES_TRANSPORT_UNSUPPORTED', 'Resolve other holds explicitly before moving this pair; no third creature is moved implicitly.')
  if (targetId === 'player' ? state.player.deathSaves?.dead : !state.monsters[targetId].isAlive) fail('GRAPPLE_TARGET_DEAD', 'A corpse is not a grappled creature for this movement tool.')
  if (geometricDistanceCells(actor!.position, target!.position) !== 1) fail('GRAPPLE_TRANSPORT_REACH', 'This paired grid transport requires an adjacent held creature.')
  if (state.hero?.effects.some(e => e.targetIds.includes(targetId) && e.expiresAt > (state.worldTimeSeconds ?? 0) && e.data.speedZero === true))
    fail('GRAPPLE_TARGET_ANCHORED', 'Resolve the separate anchored trap before transporting its victim.')
  const size = (id: string): string | undefined => {
    if (id === 'player') return 'Medium'
    const value = getMonsterRecord(state.monsters[id].type)?.source.size
    return typeof value === 'string' ? value : undefined
  }
  const actorSize = sizes.indexOf(size(actorId) ?? ''), targetSize = sizes.indexOf(size(targetId) ?? '')
  if (actorSize < 0 || targetSize < 0) fail('GRAPPLE_SIZE_UNKNOWN', 'Sourced sizes are required; no size is inferred from narrative text.')
  const divisor = actorSize - targetSize >= 2 ? 1 : 2
  const speed = navigationActor(state, actorId).speed
  const dash = dashMovementMultiplier(state,actorId)
  return { actorId, targetId, speed: Math.floor(speed / dash / divisor) * dash, speedDivisor: divisor,
    actorSize: sizes[actorSize], targetSize: sizes[targetSize] }
}

/** Joint Dijkstra: both final cells are chosen by the AI. Intermediate cells
 * are mechanical pathfinding, including a target following around corners.
 * Both bodies use the engine's current one-cell token footprints. */
export function planGrappleTransportPath(state: GameState, actorId: string, toCell: GridCell,
  transport: GrappleTransportInput, geometry?: BattlemapGeometry) {
  const info = inspectGrappleTransport(state, actorId, transport.targetId)
  const actor = entity(state, actorId)!, target = entity(state, transport.targetId)!
  const ignored = [actorId, target.id]
  const actorGrid = navigationGrid(state, actorId, geometry, { ignoreOccupantIds: ignored })
  const targetGrid = navigationGrid(state, target.id, geometry, { ignoreOccupantIds: ignored, ignoreActorEffects: true })
  if (!actorGrid.valid(toCell) || !targetGrid.valid(transport.targetToCell)) fail('INVALID_GRID_CELL', 'Both chosen destinations must be on the active map.')
  if (same(toCell, transport.targetToCell) || geometricDistanceCells(toCell, transport.targetToCell) !== 1)
    fail('GRAPPLE_TRANSPORT_DESTINATION', 'Choose distinct adjacent final cells for the grappler and held creature.')
  if (!actorGrid.free(toCell) || !targetGrid.free(transport.targetToCell)) fail('GRAPPLE_TRANSPORT_BLOCKED', 'A chosen destination is blocked or occupied.')
  const key = (a: GridCell, b: GridCell, d: number) => `${a.x},${a.y}:${b.x},${b.y}:${d % 2}`
  const diagonals = navigationDiagonalsUsed(state, actorId)
  const start = { cell: { ...actor.position }, targetCell: { ...target.position }, cost: 0, diagonals,
    key: key(actor.position, target.position, diagonals) }
  const queue = [start], parents = new Map<string, typeof start | null>([[start.key, null]]), costs = new Map([[start.key, 0]])
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost)
    const current = queue.shift()!
    if (current.cost !== costs.get(current.key)) continue
    if (same(current.cell, toCell) && same(current.targetCell, transport.targetToCell)) {
      const path = [current.cell], targetPath = [current.targetCell]
      let previous = parents.get(current.key)
      while (previous) { path.push(previous.cell); targetPath.push(previous.targetCell); previous = parents.get(previous.key) }
      return { ...info, path: path.reverse(), targetPath: targetPath.reverse() }
    }
    for (const next of actorGrid.neighbors(current.cell)) {
      if (!actorGrid.step(current.cell, next)) continue
      const d = current.diagonals + Number(isDiagonalStep(current.cell, next))
      const cost = current.cost + actorGrid.stepCost(next, current.cell, current.diagonals)
      // Prefer following the vacated square, then preserving the offset. Ties
      // remain deterministic; no final position or extra creature is invented.
      const offset = { x: current.targetCell.x + next.x - current.cell.x, y: current.targetCell.y + next.y - current.cell.y }
      const candidates = [current.cell, offset, current.targetCell, ...targetGrid.neighbors(current.targetCell)]
      const seen = new Set<string>()
      for (const nextTarget of candidates) {
        const candidate = `${nextTarget.x},${nextTarget.y}`
        if (seen.has(candidate)) continue
        seen.add(candidate)
        if (same(next, nextTarget) || geometricDistanceCells(next, nextTarget) !== 1
          || same(next, current.targetCell) && same(nextTarget, current.cell)
          || !(same(nextTarget, current.targetCell) ? targetGrid.free(nextTarget) : targetGrid.step(current.targetCell, nextTarget))) continue
        const k = key(next, nextTarget, d)
        if (cost >= (costs.get(k) ?? Infinity)) continue
        const entry = { cell: next, targetCell: nextTarget, cost, diagonals: d, key: k }
        costs.set(k, cost); parents.set(k, current); queue.push(entry)
      }
    }
  }
  return fail('GRAPPLE_TRANSPORT_NO_PATH', 'No joint legal path reaches both chosen cells; neither creature moved.')
}
