import { assertGreaterBrewingIdAvailable } from './toolkit'
import { createHash } from 'node:crypto'
import type { GameState,Item } from '../lib/types'
import { GroundGearTransferStartSchema,GroundGearTransferWorkSchema,GroundGearTransferFinishSchema,GroundGearTransferCancelSchema,type GroundGearTransfer,type GroundGearTransferStart } from '../lib/ground-gear-transfer-state'
import { groundGearPhysicalWitness,groundGearRecoveryActivityIssue } from '../lib/ground-gear-recovery-state'
import { groundGearTurnKey,type GroundGearState } from '../lib/ground-gear-state'
import { carryingItemContext,inspectCarryingCapacity,physicalWeightKey } from '../lib/carrying-state'
import { GROUND_GEAR } from '../lib/srd/ground-gear'
import { groundGearState,groundGearReceipt,rememberGroundGear,groundGearHistoryRoom,groundGearAction,assertGroundGearNoContact,preflightGroundGearWork,spendGroundGearWork,actualGroundGearFact } from './ground-gear'
import { toolkitError } from './toolkit'
import { available,now } from './hero-rules'
import { freeHands,afterInventoryChange } from './equipment'
import { preflightRestStrenuousInterval,recordRestMeasuredActivityInterval } from './resting'
import * as gs from './game-state'
import * as rules from './rules'
type Stock=GroundGearState['stocks'][string]
const jobs=()=>groundGearState().transfers??={}
const command=(operation:string,input:unknown)=>JSON.stringify({operation:`stock-transfer-${operation}`,input})
function ownedContainer(state:GameState,id:string){
 const item=state.player.inventory.find(i=>i.id===id)
 if(!item||item.type!=='misc'||item.quantity!==undefined&&item.quantity!==1||state.dmTools?.groundGear?.stocks[id]||state.droppedItems?.[id])toolkitError('GROUND_GEAR_TRANSFER_CONTAINER_REQUIRED','Select one real carried container instance, never a stock child, deposited item, stack or substitute bag.')
 return item!
}
function source(input:GroundGearTransferStart){
 const state=gs.getState(),stock=state.dmTools?.groundGear?.stocks[input.sourceStockItemId],item=state.player.inventory.find(i=>i.id===input.sourceStockItemId)
 if(!stock||!item||item.equipmentId!=='ground_gear_stock'||item.quantity!==1||stock.kind==='hunting_trap')toolkitError('GROUND_GEAR_TRANSFER_STOCK_REQUIRED','Choose actual counted loose caltrops or ball bearings already carried inside their real source container.')
 ownedContainer(state,stock!.containerItemId);ownedContainer(state,input.destinationContainerItemId)
 if(stock!.containerItemId===input.destinationContainerItemId)toolkitError('GROUND_GEAR_TRANSFER_DISTINCT_CONTAINERS','Choose the actual other container; the engine never fabricates a transfer within the same physical stock.')
 if(input.units>stock!.units)toolkitError('GROUND_GEAR_UNITS_UNAVAILABLE','Transfer no more than the exact counted source units.')
 if(input.availableCapacityUnits<input.units)toolkitError('GROUND_GEAR_CONTAINER_CAPACITY','The explicitly observed destination capacity cannot hold the selected added units.')
 const existing=Object.values(state.dmTools!.groundGear!.stocks).filter(s=>s.containerItemId===input.destinationContainerItemId&&s.kind===stock!.kind)
 let destination:Stock|undefined
 if(input.destinationStockItemId){destination=state.dmTools!.groundGear!.stocks[input.destinationStockItemId];if(!destination||destination.containerItemId!==input.destinationContainerItemId||destination.kind!==stock!.kind||!state.player.inventory.some(i=>i.id===destination!.itemId))toolkitError('GROUND_GEAR_TRANSFER_DESTINATION_STOCK','Choose the exact existing same-kind carried destination stock in that actual container; no target stock is selected or created automatically.')}
 else if(existing.length)toolkitError('GROUND_GEAR_TRANSFER_MERGE_CHOICE_REQUIRED','This real container already holds same-kind stock. Explicitly select destinationStockItemId to merge into it; no automatic fusion occurs.')
 for(const counted of [stock!,...destination?[destination]:[]])if(!(counted.lastRecoveryEventId||counted.lastTransferEventId)||new Set(counted.sourcePlacements).size!==counted.sourcePlacements.length||counted.sourcePlacements.some(id=>!state.dmTools!.groundGear!.placements[id]))toolkitError('GROUND_GEAR_TRANSFER_PROVENANCE_REQUIRED','The real counted contents need their actual collection/transfer receipt and existing source placements. No unknown legacy stock history is invented.')
 if(freeHands()<1)toolkitError('GROUND_GEAR_FREE_HAND_REQUIRED','Free one actual hand for this real transfer; carried contents provide no extra hand.')
 return{stock:stock!,destination}
}
function containerWitness(id:string){const state=gs.getState();return groundGearPhysicalWitness({item:ownedContainer(state,id),contents:Object.values(state.dmTools?.groundGear?.stocks??{}).filter(s=>s.containerItemId===id).sort((a,b)=>a.itemId.localeCompare(b.itemId)),water:state.dmTools?.foraging?.containers[id]??null})}
function validate(job:GroundGearTransfer){
 const state=gs.getState(),parts=source(job.input)
 if(state.currentMapId!==job.mapId||state.currentRoomId!==job.roomId||state.player.position.x!==job.cell.x||state.player.position.y!==job.cell.y||containerWitness(parts.stock.containerItemId)!==job.sourceWitness||containerWitness(job.input.destinationContainerItemId)!==job.destinationWitness)toolkitError('GROUND_GEAR_TRANSFER_CONTEXT_CHANGED','The actual source contents, destination contents, container or measured work location changed. Cancel and establish a new real procedure, without substituting a stock.')
 for(const snapshot of Object.values(job.facts))if(snapshot){const current=state.worldFacts?.find(f=>f.id===snapshot.id);if(!current||groundGearPhysicalWitness(current)!==groundGearPhysicalWitness(snapshot))toolkitError('GROUND_GEAR_TRANSFER_FACT_CHANGED','Retain the real capacity/mass facts; no past measurement is reconstructed.')}
 return parts
}
function projectedCompletion(job:GroundGearTransfer){
 assertGreaterBrewingIdAvailable(job.destinationStockItemId)
 const {stock,destination}=source(job.input),input=job.input,future=structuredClone(gs.getState()),data=future.dmTools!.groundGear!,remaining=stock.units-input.units,total=(destination?.units??0)+input.units
 if(total>1000000)toolkitError('GROUND_GEAR_STOCK_LIMIT','This exact resulting stock exceeds the retained numeric bound.')
 const placements=[...new Set([...(destination?.sourcePlacements??[]),...stock.sourcePlacements])];if(placements.length>256)toolkitError('GROUND_GEAR_STOCK_HISTORY_LIMIT','The transfer cannot discard real source placement provenance.')
 if(!data.stocks[job.destinationStockItemId]&&Object.keys(data.stocks).length-(remaining?0:1)>=512)toolkitError('GROUND_GEAR_STOCK_REGISTRY_LIMIT','No real counted-stock identity remains before any transfer work.')
 const stocks:Record<string,Stock>={},removedStockItemIds:string[]=[]
 const put=(original:Stock,id:string,units:number,containerItemId:string,weightLb:number|undefined,fact:Record<string,unknown>|undefined)=>{
  const value:Stock={itemId:id,kind:original.kind,units,containerItemId,sourcePlacements:id===stock.itemId&&remaining?stock.sourcePlacements:placements,at:now(),lastTransferEventId:'pending',...(weightLb!==undefined?{measuredWeightLb:weightLb,weightFact:fact}:{})}
  data.stocks[id]=value;stocks[id]=value
  const item:Item={id,equipmentId:'ground_gear_stock',name:`Stock réel — ${GROUND_GEAR[value.kind].label} (${units} unités)`,type:'misc',quantity:1,description:`${units} actual counted units in existing container ${containerItemId}; no replacement bag or prorated mass.`}
  const index=future.player.inventory.findIndex(i=>i.id===id);if(index<0)future.player.inventory.push(item);else future.player.inventory[index]=item
  const carrying=future.dmTools!.carrying,key=physicalWeightKey('item',id)
  if(weightLb!==undefined&&carrying?.weights[key])carrying.weights[key]={targetKind:'item',targetId:id,weightLb,unit:'lb_per_inventory_unit',context:carryingItemContext(future,item),reason:`Actual total resulting counted contents measured for ${job.id}.`,source:`Physical fact ${String(fact?.id)}; no fractional full-lot inference.`}
 }
 if(remaining)put(stock,stock.itemId,remaining,stock.containerItemId,input.measuredSourceRemainingWeightLb,job.facts.sourceWeight)
 else{delete data.stocks[stock.itemId];future.player.inventory=future.player.inventory.filter(i=>i.id!==stock.itemId);if(job.destinationStockItemId!==stock.itemId)removedStockItemIds.push(stock.itemId)}
 put(stock,job.destinationStockItemId,total,input.destinationContainerItemId,input.measuredDestinationWeightLb,job.facts.destinationWeight)
 if(future.dmTools?.carrying?.actors.player?.tracking){const capacity=inspectCarryingCapacity(future);if(capacity.status==='unresolved')toolkitError('CARRYING_DATA_REQUIRED','Active carrying requires valid measured TOTAL masses for each resulting stock and real containers before work; no partial mass is divided from the full bag.');if(capacity.overloaded)toolkitError('CARRYING_CAPACITY_EXCEEDED','The exact future carried contents exceed the actual standard carrying capacity.')}
 return{future,stocks,removedStockItemIds,sourceUnitsBefore:stock.units,sourceUnitsAfter:remaining,destinationUnitsBefore:destination?.units??0,destinationUnitsAfter:total}
}
function snapshot(job:GroundGearTransfer){return{success:true,transferId:job.id,status:job.status,workedSeconds:job.workedSeconds,requiredSeconds:job.requiredSeconds,remainingWorkSeconds:job.requiredSeconds-job.workedSeconds,earliestCompletionAt:job.startedAt+job.requiredSeconds,unitsTransferred:0,interpretation:'Transfer duration/capacity are explicit physical MJ adjudications. Combat credits at most6seconds per actual action without advancing the round clock; no contents move until finish.'}}
function work(job:GroundGearTransfer,eventId:string,seconds:number,activity:'light'|'strenuous',reason:string){
 groundGearAction();groundGearHistoryRoom();validate(job);projectedCompletion(job)
 if(['completed','cancelled'].includes(job.status))toolkitError('GROUND_GEAR_TRANSFER_CLOSED','This actual transfer attempt is already closed.')
 if(seconds>job.requiredSeconds-job.workedSeconds)toolkitError('GROUND_GEAR_TRANSFER_WORK_INVALID','Choose positive real work no longer than the exact remaining duration.')
 const combat=gs.getState().phase==='combat',turnKey=combat?groundGearTurnKey(gs.getState()):undefined
 if(combat&&seconds>6)toolkitError('GROUND_GEAR_TRANSFER_COMBAT_WORK','One actual combat action credits at most6seconds, without an extra action or clock tick.')
 if(job.segments.length>=512)toolkitError('GROUND_GEAR_TRANSFER_SEGMENT_LIMIT','The retained real work history is full.')
 const boundary=groundGearRecoveryActivityIssue(gs.getState(),combat?0:seconds);if(boundary)toolkitError(boundary.code,boundary.message)
 preflightRestStrenuousInterval();preflightGroundGearWork('player',combat?0:seconds)
 const from=now();spendGroundGearWork('player',combat?0:seconds);job.workedSeconds+=seconds;job.lastWorkedAt=now();job.segments.push({eventId,from,to:now(),seconds,phase:combat?'combat':'exploration',...(turnKey?{turnKey}:{}),restActivity:activity,source:reason})
 if(!combat)recordRestMeasuredActivityInterval({eventId:`ground-gear:${eventId}`,from,to:now(),activity,reason:reason.slice(0,600)})
 job.status=job.workedSeconds<job.requiredSeconds?'working':now()-job.startedAt<job.requiredSeconds?'awaiting_time':'ready';return snapshot(job)
}
export function startGroundGearTransfer(raw:unknown){
 const input=GroundGearTransferStartSchema.parse(raw),cmd=command('start',input),old=groundGearReceipt(input.eventId,cmd);if(old)return{...old,replayed:true}
 groundGearAction();groundGearHistoryRoom();const {stock,destination}=source(input),state=gs.getState()
 if(jobs()[input.transferId]||Object.keys(jobs()).length>=128)toolkitError('GROUND_GEAR_TRANSFER_REGISTRY_LIMIT','Use a new exact real transfer identity within the bounded retained history.')
 const containers=[stock.containerItemId,input.destinationContainerItemId]
 if(Object.values(jobs()).some(j=>!['completed','cancelled'].includes(j.status)&&(containers.includes(j.input.destinationContainerItemId)||j.input.sourceStockItemId===stock.itemId)))toolkitError('GROUND_GEAR_TRANSFER_ALREADY_ACTIVE','Continue or explicitly cancel the real overlapping transfer attempt before starting another.')
 if((input.measuredSourceRemainingWeightLb===undefined)!==(input.sourceWeightFactId===undefined)||(input.measuredDestinationWeightLb===undefined)!==(input.destinationWeightFactId===undefined))toolkitError('GROUND_GEAR_MASS_FACT_REQUIRED','Each measured total mass needs its explicit actual physical fact.')
 if(input.units===stock.units&&input.measuredSourceRemainingWeightLb!==undefined)toolkitError('GROUND_GEAR_TRANSFER_SOURCE_EMPTY','A truly emptied source has no remaining contents mass to measure; the real empty container remains.')
 const destinationId=destination?.itemId??(input.units===stock.units?stock.itemId:`ground-gear-stock:${createHash('sha256').update(input.eventId).digest('hex').slice(0,32)}`)
 assertGreaterBrewingIdAvailable(destinationId)
 if(!destination&&destinationId!==stock.itemId&&(state.player.inventory.some(i=>i.id===destinationId)||state.droppedItems?.[destinationId]||state.dmTools?.groundGear?.stocks[destinationId]))toolkitError('GROUND_GEAR_STOCK_ID_CONFLICT','The split contents identity already belongs to another actual instance.')
 const fact=(id:string|undefined,itemId:string)=>id?actualGroundGearFact(id,state.player.position,itemId):undefined
 const job:GroundGearTransfer={id:input.transferId,sequence:Object.keys(jobs()).length+1,input,mapId:state.currentMapId!,roomId:state.currentRoomId!,cell:{...state.player.position},startedAt:now(),lastWorkedAt:now(),requiredSeconds:input.requiredSeconds,workedSeconds:0,status:'working',sourceWitness:containerWitness(stock.containerItemId),destinationWitness:containerWitness(input.destinationContainerItemId),destinationStockItemId:destinationId,
  facts:{container:fact(input.containerFactId,input.destinationContainerItemId)!,sourceWeight:fact(input.sourceWeightFactId,stock.itemId),destinationWeight:fact(input.destinationWeightFactId,input.destinationContainerItemId)},segments:[]}
 projectedCompletion(job);jobs()[job.id]=job;return rememberGroundGear(input.eventId,cmd,work(job,input.eventId,input.workSeconds,input.restActivity,input.activitySource))
}
export function continueGroundGearTransfer(raw:unknown){const input=GroundGearTransferWorkSchema.parse(raw),cmd=command('work',input),old=groundGearReceipt(input.eventId,cmd);if(old)return{...old,replayed:true};const job=jobs()[input.transferId]??toolkitError('GROUND_GEAR_TRANSFER_REQUIRED','Choose the actual retained transfer attempt.');return rememberGroundGear(input.eventId,cmd,work(job,input.eventId,input.workSeconds,input.restActivity,input.activitySource))}
export function finishGroundGearTransfer(raw:unknown){
 const input=GroundGearTransferFinishSchema.parse(raw),cmd=command('finish',input),old=groundGearReceipt(input.eventId,cmd);if(old)return{...old,replayed:true}
 const job=jobs()[input.transferId]??toolkitError('GROUND_GEAR_TRANSFER_REQUIRED','Choose the actual retained transfer attempt.')
 if(job.status==='completed')return{...job.result,replayed:true};if(job.status==='cancelled')toolkitError('GROUND_GEAR_TRANSFER_CLOSED','This real transfer was cancelled without moving units.')
 assertGroundGearNoContact();available();groundGearHistoryRoom();if(gs.getState().phase==='combat')rules.validateFreeCombatAction('player');else rules.validateActionUse('player')
 validate(job);if(job.workedSeconds!==job.requiredSeconds||now()-job.startedAt<job.requiredSeconds)toolkitError('GROUND_GEAR_TRANSFER_NOT_DUE','Complete both actual work and elapsed duration first; waiting alone transfers no units.')
 const next=projectedCompletion(job),state=gs.getState();for(const stock of Object.values(next.stocks))stock.lastTransferEventId=input.eventId
 state.player.inventory=next.future.player.inventory;state.dmTools!.groundGear!.stocks=next.future.dmTools!.groundGear!.stocks;if(next.future.dmTools?.carrying)state.dmTools!.carrying=next.future.dmTools.carrying
 job.status='completed';job.completedAt=now();job.completionEventId=input.eventId;job.result={success:true,transferId:job.id,unitsTransferred:job.input.units,stocks:next.stocks,removedStockItemIds:next.removedStockItemIds,sourceUnitsBefore:next.sourceUnitsBefore,sourceUnitsAfter:next.sourceUnitsAfter,destinationUnitsBefore:next.destinationUnitsBefore,destinationUnitsAfter:next.destinationUnitsAfter,sourceContainerRetained:true,destinationContainerItemId:job.input.destinationContainerItemId,actionSpent:false,worldTimeSeconds:now(),interpretation:'Only actual chosen contents moved between existing containers. A complete20/1000unit stock remains counted contents in its real container, never a replacement full bag.'}
 afterInventoryChange();return rememberGroundGear(input.eventId,cmd,job.result)
}
export function cancelGroundGearTransfer(raw:unknown){const input=GroundGearTransferCancelSchema.parse(raw),cmd=command('cancel',input),old=groundGearReceipt(input.eventId,cmd);if(old)return{...old,replayed:true};const job=jobs()[input.transferId]??toolkitError('GROUND_GEAR_TRANSFER_REQUIRED','Choose the actual retained transfer attempt.');groundGearHistoryRoom();if(job.status==='completed')toolkitError('GROUND_GEAR_TRANSFER_COMPLETED','An actual completed transfer cannot be cancelled or refunded.');if(job.status==='cancelled')return{success:true,transferId:job.id,alreadyCancelled:true,unitsTransferred:0};job.status='cancelled';job.cancelledAt=now();job.cancellationEventId=input.eventId;job.cancellationReason=input.reason;return rememberGroundGear(input.eventId,cmd,{success:true,transferId:job.id,cancelled:true,unitsTransferred:0,timeRefunded:0,actionSpent:false,reason:input.reason})}
