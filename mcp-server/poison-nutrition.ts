import { actualNutritionResource,poisonNutritionStateOf,type PoisonNutritionState } from '../lib/poison-nutrition-state'
import { activePlayerPoison,movePlayerPoisonSurface,playerPoisonStateOf } from '../lib/player-poison-state'
import { observedPlayerPoisonFact } from './player-poison-core'
import { poisonSurfaceLocation } from './player-poison-exposure'
import { available } from './hero-rules'
import { toolkitError,toolkitState,assertToolkitReach } from './toolkit'
import * as gs from './game-state'
type Resource=NonNullable<ReturnType<typeof actualNutritionResource>>
const key=(itemId:string)=>JSON.stringify(['item',itemId])
const data=():PoisonNutritionState=>toolkitState().poisonNutrition??={version:1,resources:{},adjudications:{}}
export function preflightPoisonNutritionPreparation(itemId:string){
 const resource=actualNutritionResource(gs.getState(),itemId);if(!resource)return undefined
 if(itemId.length>160)toolkitError('POISON_NUTRITION_ITEM_ID_UNSUPPORTED','This exact resource identity exceeds the existing consume_provisions item-ID bound; resolve that original item identity before spending a physical dose.')
 if(resource.units<=0)toolkitError('POISON_ACTUAL_FOOD_WATER_REQUIRED','The exact selected resource is empty; an empty vessel or exhausted ration is not actual food/liquid.')
 if(Object.keys(poisonNutritionStateOf(gs.getState())?.resources??{}).length>=256)toolkitError('POISON_NUTRITION_HISTORY_LIMIT','Retained actual dose/resource history is full before preparation.')
 return resource
}
export function recordPoisonNutritionPreparation(preparationId:string,resource:Resource|undefined){
 if(resource)data().resources[preparationId]={preparationId,...resource,initialUnits:resource.units,updatedAt:gs.getState().worldTimeSeconds??0}
}
export function actualPoisonedNutrition(itemId:string){
 const state=gs.getState(),witness=activePlayerPoison(state,key(itemId));if(!witness)return undefined
 const prep=playerPoisonStateOf(state)!.preparations[witness.preparationId];if(prep.delivery!=='ingested')return undefined
 const record=poisonNutritionStateOf(state)?.resources[prep.id],actual=actualNutritionResource(state,itemId)
 if(!record||!actual||record.itemId!==itemId||record.kind!==actual.kind||record.units!==actual.units)toolkitError('POISON_NUTRITION_CONTEXT_REQUIRED','This still-potent ingested dose needs its actual quantified resource and immutable preparation. No old scene portion, unknown dilution or missing volume is retrofitted automatically.')
 return{prep,witness,record:record!,actual:actual!}
}
export interface PoisonPortionInput{eventId:string;preparationId:string;operation:'consume'|'transfer';operationEventId:string;sourceItemId:string;targetItemId?:string;selectedUnits:number;disposition:'selected_portion'|'remainder';physicalFactId:string;wholeDoseDispositionConfirmed:true;source:string}
export function adjudicatePoisonPortion(input:PoisonPortionInput){
 const command=JSON.stringify(input),old=poisonNutritionStateOf(gs.getState())?.adjudications[input.eventId]
 if(old){if(old.command!==command)toolkitError('POISON_PORTION_EVENT_CONFLICT','Retain this exact recorded whole-dose physical disposition and its selected actual operation.');return{success:true,adjudication:structuredClone(old),replayed:true,actionSpent:false}}
 available();const poisoned=actualPoisonedNutrition(input.sourceItemId)
 if(!poisoned||poisoned.prep.id!==input.preparationId)toolkitError('POISON_PORTION_ACTUAL_DOSE_REQUIRED','Select the exact actual potent ingested dose currently in this real resource; no mixture, portion, dose or potency is created.')
 if(input.selectedUnits<=0||input.selectedUnits>poisoned!.actual.units)toolkitError('POISON_PORTION_QUANTITY_REQUIRED','Select only actual existing half-pounds of food or quarter-pints of water for the exact future operation.')
 if(input.operation==='transfer'&&(!input.targetItemId||input.targetItemId===input.sourceItemId||poisoned!.actual.kind!=='water')||input.operation==='consume'&&input.targetItemId!==undefined)toolkitError('POISON_PORTION_OPERATION_INVALID','Food/water consumption has the existing player as recipient; water transfer selects a different actual container. No food split or new recipient is invented.')
 if(input.selectedUnits===poisoned!.actual.units&&input.disposition==='remainder')toolkitError('POISON_PORTION_NO_REMAINDER','The whole actual resource cannot leave a dose in a nonexistent remainder.')
 const location=poisonSurfaceLocation(poisoned!.prep);assertToolkitReach(location!);const physicalFact=observedPlayerPoisonFact(input.physicalFactId,location!.cell,input.sourceItemId)
 if(input.targetItemId){const target=actualNutritionResource(gs.getState(),input.targetItemId);if(!target||target.kind!=='water'||!gs.getState().dmTools?.foraging?.containers[input.targetItemId]||!gs.getState().dmTools?.foraging?.containers[input.sourceItemId])toolkitError('POISON_PORTION_TARGET_CONTAINER_REQUIRED','Choose an actual registered target water container before recording its real transfer disposition.')}
 if(Object.keys(poisonNutritionStateOf(gs.getState())?.adjudications??{}).length>=1024)toolkitError('POISON_PORTION_HISTORY_LIMIT','Retained actual whole-dose rulings are full before a new adjudication.')
 const record:PoisonNutritionState['adjudications'][string]={command,preparationId:input.preparationId,sourceItemId:input.sourceItemId,kind:poisoned!.actual.kind,totalUnits:poisoned!.actual.units,selectedUnits:input.selectedUnits,operation:input.operation,operationEventId:input.operationEventId,targetItemId:input.targetItemId,disposition:input.disposition,physicalFact,source:input.source,recordedAt:gs.getState().worldTimeSeconds??0}
 data().adjudications[input.eventId]=record
 return{success:true,adjudication:structuredClone(record),actionSpent:false,interpretation:'Explicit MJ physical disposition of ONE ENTIRE real dose: selected portion or actual remainder. This never declares uniform mixture, fractional potency, proportional damage, a new portion or a free dose.'}
}
export function poisonPortionPlan(input:{itemId:string;selectedUnits:number;operation:'consume'|'transfer';operationEventId:string;targetItemId?:string;adjudicationId?:string}){
 const poisoned=actualPoisonedNutrition(input.itemId)
 if(!poisoned){if(input.adjudicationId)toolkitError('POISON_PORTION_ARGUMENT_INVALID','There is no actual potent ingested dose in this resource for the chosen ruling.');return undefined}
 if(!Number.isInteger(input.selectedUnits)||input.selectedUnits<=0||input.selectedUnits>poisoned.actual.units)toolkitError('POISON_PORTION_QUANTITY_REQUIRED','Choose an actual positive portion within this existing resource, not inferred half-dose effects.')
 const ruling=input.adjudicationId?poisonNutritionStateOf(gs.getState())?.adjudications[input.adjudicationId]:undefined
 if(input.adjudicationId&&(!ruling||ruling.usedBy||ruling.preparationId!==poisoned.prep.id||ruling.sourceItemId!==input.itemId||ruling.totalUnits!==poisoned.actual.units||ruling.selectedUnits!==input.selectedUnits||ruling.operation!==input.operation||ruling.operationEventId!==input.operationEventId||ruling.targetItemId!==input.targetItemId))toolkitError('POISON_PORTION_CONTEXT_CHANGED','Use an unused exact ruling for this original operation, whole dose, source/target and still-current quantity before any debit or saving die.')
 if(input.selectedUnits<poisoned.actual.units&&!ruling)toolkitError('POISON_WHOLE_DOSE_DISPOSITION_REQUIRED','The DMG requires the whole dose swallowed. Before this partial consumption/transfer, explicitly establish whether the ENTIRE dose follows the real selected portion or remains in the actual remainder. Partial potency/distributed poison is not implemented or inferred.')
 return{...poisoned,selectedUnits:input.selectedUnits,doseInPortion:ruling?ruling.disposition==='selected_portion':true,adjudicationId:input.adjudicationId,operationEventId:input.operationEventId}
}
export type PoisonPortionPlan=ReturnType<typeof poisonPortionPlan>
export function commitPoisonPortionRuling(plan:PoisonPortionPlan){if(plan?.adjudicationId)data().adjudications[plan.adjudicationId].usedBy=plan.operationEventId}
export function refreshPoisonNutrition(preparationId:string,itemId:string){
 const actual=actualNutritionResource(gs.getState(),itemId),record=data().resources[preparationId]
 if(!record||!actual)toolkitError('POISON_NUTRITION_PHYSICAL_RESOURCE_REQUIRED','The real committed transfer must preserve this exact physical resource; no missing recipient or amount is manufactured.')
 record.itemId=itemId;record.kind=actual!.kind;record.units=actual!.units;record.updatedAt=gs.getState().worldTimeSeconds??0
}
export function planWaterPoisonTransfer(input:{eventId:string;sourceItemId?:string;targetItemId:string;quarterPints:number;poisonPortionAdjudicationId?:string}){
 const source=input.sourceItemId?poisonPortionPlan({itemId:input.sourceItemId,selectedUnits:input.quarterPints,operation:'transfer',operationEventId:input.eventId,targetItemId:input.targetItemId,adjudicationId:input.poisonPortionAdjudicationId}):undefined
 const target=actualPoisonedNutrition(input.targetItemId)
 const targetSurface=activePlayerPoison(gs.getState(),key(input.targetItemId))
 if(source?.doseInPortion&&targetSurface&&targetSurface.preparationId!==source.prep.id&&!target)toolkitError('POISON_CONTAINER_SURFACE_OCCUPIED','The current item surface already carries a different real contact/injury application. Separate inside/outside surfaces are not represented by this one physical key; do not overwrite either dose during pouring.')
 if(source?.doseInPortion&&target)toolkitError('POISON_TWO_DOSE_MIXTURE_UNSUPPORTED','This actual transfer would mix two potent doses. Their combined delivery, distribution and effects require a separate explicit procedure; neither dose is overwritten or multiplied.')
 return{source,targetPreparationId:target?.prep.id,targetItemId:input.targetItemId}
}
export type WaterPoisonTransferPlan=ReturnType<typeof planWaterPoisonTransfer>
export function commitWaterPoisonTransfer(plan:WaterPoisonTransferPlan){
 const source=plan.source
 if(source){commitPoisonPortionRuling(source);if(source.doseInPortion){movePlayerPoisonSurface(gs.getState(),source.witness,{kind:'item',id:plan.targetItemId,key:key(plan.targetItemId)});refreshPoisonNutrition(source.prep.id,plan.targetItemId)}else refreshPoisonNutrition(source.prep.id,source.record.itemId)}
 if(plan.targetPreparationId)refreshPoisonNutrition(plan.targetPreparationId,plan.targetItemId)
}
