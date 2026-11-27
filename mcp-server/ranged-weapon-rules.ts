import { spatialWeaponResolution } from '../lib/spatial-weapon-resolution'
import { captureUnderwaterWeaponContext,assertHeldUnderwaterContext } from './underwater'
import type { UnderwaterAttackInput,UnderwaterWeaponContext } from '../lib/underwater-rules'
import type { MonsterState, PlayerState } from '../lib/types'
import * as gs from './game-state'
import { canSee } from './monster-perception'
import { weatherRangedWeaponContext } from '../lib/weather-state'
import { RuleViolation } from './rules'

type Actor = PlayerState | MonsterState
const friendlyToPlayer = (actor: Actor) => actor.id === 'player' || 'hostile' in actor && actor.hostile === false
const incapacitated = ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious']

/** PHB2014 p195: a different nearby hostile can interfere even when the
 * selected target is distant. Seeing the shooter and not being incapacitated
 * are both required; distance alone is never sufficient. */
export function nearbyRangedHostiles(shooter: Actor): string[] {
  return [gs.getPlayer(), ...Object.values(gs.getState().monsters)]
    .filter(other => other.id !== shooter.id && other.hp.current > 0
      && friendlyToPlayer(other) !== friendlyToPlayer(shooter)
      && !other.conditions.some(condition => incapacitated.includes(condition))
      && (spatialWeaponResolution(gs.getState(),shooter.id,other.id)?.distanceFeet??Math.max(Math.abs(other.position.x-shooter.position.x),Math.abs(other.position.y-shooter.position.y))*5)<=5
      && canSee(other, shooter))
    .map(other => other.id)
}

export interface RangedWeaponContext extends Partial<ReturnType<typeof weatherRangedWeaponContext>> {
  underwaterContext?:UnderwaterWeaponContext;
  normalRangeCells: number; longRangeCells: number; distanceCells: number
  rangeBand: 'normal' | 'long'; longRangeDisadvantage: boolean
  proximityDisadvantage: boolean; nearbyHostileIds: string[]
}
export function rangedWeaponContext(shooter: Actor, target: Actor, normalRangeCells: number, longRangeCells: number,weaponAttack=true,weapon?:Pick<UnderwaterAttackInput,'weaponReference'|'canonicalWeaponId'|'attackMode'>): RangedWeaponContext {
  const distance = (spatialWeaponResolution(gs.getState(),shooter.id,target.id)?.distanceFeet??Math.max(Math.abs(target.position.x-shooter.position.x),Math.abs(target.position.y-shooter.position.y))*5)/5
  const nearbyHostileIds = nearbyRangedHostiles(shooter)
  const underwaterContext=weapon?captureUnderwaterWeaponContext({...weapon,actorId:shooter.id,target:{kind:'creature',entityId:target.id},melee:false,weaponAttack,normalRangeCells,distanceCells:distance}):undefined
  return { normalRangeCells, longRangeCells, distanceCells: distance,...(underwaterContext?{underwaterContext}:{}),...(weaponAttack?weatherRangedWeaponContext(gs.getState(),shooter.id,target.id):{}),
    rangeBand: distance > normalRangeCells ? 'long' : 'normal', longRangeDisadvantage: distance > normalRangeCells,
    proximityDisadvantage: nearbyHostileIds.length > 0, nearbyHostileIds }
}
/** A7 held contexts have no weather fields. Preserve that unrecorded history;
 * never insert today's wind into an already held d20. New witnesses are exact. */
export function assertHeldWeaponWeather(context:RangedWeaponContext){
  if(context.underwaterContext)assertHeldUnderwaterContext(context.underwaterContext)
  const fields=['strongWindDisadvantage','weatherWitnesses','heightWitnesses','source'] as const
  if(!fields.some(key=>Object.hasOwn(context,key)))return
  if(typeof context.strongWindDisadvantage!=='boolean'||!Array.isArray(context.weatherWitnesses)||!Array.isArray(context.heightWitnesses)
    ||context.source!=='DMG2014 Strong Wind p110'
    ||context.weatherWitnesses.some(w=>!w||typeof w.key!=='string'||!w.key||!Number.isSafeInteger(w.revision)||w.revision<0||w.strongWind!==true)
    ||context.strongWindDisadvantage!==(context.weatherWitnesses.length>0)
    ||context.heightWitnesses.some(w=>!w||typeof w.entityId!=='string'||!w.entityId||typeof w.known!=='boolean'||typeof w.airborne!=='boolean'
      ||!(w.heightFeet===null?!w.known:typeof w.heightFeet==='number'&&Number.isFinite(w.heightFeet)&&w.heightFeet>=0)
      ||!Number.isSafeInteger(w.revision)||w.revision<0))
    throw new RuleViolation('WEATHER_HELD_WEAPON_CONTEXT_INVALID','The held weapon d20 must retain its exact original wind and height witnesses before any reaction die or cost.',{})
}
