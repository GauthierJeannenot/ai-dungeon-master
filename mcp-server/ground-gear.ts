import type { Item } from '../lib/types'
import { GROUND_GEAR,isGroundGearKind,type GroundGearKind } from '../lib/srd/ground-gear'
import { pendingGroundGearContacts,type GroundGearState,type GroundGearPlacement } from '../lib/ground-gear-state'
import { entityVerticalContext,actualSurfaceAt } from '../lib/jumping-state'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { available,now,advanceHeroTime } from './hero-rules'
import { equipmentId,freeHands,currentLoadout,afterInventoryChange } from './equipment'
import { toolkitState,toolkitError,toolkitLocation,assertToolkitReach } from './toolkit'
import { assertGameTimeAdvance } from './time-preflight'
import * as gs from './game-state'
import * as rules from './rules'
export function groundGearState():GroundGearState{return toolkitState().groundGear??={version:1,placements:{},contacts:{},paces:{},traversals:{},stops:{},walkingInjuries:{},stocks:{},receipts:{}}}
export function groundGearReceipt(eventId:string,command:string){const receipts=gs.getState().dmTools?.groundGear?.receipts,old=receipts&&Object.hasOwn(receipts,eventId)?receipts[eventId]:undefined;if(old&&old.command!==command)toolkitError('GROUND_GEAR_EVENT_CONFLICT','Retain the exact original physical gear, units, container, contact or chosen operation.');return old?.result}
export function rememberGroundGear(eventId:string,command:string,result:Record<string,unknown>){groundGearState().receipts[eventId]={command,result:structuredClone(result)};return result}
export function groundGearHistoryRoom(){if(Object.keys(gs.getState().dmTools?.groundGear?.receipts??{}).length>=1024)toolkitError('GROUND_GEAR_HISTORY_LIMIT','Ground-gear receipts are full before any resource, die, action or real work; no source history is evicted.')}
export function assertGroundGearNoContact(){if(pendingGroundGearContacts(gs.getState()).length)toolkitError('GROUND_GEAR_CONTACT_DUE','Resolve the actual stopped ground-gear contact before choosing another action, pace, position or time interval.')}
export function groundGearAction(actorId='player'){assertGroundGearNoContact();available();rules.validateActionUse(actorId)}
export function preflightGroundGearWork(actorId='player',seconds=gs.getState().phase==='combat'?0:6){const issue=breathingActivityIssue(gs.getState(),actorId,seconds);if(issue)toolkitError(issue.code,issue.message);assertGameTimeAdvance(seconds);return seconds}
export function spendGroundGearWork(actorId:string,seconds:number){if(seconds)advanceHeroTime(seconds);else rules.recordAction(actorId)}
export function actualGroundGearFact(factId:string,cell:{x:number;y:number},itemId?:string){
 const state=gs.getState(),fact=state.worldFacts?.find(value=>value.id===factId),location=toolkitLocation(cell)
 if(!fact||fact.mapId!==location.mapId||fact.roomId!==location.roomId||fact.narrativeEffect?.cell.x!==cell.x||fact.narrativeEffect?.cell.y!==cell.y||fact.subjectItemId&&fact.subjectItemId!==itemId)
  toolkitError('GROUND_GEAR_PHYSICAL_FACT_REQUIRED','Choose a current public physical scene fact at this exact location, associated explicitly with the actual selected object; no text is parsed or object created.')
 return structuredClone(fact!) as unknown as Record<string,unknown>
}
export interface PlaceGroundGearInput{placementId:string;itemId:string;originCell:{x:number;y:number};surfaceZFeet:number;
 surfaceFactId:string;levelSurfaceConfirmed?:true;supportSurfaceId?:string;
 anchorObjectId?:string;anchorFactId?:string;immobileAnchorConfirmed?:true;chainLengthFeet?:number}
export function placeGroundGear(input:PlaceGroundGearInput){
 const command=JSON.stringify({operation:'place',...input}),old=groundGearReceipt(input.placementId,command);if(old)return{...old,replayed:true}
 groundGearAction();groundGearHistoryRoom();const state=gs.getState(),item=state.player.inventory.find(value=>value.id===input.itemId),stock=state.dmTools?.groundGear?.stocks[input.itemId]
 if(!item||item.type!=='misc'||item.quantity!==undefined&&item.quantity!==1)toolkitError('GROUND_GEAR_ONE_REAL_LOT_REQUIRED','Choose one exact real bag/trap instance or one counted recovered lot, not an uncounted multi-bag stack.')
 const kind:GroundGearKind|undefined=stock?.kind??(isGroundGearKind(equipmentId(item!))?equipmentId(item!) as GroundGearKind:undefined)
 if(!kind)toolkitError('GROUND_GEAR_REAL_ITEM_REQUIRED','Select an actually owned ball_bearings, caltrops or hunting_trap physical item, not a kit or description.')
 const definition=GROUND_GEAR[kind!]
 if(stock&&stock.units!==definition.units)toolkitError('GROUND_GEAR_COMPLETE_DEPLOYMENT_LOT_REQUIRED','This source action deploys exactly1000ball bearings,20caltrops or one trap; collect the exact real lot into the selected actual container first. No partial lot is rounded up.')
 const held=currentLoadout()
 if(freeHands()<1&&![held.mainHandId,held.offHandId].includes(item!.id))toolkitError('GROUND_GEAR_FREE_HAND_REQUIRED','Free an actual hand to manipulate this real equipment; no shield, grapple or carried load supplies an extra hand.')
 if(Object.values(state.dmTools?.groundGear?.placements??{}).some(value=>value.itemId===item!.id&&value.status!=='recovered'))toolkitError('GROUND_GEAR_ITEM_ALREADY_PLACED','This same physical instance already belongs to an unrecovered ground placement.')
 if(Object.keys(state.dmTools?.groundGear?.placements??{}).length>=256)toolkitError('GROUND_GEAR_PLACEMENT_LIMIT','No retained physical placement identity remains before work or inventory changes.')
 const side=kind==='ball_bearings'?2:1,cells=Array.from({length:side*side},(_,index)=>({x:input.originCell.x+index%side,y:input.originCell.y+Math.floor(index/side)})),location=toolkitLocation(input.originCell)
 const surfaceFact=actualGroundGearFact(input.surfaceFactId,input.originCell)
 if(kind==='ball_bearings'&&!input.levelSurfaceConfirmed)toolkitError('BALL_BEARINGS_LEVEL_REQUIRED','The source bearing square must actually be level; explicitly establish this physical fact without flattening terrain.')
 const vertical=entityVerticalContext(state,'player')
 if(!vertical.known||vertical.airborne||vertical.zFeet!==input.surfaceZFeet)toolkitError('GROUND_GEAR_SURFACE_REACH_REQUIRED','Use this actual body support datum for placing physical gear; no flight, unknown height or different surface is ignored.')
 for(const cell of cells){
  const part=toolkitLocation(cell);if(part.mapId!==location.mapId||part.roomId!==location.roomId)toolkitError('GROUND_GEAR_AREA_ROOM_REQUIRED','The whole real gear area must fit in the same existing room/map.')
  assertToolkitReach({...part,cell,surfaceZFeet:input.surfaceZFeet})
  const surfaces=actualSurfaceAt(state,cell),surface=input.supportSurfaceId?surfaces.find(value=>value.surfaceId===input.supportSurfaceId):surfaces.length===1?surfaces[0]:undefined
  if(surfaces.length?(!surface||surface.kind!=='support'||surface.elevationFeet!==input.surfaceZFeet):input.supportSurfaceId!==undefined||input.surfaceZFeet!==0)
   toolkitError('GROUND_GEAR_ACTUAL_SUPPORT_REQUIRED','Every placed cell needs its actual same-height supporting surface; neither a gap nor a different measured level becomes flat ground.')
 }
 let anchor:GroundGearPlacement['anchor']
 if(kind==='hunting_trap'){
  const object=input.anchorObjectId?state.dmTools?.objects[input.anchorObjectId]:undefined
  if(!object||object.state==='destroyed'||object.mapId!==location.mapId||!input.anchorFactId||!input.immobileAnchorConfirmed)
   toolkitError('HUNTING_TRAP_REAL_ANCHOR_REQUIRED','Select an actual intact immobile scene object and its physical anchor fact; no tree, spike or chain attachment is created.')
  if(activePhysicalLoad(state)?.targetId===object!.id)toolkitError('HUNTING_TRAP_ANCHOR_MOVABLE','An actually carried object cannot simultaneously be this immobile chain anchor.')
  const chainLengthFeet=input.chainLengthFeet??3
  if(!Number.isFinite(chainLengthFeet)||chainLengthFeet<=0||Math.max(Math.abs(object!.cell.x-input.originCell.x),Math.abs(object!.cell.y-input.originCell.y))*5>chainLengthFeet)
   toolkitError('HUNTING_TRAP_CHAIN_LENGTH_INVALID','Retain the actual positive chain length and an anchor within it;3feet is the published typical length, not a universal free extension.')
  assertToolkitReach({mapId:object!.mapId,roomId:object!.roomId,cell:object!.cell,surfaceZFeet:input.surfaceZFeet})
  anchor={objectId:object!.id,cell:{...object!.cell},zFeet:input.surfaceZFeet,chainLengthFeet,factId:input.anchorFactId!,fact:actualGroundGearFact(input.anchorFactId!,object!.cell,object!.id),immobileAnchorConfirmed:true}
 }else if(input.anchorObjectId!==undefined||input.anchorFactId!==undefined||input.immobileAnchorConfirmed!==undefined||input.chainLengthFeet!==undefined)toolkitError('GROUND_GEAR_ANCHOR_NOT_APPLICABLE','Only the actual hunting trap uses a chain anchor.')
 const seconds=preflightGroundGearWork();spendGroundGearWork('player',seconds)
 const originalItem=structuredClone(item!) as unknown as Record<string,unknown>,containerId=stock?.containerItemId??item!.id
 gs.consumePlayerItem(value=>value.id===item!.id)
 if(stock)delete groundGearState().stocks[item!.id]
 const placement:GroundGearPlacement={id:input.placementId,kind:kind!,itemId:item!.id,originalItem,sourceId:'player',...location,originalCells:cells.map(cell=>({...cell})),cells,
  surfaceZFeet:input.surfaceZFeet,placedAt:now(),units:definition.units,unitsRemaining:definition.units,status:kind==='hunting_trap'?'armed':'laid',
  surfaceFactId:input.surfaceFactId,surfaceFact,...input.levelSurfaceConfirmed?{levelSurfaceConfirmed:true}:{},...anchor?{anchor}:{},
  sourceContainerItemId:containerId,sourceContainerOnGround:containerId===item!.id}
 groundGearState().placements[placement.id]=placement;afterInventoryChange()
 return rememberGroundGear(input.placementId,command,{success:true,operation:'place',placement,removedFromInventory:true,itemId:item!.id,kind,actionSpent:seconds===0,seconds,
  interpretation:'Outside combat6seconds represents the real application action as an announced engine timing convention. A whole original bag/trap is transferred to the placement; an existing recovered-stock container is not duplicated. Merely placing an area under an occupant does not invent an entry/footstep.',source:definition.source})
}
export function setGroundGearPace(input:{eventId:string;entityId:string;pace:'normal'|'careful'}){
 const command=JSON.stringify({operation:'pace',...input}),old=groundGearReceipt(input.eventId,command);if(old)return{...old,replayed:true}
 assertGroundGearNoContact();available();groundGearHistoryRoom()
 if(gs.getState().phase==='combat')rules.validateFreeCombatAction(input.entityId);else rules.validateActionUse(input.entityId)
 if(!Object.hasOwn(gs.getState().dmTools?.groundGear?.paces??{},input.entityId)&&Object.keys(gs.getState().dmTools?.groundGear?.paces??{}).length>=256)toolkitError('GROUND_GEAR_PACE_LIMIT','No retained actor pace identity remains.')
 groundGearState().paces[input.entityId]=input.pace
 return rememberGroundGear(input.eventId,command,{success:true,entityId:input.entityId,pace:input.pace,actionSpent:false,movementSpent:0,
  interpretation:'Explicit persistent walking pace. Careful movement pays twice each real walking-step cost, including actual terrain/diagonals/crawling; it does not invent a speed condition, cheap standing, forced-target exemption or flying penalty. Change only by another explicit choice outside a pending movement/contact.'})
}
