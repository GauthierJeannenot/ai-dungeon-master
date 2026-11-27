import { SpatialOpportunityBoundarySchema } from './spatial-opportunity-state'
import { NativeFlightPointSchema,SpatialAttackContextSchema } from './spatial-weapon-state'
export { NativeFlightPointSchema,SpatialAttackContextSchema } from './spatial-weapon-state'
import { swallowedBy } from './swallow-state'
import { z } from 'zod'
import type { GameState } from './types'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Event=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
const Feet=z.number().finite().min(-100000).max(100000)
const Source=z.string().trim().min(1).max(1000)
export const NativeFlightMoveSchema=z.object({eventId:Event,entityId:Id,path:z.array(NativeFlightPointSchema).min(2).max(256),takeoffSurfaceId:Id.optional(),landingSurfaceId:Id.optional(),factId:Id,actualWholeBodyClearanceConfirmed:z.literal(true),source:Source}).strict()
export const SpatialAttackObservationSchema=z.object({eventId:Event,actorId:Id,targetId:Id,weaponReference:Id,attackMode:z.enum(['melee','thrown']).optional(),originZFeet:Feet,targetZFeet:Feet,factId:Id,actualAttackPointsConfirmed:z.literal(true),source:Source}).strict()
const Location=z.object({entityId:Id,mapId:Id,point:NativeFlightPointSchema,airborne:z.boolean(),datumZFeet:Feet,supportSurfaceId:Id.optional(),revision:z.number().int().positive(),sourceEventId:Event,sourceKind:z.enum(['move','fall','xge_fall']).default('move'),at:z.number().nonnegative()}).strict()
const Move=z.object({input:NativeFlightMoveSchema,command:z.string(),mapId:Id,at:z.number().nonnegative(),turnCounter:z.number().int().nonnegative(),combatGeneration:z.number().int().nonnegative(),sourceWitness:z.string(),bodyWitness:z.string(),cursor:z.number().int().nonnegative(),partial:z.object({fraction:z.number().finite().positive().lt(1),point:NativeFlightPointSchema}).strict().optional(),opportunityBoundary:SpatialOpportunityBoundarySchema.optional(),opportunityDecisions:z.array(z.string()).max(4096).optional(),opportunityPendingId:Id.optional(),opportunityResolutions:z.record(z.string(),z.object({boundary:SpatialOpportunityBoundarySchema,pendingId:Id,decision:z.enum(['attack','decline']),paidFeet:z.number().finite().nonnegative(),at:z.number().finite().nonnegative()}).strict()).optional(),stepFeet:z.array(z.number().finite().positive()).max(255),spentFeet:z.number().finite().nonnegative(),status:z.enum(['moving','opportunity','ground_contact','completed','stopped']),groundGearContactIds:z.array(Id).max(32).optional(),result:z.record(z.string(),z.unknown()).optional()}).strict()
export const NativeFlightStateSchema=z.object({version:z.literal(1),locations:z.record(z.string(),Location),moves:z.record(z.string(),Move),falls:z.record(z.string(),z.object({eventId:Event,entityId:Id,landingSurfaceId:Id,locationWitness:z.string(),point:NativeFlightPointSchema,at:z.number().nonnegative(),result:z.record(z.string(),z.unknown()).optional()}).strict()),attacks:z.record(z.string(),z.object({input:SpatialAttackObservationSchema,mapId:Id,actorWitness:z.string(),targetWitness:z.string(),at:z.number().nonnegative()}).strict()),receipts:z.record(z.string(),z.object({command:z.string(),result:z.record(z.string(),z.unknown())}).strict())}).strict().superRefine((data,ctx)=>{
 if(Object.keys(data.locations).length>256||Object.keys(data.moves).length>512||Object.keys(data.falls).length>512||Object.keys(data.attacks).length>1024||Object.keys(data.receipts).length>2048)ctx.addIssue({code:'custom',message:'Actual native flight source, route and attack histories are bounded and retained.'})
 for(const[id,move]of Object.entries(data.moves))if(Object.keys(move.opportunityResolutions??{}).length>4096||id!==move.input.eventId||move.cursor>=move.input.path.length||move.stepFeet.length!==move.input.path.length-1||(['completed','stopped'].includes(move.status))!==Boolean(move.result))ctx.addIssue({code:'custom',message:'Actual native flight retains the original complete path, cursor and receipt.'})
 for(const[id,location]of Object.entries(data.locations))if(id!==location.entityId||!(location.sourceKind==='xge_fall'||(location.sourceKind==='fall'?data.falls[location.sourceEventId]:data.moves[location.sourceEventId])))ctx.addIssue({code:'custom',message:'An actual native-flight location requires its real committed source route.'})
})
export type NativeFlightState=z.infer<typeof NativeFlightStateSchema>
export type NativeFlightPoint=z.infer<typeof NativeFlightPointSchema>
export type NativeFlightMove=z.infer<typeof NativeFlightMoveSchema>
export type SpatialAttackContext=z.infer<typeof SpatialAttackContextSchema>
export const nativeFlightStateOf=(state:Pick<GameState,'dmTools'>)=>(state.dmTools as{nativeFlight?:NativeFlightState}|undefined)?.nativeFlight
export const initialNativeFlightState=():NativeFlightState=>({version:1,locations:{},moves:{},falls:{},attacks:{},receipts:{}})
export const spatialAttackKey=(actorId:string,targetId:string,weaponReference:string,attackMode?:string)=>JSON.stringify([actorId,targetId,weaponReference,attackMode??'melee'])
export function actualNativeFlightLocation(state:GameState,entityId:string){if(swallowedBy(state,entityId))return undefined;const location=nativeFlightStateOf(state)?.locations[entityId],body=entityId==='player'?state.player:state.monsters[entityId]??state.npcs?.[entityId];return location&&body&&location.mapId===state.currentMapId&&body.position.x===location.point.x&&body.position.y===location.point.y?location:undefined}

/** The immutable original route retains its last complete waypoint and an
 * explicit paid fraction. A physical body is never rounded to the next point. */
export function nativeFlightMovePoint(move:NativeFlightState['moves'][string]){return move.partial?.point??move.input.path[move.cursor]}
