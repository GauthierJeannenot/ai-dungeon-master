import type { Item } from '../lib/types'
import { carryingStateOf,physicalTargetOf,inspectCarryingCapacity,inspectCarryingAcquisition,physicalWeightKey,type CarryingAcquisition,type CarryingState,type CarryingSize,type PhysicalWeight } from '../lib/carrying-state'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { COUNTED_AMMUNITION_WEIGHTS } from '../lib/srd/weights'
import { coinCount,emptyCoins } from '../lib/srd/currency'
import { toolkitState,toolkitError } from './toolkit'
import { RuleViolation } from './rules'
import * as gs from './game-state'

type ReceiptInput={eventId:string;reason:string;source:string}
const data=()=>((toolkitState() as ReturnType<typeof toolkitState>&{carrying?:CarryingState}).carrying??={version:1,actors:{},weights:{},receipts:{}})
function remembered(input:ReceiptInput&object){
  if(gs.getState().hero?.pending)toolkitError('REACTION_PENDING','Resolve the actual held roll before changing physical carrying facts.')
  const command=JSON.stringify(input),old=carryingStateOf(gs.getState())?.receipts[input.eventId]
  if(old){if(old.command!==command)toolkitError('CARRYING_EVENT_CONFLICT','This retained event already states different immutable physical facts.');return {command,result:{...old.result,replayed:true}}}
  if(Object.keys(carryingStateOf(gs.getState())?.receipts??{}).length>=512)toolkitError('CARRYING_HISTORY_LIMIT','The retained carrying fact receipts are full; no old source witness is erased.')
  return {command}
}
export function setCarryingContext(input:ReceiptInput&{entityId:'player';size:CarryingSize}){
  const receipt=remembered(input);if(receipt.result)return receipt.result
  data().actors.player={entityId:'player',size:input.size,reason:input.reason,source:input.source,tracking:true}
  const result={success:true,actionSpent:false,carrying:inspectCarryingCapacity(gs.getState()),
    mechanicalSummary:'Suivi physique des règles standard activé à partir des faits explicites ; aucune histoire, masse absente ou variante d’encombrement n’est inventée.'}
  data().receipts[input.eventId]={command:receipt.command,result};return result
}
function actualTarget(kind:PhysicalWeight['targetKind'],id:string,includesCarriedEquipment=carryingStateOf(gs.getState())?.weights[physicalWeightKey(kind,id)]?.includesCarriedEquipment){
  const target=physicalTargetOf(gs.getState(),kind,id,includesCarriedEquipment)
  if(!target)toolkitError(kind==='item'?'PHYSICAL_ITEM_REQUIRED':kind==='object'?'PHYSICAL_OBJECT_REQUIRED':'PHYSICAL_CREATURE_REQUIRED','Choose an actual existing physical target ID; no archive, item or table request is materialized.')
  return target!
}
export function declarePhysicalWeight(input:ReceiptInput&{targetKind:PhysicalWeight['targetKind'];targetId:string;weightLb:number;unit:PhysicalWeight['unit'];includesCarriedEquipment?:boolean}){
  const receipt=remembered(input);if(receipt.result)return receipt.result
  if((input.targetKind==='item')!==(input.unit==='lb_per_inventory_unit'))toolkitError('PHYSICAL_WEIGHT_UNIT_INVALID','Items require pounds per actual inventory unit; bodies and scene objects require their whole actual mass.')
  if(input.includesCarriedEquipment!==undefined&&input.targetKind!=='creature')toolkitError('PHYSICAL_GEAR_SCOPE_INVALID','Equipment scope belongs only to a whole creature transport payload.')
  const actual=actualTarget(input.targetKind,input.targetId,input.includesCarriedEquipment??false)
  if(actual.item&&(actual.item.ammunitionType||COUNTED_AMMUNITION_WEIGHTS.has(actual.item.equipmentId??actual.item.id))
    &&(!Number.isSafeInteger(actual.item.quantity)||actual.item.quantity!<0))toolkitError('CARRYING_QUANTITY_REQUIRED','The real ammunition quantity must already exist; a mass declaration cannot fabricate legacy stock.')
  const key=physicalWeightKey(input.targetKind,input.targetId)
  if(!carryingStateOf(gs.getState())?.weights[key]&&Object.keys(carryingStateOf(gs.getState())?.weights??{}).length>=512)
    toolkitError('PHYSICAL_WEIGHT_LIMIT','The retained physical weight registry is full.')
  const {eventId:_eventId,...definition}=input
  const record:PhysicalWeight={...definition,context:actual.context}
  data().weights[key]=record
  const result={success:true,actionSpent:false,physicalWeight:record,
    mechanicalSummary:'Masse physique de cette instance enregistrée depuis sa source explicite ; aucune quantité, prise, activation ou position n’est modifiée.'}
  data().receipts[input.eventId]={command:receipt.command,result};return result
}
export function assertCarryingAcquisition(input:CarryingAcquisition){
  if(!carryingStateOf(gs.getState())?.actors.player?.tracking)return
  // A spend or a lighter exchange remains possible while overloaded or while
  // unrelated mass data are missing. Compare physical pieces, never value.
  if(!(input.additionalItems?.length)&&(!input.walletAfter||coinCount(input.walletAfter)<=coinCount(gs.getState().dmTools?.wallet??emptyCoins())))return
  const snapshot=inspectCarryingAcquisition(gs.getState(),input)
  if(snapshot.status==='unresolved')throw new RuleViolation('CARRYING_DATA_REQUIRED','Active standard carrying requires real masses and quantities before this acquisition.',{missing:snapshot.missing})
  if(snapshot.overloaded)throw new RuleViolation('CARRYING_CAPACITY_EXCEEDED','This exact physical acquisition would exceed standard carrying capacity.',{carriedWeightLb:snapshot.carriedWeightLb,carryingCapacityLb:snapshot.carryingCapacityLb})
}
export function assertCarryingPickup(item:Item){assertCarryingAcquisition({additionalItems:[item]})}
export function assessHandlingLoad(input:{entityId:string;targetKind:PhysicalWeight['targetKind'];targetId:string;operation:'carry'|'push'|'drag'|'lift'}){
  if(input.targetKind==='creature'&&input.targetId===input.entityId)toolkitError('PHYSICAL_SELF_HANDLING_INVALID','A creature cannot carry, lift, push or drag its own body as a separate load.')
  const state=gs.getState(),capacity=inspectCarryingCapacity(state,input.entityId),actual=actualTarget(input.targetKind,input.targetId)
  let weightLb:number|null=null,missing:string|undefined
  if(actual.item){
    const projection=inspectCarryingCapacity({...state,player:{...state.player,inventory:[]}},'player',[actual.item])
    const entry=projection.items[0];weightLb=entry.weightLb;missing=entry.missing
  }else{
    const record=carryingStateOf(state)?.weights[physicalWeightKey(input.targetKind,input.targetId)]
    if(!record)missing='physical_target_mass_required'
    else if(record.context!==actual.context)missing='physical_target_context_changed'
    else weightLb=record.weightLb
  }
  const maximumLb=input.operation==='carry'?capacity.carryingCapacityLb:capacity.pushDragLiftLimitLb
  const held=activePhysicalLoad(state)
  const alreadyCarried=input.entityId==='player'&&(input.targetKind==='item'&&state.player.inventory.some(item=>item.id===input.targetId)
    ||held?.operation==='carry'&&held.targetId===input.targetId&&held.targetKind===input.targetKind)
  const assessedWeightLb=input.operation!=='carry'?weightLb:capacity.carriedWeightLb===null||weightLb===null?null
    :capacity.carriedWeightLb+(alreadyCarried?0:weightLb)
  const complete=assessedWeightLb!==null&&maximumLb!==undefined,permits=complete?assessedWeightLb!<=maximumLb!:null
  return {entityId:input.entityId,targetKind:input.targetKind,targetId:input.targetId,operation:input.operation,
    rule:'standard2014',status:complete?'resolved':'unresolved',targetWeightLb:weightLb,assessedWeightLb,maximumLb:maximumLb??null,
    loadBasis:input.operation==='carry'?'target_plus_actual_carried_inventory':'target_only',capacityPermits:permits,
    pushingDraggingSpeedLimitFeet:permits&&['push','drag'].includes(input.operation)&&weightLb!>capacity.carryingCapacityLb!?5:null,
    missing:[...(capacity.size===null?['actual_actor_size_required']:[]),...(capacity.strength===null?['actual_strength_required']:[]),
      ...(input.operation==='carry'&&capacity.carriedWeightLb===null?['actual_carried_inventory_mass_required']:[]),...(missing?[missing]:[])],
    actionResolved:false,movementResolved:false,
    mechanicalSummary:'Évaluation de capacité seulement : aucun levage, transport, déplacement, prise ou succès physique n’est accompli par cette lecture.'}
}
