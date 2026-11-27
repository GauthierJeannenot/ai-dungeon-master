import { preflightPoisonNutritionPreparation,recordPoisonNutritionPreparation } from './poison-nutrition'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { activePlayerPoison,type PlayerPoisonWitness } from '../lib/player-poison-state'
import { activeBasicPoison,basicPoisonKey } from '../lib/basic-poison-state'
import { playerPoisons,playerPoisonDose,playerPoisonReceipt,rememberPlayerPoison,preflightPlayerPoisonWork,spendPlayerPoisonWork,observedPlayerPoisonFact,PLAYER_POISON_SOURCE } from './player-poison-core'
import { selectedWeaponItem,weaponForReference,weaponItemHeld,afterInventoryChange } from './equipment'
import { validateImprovisedReference } from './improvised'
import { toolkitError,assertToolkitReach } from './toolkit'
import * as gs from './game-state'

export interface PreparePlayerPoisonInput{eventId:string;doseItemId:string;surfaceKind:'weapon'|'ammunition'|'loaded_projectile'|'item'|'object'|'hunting_trap';surfaceId:string;
 physicalFactId?:string;foodOrLiquidConfirmed?:true;surfaceDescription:string}
export function playerPoisonPreparationSurface(input:PreparePlayerPoisonInput,delivery:'contact'|'ingested'|'injury'){
 const state=gs.getState(),player=state.player
 let targetKind:'item'|'object'|'ground_gear'='item',targetId=input.surfaceId,surfaceKey='',cell={...player.position},physicalFact:Record<string,unknown>|undefined
 if(input.surfaceKind==='weapon'){
  const weapon=weaponForReference(input.surfaceId),item=selectedWeaponItem(input.surfaceId)
  if(!weapon||!item||!weaponItemHeld(item))toolkitError('PLAYER_POISON_WEAPON_NOT_HELD','Choose the exact actually held physical weapon/reference; ownership or a text name does not supply a manipulating grip.')
  if(weapon!.improvised)validateImprovisedReference(input.surfaceId)
  if(weapon!.properties.includes('ammunition'))toolkitError('PLAYER_POISON_LAUNCHER_NOT_PROJECTILE','A launcher coating does not coat its arrows, bolts, needles or reserved sling projectile. Select the real physical striking surface/unit.')
  if(delivery==='injury'&&!['piercing','slashing'].includes(weapon!.damageType??''))toolkitError('PLAYER_POISON_WOUNDING_SURFACE_REQUIRED','This injury procedure requires an actual published/adjudicated piercing or slashing striking surface; no edge or wound is invented.')
  targetId=item!.id;surfaceKey=basicPoisonKey('weapon',item!.id,weapon!.improvised?.targetKind??'item')
 }else if(input.surfaceKind==='ammunition'){
  const item=player.inventory.find(value=>value.id===input.surfaceId)
  if(!item||!item.ammunitionType||item.quantity!==1)toolkitError('PLAYER_POISON_SINGLE_PROJECTILE_REQUIRED','Select one actual counted single projectile. This initial single-surface adjudication does not silently split or multiply a dose across an unseparated stack.')
  if(delivery==='injury'&&item!.ammunitionType==='sling-bullet')toolkitError('PLAYER_POISON_WOUNDING_SURFACE_REQUIRED','The actual standard sling bullet deals bludgeoning; no piercing/slashing wound is invented for injury poison.')
  surfaceKey=basicPoisonKey('ammunition',item!.id)
 }else if(input.surfaceKind==='loaded_projectile'){
  const host=player.inventory.find(value=>value.id===input.surfaceId),load=state.dmTools?.improvised?.loads[input.surfaceId]
  if(!host||!load||!weaponItemHeld(host))toolkitError('PLAYER_POISON_RESERVED_PROJECTILE_REQUIRED','Choose the actual held host already containing its real reserved projectile; no load or free unit is created.')
  if(delivery==='injury')toolkitError('PLAYER_POISON_WOUNDING_SURFACE_REQUIRED','The represented loaded sling bullet has a bludgeoning source profile; coating it does not invent a cutting surface.')
  surfaceKey=basicPoisonKey('loaded_projectile',input.surfaceId)
 }else if(input.surfaceKind==='object'){
  const object=state.dmTools?.objects[input.surfaceId]
  if(!object||object.state==='destroyed')toolkitError('PLAYER_POISON_OBJECT_REQUIRED','Choose an actual intact current scene object, not an invented surface.')
  assertToolkitReach(object!);targetKind='object';cell={...object!.cell};surfaceKey=JSON.stringify(['object',object!.id])
  if(delivery==='injury')toolkitError('PLAYER_POISON_WOUNDING_PROCEDURE_REQUIRED','Use an actual supported wounding weapon/projectile or physical hunting-trap component. An unrepresented scene-object attack cannot create a poison wound.')
 }else if(input.surfaceKind==='hunting_trap'){
  const trap=state.dmTools?.groundGear?.placements[input.surfaceId]
  if(!trap||trap.kind!=='hunting_trap'||trap.status==='recovered'||trap.unitsRemaining!==1)toolkitError('PLAYER_POISON_TRAP_COMPONENT_REQUIRED','Select the exact physically placed hunting-trap jaws, not the loose caltrops lot or an invented trap component.')
  assertToolkitReach({mapId:trap!.mapId,roomId:trap!.roomId,cell:trap!.cells[0],surfaceZFeet:trap!.surfaceZFeet})
  targetKind='ground_gear';targetId=trap!.itemId;cell={...trap!.cells[0]};surfaceKey=JSON.stringify(['hunting_trap',targetId])
 }else{
  const item=player.inventory.find(value=>value.id===input.surfaceId),drop=state.droppedItems?.[input.surfaceId]
  if(!item&&!drop)toolkitError('PLAYER_POISON_PHYSICAL_ITEM_REQUIRED','Choose the exact actually carried or physically dropped item instance.')
  if(drop&&!item){if(!drop.roomId)toolkitError('PLAYER_POISON_SURFACE_ROOM_REQUIRED','The exact dropped surface needs its real room before manipulation; no location is guessed.');assertToolkitReach({mapId:drop.mapId,roomId:drop.roomId!,cell:drop.position});cell={...drop.position}}
  if(delivery==='injury')toolkitError('PLAYER_POISON_WOUNDING_PROCEDURE_REQUIRED','An arbitrary item has no source wounding damage procedure. Establish its actual improvised weapon use before applying injury poison.')
  surfaceKey=JSON.stringify(['item',input.surfaceId])
 }
 if(targetId===input.doseItemId)toolkitError('PLAYER_POISON_DOSE_IS_TARGET','The consumed dose cannot also remain as its distinct poisoned target object.')
 if(delivery==='ingested'&&(!['item','object'].includes(input.surfaceKind)||!input.foodOrLiquidConfirmed))toolkitError('PLAYER_POISON_FOOD_OR_LIQUID_REQUIRED','Explicitly establish the actual food/liquid surface for this whole ingested dose; no swallowable material is inferred.')
 if(delivery==='ingested'&&input.surfaceKind==='item'){
  const item=player.inventory.find(value=>value.id===input.surfaceId)??state.droppedItems?.[input.surfaceId]?.item
  if(item?.quantity!==undefined&&item.quantity!==1)toolkitError('PLAYER_POISON_WHOLE_PORTION_REQUIRED','Select the exact single actual portion; a food stack does not identify where its whole dose was placed or swallowed.')
  preflightPoisonNutritionPreparation(input.surfaceId)
 }
 if(delivery!=='ingested'&&input.foodOrLiquidConfirmed!==undefined)toolkitError('PLAYER_POISON_DELIVERY_ARGUMENT','Food/liquid confirmation belongs only to ingested poison.')
 if(delivery==='contact'||delivery==='ingested'){
  if(!input.physicalFactId)toolkitError('PLAYER_POISON_PHYSICAL_FACT_REQUIRED','Contact/ingested preparations require a real public scene fact for the chosen actual physical coated area/food or liquid.')
  physicalFact=observedPlayerPoisonFact(input.physicalFactId!,cell,targetId)
 }else if(input.physicalFactId)physicalFact=observedPlayerPoisonFact(input.physicalFactId,cell,targetId)
 if(activePlayerPoison(state,surfaceKey)||activeBasicPoison(state,surfaceKey))toolkitError('PLAYER_POISON_SURFACE_OCCUPIED','This exact surface already has a potent physical coating. Resolve its actual delivery or washing first; no mixture, dilution or automatic replacement is invented.')
 return{targetKind,targetId,surfaceKey,physicalFact}
}
export function preparePlayerPoison(input:PreparePlayerPoisonInput){
 const command=JSON.stringify(input),old=playerPoisonReceipt(input.eventId,command);if(old)return old
 const seconds=preflightPlayerPoisonWork(),dose=playerPoisonDose(input.doseItemId),spec=AFFLICTIONS[dose.templateId]
 if(spec.delivery==='laughter')toolkitError('CACKLE_DEDICATED_SOURCE_REQUIRED','A disease is not an actual player poison dose.')
 if(spec.delivery==='inhaled')toolkitError('PLAYER_POISON_INHALATION_RELEASE_REQUIRED','An inhaled dose is actually released into its sourced five-foot cube; it is not a lasting surface coating.')
 const surface=playerPoisonPreparationSurface(input,spec.delivery)
 if(Object.keys(playerPoisons().preparations).length>=256)toolkitError('PLAYER_POISON_PREPARATION_LIMIT','Retained actual poison preparations are full before a dose, action or time is spent.')
 const nutritionResource=spec.delivery==='ingested'&&input.surfaceKind==='item'?preflightPoisonNutritionPreparation(input.surfaceId):undefined
 if(spec.delivery==='ingested'&&input.surfaceKind==='object'&&gs.getState().dmTools?.waterSources?.sources[input.surfaceId])toolkitError('POISON_SOURCE_BODY_VOLUME_UNSUPPORTED','This situated water source needs a quantified dose/source-body distribution procedure; use an actual selected portable volume, never contaminate a permanent source by inventing concentration.')
 const sourceItem=structuredClone(dose.item) as unknown as Record<string,unknown>,data=playerPoisons()
 spendPlayerPoisonWork(seconds);gs.consumePlayerItem(item=>item.id===dose.item.id);afterInventoryChange()
 const appliedAt=gs.getState().worldTimeSeconds??0,witness:PlayerPoisonWitness={preparationId:input.eventId,templateId:dose.templateId,originSurfaceKey:surface.surfaceKey,appliedAt}
 const result={success:true,eventId:input.eventId,templateId:dose.templateId,consumedDose:true,doseItemId:dose.item.id,...surface,appliedAt,seconds,actionSpent:seconds===0,source:PLAYER_POISON_SOURCE,
  interpretation:'Initial explicit engine adjudication:one real dose on one actual selected surface/projectile, one delivery, no printed drying deadline. This is not a RAW one-projectile maximum; distribution/partial potency requires a separate recorded adjudication. Full action in combat or six real seconds outside combat is an announced timing convention.'}
 data.preparations[input.eventId]={id:input.eventId,command,doseItemId:dose.item.id,templateId:dose.templateId,delivery:spec.delivery,...surface,sourceItem,appliedAt,status:'active',currentSurface:{kind:input.surfaceKind==='loaded_projectile'?'loaded_projectile':surface.targetKind,id:surface.targetId,key:surface.surfaceKey},coverage:{objects:1,exposures:1,source:input.surfaceDescription},result}
 recordPoisonNutritionPreparation(input.eventId,nutritionResource)
 data.surfaces[surface.surfaceKey]=witness
 if(input.surfaceKind==='loaded_projectile')gs.getState().dmTools!.improvised!.loads[input.surfaceId].projectile.playerPoison=witness
 return rememberPlayerPoison(input.eventId,command,result)
}
