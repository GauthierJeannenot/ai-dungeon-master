import {
  GameState,
  MonsterState,
  NpcState,
  Condition,
  PlayerState,
  Item,
  WorldNpcDisposition,
} from '../lib/types'
import { inferAdventureRoomId, seedAdventureNpcs, getAdventureMap } from '../lib/adventure-map'
import { BASE_PLAYER } from '../lib/player-template'
import { ACTIVE_ADVENTURE_ID } from './adventure'

// Construit le joueur initial du module actif (gabarit + startCell + deltas).
function buildInitialPlayer(): PlayerState {
  const map = getAdventureMap(ACTIVE_ADVENTURE_ID)
  return {
    ...BASE_PLAYER,
    level: map.initialPlayer.level,
    hp: structuredClone(map.initialPlayer.hp),
    position: { ...map.startCell },
    inventory: structuredClone(map.initialPlayer.inventory),
  }
}

let state: GameState = createInitialState()

function createInitialState(): GameState {
  const player = buildInitialPlayer()
  const initialRoomId = inferAdventureRoomId(player.position, ACTIVE_ADVENTURE_ID)
  return {
    adventureId: ACTIVE_ADVENTURE_ID,
    phase: 'exploration',
    player,
    monsters: {},
    npcs: seedAdventureNpcs(ACTIVE_ADVENTURE_ID),
    initiativeOrder: [],
    currentTurn: null,
    round: 0,
    movementUsed: {},
    actionUsed: {},
    combatLog: [],
    roomsVisited: initialRoomId ? [initialRoomId] : [],
    currentRoomId: initialRoomId,
    encountersTriggered: [],
  }
}

function syncPlayerRoomFromPosition(): void {
  const roomId = inferAdventureRoomId(state.player.position, state.adventureId)
  state.currentRoomId = roomId
  if (roomId && !state.roomsVisited.includes(roomId)) {
    state.roomsVisited.push(roomId)
  }
}

function syncDyingPlayerState(): void {
  state.player.deathSaves ??= { successes: 0, failures: 0 }

  if (state.player.hp.current > 0) {
    state.player.deathSaves = { successes: 0, failures: 0 }
    state.player.conditions = state.player.conditions.filter(condition => condition !== 'unconscious')
    return
  }

  state.player.hp.current = 0
  if (!state.player.conditions.includes('unconscious') && !state.player.deathSaves.dead) {
    state.player.conditions.push('unconscious')
  }

  if (state.phase === 'combat') {
    if (!state.initiativeOrder.includes('player')) {
      state.initiativeOrder.push('player')
    }
    state.currentTurn ??= 'player'
  }
}

export function getState(): GameState {
  return state
}

export function resetState(): GameState {
  state = createInitialState()
  return state
}

export function replaceState(nextState: GameState): GameState {
  // L'aventure de l'état entrant fait foi si présente ; sinon celle du process
  // (états historiques sans le champ). Un process = une avention : on ne bascule
  // jamais d'aventure ici, on ne fait que compléter un état qui n'en portait pas.
  const adventureId = nextState.adventureId ?? ACTIVE_ADVENTURE_ID
  state = {
    ...structuredClone(nextState),
    adventureId,
    movementUsed: structuredClone(nextState.movementUsed ?? {}),
    actionUsed: structuredClone(nextState.actionUsed ?? {}),
    roomsVisited: structuredClone(nextState.roomsVisited ?? []),
    encountersTriggered: structuredClone(nextState.encountersTriggered ?? []),
    // PNJ : on préserve l'état client s'il existe (révélations déjà faites), sinon on
    // ré-amorce le seed du module (états historiques sans le champ npcs).
    npcs: nextState.npcs ? structuredClone(nextState.npcs) : seedAdventureNpcs(adventureId),
  }
  syncPlayerRoomFromPosition()
  syncDyingPlayerState()
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

export function getNpc(id: string): NpcState | undefined {
  return state.npcs?.[id]
}

// Rend visible(s) un ou plusieurs PNJ de la salle courante (par id ou par kind), et
// peut ajuster leur disposition. Scopé à la salle du joueur (roomId null = global)
// pour éviter de révéler un PNJ d'une autre salle. Retourne les PNJ effectivement
// touchés.
export function revealNpcs(params: {
  npcId?: string
  kind?: string
  disposition?: WorldNpcDisposition
}): NpcState[] {
  if (!state.npcs) return []
  const currentRoomId = state.currentRoomId
  const matched: NpcState[] = []

  for (const npc of Object.values(state.npcs)) {
    const inScope = npc.roomId === null || npc.roomId === currentRoomId
    if (!inScope) continue

    const idMatch = params.npcId ? npc.id === params.npcId : false
    const kindMatch = params.kind ? npc.kind === params.kind : false
    if (!idMatch && !kindMatch) continue

    npc.visible = true
    if (params.disposition) npc.disposition = params.disposition
    matched.push(npc)
  }

  return matched
}

export function updatePlayerHP(delta: number): PlayerState {
  const player = state.player
  player.deathSaves ??= { successes: 0, failures: 0 }

  if (player.deathSaves.dead && delta > 0) {
    return player
  }

  if (player.hp.current <= 0 && delta < 0 && !player.deathSaves.dead) {
    player.hp.current = 0
    player.deathSaves.stable = false
    player.deathSaves.failures = Math.min(3, player.deathSaves.failures + 1)
    if (player.deathSaves.failures >= 3) {
      player.deathSaves.dead = true
    }
    if (!player.conditions.includes('unconscious')) {
      player.conditions.push('unconscious')
    }
    return player
  }

  player.hp.current = Math.max(0, Math.min(player.hp.max, player.hp.current + delta))

  if (player.hp.current <= 0) {
    player.hp.current = 0
    if (!player.deathSaves.dead && !player.deathSaves.stable && !player.conditions.includes('unconscious')) {
      player.conditions.push('unconscious')
    }
  } else {
    player.deathSaves = { successes: 0, failures: 0 }
    player.conditions = player.conditions.filter(condition => condition !== 'unconscious')
  }

  return player
}

export function consumePlayerItem(predicate: (item: Item) => boolean): Item | null {
  const index = state.player.inventory.findIndex(predicate)
  if (index < 0) return null
  const [item] = state.player.inventory.splice(index, 1)
  return item ?? null
}

export function stabilizePlayer(): PlayerState {
  const player = state.player
  player.deathSaves = { successes: 0, failures: 0, stable: true }
  if (!player.conditions.includes('unconscious')) {
    player.conditions.push('unconscious')
  }
  player.hp.current = 0
  return player
}

export function rollPlayerDeathSave(roll: number): {
  roll: number
  success: boolean
  criticalSuccess: boolean
  criticalFailure: boolean
  successes: number
  failures: number
  stable: boolean
  dead: boolean
  hpAfter: number
} {
  const player = state.player
  player.deathSaves ??= { successes: 0, failures: 0 }

  if (player.hp.current > 0) {
    player.deathSaves = { successes: 0, failures: 0 }
  } else if (roll === 20) {
    player.hp.current = 1
    player.deathSaves = { successes: 0, failures: 0 }
    player.conditions = player.conditions.filter(condition => condition !== 'unconscious')
  } else if (roll === 1) {
    player.deathSaves.failures = Math.min(3, player.deathSaves.failures + 2)
  } else if (roll >= 10) {
    player.deathSaves.successes = Math.min(3, player.deathSaves.successes + 1)
  } else {
    player.deathSaves.failures = Math.min(3, player.deathSaves.failures + 1)
  }

  if (player.hp.current <= 0 && player.deathSaves.successes >= 3) {
    player.deathSaves = { successes: 0, failures: 0, stable: true }
  }
  if (player.hp.current <= 0 && player.deathSaves.failures >= 3) {
    player.deathSaves.dead = true
  }

  if (player.hp.current <= 0 && !player.conditions.includes('unconscious')) {
    player.conditions.push('unconscious')
  }

  return {
    roll,
    success: roll >= 10,
    criticalSuccess: roll === 20,
    criticalFailure: roll === 1,
    successes: player.deathSaves.successes,
    failures: player.deathSaves.failures,
    stable: Boolean(player.deathSaves.stable),
    dead: Boolean(player.deathSaves.dead),
    hpAfter: player.hp.current,
  }
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
    syncPlayerRoomFromPosition()
  } else {
    const monster = state.monsters[tokenId]
    if (!monster) throw new Error(`Token not found: ${tokenId}`)
    monster.position = { x, y }
  }
}

export function getMovementUsed(entityId: string): number {
  return state.movementUsed[entityId] ?? 0
}

export function addMovementUsed(entityId: string, cells: number): number {
  state.movementUsed[entityId] = getMovementUsed(entityId) + cells
  return state.movementUsed[entityId]
}

export function resetMovement(entityId: string): void {
  delete state.movementUsed[entityId]
}

export function hasActionUsed(entityId: string): boolean {
  return Boolean(state.actionUsed[entityId])
}

export function markActionUsed(entityId: string): void {
  state.actionUsed[entityId] = true
}

export function resetActionUsed(entityId: string): void {
  delete state.actionUsed[entityId]
}

export function resetTurnEconomy(entityId: string): void {
  resetMovement(entityId)
  resetActionUsed(entityId)
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
  state.movementUsed = {}
  state.actionUsed = {}
}

export function advanceTurn(): string | null {
  if (state.initiativeOrder.length === 0) return null
  const current = state.currentTurn
  const previousOrder = [...state.initiativeOrder]
  const previousIndex = previousOrder.indexOf(current ?? '')

  if (current) resetTurnEconomy(current)

  // Remove dead monsters from initiative. Keep a dying player in the order:
  // in D&D 5e, an unconscious player still has turns for death saves.
  state.initiativeOrder = state.initiativeOrder.filter(id => {
    if (id === 'player') return !state.player.deathSaves?.dead && !state.player.deathSaves?.stable
    return state.monsters[id]?.isAlive ?? false
  })

  if (state.initiativeOrder.length === 0) {
    state.currentTurn = null
    return null
  }

  const filteredCurrentIndex = current ? state.initiativeOrder.indexOf(current) : -1
  let nextId: string | undefined

  if (filteredCurrentIndex >= 0) {
    nextId = state.initiativeOrder[(filteredCurrentIndex + 1) % state.initiativeOrder.length]
  } else {
    const remainingAfterPrevious = previousOrder
      .slice(Math.max(0, previousIndex + 1))
      .find(id => state.initiativeOrder.includes(id))
    nextId = remainingAfterPrevious ?? state.initiativeOrder[0]
  }
  if (!nextId) {
    state.currentTurn = null
    return null
  }

  // Increment round when wrapping back to first combatant
  const nextPreviousIndex = previousOrder.indexOf(nextId)
  if (
    previousIndex >= 0 &&
    nextPreviousIndex >= 0 &&
    nextPreviousIndex <= previousIndex &&
    state.initiativeOrder.length > 1
  ) {
    state.round++
  }

  state.currentTurn = nextId
  resetTurnEconomy(state.currentTurn)
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

export function hasEncounterTriggered(encounterId: string): boolean {
  return Boolean(state.encountersTriggered?.includes(encounterId))
}

export function markEncounterTriggered(encounterId: string): void {
  state.encountersTriggered ??= []
  if (!state.encountersTriggered.includes(encounterId)) {
    state.encountersTriggered.push(encounterId)
  }
}
