import { swallowedBy } from '../lib/swallow-state'
import { spatialWeaponResolution } from '../lib/spatial-weapon-resolution'
import type { GameState,MonsterState, PlayerState } from '../lib/types'
import { nativeCreatureSenses, resolveCreaturePerception, CREATURE_SENSE_LIMITS, CREATURE_SENSES_SOURCE } from '../lib/creature-senses'
import { lightingRay } from '../lib/lighting'
import * as gs from './game-state'
import { coverFor } from './cover'
import { RuleViolation } from './rules'
import { weatherObscurationBetween } from '../lib/weather-state'

/** No call to monster-perception: its canSee may safely delegate here. The ray
 * checks physical geometry even for an observer with the blinded condition. */
export function creaturePerception(observer: PlayerState | MonsterState, target: PlayerState | MonsterState, projectedState?:GameState) {
  const state = projectedState??gs.getState()
  const spatial=spatialWeaponResolution(state,observer.id,target.id)
  const obscuration=weatherObscurationBetween(state,observer.position,target.position)
  return resolveCreaturePerception(state, observer, target, {
    pathClear: spatial?true:lightingRay(state, observer.position, target.position),
    ...(spatial?{distanceFeet:spatial.distanceFeet}:{}),
    totalCover: swallowedBy(state,target.id)===observer.id?false:coverFor(observer.id, target.id).degree === 'total',
    heavyObscuration:obscuration.heavy,lightObscuration:obscuration.light,
  })
}

export function inspectCreatureSenses(observerId: string, targetId?: string) {
  const observer = gs.getEntity(observerId)
  if (!observer) throw new RuleViolation('ENTITY_NOT_FOUND', 'Select an existing observer creature.', {})
  if (targetId !== undefined) {
    const target = gs.getEntity(targetId)
    if (!target) throw new RuleViolation('ENTITY_NOT_FOUND', 'Select an existing target creature.', {})
    return creaturePerception(observer, target)
  }
  return { observerId, profile: nativeCreatureSenses(observer), limits: CREATURE_SENSE_LIMITS, source: CREATURE_SENSES_SOURCE }
}
