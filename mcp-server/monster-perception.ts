import type { GameState, MonsterState, PlayerState } from '../lib/types'
import { navigationGrid } from '../lib/navigation'
import { engineGeometry } from './navigation'
import * as gs from './game-state'
import { creaturePerception } from './senses'
import { getMonsterRecord } from '../lib/srd/monsters'
import { exhaustionDisadvantage } from '../lib/exhaustion'
import { getAbilityModifier } from './dice'
import { RuleViolation } from './rules'
import { perceptionCheckContext } from './perception-checks'
import type { PerceptionSense } from '../lib/weather-state'
import { spatialWeaponRayForCell } from '../lib/spatial-weapon-resolution'

/** PHB2014 passive check: 10 + actual modifier, +/-5 for advantage or
 * disadvantage. This is not a d20 and must never spend prepared inspiration.
 * Sensory advantage/disadvantage requires an explicit established source;
 * hiding does not infer hearing/smell/visual mode from narrative words. */
export function passivePerceptionScore(actor: PlayerState | MonsterState, state: GameState = gs.getState(),
  advantage = false, disadvantage = false,perceptionSense?:PerceptionSense): number|null {
  const perception=perceptionCheckContext({skill:'perception',perceptionSense},actor.id,state)
  if(perception.automaticFailure)return null
  if(actor.conditions.includes('exhaustion')&&!state.dmTools?.exhaustion?.creatures[actor.id])
    throw new RuleViolation('EXHAUSTION_LEVEL_REQUIRED','A passive check also requires the authoritative exhaustion level; a legacy marker is not level zero.',{})
  const player = actor.id === 'player' ? actor as PlayerState : undefined
  const proficiency = player?.proficiencyBonus ?? 0
  const skillBonus = player?.expertise?.includes('perception') ? 2 * proficiency
    : player?.skillProficiencies?.includes('perception') ? proficiency
    : player?.features?.includes('jack_of_all_trades') ? Math.floor(proficiency / 2) : 0
  const native = 'type' in actor ? getMonsterRecord(actor.type)?.source.proficiencies as Array<{value:number;proficiency:{index:string}}> | undefined : undefined
  const modifier = native?.find(entry=>entry.proficiency.index==='skill-perception')?.value ?? getAbilityModifier(actor.stats.wis)+skillBonus
  const dis = Boolean(disadvantage ||perception.weatherDisadvantage|| exhaustionDisadvantage(state,actor.id,'check'))
  return 10 + modifier + (Boolean(advantage) === dis ? 0 : advantage ? 5 : -5)
}

// Straight grid ray; occupancy does not block sight, walls/closed doors do.
export function visibleCell(actor: PlayerState | MonsterState, cell: { x: number; y: number }, ignoredObjectId?: string): boolean {
  if (actor.conditions.some(c => ['blinded', 'unconscious', 'petrified'].includes(c))) return false
  const state = gs.getState()
  if(!ignoredObjectId&&spatialWeaponRayForCell(state,actor.id,cell))return true
  const view = ignoredObjectId && state.dmTools ? { ...state, dmTools: { ...state.dmTools,
    objects: Object.fromEntries(Object.entries(state.dmTools.objects).filter(([id]) => id !== ignoredObjectId)) } } : state
  const grid = navigationGrid(view, actor.id, engineGeometry(),{ignoreDoorKnowledge:true})
  const start = actor.position, count = Math.max(Math.abs(cell.x - start.x), Math.abs(cell.y - start.y))
  let previous = start
  for (let step = 1; step <= count; step++) {
    const next = { x: Math.round(start.x + (cell.x - start.x) * step / count), y: Math.round(start.y + (cell.y - start.y) * step / count) }
    if (!grid.step(previous, next, false, false)) return false
    previous = next
  }
  return true
}
export function canSee(actor: PlayerState | MonsterState, target: PlayerState | MonsterState): boolean {
  return creaturePerception(actor, target).canSee
}
export function frightenedByVisibleSource(entityId: string): boolean {
  const entity = gs.getEntity(entityId)
  return Boolean(entity?.conditions.includes('frightened') && gs.getState().monsterEffects?.some(effect => {
    const source = gs.getEntity(effect.sourceId)
    return effect.targetId === entityId && effect.conditions.includes('frightened') && source && canSee(entity, source)
  }))
}
