import type { GameState } from './types'
import {
  getAdventureMap,
  seedAdventureNpcs,
  seedAdventureGroundItems,
  inferAdventureRoomId,
  DEFAULT_ADVENTURE_ID,
} from './adventure-map'
import { buildPlayerState, DEFAULT_CHARACTER_ID } from './character-registry'
import { initialHeroState } from './hero-state'
import { initialCurrencyState } from './currency-state'

// ─────────────────────────────────────────────────────────────────────────────
// État de jeu initial OPTIMISTE (client) pour un module + personnage donnés :
// affiché avant la première réponse serveur. Le moteur MCP reste autoritaire et
// renvoie l'état réel au premier message — ceci n'existe que pour un premier
// rendu correct (position du joueur, PV, PNJ visibles). Miroir exact de
// mcp-server/game-state.ts (même buildPlayerState partagé, aucun drift).
// Les personnalités aléatoires sont préparées par le moteur à la première
// synchronisation ; le client ne crée ni graine ni nouveau tirage.
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
    ...initialCurrencyState(player),
    ...(player.ruleset === 'srd2014' ? { hero: initialHeroState(characterId, player.level) } : {}),
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
    droppedItems: seedAdventureGroundItems(adventureId),
    ...(map.layoutMigrations?.length ? { sceneMemory: { layoutMigrations: map.layoutMigrations.map(m => m.id) } } : {}),
  }
}
