import type { GameState } from './types'
import type { VerticalBarrier,VerticalBarrierReference } from './vertical-barrier-state'
import { getMapSpec,getAdventureMap,firstMapId } from './adventure-map'
import { edgeKey,cellKey } from './battlemap-geometry'
import { navigationGrid,savedDoorState } from './navigation'
import { activeMapTerrain } from './combat-round-events'
import { activeVerticalSurface,type JumpingState } from './jumping-state'

export type BarrierBox={minXFeet:number;maxXFeet:number;minYFeet:number;maxYFeet:number}
export type PhysicalBarrierReference={exists:boolean;active:boolean;witness:string;boxes:BarrierBox[];
 edge?:{from:{x:number;y:number};to:{x:number;y:number}};reason?:string}
const ledger=(state:GameState)=>(state.dmTools as{jumping?:JumpingState}|undefined)?.jumping
export const barrierReferenceKey=(ref:VerticalBarrierReference)=>ref.kind==='edge'?`edge:${edgeKey(ref.from,ref.to)}`:ref.kind==='cell'?`cell:${cellKey(ref.cell)}`:ref.kind==='surface'?`surface:${ref.surfaceId}`:ref.kind==='object'?`object:${ref.objectId}:${JSON.stringify(ref.footprint)}`:`cover:${ref.coverId}:${JSON.stringify(ref.footprint)}`
const boxForCell=(cell:{x:number;y:number}):BarrierBox=>({minXFeet:(cell.x-.5)*5,maxXFeet:(cell.x+.5)*5,minYFeet:(cell.y-.5)*5,maxYFeet:(cell.y+.5)*5})
function overlaps(a:BarrierBox,b:BarrierBox){return a.minXFeet<b.maxXFeet&&a.maxXFeet>b.minXFeet&&a.minYFeet<b.maxYFeet&&a.maxYFeet>b.minYFeet}
export function resolvePhysicalBarrierReference(state:GameState,mapId:string,reference:VerticalBarrierReference):PhysicalBarrierReference{
 const data=getAdventureMap(state),map=data.maps.find(map=>map.id===mapId),none=(reason:string):PhysicalBarrierReference=>({exists:false,active:false,witness:'',boxes:[],reason})
 if(!map)return none('actual_map_missing')
 const grid=navigationGrid({...state,currentMapId:mapId},'player',map.geometry,{ignoreActorEffects:true,ignoreDoorKnowledge:true})
 if(reference.kind==='edge'){
  if(!grid.valid(reference.from)||!grid.valid(reference.to))return none('actual_edge_outside_map')
  const key=edgeKey(reference.from,reference.to),reviewed=map.geometry?.edges.find(edge=>edgeKey(edge.from,edge.to)===key)
  const actualDoor=reviewed?.doorId?data.doors?.find(door=>door.id===reviewed.doorId):data.doors?.find(door=>door.sides.some(s=>cellKey(s.cell)===cellKey(reference.from))&&door.sides.some(s=>cellKey(s.cell)===cellKey(reference.to)))
  const knownWall=reviewed?.kind==='wall'||!map.geometry&&grid.free(reference.from,false)&&grid.free(reference.to,false)&&!grid.step(reference.from,reference.to,false,false)
  if(!knownWall&&!actualDoor)return none('actual_wall_or_door_reference_required')
  const active=knownWall&&!actualDoor||Boolean(actualDoor&&!actualDoor.opening&&savedDoorState(state,actualDoor.id)==='closed')
  return{exists:true,active,witness:JSON.stringify({mapId,key,kind:actualDoor?'door':'wall',doorId:actualDoor?.id,sides:actualDoor?.sides,geometrySource:map.geometry?.source}),boxes:[],edge:{from:reference.from,to:reference.to},...(!active?{reason:'actual_open_threshold'}:{})}
 }
 if(reference.kind==='cell'){
  if(!grid.valid(reference.cell))return none('actual_cell_outside_map')
  const key=cellKey(reference.cell),native=map.geometry?.blockedCells.some(cell=>cellKey(cell)===key),terrain=activeMapTerrain({...state,currentMapId:mapId}).filter(t=>t.kind==='blocked'&&t.cells.some(cell=>cellKey(cell)===key))
  if(!native&&!terrain.length)return none('actual_blocked_geometry_cell_required')
  return{exists:true,active:true,witness:JSON.stringify({mapId,key,native:Boolean(native),terrain,geometrySource:map.geometry?.source}),boxes:[boxForCell(reference.cell)]}
 }
 if(reference.kind==='surface'){
  const surface=ledger(state)?.surfaces[reference.surfaceId]
  if(!surface||surface.mapId!==mapId||surface.kind!=='support')return none('actual_support_surface_required')
  if(!activeVerticalSurface(state,reference.surfaceId))return{exists:true,active:false,witness:JSON.stringify(surface),boxes:surface.cells.map(boxForCell),reason:'actual_destroyed_or_moved_support'}
  return{exists:true,active:true,witness:JSON.stringify(surface),boxes:surface.cells.map(boxForCell)}
 }
 const footprint=reference.footprint
 if(footprint.minXFeet< -2.5||footprint.minYFeet< -2.5||footprint.maxXFeet>(map.grid.cols-.5)*5||footprint.maxYFeet>(map.grid.rows-.5)*5)
  return none('measured_footprint_outside_actual_map')
 if(reference.kind==='object'){
  const object=state.dmTools?.objects[reference.objectId]
  if(!object||object.mapId!==mapId||object.kind!=='obstacle')return none('actual_obstacle_object_required')
  const cellBox=boxForCell(object.cell),span=object.size==='large'?5:0
  if(!overlaps(footprint,{...cellBox,maxXFeet:cellBox.maxXFeet+span,maxYFeet:cellBox.maxYFeet+span}))return none('measured_footprint_not_at_actual_object')
  if(footprint.minXFeet<cellBox.minXFeet||footprint.minYFeet<cellBox.minYFeet||footprint.maxXFeet>cellBox.maxXFeet+span||footprint.maxYFeet>cellBox.maxYFeet+span)return none('measured_footprint_exceeds_actual_occupied_object_space')
  return{exists:true,active:object.state!=='destroyed'&&object.hp.current>0,witness:JSON.stringify({mapId,id:object.id,creation:object.creation,cell:object.cell,size:object.size,state:object.state,hp:object.hp}),boxes:[footprint],...(object.state==='destroyed'||object.hp.current<=0?{reason:'actual_destroyed_object'}:{})}
 }
 const cover=state.dmTools?.cover?.records[reference.coverId]
 if(!cover||cover.mapId!==mapId)return none('actual_cover_reference_required')
 if(!overlaps(footprint,boxForCell(cover.obstacleCell)))return none('measured_footprint_not_at_actual_cover')
  const known=boxForCell(cover.obstacleCell)
  if(footprint.minXFeet<known.minXFeet||footprint.minYFeet<known.minYFeet||footprint.maxXFeet>known.maxXFeet||footprint.maxYFeet>known.maxYFeet)return none('measured_footprint_exceeds_actual_cover_cell')
 return{exists:true,active:true,witness:JSON.stringify(cover),boxes:[footprint]}
}
/** Shared pure reader for spell rays and actual jumps. No actor is enlisted,
 * moved or resurrected to inspect a retained physical measurement. */
export function readPhysicalBarrier(state:GameState,barrierId:string){
 const barrier=ledger(state)?.barriers[barrierId]
 if(!barrier)return{active:false,issue:{code:'VERTICAL_BARRIER_REQUIRED',message:'Choose a genuinely measured existing physical barrier.'}}
 const actual=resolvePhysicalBarrierReference(state,barrier.mapId,barrier.reference)
 if(actual.exists&&!actual.active)return{barrier,active:false,actual,reason:actual.reason}
 if(!actual.exists)return{barrier,active:false,actual,issue:{code:'VERTICAL_BARRIER_REFERENCE_MISSING',message:'The retained measurement no longer has its exact actual physical reference; no wall or body is invented.'}}
 if(actual.witness!==barrier.provenance.referenceWitness)return{barrier,active:false,actual,issue:{code:'VERTICAL_BARRIER_MEASUREMENT_STALE',message:'This physical object, cover or surface changed after measurement. Observe its real current bounds before using them; no earlier height is silently reused.'}}
 return{barrier,active:true,actual}
}
export function activePhysicalBarriers(state:GameState,mapId=state.currentMapId??firstMapId(state)){
 return Object.values(ledger(state)?.barriers??{}).filter(barrier=>barrier.mapId===mapId).map(barrier=>readPhysicalBarrier(state,barrier.id))
}
export function validateVerticalBarrierRecords(state:GameState):string[]{
 const data=ledger(state);if(!data)return[]
 const errors:string[]=[],at=state.worldTimeSeconds??0
 for(const [id,barrier]of Object.entries(data.barriers)){
  const receipt=data.receipts[barrier.provenance.eventId]
  let command:{kind?:string;input?:{barrierId?:string;eventId?:string}}|undefined
  try{command=receipt?JSON.parse(receipt.command):undefined}catch{/* invalid below */}
  const recorded=receipt?.result.barrier as VerticalBarrier|undefined
  if(id!==barrier.id||barrier.provenance.at>at||!receipt||command?.kind!=='vertical-barrier'||command.input?.barrierId!==id||command.input?.eventId!==barrier.provenance.eventId
   ||!recorded||JSON.stringify(recorded)!==JSON.stringify(barrier))errors.push(`Measured barrier ${id} lacks its exact real observation receipt.`)
 }
 return errors
}
