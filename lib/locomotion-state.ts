import { z } from 'zod'
import type { GameState } from './types'

const Id=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Entity=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Source=z.string().trim().min(1).max(1000)
const Feet=z.number().finite().min(-100000).max(100000)
export const LocomotionPointSchema=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative(),zFeet:Feet}).strict()
export const MovementMediumInputSchema=z.object({eventId:Id,mediumId:Id,mapId:Entity,roomId:Entity,
  mode:z.enum(['climb','swim']),cells:z.array(z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()).min(1).max(256),
  bottomZFeet:Feet,topZFeet:Feet,surfaceZFeet:Feet.optional(),barrierId:Id.optional(),factId:Entity,
  reobserveChangedPhysicalReferenceConfirmed:z.literal(true).optional(),actualPhysicalMediumConfirmed:z.literal(true),handsRequired:z.union([z.literal(0),z.literal(1),z.literal(2)]),
  difficult:z.boolean(),source:Source,
  athletics:z.object({reason:z.enum(['rough_water','slippery_surface','few_handholds']),dc:z.number().int().min(1).max(40),source:Source}).strict().optional(),
}).strict().superRefine((value,ctx)=>{
  if(value.bottomZFeet>value.topZFeet)ctx.addIssue({code:'custom',message:'The actual measured bounds must be ordered.'})
  if(value.mode==='swim'?(value.surfaceZFeet===undefined||value.barrierId!==undefined||value.surfaceZFeet<value.bottomZFeet||value.surfaceZFeet>value.topZFeet):(!value.barrierId||value.surfaceZFeet!==undefined))ctx.addIssue({code:'custom',message:'Surface swimming requires its real measured water surface; climbing references a measured actual barrier.'})
  if(value.athletics&&(value.mode==='swim'?value.athletics.reason!=='rough_water':value.athletics.reason==='rough_water'))ctx.addIssue({code:'custom',message:'Choose the source circumstance for this actual mode, not a generic invented skill check.'})
})
export const SpecialMovementInputSchema=z.object({eventId:Id,entityId:Entity,mediumId:Id,
  path:z.array(LocomotionPointSchema).min(2).max(256),landingSurfaceId:Id.optional(),allowPartial:z.boolean().optional(),
  actualClearanceConfirmed:z.literal(true),surfaceSwimmingConfirmed:z.literal(true).optional(),source:Source,
}).strict()
const Location=z.object({entityId:Entity,mapId:Entity,mediumId:Id,cell:LocomotionPointSchema,at:z.number().nonnegative(),revision:z.number().int().positive(),sourceEventId:Id}).strict()
const Move=z.object({input:SpecialMovementInputSchema,command:z.string(),mapId:Entity,mediumWitness:z.string(),
  turnCounter:z.number().int().nonnegative(),combatGeneration:z.number().int().nonnegative(),at:z.number().nonnegative(),
  cursor:z.number().int().nonnegative(),stepFeet:z.array(z.number().finite().positive()).max(255),
  spentFeet:z.number().finite().nonnegative(),nativeSpeed:z.boolean(),sourceSpeedFeet:z.number().finite().nonnegative(),
  status:z.enum(['check','moving','opportunity','ground_contact','completed']),check:z.record(z.string(),z.unknown()).optional(),
  result:z.record(z.string(),z.unknown()).optional(),groundGearContactIds:z.array(Entity).max(32).optional(),
}).strict()
export const LocomotionStateSchema=z.object({version:z.literal(1),media:z.record(z.string(),MovementMediumInputSchema.safeExtend({at:z.number().nonnegative(),barrierWitness:z.string().optional()})),
  locations:z.record(z.string(),Location),moves:z.record(z.string(),Move),
  receipts:z.record(z.string(),z.object({command:z.string(),result:z.record(z.string(),z.unknown())}).strict()),
}).strict().superRefine((value,ctx)=>{
  if(Object.keys(value.media).length>256||Object.keys(value.locations).length>256||Object.keys(value.moves).length>512||Object.keys(value.receipts).length>2048)ctx.addIssue({code:'custom',message:'Actual media, positions and movement receipts remain bounded and retained.'})
  for(const[id,medium]of Object.entries(value.media))if(id!==medium.mediumId||new Set(medium.cells.map(cell=>`${cell.x},${cell.y}`)).size!==medium.cells.length)ctx.addIssue({code:'custom',message:'One real medium retains its actual distinct cells and identity.'})
  for(const[id,location]of Object.entries(value.locations))if(id!==location.entityId||!value.media[location.mediumId])ctx.addIssue({code:'custom',message:'The actual suspended/swimming body requires its real recorded medium.'})
  for(const[id,move]of Object.entries(value.moves))if(id!==move.input.eventId||move.cursor>=move.input.path.length||move.stepFeet.length!==move.input.path.length-1||(move.status==='completed')!==Boolean(move.result))ctx.addIssue({code:'custom',message:'A real route retains its original decision, cursor and outcome.'})
})
export type LocomotionState=z.infer<typeof LocomotionStateSchema>
export type MovementMediumInput=z.infer<typeof MovementMediumInputSchema>
export type SpecialMovementInput=z.infer<typeof SpecialMovementInputSchema>
export type LocomotionPoint=z.infer<typeof LocomotionPointSchema>
export const initialLocomotionState=():LocomotionState=>({version:1,media:{},locations:{},moves:{},receipts:{}})
export const locomotionStateOf=(state:GameState)=>(state.dmTools as{jumping?:{locomotion?:LocomotionState}}|undefined)?.jumping?.locomotion
export function actualLocomotionLocation(state:GameState,id:string){const entry=locomotionStateOf(state)?.locations[id],body=id==='player'?state.player:state.monsters[id]??state.npcs?.[id];return entry&&entry.mapId===state.currentMapId&&body&&body.position.x===entry.cell.x&&body.position.y===entry.cell.y?entry:undefined}
export function locomotionGroundContact(state:GameState,id:string){return actualLocomotionLocation(state,id)?false:undefined}
export function locomotionHands(state:GameState,id:string){const location=actualLocomotionLocation(state,id);return location?locomotionStateOf(state)?.media[location.mediumId]?.handsRequired??0:0}
