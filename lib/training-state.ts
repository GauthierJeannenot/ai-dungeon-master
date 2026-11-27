import { z } from 'zod'
import type { GameState } from './types'
import { CoinsSchema,emptyCoins,copperValue } from './srd/currency'
import { TOOL_IDS } from './srd/equipment'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id)),Value=z.record(z.string(),z.unknown())
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
export const STANDARD_TRAINING_LANGUAGES=['common','dwarvish','elvish','giant','gnomish','goblin','halfling','orc'] as const
export const PERMISSION_TRAINING_LANGUAGES=['abyssal','celestial','draconic','deep-speech','infernal','primordial','sylvan','undercommon','thieves-cant','druidic'] as const
export function trainingSubjectSupported(kind:'tool'|'language',subjectId:string){return(kind==='tool'?TOOL_IDS:[...STANDARD_TRAINING_LANGUAGES,...PERMISSION_TRAINING_LANGUAGES] as readonly string[]).some(id=>id===subjectId)}
export const StartTrainingSchema=z.object({eventId:Id,courseId:Id,instructorId:Id,kind:z.enum(['tool','language']),subjectId:Id,teachingFactId:Id,
 actualQualifiedInstructorConfirmed:z.literal(true),actualWillingInstructorConfirmed:z.literal(true),practiceToolItemId:Id.optional(),actualPracticeToolAvailableConfirmed:z.literal(true).optional(),
 languagePermissionFactId:Id.optional(),actualLanguagePermissionConfirmed:z.literal(true).optional(),
}).strict()
export const WorkTrainingSchema=z.object({eventId:Id,courseId:Id,seconds:z.number().int().positive().max(28800),paid:CoinsSchema.optional(),practiceToolItemId:Id.optional(),actualLessonConfirmed:z.literal(true),restActivity:z.enum(['light','strenuous']),activitySource:z.string().trim().min(1).max(1000)}).strict()
export const CancelTrainingSchema=z.object({eventId:Id,courseId:Id,reason:z.string().trim().min(1).max(1000)}).strict()
export const TrainingCourseSchema=z.object({id:Id,input:StartTrainingSchema,startedAt:z.number().nonnegative(),requiredDays:z.literal(250),secondsPerDay:z.literal(28800),feePerDayCp:z.literal(100),
 status:z.enum(['learning','completed','cancelled']),instructorWitness:z.string(),teachingFact:Value,permissionFact:Value.optional(),workedSeconds:z.number().int().nonnegative(),qualifiedDays:z.array(z.number().int().nonnegative()).max(250),currentPracticeToolItemId:Id.optional(),lifecycle:z.array(z.object({eventId:Id,kind:z.enum(['cancel','resume'])}).strict()).max(128),
 segments:z.array(z.object({eventId:Id,from:z.number().nonnegative(),to:z.number().nonnegative(),seconds:z.number().int().positive().max(28800),calendarDay:z.number().int().nonnegative(),instructorId:Id,mapId:Id,roomId:Id,learnerCell:Cell,instructorCell:Cell,practiceToolItemId:Id.optional(),restActivity:z.enum(['light','strenuous']),source:z.string().min(1).max(1000)}).strict()).max(4096),
 payments:z.record(z.string(),z.object({eventId:Id,at:z.number().nonnegative(),paid:CoinsSchema}).strict()),
 completedAt:z.number().nonnegative().optional(),completionEventId:Id.optional(),result:Value.optional(),cancellationEventId:Id.optional(),cancellationReason:z.string().max(1000).optional(),
}).strict()
export const TrainingStateSchema=z.object({version:z.literal(1),courses:z.record(z.string(),TrainingCourseSchema),instructorFees:z.record(z.string(),CoinsSchema),receipts:z.record(z.string(),z.object({command:z.string().max(24000),at:z.number().nonnegative(),result:Value}).strict())}).strict()
export type TrainingCourse=z.infer<typeof TrainingCourseSchema>
export const trainingDay=(seconds:number)=>Math.floor(seconds/86400)
export const trainingWorkInDay=(course:TrainingCourse,day:number)=>course.segments.filter(s=>s.calendarDay===day).reduce((sum,s)=>sum+s.seconds,0)
export function trainingKnowledgePresent(state:GameState,kind:'tool'|'language',subjectId:string){return(kind==='tool'?state.player.toolProficiencies:state.player.languages)?.includes(subjectId)??false}
export function validateTrainingState(state:GameState){
 const data=state.dmTools?.training;if(!data)return[]
 if(!TrainingStateSchema.safeParse(data).success)return['Invalid actual standard2014 instruction/course/payment schema.']
 const issues:string[]=[],at=state.worldTimeSeconds??0,fees:Record<string,ReturnType<typeof emptyCoins>>={},intervals:Array<{from:number;to:number}>=Object.values(state.dmTools?.ordinaryCrafting?.projects??{}).flatMap(p=>p.segments)
 if(Object.keys(data.courses).length>64||Object.keys(data.receipts).length>8192)issues.push('Actual instruction history exceeds retained bounded courses/receipts.')
 for(const[id,c]of Object.entries(data.courses)){
  const start=data.receipts[c.input.eventId]
  if(id!==c.id||id!==c.input.courseId||!trainingSubjectSupported(c.input.kind,c.input.subjectId)||c.startedAt>at||!start||start.command!==JSON.stringify({operation:'training-start',input:c.input}))issues.push('A course needs its actual instructor, canonical subject and original start receipt.')
  if(c.workedSeconds!==c.segments.reduce((sum,s)=>sum+s.seconds,0)||new Set(c.qualifiedDays).size!==c.qualifiedDays.length)issues.push('Retain exact actual work and distinct qualified days; partial days never combine.')
  const days=[...new Set(c.segments.map(s=>s.calendarDay))],qualified=days.filter(day=>trainingWorkInDay(c,day)>=28800).sort((a,b)=>a-b)
  if(groundGearPhysicalWitness(qualified)!==groundGearPhysicalWitness(c.qualifiedDays)||days.some(day=>trainingWorkInDay(c,day)>28800))issues.push('Every counted training day needs8hours IN THAT SAME DAY, once only.')
  c.segments.forEach((s,i)=>{intervals.push(s);let validCommand=false;try{const saved=JSON.parse(data.receipts[s.eventId]?.command??'null'),parsed=WorkTrainingSchema.safeParse(saved?.input);validCommand=saved?.operation==='training-work'&&parsed.success&&parsed.data.courseId===id&&parsed.data.eventId===s.eventId&&parsed.data.seconds===s.seconds&&parsed.data.restActivity===s.restActivity&&parsed.data.activitySource===s.source}catch{}
   if(!validCommand||s.from<c.startedAt||s.to>at||s.to-s.from!==s.seconds||trainingDay(s.from)!==s.calendarDay||s.to>(s.calendarDay+1)*86400||s.instructorId!==c.input.instructorId||i>0&&s.from<c.segments[i-1].to||!c.payments[String(s.calendarDay)])issues.push('A lesson needs its real timed segment, same actual instructor and paid actual calendar day.')})
  if(Object.keys(c.payments).length!==days.length)issues.push('Payment exists once for each actual taught day, never for a fabricated/future teaching day.')
  for(const[key,payment]of Object.entries(c.payments)){
   const day=Number(key),segments=c.segments.filter(s=>s.calendarDay===day),first=segments[0]
   let validPayment=false;try{const saved=JSON.parse(data.receipts[payment.eventId]?.command??'null'),parsed=WorkTrainingSchema.safeParse(saved?.input);validPayment=saved?.operation==='training-work'&&parsed.success&&parsed.data.courseId===id&&parsed.data.paid!==undefined&&groundGearPhysicalWitness(parsed.data.paid)===groundGearPhysicalWitness(payment.paid)}catch{}
   if(!Number.isSafeInteger(day)||String(day)!==key||!first||first.eventId!==payment.eventId||payment.at!==first.from||copperValue(payment.paid)!==100||!validPayment)issues.push('Each real teaching day costs exactly1gp in explicitly paid existing denominations before its first actual segment.')
   const money=fees[c.input.instructorId]??=emptyCoins();for(const denomination of Object.keys(money) as Array<keyof typeof money>)money[denomination]+=payment.paid[denomination]
  }
  if(c.status==='completed'){const receipt=c.completionEventId?data.receipts[c.completionEventId]:undefined;if(c.qualifiedDays.length!==250||c.completedAt===undefined||c.completedAt>at||!receipt||!c.result||groundGearPhysicalWitness(c.result)!==groundGearPhysicalWitness(receipt.result)||c.result.learned!==true||!trainingKnowledgePresent(state,c.input.kind,c.input.subjectId))issues.push('A learned subject requires250actual qualified paid days and its one genuine final knowledge receipt.')}
  else if(c.qualifiedDays.length>=250||c.completedAt!==undefined||c.completionEventId!==undefined||c.result!==undefined)issues.push('An incomplete/cancelled course cannot claim completed knowledge.')
  if(c.status==='cancelled'&&(!c.cancellationEventId||!c.cancellationReason||!data.receipts[c.cancellationEventId]))issues.push('Cancelled instruction retains its real bookkeeping event, work and payments.')
  let next:'cancel'|'resume'='cancel'
  for(const event of c.lifecycle){let valid=false;try{const saved=JSON.parse(data.receipts[event.eventId]?.command??'null');if(event.kind==='cancel'){const parsed=CancelTrainingSchema.safeParse(saved?.input);valid=saved?.operation==='training-cancel'&&parsed.success&&parsed.data.eventId===event.eventId&&parsed.data.courseId===id}else{const parsed=StartTrainingSchema.safeParse(saved?.input);valid=saved?.operation==='training-start'&&parsed.success&&parsed.data.eventId===event.eventId&&parsed.data.courseId===id&&parsed.data.kind===c.input.kind&&parsed.data.subjectId===c.input.subjectId&&parsed.data.instructorId===c.input.instructorId&&data.receipts[event.eventId]?.result.resumed===true}}catch{}if(event.kind!==next||!valid)issues.push('Pause/resume preserves the same real course, teacher, dates and fees through ordered explicit receipts.');next=event.kind==='cancel'?'resume':'cancel'}
  if(c.status==='cancelled'&&c.lifecycle.at(-1)?.kind!=='cancel'||c.status!=='cancelled'&&c.lifecycle.at(-1)?.kind==='cancel')issues.push('Current training status must match its last explicit pause/resume event; no actual days are reset.')
 }
 intervals.sort((a,b)=>a.from-b.from);for(let i=1;i<intervals.length;i++)if(intervals[i].from<intervals[i-1].to)issues.push('The same player cannot attend two overlapping actual lessons.')
 if(groundGearPhysicalWitness(fees)!==groundGearPhysicalWitness(data.instructorFees))issues.push('Instructor earnings must equal real lesson payments, never an invented initial purse.')
 return issues
}
