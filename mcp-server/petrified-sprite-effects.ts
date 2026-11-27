import type { Condition, GameState, MonsterEffect, MonsterState, PlayerState } from '../lib/types'
import * as gs from './game-state'
import { RuleViolation } from './rules'
import { endEffect } from './monster-rules'
import { persistedConditionTarget, applyPersistedRestoredCondition } from './persisted-conditions'

const spriteKind = (effect: MonsterEffect) => effect.kind === 'sprite-poison' || effect.kind === 'sprite-sleep'
const sourceCondition = (effect: MonsterEffect): Condition => effect.kind === 'sprite-poison' ? 'poisoned' : 'unconscious'
const relevant = (effect: MonsterEffect) => spriteKind(effect) && Boolean(effect.petrificationPause || effect.conditions.includes(sourceCondition(effect)))
const clock = () => gs.getState().worldTimeSeconds ?? 0
const refuse = (code: string, message: string): never => { throw new RuleViolation(code, message, {}) }

/** Loading or inspecting an archived actor is never an entry into stone. */
export function validatePetrifiedSpriteHistory(state: GameState) {
  const actors: Record<string, PlayerState | MonsterState> = {}
  const floors = state.sceneMemory?.floorMonsters as Record<string, Record<string, MonsterState>> | undefined
  for (const [mapId, monsters] of Object.entries(floors ?? {})) if (mapId !== state.currentMapId) Object.assign(actors, monsters)
  Object.assign(actors, state.sceneMemory?.retiredMonsters as Record<string, MonsterState> | undefined, state.monsters, { player: state.player })
  const unresolvedEffectIds: string[] = [], errors: Array<{ effectId: string; code: string; message: string }> = []
  const counts = new Map<string, number>()
  for (const effect of state.monsterEffects ?? []) counts.set(effect.id, (counts.get(effect.id) ?? 0) + 1)
  for (const effect of state.monsterEffects ?? []) {
    const pause = effect.petrificationPause
    if (!relevant(effect) && !pause && !effect.spritePoisonId) continue
    const error = (code: string, message: string) => errors.push({ effectId: effect.id, code, message })
    if (counts.get(effect.id)! > 1) error('PETRIFIED_SPRITE_EFFECT_CONFLICT', 'A sprite effect ID must remain unique across active and paused sources.')
    if (effect.spritePoisonId) {
      const poison = state.monsterEffects?.find(candidate => candidate.id === effect.spritePoisonId)
      if (effect.kind !== 'sprite-sleep' || poison?.kind !== 'sprite-poison' || poison.sourceId !== effect.sourceId
        || poison.targetId !== effect.targetId || poison.expiresAt !== effect.expiresAt
        || poison.petrificationPause?.pausedAt !== pause?.pausedAt)
        error('SPRITE_POISON_LINK_INVALID', 'The saved sprite sleep must link to the actual poison from the same hit, target and clock.')
    }
    if (pause && (!spriteKind(effect) || effect.conditions.length || pause.conditions.length !== 1
      || pause.conditions[0] !== sourceCondition(effect) || !Number.isFinite(pause.pausedAt) || pause.pausedAt < 0
      || pause.pausedAt > (state.worldTimeSeconds ?? 0) || effect.expiresAt === undefined || effect.expiresAt <= pause.pausedAt))
      error('PETRIFIED_SPRITE_STATE_MISMATCH', 'A paused sprite source must preserve its exact symptom and an elapsed onset before its original expiration.')
    const actor = actors[effect.targetId]
    if (!actor) continue // Missing actors are not summoned or made active.
    const stone = actor.conditions.includes('petrified')
    if (pause && !stone) error('PETRIFIED_SPRITE_STATE_MISMATCH', 'The paused source must match its actually petrified target.')
    if (stone && !pause && relevant(effect)) unresolvedEffectIds.push(effect.id)
  }
  return { valid: !errors.length, errors, unresolvedEffectIds }
}

export function assertPetrifiedSpriteHistory(): void {
  const result = validatePetrifiedSpriteHistory(gs.getState())
  if (result.errors.length) refuse(result.errors[0].code, result.errors[0].message)
  if (result.unresolvedEffectIds.length)
    refuse('PETRIFIED_SPRITE_HISTORY_REQUIRED', 'This existing petrification has an unanchored sprite poison/sleep; no past onset or remaining duration is invented.')
}

/** Preflight both real condition transitions before any condition mutation. */
export function assertPetrifiedSpriteTransition(targetId: string, endedAt = clock()): void {
  const affected = (gs.getState().monsterEffects ?? []).filter(effect => effect.targetId === targetId && relevant(effect))
  if (!affected.length) return
  if (gs.getState().hero?.pending) refuse('REACTION_PENDING', 'Resolve the held roll before changing sprite poison suspension.')
  const stone = persistedConditionTarget(targetId)?.conditions.includes('petrified'), ids = new Set<string>()
  for (const effect of affected) {
    if (ids.has(effect.id) || gs.getState().monsterEffects!.some(other => other !== effect && other.id === effect.id))
      refuse('PETRIFIED_SPRITE_EFFECT_CONFLICT', 'A sprite source ID is duplicated; no partial transition is allowed.')
    ids.add(effect.id)
    const pause = effect.petrificationPause
    if (stone && !pause) refuse('PETRIFIED_SPRITE_HISTORY_REQUIRED', 'No historical petrification onset is inferred for an existing sprite source.')
    if (!stone && pause) refuse('PETRIFIED_SPRITE_STATE_MISMATCH', 'Resume only through the actual saved petrification transition.')
    if (pause && (pause.pausedAt > endedAt || endedAt > clock()))
      refuse('PETRIFIED_SPRITE_STATE_MISMATCH', 'The real end must follow the saved onset and cannot be in the future.')
    if (!pause && (effect.expiresAt === undefined || effect.expiresAt <= clock()))
      refuse('SPRITE_EFFECT_RECONCILIATION_REQUIRED', 'Reconcile the expired sprite source before a new petrification; no retroactive pause is created.')
    if (!pause && (effect.conditions.length !== 1 || effect.conditions[0] !== sourceCondition(effect)))
      refuse('SPRITE_EFFECT_UNSUPPORTED', 'This source has symptoms outside its exact sprite poison/sleep contract; none is discarded.')
  }
}

function conditionSupported(targetId: string, condition: Condition): boolean {
  const state = gs.getState()
  return Boolean(state.monsterEffects?.some(effect => effect.targetId === targetId && !effect.petrificationPause
    && effect.conditions.includes(condition) && (effect.expiresAt === undefined || effect.expiresAt > clock()))
    || state.hero?.effects.some(effect => effect.targetIds.includes(targetId) && effect.data.condition === condition && effect.expiresAt > clock()))
}

/** Stage every source before removing any symptom, preserving other causes. */
export function suspendPetrifiedSpriteEffects(targetId: string): void {
  const target = gs.getEntity(targetId)
  if (!target?.conditions.includes('petrified')) return
  const sources = (gs.getState().monsterEffects ?? []).filter(effect => effect.targetId === targetId && relevant(effect) && !effect.petrificationPause)
  const conditions = new Set<Condition>()
  for (const effect of sources) {
    effect.petrificationPause = { pausedAt: clock(), conditions: [...effect.conditions] }
    for (const condition of effect.conditions) conditions.add(condition)
    effect.conditions = []
  }
  for (const condition of conditions) if (!conditionSupported(targetId, condition)
    && !(condition === 'unconscious' && target.hp.current <= 0)) gs.removeCondition(targetId, condition)
}

/** Resume dates first and symptoms second. endedAt is internal, supplied by
 * the last real stone provider, never guessed from the late observation time. */
export function resumePetrifiedSpriteEffects(targetId: string, endedAt = clock()): void {
  if (persistedConditionTarget(targetId)?.conditions.includes('petrified')) return
  const sources = (gs.getState().monsterEffects ?? []).filter(effect => effect.targetId === targetId && effect.petrificationPause)
  for (const effect of sources) if (endedAt < effect.petrificationPause!.pausedAt || endedAt > clock())
    refuse('PETRIFIED_SPRITE_STATE_MISMATCH', 'The real end must lie between the saved pause onset and current time.')
  const conditions = new Set<Condition>(), expired: string[] = []
  for (const effect of sources) {
    const pause = effect.petrificationPause!
    effect.expiresAt! += endedAt - pause.pausedAt
    delete effect.petrificationPause
    if (effect.expiresAt! <= clock()) { expired.push(effect.id); continue }
    effect.conditions = [...pause.conditions]
    for (const condition of effect.conditions) conditions.add(condition)
  }
  for (const id of expired) endEffect(id)
  for (const condition of conditions) applyPersistedRestoredCondition(targetId, condition)
}

export function activeSpritePoisons(targetId: string): MonsterEffect[] {
  return (gs.getState().monsterEffects ?? []).filter(effect => effect.targetId === targetId && effect.kind === 'sprite-poison' && relevant(effect)
    && (effect.petrificationPause || effect.expiresAt !== undefined && effect.expiresAt > clock()))
}

/** Exact real link for new hits; a unique same-source/target/expiry legacy
 * pair may be established from saved structure, never guessed among duplicates. */
export function assertSpritePoisonCure(targetId: string, poisonId: string): string[] {
  const poison = activeSpritePoisons(targetId).find(effect => effect.id === poisonId)
  if (!poison) refuse('AFFLICTION_NOT_ACTIVE', 'Select one exact existing sprite poison on this target.')
  const state = gs.getState(), selected = poison!
  const matches = (effect: MonsterEffect) => effect.sourceId === selected.sourceId && effect.targetId === targetId
    && effect.expiresAt === selected.expiresAt && effect.petrificationPause?.pausedAt === selected.petrificationPause?.pausedAt
  const sleeps = (state.monsterEffects ?? []).filter(effect => effect.kind === 'sprite-sleep' && relevant(effect))
  const linked = sleeps.filter(effect => effect.spritePoisonId === poisonId)
  if (linked.some(effect => !matches(effect)) || linked.length > 1)
    refuse('SPRITE_POISON_LINK_AMBIGUOUS', 'The saved sleep link must belong to this exact poison, target and remaining clock.')
  const legacy = sleeps.filter(effect => !effect.spritePoisonId && matches(effect))
  if (legacy.length && (legacy.length !== 1 || linked.length || activeSpritePoisons(targetId).filter(matches).length !== 1))
    refuse('SPRITE_POISON_LINK_AMBIGUOUS', 'The old sprite sleep has no unique attested poison source; no pairing or cure is invented.')
  return [...linked, ...legacy].map(effect => effect.id)
}

export function neutralizeSpritePoison(targetId: string, poisonId: string): string[] {
  const sleepIds = assertSpritePoisonCure(targetId, poisonId)
  for (const id of sleepIds) endEffect(id)
  endEffect(poisonId)
  return [poisonId]
}
