import type { GameState } from './types'
import { findWeapon } from './srd/weapons'
import { ARMOR_RULES } from './srd/equipment'
import { locomotionHands } from './locomotion-state'
import { activePhysicalLoad } from './physical-handling-state'

/** One authoritative read-only hand count for equipment, handling and S/M
 * components. Holding a two-handed weapon takes one hand until its attack. */
export function playerHandOccupancy(state:GameState,options:{ignoreLocomotion?:boolean}={}){
  const inventory=state.player.inventory,id=(item:typeof inventory[number])=>item.equipmentId??item.id
  const loadout=state.dmTools?.loadout??{
    mainHandId:inventory.find(item=>item.type==='weapon'&&findWeapon(id(item)))?.id,
    shieldId:inventory.find(item=>ARMOR_RULES[id(item)]?.category==='shield')?.id,offHandId:undefined,
  }
  const selected=[loadout.mainHandId,loadout.offHandId,loadout.shieldId].filter((value):value is string=>Boolean(value)),held=new Set(selected)
  const now=state.worldTimeSeconds??0
  const grapples=state.hero?.effects.filter(effect=>effect.kind==='grapple'&&effect.sourceId==='player'&&effect.expiresAt>now)??[]
  const load=activePhysicalLoad(state),alreadyCounted=load?.grappleEffectId&&grapples.some(effect=>effect.id===load.grappleEffectId)?1:0
  const handlingHands=load?Math.max(0,load.hands-alreadyCounted):0
  const occupied=held.size+grapples.length+handlingHands+(options.ignoreLocomotion?0:locomotionHands(state,'player'))
  const constraints=(state.dmTools as {spellComponents?:{constraints:Record<string,{targetId:string;kind:string}>}}|undefined)?.spellComponents?.constraints
  const bound=Object.values(constraints??{}).some(value=>value.targetId==='player'&&value.kind==='hands-bound')
  const invalid=held.size!==selected.length||[...held].some(value=>!inventory.some(item=>item.id===value))
    ||Boolean(loadout.shieldId&&loadout.offHandId)||occupied>2
  return {held,free:bound||invalid?0:Math.max(0,2-occupied),bound,invalid,occupied,handlingHands}
}
