import { actualXgeFallingLocation } from './xge-falling-state'
import { actualNativeFlightLocation } from './native-flight-state'
import { spatialWeaponResolution } from './spatial-weapon-resolution'
import { LocomotionStateSchema,actualLocomotionLocation,locomotionGroundContact } from './locomotion-state'
import { swallowedBy } from './swallow-state'
import { activePhysicalLoad } from './physical-handling-state'
import { z } from 'zod'
import type { GameState } from './types'
import { VerticalBarrierSchema } from './vertical-barrier-state'

export const JumpIdSchema=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
  .refine(id=>!['constructor','prototype','__proto__'].includes(id))
const EntityId=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Source=z.string().trim().min(1).max(1000)
const Feet=z.number().finite().min(-100000).max(100000)
export const JumpCellSchema=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
export const VerticalSurfaceInputSchema=z.object({eventId:JumpIdSchema,surfaceId:JumpIdSchema,mapId:EntityId,roomId:EntityId,
  cells:z.array(JumpCellSchema).min(1).max(256),kind:z.enum(['support','gap']),elevationFeet:Feet,
  actualGeometryConfirmed:z.literal(true),objectId:EntityId.optional(),source:Source}).strict()
export const StandingSupportInputSchema=z.object({eventId:JumpIdSchema,entityId:EntityId,surfaceId:JumpIdSchema,
  actualCurrentSupportConfirmed:z.literal(true),bodyHeightFeet:z.number().finite().positive().max(1000).optional(),source:Source}).strict()
export const PhysicalBodyInputSchema=z.object({eventId:JumpIdSchema,entityId:EntityId,heightFeet:z.number().finite().positive().max(1000),actualMeasuredBodyConfirmed:z.literal(true),source:Source}).strict()
export const LowObstacleInputSchema=z.object({eventId:JumpIdSchema,obstacleId:JumpIdSchema,barrierId:EntityId,athleticsCheckRequired:z.boolean(),
  collisionSurfaceId:JumpIdSchema,actualClearanceConfirmed:z.literal(true),source:Source}).strict()
export const JumpInputSchema=z.object({eventId:JumpIdSchema,kind:z.enum(['long','high']),toCell:JumpCellSchema,
  heightFeet:z.number().finite().positive().max(100000).optional(),takeoffSurfaceId:JumpIdSchema.optional(),landingSurfaceId:JumpIdSchema.optional(),
  heightIrrelevantConfirmed:z.literal(true).optional(),clearanceConfirmed:z.literal(true).optional(),source:Source.optional(),
  combinedTrajectory:z.object({actualCombinedTrajectoryConfirmed:z.literal(true),totalFeet:z.number().finite().positive(),apexHeightFeet:z.number().finite().positive(),source:Source}).strict().optional(),
  obstacleIds:z.array(JumpIdSchema).max(32).default([]),acknowledgeEventIds:z.array(EntityId).max(64).default([]),
  higherJump:z.object({dc:z.number().int().min(1).max(40),allowedHeightFeet:z.number().finite().positive().max(100000),
    failureHeightFeet:z.number().finite().nonnegative().max(100000),actualCircumstanceConfirmed:z.literal(true),source:Source}).strict().optional(),
}).strict()
const Surface=VerticalSurfaceInputSchema.extend({at:z.number().nonnegative(),sourceObjectWitness:z.string().optional()})
const Support=z.object({entityId:EntityId,mapId:EntityId,surfaceId:JumpIdSchema,elevationFeet:Feet,observedAt:z.number().nonnegative(),
  source:Source,bodyHeightFeet:z.number().finite().positive().max(1000).optional(),bodyHeightPosture:z.enum(['upright','prone']).optional(),revision:z.number().int().positive()}).strict()
const Footwork=z.object({combatGeneration:z.number().int().nonnegative().optional(),phase:z.enum(['exploration','combat','dialogue']).optional(),mapId:EntityId,at:z.number().nonnegative(),turnCounter:z.number().int().nonnegative(),lastCell:JumpCellSchema,
  feet:z.number().finite().positive(),steps:z.array(z.object({from:JumpCellSchema,to:JumpCellSchema,feet:z.number().finite().positive()}).strict()).min(1).max(16)}).strict()
const Obstacle=z.object({input:LowObstacleInputSchema,mapId:EntityId,at:z.number().nonnegative(),objectCreation:z.string().optional()}).strict()
const Jump=z.object({input:JumpInputSchema,command:z.string(),mapId:EntityId,from:JumpCellSchema,path:z.array(JumpCellSchema).min(1).max(256),
  stepFeet:z.array(z.number().finite().nonnegative()).max(256),obstaclePlans:z.array(z.object({id:JumpIdSchema,step:z.number().int().positive(),collisionSurfaceId:JumpIdSchema}).strict()).max(32),
  cursor:z.number().int().nonnegative(),fromElevationFeet:Feet,toElevationFeet:Feet,maximumFeet:z.number().finite().nonnegative(),running:z.boolean(),
  totalFeet:z.number().finite().positive(),spentFeet:z.number().finite().nonnegative(),initialDiagonals:z.number().int().nonnegative(),
  turnCounter:z.number().int().nonnegative(),at:z.number().nonnegative(),
  status:z.enum(['obstacle_check','higher_check','moving','opportunity','landing_check','ground_contact','fall_required','completed']),
  obstacleChecks:z.array(z.record(z.string(),z.unknown())).max(32),nextObstacle:z.number().int().nonnegative(),
  heightMatters:z.boolean(),landingDifficult:z.boolean(),fallHeightFeet:z.number().finite().nonnegative().optional(),fallSupportSurfaceId:JumpIdSchema.optional(),
  landingContext:z.record(z.string(),z.unknown()).optional(),result:z.record(z.string(),z.unknown()).optional()}).strict()
export const JumpingStateSchema=z.object({locomotion:LocomotionStateSchema.optional(),version:z.literal(1),surfaces:z.record(z.string(),Surface),supports:z.record(z.string(),Support),
  barriers:z.record(z.string(),VerticalBarrierSchema),
  bodies:z.record(z.string(),z.object({entityId:EntityId,heightFeet:z.number().finite().positive().max(1000),posture:z.enum(['upright','prone']),source:Source,at:z.number().nonnegative(),revision:z.number().int().positive()}).strict()),
  obstacles:z.record(z.string(),Obstacle),footwork:Footwork.optional(),jumps:z.record(z.string(),Jump),activeJumpId:JumpIdSchema.optional(),
  receipts:z.record(z.string(),z.object({command:z.string(),result:z.record(z.string(),z.unknown())}).strict())}).strict().superRefine((state,ctx)=>{
  if(Object.keys(state.surfaces).length>256||Object.keys(state.supports).length>256||Object.keys(state.barriers).length>512||Object.keys(state.bodies).length>256||Object.keys(state.obstacles).length>256||Object.keys(state.jumps).length>512||Object.keys(state.receipts).length>2048)
    ctx.addIssue({code:'custom',message:'Actual support geometry, footwork and completed jumps are bounded and retained, never reset by another nonce.'})
  for(const[id,surface]of Object.entries(state.surfaces))if(id!==surface.surfaceId||new Set(surface.cells.map(cell=>`${cell.x},${cell.y}`)).size!==surface.cells.length)
    ctx.addIssue({code:'custom',message:'One real surface retains its unique identity and actual distinct cells.'})
  for(const[id,support]of Object.entries(state.supports)){const surface=state.surfaces[support.surfaceId];if(id!==support.entityId||!surface||surface.kind!=='support'||support.mapId!==surface.mapId||support.elevationFeet!==surface.elevationFeet)
    ctx.addIssue({code:'custom',message:'A grounded body must retain the actual measured supporting surface, not a new height by declaration.'})}
  const pending=Object.values(state.jumps).filter(jump=>jump.status!=='completed')
  if(pending.length!==Number(Boolean(state.activeJumpId))||state.activeJumpId&&!state.jumps[state.activeJumpId])ctx.addIssue({code:'custom',message:'At most one actual jump continuation may await its exact check, reaction or real fall.'})
  for(const[id,jump]of Object.entries(state.jumps))if(id!==jump.input.eventId||jump.cursor>=jump.path.length||jump.spentFeet>jump.totalFeet||(jump.status==='completed')!==Boolean(jump.result))
    ctx.addIssue({code:'custom',message:'A real leap retains one original request, exact physical cursor, movement cost and final outcome.'})
})
export type JumpingState=z.infer<typeof JumpingStateSchema>
export type JumpInput=z.infer<typeof JumpInputSchema>
export function initialJumpingState():JumpingState{return{version:1,surfaces:{},supports:{},barriers:{},bodies:{},obstacles:{},jumps:{},receipts:{}}}
type Holder={jumping?:JumpingState}
export const jumpingStateOf=(state:GameState)=>(state.dmTools as Holder|undefined)?.jumping
export const jumpCellKey=(cell:{x:number;y:number})=>`${cell.x},${cell.y}`
export function actualRunningStart(state:GameState){
  const foot=jumpingStateOf(state)?.footwork,position=state.player.position
  return Boolean(foot&&foot.combatGeneration===(state.combatGeneration??0)&&foot.phase===state.phase&&foot.mapId===state.currentMapId&&foot.at===(state.worldTimeSeconds??0)&&foot.turnCounter===(state.turnCounter??0)
    &&foot.lastCell.x===position.x&&foot.lastCell.y===position.y&&foot.feet>=10&&!state.player.conditions.includes('prone'))
}
export function activeVerticalSurface(state:GameState,surfaceId:string){if(Object.values(state.dmTools?.traps??{}).some(trap=>trap.pitGeometry?.open&&trap.pitGeometry.input.coverSurfaceId===surfaceId))return false;const surface=jumpingStateOf(state)?.surfaces[surfaceId];if(!surface)return false;if(!surface.objectId)return true;const object=state.dmTools?.objects[surface.objectId];return Boolean(object&&object.state!=='destroyed'&&object.hp.current>0&&surface.sourceObjectWitness===JSON.stringify({id:object.id,creation:object.creation,cell:object.cell,size:object.size,mapId:object.mapId}))}
export function actualSupportAt(state:GameState,entityId:string){const support=jumpingStateOf(state)?.supports[entityId];return support&&support.mapId===state.currentMapId?support:undefined}
export function actualSurfaceAt(state:GameState,cell:{x:number;y:number},elevationFeet?:number){
  return Object.values(jumpingStateOf(state)?.surfaces??{}).filter(surface=>surface.mapId===state.currentMapId&&activeVerticalSurface(state,surface.surfaceId)&&surface.cells.some(value=>value.x===cell.x&&value.y===cell.y)
    &&(elevationFeet===undefined||surface.elevationFeet===elevationFeet))
}
export function jumpingDueIssue(state:GameState){const ledger=jumpingStateOf(state),jump=ledger?.activeJumpId?ledger.jumps[ledger.activeJumpId]:undefined;return jump?{
  code:jump.status==='fall_required'?'JUMP_FALL_REQUIRED':'JUMP_CONTINUATION_REQUIRED',message:'Resolve the exact actual held jump/reaction/landing or completed fall before another physical action; no airborne pause grants a platform or free movement.',jumpId:jump.input.eventId}:null}
export function bodyPhysicalHeight(state:GameState,entityId:string):number|null{
  const posture=physicalBodyPosture(state,entityId),body=jumpingStateOf(state)?.bodies[entityId],support=actualSupportAt(state,entityId)
  if(body)return body.posture===posture?body.heightFeet:null
  return support?.bodyHeightPosture===posture?support.bodyHeightFeet??null:null
}
export function physicalBodyPosture(state:GameState,entityId:string):'upright'|'prone'|null{const actor=entityId==='player'?state.player:state.monsters?.[entityId]??state.npcs?.[entityId],conditions=(actor as{conditions?:string[]}|undefined)?.conditions;return conditions?conditions.includes('prone')?'prone':'upright':null}
export function physicalBodyWitness(state:GameState,entityId:string){const body=jumpingStateOf(state)?.bodies[entityId];return{entityId,heightFeet:bodyPhysicalHeight(state,entityId),posture:physicalBodyPosture(state,entityId),measuredPosture:body?.posture??null,revision:body?.revision??0,source:body?.source??null}}
/** Current actual foot/base contact only. A future waypoint is not a receipt
 * of passage, and an unknown jump/flight height never becomes ground contact. */
export function entityGroundContact(state:GameState,entityId:string,cell:{x:number;y:number},surfaceZFeet:number){
  if(swallowedBy(state,entityId))return{contact:false as boolean|null,context:entityVerticalContext(state,entityId),reason:'actual_contained_body_has_no_external_ground_contact'}
  const actor=entityId==='player'?state.player:state.monsters?.[entityId]??state.npcs?.[entityId],context=entityVerticalContext(state,entityId)
  if(!actor||actor.position.x!==cell.x||actor.position.y!==cell.y)return{contact:false as boolean|null,context,reason:'actor_not_at_actual_contact_cell'}
  if(locomotionGroundContact(state,entityId)===false)return{contact:false as boolean|null,context,reason:'actual_swimming_or_suspended_body_has_no_floor_contact'}
  if(context.airborne)return{contact:false as boolean|null,context,reason:'actual_airborne_body_has_no_ground_contact'}
  if(!context.known)return{contact:null as boolean|null,context,reason:'actual_ground_support_unresolved'}
  return{contact:context.zFeet===surfaceZFeet,context,reason:context.zFeet===surfaceZFeet?'actual_measured_ground_contact':'different_real_support_elevation'}
}
/** Z is feet in THIS map's datum; geographic sea-level elevation is unrelated.
 * A genuinely unmodeled airborne arc is unknown, never silently placed at Z0. */
export function entityVerticalContext(state:GameState,entityId:string):{entityId:string;known:boolean;zFeet:number|null;supportZFeet:number|null;surfaceId:string|undefined;aboveSupportFeet:number|null;airborne:boolean;revision:number;source:string}{
  const host=swallowedBy(state,entityId);if(host)return{...entityVerticalContext(state,host),entityId,source:'actual_swallowed_body_derived_from_host'}
  const falling=actualXgeFallingLocation(state,entityId);if(falling)return{entityId,known:true,zFeet:falling.point.zFeet,supportZFeet:falling.landingZFeet,surfaceId:undefined,aboveSupportFeet:falling.point.zFeet-falling.landingZFeet,airborne:true,revision:falling.revision,source:'actual_xge_falling_cursor'}
  const ledger=jumpingStateOf(state),actor=entityId==='player'?state.player:state.monsters?.[entityId]??state.npcs?.[entityId]
  const support=actualSupportAt(state,entityId),flight=state.dmTools?.weather?.flights?.[entityId]
  const unknown=(source:string,aboveSupportFeet:number|null=null,airborne=false)=>({entityId,known:false,zFeet:null,supportZFeet:null,surfaceId:undefined as string|undefined,aboveSupportFeet,airborne,revision:support?.revision??0,source})
  if(!actor)return unknown('actual_actor_missing')
  if(!actor.position)return unknown('actual_actor_position_required')
  if('mapId'in actor&&actor.mapId&&actor.mapId!==state.currentMapId)return unknown('actual_actor_on_another_map')
  const held=activePhysicalLoad(state);if(held?.targetKind==='creature'&&held.targetId===entityId&&held.operation==='carry'&&held.status==='active'&&held.mapId===state.currentMapId)return unknown('actual_entire_body_carried_no_ground_contact',null,true)
  const nativeFlight=actualNativeFlightLocation(state,entityId)
  if(nativeFlight)return{entityId,known:true,zFeet:nativeFlight.point.zFeet,supportZFeet:nativeFlight.datumZFeet,surfaceId:nativeFlight.supportSurfaceId,aboveSupportFeet:nativeFlight.point.zFeet-nativeFlight.datumZFeet,airborne:nativeFlight.airborne,revision:nativeFlight.revision,source:'actual_explicit_native_flight_xyz'}
  const locomotion=actualLocomotionLocation(state,entityId)
  if(locomotion)return{entityId,known:true,zFeet:locomotion.cell.zFeet,supportZFeet:null,surfaceId:undefined as string|undefined,aboveSupportFeet:null,airborne:false,revision:locomotion.revision,source:'actual_climbing_or_surface_swimming_position'}
  const cell=actor.position,jump=entityId==='player'&&ledger?.activeJumpId?ledger.jumps[ledger.activeJumpId]:undefined
  if(jump&&jump.mapId===state.currentMapId&&jump.status!=='completed'&&jump.status!=='landing_check'&&jump.status!=='ground_contact'&&(jump.cursor>0||jump.status==='fall_required')){
    const fallSurface=jump.fallSupportSurfaceId?ledger!.surfaces[jump.fallSupportSurfaceId]:undefined
    if(jump.status==='fall_required'&&jump.fallHeightFeet!==undefined&&fallSurface?.kind==='support'&&fallSurface.mapId===state.currentMapId&&fallSurface.cells.some(value=>value.x===cell.x&&value.y===cell.y))
      return{entityId,known:true,zFeet:fallSurface.elevationFeet+jump.fallHeightFeet,supportZFeet:fallSurface.elevationFeet,surfaceId:fallSurface.surfaceId,aboveSupportFeet:jump.fallHeightFeet,airborne:true,revision:jump.cursor+1,source:'actual_jump_fall_observation'}
    return unknown('actual_jump_arc_requires_observation',null,true)
  }
  const supportSurface=support?ledger?.surfaces[support.surfaceId]:undefined
  const actualSupport=Boolean(supportSurface&&activeVerticalSurface(state,supportSurface.surfaceId)&&supportSurface.kind==='support'&&supportSurface.cells.some(value=>value.x===cell.x&&value.y===cell.y))
  const columns=actualSurfaceAt(state,cell),conflictingGround=columns.some(surface=>surface.kind==='gap'||surface.elevationFeet!==0)
  if(flight?.airborne&&flight.mapId===state.currentMapId){
    if(flight.heightFeet===null)return unknown('actual_flight_height_unknown',null,true)
    const baseId=(flight as typeof flight&{baseSurfaceId?:string}).baseSurfaceId,base=baseId?ledger?.surfaces[baseId]:undefined
    const baseZ=base?.kind==='support'&&base.mapId===state.currentMapId&&base.cells.some(value=>value.x===cell.x&&value.y===cell.y)?base.elevationFeet
      :actualSupport?support!.elevationFeet:!conflictingGround?0:null
    if(baseZ===null)return unknown('actual_flight_support_datum_unknown',flight.heightFeet,true)
    return{entityId,known:true,zFeet:baseZ+flight.heightFeet,supportZFeet:baseZ,surfaceId:base?.surfaceId??support?.surfaceId,aboveSupportFeet:flight.heightFeet,airborne:true,revision:flight.revision+(support?.revision??0),source:base||actualSupport?'actual_flight_above_measured_support':'legacy_flat_map_flight'}
  }
  if(actualSupport)return{entityId,known:true,zFeet:support!.elevationFeet,supportZFeet:support!.elevationFeet,surfaceId:support!.surfaceId,aboveSupportFeet:0,airborne:false,revision:support!.revision,source:'actual_measured_support'}
  if(support||conflictingGround)return unknown('actual_ground_support_required')
  return{entityId,known:true,zFeet:0,supportZFeet:0,surfaceId:undefined as string|undefined,aboveSupportFeet:0,airborne:false,revision:0,source:'legacy_flat_map_plane'}
}
export function validateJumpingState(state:GameState){
  const ledger=jumpingStateOf(state);if(!ledger)return []
  const issues:string[]=[],at=state.worldTimeSeconds??0
  for(const surface of Object.values(ledger.surfaces))if(surface.at>at)issues.push('An actual surface observation cannot be recorded in the future.')
  for(const[id,barrier]of Object.entries(ledger.barriers))if(id!==barrier.id||barrier.provenance.at>at)issues.push('A real bounded barrier retains its exact reference identity and actual observation time.')
  for(const support of Object.values(ledger.supports))if(support.observedAt>at)issues.push('An actual standing support cannot be observed in the future.')
  for(const body of Object.values(ledger.bodies))if(body.at>at)issues.push('A real body measurement cannot be reconstructed from the future.')
  const foot=ledger.footwork
  if(foot&&(foot.at>at||(foot.combatGeneration!==undefined&&foot.combatGeneration>(state.combatGeneration??0))||foot.turnCounter>(state.turnCounter??0)||foot.feet!==foot.steps.reduce((sum,step)=>sum+step.feet,0)
    ||jumpCellKey(foot.lastCell)!==jumpCellKey(foot.steps.at(-1)!.to)
    ||foot.steps.some((step,index)=>index>0&&jumpCellKey(step.from)!==jumpCellKey(foot.steps[index-1].to))))
    issues.push('A running start requires its contiguous actual paid on-foot steps, not a trail of teleports, inferred distance or future movement.')
  for(const jump of Object.values(ledger.jumps)){
    if(jump.at>at)issues.push('An actual requested jump cannot start in the future.')
    if(jump.status!=='completed'){
      if(jump.mapId!==state.currentMapId||jump.turnCounter!==(state.turnCounter??0)||jumpCellKey(jump.path[jump.cursor])!==jumpCellKey(state.player.position))
        issues.push('A live jump continuation belongs to its original actual map, turn and physical cursor.')
      if(jump.status==='obstacle_check'||jump.status==='higher_check'||jump.status==='landing_check'){
        const pending=state.hero?.pending?.command.toolkitResolution as {domain?:string;command?:{jumpId?:string}}|undefined
        if(pending?.domain!=='actual-jump-check'||pending.command?.jumpId!==jump.input.eventId)issues.push('A held jump check requires its exact original skill-check continuation, never another die.')
      }
      if(jump.status==='ground_contact'&&!Object.values(state.dmTools?.groundGear?.contacts??{}).some(contact=>contact.status!=='resolved'&&contact.continuation?.jumpId===jump.input.eventId))issues.push('A grounded jump waiting on real gear needs its exact unresolved contact continuation, never another landing event.')
      if(jump.status==='opportunity'){
        const pending=state.hero?.pending,continuation=pending?.command.type==='movement'?pending.command:pending?.continuation
        if(continuation?.jumpId!==jump.input.eventId)issues.push('An opportunity-interrupted leap retains its actual original movement continuation, including held attack or poison-save branches.')
      }
    }
  }
  return issues
}

/** Conservative bridge for old XY weapon/cover procedures. It keeps equal
 * actual planes legal; source-aware 3D spell volumes use the shared contexts
 * directly instead of discarding real relief or imposing a global ban. */
export function physicalHeightCombatIssue(state:GameState,entityIds:readonly string[]){
 const selectedIds=[...new Set(entityIds)];if(selectedIds.length===2&&spatialWeaponResolution(state,selectedIds[0],selectedIds[1]))return null
 const data=jumpingStateOf(state);if(!data)return null
 const ids=[...new Set(entityIds)],jump=data.activeJumpId?data.jumps[data.activeJumpId]:undefined
 const flatJumpPlane=jump&&jump.mapId===state.currentMapId&&['moving','opportunity'].includes(jump.status)&&jump.input.kind==='long'&&!jump.heightMatters
   &&Number.isFinite(jump.fromElevationFeet)&&jump.fromElevationFeet===jump.toElevationFeet
   &&jump.path[jump.cursor]?.x===state.player.position.x&&jump.path[jump.cursor]?.y===state.player.position.y?jump.fromElevationFeet:undefined
 const contexts=ids.map(id=>{const context=entityVerticalContext(state,id);return !context.known&&id==='player'&&flatJumpPlane!==undefined?{...context,known:true,zFeet:flatJumpPlane,source:'actual_flat_jump_same_proven_support_plane'}:context})
 const unknown=contexts.filter(context=>!context.known)
 if(unknown.length)return{code:'PHYSICAL_HEIGHT_CONTEXT_REQUIRED',message:'This actual physical support/airborne height is unresolved for the chosen XY weapon or cover interaction. Resolve its real context before dice or costs; no height is inferred.',entityIds:unknown.map(context=>context.entityId)}
 const levels=contexts.filter(context=>context.known).map(context=>context.zFeet)
 if(new Set(levels).size>1)return{code:'PHYSICAL_HEIGHT_COMBAT_GEOMETRY_REQUIRED',message:'The chosen bodies occupy genuinely different measured levels. This XY weapon/cover procedure has no represented vertical reach/ray geometry; no range or cover is silently flattened.',entityIds:ids}
 return null
}
export function physicalHeightPointIssue(state:GameState,entityIds:readonly string[]){
 if(!jumpingStateOf(state))return null
 const contexts=[...new Set(entityIds)].map(id=>entityVerticalContext(state,id))
 if(contexts.some(context=>!context.known||context.zFeet!==0))return{code:'PHYSICAL_HEIGHT_POINT_GEOMETRY_REQUIRED',message:'The actual chosen body is on measured relief or has unresolved physical height. This XY-only point/cover origin needs its real vertical context before costs; no Z0 point or ray is invented.',entityIds:[...new Set(entityIds)]}
 return null
}
