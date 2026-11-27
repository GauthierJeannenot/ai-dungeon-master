import type { Condition, GameState, MonsterState, PlayerState } from '../lib/types'
import { firstMapId } from '../lib/adventure-map'
import { isStatBackedNpc } from '../lib/npc-stat-blocks'
import * as gs from './game-state'
import { conditionImmune } from './monster-rules'
import { assertPetrifiedAfflictionsTransition, resumePetrifiedAfflictions, reconcileAfflictions } from './afflictions'
import { assertPetrifiedSpriteTransition, resumePetrifiedSpriteEffects } from './petrified-sprite-effects'

type Actor = PlayerState | MonsterState
export type ConditionProvider = { kind: 'hero' | 'monster'; id: string }

/** Internal condition bookkeeping only. Public action eligibility continues to
 * use getEntity: finding this reference never creates a token or a combat slot.
 * Current-floor caches are stale copies and must never override live actors. */
export function persistedConditionTarget(id: string, state: GameState = gs.getState()): Actor | undefined {
  if (id === 'player') return state.player
  if (Object.hasOwn(state.monsters, id)) return state.monsters[id]
  // A sourced narrative NPC is already a real persisted body. Reading its
  // condition/HP bookkeeping never reveals it or enlists it for an action.
  if(isStatBackedNpc(state.npcs?.[id]))return state.npcs![id] as MonsterState
  const retired = state.sceneMemory?.retiredMonsters as Record<string, MonsterState> | undefined
  if (retired && Object.hasOwn(retired, id)) return retired[id]
  const floors = state.sceneMemory?.floorMonsters as Record<string, Record<string, MonsterState>> | undefined
  const currentMapId = state.currentMapId ?? firstMapId(state)
  let target: MonsterState | undefined
  for (const [mapId, actors] of Object.entries(floors ?? {}))
    if (mapId !== currentMapId && Object.hasOwn(actors, id)) target = actors[id]
  return target
}

/** Providers remain authoritative until their own removal. In particular,
 * simultaneous expirations cannot end stone before the last provider commits. */
export function hasPersistedConditionProvider(targetId: string, condition: Condition, excluded?: ConditionProvider, state: GameState = gs.getState()): boolean {
  return Boolean(state.hero?.effects.some(effect => !(excluded?.kind === 'hero' && excluded.id === effect.id)
    && effect.targetIds.includes(targetId) && effect.data.condition === condition)
    || state.monsterEffects?.some(effect => !(excluded?.kind === 'monster' && excluded.id === effect.id)
      && !effect.petrificationPause && effect.targetId === targetId && effect.conditions.includes(condition)))
}

/** Before the provider is removed: validate every target's transition first. */
export function assertPersistedConditionRemoval(targetId: string, condition: Condition, endedAt: number, excluded?: ConditionProvider): void {
  const target = persistedConditionTarget(targetId)
  if (condition !== 'petrified' || !target?.conditions.includes('petrified') || hasPersistedConditionProvider(targetId, condition, excluded)) return
  assertPetrifiedAfflictionsTransition(targetId, endedAt)
  assertPetrifiedSpriteTransition(targetId, endedAt)
}

/** Apply only symptoms from an already established resumed source. This is not
 * an action, exposure, heal or route to target a creature on another map. */
export function applyPersistedRestoredCondition(targetId: string, condition: Condition): void {
  const target = persistedConditionTarget(targetId)
  if (!target) return
  if (gs.getEntity(targetId) === target) { gs.applyCondition(targetId, condition, { deferReconcile: true }); return }
  if (conditionImmune(target, condition)) return
  if (!target.conditions.includes(condition)) target.conditions.push(condition)
  if (condition === 'unconscious' && !conditionImmune(target, 'prone') && !target.conditions.includes('prone')) target.conditions.push('prone')
}

/** After real provider removal, keep independently supplied conditions and all
 * zero-HP unconsciousness. Archived actors change only condition state here. */
export function finishPersistedConditionRemoval(targetId: string, condition: Condition, endedAt: number): void {
  const target = persistedConditionTarget(targetId)
  if (!target || hasPersistedConditionProvider(targetId, condition) || condition === 'unconscious' && target.hp.current <= 0) return
  if (gs.getEntity(targetId) === target) { gs.removeCondition(targetId, condition, endedAt); return }
  const stone = condition === 'petrified' && target.conditions.includes('petrified')
  if (stone) assertPersistedConditionRemoval(targetId, condition, endedAt)
  target.conditions = target.conditions.filter(existing => existing !== condition)
  if (stone) {
    resumePetrifiedAfflictions(targetId, endedAt)
    resumePetrifiedSpriteEffects(targetId, endedAt)
    reconcileAfflictions()
  }
}

/** Re-read after each boundary: thaw can restore a provider whose expiry also
 * falls inside this clock jump. Include ordinary timed effects too (e.g. Aid)
 * so their existing ending rules run before same-time recovery/save events. */
export function persistedConditionExpirations(until: number): Array<ConditionProvider & { at: number }> {
  const state = gs.getState()
  return [
    ...(state.hero?.effects ?? []).filter(effect => effect.expiresAt <= until)
      .map(effect => ({ kind: 'hero' as const, id: effect.id, at: effect.expiresAt })),
    ...(state.monsterEffects ?? []).filter(effect => !effect.petrificationPause
      && effect.expiresAt !== undefined && effect.expiresAt <= until)
      .map(effect => ({ kind: 'monster' as const, id: effect.id, at: effect.expiresAt! })),
  ].sort((a,b) => a.at - b.at)
}
