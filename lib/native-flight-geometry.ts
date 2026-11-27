import { SpatialOpportunityBoundarySchema } from './spatial-opportunity-state'
import { swallowedBy,swallowedEpisodes } from './swallow-state'
import { inferRoomIdOnMap } from './adventure-map'
import { locomotionStateOf } from './locomotion-state'
import type { GameState } from './types'
import { getMonsterRecord } from './srd/monsters'
import { actualNativeFlightLocation,nativeFlightMovePoint,nativeFlightStateOf,initialNativeFlightState,spatialAttackKey,type NativeFlightPoint,type SpatialAttackContext } from './native-flight-state'
import { activeVerticalSurface,entityVerticalContext,physicalBodyWitness,bodyPhysicalHeight } from './jumping-state'
import { movementSpeedProfile } from './movement-modes'
import { spellAreaBlockers,blockerRayInterval,spellAreaRay } from './spell-area-physics'
import { distance3 } from './spell-area-geometry'
const E=1e-7
export const NATIVE_FLIGHT_SOURCE='PHB2014 Using Different Speeds5699-5703, Flying Movement5731-5733; actual3D geometric distance approved by user2026-11-04'
export function nativeFlightSource(state:GameState,entityId:string){
 const actor=state.monsters[entityId],record=actor&&getMonsterRecord(actor.type),speed=record?.engine.movementModes?.fly
 if(!actor||!actor.srd||!record||!speed||speed<=0)return undefined
 return{creatureType:actor.type,speedFeet:speed,hover:Boolean(record.engine.movementModes?.hover),sourceUrl:record.sourceUrl,sourceSha256:record.sourceSha256}
}
export function nativeFlightFallIssue(state:GameState,entityId?:string){
 for(const location of Object.values(nativeFlightStateOf(state)?.locations??{})){
  if(entityId&&location.entityId!==entityId||!location.airborne||actualNativeFlightLocation(state,location.entityId)!==location)continue
  const body=state.monsters[location.entityId],source=nativeFlightSource(state,location.entityId)
  if(!body||source?.hover)continue
  const deprived=body.hp.current<=0||body.conditions.includes('prone')||movementSpeedProfile(state,body.id,source?.speedFeet??0).speedFeet===0
  if(deprived)return{code:'NATIVE_FLIGHT_FALL_DUE',message:'This actual non-hover body lost flight ability. Complete its exact real fall to an explicitly selected existing support before further actions, movement or turns.',entityId:body.id,locationWitness:JSON.stringify(location)}
 }
 return null
}
export function nativeFlightFrameWitness(state:GameState,id:string){const actor=id==='player'?state.player:state.monsters[id]??state.npcs?.[id];return JSON.stringify({id,mapId:state.currentMapId,cell:actor?.position,type:actor&&'type'in actor?actor.type:undefined,vertical:entityVerticalContext(state,id),body:physicalBodyWitness(state,id)})}
export function projectNativeFlightPoint(state:GameState,entityId:string,point:NativeFlightPoint,eventId:string,datumZFeet:number,landingSurfaceId?:string){
 const projected=structuredClone(state),body=projected.monsters[entityId];if(!body)return{issue:{code:'NATIVE_FLIGHT_ACTOR_REQUIRED',message:'Select the exact actual active native flying source.'}}
 const support=landingSurfaceId?projected.dmTools?.jumping?.surfaces[landingSurfaceId]:undefined
 if(landingSurfaceId&&(!support||support.kind!=='support'||support.mapId!==state.currentMapId||support.elevationFeet!==point.zFeet||!support.cells.some(c=>c.x===point.x&&c.y===point.y)||!activeVerticalSurface(state,landingSurfaceId)))return{issue:{code:'NATIVE_FLIGHT_SUPPORT_REQUIRED',message:'The exact real landing support must occupy this actual destination and measured Z; no floor is created.'}}
 const data=(projected.dmTools as unknown as{nativeFlight:ReturnType<typeof initialNativeFlightState>}).nativeFlight??=initialNativeFlightState(),old=data.locations[entityId]
 body.position={x:point.x,y:point.y}
 for(const episode of swallowedEpisodes(projected,entityId)){const target=episode.targetId==='player'?projected.player:projected.monsters[episode.targetId];if(target)target.position={...body.position};if(episode.targetId==='player')projected.currentRoomId=inferRoomIdOnMap(body.position,projected.currentMapId,projected)??projected.currentRoomId}
 data.locations[entityId]={entityId,mapId:state.currentMapId!,point:{...point},airborne:!landingSurfaceId,datumZFeet:landingSurfaceId?point.zFeet:datumZFeet,supportSurfaceId:landingSurfaceId,sourceEventId:eventId,sourceKind:'move',at:state.worldTimeSeconds??0,revision:(old?.revision??0)+1}
 if(projected.dmTools?.jumping){if(support)projected.dmTools.jumping.supports[entityId]={entityId,mapId:state.currentMapId!,surfaceId:landingSurfaceId!,elevationFeet:point.zFeet,observedAt:state.worldTimeSeconds??0,source:'Actual explicit native flight landing on the existing measured support.',revision:(projected.dmTools.jumping.supports[entityId]?.revision??0)+1};else delete projected.dmTools.jumping.supports[entityId]}
 return{state:projected,location:data.locations[entityId]}
}
export function nativeFlightSegmentIssue(state:GameState,entityId:string,from:NativeFlightPoint,to:NativeFlightPoint){
 const height=bodyPhysicalHeight(state,entityId)
 if(height===null)return{code:'NATIVE_FLIGHT_BODY_REQUIRED',message:'Record this actual body height/posture before its whole-body flight clearance; no source-size anatomy is invented.'}
 const water=Object.values(locomotionStateOf(state)?.media??{}).find(m=>m.mode==='swim'&&m.mapId===state.currentMapId&&m.cells.some(c=>(c.x===from.x&&c.y===from.y)||(c.x===to.x&&c.y===to.y))&&Math.min(from.zFeet,to.zFeet)<m.surfaceZFeet!-E&&Math.max(from.zFeet,to.zFeet)+height>m.bottomZFeet+E);if(water)return{code:'NATIVE_FLIGHT_AIR_CONTEXT_REQUIRED',message:'The chosen whole-body native flight crosses observed real water. This flight source grants no underwater movement or free breathing; resolve the actual water/surface transition first.'}
 const a={x:from.x*5,y:from.y*5,z:from.zFeet},b={x:to.x*5,y:to.y*5,z:to.zFeet}
 for(const blocker of spellAreaBlockers(state)){
  const path=blockerRayInterval(blocker,a,b);if(!path)continue
  if(blocker.issue||blocker.bottom===undefined||blocker.top===undefined)return{code:'NATIVE_FLIGHT_BARRIER_CONTEXT_REQUIRED',message:blocker.issue??'Measure the actual crossed wall/object/support vertical bounds before the whole-body flight; no infinite or absent obstacle is inferred.'}
  const lo=Math.min(a.z+(b.z-a.z)*path.min,a.z+(b.z-a.z)*path.max),hi=Math.max(a.z+(b.z-a.z)*path.min,a.z+(b.z-a.z)*path.max)+height
  if(blocker.slab?hi<=blocker.bottom+E||lo>=blocker.top-E:hi<blocker.bottom-E||lo>blocker.top+E)continue
  return{code:'NATIVE_FLIGHT_BLOCKED',message:'This exact selected flight segment intersects a real measured barrier; choose a different actual route.'}
 }
 for(const other of [state.player,...Object.values(state.monsters),...Object.values(state.npcs??{})]){
  if(swallowedBy(state,other.id)||other.id===entityId||other.position.x!==to.x||other.position.y!==to.y||'mapId'in other&&other.mapId&&other.mapId!==state.currentMapId||'isAlive'in other&&other.isAlive===false)continue
  const vertical=entityVerticalContext(state,other.id),otherHeight=bodyPhysicalHeight(state,other.id)
  if(!vertical.known||otherHeight===null)return{code:'NATIVE_FLIGHT_OCCUPANT_CONTEXT_REQUIRED',message:'An actual body occupies this selected XY column. Its real measured vertical extent is required before flying through it; no anatomy or discovery is invented.'}
  if(to.zFeet<vertical.zFeet!+otherHeight-E&&to.zFeet+height>vertical.zFeet!+E)return{code:'NATIVE_FLIGHT_BODY_BLOCKED',message:'The selected actual flight destination overlaps an existing physical body.'}
 }
 return null
}
export function spatialAttackContext(state:GameState,actorId:string,targetId:string,weaponReference:string,attackMode?:string):{context?:SpatialAttackContext;issue?:{code:string;message:string}}{
 const from=entityVerticalContext(state,actorId),to=entityVerticalContext(state,targetId),needs=from.airborne||to.airborne||!from.known||!to.known||from.zFeet!==to.zFeet
 if(!needs)return{}
 const record=nativeFlightStateOf(state)?.attacks[spatialAttackKey(actorId,targetId,weaponReference,attackMode)]
 if(!record||record.mapId!==state.currentMapId||record.actorWitness!==nativeFlightFrameWitness(state,actorId)||record.targetWitness!==nativeFlightFrameWitness(state,targetId))return{issue:{code:'SPATIAL_ATTACK_GEOMETRY_REQUIRED',message:'Qualify this exact selected actual weapon/source action and target with real attack points in the measured bodies before dice/costs. A different action, body height, posture or position cannot reuse an old ray.'}}
 const actor=actorId==='player'?state.player:state.monsters[actorId]??state.npcs?.[actorId],target=targetId==='player'?state.player:state.monsters[targetId]??state.npcs?.[targetId]
 if(!actor||!target)return{issue:{code:'ENTITY_NOT_FOUND',message:'The exact selected physical source and target must still exist.'}}
 const origin={...actor.position,zFeet:record.input.originZFeet},point={...target.position,zFeet:record.input.targetZFeet},a={x:origin.x*5,y:origin.y*5,z:origin.zFeet},b={x:point.x*5,y:point.y*5,z:point.zFeet},ray=spellAreaRay(spellAreaBlockers(state),a,b)
 if(ray.kind!=='clear')return{issue:{code:ray.kind==='unknown'?'SPATIAL_ATTACK_BARRIER_REQUIRED':'SPATIAL_ATTACK_BLOCKED',message:ray.kind==='unknown'?ray.message:'The exact actual spatial weapon ray is blocked by a measured physical barrier.'}}
 return{context:{source:'Actual selected measured spatial weapon ray; real Euclidean feet approved2026-11-04',actorId,targetId,weaponReference,attackMode,origin,target:point,actorWitness:record.actorWitness,targetWitness:record.targetWitness,distanceFeet:distance3(a,b),observationEventId:record.input.eventId}}
}
export function validateNativeFlightState(state:GameState){
 const data=nativeFlightStateOf(state);if(!data)return[];const issues:string[]=[]
 for(const move of Object.values(data.moves)){
  const actual=move.input.path.slice(1).map((point,index)=>distance3(
   {x:move.input.path[index].x*5,y:move.input.path[index].y*5,z:move.input.path[index].zFeet},
   {x:point.x*5,y:point.y*5,z:point.zFeet}))
  const partialCost=move.partial?move.stepFeet[move.cursor]*move.partial.fraction:0
  if(move.partial){
   const from=move.input.path[move.cursor],to=move.input.path[move.cursor+1],fraction=move.partial.fraction
   if(!to||from.x!==to.x||from.y!==to.y||move.partial.point.x!==from.x||move.partial.point.y!==from.y
    ||Math.abs(move.partial.point.zFeet-(from.zFeet+(to.zFeet-from.zFeet)*fraction))>1e-7)
    issues.push('An exact partial native segment requires its original vertical segment and retained real fraction, never a rounded or replaced route point.')
  }
  if(move.command!==JSON.stringify({kind:'native-flight',input:move.input})||move.at>(state.worldTimeSeconds??0)||actual.some((n,index)=>Math.abs(n-move.stepFeet[index])>1e-7)
   ||!Number.isFinite(partialCost)||Math.abs(move.spentFeet-move.stepFeet.slice(0,move.cursor).reduce((a,b)=>a+b,0)-partialCost)>1e-7
   ||move.result&&JSON.stringify(data.receipts[move.input.eventId]?.result)!==JSON.stringify(move.result))
   issues.push('A native flight retains every real geometric segment cost, actual paid cursor and immutable completion receipt.')
  const decisions=move.opportunityDecisions??[],resolutions=move.opportunityResolutions??{}
  if(new Set(decisions).size!==decisions.length||JSON.stringify([...decisions].sort())!==JSON.stringify(Object.keys(resolutions).sort()))
   issues.push('Every ignored native opportunity boundary retains exactly its own actual resolved decision receipt.')
  for(const[key,resolution]of Object.entries(resolutions)){
   const boundary=resolution.boundary,index=boundary.segmentIndex??0
   const paid=move.stepFeet.slice(0,index-1).reduce((sum,cost)=>sum+cost,0)+(move.stepFeet[index-1]??0)*boundary.fraction
   if(key!==boundary.key||boundary.nativeFlightId!==move.input.eventId||boundary.actorId!==move.input.entityId
    ||boundary.mapId!==move.mapId||boundary.combatGeneration!==move.combatGeneration||boundary.turnCounter!==move.turnCounter
    ||JSON.stringify(boundary.from)!==JSON.stringify(move.input.path[index-1])||JSON.stringify(boundary.to)!==JSON.stringify(move.input.path[index])
    ||Math.abs(resolution.paidFeet-paid)>E||resolution.paidFeet>move.spentFeet+E||resolution.at>(state.worldTimeSeconds??0))
    issues.push('An original resolved native opportunity receipt retains its actual route segment, source boundary, paid distance and past clock.')
  }
  if(move.status==='opportunity'){
   const pending=state.hero?.pending,command=pending?.command.type==='movement'?pending.command:pending?.continuation
   const boundary=move.opportunityBoundary,offered=SpatialOpportunityBoundarySchema.safeParse((command?.opportunityBoundary as {spatial?:unknown}|undefined)?.spatial)
   const point=nativeFlightMovePoint(move),body=state.monsters[move.input.entityId],location=actualNativeFlightLocation(state,move.input.entityId)
   if(!boundary||!move.opportunityPendingId||pending?.command.type==='movement'&&pending.id!==move.opportunityPendingId
    ||JSON.stringify(command?.ignored)!==JSON.stringify([...decisions,boundary?.key])||command?.nativeFlightId!==move.input.eventId||command.actorId!==move.input.entityId
    ||!offered.success||JSON.stringify(offered.data)!==JSON.stringify(SpatialOpportunityBoundarySchema.parse(boundary))||boundary.nativeFlightId!==move.input.eventId
    ||boundary.segmentIndex!==move.cursor+1||JSON.stringify(boundary.from)!==JSON.stringify(move.input.path[move.cursor])
    ||JSON.stringify(boundary.to)!==JSON.stringify(move.input.path[move.cursor+1])
    ||JSON.stringify(boundary.point)!==JSON.stringify(point)||Math.abs(boundary.fraction-(move.partial?.fraction??0))>E
    ||state.phase!=='combat'||boundary.mapId!==state.currentMapId||move.mapId!==state.currentMapId
    ||boundary.combatGeneration!==(state.combatGeneration??0)||boundary.turnCounter!==(state.turnCounter??0)
    ||pending?.sourceId!==boundary.sourceId||pending.targetId!==move.input.entityId||!body||!location
    ||JSON.stringify(location.point)!==JSON.stringify(point))
    issues.push('A partial native opportunity retains its exact original active route, reached fraction and matching pending movement or held source-roll continuation.')
  }
 }
 for(const[id,location]of Object.entries(data.locations)){
  if(location.sourceKind==='xge_fall'){const e=state.dmTools?.xgeFalling?.episodes[location.sourceEventId],point=e?{...e.initialPoint,zFeet:e.steps.at(-1)!.toZFeet}:undefined;if(!e||e.status!=='arrested'||!e.recovery||e.input.entityId!==id||location.mapId!==e.mapId||JSON.stringify(location.point)!==JSON.stringify(point)||!location.airborne||location.datumZFeet!==e.landingZFeet||location.at!==e.recovery?.at||location.revision!==e.steps.length+1||location.supportSurfaceId!==undefined)issues.push('Recovered native flight retains its actual paid XGE recovery and reached source point.');continue}
  if(location.sourceKind==='fall'){
   const fall=data.falls[location.sourceEventId]
   if(!fall||fall.entityId!==id||JSON.stringify(fall.point)!==JSON.stringify(location.point))issues.push('A native flight fall retains the actual original falling body and selected real support.')
   continue
  }
  const move=data.moves[location.sourceEventId]
  if(id!==location.entityId||!move||move.input.entityId!==id||move.mapId!==location.mapId
   ||location.at>(state.worldTimeSeconds??0)||JSON.stringify(nativeFlightMovePoint(move))!==JSON.stringify(location.point))
   issues.push('A native flight location requires the exact committed point of its original real route.')
 }
 for(const[id,record]of Object.entries(data.attacks))if(id!==spatialAttackKey(record.input.actorId,record.input.targetId,record.input.weaponReference,record.input.attackMode)
  ||!data.receipts[record.input.eventId]||JSON.stringify(data.receipts[record.input.eventId]?.result.record)!==JSON.stringify(record)||record.at>(state.worldTimeSeconds??0))
  issues.push('An actual spatial attack qualification retains its exact selected source, target and original physical receipt.')
 return issues
}

export function projectNativeFlightFall(state:GameState,entityId:string,landingSurfaceId:string):{issue?:{code:string;message:string};state?:GameState;locationWitness?:string;distanceFeet?:number;point?:NativeFlightPoint}{
 const location=actualNativeFlightLocation(state,entityId),surface=state.dmTools?.jumping?.surfaces[landingSurfaceId]
 if(!location?.airborne||!surface||surface.kind!=='support'||surface.mapId!==state.currentMapId||!activeVerticalSurface(state,landingSurfaceId)||!surface.cells.some(c=>c.x===location.point.x&&c.y===location.point.y)||surface.elevationFeet>=location.point.zFeet)return{issue:{code:'NATIVE_FLIGHT_FALL_SUPPORT_REQUIRED',message:'Choose an actual lower support at this same actual XY point for the already established native fall; no platform, descent or horizontal arrival is invented.'}}
 const intervening=Object.values(state.dmTools?.jumping?.surfaces??{}).find(s=>s.kind==='support'&&s.mapId===state.currentMapId&&s.elevationFeet>surface.elevationFeet&&s.elevationFeet<location.point.zFeet&&s.cells.some(c=>c.x===location.point.x&&c.y===location.point.y)&&activeVerticalSurface(state,s.surfaceId));if(intervening)return{issue:{code:'NATIVE_FLIGHT_FALL_FIRST_SUPPORT_REQUIRED',message:'An actual nearer supporting surface interrupts this descent; do not fall through it to a lower selected platform.'}}
 const routeIssue=nativeFlightSegmentIssue(state,entityId,location.point,{...location.point,zFeet:surface.elevationFeet});if(routeIssue)return{issue:routeIssue}
 const projected=projectNativeFlightPoint(state,entityId,{...location.point,zFeet:surface.elevationFeet},location.sourceEventId,surface.elevationFeet,landingSurfaceId)
 if(projected.issue)return projected
 return{state:projected.state,locationWitness:JSON.stringify(location),distanceFeet:location.point.zFeet-surface.elevationFeet,point:{...location.point,zFeet:surface.elevationFeet}}
}

export function nativeFlightTransitionIssue(state:GameState){return Object.values(nativeFlightStateOf(state)?.locations??{}).some(location=>location.airborne&&actualNativeFlightLocation(state,location.entityId)===location)?{code:'NATIVE_FLIGHT_MAP_TRANSITION_REQUIRED',message:'Resolve each actual native airborne body landing or fall before a ground map transition; archiving a map cannot erase its physical altitude.'}:null}
