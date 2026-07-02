import type { GameState, PlayerState } from './types'
import {
  getAdventureMap,
  seedAdventureNpcs,
  inferAdventureRoomId,
  DEFAULT_ADVENTURE_ID,
} from './adventure-map'

// ─────────────────────────────────────────────────────────────────────────────
// État de jeu initial OPTIMISTE (client) pour un module donné : affiché avant la
// première réponse serveur. Le moteur MCP reste autoritaire et renvoie l'état
// réel au premier message — ceci n'existe que pour un premier rendu correct
// (position du joueur, PV, PNJ visibles). Miroir de mcp-server/game-state.ts.
// ─────────────────────────────────────────────────────────────────────────────

// Gabarit commun aux modules (mêmes valeurs que BASE_PLAYER du moteur).
const BASE_PLAYER: Omit<PlayerState, 'level' | 'hp' | 'position' | 'inventory'> = {
  id: 'player',
  name: 'Héros',
  class: 'Guerrier',
  deathSaves: { successes: 0, failures: 0 },
  ac: 16,
  stats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 },
  proficiencyBonus: 2,
  conditions: [],
  speed: 30,
}

export function buildInitialGameState(adventureId: string = DEFAULT_ADVENTURE_ID): GameState {
  const map = getAdventureMap(adventureId)
  const position = { ...map.startCell }
  const roomId = inferAdventureRoomId(position, adventureId)
  const player: PlayerState = {
    ...BASE_PLAYER,
    level: map.initialPlayer.level,
    hp: { ...map.initialPlayer.hp },
    position,
    inventory: map.initialPlayer.inventory.map(item => ({ ...item })),
  }
  return {
    adventureId,
    phase: 'exploration',
    player,
    monsters: {},
    npcs: seedAdventureNpcs(adventureId),
    initiativeOrder: [],
    currentTurn: null,
    round: 0,
    movementUsed: {},
    actionUsed: {},
    combatLog: [],
    roomsVisited: roomId ? [roomId] : [],
    currentRoomId: roomId,
    encountersTriggered: [],
  }
}
