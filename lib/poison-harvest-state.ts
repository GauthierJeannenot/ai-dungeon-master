import { z } from 'zod'
import type { GameState } from './types'
import { TradeItemSchema } from './merchant-state'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'
export const HarvestPoisonId=z.enum(['carrion_crawler_mucus','purple_worm_poison','serpent_venom','wyvern_poison'])
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id)),Value=z.record(z.string(),z.unknown()),Time=z.number().int().nonnegative()
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const Roll=z.object({notation:z.string(),rolls:z.array(z.number()),modifier:z.number(),total:z.number(),detail:z.string()}).strict()
export const ObservePoisonHarvestSchema=z.object({eventId:Id,sourceId:Id,templateId:HarvestPoisonId,physicalFactId:Id,availableDoses:z.number().int().nonnegative().max(1000),actualAccessibleOrganicMaterialConfirmed:z.literal(true),actualFiniteReserveConfirmed:z.literal(true),afterAttemptId:Id.optional()}).strict()
export const BeginPoisonHarvestSchema=z.object({eventId:Id,attemptId:Id,sourceId:Id,observationEventId:Id,containerItemId:Id,containerFactId:Id,actualEmptySuitableContainerConfirmed:z.literal(true),doseItemId:Id,doseCell:Cell,poisonersKitItemId:Id.optional()}).strict()
export const WorkPoisonHarvestSchema=z.object({eventId:Id,attemptId:Id,seconds:z.number().int().positive().max(360),actualWorkConfirmed:z.literal(true),restActivity:z.enum(['light','strenuous']),activitySource:z.string().trim().min(1).max(1000)}).strict()
export const ResolvePoisonHarvestSchema=z.object({attemptId:Id}).strict()
const Observation=z.object({input:ObservePoisonHarvestSchema,at:Time,physicalFact:Value,bodyWitness:z.string(),upperBound:z.number().int().nonnegative(),remaining:z.number().int().nonnegative().optional(),activeAttemptId:Id.optional(),lastAttemptId:Id.optional(),usedFactIds:z.array(Id).max(256)}).strict()
export const PoisonHarvestAttemptSchema=z.object({id:Id,input:BeginPoisonHarvestSchema,templateId:HarvestPoisonId,observation:ObservePoisonHarvestSchema,mapId:Id,roomId:Id,bodyWitness:z.string(),container:TradeItemSchema,containerFact:Value,startedAt:Time,duration:Roll,requiredSeconds:z.number().int().min(60).max(360),workedSeconds:Time,status:z.enum(['working','checking','exposing','resolved']),segments:z.array(z.object({eventId:Id,from:Time,to:Time,seconds:z.number().int().positive(),restActivity:z.enum(['light','strenuous']),source:z.string()}).strict()).max(360),checkContext:z.string().optional(),check:Value.optional(),exposureId:Id,completedAt:Time.optional(),result:Value.optional()}).strict()
export const PoisonHarvestStateSchema=z.object({version:z.literal(1),sources:z.record(z.string(),Observation),attempts:z.record(z.string(),PoisonHarvestAttemptSchema),receipts:z.record(z.string(),z.object({command:z.string(),at:Time,result:Value}).strict())}).strict()
export type PoisonHarvestAttempt=z.infer<typeof PoisonHarvestAttemptSchema>
export function validatePoisonHarvestState(state:GameState){
 const data=state.dmTools?.poisonHarvest;if(!data)return[]
 if(!PoisonHarvestStateSchema.safeParse(data).success)return['Invalid physical poison harvesting history.']
 const issues:string[]=[],at=state.worldTimeSeconds??0
 if(Object.keys(data.sources).length>128||Object.keys(data.attempts).length>512||Object.keys(data.receipts).length>2048)issues.push('Harvest history capacity exceeded.')
 for(const[id,s]of Object.entries(data.sources)){
  if(id!==s.input.sourceId||s.at>at||s.remaining!==undefined&&s.remaining>s.upperBound||s.upperBound>s.input.availableDoses||new Set(s.usedFactIds).size!==s.usedFactIds.length||!s.usedFactIds.includes(s.input.physicalFactId)||!data.receipts[s.input.eventId])issues.push('A reserve needs its actual observation, finite monotone availability and receipt.')
  const observationReceipt=data.receipts[s.input.eventId]
  if(observationReceipt?.command!==JSON.stringify({operation:'harvest-observe',input:s.input})||observationReceipt.at!==s.at)issues.push('Retain the original finite physical reserve observation receipt.')
  const own=Object.values(data.attempts).filter(a=>a.input.sourceId===id)
  const harvestedSince=own.filter(a=>a.observation.eventId===s.input.eventId&&a.status==='resolved'&&a.result?.success===true).length
  if(s.upperBound!==s.input.availableDoses-harvestedSince||s.remaining!==undefined&&s.remaining!==s.upperBound)issues.push('The finite reserve decreases by exactly one per actual successful extraction, never refills.')
  const unresolved=own.filter(a=>a.status!=='resolved')
  if(unresolved.length>1||unresolved.length===1&&s.activeAttemptId!==unresolved[0].id||s.activeAttemptId&&!unresolved.some(a=>a.id===s.activeAttemptId))issues.push('Exactly the actual unresolved attempt reserves this physical source.')
 }
 const outputs=new Set<string>()
 for(const[id,a]of Object.entries(data.attempts)){
  const receipt=data.receipts[a.input.eventId],s=data.sources[a.input.sourceId]
  if(id!==a.id||id!==a.input.attemptId||!s||a.startedAt>at||!receipt||receipt.command!==JSON.stringify({operation:'harvest-begin',input:a.input})||a.duration.notation!=='1d6'||a.duration.rolls.length!==1||!Number.isInteger(a.duration.rolls[0])||a.duration.rolls[0]<1||a.duration.rolls[0]>6||a.duration.modifier!==0||a.duration.total!==a.duration.rolls[0]||a.requiredSeconds!==a.duration.total*60)issues.push('An attempt needs its genuine retained1d6 and original start receipt.')
  if(receipt&&(groundGearPhysicalWitness(receipt.result.duration)!==groundGearPhysicalWitness(a.duration)||receipt.result.requiredSeconds!==a.requiredSeconds||receipt.at!==a.startedAt))issues.push('The original duration die and required minutes cannot be replaced at hydration.')
  let total=0,last=a.startedAt
  for(const segment of a.segments){const workReceipt=data.receipts[segment.eventId];if(workReceipt?.command!==JSON.stringify({operation:'harvest-work',input:{eventId:segment.eventId,attemptId:a.id,seconds:segment.seconds,actualWorkConfirmed:true,restActivity:segment.restActivity,activitySource:segment.source}}))issues.push('Each actual extraction segment needs its exact retained work command.');if(segment.from<last||segment.to>at||segment.to-segment.from!==segment.seconds||!data.receipts[segment.eventId])issues.push('Real extraction work must have dated, nonoverlapping paid-for intervals.');total+=segment.seconds;last=segment.to}
  if(total!==a.workedSeconds||total>a.requiredSeconds||a.status!=='working'&&total!==a.requiredSeconds)issues.push('Elapsed waiting or fabricated work cannot complete extraction.')
  if(outputs.has(a.input.doseItemId))issues.push('Distinct actual attempts need distinct future dose identities.');outputs.add(a.input.doseItemId)
  if(a.status==='checking'){
   const resolution=state.hero?.pending?.command.toolkitResolution as {domain?:string;command?:{attemptId?:string}}|undefined
   if(resolution?.domain!=='poison-harvest-check'||resolution.command?.attemptId!==id||!a.checkContext)issues.push('A held Nature check needs its original current pending reaction and context.')
  }
  if(a.status==='exposing'&&!state.dmTools?.playerPoisons?.deliveries[a.exposureId])issues.push('An extraction mishap requires its actual natural poison delivery.')
  if(a.status==='resolved'){
   if(!a.result||a.completedAt===undefined||a.completedAt>at||!a.check||a.result.attemptId!==id)issues.push('A resolved extraction needs the true original check and final result.')
   const success=a.result?.success===true
   if(success!==((a.check?.roll as {total?:number})?.total!>=20)||success&&a.result?.doseItemId!==a.input.doseItemId)issues.push('A dose exists only after the actual DC20 success.')
  }
  if(a.checkContext&&a.status==='checking'&&a.check)issues.push('An unresolved held check must not have an already committed result.')
 }
 // Compare retained command/result payloads canonically across JSONB persistence.
 for(const receipt of Object.values(data.receipts))if(receipt.at>at||typeof groundGearPhysicalWitness(receipt.result)!=='string')issues.push('Invalid harvesting receipt timestamp.')
 return issues
}
