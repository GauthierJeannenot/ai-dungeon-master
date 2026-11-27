import { assertGreaterBrewingIdAvailable } from './toolkit'
import { createHash } from 'node:crypto'
import type { Item,GameState } from '../lib/types'
import { GROUND_GEAR } from '../lib/srd/ground-gear'
import { GroundGearRecoveryStartSchema,GroundGearRecoveryWorkSchema,GroundGearRecoveryFinishSchema,GroundGearRecoveryCancelSchema,groundGearPhysicalWitness,groundGearRecoveryActivityIssue,type GroundGearRecovery,type GroundGearRecoveryStart } from '../lib/ground-gear-recovery-state'
import { groundGearTurnKey,type GroundGearPlacement } from '../lib/ground-gear-state'
import { carryingItemContext,inspectCarryingCapacity,physicalWeightKey } from '../lib/carrying-state'
import { entityVerticalContext } from '../lib/jumping-state'
import { groundGearState,groundGearReceipt,rememberGroundGear,groundGearHistoryRoom,groundGearAction,assertGroundGearNoContact,preflightGroundGearWork,spendGroundGearWork,actualGroundGearFact } from './ground-gear'
import { toolkitError,toolkitLocation,assertToolkitReach } from './toolkit'
import { available,now } from './hero-rules'
import { freeHands,afterInventoryChange } from './equipment'
import { preflightRestStrenuousInterval,recordRestMeasuredActivityInterval } from './resting'
import * as gs from './game-state'
import * as rules from './rules'

const jobs=()=>groundGearState().recoveries??={}
const witness=(value:unknown)=>JSON.stringify(value)
const sourcePlacement=(id:string)=>gs.getState().dmTools?.groundGear?.placements[id]??toolkitError('GROUND_GEAR_PLACEMENT_REQUIRED','Choose the actual placed equipment, not an item description.')
const stockId=(eventId:string)=>`ground-gear-stock:${createHash('sha256').update(eventId).digest('hex').slice(0,32)}`
function placementWitness(placed:GroundGearPlacement){return groundGearPhysicalWitness({id:placed.id,kind:placed.kind,itemId:placed.itemId,originalItem:placed.originalItem,mapId:placed.mapId,roomId:placed.roomId,cells:placed.cells,unitsRemaining:placed.unitsRemaining,status:placed.status,victimId:placed.victimId,anchor:placed.anchor,sourceContainerItemId:placed.sourceContainerItemId,sourceContainerOnGround:placed.sourceContainerOnGround})}
function actualPlace(placed:GroundGearPlacement){
 if(placed.status==='recovered'||placed.unitsRemaining<=0)toolkitError('GROUND_GEAR_ALREADY_RECOVERED','This real placement has no uncollected units.')
 const state=gs.getState(),vertical=entityVerticalContext(state,'player')
 if(placed.mapId!==state.currentMapId||placed.roomId!==state.currentRoomId||!vertical.known||vertical.airborne||vertical.zFeet!==placed.surfaceZFeet)toolkitError('GROUND_GEAR_RECOVERY_LOCATION','Reach this actual same-level ground placement before any recovery work; no remote collection or landing is inferred.')
 for(const cell of placed.cells)assertToolkitReach({mapId:placed.mapId,roomId:placed.roomId,cell,surfaceZFeet:placed.surfaceZFeet})
 if(freeHands()<1)toolkitError('GROUND_GEAR_FREE_HAND_REQUIRED','Free a real hand for the actual collection work.')
 if(placed.victimId)toolkitError('HUNTING_TRAP_VICTIM_REMAINS','Free the actual captive with the sourced trap procedure before recovering the trap.')
}
function actualContainer(input:GroundGearRecoveryStart,placed:GroundGearPlacement){
 const state=gs.getState()
 if(placed.kind==='hunting_trap'){
  if(input.containerItemId||input.containerFactId||input.actualContainerConfirmed||input.availableCapacityUnits||input.capacityForCurrentContentsConfirmed)toolkitError('HUNTING_TRAP_WHOLE_ITEM_RECOVERY','The supported whole-trap recovery returns the actual trap itself; it does not declare a steel trap to be a pouch or pack it inside another container.')
  return{item:placed.originalItem as unknown as Item,ground:true,selfTrap:true,cell:placed.cells[0]}
 }
 if(!input.containerItemId||!input.containerFactId||!input.actualContainerConfirmed||!input.capacityForCurrentContentsConfirmed||input.availableCapacityUnits===undefined)toolkitError('GROUND_GEAR_REAL_CONTAINER_REQUIRED','Choose a real container, its actual physical fact and explicitly established available capacity for these current contents.')
 if(input.availableCapacityUnits<input.units)toolkitError('GROUND_GEAR_CONTAINER_CAPACITY','The explicitly established available capacity cannot hold the chosen actual units.')
 if(state.dmTools?.groundGear?.stocks[input.containerItemId])toolkitError('GROUND_GEAR_CONTAINER_REQUIRED','A counted contents record is not another physical container.')
 const owned=state.player.inventory.find(item=>item.id===input.containerItemId)
 if(owned&&placed.sourceContainerOnGround&&placed.sourceContainerItemId===owned.id&&placed.itemId===owned.id)toolkitError('GROUND_GEAR_CONTAINER_ID_CONFLICT','The retained original container is still on the ground; another owned instance cannot silently replace that same physical identity.')
 if(owned){if(owned.type!=='misc'||owned.quantity!==undefined&&owned.quantity!==1)toolkitError('GROUND_GEAR_ONE_REAL_CONTAINER','Choose one exact actual container instance, not an uncounted stack.');return{item:owned,ground:false,selfTrap:false,cell:state.player.position}}
 if(placed.sourceContainerOnGround&&placed.sourceContainerItemId===input.containerItemId&&placed.itemId===input.containerItemId){
  assertToolkitReach({mapId:placed.mapId,roomId:placed.roomId,cell:placed.originalCells[0],surfaceZFeet:placed.surfaceZFeet})
  if(state.droppedItems?.[input.containerItemId])toolkitError('GROUND_GEAR_CONTAINER_ID_CONFLICT','This retained original container also has a separate deposited instance; resolve its actual identity first.')
  return{item:placed.originalItem as unknown as Item,ground:true,selfTrap:false,cell:placed.originalCells[0]}
 }
 toolkitError('GROUND_GEAR_REAL_CONTAINER_REQUIRED','The chosen container must already be owned or be this placement’s original physical container still on the ground.')
}
function containerWitness(input:GroundGearRecoveryStart,placed:GroundGearPlacement){
 const value=actualContainer(input,placed),state=gs.getState()
 return groundGearPhysicalWitness({item:value.item,ground:value.ground,selfTrap:value.selfTrap,stocks:Object.values(state.dmTools?.groundGear?.stocks??{}).filter(s=>s.containerItemId===value.item.id).sort((a,b)=>a.itemId<b.itemId?-1:a.itemId>b.itemId?1:0),water:state.dmTools?.foraging?.containers[value.item.id]??null})
}
function currentFacts(job:GroundGearRecovery){
 for(const snapshot of Object.values(job.facts))if(snapshot){const fact=gs.getState().worldFacts?.find(f=>f.id===snapshot.id);if(!fact||groundGearPhysicalWitness(fact)!==groundGearPhysicalWitness(snapshot))toolkitError('GROUND_GEAR_RECOVERY_FACT_CHANGED','The real physical capacity, coverage, mass or safe-handling fact changed or expired. Cancel this attempt and establish the actual new procedure; no source is reconstructed.')}
}
function validateJobSource(job:GroundGearRecovery){
 const placed=sourcePlacement(job.input.placementId);actualPlace(placed)
 if(placementWitness(placed)!==job.placementWitness||containerWitness(job.input,placed)!==job.containerWitness)toolkitError('GROUND_GEAR_RECOVERY_CONTEXT_CHANGED','The actual placement, remaining units or real container contents changed after this attempt began. No units or substitute container are fabricated.')
 currentFacts(job);return placed
}
function emptyOriginal(placed:GroundGearPlacement):Item{return{id:placed.itemId,equipmentId:'ground_gear_container',name:`Récipient réel vide — ${String(placed.originalItem.name??GROUND_GEAR[placed.kind].label)}`,type:'misc',quantity:1,description:'Original physical container retained after its actual contents were deployed; dry mass is not inferred from the published full-lot weight.'}}
function addMeasuredWeight(future:GameState,item:Item,weightLb:number,fact:Record<string,unknown>,job:GroundGearRecovery){
 const data=future.dmTools!.carrying??={version:1,actors:{},weights:{},receipts:{}},key=physicalWeightKey('item',item.id)
 if(!data.weights[key]&&Object.keys(data.weights).length>=512)toolkitError('PHYSICAL_WEIGHT_LIMIT','No capacity remains for the actual measured instance mass before collection work.')
 data.weights[key]={targetKind:'item',targetId:item.id,unit:'lb_per_inventory_unit',weightLb,context:carryingItemContext(future,item),reason:`Exact physical recovered contents/container measured for ${job.id}.`,source:`Physical fact ${String(fact.id)}: ${String(fact.text??'actual measured mass')}`.slice(0,1000)}
}
function projectedCompletion(job:GroundGearRecovery){
 assertGreaterBrewingIdAvailable(job.stockItemId)
 const reservedPlacement=sourcePlacement(job.input.placementId)
 assertGreaterBrewingIdAvailable(reservedPlacement.itemId)
 if(reservedPlacement.sourceContainerItemId)assertGreaterBrewingIdAvailable(reservedPlacement.sourceContainerItemId)
 const state=gs.getState(),placed=sourcePlacement(job.input.placementId),input=job.input,future=structuredClone(state),data=future.dmTools!.groundGear!,native=GROUND_GEAR[placed.kind]
 let item:Item,stock:typeof data.stocks[string]|undefined,restoredContainer:Item|undefined
 if(placed.sourceContainerOnGround&&placed.sourceContainerItemId===placed.itemId&&(state.player.inventory.some(i=>i.id===placed.itemId)||state.droppedItems?.[placed.itemId]))toolkitError('GROUND_GEAR_CONTAINER_ID_CONFLICT','The original still-grounded source container cannot overwrite another actual owned/deposited item with the same identity.')
 if(job.fullOriginal){item=structuredClone(placed.originalItem) as unknown as Item;future.player.inventory.push(item)}
 else{
  if(!job.initialStock&&(state.player.inventory.some(i=>i.id===job.stockItemId)||state.droppedItems?.[job.stockItemId]))toolkitError('GROUND_GEAR_STOCK_ID_CONFLICT','This exact real recovery event cannot overwrite an already existing physical item identity.')
  if(job.containerWasGround){restoredContainer=emptyOriginal(placed);future.player.inventory.push(restoredContainer)}
  const old=job.initialStock as typeof stock,units=(old?.units??0)+input.units
  if(!data.stocks[job.stockItemId]&&Object.keys(data.stocks).length>=512)toolkitError('GROUND_GEAR_STOCK_REGISTRY_LIMIT','No retained identity remains for a new real counted stock before any collection work.')
  if(units>1000000)toolkitError('GROUND_GEAR_STOCK_LIMIT','The real counted container stock exceeds the fixed registry bound.')
  const placements=[...new Set([...(old?.sourcePlacements??[]),placed.id])];if(placements.length>256)toolkitError('GROUND_GEAR_STOCK_HISTORY_LIMIT','This physical stock cannot discard its retained source placements.')
  stock={itemId:job.stockItemId,kind:placed.kind,units,containerItemId:input.containerItemId!,sourcePlacements:placements,at:now(),lastRecoveryEventId:'pending',
   ...(input.measuredStockWeightLb!==undefined?{measuredWeightLb:input.measuredStockWeightLb,weightFact:job.facts.stockWeight}:{})}
  data.stocks[stock.itemId]=stock
  item={id:stock.itemId,equipmentId:'ground_gear_stock',name:`Stock réel — ${native.label} (${units} unités)`,type:'misc',quantity:1,description:`${units} actual counted units in existing container ${stock.containerItemId}; no full bag, capacity or partial mass inferred.`}
  const index=future.player.inventory.findIndex(i=>i.id===item.id);if(index>=0)future.player.inventory[index]=item;else future.player.inventory.push(item)
  if(input.measuredStockWeightLb!==undefined&&future.dmTools!.carrying?.weights[physicalWeightKey('item',item.id)])addMeasuredWeight(future,item,input.measuredStockWeightLb,job.facts.stockWeight!,job)
  if(restoredContainer&&input.measuredContainerDryWeightLb!==undefined)addMeasuredWeight(future,restoredContainer,input.measuredContainerDryWeightLb,job.facts.containerWeight!,job)
 }
 if(future.dmTools!.carrying?.actors.player?.tracking){const capacity=inspectCarryingCapacity(future)
  if(capacity.status==='unresolved')toolkitError('CARRYING_DATA_REQUIRED','Active standard carrying requires actual masses for the future contents and any recovered empty container before work; the full bag’s two pounds are not divided by a fraction.')
  if(capacity.overloaded)toolkitError('CARRYING_CAPACITY_EXCEEDED','The actual projected container and counted contents exceed the real standard carrying capacity.')
 }
 return{future,item,stock,restoredContainer}
}
function status(job:GroundGearRecovery){return job.workedSeconds<job.requiredSeconds?'working':now()-job.startedAt<job.requiredSeconds?'awaiting_time':'ready'}
function snapshot(job:GroundGearRecovery){return{success:true,recoveryId:job.id,status:job.status,workedSeconds:job.workedSeconds,requiredSeconds:job.requiredSeconds,remainingWorkSeconds:job.requiredSeconds-job.workedSeconds,earliestCompletionAt:job.startedAt+job.requiredSeconds,unitsRemoved:0,gearStillInPlace:true,interpretation:'Collection duration and available container capacity are explicit physical MJ adjudications, not published PHB tariffs. Combat work credits at most six seconds per actual action and never advances the round clock.'}}
function work(job:GroundGearRecovery,eventId:string,seconds:number,activity:'light'|'strenuous',source:string){
 groundGearAction();groundGearHistoryRoom();validateJobSource(job);projectedCompletion(job)
 if(job.status==='completed'||job.status==='cancelled')toolkitError('GROUND_GEAR_RECOVERY_CLOSED','This collection attempt is already closed.')
 if(seconds>job.requiredSeconds-job.workedSeconds)toolkitError('GROUND_GEAR_RECOVERY_WORK_INVALID','Choose real positive work no longer than the exact remaining collection time.')
 const combat=gs.getState().phase==='combat',turnKey=combat?groundGearTurnKey(gs.getState()):undefined
 if(combat&&seconds>6)toolkitError('GROUND_GEAR_RECOVERY_COMBAT_WORK','One actual combat action can credit at most six seconds; no round clock or extra action is fabricated.')
 if(job.segments.length>=512)toolkitError('GROUND_GEAR_RECOVERY_SEGMENT_LIMIT','The retained actual collection work history is full.')
 const boundary=groundGearRecoveryActivityIssue(gs.getState(),combat?0:seconds);if(boundary)toolkitError(boundary.code,boundary.message)
 preflightRestStrenuousInterval();preflightGroundGearWork('player',combat?0:seconds)
 const from=now();spendGroundGearWork('player',combat?0:seconds)
 job.workedSeconds+=seconds;job.lastWorkedAt=now();job.segments.push({eventId,from,to:now(),seconds,phase:combat?'combat':'exploration',...(turnKey?{turnKey}:{}),restActivity:activity,source})
 if(!combat)recordRestMeasuredActivityInterval({eventId:`ground-gear:${eventId}`,from,to:now(),activity,reason:source.slice(0,600)})
 job.status=status(job);return snapshot(job)
}
export function startGroundGearRecovery(raw:unknown){
 const input=GroundGearRecoveryStartSchema.parse(raw),command=witness({operation:'recovery-start',input}),old=groundGearReceipt(input.eventId,command);if(old)return{...old,replayed:true}
 groundGearAction();groundGearHistoryRoom();const placed=sourcePlacement(input.placementId);actualPlace(placed)
 if(jobs()[input.recoveryId])toolkitError('GROUND_GEAR_RECOVERY_ID_CONFLICT','This recovery identity already belongs to its exact original attempt.')
 if(Object.keys(jobs()).length>=128)toolkitError('GROUND_GEAR_RECOVERY_LIMIT','The retained real collection registry is full; no old history is evicted.')
 if(Object.values(jobs()).some(j=>j.input.placementId===placed.id&&!['completed','cancelled'].includes(j.status)))toolkitError('GROUND_GEAR_RECOVERY_ALREADY_ACTIVE','Continue or explicitly cancel this placement’s existing real collection attempt.')
 if(input.units>placed.unitsRemaining)toolkitError('GROUND_GEAR_UNITS_UNAVAILABLE','Collect no more than the real uncollected units.')
 const partial=input.units<placed.unitsRemaining,keys=new Set(placed.cells.map(c=>`${c.x},${c.y}`)),remaining=input.remainingCells??[]
 if(new Set(remaining.map(c=>`${c.x},${c.y}`)).size!==remaining.length||remaining.some(c=>!keys.has(`${c.x},${c.y}`))||partial&&(!remaining.length||!input.remainingCoverageFactId||!input.remainingCoverageConfirmed)||!partial&&remaining.length)toolkitError('GROUND_GEAR_REMAINING_COVERAGE_REQUIRED','A real partial collection needs explicitly observed nonempty remaining cells inside the actual area and their physical fact. Removing one unit never clears the whole remaining danger.')
 if(!partial&&(input.remainingCoverageFactId||input.remainingCoverageConfirmed))toolkitError('GROUND_GEAR_REMAINING_COVERAGE_NOT_APPLICABLE','An empty completed lot has no remaining covered cells.')
 const container=actualContainer(input,placed),existing=Object.values(gs.getState().dmTools?.groundGear?.stocks??{}).filter(s=>s.containerItemId===container.item.id&&s.kind===placed.kind)
 if(existing.length>1)toolkitError('GROUND_GEAR_CONTAINER_STOCK_AMBIGUOUS','The actual same-kind counted contents must have one unambiguous stock in this container.')
 const fullOriginal=placed.kind==='hunting_trap'||container.ground&&input.units===placed.unitsRemaining&&placed.unitsRemaining===placed.units&&container.item.id===placed.itemId&&(container.item.equipmentId??container.item.id)===placed.kind
 if(placed.kind==='hunting_trap'&&(!input.safeHandlingFactId||!input.actualSafeHandlingConfirmed))toolkitError('HUNTING_TRAP_SAFE_RECOVERY_REQUIRED','Establish the actual safe handling procedure for this empty trap; no universal disarm DC or automatic safe opening is invented.')
 if(placed.kind!=='hunting_trap'&&(input.safeHandlingFactId||input.actualSafeHandlingConfirmed))toolkitError('GROUND_GEAR_SAFE_HANDLING_NOT_APPLICABLE','This trap-specific fact does not grant a new generic safe collection rule for loose gear.')
 if((input.measuredStockWeightLb===undefined)!==(input.stockWeightFactId===undefined)||(input.measuredContainerDryWeightLb===undefined)!==(input.containerWeightFactId===undefined))toolkitError('GROUND_GEAR_MASS_FACT_REQUIRED','A measured mass and its actual physical observation must be provided together.')
 if(fullOriginal&&(input.measuredStockWeightLb!==undefined||input.measuredContainerDryWeightLb!==undefined))toolkitError('GROUND_GEAR_WHOLE_ITEM_MASS','The exact original whole item uses its existing source mass; partial stock/container mass arguments do not apply.')
 if(!container.ground&&input.measuredContainerDryWeightLb!==undefined)toolkitError('GROUND_GEAR_CONTAINER_MASS_NOT_APPLICABLE','Use the existing physical weight procedure for an already owned container; this collection only measures a newly recovered original empty container.')
 const fact=(id:string|undefined,cell=placed.originalCells[0],itemId?:string)=>id?actualGroundGearFact(id,cell,itemId):undefined
 const job:GroundGearRecovery={id:input.recoveryId,sequence:Object.keys(jobs()).length+1,input,mapId:placed.mapId,roomId:placed.roomId,startedAt:now(),lastWorkedAt:now(),requiredSeconds:input.requiredSeconds,workedSeconds:0,status:'working',
  placementWitness:placementWitness(placed),containerWitness:containerWitness(input,placed),containerWasGround:container.ground,fullOriginal,stockItemId:existing[0]?.itemId??stockId(input.eventId),initialStock:existing[0]?structuredClone(existing[0]):undefined,
  facts:{container:container.selfTrap?fact(input.safeHandlingFactId)!:fact(input.containerFactId,container.cell,container.item.id)!,remainingCoverage:fact(input.remainingCoverageFactId),stockWeight:fact(input.stockWeightFactId),containerWeight:fact(input.containerWeightFactId),safeHandling:fact(input.safeHandlingFactId)},segments:[]}
 projectedCompletion(job);jobs()[job.id]=job
 return rememberGroundGear(input.eventId,command,work(job,input.eventId,input.workSeconds,input.restActivity,input.activitySource))
}
export function continueGroundGearRecovery(raw:unknown){
 const input=GroundGearRecoveryWorkSchema.parse(raw),command=witness({operation:'recovery-work',input}),old=groundGearReceipt(input.eventId,command);if(old)return{...old,replayed:true}
 const job=jobs()[input.recoveryId]??toolkitError('GROUND_GEAR_RECOVERY_REQUIRED','Choose an actual retained collection attempt.')
 return rememberGroundGear(input.eventId,command,work(job,input.eventId,input.workSeconds,input.restActivity,input.activitySource))
}
export function finishGroundGearRecovery(raw:unknown){
 const input=GroundGearRecoveryFinishSchema.parse(raw),command=witness({operation:'recovery-finish',input}),old=groundGearReceipt(input.eventId,command);if(old)return{...old,replayed:true}
 const job=jobs()[input.recoveryId]??toolkitError('GROUND_GEAR_RECOVERY_REQUIRED','Choose an actual retained collection attempt.')
 if(job.status==='completed')return{...job.result,replayed:true}
 if(job.status==='cancelled')toolkitError('GROUND_GEAR_RECOVERY_CLOSED','This attempt was explicitly cancelled without removing any gear.')
 assertGroundGearNoContact();available();groundGearHistoryRoom();if(gs.getState().phase==='combat')rules.validateFreeCombatAction('player');else rules.validateActionUse('player')
 const placed=validateJobSource(job)
 if(job.workedSeconds!==job.requiredSeconds||now()-job.startedAt<job.requiredSeconds)toolkitError('GROUND_GEAR_RECOVERY_NOT_DUE','Both the explicitly performed work and real elapsed time must reach the established collection duration. Waiting grants no collection work.')
 const result=projectedCompletion(job),state=gs.getState()
 state.player.inventory=result.future.player.inventory
 if(result.future.dmTools?.carrying)state.dmTools!.carrying=result.future.dmTools.carrying
 if(result.stock){result.stock.lastRecoveryEventId=input.eventId;groundGearState().stocks[result.stock.itemId]=result.stock}
 placed.unitsRemaining-=job.input.units;placed.cells=(job.input.remainingCells??[]).map(c=>({...c}))
 if(placed.unitsRemaining>0)placed.remainingCoverageFact=job.facts.remainingCoverage
 else{placed.status='recovered';placed.recoveredAt=now();placed.recoveryEventId=input.eventId;delete placed.remainingCoverageFact}
 if(job.containerWasGround)placed.sourceContainerOnGround=false
 else if(!placed.unitsRemaining&&placed.sourceContainerOnGround&&placed.sourceContainerItemId===placed.itemId){
  // The original empty pouch already exists. Once the last deployed unit is
  // collected into another real container it becomes an ordinary deposited
  // empty instance, never a newly created full bag.
  const item=emptyOriginal(placed);state.droppedItems??={};state.droppedItems[item.id]={item,mapId:placed.mapId,roomId:placed.roomId,position:{...placed.originalCells[0]}};placed.sourceContainerOnGround=false
 }
 job.status='completed';job.completedAt=now();job.completionEventId=input.eventId
 job.result={success:true,recoveryId:job.id,placementId:placed.id,unitsCollected:job.input.units,remainingUnits:placed.unitsRemaining,remainingCells:placed.cells,
  item:result.item,...result.stock?{stock:result.stock}:{},...result.restoredContainer?{restoredContainer:result.restoredContainer}:{},actionSpent:false,worldTimeSeconds:now(),workedSeconds:job.workedSeconds,
  source:GROUND_GEAR[placed.kind].source,interpretation:'The collection duration and available container capacity were explicit physical MJ adjudications; no source tariff, prorated mass, full replacement bag or free deployment was invented.'}
 afterInventoryChange();return rememberGroundGear(input.eventId,command,job.result)
}
export function cancelGroundGearRecovery(raw:unknown){
 const input=GroundGearRecoveryCancelSchema.parse(raw),command=witness({operation:'recovery-cancel',input}),old=groundGearReceipt(input.eventId,command);if(old)return{...old,replayed:true}
 const job=jobs()[input.recoveryId]??toolkitError('GROUND_GEAR_RECOVERY_REQUIRED','Choose the actual retained collection attempt.')
 groundGearHistoryRoom();if(job.status==='completed')toolkitError('GROUND_GEAR_RECOVERY_COMPLETED','An actually completed physical collection cannot be cancelled or refunded.')
 if(job.status==='cancelled')return{success:true,recoveryId:job.id,alreadyCancelled:true,unitsRemoved:0}
 job.status='cancelled';job.cancelledAt=now();job.cancellationEventId=input.eventId;job.cancellationReason=input.reason
 return rememberGroundGear(input.eventId,command,{success:true,recoveryId:job.id,cancelled:true,unitsRemoved:0,timeRefunded:0,actionSpent:false,reason:input.reason})
}
