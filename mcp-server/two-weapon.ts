import type { RoleplayBonus } from '../lib/types'
import type { TwoWeaponState, TwoWeaponWitness, WeaponAttackMode } from '../lib/two-weapon-state'
import { findWeapon } from '../lib/srd/weapons'
import { equipmentId, exactWeaponHand,selectedWeaponItem,weaponForReference,resolvePlayerWeaponUse } from './equipment'
import { toolkitState, toolkitError } from './toolkit'
import { available } from './hero-rules'
import { playerFinesseWeaponContext } from './weapon-properties'
import * as rules from './rules'
import * as gs from './game-state'

type Holder={twoWeapon?:TwoWeaponState}
const current=()=> (gs.getState().dmTools as Holder|undefined)?.twoWeapon
const data=()=> (toolkitState() as ReturnType<typeof toolkitState>&Holder).twoWeapon??={witnesses:{},receipts:{}}
export const twoWeaponTurnKey=()=>{const state=gs.getState();return `${state.combatGeneration??0}:${state.turnCounter??0}:${state.round}:${state.currentTurn??''}`}
function lightWeapon(itemId:string){
  const item=selectedWeaponItem(itemId),weapon=weaponForReference(itemId)
  return item&&weapon&&weapon.properties.includes('light')&&!weapon.properties.includes('ranged')&&!weapon.properties.includes('twoHanded')?{item,weapon}:undefined
}
/** Captured before a real Attack-action attack, and persisted with held dice. */
export function captureTwoWeaponWitness(primaryItemId:string,attackMode:WeaponAttackMode):TwoWeaponWitness|undefined{
  const selected=lightWeapon(primaryItemId),primaryReference=primaryItemId
  if(gs.getState().phase!=='combat'||gs.getState().currentTurn!=='player'||!selected)return undefined
  primaryItemId=selected.item.id
  const primaryHand=exactWeaponHand(primaryItemId),loadout=gs.getState().dmTools?.loadout
  if(!primaryHand||!loadout||loadout.shieldId)return undefined
  const otherHand=primaryHand==='mainHandId'?'offHandId':'mainHandId',otherItemId=loadout[otherHand]
  if(!otherItemId||otherItemId===primaryItemId||exactWeaponHand(otherItemId)!==otherHand)return undefined
  const references=[otherItemId,...Object.values(gs.getState().dmTools?.improvised?.rulings??{}).filter(r=>r.targetKind==='item'&&r.targetId===otherItemId).map(r=>r.referenceId)]
    .filter(reference=>Boolean(lightWeapon(reference)))
  if(!references.length)return undefined
  const turnKey=twoWeaponTurnKey()
  if(Object.values(current()?.witnesses??{}).filter(witness=>witness.turnKey===turnKey).length>=512)
    toolkitError('TWO_WEAPON_WITNESS_LIMIT','Too many Attack-action witnesses in this turn; no attack has rolled.')
  return {turnKey,primaryItemId,primaryHand,otherItemId,attackMode,
    ...(selected.weapon.improvised||references.some(ref=>ref!==otherItemId)?{primaryWeaponReference:primaryReference,otherWeaponReferences:references}:{})}
}
export function recordTwoWeaponWitness(primaryAttackId:string,witness:TwoWeaponWitness){
  const store=data()
  // Witnesses authorize this turn only. Durable bonus receipts are not pruned.
  store.witnesses=Object.fromEntries(Object.entries(store.witnesses).filter(([,value])=>value.turnKey===witness.turnKey))
  store.witnesses[primaryAttackId]=witness
  return {primaryAttackId,...witness}
}
export interface TwoWeaponCommand extends RoleplayBonus{attackId:string;primaryAttackId:string;weaponItemId:string;targetId:string;attackMode:WeaponAttackMode;weaponAbility?:'str'|'dex';nonlethal?:boolean;advantage?:boolean;disadvantage?:boolean;advantageReason?:string}
export interface TwoWeaponAttackContext{attackId:string;primaryAttackId:string;weaponItemId:string;turnKey:string;command:string}
function fingerprint(input:TwoWeaponCommand){return JSON.stringify({primaryAttackId:input.primaryAttackId,weaponItemId:input.weaponItemId,targetId:input.targetId,attackMode:input.attackMode,
  advantage:input.advantage??false,disadvantage:input.disadvantage??false,advantageReason:input.advantageReason??'',roleplayBonus:input.roleplayBonus??0,roleplayReason:input.roleplayReason??'',...(input.nonlethal?{nonlethal:true}:{}),...(input.weaponAbility!==undefined?{weaponAbility:input.weaponAbility}:{})})}
export function replayTwoWeaponAttack(input:TwoWeaponCommand):Record<string,unknown>|undefined{
  const old=current()?.receipts[input.attackId]
  if(!old)return undefined
  if(old.command!==fingerprint(input))toolkitError('TWO_WEAPON_EVENT_CONFLICT','This attackId already identifies different immutable attack choices.')
  if(old.status==='resolved')return {...old.result,alreadyResolved:true,attackId:input.attackId}
  const pending=gs.getState().hero?.pending
  const poisonResolution=pending?.command.toolkitResolution as {domain?:string;command?:{attackId?:string}}|undefined
  const poisonHits=gs.getState().dmTools?.basicPoison?.hits,poisonHitId=poisonResolution?.command?.attackId
  const poisonHit=poisonResolution?.domain==='basic-poison-hit'&&poisonHitId&&poisonHits&&Object.hasOwn(poisonHits,poisonHitId)?poisonHits[poisonHitId]:undefined
  const poisonBonus=poisonHit?.baseAttack.twoWeapon as {attackId?:string}|undefined
  const dmgResolution=pending?.command.toolkitResolution as{domain?:string;command?:{deliveryId?:string}}|undefined
  const dmgDelivery=dmgResolution?.domain==='player-poison-save'&&dmgResolution.command?.deliveryId?gs.getState().dmTools?.playerPoisons?.deliveries[dmgResolution.command.deliveryId]:undefined
  const dmgBonus=dmgDelivery?.baseAttack?.twoWeapon as{attackId?:string}|undefined
  if((pending?.command.twoWeapon as TwoWeaponAttackContext|undefined)?.attackId!==input.attackId&&!(poisonHit?.status==='pending'&&poisonBonus?.attackId===input.attackId)&&!(dmgDelivery?.status==='pending'&&dmgBonus?.attackId===input.attackId))
    toolkitError('TWO_WEAPON_PENDING_MISSING','The held attack receipt has no matching reaction; no die is rerolled.')
  return {alreadyPending:true,attackId:input.attackId,pendingReaction:pending}
}
export function prepareTwoWeaponAttack(input:TwoWeaponCommand):TwoWeaponAttackContext{
  available()
  if(gs.getState().phase!=='combat')toolkitError('TWO_WEAPON_COMBAT_REQUIRED','The bonus attack requires a real Attack action in this combat turn.')
  rules.validateBonusActionUse('player')
  if((input.advantage||input.disadvantage)&&!input.advantageReason?.trim())toolkitError('ADVANTAGE_REASON_REQUIRED','An explicitly selected advantage/disadvantage needs its established source reason.')
  const witness=current()?.witnesses[input.primaryAttackId],turnKey=twoWeaponTurnKey()
  if(!witness||witness.turnKey!==turnKey)toolkitError('TWO_WEAPON_ATTACK_REQUIRED','Choose an exact qualifying Attack-action witness from this player turn.')
  const selected=lightWeapon(input.weaponItemId)
  if(!selected||witness!.otherItemId!==selected.item.id||witness!.primaryItemId===selected.item.id
    ||(witness!.otherWeaponReferences?!witness!.otherWeaponReferences.includes(input.weaponItemId):Boolean(selected.weapon.improvised)))
    toolkitError('TWO_WEAPON_OTHER_REQUIRED','Choose the different physical light weapon held in the other hand during the triggering attack.')
  const otherHand=witness!.primaryHand==='mainHandId'?'offHandId':'mainHandId'
  if(exactWeaponHand(selected!.item.id)!==otherHand)toolkitError('TWO_WEAPON_NOT_HELD','The exact other light melee weapon must still be held in its established other hand.')
  resolvePlayerWeaponUse(selected!.weapon,selected!.item,1,input.attackMode)
  if(input.attackMode==='thrown'&&!selected!.weapon.properties.includes('thrown'))toolkitError('WEAPON_NOT_THROWABLE','This light melee weapon does not have the thrown property.')
  playerFinesseWeaponContext(selected!.weapon,input.weaponAbility)
  if(Object.keys(current()?.receipts??{}).length>=256)toolkitError('TWO_WEAPON_RECEIPT_LIMIT','256 bonus-attack receipts reached; none are erased to replay an old attack.')
  const command=fingerprint(input)
  if(command.length>3000)toolkitError('TWO_WEAPON_ARGUMENTS_TOO_LONG','The immutable mechanical choices exceed the bounded receipt size; no attack has rolled.')
  return {attackId:input.attackId,primaryAttackId:input.primaryAttackId,weaponItemId:input.weaponItemId,turnKey,command}
}
/** Called only after an actual valid d20, before optional held reactions. */
export function commitTwoWeaponAttack(context:TwoWeaponAttackContext){
  const store=data(),old=store.receipts[context.attackId]
  if(!old){store.receipts[context.attackId]={command:context.command,turnKey:context.turnKey,primaryAttackId:context.primaryAttackId,weaponItemId:context.weaponItemId,status:'pending'};gs.markBonusActionUsed('player')}
}
export function finishTwoWeaponAttack(context:TwoWeaponAttackContext,result:Record<string,unknown>){
  const receipt=data().receipts[context.attackId]
  receipt.status='resolved';receipt.result=result
}
