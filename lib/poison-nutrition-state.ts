import { z } from 'zod'
import type { GameState } from './types'
const Id=z.string().min(1).max(180).refine(value=>!['constructor','prototype','__proto__'].includes(value))
const Value=z.record(z.string(),z.unknown()),Units=z.number().int().nonnegative().max(100000000)
export const PoisonNutritionStateSchema=z.object({version:z.literal(1),
 resources:z.record(z.string(),z.object({preparationId:Id,itemId:Id,kind:z.enum(['food','water']),initialUnits:Units,units:Units,updatedAt:z.number().nonnegative()}).strict()),
 adjudications:z.record(z.string(),z.object({command:z.string().max(20000),preparationId:Id,sourceItemId:Id,kind:z.enum(['food','water']),totalUnits:Units,selectedUnits:Units,
  operation:z.enum(['consume','transfer']),operationEventId:Id,targetItemId:Id.optional(),disposition:z.enum(['selected_portion','remainder']),
  physicalFact:Value,source:z.string().min(1).max(1000),recordedAt:z.number().nonnegative(),usedBy:Id.optional()}).strict()),
}).strict()
export type PoisonNutritionState=z.infer<typeof PoisonNutritionStateSchema>
export const poisonNutritionStateOf=(state:Pick<GameState,'dmTools'>)=>(state.dmTools as{poisonNutrition?:PoisonNutritionState}|undefined)?.poisonNutrition
export function actualNutritionResource(state:GameState,itemId:string){
 const item=state.player.inventory.find(item=>item.id===itemId)??state.droppedItems?.[itemId]?.item
 if(!item||item.quantity!==undefined&&item.quantity!==1)return undefined
 const food=state.dmTools?.foraging?.foods[itemId],container=state.dmTools?.foraging?.containers[itemId],provision=state.dmTools?.survival?.provisions[itemId],equipment=item.equipmentId??item.id
 if(food)return{itemId,kind:'food' as const,units:food.remainingHalfPounds}
 if(container)return{itemId,kind:'water' as const,units:container.contentsQuarterPints}
 if(provision)return{itemId,kind:provision.kind==='ration_1_day'?'food' as const:'water' as const,units:provision.remainingUnits*(provision.kind==='ration_1_day'?1:4)}
 if(equipment==='ration_1_day')return{itemId,kind:'food' as const,units:4}
 if(equipment==='waterskin_full'||equipment==='waterskin_empty')return{itemId,kind:'water' as const,units:equipment==='waterskin_full'?16:0}
 return undefined
}
export function validatePoisonNutrition(state:GameState){
 const data=poisonNutritionStateOf(state);if(!data)return[]
 if(!PoisonNutritionStateSchema.safeParse(data).success)return['Invalid actual nutrition poison/whole-dose adjudication schema.']
 const issues:string[]=[]
 if(Object.keys(data.resources).length>256||Object.keys(data.adjudications).length>1024)issues.push('Retained poison resource/adjudication history capacity exceeded; actual doses are never evicted.')
 for(const[id,record]of Object.entries(data.resources)){
  const prep=state.dmTools?.playerPoisons?.preparations[id]
  if(id!==record.preparationId||!prep||prep.delivery!=='ingested'||record.updatedAt>(state.worldTimeSeconds??0))issues.push('A poisoned provision keeps its actual whole ingested dose and elapsed operation.')
  if(prep?.status==='active'){
   const actual=actualNutritionResource(state,record.itemId)
   if(!actual||actual.kind!==record.kind||actual.units!==record.units||record.units<=0||(prep.currentSurface?.id??prep.targetId)!==record.itemId)issues.push('One still-potent dose remains attached to its exact existing food/water quantity and current physical container, never a duplicate or free volume.')
  }
 }
 for(const record of Object.values(data.adjudications)){
  if(!data.resources[record.preparationId]||record.selectedUnits<=0||record.selectedUnits>record.totalUnits||record.recordedAt>(state.worldTimeSeconds??0)||record.usedBy&&record.usedBy!==record.operationEventId)issues.push('A whole-dose portion ruling retains its actual resource, quantity and exact single operation.')
  if(record.usedBy&&!state.dmTools?.survival?.receipts[record.usedBy]&&!state.dmTools?.waterSources?.receipts[record.usedBy])issues.push('A used poison-portion ruling requires the actual committed nutrition/water operation receipt.')
 }
 return issues
}
