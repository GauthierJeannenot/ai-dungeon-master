import { z } from 'zod'
import type { GameState } from './types'
import { TradeItemSchema } from './merchant-state'
import { PLAYER_POISONS,playerPoisonFromEquipment } from './srd/player-poisons'
import { SUPPLY_LABELS } from './srd/equipment'
import { AFFLICTIONS } from './srd/afflictions'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id)),Value=z.record(z.string(),z.unknown())
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
/** Only these targeted PHB table rows. No magic item or healing-potion rule is
 * silently replaced by ordinary crafting. Other DMG poisons require discretion. */
const PRICES:Record<string,number>={basic_poison_vial:10000,ball_bearings:100,caltrops:100,hunting_trap:500,acid_vial:2500,alchemists_fire_flask:5000,antitoxin:5000,oil_flask:10,lamp:50,hooded_lantern:500,bullseye_lantern:1000,healers_kit:500}
export function ordinaryCraftProfile(equipmentId:string){
 const poisonId=playerPoisonFromEquipment(equipmentId)
 if(poisonId)return{equipmentId,label:AFFLICTIONS[poisonId].label,priceCp:PLAYER_POISONS[poisonId].suggestedPriceCp,discretion:true,requiredToolId:'poisoners_kit'}
 const priceCp=PRICES[equipmentId];return priceCp===undefined?undefined:{equipmentId,label:SUPPLY_LABELS[equipmentId as keyof typeof SUPPLY_LABELS],priceCp,discretion:false,requiredToolId:equipmentId==='basic_poison_vial'?'poisoners_kit':equipmentId==='antitoxin'?'herbalism_kit':undefined}
}
export const StartOrdinaryCraftingSchema=z.object({eventId:Id,projectId:Id,equipmentId:Id,outputItemIds:z.array(Id).min(1).max(64),toolItemId:Id,toolRelationFactId:Id,actualRelatedToolConfirmed:z.literal(true),
 materials:z.array(z.object({itemId:Id,valueCp:z.number().int().positive().max(1000000000),physicalFactId:Id}).strict()).min(1).max(256),actualIngredientsConfirmed:z.literal(true),
 facilityObjectIds:z.array(Id).max(8).optional(),facilityFactId:Id.optional(),actualFacilitiesConfirmed:z.literal(true).optional(),
 otherPoisonPermissionFactId:Id.optional(),otherPoisonPermissionConfirmed:z.literal(true).optional(),actualMarketValueCp:z.number().int().positive().max(1000000000).optional(),
}).strict()
export const WorkOrdinaryCraftingSchema=z.object({eventId:Id,projectId:Id,seconds:z.number().int().positive().max(28800),restActivity:z.enum(['light','strenuous']),activitySource:z.string().trim().min(1).max(1000)}).strict()
export const CompleteOrdinaryCraftingDaySchema=z.object({eventId:Id,projectId:Id,materialUses:z.array(z.object({itemId:Id,valueCp:z.number().int().positive().max(1000000000)}).strict()).min(1).max(256),calendarDay:z.number().int().nonnegative().optional()}).strict()
export const CancelOrdinaryCraftingSchema=z.object({eventId:Id,projectId:Id,reason:z.string().trim().min(1).max(1000)}).strict()
export const OrdinaryCraftProjectSchema=z.object({id:Id,input:StartOrdinaryCraftingSchema,mapId:Id,roomId:Id,cell:Cell,surfaceZFeet:z.number().finite(),startedAt:z.number().nonnegative(),
 marketValueCp:z.number().int().positive(),progressCp:z.number().int().nonnegative(),workedSeconds:z.number().int().nonnegative(),uncreditedSeconds:z.number().int().min(0).max(28800),status:z.enum(['working','awaiting_completion','completed','cancelled']),
 toolId:Id,toolWitness:z.string(),materialItems:z.record(z.string(),TradeItemSchema),materialFacts:z.record(z.string(),Value),toolFact:Value,facilityWitness:z.string(),facilityFact:Value.optional(),permissionFact:Value.optional(),
 segments:z.array(z.object({eventId:Id,from:z.number().nonnegative(),to:z.number().nonnegative(),seconds:z.number().int().positive().max(28800),calendarDay:z.number().int().nonnegative(),activity:z.enum(['light','strenuous']),source:z.string().min(1).max(1000)}).strict()).max(2048),
 periods:z.array(z.object({eventId:Id,at:z.number().nonnegative(),calendarDay:z.number().int().nonnegative().optional(),progressCp:z.number().int().positive().max(500),materialUses:z.array(z.object({itemId:Id,valueCp:z.number().int().positive()}).strict()).min(1).max(256),materialsValueCp:z.number().int().positive()}).strict()).max(2048),
 completionEventId:Id.optional(),completedAt:z.number().nonnegative().optional(),result:Value.optional(),cancellationEventId:Id.optional(),cancellationReason:z.string().max(1000).optional(),
}).strict()
export const OrdinaryCraftingStateSchema=z.object({version:z.literal(1),projects:z.record(z.string(),OrdinaryCraftProjectSchema),materials:z.record(z.string(),z.object({itemId:Id,equipmentId:Id,initialValueCp:z.number().int().positive(),remainingValueCp:z.number().int().nonnegative(),registeredEventId:Id,originalItem:TradeItemSchema,physicalFact:Value,lastUseEventId:Id.optional()}).strict()),receipts:z.record(z.string(),z.object({command:z.string().max(80000),at:z.number().nonnegative(),result:Value}).strict())}).strict()
export type OrdinaryCraftProject=z.infer<typeof OrdinaryCraftProjectSchema>
export const craftingDay=(seconds:number)=>Math.floor(seconds/86400)
export const craftPeriodDay=(period:OrdinaryCraftProject['periods'][number])=>period.calendarDay??craftingDay(period.at)
export const projectWorkedInDay=(project:OrdinaryCraftProject,day:number)=>project.segments.filter(segment=>segment.calendarDay===day).reduce((total,segment)=>total+segment.seconds,0)
export function eligibleUncreditedCraftDays(project:OrdinaryCraftProject){return [...new Set(project.segments.map(s=>s.calendarDay))].filter(day=>projectWorkedInDay(project,day)>=28800&&!project.periods.some(period=>craftPeriodDay(period)===day)).sort((a,b)=>a-b)}
export function latestCraftDayUncreditedSeconds(project:OrdinaryCraftProject){const day=project.segments.at(-1)?.calendarDay;return day===undefined||project.periods.some(p=>craftPeriodDay(p)===day)?0:projectWorkedInDay(project,day)}
export function actualCraftingSecondsInDay(state:GameState,day:number){return Object.values(state.dmTools?.ordinaryCrafting?.projects??{}).flatMap(p=>p.segments).filter(s=>s.calendarDay===day).reduce((total,s)=>total+s.seconds,0)}
export function validateOrdinaryCraftingState(state:GameState){
 const data=state.dmTools?.ordinaryCrafting;if(!data)return[]
 if(!OrdinaryCraftingStateSchema.safeParse(data).success)return['Invalid ordinary2014 crafting project or actual work schema.']
 const issues:string[]=[],at=state.worldTimeSeconds??0,days=new Map<number,number>(),credits=new Map<number,number>(),used=new Map<string,number>(),outputs=new Set<string>(),intervals:Array<{from:number;to:number}>=[]
 if(Object.keys(data.projects).length>128||Object.keys(data.materials).length>512||Object.keys(data.receipts).length>4096)issues.push('Ordinary crafting retains bounded real projects/materials/receipts.')
 for(const[id,p]of Object.entries(data.projects)){
  const start=data.receipts[p.input.eventId],profile=ordinaryCraftProfile(p.input.equipmentId),expected=(profile?.discretion?p.input.actualMarketValueCp:profile?.priceCp)??0
  if(id!==p.id||id!==p.input.projectId||!profile||p.marketValueCp!==expected*p.input.outputItemIds.length||!start||start.command!==JSON.stringify({operation:'craft-start',input:p.input})||p.startedAt>at||p.progressCp>p.marketValueCp||p.input.materials.reduce((n,m)=>n+m.valueCp,0)*2!==p.marketValueCp)issues.push('A craft project needs its exact sourced nonmagic profile, real start and half-value actual materials.')
  if(p.workedSeconds!==p.segments.reduce((n,s)=>n+s.seconds,0)||p.uncreditedSeconds!==latestCraftDayUncreditedSeconds(p)||p.progressCp!==p.periods.reduce((n,d)=>n+d.progressCp,0))issues.push('Retain every real work segment; only8hours within one actual day can yield craft progress. Partial days never combine across midnight.')
  p.segments.forEach((s,i)=>{intervals.push(s);days.set(s.calendarDay,(days.get(s.calendarDay)??0)+s.seconds);if(s.from<p.startedAt||s.to>at||s.to-s.from!==s.seconds||craftingDay(s.from)!==s.calendarDay||s.to>(s.calendarDay+1)*86400||i>0&&s.from<p.segments[i-1].to||data.receipts[s.eventId]?.result.projectId!==id)issues.push('Craft work needs one real timed event at its actual calendar boundary.')})
  const creditedProjectDays=new Set<number>()
  p.periods.forEach(d=>{const day=craftPeriodDay(d);credits.set(day,(credits.get(day)??0)+d.progressCp);let validCommand=false;try{const saved=JSON.parse(data.receipts[d.eventId]?.command??'null'),parsed=CompleteOrdinaryCraftingDaySchema.safeParse(saved?.input);validCommand=saved?.operation==='craft-complete-day'&&parsed.success&&parsed.data.eventId===d.eventId&&parsed.data.projectId===id&&(parsed.data.calendarDay??craftingDay(d.at))===day&&groundGearPhysicalWitness(parsed.data.materialUses)===groundGearPhysicalWitness(d.materialUses)}catch{}
   if(creditedProjectDays.has(day)||d.at>at||p.segments.filter(s=>s.calendarDay===day&&s.to<=d.at).reduce((n,s)=>n+s.seconds,0)<28800||!validCommand||d.materialsValueCp*2!==d.progressCp||d.materialUses.reduce((sum,m)=>sum+m.valueCp,0)!==d.materialsValueCp||new Set(d.materialUses.map(m=>m.itemId)).size!==d.materialUses.length||d.materialUses.some(m=>!p.input.materials.some(source=>source.itemId===m.itemId)))issues.push('Each distinct credited actual day needs8hours worked IN THAT DAY, explicit real materials and its original receipt.');creditedProjectDays.add(day);for(const m of d.materialUses)used.set(m.itemId,(used.get(m.itemId)??0)+m.valueCp)})
  if(p.status==='completed'){const receipt=p.completionEventId?data.receipts[p.completionEventId]:undefined;if(p.progressCp!==p.marketValueCp||p.completedAt===undefined||p.completedAt>at||!receipt||!p.result||groundGearPhysicalWitness(p.result)!==groundGearPhysicalWitness(receipt.result))issues.push('A finished item needs the real final work/material completion receipt.');for(const itemId of p.input.outputItemIds){if(outputs.has(itemId))issues.push('One crafted output identity cannot be produced twice.');outputs.add(itemId)}}
  else if(p.completedAt!==undefined||p.result!==undefined||p.completionEventId!==undefined)issues.push('An unfinished craft cannot contain produced items.')
  if(p.status==='cancelled'&&(!p.cancellationEventId||!p.cancellationReason||!data.receipts[p.cancellationEventId]))issues.push('Cancellation must preserve its real bookkeeping receipt.')
 }
 for(const[id,m]of Object.entries(data.materials)){const consumed=used.get(id)??0;if(id!==m.itemId||m.originalItem.id!==id||!data.receipts[m.registeredEventId]||m.remainingValueCp!==m.initialValueCp-consumed||m.remainingValueCp<0||m.remainingValueCp===0&&(state.player.inventory.some(i=>i.id===id)||state.droppedItems?.[id])||consumed>0&&(!m.lastUseEventId||!data.receipts[m.lastUseEventId]))issues.push('Actual ingredient value must equal its original physical batch minus real chosen consumption receipts; mass is never prorated.')}
 intervals.sort((a,b)=>a.from-b.from);for(let i=1;i<intervals.length;i++)if(intervals[i].from<intervals[i-1].to)issues.push('The same player cannot perform overlapping ordinary crafting work in different projects.')
 for(const seconds of days.values())if(seconds>28800)issues.push('The same player cannot credit more than8hours ordinary craft work in one real calendar day across projects.')
 for(const value of credits.values())if(value>500)issues.push('The same player cannot credit more than5gp ordinary production in one actual calendar day across projects.')
 return issues
}
