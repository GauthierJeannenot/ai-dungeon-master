import { heldPitMeasurementsAllowed } from './pit-migration-scope'
import { activeXgeFall } from '../lib/xge-falling-state'
import { actualLocomotionLocation } from '../lib/locomotion-state'
import { VerticalSurfaceInputSchema,StandingSupportInputSchema,PhysicalBodyInputSchema,LowObstacleInputSchema,
  initialJumpingState,jumpingStateOf,jumpCellKey,entityVerticalContext,physicalBodyPosture,activeVerticalSurface,type JumpingState } from '../lib/jumping-state'
import { getAdventureMap,getMapSpec,inferRoomIdOnMap,firstMapId } from '../lib/adventure-map'
import { weatherActorHeight } from '../lib/weather-state'
import * as gs from './game-state'
import { now,hero } from './hero-rules'
import { toolkitState,toolkitError } from './toolkit'

type Holder={jumping?:JumpingState}
export const verticalData=()=>((toolkitState() as Holder).jumping??=initialJumpingState())
function oldReceipt(eventId:string,command:string){const old=jumpingStateOf(gs.getState())?.receipts[eventId];if(old&&old.command!==command)toolkitError('VERTICAL_EVENT_CONFLICT','This exact retained physical event already records another observation.');return old?{...structuredClone(old.result),replayed:true}:undefined}
function room(){if(gs.getState().hero?.pending&&!heldPitMeasurementsAllowed(gs.getState()))toolkitError('REACTION_PENDING','Resolve the actual held reaction before changing its physical geometry.');if(Object.keys(jumpingStateOf(gs.getState())?.receipts??{}).length>=2048)toolkitError('VERTICAL_HISTORY_LIMIT','Real physical observations and movement outcomes are retained; this bounded history cannot evict old receipts.')}
function record(eventId:string,command:string,result:Record<string,unknown>){verticalData().receipts[eventId]={command,result:structuredClone(result)};return result}
function actualBody(entityId:string){
  const state=gs.getState(),entity=gs.getEntity(entityId)??gs.getNpc(entityId)
  if(!entity||'mapId'in entity&&(entity.mapId??firstMapId(state))!==state.currentMapId)toolkitError('VERTICAL_ACTUAL_BODY_REQUIRED','Select a real body on the active map; no archive or stat block is activated by a measurement.')
  return entity!
}
export function inspectVerticalMovement(){const state=gs.getState(),ledger=jumpingStateOf(state);return{tracked:Boolean(ledger),
  surfaces:ledger?.surfaces??{},supports:ledger?.supports??{},bodies:ledger?.bodies??{},obstacles:ledger?.obstacles??{},
  activeJump:ledger?.activeJumpId?ledger.jumps[ledger.activeJumpId]:null,footwork:ledger?.footwork??null,
  playerVerticalContext:entityVerticalContext(state,'player'),diceRolled:false,positionChanged:false,seaLevelAltitudeInferred:false}}
export function recordVerticalSurface(raw:unknown){
  const input=VerticalSurfaceInputSchema.parse(raw),command=JSON.stringify({kind:'surface',input}),old=oldReceipt(input.eventId,command);if(old)return old
  room();const state=gs.getState(),mapId=state.currentMapId??firstMapId(state),map=getMapSpec(mapId,state)
  if(input.mapId!==mapId||!getAdventureMap(state).rooms.some(room=>room.id===input.roomId&&(room.mapId??firstMapId(state))===mapId))
    toolkitError('VERTICAL_ROOM_REQUIRED','Choose an actual existing room of this active map; no room, floor or arrival is generated.')
  if(new Set(input.cells.map(jumpCellKey)).size!==input.cells.length||input.cells.some(cell=>cell.x>=map.grid.cols||cell.y>=map.grid.rows||inferRoomIdOnMap(cell,mapId,state)!==input.roomId))
    toolkitError('VERTICAL_SURFACE_CELLS_REQUIRED','The measured surface or gap must retain distinct actual cells of its established room; unresolved void geometry does not create a new room.')
  if(jumpingStateOf(state)?.surfaces[input.surfaceId])toolkitError('VERTICAL_SURFACE_ALREADY_REGISTERED','This surface already has its measured cells and elevation. Another nonce does not move it or a standing body.')
  if(Object.keys(jumpingStateOf(state)?.surfaces??{}).length>=256)toolkitError('VERTICAL_SURFACE_LIMIT','The retained real-surface registry is full.')
  const object=input.objectId?state.dmTools?.objects[input.objectId]:undefined
  if(object?.razorvine)toolkitError('RAZORVINE_NOT_A_SUPPORT','This first sourced rooted hedge cannot be declared as an ordinary standing support.')
  if(input.objectId&&(!object||object.mapId!==mapId||object.state==='destroyed'||object.hp.current<=0||input.kind!=='support'||input.cells.some(cell=>cell.x<object.cell.x||cell.y<object.cell.y||cell.x>=object.cell.x+(object.size==='large'?2:1)||cell.y>=object.cell.y+(object.size==='large'?2:1))))toolkitError('VERTICAL_SUPPORT_OBJECT_REQUIRED','Choose an actual intact physical object and its actual footprint as the supporting surface anchor; no object or broad platform is created.')
  verticalData().surfaces[input.surfaceId]={...input,at:now(),...(object?{sourceObjectWitness:JSON.stringify({id:object.id,creation:object.creation,cell:object.cell,size:object.size,mapId:object.mapId})}:{})}
  return record(input.eventId,command,{success:true,surface:structuredClone(verticalData().surfaces[input.surfaceId]),positionChanged:false,bodyMoved:false,geometryCreated:false})
}
export function recordPhysicalBody(raw:unknown){
  const input=PhysicalBodyInputSchema.parse(raw),command=JSON.stringify({kind:'body-measurement',input}),old=oldReceipt(input.eventId,command);if(old)return old
  room();actualBody(input.entityId)
  const posture=physicalBodyPosture(gs.getState(),input.entityId)
  if(!posture)toolkitError('VERTICAL_POSTURE_CONTEXT_REQUIRED','The actual body needs its real mechanical posture context before a measured vertical extent can be used; no prone/upright state is inferred from prose.')
  const previous=jumpingStateOf(gs.getState())?.bodies[input.entityId]
  if(previous&&previous.posture===posture&&previous.heightFeet!==input.heightFeet)toolkitError('VERTICAL_BODY_HISTORY_REQUIRED','A measured body in the same posture does not change height through another nonce. Resolve its actual source transformation first.')
  if(!previous&&Object.keys(jumpingStateOf(gs.getState())?.bodies??{}).length>=256)toolkitError('VERTICAL_BODY_LIMIT','The retained actual-body registry is full.')
  verticalData().bodies[input.entityId]={entityId:input.entityId,heightFeet:input.heightFeet,posture:posture!,source:input.source,at:now(),revision:previous?previous.revision+Number(previous.posture!==posture):1}
  return record(input.eventId,command,{success:true,body:structuredClone(verticalData().bodies[input.entityId]),positionChanged:false,sizeOrTraitGranted:false})
}
export function observeStandingSupport(raw:unknown){
  const selected=StandingSupportInputSchema.parse(raw);if(activeXgeFall(gs.getState(),selected.entityId))toolkitError('XGE_FALL_REAL_LANDING_REQUIRED','The actual falling cursor has no current standing support; finish its real landing or source recovery before another observation.')
  const input=StandingSupportInputSchema.parse(raw),command=JSON.stringify({kind:'standing-observation',input}),old=oldReceipt(input.eventId,command);if(old)return old
  room();const state=gs.getState(),body=actualBody(input.entityId),ledger=jumpingStateOf(state),surface=ledger?.surfaces[input.surfaceId]
  if(!surface||!activeVerticalSurface(state,surface.surfaceId)||surface.kind!=='support'||surface.mapId!==state.currentMapId||!surface.cells.some(cell=>jumpCellKey(cell)===jumpCellKey(body.position)))
    toolkitError('VERTICAL_ACTUAL_SUPPORT_REQUIRED','The actual body must already occupy this real supporting surface cell on the current map; no landing or relocation is inferred.')
  if(weatherActorHeight(state,input.entityId).airborne||input.entityId==='player'&&ledger?.activeJumpId)
    toolkitError('VERTICAL_REAL_LANDING_REQUIRED','An actual airborne body must complete its real jump, landing or fall; a new declaration cannot make it grounded for free.')
  if(actualLocomotionLocation(state,input.entityId))toolkitError('VERTICAL_REAL_MOVEMENT_REQUIRED','A new standing observation cannot detach a real climbing/swimming body or grant a ground arrival. Reach its support through the actual procedure.')
  const previous=ledger?.supports[input.entityId]
  if(previous?.mapId===state.currentMapId&&previous.elevationFeet!==surface.elevationFeet)
    toolkitError('VERTICAL_REAL_MOVEMENT_REQUIRED','This body already has a measured elevation. Reach another level through actual movement, never an observation nonce.')
  const posture=physicalBodyPosture(state,input.entityId)
  if(input.bodyHeightFeet!==undefined){if(!posture)toolkitError('VERTICAL_POSTURE_CONTEXT_REQUIRED','The actual measured extent needs its real mechanical prone/upright context.');const known=ledger?.bodies[input.entityId];if(known&&known.posture===posture&&known.heightFeet!==input.bodyHeightFeet)toolkitError('VERTICAL_BODY_HISTORY_REQUIRED','Retain the measured extent in the same actual posture until a real source transformation occurs.')}
  if(input.bodyHeightFeet!==undefined&&!ledger?.bodies[input.entityId]&&Object.keys(ledger?.bodies??{}).length>=256)toolkitError('VERTICAL_BODY_LIMIT','The retained actual-body registry is full.')
  if(!previous&&Object.keys(ledger?.supports??{}).length>=256)toolkitError('VERTICAL_SUPPORT_LIMIT','The retained body-support registry is full.')
  verticalData().supports[input.entityId]={entityId:input.entityId,mapId:state.currentMapId!,surfaceId:surface.surfaceId,elevationFeet:surface.elevationFeet,
    observedAt:now(),source:input.source,bodyHeightFeet:input.bodyHeightFeet??previous?.bodyHeightFeet,bodyHeightPosture:input.bodyHeightFeet!==undefined?posture!:previous?.bodyHeightPosture,revision:(previous?.revision??0)+1}
  if(input.bodyHeightFeet!==undefined){const known=ledger?.bodies[input.entityId];verticalData().bodies[input.entityId]={entityId:input.entityId,heightFeet:input.bodyHeightFeet,posture:posture!,source:input.source,at:now(),revision:known?known.revision+Number(known.posture!==posture):1}}
  return record(input.eventId,command,{success:true,support:structuredClone(verticalData().supports[input.entityId]),positionChanged:false,bodyMoved:false})
}
export function clearActualFootwork(entityId='player'){if(entityId!=='player')return;const ledger=jumpingStateOf(gs.getState());if(ledger)delete ledger.footwork;if(gs.getState().hero)hero().movementTrail=[]}
export function recordActualFootsteps(path:readonly{x:number;y:number}[],baseFeet:readonly number[]){
  if(path.length<2)return
  const state=gs.getState(),old=jumpingStateOf(state)?.footwork
  const continuing=old&&old.combatGeneration===(state.combatGeneration??0)&&old.phase===state.phase&&old.at===now()&&old.mapId===state.currentMapId&&old.turnCounter===(state.turnCounter??0)&&jumpCellKey(old.lastCell)===jumpCellKey(path[0])
  const steps=[...(continuing?old.steps:[]),...path.slice(1).map((to,index)=>({from:{...path[index]},to:{...to},feet:baseFeet[index]}))].slice(-16)
  if(baseFeet.length!==path.length-1||baseFeet.some(feet=>feet!==5&&feet!==10))throw new Error('Actual footwork requires the already executed grid-step distances, not difficult-terrain costs or a new inferred path.')
  verticalData().footwork={combatGeneration:state.combatGeneration??0,phase:state.phase,mapId:state.currentMapId!,at:now(),turnCounter:state.turnCounter??0,lastCell:{...path.at(-1)!},feet:steps.reduce((sum,step)=>sum+step.feet,0),steps}
}
