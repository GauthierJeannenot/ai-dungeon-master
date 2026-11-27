import type { GameState } from './types'
import { locomotionStateOf,actualLocomotionLocation,type LocomotionPoint } from './locomotion-state'
import { activeVerticalSurface,jumpingStateOf } from './jumping-state'
import { readPhysicalBarrier } from './vertical-barriers'
import { getMonsterRecord } from './srd/monsters'
import { movementSpeedProfile } from './movement-modes'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'

export const sameLocomotionPoint=(a:LocomotionPoint,b:LocomotionPoint)=>a.x===b.x&&a.y===b.y&&a.zFeet===b.zFeet
export function locomotionSpeed(state:GameState,id:string,mode:'climb'|'swim'){
  const body=id==='player'?state.player:state.monsters[id]
  const native=body&&'type'in body?getMonsterRecord(body.type)?.engine.movementModes?.[mode]:undefined
  return {...movementSpeedProfile(state,id,native===undefined?undefined:native),nativeSpeed:native!==undefined,mode}
}
export function readMovementMedium(state:GameState,id:string){
  const medium=locomotionStateOf(state)?.media[id]
  if(!medium||medium.mapId!==state.currentMapId)return{issue:{code:'MOVEMENT_MEDIUM_REQUIRED',message:'Choose the actual observed climbing face or water surface on this map.'}}
  if(medium.mode==='climb'){
    const read=readPhysicalBarrier(state,medium.barrierId!)
    if(!read.active||read.issue||JSON.stringify(read.barrier)!==medium.barrierWitness)return{medium,issue:{code:'CLIMBING_FACE_CHANGED',message:'The actual measured climbing face changed; its old route does not create a wall, grip or support.'}}
  }
  return{medium}
}
export function projectLocomotionStep(state:GameState,id:string,mediumId:string,point:LocomotionPoint,landingSurfaceId?:string){
  const next=structuredClone(state),body=id==='player'?next.player:next.monsters[id],read=readMovementMedium(state,mediumId)
  if(read.issue)return{state:next,issue:read.issue}
  if(!body)return{state:next,issue:{code:'LOCOMOTION_ACTUAL_BODY_REQUIRED',message:'Choose an actual capable creature; no profile or map archive is activated.'}}
  const medium=read.medium!,data=jumpingStateOf(next)!,surface=landingSurfaceId?data.surfaces[landingSurfaceId]:undefined
  if(landingSurfaceId&&(!surface||surface.kind!=='support'||surface.mapId!==state.currentMapId||!activeVerticalSurface(state,landingSurfaceId)||surface.elevationFeet!==point.zFeet||!surface.cells.some(cell=>cell.x===point.x&&cell.y===point.y)))
    return{state:next,issue:{code:'LOCOMOTION_LANDING_SUPPORT_REQUIRED',message:'Choose the actual intact destination support at this exact cell and measured level.'}}
  if(!surface&&(!medium.cells.some(cell=>cell.x===point.x&&cell.y===point.y)||point.zFeet<medium.bottomZFeet||point.zFeet>medium.topZFeet||medium.mode==='swim'&&point.zFeet>medium.surfaceZFeet!))
    return{state:next,issue:{code:'LOCOMOTION_MEDIUM_BOUNDS',message:'The chosen body point leaves the actual observed face or water surface without a real destination support; no wall, water or floor is created.'}}
  body.position={x:point.x,y:point.y}
  const previous=data.locomotion!.locations[id]
  if(surface){
    delete data.locomotion!.locations[id]
    data.supports[id]={entityId:id,mapId:state.currentMapId!,surfaceId:surface.surfaceId,elevationFeet:surface.elevationFeet,observedAt:state.worldTimeSeconds??0,source:'Actual paid climbing/swimming arrival on the selected existing support.',revision:(data.supports[id]?.revision??0)+1}
  }else{
    delete data.supports[id]
    data.locomotion!.locations[id]={entityId:id,mapId:state.currentMapId!,mediumId,cell:{...point},at:state.worldTimeSeconds??0,revision:(previous?.revision??0)+1,sourceEventId:'uncommitted-projection'}
  }
  return{state:next,issue:null}
}
/** The MJ selects an existing surface at the actual XY point of one completed
 * fall. Its measured level determines the real descent; no platform or move is
 * introduced by a second observation. */
export function projectLocomotionFall(state:GameState,id:string,surfaceId:string){
  const location=actualLocomotionLocation(state,id),surface=jumpingStateOf(state)?.surfaces[surfaceId]
  if(!location||!surface||surface.kind!=='support'||surface.mapId!==state.currentMapId||!activeVerticalSurface(state,surfaceId)
    ||!surface.cells.some(cell=>cell.x===location.cell.x&&cell.y===location.cell.y)||surface.elevationFeet>location.cell.zFeet)
    return{issue:{code:'LOCOMOTION_FALL_SUPPORT_REQUIRED',message:'Choose the actual intact lower support at this same body cell for the already completed fall; no horizontal landing, distance or floor is invented.'}}
  const next=structuredClone(state),data=jumpingStateOf(next)!
  delete data.locomotion!.locations[id]
  data.supports[id]={entityId:id,mapId:state.currentMapId!,surfaceId,elevationFeet:surface.elevationFeet,observedAt:state.worldTimeSeconds??0,source:'Actual completed established fall from a measured locomotion position to this selected existing support.',revision:(data.supports[id]?.revision??0)+1}
  return{state:next,distanceFeet:location.cell.zFeet-surface.elevationFeet,locationWitness:JSON.stringify(location)}
}
/** A lost actual climbing grip is a due physical outcome, not a new platform
 * or an automatic damage/save event. Surface swimming does not infer whether
 * an unconscious body sinks or keeps its airway above the water. */
export function locomotionPhysicalIssue(state:GameState){
  for(const[id,location]of Object.entries(locomotionStateOf(state)?.locations??{})){
    if(!actualLocomotionLocation(state,id))continue
    const medium=locomotionStateOf(state)!.media[location.mediumId]
    if(medium?.mode!=='climb')continue
    const body=id==='player'?state.player:state.monsters[id],read=readMovementMedium(state,location.mediumId)
    if(!body||body.hp.current<=0||body.conditions.some(condition=>['unconscious','incapacitated','paralyzed','petrified','stunned'].includes(condition))||read.issue)
      return{code:'LOCOMOTION_PHYSICAL_OUTCOME_REQUIRED',message:'This real measured climbing suspension no longer has a capable body and intact source grip. Explicitly resolve its actual completed fall onto an existing support before actions, turns or time; no platform, automatic damage die or fabricated MCP call is granted.',entityId:id,mediumId:location.mediumId,locationWitness:JSON.stringify(location)}
  }
  return null
}
export function validateLocomotionState(state:GameState){
  const data=locomotionStateOf(state);if(!data)return[]
  const issues:string[]=[],at=state.worldTimeSeconds??0
  for(const medium of Object.values(data.media)){
    const receipt=data.receipts[medium.eventId]
    if(medium.at>at||!receipt||witness(receipt.result.medium)!==witness(medium))issues.push('A physical movement medium requires its exact retained real observation receipt.')
  }
  for(const[id,location]of Object.entries(data.locations)){
    const move=data.moves[location.sourceEventId],point=move?.input.path[move.cursor]
    if(location.at>at||!actualLocomotionLocation(state,id)||jumpingStateOf(state)?.supports[id]||state.dmTools?.weather?.flights[id]?.airborne
      ||!move||move.input.entityId!==id||!point||!sameLocomotionPoint(point,location.cell))issues.push('A suspended/swimming position requires its actual committed movement cursor, without a second grounded or flying position.')
  }
  for(const move of Object.values(data.moves)){
    let command:{kind?:string;input?:unknown}|undefined
    try{command=JSON.parse(move.command)}catch{/* rejected below */}
    let historicalMedium:{eventId?:string}|undefined
    try{historicalMedium=JSON.parse(move.mediumWitness)}catch{/* rejected below */}
    if(command?.kind!=='special-movement'||witness(command.input)!==witness(move.input)
      ||!historicalMedium?.eventId||witness(data.receipts[historicalMedium.eventId]?.result.medium)!==witness(historicalMedium)||move.at>at
      ||move.spentFeet!==move.stepFeet.slice(0,move.cursor).reduce((sum,feet)=>sum+feet,0))issues.push('A real special route retains its original observed medium, request and actual paid prefix.')
    if(move.status==='completed'){
      const receipt=data.receipts[move.input.eventId]
      if(!receipt||receipt.command!==move.command||witness(receipt.result)!==witness(move.result))issues.push('A completed physical route requires its exact original result receipt.')
    }
    if(move.status!=='completed'){
      const body=move.input.entityId==='player'?state.player:state.monsters[move.input.entityId],point=move.input.path[move.cursor]
      if(!body||move.mapId!==state.currentMapId||move.turnCounter!==(state.turnCounter??0)||move.combatGeneration!==(state.combatGeneration??0)||body.position.x!==point.x||body.position.y!==point.y)issues.push('An interrupted actual route retains its original map, turn and body cursor.')
      const pending=state.hero?.pending
      if(move.status==='check'){
        const resolution=pending?.command.toolkitResolution as{domain?:string;command?:{eventId?:string}}|undefined
        if(resolution?.domain!=='special-movement-check'||resolution.command?.eventId!==move.input.eventId)issues.push('The held Athletics check requires its one original physical continuation.')
      }
      if(move.status==='opportunity'){
        const continuation=pending?.command.type==='movement'?pending.command:pending?.continuation
        if(continuation?.specialMovementId!==move.input.eventId)issues.push('The held opportunity retains this same real swimming/climbing route.')
      }
      if(move.status==='ground_contact'&&!move.groundGearContactIds?.some(id=>{
        const contact=state.dmTools?.groundGear?.contacts[id],saved=contact?.continuation
        return contact&&contact.status!=='resolved'&&saved?.type==='engine-effect'&&saved.domain==='special-movement'&&(saved.command as Record<string,unknown>|undefined)?.eventId===move.input.eventId
      }))issues.push('The actual completed arrival awaits only its own retained physical contact.')
    }
  }
  return issues
}
