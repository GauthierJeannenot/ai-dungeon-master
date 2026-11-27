import type { MiniatureId } from '../../lib/miniatures'

// Display-only catalogue. Not imported by the engine or adventure map.
export const CREATURE_MINIATURES: Readonly<Record<string, MiniatureId>> = {
  dryad: 'realistic/forest-spirit',
}

export const NPC_MINIATURES = CREATURE_MINIATURES
