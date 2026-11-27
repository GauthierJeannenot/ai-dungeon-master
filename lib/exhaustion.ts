import { isStatBackedNpc } from './npc-stat-blocks'
import type { NpcState } from './types'
import type { ExhaustionCreature, ExhaustionStateView } from './exhaustion-state'

/** PHB 2014 Appendix A: cumulative exhaustion, not the 2024 d20 penalty. */
export function exhaustionLevel(state: ExhaustionStateView, targetId: string): number {
  return state.dmTools?.exhaustion?.creatures[targetId]?.level ?? 0
}
export function exhaustionDisadvantage(state: ExhaustionStateView, targetId: string, kind: 'check' | 'attack' | 'save'): boolean {
  return exhaustionLevel(state, targetId) >= (kind === 'check' ? 1 : 3)
}
export function exhaustionSpeed(state: ExhaustionStateView, targetId: string, speed: number): number {
  const level = exhaustionLevel(state, targetId)
  return level >= 5 ? 0 : level >= 2 ? Math.floor(Math.max(0, speed) / 2) : Math.max(0, speed)
}
export function exhaustionEffects(level: number) {
  return { abilityChecksDisadvantage: level >= 1, speedMultiplier: level >= 5 ? 0 : level >= 2 ? 0.5 : 1,
    attacksDisadvantage: level >= 3, savesDisadvantage: level >= 3, hpMaximumMultiplier: level >= 4 ? 0.5 : 1, death: level >= 6 }
}

type ExhaustionActorView = { hp: { current: number; max: number }; conditions: readonly string[];
  isAlive?: boolean; deathSaves?: { dead?: boolean } }
type ExhaustionValidationView = ExhaustionStateView & {
  player: ExhaustionActorView
  monsters: Record<string, ExhaustionActorView>
  npcs?: Record<string,NpcState>
  currentMapId?: string
  sceneMemory?: Record<string, unknown>
}
/** Read-only validation before replacing authoritative state. Legacy unknown levels
 * remain distinguishable from invalid new records, without inventing a level. */
export function validateExhaustionState(state: ExhaustionValidationView) {
  const errors: Array<{ targetId: string; code: string; message: string }> = []
  const unresolvedTargetIds: string[] = []
  const records = state.dmTools?.exhaustion?.creatures ?? {}
  const actors: Record<string, ExhaustionActorView> = {}
  const floors = state.sceneMemory?.floorMonsters as Record<string, Record<string, ExhaustionActorView>> | undefined
  // The active floor's archive may be an older visit. Only its live actors are
  // authoritative; other floors retain their actual archived combatants.
  for (const [mapId, monsters] of Object.entries(floors ?? {})) if (mapId !== state.currentMapId)
    Object.assign(actors, monsters)
  // Disengaged actors are retained solely for state/receipt integrity. They
  // never re-enter a floor automatically and are not active game entities.
  Object.assign(actors, state.sceneMemory?.retiredMonsters as Record<string, ExhaustionActorView> | undefined)
  for(const npc of Object.values(state.npcs??{}))if(isStatBackedNpc(npc))actors[npc.id]=npc
  Object.assign(actors, state.monsters, { player: state.player })
  for (const [targetId, actor] of Object.entries(actors)) {
    const record = records[targetId], marked = actor.conditions.includes('exhaustion')
    if (!record) { if (marked) unresolvedTargetIds.push(targetId); continue }
    if (!Number.isInteger(record.level) || record.level < 0 || record.level > 6)
      errors.push({ targetId, code: 'EXHAUSTION_LEVEL_INVALID', message: 'Exhaustion requires an integer level from 0 through 6.' })
    if (marked !== (record.level > 0))
      errors.push({ targetId, code: 'EXHAUSTION_MARKER_MISMATCH', message: 'The exhaustion condition marker must be present exactly when the tracked level is above zero.' })
    if (record.level === 6 && (actor.hp.current !== 0 || (targetId === 'player' ? !actor.deathSaves?.dead : actor.isAlive !== false)))
      errors.push({ targetId, code: 'EXHAUSTION_DEATH_MISMATCH', message: 'Level 6 exhaustion requires zero current HP and actual death, including for archived creatures.' })
    if (record.level >= 4) {
      if (!Number.isInteger(record.unexhaustedHpMax) || record.unexhaustedHpMax! < 0)
        errors.push({ targetId, code: 'EXHAUSTION_MAXIMUM_REQUIRED', message: 'Level 4–6 requires the nonnegative integer HP maximum before exhaustion.' })
      else if (actor.hp.max !== Math.floor(record.unexhaustedHpMax! / 2))
        errors.push({ targetId, code: 'EXHAUSTION_MAXIMUM_MISMATCH', message: 'Actual HP maximum must equal floor(unexhaustedHpMax / 2).' })
    } else if (record.unexhaustedHpMax !== undefined)
      errors.push({ targetId, code: 'EXHAUSTION_MAXIMUM_UNEXPECTED', message: 'Below level 4, the actual HP maximum is no longer halved and the stored pre-halving maximum must be absent.' })
  }
  for (const targetId of Object.keys(records)) if (!Object.hasOwn(actors, targetId))
    errors.push({ targetId, code: 'EXHAUSTION_TARGET_MISSING', message: 'A tracked exhaustion target must exist in the restored state.' })
  return { valid: errors.length === 0,
    status: errors.length ? 'invalid' as const : unresolvedTargetIds.length ? 'unresolved' as const : 'valid' as const,
    errors, unresolvedTargetIds }
}

/** Recompute the *real* maximum. Raising the maximum never heals current HP. */
export function setExhaustionLevel(record: ExhaustionCreature, hp: { current: number; max: number }, next: number): void {
  if (!Number.isInteger(next) || next < 0 || next > 6) throw new Error('Invalid exhaustion level.')
  if (record.level >= 4 && record.unexhaustedHpMax === undefined) throw new Error('Missing unexhausted HP maximum.')
  const unexhausted = record.level >= 4 ? record.unexhaustedHpMax! : hp.max
  record.level = next
  if (next >= 4) { record.unexhaustedHpMax = unexhausted; hp.max = Math.floor(unexhausted / 2) }
  else { delete record.unexhaustedHpMax; hp.max = unexhausted }
  hp.current = Math.min(hp.current, hp.max)
}

/** All additive maximum-HP effects operate on the same pre-halving maximum. */
export function adjustExhaustionMaximum(record: ExhaustionCreature | undefined, hp: { current: number; max: number }, delta: number, minimum = 0) {
  if (!Number.isInteger(delta) || !Number.isInteger(minimum) || minimum < 0) throw new Error('Invalid maximum-HP adjustment.')
  const before = { ...hp }
  if (record && record.level >= 4) {
    if (record.unexhaustedHpMax === undefined) throw new Error('Missing unexhausted HP maximum.')
    record.unexhaustedHpMax = Math.max(minimum, record.unexhaustedHpMax + delta)
    hp.max = Math.floor(record.unexhaustedHpMax / 2)
  } else hp.max = Math.max(minimum, hp.max + delta)
  hp.current = Math.min(hp.current, hp.max)
  return { hpBefore: before, hpAfter: { ...hp }, unexhaustedHpMax: record?.unexhaustedHpMax ?? hp.max }
}
