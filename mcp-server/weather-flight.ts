import { prepareGroundGearStep,groundGearMovementIssue,recordGroundGearContact } from './ground-gear-contacts'
import { oilGroundContactIssue,onOilGroundContact } from './oil-ground'
import { z } from 'zod'
import * as gs from './game-state'
import * as rules from './rules'
import { available,now } from './hero-rules'
import { toolkitError,toolkitState } from './toolkit'
import { navigationActor,navigationGrid,type NavigationMovementMode } from '../lib/navigation'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { weatherStateOf,weatherActorHeight,weatherAtCell,weatherFlightTurnIssue } from '../lib/weather-state'
import { reconcileWeatherInventory,syncWeatherClock } from './weather'
import { assertWeatherFlameExposure } from './weather-flames'

const Id=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
export const FlightObservationSchema=z.object({eventId:Id,entityId:Id,heightFeet:z.number().positive().max(1000000),factId:Id,source:z.string().trim().min(1).max(1000)}).strict()
export const VerticalFlightSchema=z.object({eventId:Id,entityId:Id,toHeightFeet:z.number().min(0).max(1000000),surfaceFactId:Id.optional(),source:z.string().trim().min(1).max(1000)}).strict()
const data=()=>toolkitState().weather??={version:1 as const,contexts:{},profiles:{},clothing:{},events:{},flights:{},receipts:{}}
function previous(eventId:string,command:string){const old=weatherStateOf(gs.getState())?.receipts[eventId];if(old&&old.command!==command)toolkitError('WEATHER_FLIGHT_EVENT_CONFLICT','This flight event already records another actual operation.');return old?{...old.result,replayed:true}:undefined}
function room(){if(Object.keys(weatherStateOf(gs.getState())?.receipts??{}).length>=2048)toolkitError('WEATHER_HISTORY_LIMIT','Flight source receipts are full; no previous observation is evicted.')}
function record(eventId:string,command:string,result:Record<string,unknown>){data().receipts[eventId]={command,result};return result}
function physicalFact(id:string,_entityId:string){const fact=gs.getState().worldFacts?.find(fact=>fact.id===id);if(!fact||fact.mapId!==gs.getState().currentMapId)toolkitError('WEATHER_FLIGHT_FACT_REQUIRED','Select an existing physical fact on this actual map as the explicit MJ basis for this selected creature height/surface. No entity is inferred from its prose.');return fact!}
export function observeWeatherFlight(raw:z.infer<typeof FlightObservationSchema>){
  const input=FlightObservationSchema.parse(raw),command=JSON.stringify({kind:'flight-observation',input}),old=previous(input.eventId,command);if(old)return old
  available();room();const actor=gs.getEntity(input.entityId);if(!actor)toolkitError('WEATHER_ACTIVE_ACTOR_REQUIRED','Choose an actual active creature, never a map archive.')
  // Prove the actual native supported movement profile; this grants no flight.
  navigationActor(gs.getState(),input.entityId,'fly')
  const before=weatherStateOf(gs.getState())?.flights[input.entityId]
  if(before&&(!before.airborne||before.heightFeet!==null))toolkitError('WEATHER_FLIGHT_OBSERVATION_CONFLICT','A new observation may fill unknown height of a real observed flight; known height or a grounded body requires actual vertical movement instead.')
  const fact=physicalFact(input.factId,input.entityId)
  data().flights[input.entityId]={entityId:input.entityId,mapId:gs.getState().currentMapId!,airborne:true,heightFeet:input.heightFeet,source:input.source,startedAt:before?.startedAt??now(),initialEventId:before?.initialEventId??input.eventId,revision:(before?.revision??0)+1,lastPosition:{...actor!.position}}
  return record(input.eventId,command,{success:true,flight:structuredClone(data().flights[input.entityId]),fact:structuredClone(fact),movementGranted:false,positionChanged:false})
}
/** A committed fly step is physical evidence of flight even when old XY data
 * had no altitude. A walking declaration never erases that evidence. */
export function noteWeatherFlightMovement(entityId:string,mode:NavigationMovementMode){
  const actor=gs.getEntity(entityId);if(!actor)return
  const before=weatherStateOf(gs.getState())?.flights[entityId]
  if(mode==='fly')data().flights[entityId]={entityId,mapId:gs.getState().currentMapId!,airborne:true,heightFeet:before?.airborne?before.heightFeet:null,source:before?.source??'Actual committed move_token movementMode:fly; surface height has not been established.',startedAt:before?.startedAt??now(),initialEventId:before?.initialEventId??`observed-fly:${entityId}`.slice(0,80),revision:(before?.revision??0)+1,lastPosition:{...actor.position}}
  else if(before)before.lastPosition={...actor.position}
  syncWeatherClock(now());reconcileWeatherInventory()
}
export function assertWeatherFlightTurn(entityId:string){const issue=weatherFlightTurnIssue(gs.getState(),entityId);if(issue)toolkitError(issue.code,issue.message)}
export function assertWeatherMapArrival(mapId:string,playerPosition:{x:number;y:number}){
  if(weatherActorHeight(gs.getState(),'player').airborne)toolkitError('WEATHER_REAL_LANDING_REQUIRED','Resolve the actual player landing/fall before a ground map transition; another map does not erase flight.')
  assertWeatherFlameExposure({mapId,playerPosition})
}
export function assertWeatherMovement(entityId:string,path:readonly{x:number;y:number}[],mode:NavigationMovementMode,playerPath?:readonly{x:number;y:number}[]){
  const state=gs.getState(),height=weatherActorHeight(state,entityId)
  if(path.length>1&&height.airborne&&mode==='walk')toolkitError('WEATHER_REAL_LANDING_REQUIRED','An actual walking declaration cannot erase flight or grant a free landing. Establish the real height then land/fall explicitly.')
  if(path.length>1&&height.airborne&&height.known)toolkitError('WEATHER_HEIGHT_3D_MOVEMENT_UNSUPPORTED','Known altitude has no reviewed horizontal3D obstacle path. Real vertical landing/fall remains available before ground movement.')
  if(path.length>1&&mode==='fly'&&path.some(cell=>weatherAtCell(state,cell)?.strongWind)&&!height.known)
    toolkitError('WEATHER_FLIGHT_HEIGHT_REQUIRED','Record the actual above-surface height before flying into strong wind; an old horizontal projection does not grant a wind exemption.')
  for(const cell of playerPath??(entityId==='player'?path:[]))assertWeatherFlameExposure({playerPosition:cell})
}
export function moveWeatherFlight(raw:z.infer<typeof VerticalFlightSchema>){
  const input=VerticalFlightSchema.parse(raw),command=JSON.stringify({kind:'vertical-flight',input}),old=previous(input.eventId,command);if(old)return old
  available();room();const state=gs.getState(),actor=gs.getEntity(input.entityId),flight=weatherStateOf(state)?.flights[input.entityId]
  if(!actor||!flight||flight.mapId!==state.currentMapId||flight.heightFeet===null)toolkitError('WEATHER_FLIGHT_HEIGHT_REQUIRED','Use an actual native flying actor with its known current surface height; no takeoff or altitude is inferred.')
  const movement=navigationActor(state,input.entityId,'fly')
  if(state.phase==='combat'&&state.currentTurn!==input.entityId)toolkitError('NOT_CURRENT_TURN','Voluntary vertical flight uses the actual actor turn and its remaining budget.')
  if(activePhysicalLoad(state)||actor!.conditions.includes('grappled'))toolkitError('WEATHER_FLIGHT_PAYLOAD_UNSUPPORTED','Release or resolve the actual held/grappled load; vertical paired flight has no reviewed contract.')
  const delta=Math.abs(input.toHeightFeet-flight!.heightFeet!)
  if(!delta)toolkitError('WEATHER_FLIGHT_UNCHANGED','Choose a real nonzero vertical move; no cost or nonce changes current flight.')
  if(input.toHeightFeet===0){
    if(!input.surfaceFactId)toolkitError('WEATHER_LANDING_SURFACE_REQUIRED','Establish the actual supporting surface at this same XY cell; no ground/platform is invented.')
    physicalFact(input.surfaceFactId!,input.entityId)
    if(!navigationGrid(state,input.entityId).free(actor!.position))toolkitError('WEATHER_LANDING_BLOCKED','The actual supporting ground cell is occupied or blocked.')
  }
  const allied=(body:typeof state.player|typeof state.monsters[string])=>body.id==='player'||'hostile'in body&&body.hostile===false
  const enemies=[state.player,...Object.values(state.monsters)].filter(other=>other.id!==input.entityId&&other.hp.current>0&&allied(other)!==allied(actor!))
  if(state.phase==='combat'&&enemies.some(other=>Math.max(Math.abs(other.position.x-actor!.position.x),Math.abs(other.position.y-actor!.position.y))<=2))
    toolkitError('WEATHER_VERTICAL_OPPORTUNITY_GEOMETRY_UNSUPPORTED','A real nearby enemy may cross a3D reach boundary. Resolve its source geometry before vertical movement; no opportunity reaction is silently skipped.')
  const used=state.phase==='combat'?gs.getMovementUsed(input.entityId):0,cost=delta/5
  if(cost>movement.speed/5-used)toolkitError('MOVEMENT_EXCEEDED','The real vertical distance exceeds this actor remaining source flying movement; no landing is granted free.')
  const landingWitness=input.toHeightFeet===0?prepareGroundGearStep(state,input.entityId,'landing'):undefined
  if(input.toHeightFeet===0){const projected=structuredClone(state);const landing=projected.dmTools!.weather!.flights[input.entityId];landing.airborne=false;landing.heightFeet=0;const issue=oilGroundContactIssue(projected,input.entityId)??groundGearMovementIssue(projected,input.entityId,'landing',landingWitness);if(issue)toolkitError(issue.code,issue.message)}
  if(state.phase==='combat')gs.addMovementUsed(input.entityId,cost)
  flight!.heightFeet=input.toHeightFeet;flight!.airborne=input.toHeightFeet>0;flight!.revision++;flight!.lastPosition={...actor!.position}
  syncWeatherClock(now());reconcileWeatherInventory()
  let groundGearContactIds:string[]=[]
  if(input.toHeightFeet===0){onOilGroundContact(input.entityId);const contact=recordGroundGearContact(input.entityId,'landing',landingWitness);if(contact)groundGearContactIds=[contact.id]}
  gs.addLogEntry({round:state.round,turn:input.entityId,action:input.toHeightFeet===0?'Atterrissage réel':'Vol vertical réel',mechanicalDetail:`${delta} ft de mouvement payé ; ${input.source}`})
  return record(input.eventId,command,{success:true,flight:structuredClone(flight!),costFeet:delta,costCells:cost,positionChanged:false,worldTimeSeconds:now(),groundGearContactIds})
}
export function assertWeatherFall(entityId:string,distanceFeet:number){const height=weatherActorHeight(gs.getState(),entityId);if(height.airborne&&(distanceFeet<=0||height.known&&distanceFeet!==height.heightFeet))toolkitError('WEATHER_FALL_HEIGHT_MISMATCH','The completed fall must match the actual known height, or positively establish the unknown height; intermediate3D platforms are not modeled.')}
export function completeWeatherFall(entityId:string){const flight=weatherStateOf(gs.getState())?.flights[entityId];if(flight?.airborne){flight.airborne=false;flight.heightFeet=0;flight.revision++;syncWeatherClock(now());reconcileWeatherInventory()}}
