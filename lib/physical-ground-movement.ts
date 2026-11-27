import { actualNativeFlightLocation } from './native-flight-state'
import { actualLocomotionLocation,locomotionStateOf } from './locomotion-state'
import type { GameState } from './types'
import { actualSurfaceAt,entityVerticalContext,jumpingStateOf } from './jumping-state'
export function projectActualGroundMovement(state:GameState,entityId:string,to:{x:number;y:number},mapId=state.currentMapId){
 if(actualNativeFlightLocation(state,entityId)?.airborne)return{state:structuredClone(state),issue:{code:'NATIVE_FLIGHT_PHYSICAL_DISPLACEMENT_REQUIRED',message:'This actual airborne body requires its exact source-aware XYZ route or real supported fall before XY forced/teleport/paired movement; no old map projection grants a new altitude or free landing.'}}
 if(actualLocomotionLocation(state,entityId))return{state:structuredClone(state),issue:{code:'LOCOMOTION_PHYSICAL_DISPLACEMENT_REQUIRED',message:'This actual swimming/suspended body needs a source-aware route or completed fall. The old XY forced/teleport/map arrival path does not establish its new support or vertical outcome.'}}
 const next=structuredClone(state),actor=entityId==='player'?next.player:next.monsters[entityId]??next.npcs?.[entityId]
 if(!actor)return{state:next,issue:null}
 const current=entityVerticalContext(state,entityId),changedMap=mapId!==state.currentMapId||'mapId'in actor&&Boolean(actor.mapId&&actor.mapId!==mapId)
 actor.position={...to};if('mapId'in actor)actor.mapId=mapId;next.currentMapId=mapId
 const data=jumpingStateOf(next),support=data?.supports[entityId]
 if(changedMap&&Object.values(state.dmTools?.traps??{}).some(trap=>trap.pitGeometry?.open&&support?.surfaceId===trap.pitGeometry.input.bottomSurfaceId&&current.zFeet!<Number(trap.pitGeometry.cover.elevationFeet)))return{state:next,issue:{code:'PIT_ACTUAL_EXIT_REQUIRED',message:'This body still occupies its actual lower pit floor. Reach a real exit support before map travel; a map transfer cannot lift it ten feet.'}}
 if(changedMap){if(data)delete data.supports[entityId];return{state:next,issue:null}}
 if(current.airborne)return{state:next,issue:null}
 const surfaces=actualSurfaceAt(next,to),matching=surfaces.find(surface=>surface.kind==='support'&&surface.elevationFeet===current.zFeet)
 const water=Object.values(locomotionStateOf(state)?.media??{}).some(medium=>medium.mode==='swim'&&medium.mapId===mapId&&medium.cells.some(cell=>cell.x===to.x&&cell.y===to.y))
 if(water&&!matching)return{state:next,issue:{code:'SWIMMING_MEDIUM_REQUIRED',message:'This destination is observed real water without an actual measured supporting floor at the chosen walking level. Use actual swimming or establish the real wading support; no floor or water-walking is invented.'}}
 if((!current.known||current.zFeet!==0||surfaces.some(surface=>surface.kind==='gap'||surface.elevationFeet!==current.zFeet))&&!matching)
  return{state:next,issue:{code:'VERTICAL_MOVEMENT_REQUIRED',message:'This real destination has a gap, different support elevation or unresolved physical height. Use its actual jump, flight, fall or climbing procedure; a horizontal move cannot grant a floor or free level change.'}}
 if(data){if(matching)data.supports[entityId]={entityId,mapId:mapId!,surfaceId:matching.surfaceId,elevationFeet:matching.elevationFeet,observedAt:state.worldTimeSeconds??0,source:'Actual same-level ground movement to the measured support.',revision:(support?.revision??0)+1};else delete data.supports[entityId]}
 return{state:next,issue:null}
}
