import type { GameState, PlayerState } from './types'
import {
  getAdventureMap,
  seedAdventureNpcs,
  inferAdventureRoomId,
  DEFAULT_ADVENTURE_ID,
} from './adventure-map'
import { BASE_PLAYER } from './player-template'

// ─────────────────────────────────────────────────────────────────────────────
// État de jeu initial OPTIMISTE (client) pour un module donné : affiché avant la
// première réponse serveur. Le moteur MCP reste autoritaire et renvoie l'état
// réel au premier message — ceci n'existe que pour un premier rendu correct
// (position du joueur, PV, PNJ visibles). Miroir de mcp-server/game-state.ts
// (même BASE_PLAYER partagé via lib/player-template.ts).
// ─────────────────────────────────────────────────────────────────────────────

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
