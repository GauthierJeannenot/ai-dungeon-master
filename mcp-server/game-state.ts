import {
  GameState,
  MonsterState,
  NpcState,
  Condition,
  PlayerState,
  Item,
  MapOutcome,
  WorldFact,
  WorldNpcDisposition,
} from '../lib/types'
import { inferRoomIdOnMap, seedAdventureNpcs, getAdventureMap, firstMapId } from '../lib/adventure-map'
import { buildPlayerState } from '../lib/character-registry'
import { ACTIVE_ADVENTURE_ID } from './adventure'
import { ACTIVE_CHARACTER_ID } from './character'

// Construit le joueur initial : personnage actif (classe, stats, kit, PV,
// capacités, sorts) fusionné avec les deltas de l'aventure (niveau, position,
// objets propres). Voir lib/character-registry.ts (buildPlayerState).
function buildInitialPlayer(): PlayerState {
  const map = getAdventureMap(ACTIVE_ADVENTURE_ID)
  return buildPlayerState({
    characterId: ACTIVE_CHARACTER_ID,
    level: map.initialPlayer.level,
    position: map.startCell,
    extraInventory: map.initialPlayer.extraInventory,
  })
}

let state: GameState = createInitialState()

function createInitialState(): GameState {
  const player = buildInitialPlayer()
  const initialMapId = firstMapId(ACTIVE_ADVENTURE_ID)
  const initialRoomId = inferRoomIdOnMap(player.position, initialMapId, ACTIVE_ADVENTURE_ID)
  return {
    adventureId: ACTIVE_ADVENTURE_ID,
    characterId: ACTIVE_CHARACTER_ID,
    phase: 'exploration',
    player,
    monsters: {},
    npcs: seedAdventureNpcs(ACTIVE_ADVENTURE_ID),
    initiativeOrder: [],
    currentTurn: null,
    round: 0,
    movementUsed: {},
    actionUsed: {},
    bonusActionUsed: {},
    dashUsed: {},
    combatLog: [],
    roomsVisited: initialRoomId ? [initialRoomId] : [],
    currentRoomId: initialRoomId,
    currentMapId: initialMapId,
    mapOutcomes: {},
    encountersTriggered: [],
    worldFacts: [],
  }
}

function syncPlayerRoomFromPosition(): void {
  const previousRoomId = state.currentRoomId
  const roomId = inferRoomIdOnMap(state.player.position, state.currentMapId, state.adventureId)
  state.currentRoomId = roomId
  if (roomId && !state.roomsVisited.includes(roomId)) {
    state.roomsVisited.push(roomId)
  }
  // Purge des faits de monde bornés à la salle quittée (« eau au sol »…).
  if (previousRoomId && roomId !== previousRoomId) {
    purgeWorldFacts(fact => fact.expires === 'room' && fact.roomId === previousRoomId)
  }
}

// Retire les faits de monde qui satisfont le prédicat. Centralisé pour que la
// purge (salle/carte) reste cohérente.
function purgeWorldFacts(shouldRemove: (fact: WorldFact) => boolean): void {
  if (!state.worldFacts?.length) return
  state.worldFacts = state.worldFacts.filter(fact => !shouldRemove(fact))
}

const MAX_WORLD_FACTS = 8

// Enregistre un fait de monde (produit par un sort utilitaire). Plafond FIFO :
// on évince les plus anciens comme le combatLog borné.
export function addWorldFact(fact: Omit<WorldFact, 'id'>): WorldFact {
  state.worldFacts ??= []
  const created: WorldFact = {
    ...fact,
    id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  }
  state.worldFacts.push(created)
  if (state.worldFacts.length > MAX_WORLD_FACTS) {
    state.worldFacts = state.worldFacts.slice(-MAX_WORLD_FACTS)
  }
  return created
}

// Faits de monde actifs sur la carte courante (pour l'injection au prompt).
export function getActiveWorldFacts(): WorldFact[] {
  const currentMapId = state.currentMapId ?? firstMapId(state.adventureId)
  return (state.worldFacts ?? []).filter(fact => fact.mapId === currentMapId)
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
    // Personnage : l'état entrant fait foi ; sinon le personnage du process
    // (états historiques sans le champ = guerrier via ACTIVE_CHARACTER_ID).
    characterId: nextState.characterId ?? ACTIVE_CHARACTER_ID,
    movementUsed: structuredClone(nextState.movementUsed ?? {}),
    actionUsed: structuredClone(nextState.actionUsed ?? {}),
    // Économie d'action bonus / Ruse:dash (états legacy sans ces champs = vide).
    bonusActionUsed: structuredClone(nextState.bonusActionUsed ?? {}),
    dashUsed: structuredClone(nextState.dashUsed ?? {}),
    roomsVisited: structuredClone(nextState.roomsVisited ?? []),
    // Multi-map : états historiques sans ces champs = première map, aucune
    // map quittée. Doivent survivre au round-trip (docs/multi-map-adventures.md).
    currentMapId: nextState.currentMapId ?? firstMapId(adventureId),
    mapOutcomes: structuredClone(nextState.mapOutcomes ?? {}),
    encountersTriggered: structuredClone(nextState.encountersTriggered ?? []),
    // Faits de monde (sorts utilitaires) : doivent survivre au round-trip, sinon
    // ils seraient perdus au premier tour suivant (docs/playable-characters.md).
    worldFacts: structuredClone(nextState.worldFacts ?? []),
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
// Un PNJ est « sur la map courante » si son mapId (défaut : première map,
// états legacy) correspond au currentMapId de l'état.
export function npcOnCurrentMap(npc: NpcState): boolean {
  const defaultMapId = firstMapId(state.adventureId)
  return (npc.mapId ?? defaultMapId) === (state.currentMapId ?? defaultMapId)
}

export function revealNpcs(params: {
  npcId?: string
  kind?: string
  disposition?: WorldNpcDisposition
}): NpcState[] {
  if (!state.npcs) return []
  const currentRoomId = state.currentRoomId
  const matched: NpcState[] = []

  for (const npc of Object.values(state.npcs)) {
    const inScope = npcOnCurrentMap(npc) && (npc.roomId === null || npc.roomId === currentRoomId)
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

// ── Économie d'action bonus (second souffle, Ruse) ───────────────────────────
export function hasBonusActionUsed(entityId: string): boolean {
  return Boolean(state.bonusActionUsed?.[entityId])
}

export function markBonusActionUsed(entityId: string): void {
  state.bonusActionUsed ??= {}
  state.bonusActionUsed[entityId] = true
}

// ── Ruse : dash (double le budget de mouvement du tour) ──────────────────────
export function hasDashUsed(entityId: string): boolean {
  return Boolean(state.dashUsed?.[entityId])
}

export function markDashUsed(entityId: string): void {
  state.dashUsed ??= {}
  state.dashUsed[entityId] = true
}

export function resetTurnEconomy(entityId: string): void {
  resetMovement(entityId)
  resetActionUsed(entityId)
  if (state.bonusActionUsed) delete state.bonusActionUsed[entityId]
  if (state.dashUsed) delete state.dashUsed[entityId]
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
  state.bonusActionUsed = {}
  state.dashUsed = {}
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

// Applique les EFFETS d'un travel_to_map (les validations — quête, combat,
// sens unique — sont faites par le tool AVANT d'appeler ceci). Atomique du
// point de vue de l'état : appelé une fois, toutes les mutations ensemble.
export function applyMapTravel(params: {
  fromMapId: string
  toMapId: string
  arrivalCell: { x: number; y: number }
  arrivalRoomId: string
  companions: string[]
  outcome: MapOutcome
}): { companionsMoved: string[] } {
  // Issue de la map quittée — sens unique : sa présence dans mapOutcomes
  // verrouille tout retour.
  state.mapOutcomes ??= {}
  state.mapOutcomes[params.fromMapId] = structuredClone(params.outcome)

  // Les combattants de la map quittée n'ont plus de sens sur la nouvelle grille
  // (le voyage est refusé en combat : il ne reste que des cadavres ou des
  // créatures abandonnées derrière soi).
  state.monsters = {}
  state.initiativeOrder = []
  state.currentTurn = null
  state.round = 0
  state.movementUsed = {}
  state.actionUsed = {}
  state.bonusActionUsed = {}
  state.dashUsed = {}

  // Repos narratif entre cartes : recharge des ressources de classe et des
  // emplacements de sorts à leur max (décision n°6, docs/playable-characters.md).
  rechargePlayerResources()

  // Faits de monde bornés à la carte quittée (ou à une de ses salles) : purgés.
  purgeWorldFacts(fact => fact.mapId === params.fromMapId)

  state.currentMapId = params.toMapId
  state.player.position = { x: params.arrivalCell.x, y: params.arrivalCell.y }
  visitRoom(params.arrivalRoomId)

  // Compagnons : ils traversent avec le joueur, placés sur une case libre
  // adjacente à l'arrivée. Les autres PNJ restent sur leur map d'origine.
  const companionsMoved: string[] = []
  const occupied = new Set<string>([`${params.arrivalCell.x},${params.arrivalCell.y}`])
  for (const npcId of params.companions) {
    const npc = state.npcs?.[npcId]
    if (!npc) continue
    const grid = getAdventureMap(state.adventureId).maps.find(m => m.id === params.toMapId)?.grid
    const cell = findFreeCellNear(params.arrivalCell, occupied, grid)
    npc.mapId = params.toMapId
    npc.roomId = params.arrivalRoomId
    npc.position = cell
    occupied.add(`${cell.x},${cell.y}`)
    companionsMoved.push(npcId)
  }
  return { companionsMoved }
}

// Première case libre autour d'un point (anneaux croissants), bornée à la
// grille. Repli : la case d'origine décalée d'un cran vers l'intérieur.
function findFreeCellNear(
  origin: { x: number; y: number },
  occupied: Set<string>,
  grid: { cols: number; rows: number } | undefined
): { x: number; y: number } {
  const maxX = (grid?.cols ?? 17) - 1
  const maxY = (grid?.rows ?? 15) - 1
  for (let radius = 1; radius <= 3; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
        const x = origin.x + dx
        const y = origin.y + dy
        if (x < 0 || y < 0 || x > maxX || y > maxY) continue
        if (occupied.has(`${x},${y}`)) continue
        return { x, y }
      }
    }
  }
  return { x: Math.max(0, Math.min(maxX, origin.x)), y: Math.max(0, Math.min(maxY, origin.y)) }
}

// Recharge les ressources de classe et emplacements de sorts du joueur à leur
// max (appelé au changement de carte). Sans effet sur un guerrier legacy sans
// ressources/emplacements.
function rechargePlayerResources(): void {
  const player = state.player
  if (player.resources) {
    for (const key of Object.keys(player.resources)) {
      player.resources[key].current = player.resources[key].max
    }
  }
  if (player.spellSlots) {
    player.spellSlots.level1.current = player.spellSlots.level1.max
  }
}

// Dépense un emplacement de sort de niveau 1. Retourne false si aucun dispo.
export function consumeSpellSlot(level: 1): boolean {
  const slots = state.player.spellSlots
  if (level !== 1 || !slots || slots.level1.current <= 0) return false
  slots.level1.current -= 1
  return true
}

// Dépense une ressource de classe nommée. Retourne false si épuisée/absente.
export function consumeResource(name: string): boolean {
  const resource = state.player.resources?.[name]
  if (!resource || resource.current <= 0) return false
  resource.current -= 1
  return true
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
