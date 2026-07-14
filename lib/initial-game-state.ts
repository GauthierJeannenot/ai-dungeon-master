import type { GameState } from './types'
import {
  getAdventureMap,
  seedAdventureNpcs,
  inferAdventureRoomId,
  DEFAULT_ADVENTURE_ID,
} from './adventure-map'
import { buildPlayerState, DEFAULT_CHARACTER_ID } from './character-registry'

// ─────────────────────────────────────────────────────────────────────────────
// État de jeu initial OPTIMISTE (client) pour un module + personnage donnés :
// affiché avant la première réponse serveur. Le moteur MCP reste autoritaire et
// renvoie l'état réel au premier message — ceci n'existe que pour un premier
// rendu correct (position du joueur, PV, PNJ visibles). Miroir exact de
// mcp-server/game-state.ts (même buildPlayerState partagé, aucun drift).
// ─────────────────────────────────────────────────────────────────────────────

export function buildInitialGameState(
  adventureId: string = DEFAULT_ADVENTURE_ID,
  characterId: string = DEFAULT_CHARACTER_ID
): GameState {
  const map = getAdventureMap(adventureId)
  const position = { ...map.startCell }
  const roomId = inferAdventureRoomId(position, adventureId)
  const player = buildPlayerState({
    characterId,
    level: map.initialPlayer.level,
    position,
    extraInventory: map.initialPlayer.extraInventory,
  })
  return {
    adventureId,
    characterId,
    phase: 'exploration',
    player,
    monsters: {},
    npcs: seedAdventureNpcs(adventureId),
    initiativeOrder: [],
    currentTurn: null,
    round: 0,
    movementUsed: {},
    actionUsed: {},
    bonusActionUsed: {},
    combatLog: [],
    roomsVisited: roomId ? [roomId] : [],
    currentRoomId: roomId,
    encountersTriggered: [],
    worldFacts: [],
  }
}
