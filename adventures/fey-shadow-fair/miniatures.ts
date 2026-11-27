import type { MiniatureId } from '../../lib/miniatures'

// Explicit display choices only: character identities stay in map.ts.
// The user-selected smallfolk musician is scoped to the minstrel alone.
export const NPC_MINIATURES: Readonly<Record<string, MiniatureId>> = {
  madame_bougie: 'realistic/candle-halfling',
  nicodeme: 'realistic/goblin-civilian',
  pipotin: 'realistic/goblin-civilian',
  theophile: 'realistic/goblin-civilian',
  barnabe: 'realistic/potted-shrub',
  mirabelle: 'realistic/halfling-bard',
  maitre_filou: 'realistic/leprechaun',
}
