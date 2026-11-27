import { chaseParticipant } from '../lib/chase-state'
import { xgeFallingStateOf } from '../lib/xge-falling-state'
import { activeXgeFall } from '../lib/xge-falling-state'
import { reactionWindow } from './hero-combat'
import { spatialOpportunityBoundaries,currentSpatialOpportunityBoundary,wrapSpatialOpportunity } from './spatial-opportunity'
import { swallowedBy } from '../lib/swallow-state'
import { weatherFlightTurnIssue } from '../lib/weather-state'
import { RuleViolation } from './rules'
import { currentLoadout,weaponForReference,weaponAttackRangeCells } from './equipment'
import { NativeFlightMoveSchema,nativeFlightStateOf,actualNativeFlightLocation,initialNativeFlightState,type NativeFlightMove,type NativeFlightState } from '../lib/native-flight-state'
import { nativeFlightSource,nativeFlightFrameWitness,nativeFlightSegmentIssue,nativeFlightFallIssue,projectNativeFlightPoint,projectNativeFlightFall,NATIVE_FLIGHT_SOURCE } from '../lib/native-flight-geometry'
import { entityVerticalContext,activeVerticalSurface,physicalBodyWitness } from '../lib/jumping-state'
import { movementSpeedProfile } from '../lib/movement-modes'
import { distance3 } from '../lib/spell-area-geometry'
import { inferRoomIdOnMap,getMapSpec } from '../lib/adventure-map'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { actualLocomotionLocation } from '../lib/locomotion-state'
import { groundGearStoppedThisTurn,pendingGroundGearContacts } from '../lib/ground-gear-state'
import { prepareGroundGearStep,groundGearMovementIssue,bindGroundGearContinuation } from './ground-gear-contacts'
import { oilGroundContactIssue } from './oil-ground'
import { monsterSource,attackProfile } from './monster-rules'
import { heldGrappleTargets } from './grapple-transport'
import { available,effects,hero,fail,now,reactionAvailable } from './hero-rules'
import { toolkitState,toolkitResult } from './toolkit'
import { registerPhysicalContinuation } from './movement-continuation'
import { resolveFall } from './falling'
import * as gs from './game-state'
const data=()=>((toolkitState() as unknown as{nativeFlight:NativeFlightState}).nativeFlight??=initialNativeFlightState())
const same=(a:{x:number;y:number;zFeet:number},b:{x:number;y:number;zFeet:number})=>a.x===b.x&&a.y===b.y&&a.zFeet===b.zFeet
const point3=(p:{x:number;y:number;zFeet:number})=>({x:p.x*5,y:p.y*5,z:p.zFeet})
function capacity(){if(Object.keys(nativeFlightStateOf(gs.getState())?.receipts??{}).length>=2048)fail('NATIVE_FLIGHT_HISTORY_LIMIT','Actual flight receipts are full; no original route is evicted.')}
function oldReceipt(id:string,command:string){const old=nativeFlightStateOf(gs.getState())?.receipts[id];if(old&&old.command!==command)fail('NATIVE_FLIGHT_EVENT_CONFLICT','Keep this exact original native route or fall identity.');return old?{...structuredClone(old.result),replayed:true}:undefined}
function remember(id:string,command:string,result:Record<string,unknown>){data().receipts[id]={command,result:structuredClone(result)};return result}
function preflight(input:NativeFlightMove){
 if(chaseParticipant(gs.getState(),input.entityId))fail('CHASE_MOVEMENT_MODE_UNREPRESENTED','Explicitly stop this first ground-map chase before unsupported flight, climbing, swimming or jump movement; no position/cost is committed.')
 if(activeXgeFall(gs.getState(),input.entityId))fail('XGE_FALL_RECOVERY_REQUIRED','Explicitly halt the actual source fall first; another native route grants no implicit midair recovery.')
 const state=gs.getState(),body=state.monsters[input.entityId],source=nativeFlightSource(state,input.entityId),fact=state.worldFacts?.find(f=>f.id===input.factId&&f.mapId===state.currentMapId)
 if(!body||!source||body.group)fail('NATIVE_FLIGHT_SOURCE_REQUIRED','Choose one exact active individual with its genuine catalog native flying speed; no player, group, archive or magical speed is granted.')
 if(swallowedBy(state,input.entityId))fail('NATIVE_FLIGHT_CONTAINED_BODY_REQUIRED','Resolve the actual containment exit before native flight; inherited host XYZ grants no internal takeoff, exterior path or free release.')
 if(body!.controller==='reactive_npc')fail('NPC_ACTIVATION_REQUIRED','This reactive NPC must use its explicit npc_action activation; the current activation schema does not select a native XYZ flight route.')
 if(!fact)fail('NATIVE_FLIGHT_CLEARANCE_FACT_REQUIRED','Choose an actual existing current-map physical fact and confirm this exact whole-body route clearance.')
 if(body!.hp.current<=0||body!.conditions.some(c=>['prone','grappled','restrained','incapacitated','unconscious','paralyzed','petrified','stunned'].includes(c)))fail('NATIVE_FLIGHT_IMMOBILE','The actual source body cannot voluntarily fly in its present state.')
 if(state.phase==='combat'&&(state.currentTurn!==input.entityId||!state.initiativeOrder.includes(input.entityId)))fail('NOT_CURRENT_TURN','Use this exact actual native creature turn, not an extra or inferred turn.')
 if(groundGearStoppedThisTurn(state,input.entityId))fail('CALTROPS_MOVEMENT_STOPPED','A real source stop applies to this movement budget; switching speed creates no new turn.')
 if(effects('hidden',input.entityId).length)fail('NATIVE_FLIGHT_VISIBILITY_CONTEXT_REQUIRED','This actual hidden source requires its supported spatial observer/discovery procedure before flight; no old XY hidden witness follows a new airborne position.')
 if(activePhysicalLoad(state)||heldGrappleTargets(state,input.entityId).length||actualLocomotionLocation(state,input.entityId))fail('NATIVE_FLIGHT_PAYLOAD_UNSUPPORTED','Resolve the actual held/grappled load or swimming/suspended body first; this native flight grants no passenger or simultaneous movement mode.')
 const first=input.path[0],vertical=entityVerticalContext(state,input.entityId)
 if(!vertical.known||first.x!==body!.position.x||first.y!==body!.position.y||first.zFeet!==vertical.zFeet)fail('NATIVE_FLIGHT_ACTUAL_START_REQUIRED','The exact first XYZ point must match this actual source body; no takeoff position, height or map is invented.')
 if(!vertical.airborne){const support=input.takeoffSurfaceId&&state.dmTools?.jumping?.surfaces[input.takeoffSurfaceId];if(!support||support.kind!=='support'||vertical.surfaceId!==support.surfaceId||support.mapId!==state.currentMapId||support.elevationFeet!==first.zFeet||!activeVerticalSurface(state,support.surfaceId))fail('NATIVE_FLIGHT_TAKEOFF_SUPPORT_REQUIRED','Choose the actual observed standing support before native takeoff. The selected existing measured support must be the body current real support.')}
 const datum=actualNativeFlightLocation(state,input.entityId)?.datumZFeet??vertical.supportZFeet??first.zFeet,map=getMapSpec(state.currentMapId,state),stepFeet:number[]=[]
 let projected=state,opportunityCount=0
 for(let i=1;i<input.path.length;i++){
  const from=input.path[i-1],to=input.path[i],dx=Math.abs(to.x-from.x),dy=Math.abs(to.y-from.y),dz=Math.abs(to.zFeet-from.zFeet),landing=i===input.path.length-1?input.landingSurfaceId:undefined
  if(!dx&&!dy&&!dz||dx>1||dy>1||dz>5||to.x>=map.grid.cols||to.y>=map.grid.rows||!inferRoomIdOnMap(to,state.currentMapId,state)||!landing&&to.zFeet<=datum)fail('NATIVE_FLIGHT_PATH_REQUIRED','Choose actual successive nonzero adjacent XYZ points within this map and above the retained takeoff datum; no diagonal cost, room, below-datum route or floor is inferred.')
  const issue=nativeFlightSegmentIssue(projected,input.entityId,from,to);if(issue)fail(issue.code,issue.message)
  opportunityCount+=spatialOpportunityBoundaries(projected,input.entityId,from,to,{nativeFlightId:input.eventId,segmentIndex:i}).length
  if(opportunityCount>4096)fail('NATIVE_FLIGHT_OPPORTUNITY_HISTORY_LIMIT','Retain every actual source decision; choose a bounded original route before movement or costs.')
  const projection=projectNativeFlightPoint(projected,input.entityId,to,input.eventId,datum,landing);if(projection.issue)fail(projection.issue.code,projection.issue.message)
  const fromWitness=prepareGroundGearStep(projected,input.entityId,landing?'landing':'forced'),hazard=oilGroundContactIssue(projection.state!,input.entityId)??groundGearMovementIssue(projection.state!,input.entityId,landing?'landing':'forced',fromWitness);if(hazard)fail(hazard.code,hazard.message)
  projected=projection.state!;stepFeet.push(distance3(point3(from),point3(to)))
 }
 if(hero().effects.some(e=>{if(e.kind!=='guardian-of-faith'||e.expiresAt<=now()||e.data.mapId!==state.currentMapId||(e.sourceId==='player'||state.monsters[e.sourceId]?.hostile===false)===(input.entityId==='player'||body!.hostile===false))return false;const cell=e.data.cell as{x:number;y:number}|undefined;return Boolean(cell&&input.path.some(p=>[0,1].some(x=>[0,1].some(y=>Math.max(Math.abs(p.x-cell.x-x),Math.abs(p.y-cell.y-y))<=2))))}))fail('NATIVE_FLIGHT_EFFECT_CONTEXT_REQUIRED','A real active guardian requires its actual spatial trigger volume before this flight; no old XY trigger is silently ignored.')
 const speed=movementSpeedProfile(state,input.entityId,source!.speedFeet),remaining=state.phase==='combat'?speed.budgetFeet-gs.getMovementUsed(input.entityId)*5:Infinity
 if(!speed.speedFeet||stepFeet.reduce((a,b)=>a+b,0)>remaining+1e-7)fail('MOVEMENT_EXCEEDED','The whole selected actual native route exceeds the one remaining shared movement budget; no partial step, action or extra speed is granted.')
 return{source:source!,stepFeet}
}
function finish(move:NativeFlightState['moves'][string],reason?:string){
 move.status=reason?'stopped':'completed';delete move.opportunityBoundary
 const result={success:!reason,eventId:move.input.eventId,entityId:move.input.entityId,costFeet:move.spentFeet,costCells:move.spentFeet/5,
  ...(reason?{movementStopped:true,stopReason:reason}:{}),actualPosition:entityVerticalContext(gs.getState(),move.input.entityId),
  groundGearContactIds:move.groundGearContactIds??[],worldTimeSeconds:now(),source:NATIVE_FLIGHT_SOURCE}
 move.result=result;return remember(move.input.eventId,move.command,result)
}
function stoppedIssue(move:NativeFlightState['moves'][string]){
 const state=gs.getState(),body=state.monsters[move.input.entityId],source=nativeFlightSource(state,move.input.entityId)
 if(!body||body.hp.current<=0||!body.isAlive)return'ACTOR_DOWN'
 if(body.conditions.some(c=>['prone','grappled','restrained','incapacitated','unconscious','paralyzed','petrified','stunned'].includes(c)))return'NATIVE_FLIGHT_IMMOBILE'
 if(JSON.stringify(physicalBodyWitness(state,body.id))!==move.bodyWitness)return'NATIVE_FLIGHT_BODY_CHANGED'
 const profile=movementSpeedProfile(state,body.id,source?.speedFeet??0)
 const needed=move.stepFeet.slice(move.cursor).reduce((a,b)=>a+b,0)-(move.partial?move.stepFeet[move.cursor]*move.partial.fraction:0)
 if(!source||profile.speedFeet<=0)return'NATIVE_FLIGHT_IMMOBILE'
 if(state.phase==='combat'&&needed>profile.budgetFeet-gs.getMovementUsed(body.id)*5+1e-7)return'MOVEMENT_EXCEEDED_AFTER_REACTION'
 return undefined
}
function advanceNativeFlight(move:NativeFlightState['moves'][string]){
 const state=gs.getState(),input=move.input
 while(move.cursor<input.path.length-1){
  const index=move.cursor+1,from=input.path[move.cursor],to=input.path[index],fraction=move.partial?.fraction??0
  const boundaries=spatialOpportunityBoundaries(state,input.entityId,from,to,{nativeFlightId:input.eventId,segmentIndex:index,
   ignored:move.opportunityDecisions??[],minimumFraction:fraction})
  const boundary=boundaries[0]
  if(boundary){
   if(boundary.fraction>fraction+1e-7)gs.commitNativeFlightPartialDisplacement(input.entityId,input.eventId,boundary.fraction)
   const actual=currentSpatialOpportunityBoundary(boundary);move.status='opportunity';move.opportunityBoundary=actual
   const ignored=[...(move.opportunityDecisions??[]),actual.key],end=input.path.at(-1)!
   reactionWindow('movement',actual.sourceId,input.entityId,['opportunity_attack','decline'],{
    type:'movement',actorId:input.entityId,nativeFlightId:input.eventId,goal:{kind:'cell',cell:{x:end.x,y:end.y}},
    allowPartial:false,acknowledgeEventIds:[],ignored,opportunityBoundary:wrapSpatialOpportunity(actual)})
   move.opportunityPendingId=hero().pending!.id
   return{eventId:input.eventId,status:move.status,costFeet:move.spentFeet,actualPosition:entityVerticalContext(state,input.entityId),pendingReaction:hero().pending}
  }
  const before=new Set(pendingGroundGearContacts(state).map(c=>c.id)),landing=index===input.path.length-1?input.landingSurfaceId:undefined
  const committed=gs.commitNativeFlightDisplacement(input.entityId,to,input.eventId,landing)
  gs.addLogEntry({round:state.round,turn:input.entityId,action:'Actual native3D flight',mechanicalDetail:`${input.eventId}:${index} | ${committed.costFeet} ft real geometric movement paid; no time or action granted.`})
  const contacts=pendingGroundGearContacts(state).filter(c=>!before.has(c.id))
  if(contacts.length){move.status='ground_contact';move.groundGearContactIds=contacts.map(c=>c.id);bindGroundGearContinuation(move.groundGearContactIds,{type:'engine-effect',domain:'native-flight',command:{eventId:input.eventId}});return{eventId:input.eventId,status:move.status,costFeet:move.spentFeet,groundGearContactIds:move.groundGearContactIds}}
 }
 return finish(move)
}
export function moveNativeFlight(raw:unknown){
 const input=NativeFlightMoveSchema.parse(raw),command=JSON.stringify({kind:'native-flight',input}),old=oldReceipt(input.eventId,command);if(old)return old
 const existing=nativeFlightStateOf(gs.getState())?.moves[input.eventId]
 if(existing){
  if(existing.command!==command)fail('NATIVE_FLIGHT_EVENT_CONFLICT','Retain the original actual route.')
  if(existing.status==='opportunity')return{eventId:input.eventId,status:existing.status,costFeet:existing.spentFeet,replayed:true,pendingReaction:hero().pending,actualPosition:entityVerticalContext(gs.getState(),input.entityId)}
  return continueNativeFlight(input.eventId)
 }
 available();capacity();const plan=preflight(input),state=gs.getState()
 if(Object.keys(data().moves).length>=512)fail('NATIVE_FLIGHT_MOVE_LIMIT','The retained actual route history is full.')
 const move:NativeFlightState['moves'][string]={input,command,mapId:state.currentMapId!,at:now(),turnCounter:state.turnCounter??0,combatGeneration:state.combatGeneration??0,
  sourceWitness:JSON.stringify(plan.source),bodyWitness:JSON.stringify(physicalBodyWitness(state,input.entityId)),cursor:0,stepFeet:plan.stepFeet,spentFeet:0,status:'moving',opportunityDecisions:[],opportunityResolutions:{}}
 data().moves[input.eventId]=move
 return advanceNativeFlight(move)
}
export function continueNativeFlight(eventId:string){
 const move=data().moves[eventId];if(!move)fail('NATIVE_FLIGHT_MOVE_REQUIRED','Choose the exact retained actual route.')
 if(move!.result)return{...structuredClone(move!.result),replayed:true}
 if(move!.status!=='ground_contact'||move!.cursor!==move!.input.path.length-1)fail('NATIVE_FLIGHT_CONTINUATION_REQUIRED','Resolve the exact offered reaction or final arrival contacts; no new path or decision is selected.')
 if(move!.groundGearContactIds?.some(id=>gs.getState().dmTools?.groundGear?.contacts[id]?.status!=='resolved'))fail('GROUND_GEAR_CONTACT_DUE','Resolve the exact real arrival contacts first.')
 return finish(move!)
}
function resumeNativeFlight(eventId:string,ignored:string[],movementStopped:boolean,attack?:unknown){
 const move=data().moves[eventId];if(!move)fail('NATIVE_FLIGHT_MOVE_REQUIRED','Choose the original native flight continuation.')
 if(move!.result)return{...structuredClone(move!.result),replayed:true}
 if(move!.status==='ground_contact')return continueNativeFlight(eventId)
 if(move!.status!=='opportunity'||!move!.opportunityBoundary||!ignored.includes(move!.opportunityBoundary.key)||hero().pending)
  fail('NATIVE_FLIGHT_OPPORTUNITY_CONTINUATION_REQUIRED','The original offered source reaction and any held roll must be completed before this exact route resumes.')
 const expected=[...(move!.opportunityDecisions??[]),move!.opportunityBoundary!.key]
 if(JSON.stringify(ignored)!==JSON.stringify(expected)||!move!.opportunityPendingId)
  fail('NATIVE_FLIGHT_OPPORTUNITY_CONTINUATION_REQUIRED','Only the exact resolved original offer may join its existing decision history; no future source boundary can be ignored.')
 const boundary=move!.opportunityBoundary!
 ;(move!.opportunityResolutions??={})[boundary.key]={boundary:structuredClone(boundary),pendingId:move!.opportunityPendingId!,decision:attack?'attack':'decline',paidFeet:move!.spentFeet,at:now()}
 move!.opportunityDecisions=expected
 delete move!.opportunityBoundary;delete move!.opportunityPendingId;move!.status='moving'
 const issue=movementStopped?'MOVEMENT_STOPPED':stoppedIssue(move!)
 if(issue)return{...finish(move!,issue),attack}
 try{return{...advanceNativeFlight(move!),attack}}
 catch(error){if(!(error instanceof RuleViolation))throw error;return{...finish(move!,error.code),attack}}
}
export function completeNativeFlightFall(input:{eventId:string;entityId:string;landingSurfaceId:string;reason:string}){
 const command=JSON.stringify({kind:'native-flight-fall',input}),old=oldReceipt(input.eventId,command);if(old)return old
 const due=nativeFlightFallIssue(gs.getState());if((!due||due.entityId!==input.entityId)&&!weatherFlightTurnIssue(gs.getState(),input.entityId))fail('NATIVE_FLIGHT_FALL_REQUIRED','Resolve the exact actually deprived non-hover body fall, not a voluntarily invented descent or different source.');
 const plan=projectNativeFlightFall(gs.getState(),input.entityId,input.landingSurfaceId);if(plan.issue)fail(plan.issue.code,plan.issue.message)
 if(xgeFallingStateOf(gs.getState())?.policy?.input.rate500&&plan.distanceFeet!>500)fail('XGE_FALL_ONGOING_REQUIRED','The adopted source rate cannot be bypassed by a completed fall over500ft, including corpse branches; choose its actual ongoing fall procedure before displacement.')
 capacity();if(Object.keys(data().falls).length>=512)fail('NATIVE_FLIGHT_FALL_LIMIT','Retain the actual fall history before damage or arrival.')
 const pendingFall={eventId:input.eventId,entityId:input.entityId,landingSurfaceId:input.landingSurfaceId,locationWitness:plan.locationWitness!,point:plan.point!,at:now()};data().falls[input.eventId]=pendingFall
 const body=gs.getPhysicalCreature(input.entityId)
 if(body&&'isAlive'in body&&body.isAlive===false){
  available({allowNativeFlightFall:{entityId:input.entityId,locationWitness:plan.locationWitness!}})
  const from=prepareGroundGearStep(gs.getState(),input.entityId,'landing'),issue=oilGroundContactIssue(plan.state!,input.entityId)??groundGearMovementIssue(plan.state!,input.entityId,'landing',from);if(issue)fail(issue.code,issue.message)
  gs.commitNativeFlightFallLanding(input.entityId,input.landingSurfaceId,input.eventId)
  const result={success:true,eventId:input.eventId,entityId:input.entityId,landingSurfaceId:input.landingSurfaceId,distanceFeet:plan.distanceFeet,corpse:true,creatureDamageApplied:false,diceRolled:false,actualPosition:entityVerticalContext(gs.getState(),input.entityId),objectDamageUnresolved:true};data().falls[input.eventId].result=result
  return remember(input.eventId,command,result)
 }
 const result=resolveFall({eventId:input.eventId,entityId:input.entityId,distanceFeet:plan.distanceFeet!,reason:input.reason},undefined,undefined,input.landingSurfaceId)
 const fall={eventId:input.eventId,entityId:input.entityId,landingSurfaceId:input.landingSurfaceId,locationWitness:plan.locationWitness!,point:plan.point!,at:now(),result};data().falls[input.eventId]=fall
 const location=data().locations[input.entityId];location.sourceEventId=input.eventId;location.sourceKind='fall'
 return remember(input.eventId,command,{...result,actualPosition:entityVerticalContext(gs.getState(),input.entityId),source:NATIVE_FLIGHT_SOURCE})
}
export function inspectNativeFlight(){return{confidential:true,nativeFlight:nativeFlightStateOf(gs.getState())??null,fallDue:nativeFlightFallIssue(gs.getState()),diceRolled:false,positionChanged:false,source:NATIVE_FLIGHT_SOURCE}}
export function registerNativeFlightContinuations(){registerPhysicalContinuation('native-flight',(command,stopped,attack)=>toolkitResult(resumeNativeFlight(String(command.eventId),Array.isArray(command.ignored)?command.ignored.filter((id):id is string=>typeof id==='string'):[],stopped,attack)))}
