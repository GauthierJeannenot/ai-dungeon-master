import type { PlayerState } from './types'

// Gabarit de joueur commun aux modules (nom, classe, stats, CA, maîtrise,
// vitesse). Le niveau, les PV, la position et l'inventaire viennent du module
// actif (adventures/<id>/map.ts). Partagé par le moteur MCP
// (mcp-server/game-state.ts) ET le miroir client optimiste
// (lib/initial-game-state.ts) : source unique, aucun drift possible entre les deux.
export const BASE_PLAYER: Omit<PlayerState, 'level' | 'hp' | 'position' | 'inventory'> = {
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
