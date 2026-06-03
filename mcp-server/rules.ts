import { PlayerState, MonsterState } from '../lib/types'
import * as gs from './game-state'

type Entity = PlayerState | MonsterState

const DEFAULT_MELEE_RANGE_CELLS = 1
const MAP_BOUNDS = {
  minX: 0,
  maxX: 16,
  minY: 0,
  maxY: 14,
} as const

const ATTACK_RANGE_CELLS: Record<string, number> = {
  longsword: 1,
  shortsword: 1,
  dagger: 4,
  greataxe: 1,
  greatsword: 1,
  handaxe: 4,
  rapier: 1,
  mace: 1,
  quarterstaff: 1,
  unarmed: 1,
}

export class RuleViolation extends Error {
  constructor(
    public code: string,
    message: string,
    public detail?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'RuleViolation'
  }
}

export function ruleErrorResult(err: unknown) {
  const violation = err instanceof RuleViolation
    ? err
    : new RuleViolation('RULE_ERROR', err instanceof Error ? err.message : 'Illegal game action')

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        error: violation.message,
        code: violation.code,
        detail: violation.detail,
      }),
    }],
    isError: true,
  }
}

export function distanceCells(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

export function isAlive(entity: Entity): boolean {
  if ('isAlive' in entity) return entity.isAlive
  return entity.hp.current > 0
}

function speedCells(entity: Entity): number {
  return Math.floor(entity.speed / 5)
}

function assertEntity(entityId: string): Entity {
  const entity = gs.getEntity(entityId)
  if (!entity) {
    throw new RuleViolation('ENTITY_NOT_FOUND', `Entity not found: ${entityId}`, { entityId })
  }
  return entity
}

function assertAlive(entityId: string, entity: Entity): void {
  if (!isAlive(entity)) {
    throw new RuleViolation('ENTITY_DEAD', `${entity.name} cannot act because they are dead or unconscious.`, { entityId })
  }
}

function assertCurrentTurn(entityId: string): void {
  const state = gs.getState()
  if (state.phase !== 'combat') {
    throw new RuleViolation('NOT_IN_COMBAT', 'This action requires an active combat.', { phase: state.phase })
  }
  if (state.currentTurn !== entityId) {
    throw new RuleViolation('NOT_CURRENT_TURN', `It is ${state.currentTurn ?? 'no one'}'s turn, not ${entityId}'s.`, {
      currentTurn: state.currentTurn,
      requestedEntity: entityId,
    })
  }
}

function assertInInitiative(entityId: string): void {
  const state = gs.getState()
  if (!state.initiativeOrder.includes(entityId)) {
    throw new RuleViolation('NOT_IN_INITIATIVE', `${entityId} is not in the initiative order.`, {
      entityId,
      initiativeOrder: state.initiativeOrder,
    })
  }
}

function assertValidMapCell(cell: { x: number; y: number }, fieldName: string): void {
  const validCoordinates = Number.isFinite(cell.x) &&
    Number.isFinite(cell.y) &&
    Number.isInteger(cell.x) &&
    Number.isInteger(cell.y)

  const inBounds = validCoordinates &&
    cell.x >= MAP_BOUNDS.minX &&
    cell.x <= MAP_BOUNDS.maxX &&
    cell.y >= MAP_BOUNDS.minY &&
    cell.y <= MAP_BOUNDS.maxY

  if (!inBounds) {
    throw new RuleViolation('INVALID_GRID_CELL', `Cell (${cell.x}, ${cell.y}) is outside the battlemap bounds.`, {
      field: fieldName,
      cell,
      bounds: MAP_BOUNDS,
    })
  }
}

function assertActionAvailable(entityId: string): void {
  if (gs.hasActionUsed(entityId)) {
    throw new RuleViolation('ACTION_ALREADY_USED', `${entityId} has already used their action this turn.`, {
      entityId,
      currentTurn: gs.getState().currentTurn,
    })
  }
}

function occupiedByLivingEntity(cell: { x: number; y: number }, exceptId?: string): Entity | undefined {
  return gs.getAllEntities().find(entity =>
    entity.id !== exceptId &&
    isAlive(entity) &&
    entity.position.x === cell.x &&
    entity.position.y === cell.y
  )
}

function attackRangeCells(weaponOrSpell: string, rangeCells?: number): number {
  if (rangeCells !== undefined) return rangeCells
  const key = weaponOrSpell.toLowerCase().replace(/\s+/g, '')
  return ATTACK_RANGE_CELLS[key] ?? DEFAULT_MELEE_RANGE_CELLS
}

export function validateMove(tokenId: string, toCell: { x: number; y: number }): { distance: number; remaining: number | null } {
  const entity = assertEntity(tokenId)
  assertAlive(tokenId, entity)
  assertValidMapCell(toCell, 'toCell')

  const blocker = occupiedByLivingEntity(toCell, tokenId)
  if (blocker) {
    throw new RuleViolation('CELL_OCCUPIED', `Cell (${toCell.x}, ${toCell.y}) is occupied by ${blocker.name}.`, {
      blockerId: blocker.id,
      toCell,
    })
  }

  const distance = distanceCells(entity.position, toCell)
  const state = gs.getState()
  if (state.phase !== 'combat') {
    return { distance, remaining: null }
  }

  assertCurrentTurn(tokenId)
  assertInInitiative(tokenId)

  const used = gs.getMovementUsed(tokenId)
  const max = speedCells(entity)
  if (used + distance > max) {
    throw new RuleViolation('MOVEMENT_EXCEEDED', `${entity.name} cannot move ${distance} cells; only ${Math.max(0, max - used)} remain this turn.`, {
      tokenId,
      distance,
      used,
      max,
      remaining: Math.max(0, max - used),
    })
  }

  return { distance, remaining: max - used - distance }
}

export function recordMove(tokenId: string, distance: number): void {
  if (gs.getState().phase === 'combat' && distance > 0) {
    gs.addMovementUsed(tokenId, distance)
  }
}

export function validateAttack(
  attackerId: string,
  targetId: string,
  weaponOrSpell: string,
  rangeCells?: number
): void {
  if (attackerId === targetId) {
    throw new RuleViolation('SELF_TARGET', 'An entity cannot attack itself.', { attackerId, targetId })
  }

  assertCurrentTurn(attackerId)
  assertInInitiative(attackerId)
  assertInInitiative(targetId)
  assertActionAvailable(attackerId)

  const attacker = assertEntity(attackerId)
  const target = assertEntity(targetId)
  assertAlive(attackerId, attacker)
  assertAlive(targetId, target)

  const distance = distanceCells(attacker.position, target.position)
  const maxRange = attackRangeCells(weaponOrSpell, rangeCells)
  if (distance > maxRange) {
    throw new RuleViolation('TARGET_OUT_OF_RANGE', `${target.name} is ${distance} cells away; ${weaponOrSpell} range is ${maxRange} cells.`, {
      attackerId,
      targetId,
      weaponOrSpell,
      distance,
      maxRange,
    })
  }
}

export function recordAction(entityId: string): void {
  gs.markActionUsed(entityId)
}

export function validateSavingThrow(entityId: string): void {
  const entity = assertEntity(entityId)
  assertAlive(entityId, entity)
  if (gs.getState().phase === 'combat') {
    assertInInitiative(entityId)
  }
}

export function validateConditionTarget(entityId: string): void {
  const entity = assertEntity(entityId)
  assertAlive(entityId, entity)
}

export function validateHPUpdate(entityId: string, delta: number): void {
  const entity = assertEntity(entityId)
  if (delta < 0) assertAlive(entityId, entity)
}

export function validateEnterCombat(combatants: string[]): void {
  const state = gs.getState()
  if (state.phase === 'combat') {
    throw new RuleViolation('COMBAT_ALREADY_ACTIVE', 'Combat is already active.', {
      currentTurn: state.currentTurn,
      initiativeOrder: state.initiativeOrder,
    })
  }

  const unique = new Set(combatants)
  if (unique.size !== combatants.length) {
    throw new RuleViolation('DUPLICATE_COMBATANT', 'Combatants must not contain duplicates.', { combatants })
  }
  if (!unique.has('player')) {
    throw new RuleViolation('PLAYER_REQUIRED', 'Combat must include the player.', { combatants })
  }

  const livingCombatants = combatants.map(id => {
    const entity = assertEntity(id)
    assertAlive(id, entity)
    return entity
  })

  if (livingCombatants.length < 2) {
    throw new RuleViolation('NOT_ENOUGH_COMBATANTS', 'Combat requires at least two living combatants.', { combatants })
  }
}

export function validateNextTurn(actorId?: string, skipAction = false): string {
  const state = gs.getState()
  if (state.phase !== 'combat') {
    throw new RuleViolation('NOT_IN_COMBAT', 'Cannot advance turns because combat is not active.', { phase: state.phase })
  }
  if (!state.currentTurn || state.initiativeOrder.length === 0) {
    throw new RuleViolation('EMPTY_INITIATIVE', 'Cannot advance turns without an initiative order.')
  }
  const endingActorId = actorId ?? state.currentTurn
  if (endingActorId !== state.currentTurn) {
    throw new RuleViolation('NOT_CURRENT_TURN', `It is ${state.currentTurn}'s turn, not ${endingActorId}'s.`, {
      currentTurn: state.currentTurn,
      requestedEntity: endingActorId,
    })
  }
  assertInInitiative(endingActorId)
  if (!skipAction && !gs.hasActionUsed(endingActorId)) {
    throw new RuleViolation('TURN_ACTION_REQUIRED', `${endingActorId} cannot end their turn before using an action.`, {
      currentTurn: state.currentTurn,
      requestedEntity: endingActorId,
      actionUsed: gs.hasActionUsed(endingActorId),
    })
  }
  return endingActorId
}

export function validateEndCombat(force?: boolean): void {
  const state = gs.getState()
  if (state.phase !== 'combat') {
    throw new RuleViolation('NOT_IN_COMBAT', 'Cannot end combat because combat is not active.', { phase: state.phase })
  }

  const livingEnemies = state.initiativeOrder
    .filter(id => id !== 'player')
    .map(id => gs.getEntity(id))
    .filter((entity): entity is Entity => !!entity && isAlive(entity))

  if (!force && livingEnemies.length > 0) {
    throw new RuleViolation('COMBATANTS_STILL_ACTIVE', 'Cannot end combat while non-player combatants are still active unless force is true.', {
      livingCombatants: livingEnemies.map(entity => entity.id),
    })
  }
}

export function validateSpawn(cell: { x: number; y: number }): void {
  const state = gs.getState()
  if (state.phase === 'combat') {
    throw new RuleViolation('SPAWN_DURING_COMBAT', 'Cannot spawn a monster during active combat. Spawn before enter_combat.', {
      currentTurn: state.currentTurn,
    })
  }

  const blocker = occupiedByLivingEntity(cell)
  if (blocker) {
    throw new RuleViolation('CELL_OCCUPIED', `Cell (${cell.x}, ${cell.y}) is occupied by ${blocker.name}.`, {
      blockerId: blocker.id,
      cell,
    })
  }
}
