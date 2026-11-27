import { createHash } from 'node:crypto'
import type { ConsumeProvisionsInput } from '../lib/survival-state'
import { actualNutritionResource,poisonNutritionStateOf } from '../lib/poison-nutrition-state'
import { playerPoisonStateOf,activePlayerPoison } from '../lib/player-poison-state'
import { poisonPortionPlan,commitPoisonPortionRuling,refreshPoisonNutrition,type PoisonPortionPlan } from './poison-nutrition'
import { preflightActualPoisonExposure,startActualPlayerPoisonDelivery,registerPlayerPoisonContinuation } from './player-poison-exposure'
import { toolkitError,toolkitResult } from './toolkit'
import * as gs from './game-state'
export function preflightPoisonedProvisions(input:ConsumeProvisionsInput){
 const contact=activePlayerPoison(gs.getState(),JSON.stringify(['item',input.itemId]));if(contact&&playerPoisonStateOf(gs.getState())!.preparations[contact.preparationId].delivery==='contact')toolkitError('POISON_CONTACT_EVENT_REQUIRED','This actual provision/container surface retains a contact dose. Explicitly resolve the actual touch and exposed/protected skin before consuming from it; no skin contact or silent disposal is inferred from an eating/drinking command.')
 const actual=actualNutritionResource(gs.getState(),input.itemId),plan=poisonPortionPlan({itemId:input.itemId,selectedUnits:input.units*(actual?.kind==='water'?4:1),operation:'consume',operationEventId:input.eventId,adjudicationId:input.poisonPortionAdjudicationId})
 if(plan?.doseInPortion){preflightActualPoisonExposure(plan.prep.templateId,'player',input.midnightAt);if(Object.keys(playerPoisonStateOf(gs.getState())?.receipts??{}).length>=2048)toolkitError('PLAYER_POISON_EVENT_LIMIT','Retained actual ingestion history is full before provision debit or the original CON die.')}
 else if(input.midnightAt!==undefined)toolkitError('POISON_MIDNIGHT_ARGUMENT_INVALID','An actual next-midnight timestamp belongs only to this real whole Midnight Tears dose being swallowed now.')
 return plan
}
export function completePoisonedProvisions(plan:PoisonPortionPlan,input:ConsumeProvisionsInput,result:Record<string,unknown>){
 if(!plan)return result
 commitPoisonPortionRuling(plan)
 if(!plan.doseInPortion){refreshPoisonNutrition(plan.prep.id,input.itemId);const output={...result,wholePoisonDoseRetained:true,preparationId:plan.prep.id};gs.getState().dmTools!.survival!.receipts[input.eventId].result=structuredClone(output);return output}
 const id='nutrition:'+createHash('sha256').update(input.eventId).digest('hex'),command=JSON.stringify({operation:'actual_whole_dose_ingestion',eventId:input.eventId,input,preparationId:plan.prep.id,witness:plan.witness,selectedUnits:plan.selectedUnits})
 plan.prep.status='delivered';plan.prep.deliveryEventId=id
 const resource=poisonNutritionStateOf(gs.getState())!.resources[plan.prep.id];resource.units=0;resource.updatedAt=gs.getState().worldTimeSeconds??0
 const answer=startActualPlayerPoisonDelivery({id,command,templateId:plan.prep.templateId,targetId:'player',preparationId:plan.prep.id,midnightAt:input.midnightAt,
  baseAttack:{...result,wholePoisonDoseSwallowed:true,preparationId:plan.prep.id,playerPoisonContinuation:{domain:'nutrition-ingestion',eventId:input.eventId}}})
 const output=JSON.parse(answer.content[0].text) as Record<string,unknown>
 if(output.pendingReaction){const receipt=gs.getState().dmTools!.survival!.receipts[input.eventId];receipt.result={...result,wholePoisonDoseSwallowed:true,preparationId:plan.prep.id,deliveryId:id,pendingReaction:output.pendingReaction,ingestionPending:true};return receipt.result}
 return output
}
export function registerPoisonNutritionConsumption(){
 registerPlayerPoisonContinuation('nutrition-ingestion',deliveryId=>{
  const delivery=playerPoisonStateOf(gs.getState())!.deliveries[deliveryId],continuation=delivery.baseAttack!.playerPoisonContinuation as{eventId:string},receipt=gs.getState().dmTools?.survival?.receipts[continuation.eventId]
  if(!receipt)toolkitError('POISON_NUTRITION_RECEIPT_REQUIRED','This source CON follows an already committed actual ingestion, never a newly invented meal, dose or intake.')
  receipt!.result=structuredClone({...delivery.result,ingestionPending:false});return toolkitResult(receipt!.result)
 })
}
