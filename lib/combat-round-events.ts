import type { GameState } from './types'
import { getMapSpec } from './adventure-map'

export interface RoundEventResult {
  eventId: string
  name: string
  mapId: string
  round: number
  path: Array<{ x: number; y: number }>
  mechanicalSummary: string
  victims: Array<{ entityId: string; name: string; damageRoll: string; rawDamage: number;
    damageDealt: number; hpBefore: number; hpAfter: number; prone: boolean }>
}

export function completedRoundEvents(state: GameState): Record<string, RoundEventResult> {
  return (state.sceneMemory?.roundEvents ?? {}) as Record<string, RoundEventResult>
}

export function activeMapTerrain(state: GameState) {
  const completed = completedRoundEvents(state)
  return (getMapSpec(state.currentMapId, state).terrain ?? [])
    .filter(feature => !feature.untilRoundEventId || !completed[feature.untilRoundEventId])
}
