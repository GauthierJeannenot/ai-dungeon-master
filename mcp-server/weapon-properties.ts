import { attackAbilityFor,type WeaponSpec } from '../lib/srd/weapons'
import { CarryingSizeSchema, carryingStateOf, type CarryingSize } from '../lib/carrying-state'
import { toolkitError } from './toolkit'
import * as gs from './game-state'
import type { DiceRollResult } from '../lib/types'
import { rollDice } from './dice'
import { getAbilityModifier } from './dice'

export interface FinesseWeaponContext {weaponId:string;ability:'str'|'dex';modifier:number;selection:'explicit_finesse_choice'|'compatibility_higher_ability'}
export function playerFinesseWeaponContext(weapon:WeaponSpec,requested?:'str'|'dex',held?:unknown):FinesseWeaponContext|undefined {
  if(requested!==undefined&&(!['str','dex'].includes(requested)||!weapon.properties.includes('finesse')))toolkitError('FINESSE_WEAPON_REQUIRED','Choose weaponAbility only for an actual finesse weapon; it grants no new ability option to another attack.')
  if(!weapon.properties.includes('finesse'))return undefined
  if(held!==undefined){
    const context=held as Partial<FinesseWeaponContext>
    if(!context||context.weaponId!==weapon.id||!['str','dex'].includes(context.ability??'')||!Number.isSafeInteger(context.modifier)||context.modifier! < -5||context.modifier! > 10
      ||!['explicit_finesse_choice','compatibility_higher_ability'].includes(context.selection??'')||requested!==undefined&&requested!==context.ability)
      toolkitError('FINESSE_HELD_CONTEXT_INVALID','The held attack must retain its original exact finesse ability, modifier and selection witness.')
    return context as FinesseWeaponContext
  }
  const stats=gs.getPlayer().stats,ability=(requested??attackAbilityFor(weapon,stats)) as 'str'|'dex'
  return {weaponId:weapon.id,ability,modifier:getAbilityModifier(stats[ability]),selection:requested?'explicit_finesse_choice':'compatibility_higher_ability'}
}

export interface LanceWeaponContext {weaponId:'lance';distanceCells:number;disadvantage:boolean;mounted:false;source:'phb2014_special_lance_unmounted_scope'}
/** No mounted state or mount is manufactured. The current engine supports
 * only the published unmounted two-hand lance procedure. */
export function playerLanceWeaponContext(weapon:WeaponSpec,distanceCells:number,held?:unknown):LanceWeaponContext|undefined {
  if(weapon.special!=='lance')return undefined
  if(held!==undefined){
    const context=held as Partial<LanceWeaponContext>
    if(context.weaponId!=='lance'||context.mounted!==false||context.source!=='phb2014_special_lance_unmounted_scope'
      ||!Number.isInteger(context.distanceCells)||context.distanceCells!<0||context.disadvantage!==(context.distanceCells!<=1))
      toolkitError('LANCE_HELD_CONTEXT_INVALID','The held lance attack must retain its original distance/disadvantage and real unmounted scope.')
    return context as LanceWeaponContext
  }
  return {weaponId:'lance',distanceCells,disadvantage:distanceCells<=1,mounted:false,source:'phb2014_special_lance_unmounted_scope'}
}
/** A fixed weapon value is not a die, including on a critical hit. */
export function rollWeaponDamage(base:string,modifier:number,critical=false):DiceRollResult {
  if(/^\d+$/.test(base)){
    const value=Number(base),notation=`${base}${modifier>=0?'+':''}${modifier}`
    return {notation,rolls:[],modifier,total:value+modifier,detail:`${notation} = ${value+modifier} (dégâts fixes, aucun dé)`}
  }
  const dice=critical?base.replace(/^(\d*)d(\d+)/,(_,n,s)=>`${Number(n||1)*2}d${s}`):base
  return rollDice(`${dice}${modifier>=0?'+':''}${modifier}`)
}

export interface HeavyWeaponContext {
  weaponId:string;size:CarryingSize;disadvantage:boolean;
  sizeSource:'explicit_mj_physical_fact';source:string;reason:string;
}
/** PHB2014 Heavy applies to the actual attack, never simple holding. A fixed
 * class, a portrait and an untracked legacy state do not establish actor size. */
export function playerHeavyWeaponContext(weapon:WeaponSpec,held?:unknown):HeavyWeaponContext|undefined {
  if(!(weapon.properties as readonly string[]).includes('heavy'))return undefined
  if(held!==undefined) {
    const context=held as Partial<HeavyWeaponContext>,parsed=CarryingSizeSchema.safeParse(context?.size)
    if(!context||context.weaponId!==weapon.id||!parsed.success||context.sizeSource!=='explicit_mj_physical_fact'
      ||typeof context.source!=='string'||!context.source||typeof context.reason!=='string'||!context.reason
      ||context.disadvantage!==['Tiny','Small'].includes(parsed.data))
      toolkitError('HEAVY_HELD_CONTEXT_INVALID','The held heavy-weapon d20 requires its original exact sourced actor-size context; no size or disadvantage is reconstructed.')
    return context as HeavyWeaponContext
  }
  const fact=carryingStateOf(gs.getState())?.actors.player
  if(!fact||fact.entityId!=='player'||!CarryingSizeSchema.safeParse(fact.size).success)
    toolkitError('WEAPON_SIZE_REQUIRED','A Heavy attack needs the actual sourced player size from set_carrying_context; Medium is not assumed from a name, class, race or image.')
  return {weaponId:weapon.id,size:fact.size,disadvantage:['Tiny','Small'].includes(fact.size),
    sizeSource:'explicit_mj_physical_fact',source:fact.source,reason:fact.reason}
}
