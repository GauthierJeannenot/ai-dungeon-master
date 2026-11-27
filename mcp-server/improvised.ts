import { assertGreaterBrewingIdAvailable } from './toolkit'
import { requireAdamantineItem,registerDerivedAdamantine } from './adamantine'
import { groundGearPhysicalWitness as materialWitness } from '../lib/ground-gear-recovery-state'
import { ImprovisedRulingSchema,improvisedPhysicalContext,improvisedRuling,type ImprovisedRuling } from '../lib/improvised-state'
import { getWeapon } from '../lib/srd/weapons'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { available,now } from './hero-rules'
import { spendObjectInteraction,afterInventoryChange,freeHands } from './equipment'
import { inspectPhysicalTransport } from './physical-handling'
import { lightFuelRemaining } from '../lib/lighting'
import { toolkitState,toolkitError } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'
import { activeBasicPoison,basicPoisonKey,validBasicPoisonWitness } from '../lib/basic-poison-state'
import { activePlayerPoison,validPlayerPoisonWitness,movePlayerPoisonSurface } from '../lib/player-poison-state'
import { AMMUNITION } from '../lib/srd/ammunition'
import { initialAmmunitionState } from '../lib/ammunition-state'

const store=()=>toolkitState().improvised??={version:1 as const,rulings:{},loads:{},receipts:{}}
const entry=<T>(map:Record<string,T>|undefined,id:string)=>map&&Object.hasOwn(map,id)?map[id]:undefined
const signature=(value:Record<string,unknown>)=>JSON.stringify(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)))
function physicalDamageFact(id:string|undefined,targetId:string){
  if(!id)return undefined
  const state=gs.getState(),fact=state.worldFacts?.find(fact=>fact.id===id)
  if(!fact||fact.subjectItemId!==undefined&&fact.subjectItemId!==targetId||fact.mapId!==state.currentMapId||fact.roomId!==undefined&&fact.roomId!==state.currentRoomId)
    toolkitError('IMPROVISED_DAMAGE_FACT_REQUIRED','Choose an actual current physical fact bound to this exact instance, not a description of another object or an invented magical/consumable effect.')
  return JSON.stringify({fact,targetId,association:'explicit_improvised_ruling'})
}
export function validateImprovisedReference(reference:string){
  const state=gs.getState(),ruling=improvisedRuling(state,reference)
  if(!ruling)return
  if(improvisedPhysicalContext(state,ruling.targetKind,ruling.targetId)!==ruling.physicalContext)
    toolkitError('IMPROVISED_PHYSICAL_CONTEXT_CHANGED','This exact ruling no longer describes the actual physical object/body; no replacement is selected.')
  if(ruling.physicalFactId&&physicalDamageFact(ruling.physicalFactId,ruling.targetId)!==ruling.physicalFactWitness)
    toolkitError('IMPROVISED_DAMAGE_FACT_CHANGED','The actual source fact for this instance’s nonstandard damage changed or ended; no old physical effect is invented.')
  if(ruling.targetKind==='item'){
    const item=state.player.inventory.find(item=>item.id===ruling.targetId)!
    const hands=state.dmTools?.loadout
    if(!hands||![hands.mainHandId,hands.offHandId,hands.shieldId].includes(item.id))toolkitError('IMPROVISED_OBJECT_NOT_HELD','The exact improvised object must actually occupy an established hand or worn shield slot; ownership alone proves no grip.')
    const meleeSling=ruling.mode==='melee'||ruling.mode==='similar'&&!getWeapon(ruling.profileId!)?.properties.includes('ranged')
    const id=item.equipmentId??item.id,light=state.dmTools?.lighting?.sources[item.id]
    if(id==='sling'&&ruling.mode==='similar'&&getWeapon(ruling.profileId!)?.special==='net'&&entry(state.dmTools?.improvised?.loads,item.id))
      toolkitError('SLING_PROJECTILE_MUST_BE_UNLOADED','Unload the actual attached projectile before using this host as a restraining mesh; no reserved physical unit is destroyed or converted with the net.')
    const torchBurning=id==='torch'&&(light?.litAt!==undefined&&lightFuelRemaining(light,now())>0||state.hero?.effects.some(effect=>effect.kind==='burning-torch'&&effect.data.itemId===item.id&&effect.expiresAt>now()))
    if(torchBurning&&meleeSling)toolkitError('IMPROVISED_SPECIFIC_SOURCE_PROCEDURE_REQUIRED','A burning torch has its own published melee-fire procedure; this generic ruling cannot replace it with1d4 or add fire/STR freely. Extinguish it for ordinary physical improvisation or use a dedicated sourced torch attack procedure.')
    if(ruling.damageType&&!['bludgeoning','piercing','slashing'].includes(ruling.damageType)&&['acid_vial','holy_water_flask','alchemists_fire_flask','oil_flask','poison_basic','basic_poison','basic_poison_vial','poison_vial'].includes(id))
      toolkitError('IMPROVISED_SPECIFIC_SOURCE_PROCEDURE_REQUIRED','This actual substance has a specific sourced use, dose, damage/save and action procedure. Use that dedicated resolver; a generic1d4 elemental/poison ruling cannot bypass its costs or grant a free effect.')
    if((item.equipmentId??item.id)==='sling'&&meleeSling&&!entry(state.dmTools?.improvised?.loads,item.id))
      toolkitError('IMPROVISED_SLING_MUST_BE_LOADED','A sling must contain one real loaded projectile to deal improvised melee damage; no shot or free ammunition is invented.')
  }else{
    const load=activePhysicalLoad(state)
    if(!load||load.targetId!==ruling.targetId||load.targetKind!==(ruling.targetKind==='corpse'?'creature':'object')||load.operation!=='carry'||load.control!=='inanimate')
      toolkitError('IMPROVISED_LOAD_NOT_HELD','The exact inanimate object or dead body must actually be carried with its real grip, mass and adjacent position.')
    inspectPhysicalTransport('player',{loadId:load!.id,targetId:ruling.targetId,targetToCell:{...load!.lastTargetCell}})
  }
}
export function adjudicateImprovised(input:Omit<ImprovisedRuling,'physicalContext'|'physicalFactWitness'|'at'>){
  available()
  const state=gs.getState()
  const old=improvisedRuling(state,input.referenceId)
  if(old){const {physicalContext:_context,physicalFactWitness:_fact,at:_at,...expected}=old
    if(signature(expected)!==signature(input))toolkitError('IMPROVISED_RULING_CONFLICT','This immutable reference already records different choices; use a new explicit reference.')
    return {success:true,ruling:old,replayed:true}}
  const context=improvisedPhysicalContext(state,input.targetKind,input.targetId)
  if(!context)toolkitError('IMPROVISED_PHYSICAL_OBJECT_REQUIRED','Choose a real owned item, intact modeled object or actually dead current body; this ruling creates no physical object.')
  if(!state.currentMapId||!state.currentRoomId||inferRoomIdOnMap(state.player.position,state.currentMapId,state)!==state.currentRoomId)
    toolkitError('IMPROVISED_LOCATION_REQUIRED','Establish the actual current map and room before preparing a physical attack ruling; no legacy location is invented.')
  if(input.damageType&&!['bludgeoning','piercing','slashing'].includes(input.damageType)&&!input.physicalFactId)
    toolkitError('IMPROVISED_DAMAGE_FACT_REQUIRED','A nonstandard appropriate damage type needs a real physical fact bound to this exact existing instance; no elemental, magical or poison effect is granted by description alone.')
  const physicalFactWitness=physicalDamageFact(input.physicalFactId,input.targetId)
  if(getWeapon(input.referenceId)||state.player.inventory.some(item=>item.id===input.referenceId))toolkitError('IMPROVISED_REFERENCE_COLLISION','Choose an unambiguous ruling reference distinct from actual items and published profiles.')
  if(Object.keys(state.dmTools?.improvised?.rulings??{}).length>=128)toolkitError('IMPROVISED_RULING_LIMIT','128 retained physical rulings reached; no old identity is overwritten.')
  if(input.mode==='similar'){
    const base=getWeapon(input.profileId!)
    if(!base||base.id==='unarmed')toolkitError('IMPROVISED_PROFILE_REQUIRED','Choose an exact published physical weapon profile for the established resemblance.')
    if((base!.properties.includes('twoHanded')||base!.special==='lance')&&input.hands!==2)toolkitError('TWO_HANDS_REQUIRED','The selected published profile requires two actual attacking hands.')
    if(input.targetKind!=='item'&&(base!.properties.includes('ammunition')||base!.special==='net'))
      toolkitError('IMPROVISED_LOAD_SPECIAL_UNSUPPORTED','A carried body/scene obstacle cannot be turned into a functional ammunition launcher or thrown restraining mesh by this weapon resemblance ruling.')
  }
  if(input.targetKind==='item'){
    const item=state.player.inventory.find(item=>item.id===input.targetId)!
    if(item.ammunitionType||item.quantity!==undefined&&item.quantity!==1)toolkitError('IMPROVISED_SINGLE_OBJECT_REQUIRED','Choose one actual physical object, not a counted ammunition stack or several objects as one attack.')
    const base=getWeapon(item.equipmentId??item.id)
    if(base?.properties.includes('twoHanded')&&input.hands!==2)toolkitError('TWO_HANDS_REQUIRED','The improper use does not remove this actual object’s two-handed physical grip.')
  }else{
    const load=activePhysicalLoad(state)
    if(!load||load.targetId!==input.targetId||load.operation!=='carry'||load.control!=='inanimate'||load.hands!==input.hands)
      toolkitError('IMPROVISED_LOAD_NOT_HELD','Record an actual carried inanimate load and the same already assigned hand count first.')
    if(input.mode==='thrown'&&!input.landingCell)toolkitError('IMPROVISED_LANDING_REQUIRED','Choose the explicit unobstructed landing cell for this real body/scene object; no landing or scatter is invented.')
    inspectPhysicalTransport('player',{loadId:load!.id,targetId:input.targetId,targetToCell:{...load!.lastTargetCell}})
  }
  const ruling=ImprovisedRulingSchema.parse({...input,physicalContext:context!,...(physicalFactWitness?{physicalFactWitness}:{}),at:now()})
  store().rulings[input.referenceId]=ruling
  return {success:true,ruling,reference:input.referenceId,notice:'Explicit MJ physical resemblance/damage adjudication; no object, proficiency, magic, reach beyond the selected profile, mass damage or feat is granted. Dead bodies as wieldable objects and the declared landing are announced engine/MJ adjudications, not universal printed procedures.'}
}
export function manageSlingLoad(input:{eventId:string;hostItemId:string;operation:'load'|'unload';ammunitionItemId?:string;separate?:boolean}){
  const state=gs.getState(),command=JSON.stringify(input),old=entry(state.dmTools?.improvised?.receipts,input.eventId)
  if(old){if(old.command!==command)toolkitError('SLING_LOAD_EVENT_CONFLICT','This event already records different exact physical choices.');return old.result}
  available()
  if(state.phase==='combat')rules.validateFreeCombatAction('player');else rules.validateActionUse('player')
  if(Object.keys(state.dmTools?.improvised?.receipts??{}).length>=512)toolkitError('SLING_LOAD_HISTORY_LIMIT','Retained load event capacity reached before the interaction.')
  const host=state.player.inventory.find(item=>item.id===input.hostItemId),hands=state.dmTools?.loadout
  if(!host||(host.equipmentId??host.id)!=='sling'||!hands||![hands.mainHandId,hands.offHandId].includes(host.id))toolkitError('SLING_HELD_REQUIRED','Choose the exact real sling already held in an established hand.')
  const loads=state.dmTools?.improvised?.loads,loaded=entry(loads,input.hostItemId)
  let unloadedItem:import('../lib/types').Item|undefined
  const actualSourceAmmunitionItemId=input.operation==='load'?input.ammunitionItemId:loaded?.ammunitionItemId
  if(freeHands()<1)toolkitError('AMMUNITION_FREE_HAND_REQUIRED','Free the other real hand from an item, shield, grapple or load before manipulating this reserved projectile.')
  if(input.operation==='load'){
    if(input.separate!==undefined)toolkitError('SLING_SEPARATE_UNLOAD_ONLY','The separate choice applies only to an explicit unload, never loading another projectile.')
    if(loaded)toolkitError('SLING_ALREADY_LOADED','The host already retains its one real projectile.')
    const ammo=state.player.inventory.find(item=>item.id===input.ammunitionItemId)
    if(!ammo||ammo.ammunitionType!=='sling-bullet'||!Number.isSafeInteger(ammo.quantity)||ammo.quantity!<1)toolkitError('SLING_PROJECTILE_REQUIRED','Select one actual owned counted sling bullet; no stone or bullet stock is created.')
    requireAdamantineItem(ammo!)
    // A stack unit transfers to its host; its mass is counted there exactly once.
    const poison=activeBasicPoison(state,basicPoisonKey('ammunition',ammo!.id))
    const playerPoison=activePlayerPoison(state,basicPoisonKey('ammunition',ammo!.id))
    if(playerPoison&&(!validPlayerPoisonWitness(state,playerPoison)||ammo!.quantity!==1))toolkitError('PLAYER_POISON_SINGLE_PROJECTILE_REQUIRED','The actual DMG-coated unit must remain one separated real projectile before loading; no dose spreads over another stack.')
    if(poison&&!validBasicPoisonWitness(state,poison))toolkitError('BASIC_POISON_WITNESS_INVALID','The real reserved projectile needs its retained actual dose application.')
    spendObjectInteraction();ammo!.quantity!--
    store().loads[host!.id]={hostItemId:host!.id,ammunitionItemId:ammo!.id,projectile:{ammunitionType:'sling-bullet',...(ammo!.adamantine?{adamantine:ammo!.adamantine}:{}),...(ammo!.silvered?{silvered:true}:{}),...(poison?{basicPoison:poison}:{}),...(playerPoison?{playerPoison}:{})},loadedAt:now()}
    if(playerPoison)movePlayerPoisonSurface(state,playerPoison,{kind:'loaded_projectile',id:host!.id,key:basicPoisonKey('loaded_projectile',host!.id)})
  }else{
    if(!loaded||input.ammunitionItemId!==undefined)toolkitError('SLING_LOAD_REQUIRED','Unload the exact retained projectile without substituting another stack.')
    const poison=loaded!.projectile.basicPoison&&loaded!.projectile.basicPoison.expiresAt>now()?loaded!.projectile.basicPoison:undefined
    const playerPoison=activePlayerPoison(state,basicPoisonKey('loaded_projectile',host!.id))
    if(playerPoison&&!validPlayerPoisonWitness(state,playerPoison))toolkitError('PLAYER_POISON_WITNESS_INVALID','The loaded actual DMG-coated unit retains its original real dose before unloading.')
    if(poison&&!validBasicPoisonWitness(state,poison))toolkitError('BASIC_POISON_WITNESS_INVALID','The loaded unit must retain its real physical source coating before transfer.')
    const ammo=state.player.inventory.find(item=>item.id===loaded!.ammunitionItemId)
    if(input.separate){
      const id=`ammo-unloaded:${input.eventId}`;assertGreaterBrewingIdAvailable(id);const prepared=state.dmTools?.ammunition?.prepared
      if(Object.keys(prepared??{}).length>=128)toolkitError('AMMUNITION_STACK_LIMIT','No retained actual unit identity slot remains before the unload interaction.')
      if(state.player.inventory.some(item=>item.id===id)||state.droppedItems?.[id]||Object.hasOwn(prepared??{},id)||gs.getEntity(id)||gs.getNpc(id))toolkitError('SLING_UNLOAD_ITEM_CONFLICT','The exact separated-unit identity already exists or was used.')
      unloadedItem={id,equipmentId:AMMUNITION['sling-bullet'].equipmentId,name:'Projectile réellement déchargé',type:'misc',ammunitionType:'sling-bullet',quantity:1,...(loaded!.projectile.adamantine?{adamantine:loaded!.projectile.adamantine}:{}),...(loaded!.projectile.silvered?{silvered:true}:{})}
      if(poison&&Object.keys(state.dmTools?.basicPoison?.coatings??{}).length>=512)toolkitError('BASIC_POISON_COATING_LIMIT','No retained source-transfer identity slot remains before this actual unload interaction.')
      if(loaded!.projectile.adamantine&&Object.keys(state.dmTools?.adamantine?.instances??{}).length>=1024)toolkitError('ADAMANTINE_HISTORY_LIMIT','Retain every original material unit before this transfer.')
      spendObjectInteraction();state.player.inventory.push(unloadedItem)
      registerDerivedAdamantine(unloadedItem,'unload',input.eventId,undefined,loaded!.ammunitionItemId)
      const ammunition=toolkitState().ammunition??=initialAmmunitionState()
      ammunition.prepared[id]={itemId:id,creation:JSON.stringify({operation:'actual_loaded_projectile_transfer',eventId:input.eventId,hostItemId:host!.id,originalStackId:loaded!.ammunitionItemId,quantity:1,silvered:Boolean(loaded!.projectile.silvered),basicPoison:poison??null,playerPoison:playerPoison??null})}
      if(poison)state.dmTools!.basicPoison!.coatings[basicPoisonKey('ammunition',id)]=poison
      if(playerPoison)movePlayerPoisonSurface(state,playerPoison,{kind:'item',id,key:basicPoisonKey('ammunition',id)})
    }else{
      if(!ammo||ammo.ammunitionType!=='sling-bullet'||materialWitness(ammo.adamantine)!==materialWitness(loaded!.projectile.adamantine)||Boolean(ammo.silvered)!==Boolean(loaded!.projectile.silvered)||!Number.isSafeInteger(ammo.quantity))
        toolkitError('SLING_ORIGINAL_STACK_REQUIRED','The original matching real stack must be carried for merging; explicitly choose separate:true to retain the same real unit separately.')
      const stackPoison=activeBasicPoison(state,basicPoisonKey('ammunition',ammo!.id))
      const stackPlayerPoison=activePlayerPoison(state,basicPoisonKey('ammunition',ammo!.id))
      if(stackPlayerPoison||playerPoison&&ammo!.quantity!==0)toolkitError('SLING_POISON_STACK_MISMATCH','Keep the actual single DMG-coated unit separate from other units/coatings; unloading cannot spread its one dose across a pile.')
      if(poison?.applicationId!==stackPoison?.applicationId||poison?.targetKey!==stackPoison?.targetKey)
        toolkitError('SLING_POISON_STACK_MISMATCH','This actual unit and original stack have different active coatings. Explicitly choose separate:true; never discard, spread or refresh poison by merging.')
      spendObjectInteraction();ammo!.quantity!++
      if(playerPoison)movePlayerPoisonSurface(state,playerPoison,{kind:'item',id:ammo!.id,key:basicPoisonKey('ammunition',ammo!.id)})
    }
    delete store().loads[host!.id]
  }
  afterInventoryChange()
  const result={success:true,...input,actualSourceAmmunitionItemId,loaded:entry(store().loads,host!.id)??null,...(unloadedItem?{unloadedItem}:{}),notice:'One existing projectile transferred; no attack, shot, damage, free ammunition or extra mass created.'}
  store().receipts[input.eventId]={command,result:structuredClone(result)};return result
}
