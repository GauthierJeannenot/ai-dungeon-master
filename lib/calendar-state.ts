import { z } from 'zod'
import type { GameState } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
const Id=z.string().min(1).max(100).refine(s=>!['constructor','prototype','__proto__'].includes(s)),Text=z.string().trim().min(1).max(1000),Year=z.number().int().min(1).max(1000000),Time=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const CalendarDateSchema=z.object({year:Year,segmentId:Id,day:z.number().int().min(1).max(1000),secondOfDay:z.number().int().min(0).max(86399)}).strict()
const Segment=z.object({segmentId:Id,name:z.string().trim().min(1).max(120),days:z.number().int().min(1).max(1000)}).strict()
const Definition=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('custom_fixed'),name:z.string().trim().min(1).max(120),segments:z.array(Segment).min(1).max(32)}).strict(),
 z.object({kind:z.literal('harptos'),shieldmeetYear:Year}).strict(),
])
export const ConfigureCampaignCalendarSchema=z.object({eventId:Id,decisionFactId:Id,actualCalendarAndAnchorConfirmed:z.literal(true),day86400SecondsExplicitlyAdopted:z.literal(true),definition:Definition,anchor:CalendarDateSchema}).strict()
export const RecordCalendarReferenceSchema=z.object({eventId:Id,referenceId:Id,factId:Id,actualReferenceConfirmed:z.literal(true),category:z.enum(['physical_cycle','religious_observance','civic_observance','fantastic_event']),name:z.string().trim().min(1).max(120),description:Text,anchor:CalendarDateSchema,periodDays:z.number().int().min(1).max(1000000).optional()}).strict()
const Value=z.record(z.string(),z.unknown()),Source=z.object({book:z.literal('dmg-2014'),sectionId:z.string(),sha256:z.string(),startLine:z.number().int(),endLine:z.number().int()}).strict()
const Configuration=z.object({input:ConfigureCampaignCalendarSchema,decisionFact:Value,source:Source,at:Time,command:z.string().max(50000)}).strict()
const Reference=z.object({input:RecordCalendarReferenceSchema,fact:Value,at:Time,configurationCommand:z.string().max(50000),command:z.string().max(100000)}).strict()
export const CalendarStateSchema=z.object({version:z.literal(1),configuration:Configuration,references:z.record(z.string(),Reference)}).strict()
export type CalendarState=z.infer<typeof CalendarStateSchema>
export type CalendarDefinition=z.infer<typeof Definition>
export type CalendarDate=z.infer<typeof CalendarDateSchema>
export const calendarConfigurationCommand=(r:z.infer<typeof Configuration>)=>witness({operation:'configure_campaign_calendar',input:r.input,decisionFact:r.decisionFact,source:r.source,at:r.at})
export const calendarReferenceCommand=(r:z.infer<typeof Reference>)=>witness({operation:'record_calendar_reference',input:r.input,fact:r.fact,at:r.at,configurationCommand:r.configurationCommand})
const harptos: Array<[string,string,number]>=[['hammer','Hammer',30],['midwinter','Midwinter',1],['alturiak','Alturiak',30],['ches','Ches',30],['tarsakh','Tarsakh',30],['greengrass','Greengrass',1],['mirtul','Mirtul',30],['kythorn','Kythorn',30],['flamerule','Flamerule',30],['midsummer','Midsummer',1],['eleasias','Eleasias',30],['eleint','Eleint',30],['highharvesttide','Highharvesttide',1],['marpenoth','Marpenoth',30],['uktar','Uktar',30],['feast_of_the_moon','The Feast of the Moon',1],['nightal','Nightal',30]]
export function calendarSegments(definition:CalendarDefinition,year:number){
 if(definition.kind==='custom_fixed')return definition.segments
 const segments=harptos.map(([segmentId,name,days])=>({segmentId,name,days}))
 if((year-definition.shieldmeetYear)%4===0)segments.splice(10,0,{segmentId:'shieldmeet',name:'Shieldmeet',days:1})
 return segments
}
function daysBeforeYear(definition:CalendarDefinition,year:number){
 if(definition.kind==='custom_fixed')return(year-1)*definition.segments.reduce((n,s)=>n+s.days,0)
 return(year-1)*365+Math.floor((year-1-definition.shieldmeetYear)/4)-Math.floor(-definition.shieldmeetYear/4)
}
export function calendarDateSeconds(definition:CalendarDefinition,date:CalendarDate):number|undefined{
 const segments=calendarSegments(definition,date.year),index=segments.findIndex(s=>s.segmentId===date.segmentId)
 if(index<0||date.day>segments[index].days)return undefined
 return(daysBeforeYear(definition,date.year)+segments.slice(0,index).reduce((n,s)=>n+s.days,0)+date.day-1)*86400+date.secondOfDay
}
export function calendarDateFromSeconds(definition:CalendarDefinition,seconds:number){
 if(!Number.isSafeInteger(seconds)||seconds<0||seconds>=daysBeforeYear(definition,1000001)*86400)return undefined
 const absoluteDay=Math.floor(seconds/86400);let low=1,high=1000001
 while(low+1<high){const mid=Math.floor((low+high)/2);if(daysBeforeYear(definition,mid)<=absoluteDay)low=mid;else high=mid}
 let day=absoluteDay-daysBeforeYear(definition,low)
 for(const segment of calendarSegments(definition,low)){if(day<segment.days)return{year:low,segmentId:segment.segmentId,segmentName:segment.name,day:day+1,secondOfDay:seconds%86400,...(definition.kind==='harptos'&&segment.days===30?{tenday:Math.floor(day/10)+1,dayOfTenday:day%10+1}:{})};day-=segment.days}
 return undefined
}
export function calendarProjection(state:GameState){
 const data=state.dmTools?.calendar;if(!data)return{configured:false as const}
 const c=data.configuration,elapsed=(state.worldTimeSeconds??0)-c.at,anchor=calendarDateSeconds(c.input.definition,c.input.anchor)!
 const seconds=anchor+elapsed,date=calendarDateFromSeconds(c.input.definition,seconds)
 return{configured:true as const,definition:c.input.definition,anchor:c.input.anchor,anchorWorldTimeSeconds:c.at,worldTimeSeconds:state.worldTimeSeconds??0,elapsedSeconds:elapsed,date:date??null,dateWithinSupportedRange:Boolean(date),references:Object.values(data.references).map(r=>{
  const at=calendarDateSeconds(c.input.definition,r.input.anchor)!,period=r.input.periodDays===undefined?undefined:r.input.periodDays*86400
  const next=period===undefined?(at>=seconds?at:undefined):at+Math.max(0,Math.ceil((seconds-at)/period))*period
  return{...r.input,atReferenceInstant:period===undefined?seconds===at:seconds>=at&&(seconds-at)%period===0,nextDate:next===undefined?null:calendarDateFromSeconds(c.input.definition,next)??null,nextInSeconds:next===undefined?null:next-seconds,consequencesApplied:false}
 })}
}
export function validateCalendarState(state:GameState){
 const data=state.dmTools?.calendar;if(!data)return[]
 if(!CalendarStateSchema.safeParse(data).success)return['Invalid explicit campaign calendar schema.']
 const c=data.configuration,definition=c.input.definition,clock=state.worldTimeSeconds??0,issues:string[]=[],eventIds=new Set([c.input.eventId]),factIds=new Set<string>()
 if(!Number.isSafeInteger(clock)||clock<c.at||c.command!==calendarConfigurationCommand(c)||c.decisionFact.id!==c.input.decisionFactId||calendarDateSeconds(definition,c.input.anchor)===undefined)issues.push('The exact original calendar command, actual decision, explicit date and real engine clock anchor must survive from the first configuration; never rebase time.')
 if(definition.kind==='custom_fixed'&&new Set(definition.segments.map(s=>s.segmentId)).size!==definition.segments.length)issues.push('Custom calendar segment IDs must be unique.')
 if(Object.keys(data.references).length>128)issues.push('Calendar reference capacity exceeded; no history is evicted.')
 for(const[id,r]of Object.entries(data.references)){
  if(id!==r.input.referenceId||eventIds.has(r.input.eventId)||factIds.has(r.input.factId)||r.at<c.at||r.at>clock||r.fact.id!==r.input.factId||r.configurationCommand!==c.command||r.command!==calendarReferenceCommand(r)||calendarDateSeconds(definition,r.input.anchor)===undefined)issues.push('Each actual calendar reference retains its original structured date, period, fact and command; no new nonce duplicates or rewrites it.')
  eventIds.add(r.input.eventId);factIds.add(r.input.factId)
 }
 return issues
}
