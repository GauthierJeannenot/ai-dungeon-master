import { nativePoisonStateOf } from '../lib/native-poison-state'
import { poisonNutritionStateOf } from '../lib/poison-nutrition-state'
import { PLAYER_POISONS } from '../lib/srd/player-poisons'
import type { SavingThrowResult } from '../lib/types'
import { randomUUID } from 'node:crypto'
import type { PlayerPoisonState } from '../lib/player-poison-state'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { playerPoisonStateOf } from '../lib/player-poison-state'
import { physicalHeightCombatIssue } from '../lib/jumping-state'
import { afflictions,applyAfflictionSave,createActualAfflictionRecord,afflictionSavingThrowInput } from './afflictions'
import { groundDamageIssue } from './ground-damage-preflight'
import { inspectExhaustion } from './exhaustion'
import { available,assertHero,distance } from './hero-rules'
import { savedResolution,registerCheckedResolution } from './toolkit-checks'
import { playerPoisons,playerPoisonReceipt,rememberPlayerPoison,observedPlayerPoisonFact,PLAYER_POISON_SOURCE } from './player-poison-core'
import { assertToolkitReach,toolkitError,toolkitResult } from './toolkit'
import * as gs from './game-state'

type Delivery=PlayerPoisonState['deliveries'][string]
export interface ExposePlayerPoisonInput{eventId:string;preparationId:string;targetId:string;physicalFactId:string;
 actualTouchConfirmed?:true;exposedSkinConfirmed?:boolean;entireDoseSwallowedConfirmed?:true;midnightAt?:number}
export function poisonSurfaceLocation(preparation:PlayerPoisonState['preparations'][string]){
 const current=preparation.currentSurface,targetId=current?.id??preparation.targetId
 if(current?.kind==='expended_projectile')toolkitError('PLAYER_POISON_PROJECTILE_RECOVERY_REQUIRED','This actual coated projectile was fired and is not an available held/ground object. Recover that same physical unit explicitly before touching it; no landing or duplicate is invented.')
 const state=gs.getState(),item=state.player.inventory.find(value=>value.id===targetId),drop=state.droppedItems?.[targetId]
 if(item)return{mapId:state.currentMapId!,roomId:state.currentRoomId!,cell:{...state.player.position},holderId:'player'}
 if(drop){if(!drop.roomId)toolkitError('PLAYER_POISON_SURFACE_ROOM_REQUIRED','The actual dropped poisoned object needs its real room.');return{mapId:drop.mapId,roomId:drop.roomId!,cell:{...drop.position}}}
 const trap=Object.values(state.dmTools?.groundGear?.placements??{}).find(value=>value.itemId===targetId&&value.status!=='recovered')
 if(trap)return{mapId:trap.mapId,roomId:trap.roomId,cell:{...trap.cells[0]},surfaceZFeet:trap.surfaceZFeet}
 const object=state.dmTools?.objects[targetId]
 if(object&&object.state!=='destroyed')return{mapId:object.mapId,roomId:object.roomId,cell:{...object.cell}}
 const body=gs.getPhysicalCreature(targetId)
 if(body)return{mapId:state.currentMapId!,roomId:state.currentRoomId!,cell:{...body.position},holderId:body.id}
 toolkitError('PLAYER_POISON_SURFACE_NOT_PRESENT','The exact original poisoned physical surface is absent; no replacement, archive activation or remote exposure is inferred.')
}
export function preflightActualPoisonExposure(templateId:Delivery['templateId'],targetId:string,midnightAt?:number){
 assertHero()
 const state=gs.getState(),target=gs.getPhysicalCreature(targetId),spec=AFFLICTIONS[templateId]
 if(!target)toolkitError('PLAYER_POISON_TARGET_REQUIRED','Choose the exact current physical body with its real statistics; no creature, profile or visibility is granted.')
 if(templateId==='midnight_tears'){
  if(midnightAt===undefined||midnightAt<=(state.worldTimeSeconds??0)||midnightAt>(state.worldTimeSeconds??0)+86400)toolkitError('MIDNIGHT_TIMESTAMP_REQUIRED','Select the actual next established midnight within24hours before spending this delivery.')
 }else if(midnightAt!==undefined)toolkitError('AFFLICTION_ARGUMENT_MISMATCH','Only Midnight Tears accepts an actual midnight timestamp.')
 if(Object.keys(state.dmTools?.afflictions?.records??{}).length>=512)toolkitError('AFFLICTION_EVENT_LIMIT','Actual affliction history is full before this physical delivery or save.')
 if(Object.keys(playerPoisonStateOf(state)?.deliveries??{}).length>=1024)toolkitError('PLAYER_POISON_DELIVERY_LIMIT','Actual dose deliveries are full before any saving throw or damage.')
 const dead=target!.id==='player'?Boolean(state.player.deathSaves?.dead):'isAlive'in target!&&!target!.isAlive
 if(!dead&&!target!.conditions.includes('petrified'))gs.withPhysicalCreatureResolution([targetId],()=>{
  const dice=spec.damage?.split('d').map(Number),maximum=dice?.length===2?dice[0]*dice[1]:0,issue=groundDamageIssue(state,targetId,maximum)
  if(issue)toolkitError(issue.code,issue.message)
  inspectExhaustion(targetId)
 })
 return{target:target!,dead}
}
/** Engine-only actual natural harvesting mishap; this does not obtain a dose. */
export function naturalPlayerPoisonSource(entityId:string,templateId:Delivery['templateId']){
 const body=gs.getPhysicalCreature(entityId),profile=PLAYER_POISONS[templateId] as {harvestCreatureType?:string}
 if(!body||!('type'in body)||!profile.harvestCreatureType||body.type!==profile.harvestCreatureType||body.group||body.isAlive&&!body.conditions.some(condition=>['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(condition)))toolkitError('PLAYER_POISON_NATURAL_SOURCE_REQUIRED','The harvesting mishap requires this exact actual dead/incapacitated individual and its sourced natural poison; no creature, venom, profile or dose is created.')
 return{entityId,templateId,creatureType:body!.type,observedAt:gs.getState().worldTimeSeconds??0,bodyWitness:JSON.stringify({id:body!.id,type:body!.type,position:body!.position,hp:body!.hp,isAlive:body!.isAlive,conditions:body!.conditions,sourceSha256:body!.statBlock?.sourceSha256})}
}
const deliveryContinuations=new Map<string,(deliveryId:string)=>ReturnType<typeof toolkitResult>>()
export function registerPlayerPoisonContinuation(domain:string,continuation:(deliveryId:string)=>ReturnType<typeof toolkitResult>){deliveryContinuations.set(domain,continuation)}
function finishActualPlayerPoisonDelivery(delivery:Delivery,poison:Record<string,unknown>){
 const body=gs.getPhysicalCreature(delivery.targetId),damage=poison.damageResolution as{damageDealt?:number}|undefined,poisonDamageDealt=damage?.damageDealt??0
 const result={...delivery.baseAttack,success:true,deliveryId:delivery.id,targetId:delivery.targetId,playerPoison:poison,poisonDamageDealt,
  ...delivery.baseAttack?{weaponDamageDealt:Number(delivery.baseAttack.damageDealt??0),damageDealt:Number(delivery.baseAttack.damageDealt??0)+poisonDamageDealt,totalDamageDealt:Number(delivery.baseAttack.damageDealt??0)+poisonDamageDealt}:{},
  ...(body?{targetHpAfter:body.hp.current,targetDied:body.id==='player'?Boolean(gs.getPlayer().deathSaves?.dead):'isAlive'in body&&!body.isAlive,targetKnockedOut:'isAlive'in body&&Boolean(body.knockout)}:{}),
  source:PLAYER_POISON_SOURCE}
 if(delivery.nativeAttackId){const packet=result.playerPoison as Record<string,unknown>;delete packet.doseDelivered;packet.nativeSourceAttack=true}
 delivery.status='resolved';delivery.result=structuredClone(result);rememberPlayerPoison(delivery.id,delivery.command,result)
 const bonus=delivery.baseAttack?.twoWeapon as{attackId?:string}|undefined
 if(bonus?.attackId){const receipt=gs.getState().dmTools?.twoWeapon?.receipts[bonus.attackId];if(receipt){receipt.status='resolved';receipt.result=structuredClone(result)}}
 if(delivery.cloudId)return deliveryContinuations.get('cloud')?.(delivery.id)??toolkitResult(result)
 const continuation=delivery.baseAttack?.playerPoisonContinuation as{domain?:string}|undefined
 if(continuation?.domain)return deliveryContinuations.get(continuation.domain)?.(delivery.id)??toolkitResult(result)
 return toolkitResult(result)
}
export function startActualPlayerPoisonDelivery(input:{id:string;command:string;templateId:Delivery['templateId'];targetId:string;sourceActorId?:string;preparationId?:string;cloudId?:string;naturalSourceId?:string;nativeAttackId?:string;physicalFact?:Record<string,unknown>;midnightAt?:number;baseAttack?:Record<string,unknown>}){
 const prior=playerPoisonStateOf(gs.getState())?.deliveries[input.id]
 if(prior){
  if(prior.command!==input.command)toolkitError('PLAYER_POISON_EVENT_CONFLICT','This actual exposure identity has another exact physical source or target.')
  if(prior.status==='resolved')return toolkitResult({...prior.result,replayed:true})
  const pending=gs.getState().hero?.pending,resolution=pending?.command.toolkitResolution as{domain?:string;command?:{deliveryId?:string}}|undefined
  if(resolution?.domain!=='player-poison-save'||resolution.command?.deliveryId!==prior.id)toolkitError('PLAYER_POISON_SAVE_CONTEXT_REQUIRED','Resume the exact original held CON save; no replacement die is rolled.')
  return toolkitResult({deliveryId:prior.id,pendingReaction:pending,alreadyPending:true})
 }
 const naturalSource=input.naturalSourceId?naturalPlayerPoisonSource(input.naturalSourceId,input.templateId):undefined
 const nativeHit=input.nativeAttackId?nativePoisonStateOf(gs.getState())?.hits[input.nativeAttackId]:undefined
 if(input.nativeAttackId&&(!nativeHit||nativeHit.status!=='pending'||nativeHit.context.attackId!==input.id||nativeHit.context.targetId!==input.targetId||nativeHit.context.templateId!==input.templateId||nativeHit.context.attackerId!==input.sourceActorId||nativeHit.primaryAttack.hit!==true))toolkitError('NATIVE_POISON_HIT_REQUIRED','The source poison requires its actual just-committed native hit and original source/target; no live creature grants a free possessed dose or guessed exposure.')
 if(!input.preparationId&&!input.cloudId&&!naturalSource&&!nativeHit)toolkitError('PLAYER_POISON_PHYSICAL_SOURCE_REQUIRED','Retain a real spent preparation, released cloud or actual natural harvesting source before exposure.')
 const {target,dead}=preflightActualPoisonExposure(input.templateId,input.targetId,input.midnightAt)
 const delivery:Delivery={id:input.id,command:input.command,templateId:input.templateId,targetId:input.targetId,preparationId:input.preparationId,cloudId:input.cloudId,naturalSource,nativeAttackId:input.nativeAttackId,physicalFact:input.physicalFact,baseAttack:input.baseAttack,at:gs.getState().worldTimeSeconds??0,status:'pending'}
 playerPoisons().deliveries[input.id]=delivery
 const bonus=delivery.baseAttack?.twoWeapon as{attackId?:string}|undefined
 if(bonus?.attackId){const receipt=gs.getState().dmTools?.twoWeapon?.receipts[bonus.attackId];if(receipt)receipt.status='pending'}
 if(dead)return finishActualPlayerPoisonDelivery(delivery,{templateId:input.templateId,skipped:'actual_body_already_dead',doseDelivered:true})
 const id=`player-poison:${randomUUID()}`
 const created=gs.withPhysicalCreatureResolution([target.id],()=>createActualAfflictionRecord({id,sourceId:input.preparationId??input.cloudId??naturalSource?.entityId??nativeHit!.context.attackId,sourceActorId:input.sourceActorId??'player',targetId:target.id,templateId:input.templateId,eventId:input.id,creation:input.command,midnightAt:input.midnightAt}))
 delivery.afflictionId=id
 if(created.immune||created.deferred)return finishActualPlayerPoisonDelivery(delivery,{templateId:input.templateId,immune:created.immune,delayedUntil:created.record.nextAt,affliction:created.record,doseDelivered:true})
 return gs.withPhysicalCreatureResolution([target.id],()=>savedResolution(afflictionSavingThrowInput(input.templateId,target.id),{domain:'player-poison-save',command:{deliveryId:delivery.id}}))
}
export function exposePlayerPoison(input:ExposePlayerPoisonInput){
 const command=JSON.stringify(input),old=playerPoisonReceipt(input.eventId,command);if(old)return toolkitResult(old)
 const previous=playerPoisonStateOf(gs.getState())?.deliveries[input.eventId]
 if(previous)return startActualPlayerPoisonDelivery({id:input.eventId,command,templateId:previous.templateId,targetId:input.targetId,preparationId:input.preparationId})
 available();const state=gs.getState(),prepared=playerPoisonStateOf(state)?.preparations[input.preparationId]
 if(!prepared||prepared.status!=='active')toolkitError('PLAYER_POISON_PREPARATION_REQUIRED','Choose the exact still-potent real surface preparation; no vial, contact or exposure is invented.')
 if(poisonNutritionStateOf(state)?.resources[input.preparationId])toolkitError('POISON_TRACKED_INGESTION_REQUIRED','Use consume_provisions for this actual tracked food/water so the real debit, intake and original whole-dose CON stay atomic. This scene-event tool cannot consume the dose while leaving its quantified food/water untouched.')
 if(prepared!.delivery==='injury')toolkitError('PLAYER_POISON_REAL_WOUND_REQUIRED','Injury delivery must follow the actual registered piercing/slashing damage event; a scene fact alone cannot fabricate a wound.')
 const target=gs.getPhysicalCreature(input.targetId);if(!target)toolkitError('PLAYER_POISON_TARGET_REQUIRED','The actual affected body must physically exist on this map.')
 const location=poisonSurfaceLocation(prepared!)
 if(location.holderId){
  if(location.mapId!==state.currentMapId||distance(target!.position,location.cell)>1)toolkitError('PLAYER_POISON_CONTACT_OUT_OF_REACH','The actual body must reach this same real physical surface; no remote delivery is inferred.')
  if(location.holderId!==target!.id){const issue=physicalHeightCombatIssue(state,[location.holderId,target!.id]);if(issue)toolkitError(issue.code,issue.message)}
 }else gs.withPhysicalCreatureResolution([target!.id],()=>assertToolkitReach(location,target!.id))
 const physicalFact=observedPlayerPoisonFact(input.physicalFactId,location.cell,prepared!.currentSurface?.id??prepared!.targetId)
 if(prepared!.delivery==='contact'){
  if(!input.actualTouchConfirmed||input.exposedSkinConfirmed===undefined||input.entireDoseSwallowedConfirmed!==undefined||input.midnightAt!==undefined)toolkitError('PLAYER_POISON_ACTUAL_TOUCH_REQUIRED','Explicitly confirm the true touch and whether skin was exposed. Ingestion/midnight fields cannot substitute for it.')
 }else if(!input.entireDoseSwallowedConfirmed||input.actualTouchConfirmed!==undefined||input.exposedSkinConfirmed!==undefined)toolkitError('PLAYER_POISON_ENTIRE_DOSE_REQUIRED','Explicitly confirm this whole ingested dose was actually swallowed; partial-dose potency is not silently inferred.')
 if(prepared!.delivery==='contact'&&!input.exposedSkinConfirmed){if(Object.keys(playerPoisonStateOf(state)?.deliveries??{}).length>=1024)toolkitError('PLAYER_POISON_DELIVERY_LIMIT','Actual contact-delivery receipts are full before this touch consumes its application.')}
 else{const checked=preflightActualPoisonExposure(prepared!.templateId,input.targetId,input.midnightAt);if(prepared!.delivery==='ingested'&&checked.dead)toolkitError('PLAYER_POISON_INGESTING_BODY_REQUIRED','A corpse cannot swallow this dose; no ingestion, life or source effect is invented.')}
 prepared!.status='delivered';prepared!.deliveryEventId=input.eventId
 if(prepared!.delivery==='contact'&&!input.exposedSkinConfirmed){
  const delivery:Delivery={id:input.eventId,command,templateId:prepared!.templateId,targetId:input.targetId,preparationId:prepared!.id,physicalFact,at:state.worldTimeSeconds??0,status:'pending'};playerPoisons().deliveries[delivery.id]=delivery
  return finishActualPlayerPoisonDelivery(delivery,{templateId:prepared!.templateId,doseDelivered:true,skipped:'actual_touch_without_exposed_skin',interpretation:'A true touch ends this contact application; only actual exposed skin causes its effects. No automatic transfer to a glove/tool is invented.'})
 }
 return startActualPlayerPoisonDelivery({id:input.eventId,command,templateId:prepared!.templateId,targetId:input.targetId,preparationId:prepared!.id,physicalFact,midnightAt:input.midnightAt})
}
export function validateHeldPlayerPoisonSave(command:Record<string,unknown>){
 const resolution=command.toolkitResolution as{domain?:string;command?:{deliveryId?:string}}|undefined;if(resolution?.domain!=='player-poison-save')return
 const delivery=playerPoisonStateOf(gs.getState())?.deliveries[String(resolution.command?.deliveryId)],record=delivery?.afflictionId?gs.getState().dmTools?.afflictions?.records[delivery.afflictionId]:undefined
 if(!delivery||delivery.status!=='pending'||!record||record.targetId!==delivery.targetId||record.templateId!==delivery.templateId||record.petrificationPause||!gs.getPhysicalCreature(delivery.targetId))toolkitError('PLAYER_POISON_SAVE_CONTEXT_INVALID','Retain the actual delivered dose, affected body and original active affliction before any Inspiration die; no source or target is substituted.')
 const target=gs.getPhysicalCreature(delivery.targetId)!,dead=target.id==='player'?Boolean(gs.getPlayer().deathSaves?.dead):'isAlive'in target&&!target.isAlive
 if(dead)toolkitError('PLAYER_POISON_SAVE_CONTEXT_INVALID','The original affected body is now dead; no Inspiration die or new poison effect is manufactured.')
 gs.withPhysicalCreatureResolution([target.id],()=>{const dice=AFFLICTIONS[delivery.templateId].damage?.split('d').map(Number),issue=groundDamageIssue(gs.getState(),target.id,dice?.length===2?dice[0]*dice[1]:0);if(issue)toolkitError(issue.code,issue.message);inspectExhaustion(target.id)})
}
export function registerPlayerPoisonSaveResolutions(){registerCheckedResolution('player-poison-save',(command,saved)=>{
 const delivery=playerPoisons().deliveries[String(command.deliveryId)],record=delivery?.afflictionId?afflictions().records[delivery.afflictionId]:undefined
 if(!delivery||!record)toolkitError('PLAYER_POISON_SAVE_CONTEXT_INVALID','The exact actual poison delivery and affliction are absent.')
 const save=saved as SavingThrowResult
 if(save.entityId!==delivery.targetId||save.ability!=='con'||save.dc!==AFFLICTIONS[delivery.templateId].dc)toolkitError('PLAYER_POISON_SAVE_CONTEXT_INVALID','The original source CON save, fixed DC and body must remain unchanged.')
 const result=gs.withPhysicalCreatureResolution([delivery.targetId],()=>applyAfflictionSave(record,save,'initial'))
 return finishActualPlayerPoisonDelivery(delivery,{templateId:delivery.templateId,...result,doseDelivered:true})
})}
