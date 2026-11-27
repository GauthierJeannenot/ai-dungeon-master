import { z } from 'zod'
import type { GameState } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'

const Id=z.string().min(1).max(180).refine(value=>!['__proto__','prototype','constructor'].includes(value))
const Source=z.string().trim().min(1).max(1000)
/** A measured object extent, never its coarse size category or a new body. */
export const LightObjectDimensionsSchema=z.object({x:z.number().finite().positive().max(1000),y:z.number().finite().positive().max(1000),z:z.number().finite().positive().max(1000)}).strict()
export const LightObjectSelectionSchema=z.object({objectId:Id,color:z.string().trim().min(1).max(80).optional()}).strict()
export type LightObjectSelection=z.infer<typeof LightObjectSelectionSchema>

export const LightManipulationCostSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('measured_interval'),seconds:z.number().int().positive().max(3600),activity:z.enum(['light','strenuous']),reason:Source}).strict(),
 z.object({kind:z.literal('object_interaction'),reason:Source}).strict(),
 z.object({kind:z.literal('action'),reason:Source}).strict(),
])

export const LIGHT_SPELL_SOURCE={book:'phb-2014',file:'rules/books/phb-2014.md',startLine:11009,endLine:11020,ruleset:'2014',brightFeet:20,dimAdditionalFeet:20,durationSeconds:3600,maxObjectDimensionFeet:10} as const

export const RecordLightObjectSchema=z.object({eventId:Id,objectId:Id,dimensionsFeet:LightObjectDimensionsSchema,coverage:z.enum(['uncovered','opaque_full']),physicalFactId:Id,actualObjectMeasurementsConfirmed:z.literal(true),source:Source}).strict()
export const SetLightObjectCoverSchema=z.object({eventId:Id,objectId:Id,coverage:z.enum(['uncovered','opaque_full']),physicalFactId:Id,actualExistingCoverStateConfirmed:z.literal(true),handsRequired:z.union([z.literal(1),z.literal(2)]),source:Source,cost:LightManipulationCostSchema}).strict()
const Value=z.record(z.string(),z.unknown()),At=z.number().finite().nonnegative()
export const LightSpellStateSchema=z.object({version:z.literal(1),objects:z.record(z.string(),z.object({input:RecordLightObjectSchema,fact:Value,objectCreation:z.string(),at:At,command:z.string(),coverEventId:Id}).strict()),covers:z.record(z.string(),z.object({objectId:Id,coverage:z.enum(['uncovered','opaque_full']),input:Value,fact:Value,at:At,ordinal:z.number().int().positive(),command:z.string()}).strict()),casts:z.record(z.string(),z.object({id:Id,casterId:Id,generation:z.number().int().positive(),selection:LightObjectSelectionSchema,objectCreation:z.string(),measurementCommand:z.string(),at:At,command:z.string(),status:z.enum(['prepared','resolved','countered','ended']),effectId:Id.optional(),resolvedAt:At.optional(),expiresAt:At.optional(),endedAt:At.optional(),endReason:z.string().optional()}).strict()),receipts:z.record(z.string(),z.object({command:z.string(),result:Value}).strict())}).strict()
export type LightSpellState=z.infer<typeof LightSpellStateSchema>
export const lightSpellStateOf=(state:GameState):LightSpellState|undefined=>state.dmTools?.lightSpell
export function lightObjectPosition(state:GameState,objectId:string){
 const object=state.dmTools?.objects[objectId],measurement=lightSpellStateOf(state)?.objects[objectId]
 if(!object||!measurement||object.creation!==measurement.objectCreation||object.state==='destroyed')return undefined
 return{objectId,mapId:object.mapId,roomId:object.roomId,cell:{...object.cell}}
}
export function lightObjectCoverage(state:GameState,objectId:string){const d=lightSpellStateOf(state),record=d?.objects[objectId];return record?d?.covers[record.coverEventId]?.coverage:undefined}
export function endLightEffectInState(state:GameState,effectId:string,at:number){const d=lightSpellStateOf(state);if(!d)return;const cast=Object.values(d.casts).find(c=>c.effectId===effectId);if(cast){cast.status='ended';cast.endedAt=at;cast.endReason='effect_removed'}}
export function validateLightSpellState(state:GameState){
 const d=lightSpellStateOf(state);if(!d)return(state.hero?.effects.some(e=>e.kind==='light'&&e.data.lightCastId))?['Retain the actual object Light source ledger; no active qualified effect survives deletion of its source.']:[]
 if(!LightSpellStateSchema.safeParse(d).success)return['Invalid actual Light object source state.']
 const issues:string[]=[],now=state.worldTimeSeconds??0
 if(Object.keys(d.objects).length>64||Object.keys(d.casts).length>512||Object.keys(d.receipts).length>1024||Object.keys(d.covers).length>1024)issues.push('Retain bounded measured objects, original Light casts and cover/dismiss receipts; never silently evict history.')
 for(const[id,o]of Object.entries(d.objects)){
  const object=state.dmTools?.objects[id],body={input:o.input,fact:o.fact,objectCreation:o.objectCreation,at:o.at}
  if(id!==o.input.objectId||!object||object.creation!==o.objectCreation||o.fact.id!==o.input.physicalFactId||o.command!==witness(body)||o.at>now||!d.covers[o.coverEventId]||d.covers[o.coverEventId].objectId!==id||d.covers[o.coverEventId].ordinal!==Math.max(...Object.values(d.covers).filter(c=>c.objectId===id).map(c=>c.ordinal)))issues.push('Retain the original measured actual object instance, dimensions, cover source and qualification, never a creature or a new point light.')
 }
 for(const[id,c]of Object.entries(d.covers))if(!d.receipts[id]||d.receipts[id].command!==witness(c.input)||c.input.eventId!==id||c.input.objectId!==c.objectId||c.input.coverage!==c.coverage||c.fact.id!==c.input.physicalFactId||!(RecordLightObjectSchema.safeParse(c.input).success||SetLightObjectCoverSchema.safeParse(c.input).success)||!d.objects[c.objectId]||c.at>now||c.command!==witness({objectId:c.objectId,coverage:c.coverage,input:c.input,fact:c.fact,at:c.at,ordinal:c.ordinal}))issues.push('Retain exact original actual opaque-cover source, cost and receipt.')
 for(const[id,c]of Object.entries(d.casts)){
  const o=d.objects[c.selection.objectId],e=state.hero?.effects.find(e=>e.id===c.effectId)
  if(id!==c.id||c.casterId!=='player'||!o||o.objectCreation!==c.objectCreation||o.command!==c.measurementCommand||c.at>now||c.command!==witness({id:c.id,casterId:c.casterId,generation:c.generation,selection:c.selection,objectCreation:c.objectCreation,measurementCommand:c.measurementCommand,at:c.at})||c.status==='ended'&&(c.endedAt===undefined||c.endedAt>now))issues.push('Retain the original actual Light casting source and explicitly selected measured object.')
  if(c.status==='resolved'&&(c.expiresAt===undefined||c.resolvedAt===undefined||c.expiresAt!==c.resolvedAt+3600||c.resolvedAt<c.at||c.resolvedAt>now||c.effectId===undefined)||c.status==='resolved'&&c.expiresAt!>now&&(!e||e.kind!=='light'||e.sourceId!==c.casterId||e.targetIds.length||e.expiresAt!==c.expiresAt||e.data.lightCastId!==id||e.data.objectId!==c.selection.objectId||e.data.color!==c.selection.color))issues.push('An unexpired actual object Light retains its exact effect, duration, object identity and optional chosen color.')
 }
 const generations=Object.values(d.casts).map(c=>c.generation).sort((a,b)=>a-b);if(generations.some((g,i)=>g!==i+1))issues.push('Retain one monotonic original Light generation per actual caster.')
 const active=(state.hero?.effects??[]).filter(e=>e.kind==='light'&&e.data.lightCastId&&e.expiresAt>now);if(new Set(active.map(e=>e.sourceId)).size!==active.length)issues.push('Only one actual unexpired Light per original caster.')
 for(const e of state.hero?.effects??[])if(e.kind==='light'&&e.data.lightCastId){const c=d.casts[String(e.data.lightCastId)];if(!c||c.effectId!==e.id||c.status!=='resolved')issues.push('No copied or fabricated luminous effect without its original actual object casting.')}
 return issues
}
