import {
  GameState,
  MonsterState,
  Condition,
  PlayerState,
  Item,
  EngineEvent,
  WorldAlarmState,
  WorldNpcDisposition,
  WorldNpcState,
  WorldObjectState,
  WorldQuestState,
  WorldState,
} from '../lib/types'
import { inferAdventureRoomId } from '../lib/adventure-map'

// Initial player template — overridable via context files
const DEFAULT_PLAYER: PlayerState = {
  id: 'player',
  name: 'Héros',
  class: 'Guerrier',
  level: 1,
  hp: { current: 20, max: 20 },
  deathSaves: { successes: 0, failures: 0 },
  ac: 16,
  stats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 },
  proficiencyBonus: 2,
  position: { x: 4, y: 13 },
  conditions: [],
  speed: 30,
  inventory: [
    { id: 'longsword', name: 'Épée longue', type: 'weapon', damage: '1d8+3', description: 'Épée longue +3 STR' },
    { id: 'shield', name: 'Bouclier', type: 'armor', acBonus: 2, description: 'Bouclier standard' },
    { id: 'potion1', name: 'Potion de soin', type: 'potion', description: 'Restaure 2d4+2 HP' },
  ],
}

const WORLD_EVENT_LOG_LIMIT = 200

let state: GameState = createInitialState()

function createInitialWorldState(): WorldState {
  return {
    objects: {
      front_double_door: {
        id: 'front_double_door',
        roomId: '4',
        name: 'double porte de la boulangerie',
        kind: 'door',
        visible: true,
        discovered: true,
        opened: false,
        locked: false,
        tags: ['door', 'street'],
        description: 'La double porte qui separe la boutique de la rue.',
      },
      reserve_door: {
        id: 'reserve_door',
        roomId: '4',
        name: 'porte de la reserve',
        kind: 'door',
        visible: true,
        discovered: true,
        opened: false,
        locked: false,
        tags: ['door', 'bakery'],
        description: 'Une porte interieure qui mene vers la reserve enfarinee.',
      },
      office_drawer: {
        id: 'office_drawer',
        roomId: '5',
        name: 'tiroir du bureau',
        kind: 'container',
        visible: false,
        discovered: false,
        opened: false,
        locked: true,
        contains: ['recipe_half_office'],
        tags: ['drawer', 'recipe_cache'],
        dc: { search: 12, unlock: 12, force: 13 },
        description: 'Un tiroir bas, coince sous des factures graisseuses.',
      },
      recipe_half_office: {
        id: 'recipe_half_office',
        roomId: '5',
        name: 'moitie de recette du bureau',
        kind: 'clue',
        visible: false,
        discovered: false,
        taken: false,
        tags: ['recipe_half', 'quest_item'],
        description: 'Un fragment de recette au coin brule.',
      },
      grammy_armoire: {
        id: 'grammy_armoire',
        roomId: '9',
        name: 'armoire de Grammy',
        kind: 'container',
        visible: true,
        discovered: true,
        opened: false,
        locked: false,
        contains: ['recipe_half_apartment'],
        tags: ['armoire', 'recipe_cache'],
        dc: { search: 10 },
        description: 'Une armoire haute dont la porte ferme mal.',
      },
      recipe_half_apartment: {
        id: 'recipe_half_apartment',
        roomId: '9',
        name: 'moitie de recette de Grammy',
        kind: 'clue',
        visible: false,
        discovered: false,
        taken: false,
        tags: ['recipe_half', 'quest_item'],
        description: 'Un second fragment de recette glisse sous une pile de linges.',
      },
      enchanted_oven: {
        id: 'enchanted_oven',
        roomId: '8',
        name: 'four enchante',
        kind: 'fixture',
        visible: true,
        discovered: true,
        used: false,
        tags: ['oven', 'dangerous', 'noise'],
        dc: { open: 12 },
        description: 'Un four trop chaud, grave de runes de cuisine.',
      },
      violet_fungus_heap: {
        id: 'violet_fungus_heap',
        roomId: '3',
        name: 'amas de champignons violets',
        kind: 'trap',
        visible: true,
        discovered: true,
        used: false,
        tags: ['trap', 'poison'],
        dc: { search: 13 },
        description: 'Des champignons mous qui fremissent quand on approche.',
      },
    },
    npcs: {
      mac: {
        id: 'mac',
        name: 'Mac',
        roomId: '1',
        disposition: 'neutral',
        known: true,
        tags: ['bakery', 'quest_giver'],
      },
      dryad_orchard: {
        id: 'dryad_orchard',
        name: 'druidesse du verger',
        roomId: '2',
        disposition: 'neutral',
        known: false,
        tags: ['orchard', 'spirit'],
      },
      grukk: {
        id: 'grukk',
        name: 'Grukk',
        roomId: '9',
        disposition: 'hostile',
        known: false,
        tags: ['goblin', 'boss'],
      },
    },
    quests: {
      grammy_recipe: {
        id: 'grammy_recipe',
        name: 'Retrouver la recette de Grammy',
        progress: 0,
        goal: 2,
        completed: false,
        flags: {},
      },
    },
    alarms: {
      bakery_alert: {
        level: 0,
        raised: false,
      },
    },
    flags: {},
    eventLog: [],
  }
}

function mergeObjectState(defaultObject: WorldObjectState | undefined, incomingObject: WorldObjectState): WorldObjectState {
  return {
    ...defaultObject,
    ...incomingObject,
    dc: { ...(defaultObject?.dc ?? {}), ...(incomingObject.dc ?? {}) },
    tags: incomingObject.tags ?? defaultObject?.tags,
    contains: incomingObject.contains ?? defaultObject?.contains,
  }
}

function mergeNpcState(defaultNpc: WorldNpcState | undefined, incomingNpc: WorldNpcState): WorldNpcState {
  return {
    ...defaultNpc,
    ...incomingNpc,
    tags: incomingNpc.tags ?? defaultNpc?.tags,
  }
}

function mergeQuestState(defaultQuest: WorldQuestState | undefined, incomingQuest: WorldQuestState): WorldQuestState {
  return {
    ...defaultQuest,
    ...incomingQuest,
    flags: { ...(defaultQuest?.flags ?? {}), ...(incomingQuest.flags ?? {}) },
  }
}

function mergeAlarmState(defaultAlarm: WorldAlarmState | undefined, incomingAlarm: WorldAlarmState): WorldAlarmState {
  return {
    ...defaultAlarm,
    ...incomingAlarm,
  }
}

function ensureWorldState(): WorldState {
  const defaults = createInitialWorldState()
  const incoming = state.world

  const objects: Record<string, WorldObjectState> = structuredClone(defaults.objects)
  for (const [id, object] of Object.entries(incoming?.objects ?? {})) {
    objects[id] = mergeObjectState(defaults.objects[id], structuredClone(object))
  }

  const npcs: Record<string, WorldNpcState> = structuredClone(defaults.npcs)
  for (const [id, npc] of Object.entries(incoming?.npcs ?? {})) {
    npcs[id] = mergeNpcState(defaults.npcs[id], structuredClone(npc))
  }

  const quests: Record<string, WorldQuestState> = structuredClone(defaults.quests)
  for (const [id, quest] of Object.entries(incoming?.quests ?? {})) {
    quests[id] = mergeQuestState(defaults.quests[id], structuredClone(quest))
  }

  const alarms: Record<string, WorldAlarmState> = structuredClone(defaults.alarms)
  for (const [id, alarm] of Object.entries(incoming?.alarms ?? {})) {
    alarms[id] = mergeAlarmState(defaults.alarms[id], structuredClone(alarm))
  }

  state.world = {
    objects,
    npcs,
    quests,
    alarms,
    flags: { ...defaults.flags, ...(incoming?.flags ?? {}) },
    eventLog: structuredClone(incoming?.eventLog ?? []).slice(-WORLD_EVENT_LOG_LIMIT),
  }
  return state.world
}

function createInitialState(): GameState {
  const initialRoomId = inferAdventureRoomId(DEFAULT_PLAYER.position)
  return {
    phase: 'exploration',
    player: structuredClone(DEFAULT_PLAYER),
    monsters: {},
    initiativeOrder: [],
    currentTurn: null,
    round: 0,
    movementUsed: {},
    actionUsed: {},
    combatLog: [],
    roomsVisited: initialRoomId ? [initialRoomId] : [],
    currentRoomId: initialRoomId,
    encountersTriggered: [],
    world: createInitialWorldState(),
  }
}

function syncPlayerRoomFromPosition(): void {
  const roomId = inferAdventureRoomId(state.player.position)
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
  ensureWorldState()
  return state
}

export function resetState(): GameState {
  state = createInitialState()
  return state
}

export function replaceState(nextState: GameState): GameState {
  state = {
    ...structuredClone(nextState),
    movementUsed: structuredClone(nextState.movementUsed ?? {}),
    actionUsed: structuredClone(nextState.actionUsed ?? {}),
    roomsVisited: structuredClone(nextState.roomsVisited ?? []),
    encountersTriggered: structuredClone(nextState.encountersTriggered ?? []),
  }
  ensureWorldState()
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

export function getWorldState(): WorldState {
  return ensureWorldState()
}

export function recordWorldEvent(event: Omit<EngineEvent, 'id' | 'visibleToPlayer'> & { id?: string; visibleToPlayer?: boolean }): EngineEvent {
  const world = ensureWorldState()
  const recorded: EngineEvent = {
    ...event,
    id: event.id ?? `world-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    visibleToPlayer: event.visibleToPlayer ?? true,
  }
  world.eventLog.push(recorded)
  if (world.eventLog.length > WORLD_EVENT_LOG_LIMIT) {
    world.eventLog = world.eventLog.slice(-WORLD_EVENT_LOG_LIMIT)
  }
  return recorded
}

export function getWorldObject(objectId: string): WorldObjectState | undefined {
  return ensureWorldState().objects[objectId]
}

export function updateWorldObject(objectId: string, patch: Partial<WorldObjectState>): WorldObjectState {
  const world = ensureWorldState()
  const object = world.objects[objectId]
  if (!object) throw new Error(`World object not found: ${objectId}`)
  world.objects[objectId] = {
    ...object,
    ...patch,
    dc: { ...(object.dc ?? {}), ...(patch.dc ?? {}) },
    tags: patch.tags ?? object.tags,
    contains: patch.contains ?? object.contains,
  }
  return world.objects[objectId]
}

export function discoverWorldObject(objectId: string): WorldObjectState {
  return updateWorldObject(objectId, { visible: true, discovered: true })
}

export function openWorldObject(objectId: string): WorldObjectState {
  return updateWorldObject(objectId, { visible: true, discovered: true, opened: true, locked: false })
}

export function takeWorldObject(objectId: string): WorldObjectState {
  return updateWorldObject(objectId, { visible: true, discovered: true, taken: true })
}

export function updateNpcDisposition(npcId: string, disposition: WorldNpcDisposition): WorldNpcState {
  const world = ensureWorldState()
  const npc = world.npcs[npcId]
  if (!npc) throw new Error(`World NPC not found: ${npcId}`)
  world.npcs[npcId] = {
    ...npc,
    disposition,
    known: true,
  }
  return world.npcs[npcId]
}

export function advanceWorldQuest(questId: string, flagId: string, amount = 1): WorldQuestState {
  const world = ensureWorldState()
  const quest = world.quests[questId]
  if (!quest) throw new Error(`World quest not found: ${questId}`)
  quest.flags ??= {}
  if (!quest.flags[flagId]) {
    quest.progress = Math.min(quest.goal, quest.progress + amount)
    quest.flags[flagId] = true
  }
  quest.completed = quest.progress >= quest.goal
  return quest
}

export function raiseWorldAlarm(alarmId: string, reason: string, amount = 1): WorldAlarmState {
  const world = ensureWorldState()
  const alarm = world.alarms[alarmId] ?? { level: 0, raised: false }
  alarm.level = Math.max(0, alarm.level + amount)
  alarm.raised = true
  alarm.reason = reason
  world.alarms[alarmId] = alarm
  return alarm
}

export function setWorldFlag(flagId: string, value: boolean): void {
  const world = ensureWorldState()
  world.flags ??= {}
  world.flags[flagId] = value
}

export function stabilizePlayer(reason: string): PlayerState {
  const player = state.player
  player.deathSaves = { successes: 0, failures: 0, stable: true }
  if (!player.conditions.includes('unconscious')) {
    player.conditions.push('unconscious')
  }
  player.hp.current = 0
  recordWorldEvent({
    type: 'character.stabilized',
    summary: reason,
    actorId: 'player',
    targetId: 'player',
    outcome: 'success',
  })
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
