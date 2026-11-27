import { assertGreaterBrewingIdAvailable } from './toolkit'
import { activeBasicPoison,basicPoisonKey,validBasicPoisonWitness,type BasicPoisonWitness } from '../lib/basic-poison-state'
import type { Item } from '../lib/types'
import { available,now,advanceHeroTime } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { equipmentId,selectedWeaponItem,weaponForReference,weaponItemHeld,freeHands,afterInventoryChange } from './equipment'
import { validateImprovisedReference } from './improvised'
import { ammunitionState } from './ammunition'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { activePlayerPoison } from '../lib/player-poison-state'
import { toolkitState,toolkitError } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'
export const BASIC_POISON_SOURCE='PHB2014 Adventuring Gear, Poison Basic, supplied book line4307; table4217:100gp, mass not specified.'
export interface CoatBasicPoisonInput{eventId:string;vialItemId:string;weaponReference?:string;
  ammunitionTargets?:{ammunitionItemId?:string;quantity?:number;loadedHostItemId?:string}[]}
const store=()=>toolkitState().basicPoison??={version:1 as const,coatings:{},applications:{},hits:{}}
const entry=<T>(map:Record<string,T>|undefined,id:string)=>map&&Object.hasOwn(map,id)?map[id]:undefined
export function coatBasicPoison(input:CoatBasicPoisonInput){
  const state=gs.getState(),command=JSON.stringify(input),old=entry(state.dmTools?.basicPoison?.applications,input.eventId)
  if(old){if(old.command!==command)toolkitError('BASIC_POISON_EVENT_CONFLICT','This retained event has different exact vial, weapon or projectile selections.');return{...old.result,replayed:true}}
  available();rules.validateActionUse('player')
  if(state.phase==='combat'&&state.hero!.actionCredits<=0)toolkitError('ACTION_ALREADY_USED','Applying Basic Poison requires one real complete action; a remaining weapon attack cannot pay for it.')
  if(freeHands()<1)toolkitError('BASIC_POISON_FREE_HAND_REQUIRED','Free one actual hand for the vial and its application; a shield, grapple or physical load cannot supply an invented hand.')
  const vial=state.player.inventory.find(item=>item.id===input.vialItemId)
  if(!vial||vial.type!=='misc'||vial.ammunitionType||equipmentId(vial)!=='basic_poison_vial'||vial.quantity!==undefined&&vial.quantity!==1)
    toolkitError('BASIC_POISON_REAL_DOSE_REQUIRED','Choose one exact owned basic_poison_vial physical dose, not a kit, text, potion or uncounted multi-vial stack.')
  if(Object.values(state.dmTools?.basicPoison?.applications??{}).some(record=>record.vialItemId===vial!.id))
    toolkitError('BASIC_POISON_DOSE_ALREADY_SPENT','This physical vial identity already supplied its one actual dose; another event or restored object cannot refill it.')
  if(Boolean(input.weaponReference)===Boolean(input.ammunitionTargets))toolkitError('BASIC_POISON_SELECTION_REQUIRED','Choose one actual slashing/piercing weapon OR one to three explicit real ammunition units.')
  if(input.weaponReference){const weapon=weaponForReference(input.weaponReference),item=selectedWeaponItem(input.weaponReference);if(weapon&&item&&activePlayerPoison(state,basicPoisonKey('weapon',item.id,weapon.improvised?.targetKind??'item')))toolkitError('PLAYER_POISON_SURFACE_OCCUPIED','This actual surface already has a potent DMG dose; do not silently mix, replace or spread it with Basic Poison.')}
  if(Object.keys(state.dmTools?.basicPoison?.applications??{}).length>=128)toolkitError('BASIC_POISON_APPLICATION_LIMIT','128 retained applications reached; no old dose history is evicted.')
  const keys:string[]=[],derived:Item[]=[],subtract:{item:Item;quantity:number}[]=[],loadedHosts:string[]=[]
  if(input.weaponReference){
    const weapon=weaponForReference(input.weaponReference),item=selectedWeaponItem(input.weaponReference)
    if(!weapon||!item||!weaponItemHeld(item))toolkitError('BASIC_POISON_WEAPON_NOT_HELD','Choose the exact actually held physical weapon or explicit improvised reference.')
    if(item!.id===vial!.id)toolkitError('BASIC_POISON_TARGET_IS_DOSE','The same consumed physical dose cannot also remain as a distinct coated weapon.')
    if(weapon!.properties.includes('ammunition'))toolkitError('BASIC_POISON_LAUNCHER_NOT_PROJECTILE','Coating a launcher does not coat its ammunition. Choose actual projectile units or a genuinely striking slashing/piercing surface reference.')
    if(!weapon!.damageType||!['slashing','piercing'].includes(weapon!.damageType))toolkitError('BASIC_POISON_WEAPON_TYPE_REQUIRED','The actual weapon surface must be slashing or piercing; no edge or poison damage is invented.')
    if(weapon!.improvised)validateImprovisedReference(input.weaponReference)
    keys.push(basicPoisonKey('weapon',item!.id,weapon!.improvised?.targetKind??'item'))
  }else{
    let quantity=0
    const selected=new Set<string>()
    for(const [index,choice] of input.ammunitionTargets!.entries()){
      if(Boolean(choice.ammunitionItemId)===Boolean(choice.loadedHostItemId))toolkitError('BASIC_POISON_AMMUNITION_SELECTION','Choose one real stack plus count OR one actually reserved loaded projectile, never both.')
      if(choice.loadedHostItemId){
        if(activePlayerPoison(state,basicPoisonKey('loaded_projectile',choice.loadedHostItemId)))toolkitError('PLAYER_POISON_SURFACE_OCCUPIED','The actual reserved projectile already has a potent DMG dose; resolve its delivery/washing before another coating.')
        if(choice.quantity!==undefined)toolkitError('BASIC_POISON_LOADED_UNIT_COUNT','A reserved loaded projectile is exactly one physical unit; do not infer another count.')
        const host=state.player.inventory.find(item=>item.id===choice.loadedHostItemId),load=entry(state.dmTools?.improvised?.loads,choice.loadedHostItemId)
        if(!host||!load||equipmentId(host)!=='sling'||!weaponItemHeld(host))toolkitError('BASIC_POISON_LOADED_PROJECTILE_REQUIRED','Select the exact real held sling that already reserves this one physical projectile; no load or unit is created.')
        const key=basicPoisonKey('loaded_projectile',host!.id)
        if(selected.has(key))toolkitError('BASIC_POISON_TARGET_DUPLICATE','Do not count the same reserved physical unit twice.')
        selected.add(key);quantity++;keys.push(key);loadedHosts.push(host!.id)
      }else{
        if(choice.ammunitionItemId&&activePlayerPoison(state,basicPoisonKey('ammunition',choice.ammunitionItemId)))toolkitError('PLAYER_POISON_SURFACE_OCCUPIED','This actual projectile already has a potent DMG dose; another Basic Poison vial cannot discard or spread it by splitting.')
        const item=state.player.inventory.find(item=>item.id===choice.ammunitionItemId),count=choice.quantity
        if(!item||!item.ammunitionType||!Number.isSafeInteger(item.quantity)||!Number.isSafeInteger(count)||count!<1||item.quantity!<count!)
          toolkitError('BASIC_POISON_ACTUAL_AMMUNITION_REQUIRED','Select sufficient actual counted owned ammunition units; no stack, dose or projectile is inferred.')
        if(item!.adamantine||state.dmTools?.adamantine?.instances[item!.id])toolkitError('ADAMANTINE_PROJECTILE_SPLIT_UNSUPPORTED','This coating procedure cannot split the exact retained material batch into new identities; no action, dose, payment or source material is changed. Existing one-unit coating procedures that preserve identity are separate; this procedure cannot split material.');
        if(selected.has(item!.id))toolkitError('BASIC_POISON_TARGET_DUPLICATE','Select each real stack once with its complete explicit count.')
        selected.add(item!.id);quantity+=count!
        const id=`poison:${input.eventId}:${index}`
        assertGreaterBrewingIdAvailable(id)
        if(state.player.inventory.some(value=>value.id===id)||state.droppedItems?.[id]||Object.hasOwn(state.dmTools?.ammunition?.prepared??{},id)||gs.getEntity(id)||gs.getNpc(id)||Object.hasOwn(state.dmTools?.objects??{},id))
          toolkitError('BASIC_POISON_PROJECTILE_ID_CONFLICT','The derived physical identity already exists or was used; another dose cannot recreate it.')
        derived.push({...item!,id,quantity:count!});subtract.push({item:item!,quantity:count!});keys.push(basicPoisonKey('ammunition',id))
      }
    }
    if(quantity<1||quantity>3)toolkitError('BASIC_POISON_UP_TO_THREE_REQUIRED','One actual vial coats one to three real projectile units in total, including any actually loaded unit.')
    if(Object.keys(state.dmTools?.ammunition?.prepared??{}).length+derived.length>128)toolkitError('AMMUNITION_STACK_LIMIT','No retained physical identity slot remains for the separated coated units.')
  }
  const seconds=state.phase==='combat'?0:6
  if(new Set([...Object.keys(state.dmTools?.basicPoison?.coatings??{}),...keys]).size>512)toolkitError('BASIC_POISON_COATING_LIMIT','No retained coating identity slot remains before action, time or dose consumption.')
  const activityIssue=breathingActivityIssue(state,'player',seconds)
  if(activityIssue)toolkitError(activityIssue.code,activityIssue.message)
  assertGameTimeAdvance(seconds)
  if(seconds)advanceHeroTime(seconds)
  const appliedAt=now(),expiresAt=appliedAt+60,targets=keys.map(targetKey=>({applicationId:input.eventId,targetKey,appliedAt,expiresAt}))
  // All exact resources and unsupported states were validated before time,
  // action, dose, stack identity or coating changes.
  gs.consumePlayerItem(item=>item.id===vial!.id)
  for(const value of subtract)value.item.quantity!-=value.quantity
  state.player.inventory.push(...derived)
  for(const item of derived)ammunitionState().prepared[item.id]={itemId:item.id,creation:JSON.stringify({operation:'actual_basic_poison_coating',applicationId:input.eventId,quantity:item.quantity,ammunitionType:item.ammunitionType,silvered:Boolean(item.silvered)})}
  for(const witness of targets)store().coatings[witness.targetKey]=witness
  for(const id of loadedHosts){const witness=targets.find(value=>value.targetKey===basicPoisonKey('loaded_projectile',id))!;state.dmTools!.improvised!.loads[id].projectile.basicPoison=witness}
  if(state.phase==='combat')rules.recordAction('player')
  afterInventoryChange()
  const result={success:true,replayed:false,eventId:input.eventId,vialItemId:vial!.id,consumedDose:true,actionSpent:state.phase==='combat',seconds,
    appliedAt,expiresAt,targets,...(derived.length?{ammunition:derived}:{}),source:BASIC_POISON_SOURCE,
    interpretation:'Outside combat, six real seconds represent the application action as an announced engine convention, not a published universal action duration. Potency starts after application and lasts60seconds. Each hit uses CONDC10/1d4poison without adding poisoned, multiplying on critical hits or inventing first-hit depletion.'}
  store().applications[input.eventId]={command,vialItemId:vial!.id,appliedAt,expiresAt,targets,result:structuredClone(result)}
  return result
}
export function basicPoisonOnStack(itemId:string){return activeBasicPoison(gs.getState(),basicPoisonKey('ammunition',itemId))}
export function retainedBasicPoison(raw:unknown){
  if(!validBasicPoisonWitness(gs.getState(),raw))toolkitError('BASIC_POISON_WITNESS_INVALID','Retain the exact source application, physical target and sixty-second potency witness; no old attack is retroactively poisoned.')
  return raw as BasicPoisonWitness
}
