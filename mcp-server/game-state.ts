import { GameState, MonsterState, Condition, PlayerState } from '../lib/types'

// Initial player template — overridable via context files
const DEFAULT_PLAYER: PlayerState = {
  id: 'player',
  name: 'Héros',
  class: 'Guerrier',
  level: 1,
  hp: { current: 20, max: 20 },
  ac: 16,
  stats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 },
  proficiencyBonus: 2,
  position: { x: 10, y: 13 },
  conditions: [],
  speed: 30,
  inventory: [
    { id: 'longsword', name: 'Épée longue', type: 'weapon', damage: '1d8+3', description: 'Épée longue +3 STR' },
    { id: 'shield', name: 'Bouclier', type: 'armor', acBonus: 2, description: 'Bouclier standard' },
    { id: 'potion1', name: 'Potion de soin', type: 'potion', description: 'Restaure 2d4+2 HP' },
  ],
}

let state: GameState = createInitialState()

function createInitialState(): GameState {
  return {
    phase: 'exploration',
    player: { ...DEFAULT_PLAYER },
    monsters: {},
    initiativeOrder: [],
    currentTurn: null,
    round: 0,
    combatLog: [],
    roomsVisited: [],
    currentRoomId: null,
  }
}

export function getState(): GameState {
  return state
}

export function resetState(): GameState {
  state = createInitialState()
  return state
}

export function getPlayer(): PlayerState {
  return state.player
}

export function getMonster(id: string): MonsterState | undefined {
  return state.monsters[id]
}

export function getAllEntities(): Array<PlayerState | MonsterState> {
  return [state.player, ...Object.values(state.monsters)]
}

export function getEntity(id: string): PlayerState | MonsterState | undefined {
  if (id === 'player') return state.player
  return state.monsters[id]
}

export function updatePlayerHP(delta: number): PlayerState {
  const player = state.player
  player.hp.current = Math.max(0, Math.min(player.hp.max, player.hp.current + delta))
  return player
}

export function updateMonsterHP(id: string, delta: number): MonsterState {
  const monster = state.monsters[id]
  if (!monster) throw new Error(`Monster not found: ${id}`)
  monster.hp.current = Math.max(0, Math.min(monster.hp.max, monster.hp.current + delta))
  monster.isAlive = monster.hp.current > 0
  return monster
}

export function moveToken(tokenId: string, x: number, y: number): void {
  if (tokenId === 'player') {
    state.player.position = { x, y }
  } else {
    const monster = state.monsters[tokenId]
    if (!monster) throw new Error(`Token not found: ${tokenId}`)
    monster.position = { x, y }
  }
}

export function spawnMonster(monster: MonsterState): void {
  state.monsters[monster.id] = monster
}

export function removeMonster(id: string): void {
  delete state.monsters[id]
}

export function applyCondition(entityId: string, condition: Condition): void {
  const entity = getEntity(entityId)
  if (!entity) throw new Error(`Entity not found: ${entityId}`)
  if (!entity.conditions.includes(condition)) {
    entity.conditions.push(condition)
  }
}

export function removeCondition(entityId: string, condition: Condition): void {
  const entity = getEntity(entityId)
  if (!entity) throw new Error(`Entity not found: ${entityId}`)
  entity.conditions = entity.conditions.filter(c => c !== condition)
}

export function setPhase(phase: GameState['phase']): void {
  state.phase = phase
}

export function setInitiativeOrder(order: string[]): void {
  state.initiativeOrder = order
  state.currentTurn = order[0] ?? null
  state.round = 1
}

export function advanceTurn(): string | null {
  if (state.initiativeOrder.length === 0) return null
  const current = state.currentTurn
  const idx = state.initiativeOrder.indexOf(current ?? '')
  const nextIdx = (idx + 1) % state.initiativeOrder.length

  // Remove dead monsters from initiative
  state.initiativeOrder = state.initiativeOrder.filter(id => {
    if (id === 'player') return state.player.hp.current > 0
    return state.monsters[id]?.isAlive ?? false
  })

  if (state.initiativeOrder.length === 0) {
    state.currentTurn = null
    return null
  }

  const safeNext = Math.min(nextIdx, state.initiativeOrder.length - 1)

  // Increment round when wrapping back to first combatant
  if (safeNext <= idx && state.initiativeOrder.length > 1) {
    state.round++
  }

  state.currentTurn = state.initiativeOrder[safeNext]
  return state.currentTurn
}

export function addLogEntry(entry: Omit<GameState['combatLog'][0], 'id' | 'timestamp'>): void {
  state.combatLog.push({
    ...entry,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  })

  // Keep log bounded
  if (state.combatLog.length > 200) {
    state.combatLog = state.combatLog.slice(-200)
  }
}

export function visitRoom(roomId: string): void {
  if (!state.roomsVisited.includes(roomId)) {
    state.roomsVisited.push(roomId)
  }
  state.currentRoomId = roomId
}
