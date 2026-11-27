import { z } from 'zod'
import type { GameState } from './types'
import { GroundGearRecoverySchema,groundGearPhysicalWitness } from './ground-gear-recovery-state'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Seconds=z.number().int().positive().max(86400),Fact=z.record(z.string(),z.unknown())
export const GroundGearTransferStartSchema=z.object({eventId:Id,transferId:Id,sourceStockItemId:Id,destinationContainerItemId:Id,destinationStockItemId:Id.optional(),
 units:z.number().int().positive().max(1000000),containerFactId:Id,actualContainerConfirmed:z.literal(true),availableCapacityUnits:z.number().int().positive().max(1000000),capacityForCurrentContentsConfirmed:z.literal(true),
 requiredSeconds:Seconds,workSeconds:Seconds,restActivity:z.enum(['light','strenuous']),activitySource:z.string().trim().min(1).max(1000),
 measuredSourceRemainingWeightLb:z.number().finite().positive().optional(),sourceWeightFactId:Id.optional(),
 measuredDestinationWeightLb:z.number().finite().positive().optional(),destinationWeightFactId:Id.optional(),
}).strict()
export const GroundGearTransferWorkSchema=z.object({eventId:Id,transferId:Id,workSeconds:Seconds,restActivity:z.enum(['light','strenuous']),activitySource:z.string().trim().min(1).max(1000)}).strict()
export const GroundGearTransferFinishSchema=z.object({eventId:Id,transferId:Id}).strict()
export const GroundGearTransferCancelSchema=z.object({eventId:Id,transferId:Id,reason:z.string().trim().min(1).max(1000)}).strict()
export const GroundGearTransferSchema=z.object({id:Id,sequence:z.number().int().positive(),input:GroundGearTransferStartSchema,mapId:Id,roomId:Id,cell:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict(),
 startedAt:z.number().nonnegative(),lastWorkedAt:z.number().nonnegative(),requiredSeconds:Seconds,workedSeconds:z.number().int().nonnegative(),
 status:z.enum(['working','awaiting_time','ready','completed','cancelled']),sourceWitness:z.string(),destinationWitness:z.string(),destinationStockItemId:Id,
 facts:z.object({container:Fact,sourceWeight:Fact.optional(),destinationWeight:Fact.optional()}).strict(),segments:GroundGearRecoverySchema.shape.segments,
 completedAt:z.number().nonnegative().optional(),completionEventId:Id.optional(),result:Fact.optional(),cancelledAt:z.number().nonnegative().optional(),cancellationEventId:Id.optional(),cancellationReason:z.string().min(1).max(1000).optional(),
}).strict()
export type GroundGearTransfer=z.infer<typeof GroundGearTransferSchema>
export type GroundGearTransferStart=z.infer<typeof GroundGearTransferStartSchema>
/** Transfer events preserve units and the real two-container history. They do
 * not create a native bag, mass measurement, past work or inferred merge. */
export function validateGroundGearTransfers(state:GameState){
 const data=state.dmTools?.groundGear,issues:string[]=[];if(!data?.transfers)return issues
 const at=state.worldTimeSeconds??0,jobs=Object.values(data.transfers)
 if(jobs.length>128||new Set(jobs.map(j=>j.sequence)).size!==jobs.length||jobs.some(j=>j.sequence>jobs.length))issues.push('Real transfers need bounded unique monotone creation sequences.')
 for(const[id,job]of Object.entries(data.transfers)){
  const start=data.receipts[job.input.eventId]
  if(id!==job.id||job.input.transferId!==id||!start||start.command!==JSON.stringify({operation:'stock-transfer-start',input:job.input})||start.result.transferId!==id||job.requiredSeconds!==job.input.requiredSeconds)issues.push('A transfer needs its actual immutable start and chosen stocks/containers.')
  if(job.startedAt>job.lastWorkedAt||job.lastWorkedAt>at||job.workedSeconds>job.requiredSeconds||job.workedSeconds!==job.segments.reduce((n,s)=>n+s.seconds,0)||!job.segments.length||job.segments[0].from!==job.startedAt||job.segments.at(-1)?.to!==job.lastWorkedAt||new Set(job.segments.map(s=>s.eventId)).size!==job.segments.length)issues.push('Transfer work must equal its original monotone performed segments.')
  job.segments.forEach((s,i)=>{if(s.from>s.to||s.to>at||i>0&&s.from<job.segments[i-1].to||!data.receipts[s.eventId]||data.receipts[s.eventId].result.transferId!==id||s.phase==='exploration'&&(s.to-s.from!==s.seconds||s.turnKey!==undefined)||s.phase==='combat'&&(s.from!==s.to||s.seconds>6||!s.turnKey))issues.push('Transfer segments need actual action/time receipts without combat clock fabrication.')})
  if(['ready','awaiting_time','completed'].includes(job.status)&&job.workedSeconds!==job.requiredSeconds)issues.push('Transfer completion requires all real work.')
  if(job.status==='completed'){
   const receipt=job.completionEventId?data.receipts[job.completionEventId]:undefined,result=job.result
   if(job.completedAt===undefined||job.completedAt>at||job.completedAt-job.startedAt<job.requiredSeconds||!receipt||receipt.command!==JSON.stringify({operation:'stock-transfer-finish',input:{eventId:job.completionEventId,transferId:id}})||!result||groundGearPhysicalWitness(result)!==groundGearPhysicalWitness(receipt.result)||result.unitsTransferred!==job.input.units||Number(result.sourceUnitsBefore)-Number(result.sourceUnitsAfter)!==job.input.units||Number(result.destinationUnitsAfter)-Number(result.destinationUnitsBefore)!==job.input.units)issues.push('Completed transfers must retain one real finish receipt, elapsed duration and conserved units.')
  }else if(job.completedAt!==undefined||job.completionEventId!==undefined||job.result!==undefined)issues.push('Unfinished transfers cannot carry transferred contents.')
  if(job.status==='cancelled'&&(job.cancelledAt===undefined||job.cancelledAt>at||!job.cancellationEventId||!data.receipts[job.cancellationEventId]||!job.cancellationReason))issues.push('Transfer cancellation needs its real bookkeeping receipt.')
 }
 return issues
}
