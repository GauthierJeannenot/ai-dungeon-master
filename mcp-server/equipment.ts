import { swallowedBy } from '../lib/swallow-state'
import { ARMOR_RULES } from '../lib/srd/equipment'
import { reconcileSpellbooks } from './spellbooks'
import { findWeapon, type WeaponSpec, type WeaponHands } from '../lib/srd/weapons'
import type { Item } from '../lib/types'
import * as gs from './game-state'
import { getAbilityModifier } from './dice'
import { effects, addHeroEffect, feature } from './hero-rules'
import { toolkitState, toolkitError } from './toolkit'
import * as rules from './rules'
import { reconcileMagicItems } from './magic-items'
import { reconcileCasting } from './casting'
import { reconcileWeatherInventory } from './weather'
import type { WeaponAttackMode } from '../lib/two-weapon-state'
import { playerHandOccupancy } from '../lib/hand-occupancy'
import { improvisedProfile,improvisedRuling } from '../lib/improvised-state'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { groundGearContainerTransfer } from '../lib/ground-gear-containers'
import { validateImprovisedReference } from './improvised'

export const equipmentId = (item: Item) => item.equipmentId ?? item.id
export function weaponForReference(reference: string) {
  const ruling=improvisedProfile(gs.getState(),reference);if(ruling)return ruling
  const exact=gs.getPlayer().inventory.find(item=>item.id===reference&&item.type==='weapon')
  return findWeapon(exact?equipmentId(exact):reference)
}
export function selectedWeaponItem(reference: string) {
  const ruling=improvisedRuling(gs.getState(),reference)
  if(ruling){
    if(ruling.targetKind==='item')return gs.getPlayer().inventory.find(item=>item.id===ruling.targetId)
    const state=gs.getState(),physical=ruling.targetKind==='corpse'?state.monsters[ruling.targetId]:state.dmTools?.objects[ruling.targetId]
    return physical?{id:ruling.targetId,name:physical.name,type:'misc' as const}:undefined
  }
  const inventory=gs.getPlayer().inventory,exact=inventory.find(item=>item.id===reference&&item.type==='weapon')
  if(exact)return exact
  const weapon=weaponForReference(reference)
  if(!weapon||weapon.id==='unarmed')return undefined
  const candidates=inventory.filter(item=>item.type==='weapon'&&findWeapon(equipmentId(item))?.id===weapon.id)
  const loadout=gs.getState().dmTools?.loadout
  const held=loadout?candidates.filter(item=>[loadout.mainHandId,loadout.offHandId].includes(item.id)):candidates
  if(held.length>1||!held.length&&candidates.length>1)toolkitError('AMBIGUOUS_WEAPON_ITEM','Choose the exact physical weapon item ID; several copies match.')
  return held[0]??candidates[0]
}
export function weaponItemHeld(item: Item) {
  const loadout=gs.getState().dmTools?.loadout
  if(!loadout)return !gs.getState().dmTools?.magicItems?.[item.id]
  return [loadout.mainHandId,loadout.offHandId,loadout.shieldId].includes(item.id)||activePhysicalLoad(gs.getState())?.targetId===item.id
}
/** Exact hand information requires an explicitly established loadout. Legacy
 * ownership alone cannot prove two different hands for PHB two-weapon combat. */
export function exactWeaponHand(itemId:string):'mainHandId'|'offHandId'|undefined {
  const loadout=gs.getState().dmTools?.loadout
  if(!loadout)return undefined
  if(loadout.mainHandId===itemId&&loadout.offHandId!==itemId)return 'mainHandId'
  if(loadout.offHandId===itemId&&loadout.mainHandId!==itemId&&!loadout.shieldId)return 'offHandId'
  return undefined
}
export function weaponAttackRangeCells(weapon:NonNullable<ReturnType<typeof findWeapon>>,mode:WeaponAttackMode='melee'){
  if(mode==='thrown'){
    if(!weapon.properties.includes('thrown'))toolkitError('WEAPON_NOT_THROWABLE','The selected weapon cannot use the explicit thrown mode.')
    const longRange=weapon.longRangeCells
    if(!longRange)toolkitError('WEAPON_THROW_RANGE_UNSUPPORTED','This registry weapon has no sourced implemented long thrown range.')
    return longRange
  }
  if(weapon.properties.includes('ranged')){
    if(!weapon.longRangeCells||!weapon.normalRangeCells)toolkitError('WEAPON_RANGE_UNSUPPORTED','This ranged weapon has no published normal and long ranges in the active registry.')
    return weapon.longRangeCells!
  }
  return weapon.reachCells??1
}
export function inferredLoadout() {
  const player = gs.getPlayer(), inventory = player.inventory
  return { armorId: inventory.find(item => item.type === 'armor' && ARMOR_RULES[equipmentId(item)]?.category !== 'shield' && ARMOR_RULES[equipmentId(item)])?.id,
    shieldId: inventory.find(item => ARMOR_RULES[equipmentId(item)]?.category === 'shield')?.id,
    mainHandId: inventory.find(item => item.type === 'weapon' && findWeapon(equipmentId(item)))?.id,
    offHandId: undefined as string | undefined, unarmoredAC: 10 + getAbilityModifier(player.stats.dex) }
}
export function currentLoadout() { return gs.getState().dmTools?.loadout ?? inferredLoadout() }
export function initializeLoadout() { return toolkitState().loadout ??= inferredLoadout() }
export function syncEquipmentAC() {
  const loadout = gs.getState().dmTools?.loadout
  if (!loadout) return
  const player = gs.getPlayer(), armor = player.inventory.find(item => item.id === loadout.armorId)
  const rule = armor ? ARMOR_RULES[equipmentId(armor)] : undefined, dex = getAbilityModifier(player.stats.dex)
  player.ac = (rule ? rule.ac + (rule.dex === 'full' ? dex : rule.dex === 'two' ? Math.min(2, dex) : 0) : loadout.unarmoredAC)
    + (loadout.shieldId && player.inventory.some(item => item.id === loadout.shieldId) ? 2 : 0)
}
export function weaponHeld(id: string) {
  const ruling=improvisedRuling(gs.getState(),id)
  if(ruling){const item=selectedWeaponItem(id);return Boolean(item&&weaponItemHeld(item))}
  const loadout = gs.getState().dmTools?.loadout
  if (!loadout) return true // Existing sessions retain their pre-loadout behavior.
  if (id === 'unarmed') return true // A PHB unarmed strike may be a kick/head-butt.
  return [loadout.mainHandId, loadout.offHandId].some(held => {
    const item = gs.getPlayer().inventory.find(item => item.id === held)
    return item && findWeapon(equipmentId(item))?.id === id
  })
}
export function freeHands() {
  return playerHandOccupancy(gs.getState()).free
}
export function duelingApplies(weapon: NonNullable<ReturnType<typeof findWeapon>>, hands:WeaponHands=1) {
  if(hands!==1||!feature('dueling')||weapon.id==='unarmed'||weapon.properties.includes('twoHanded')||weapon.properties.includes('ranged'))return false
  const loadout=currentLoadout()
  if(loadout.mainHandId&&loadout.mainHandId===loadout.offHandId)return false
  const heldIds=new Set([loadout.mainHandId,loadout.offHandId,...(weapon.improvised?.targetId===loadout.shieldId?[loadout.shieldId]:[])].filter(Boolean))
  const heldWeapons=gs.getPlayer().inventory.filter(item=>{
    const held=heldIds.has(item.id)?item.id===weapon.improvised?.targetId?weapon:item.type==='weapon'?findWeapon(equipmentId(item)):undefined:undefined
    return held&&held.id!=='unarmed'
  })
  const loadWeapon=Boolean(weapon.improvised&&weapon.improvised.targetKind!=='item'&&activePhysicalLoad(gs.getState())?.targetId===weapon.improvised.targetId)
  // Count physical weapons in both hands. The sole weapon may itself be in
  // the off hand; a shield or a carried/stowed spare is not another weapon.
  return heldWeapons.length+Number(loadWeapon)===1&&(loadWeapon||heldWeapons[0].id===weapon.improvised?.targetId||findWeapon(equipmentId(heldWeapons[0]))?.id===weapon.id)
}
/** Per-attack PHB 2014 grip, never a persistent stance or an inventory change.
 * The selected object occupies one slot while held; its other attacking hand
 * must actually be free of an item, shield or ongoing grapple. */
export function resolvePlayerWeaponUse(weapon:WeaponSpec,item:Item|undefined,requested?:WeaponHands,mode:WeaponAttackMode='melee'):{hands?:WeaponHands;damageDie:string} {
  if(item&&gs.getState().dmTools?.groundGear?.stocks[item.id]){const transfer=groundGearContainerTransfer(gs.getState(),item.id,'drop');if(transfer.issue)toolkitError(transfer.issue.code,transfer.issue.message)}
  if(weapon.improvised)validateImprovisedReference(weapon.id)
  if(weapon.improvised&&weapon.improvised.targetKind!=='item'){
    const load=activePhysicalLoad(gs.getState()),ruling=improvisedRuling(gs.getState(),weapon.id)
    if(!load||load.targetId!==weapon.improvised.targetId||load.operation!=='carry'||load.control!=='inanimate'||!ruling)
      toolkitError('IMPROVISED_LOAD_NOT_HELD','The exact real inanimate load must still be carried before the strike.')
    const hands=requested??ruling!.hands
    if(hands!==load!.hands||hands!==ruling!.hands||weapon.properties.includes('twoHanded')&&hands!==2)
      toolkitError('IMPROVISED_HANDS_REQUIRED','Use the actual already assigned load grip; no additional free hand or grip is invented.')
    return {hands,damageDie:hands===2&&weapon.versatileDamageDie?weapon.versatileDamageDie:weapon.damageDie}
  }
  if(weapon.id==='unarmed') {
    if(requested!==undefined)toolkitError('WEAPON_HANDS_NOT_APPLICABLE','Omit weaponHands on an unarmed strike; it does not select a held weapon or a number of free hands.')
    return {damageDie:weapon.damageDie}
  }
  const mandatory=weapon.properties.includes('twoHanded')||weapon.special==='lance',versatile=weapon.properties.includes('versatile')
  const hands=requested??(mandatory?2:1)
  if(hands!==1&&hands!==2)toolkitError('WEAPON_HANDS_INVALID','Choose weaponHands 1 or 2 for the real weapon attack.')
  if(mandatory&&hands!==2)toolkitError('TWO_HANDS_REQUIRED','This weapon requires two hands for its attack.')
  if(hands===2&&!mandatory&&(!versatile||mode!=='melee'||weapon.properties.includes('ranged')))
    toolkitError('WEAPON_HANDS_UNSUPPORTED','Two-handed use requires the actual Two-Handed property or a versatile melee attack.')
  if(hands===2) {
    const loadout=currentLoadout()
    if(!item||![loadout.mainHandId,loadout.offHandId].includes(item.id))
      toolkitError('WEAPON_NOT_EQUIPPED','The exact selected two-handed attack weapon must actually be held.')
    if(freeHands()<1)toolkitError('TWO_HANDS_REQUIRED','Free the other hand from its object, shield or grapple before attacking with two hands.')
  }
  if(hands===2&&versatile&&!weapon.versatileDamageDie)
    toolkitError('VERSATILE_DAMAGE_UNSUPPORTED','This weapon has no sourced two-handed melee damage value.')
  return {hands,damageDie:hands===2&&versatile?weapon.versatileDamageDie!:weapon.damageDie}
}
export function spendObjectInteraction() {
  if (gs.getState().phase !== 'combat') return
  rules.validateFreeCombatAction('player')
  if (effects('object-interaction', 'player').length) {
    rules.validateActionUse('player'); rules.recordAction('player')
  } else addHeroEffect('object-interaction', 'player', ['player'], 12, { untilStartOf: 'player' })
}
export function assertCanDrop(itemId: string) {
  if(swallowedBy(gs.getState(),'player'))toolkitError('SWALLOW_INTERNAL_ITEM_PLACEMENT_REQUIRED','No interior item placement or exterior drop is inferred through the actual containing body.')
  const transfer=groundGearContainerTransfer(gs.getState(),itemId,'drop');if(transfer.issue)toolkitError(transfer.issue.code,transfer.issue.message)
  const loadout = gs.getState().dmTools?.loadout
  if (loadout && [loadout.armorId, loadout.shieldId].includes(itemId)) toolkitError('ITEM_EQUIPPED', 'Doff the worn armor or shield explicitly before dropping it.')
}
export function afterInventoryChange() {
  reconcileSpellbooks()
  reconcileMagicItems()
  const loadout = gs.getState().dmTools?.loadout
  if (!loadout) {reconcileCasting();reconcileWeatherInventory();return}
  for (const slot of ['mainHandId', 'offHandId', 'armorId', 'shieldId'] as const)
    if (loadout[slot] && !gs.getPlayer().inventory.some(item => item.id === loadout[slot])) delete loadout[slot]
  syncEquipmentAC()
  reconcileCasting()
  reconcileWeatherInventory()
}

/** PHB2014 Unconscious: release actual held objects, without an interaction or
 * drawing another carried weapon. Worn armor/shields are not loose hand items.
 * Initializing the legacy hand projection once preserves empty hands on wake. */
export function dropUnconsciousHeldItems() {
  const player = gs.getPlayer(), loadout = initializeLoadout()
  const worn = new Set([loadout.armorId, loadout.shieldId].filter(Boolean))
  const held = [...new Set([loadout.mainHandId, loadout.offHandId].filter((id): id is string => Boolean(id)))]
  const dropped = []
  for (const id of held) {
    if (worn.has(id) || !player.inventory.some(item => item.id === id)) continue
    dropped.push(gs.dropPlayerItem(id))
  }
  // Only real hand slots are released; no carried spare is selected in their
  // place. A malformed duplicate of a worn shield is cleared without doffing.
  delete loadout.mainHandId
  delete loadout.offHandId
  if (dropped.length) afterInventoryChange()
  return dropped
}
