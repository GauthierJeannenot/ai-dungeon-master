import { z } from 'zod'
import type { GameState } from './types'
const Id=z.string().min(1).max(180).refine(id=>!['__proto__','prototype','constructor'].includes(id))
const Time=z.number().nonnegative(),Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
export const OilFirePlanSchema=z.object({eventId:Id,targetKind:z.enum(['creature','object']),targetId:Id,useId:Id,
  at:Time,baseFireDamage:z.number().positive(),additionalFireDamage:z.literal(5)}).strict()
export type OilFirePlan=z.infer<typeof OilFirePlanSchema>
export const OilCoatingSchema=z.object({useId:Id,itemId:Id,sourceId:Id,targetKind:z.enum(['creature','object']),targetId:Id,
  appliedAt:Time,expiresAt:Time}).strict().refine(value=>value.expiresAt===value.appliedAt+60)
export const OilStateSchema=z.object({version:z.literal(1),
  coatings:z.record(z.string(),OilCoatingSchema),
  patches:z.record(z.string(),z.object({id:Id,itemId:Id,sourceId:Id,mapId:Id,roomId:Id,cell:Cell,elevationFeet:z.number(),
    surfaceFactId:Id,surfaceFact:z.record(z.string(),z.unknown()),pouredAt:Time,
    ignitedAt:Time.optional(),burnsUntil:Time.optional(),ignitionEventId:Id.optional(),flameItemId:Id.optional(),
    extinguishedAt:Time.optional(),weatherExtinction:z.object({mapId:Id,roomId:Id,revision:z.number().int().positive(),strongWind:z.boolean(),precipitation:z.enum(['none','heavy_rain','heavy_snow'])}).strict().optional(),
  }).strict().refine(value=>(value.ignitedAt===undefined?value.burnsUntil===undefined:value.burnsUntil===value.ignitedAt+12)
    &&(value.extinguishedAt===undefined?!value.weatherExtinction:value.ignitedAt!==undefined&&value.extinguishedAt>=value.ignitedAt&&value.weatherExtinction!==undefined
      &&(value.weatherExtinction.strongWind||value.weatherExtinction.precipitation==='heavy_rain')))),
  damageTurns:z.record(z.string(),z.object({turnKey:z.string().max(500),patchIds:z.array(Id).min(1),at:Time,result:z.record(z.string(),z.unknown())}).strict()),
  fireReceipts:z.record(z.string(),z.object({plan:OilFirePlanSchema,packet:z.record(z.string(),z.unknown())}).strict()),
  receipts:z.record(z.string(),z.object({command:z.string().max(24000),result:z.record(z.string(),z.unknown())}).strict()),
}).strict()
export type OilState=z.infer<typeof OilStateSchema>
export type OilCoating=z.infer<typeof OilCoatingSchema>
export type OilPatch=OilState['patches'][string]
export const oilTargetKey=(kind:'creature'|'object',id:string)=>JSON.stringify([kind,id])
export function activeOilCoating(state:Pick<GameState,'dmTools'|'worldTimeSeconds'>,kind:'creature'|'object',id:string){
  const map=state.dmTools?.oil?.coatings,key=oilTargetKey(kind,id),record=map&&Object.hasOwn(map,key)?map[key]:undefined
  return record&&record.appliedAt<=(state.worldTimeSeconds??0)&&record.expiresAt>(state.worldTimeSeconds??0)?record:undefined
}
export function oilStateIssues(state:GameState){
  const oil=state.dmTools?.oil;if(!oil)return []
  if(!OilStateSchema.safeParse(oil).success)return ['Invalid actual oil dose, surface, fire or turn receipt schema.']
  const errors:string[]=[],at=state.worldTimeSeconds??0
  if(Object.keys(oil.receipts).length>512||Object.keys(oil.coatings).length>256||Object.keys(oil.patches).length>256||Object.keys(oil.damageTurns).length>512||Object.keys(oil.fireReceipts).length>512)
    errors.push('Retained oil source history exceeds its bounded capacity.')
  for(const[key,coat]of Object.entries(oil.coatings)){
    const use=oil.receipts[coat.useId]?.result
    if(key!==oilTargetKey(coat.targetKind,coat.targetId)||coat.appliedAt>at||use?.consumed!==true||use.hit!==true
      ||use.itemId!==coat.itemId||use.targetKind!==coat.targetKind||use.targetId!==coat.targetId||use.appliedAt!==coat.appliedAt||use.expiresAt!==coat.expiresAt)
      errors.push('An oil coating needs its actual successful physical flask use, exact target and chronology.')
  }
  for(const[id,patch]of Object.entries(oil.patches))if(id!==patch.id||patch.pouredAt>at||!Object.hasOwn(oil.receipts,id)
    ||patch.extinguishedAt!==undefined&&patch.extinguishedAt>at||patch.ignitedAt!==undefined&&(patch.ignitedAt>at||!patch.ignitionEventId||!Object.hasOwn(oil.receipts,patch.ignitionEventId)))
    errors.push('A burning oil surface needs its actual poured pint and real ignition event.')
  for(const[id,receipt]of Object.entries(oil.fireReceipts)){
    const use=oil.receipts[receipt.plan.useId]?.result
    if(id!==receipt.plan.eventId||receipt.plan.at>at||use?.consumed!==true||use.hit!==true||use.targetId!==receipt.plan.targetId||use.targetKind!==receipt.plan.targetKind
      ||typeof use.appliedAt!=='number'||typeof use.expiresAt!=='number'||receipt.plan.at<use.appliedAt||receipt.plan.at>=use.expiresAt)
      errors.push('Additional oil fire needs its actual external event while the exact retained successful coating was potent.')
  }
  for(const[key,turn]of Object.entries(oil.damageTurns))if(key!==turn.turnKey||turn.at>at||turn.result.turnKey!==key||turn.patchIds.some(id=>!Object.hasOwn(oil.patches,id)))
    errors.push('Ground-oil turn damage needs its actual source patches and retained real turn.')
  return errors
}
export function oilFireCapacityIssue(state:GameState,kind:'creature'|'object',id:string){
 return activeOilCoating(state,kind,id)&&Object.keys(state.dmTools?.oil?.fireReceipts??{}).length>=512
  ?{code:'OIL_FIRE_RECEIPT_LIMIT',message:'Retained oil-fire receipts are full; preflight this possible source fire before any attack, saving throw, slot, resource or damage die.'}:null
}
/** Inspect already-defended BASE fire before adding oil. An immune/rounded-to-0
 * base event cannot ignite itself by adding five first. No mutation or dice. */
export function inspectOilFireDamage(state:GameState,input:{targetKind:'creature'|'object';targetId:string;eventId:string;
  components:readonly{type:string;rawAmount:number;damageAfterDefenses:number}[]}){
  const oil=state.dmTools?.oil,old=oil?.fireReceipts&&Object.hasOwn(oil.fireReceipts,input.eventId)?oil.fireReceipts[input.eventId]:undefined
  if(old){
    if(old.plan.targetId!==input.targetId||old.plan.targetKind!==input.targetKind)
      return{issue:{code:'OIL_FIRE_EVENT_CONFLICT',message:'This actual damage event already belongs to a different oiled target.'}}
    return{replay:old.packet}
  }
  const coating=activeOilCoating(state,input.targetKind,input.targetId)
  const baseFireDamage=input.components.filter(part=>part.type==='fire').reduce((sum,part)=>sum+part.damageAfterDefenses,0)
  if(!coating||baseFireDamage<=0)return{}
  if(!OilFirePlanSchema.shape.eventId.safeParse(input.eventId).success)return{issue:{code:'OIL_FIRE_EVENT_REQUIRED',message:'Retain a real unique damage event identity before adding burning oil.'}}
  if(Object.keys(oil!.fireReceipts).length>=512)return{issue:{code:'OIL_FIRE_RECEIPT_LIMIT',message:'Retained oil-fire damage receipts are full; resolve before any damage, die or resource commit.'}}
  return{plan:{eventId:input.eventId,targetKind:input.targetKind,targetId:input.targetId,useId:coating.useId,
    at:state.worldTimeSeconds??0,baseFireDamage,additionalFireDamage:5 as const}}
}
