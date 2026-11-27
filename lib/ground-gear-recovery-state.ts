import { z } from 'zod'
import type { GameState } from './types'
import { AFFLICTIONS } from './srd/afflictions'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const Seconds=z.number().int().positive().max(86400)
const Fact=z.record(z.string(),z.unknown())
export const GroundGearRecoveryStartSchema=z.object({
 eventId:Id,recoveryId:Id,placementId:Id,units:z.number().int().positive().max(1000),containerItemId:Id.optional(),
 containerFactId:Id.optional(),actualContainerConfirmed:z.literal(true).optional(),availableCapacityUnits:z.number().int().positive().max(1000000).optional(),
 capacityForCurrentContentsConfirmed:z.literal(true).optional(),requiredSeconds:Seconds,workSeconds:Seconds,
 remainingCells:z.array(Cell).max(4).optional(),remainingCoverageFactId:Id.optional(),remainingCoverageConfirmed:z.literal(true).optional(),
 measuredStockWeightLb:z.number().finite().positive().optional(),stockWeightFactId:Id.optional(),
 measuredContainerDryWeightLb:z.number().finite().positive().optional(),containerWeightFactId:Id.optional(),
 safeHandlingFactId:Id.optional(),actualSafeHandlingConfirmed:z.literal(true).optional(),
 restActivity:z.enum(['light','strenuous']),activitySource:z.string().trim().min(1).max(1000),
}).strict()
export const GroundGearRecoveryWorkSchema=z.object({eventId:Id,recoveryId:Id,workSeconds:Seconds,restActivity:z.enum(['light','strenuous']),activitySource:z.string().trim().min(1).max(1000)}).strict()
export const GroundGearRecoveryFinishSchema=z.object({eventId:Id,recoveryId:Id}).strict()
export const GroundGearRecoveryCancelSchema=z.object({eventId:Id,recoveryId:Id,reason:z.string().trim().min(1).max(1000)}).strict()
export const GroundGearRecoverySchema=z.object({
 id:Id,sequence:z.number().int().positive(),input:GroundGearRecoveryStartSchema,mapId:Id,roomId:Id,startedAt:z.number().nonnegative(),lastWorkedAt:z.number().nonnegative(),
 requiredSeconds:Seconds,workedSeconds:z.number().int().nonnegative(),status:z.enum(['working','awaiting_time','ready','completed','cancelled']),
 placementWitness:z.string(),containerWitness:z.string(),containerWasGround:z.boolean(),fullOriginal:z.boolean(),stockItemId:Id,
 initialStock:Fact.optional(),facts:z.object({container:Fact,remainingCoverage:Fact.optional(),stockWeight:Fact.optional(),containerWeight:Fact.optional(),safeHandling:Fact.optional()}).strict(),
 segments:z.array(z.object({eventId:Id,from:z.number().nonnegative(),to:z.number().nonnegative(),seconds:Seconds,phase:z.enum(['combat','exploration']),
  turnKey:z.string().max(500).optional(),restActivity:z.enum(['light','strenuous']),source:z.string().min(1).max(1000)}).strict()).max(512),
 completedAt:z.number().nonnegative().optional(),completionEventId:Id.optional(),result:Fact.optional(),
 cancelledAt:z.number().nonnegative().optional(),cancellationEventId:Id.optional(),cancellationReason:z.string().max(1000).optional(),
}).strict()
export type GroundGearRecovery=z.infer<typeof GroundGearRecoverySchema>
export type GroundGearRecoveryStart=z.infer<typeof GroundGearRecoveryStartSchema>
export type GroundGearRecoveryWork=z.infer<typeof GroundGearRecoveryWorkSchema>
export function groundGearPhysicalWitness(value:unknown):string{
 const ordered=(input:unknown):unknown=>Array.isArray(input)?input.map(ordered):input&&typeof input==='object'?Object.fromEntries(Object.entries(input).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,ordered(v)])):input
 return JSON.stringify(ordered(value))
}
export function groundGearRecoveryActivityIssue(state:GameState,seconds:number){
 if(seconds<=0||state.phase==='combat')return null
 const until=(state.worldTimeSeconds??0)+seconds
 for(const record of Object.values(state.dmTools?.afflictions?.records??{})){
  const spec=AFFLICTIONS[record.templateId]
  if(record.targetId!=='player'||!['active','pending'].includes(record.status)||record.petrificationPause||record.nextAt===undefined||record.nextAt>=until)continue
  if(record.templateId==='midnight_tears'||spec.repeat==='daily'||spec.repeat==='start'||spec.repeat==='end')return{code:'GROUND_GEAR_AFFLICTION_BOUNDARY',boundaryAt:record.nextAt,afflictionId:record.id,message:'Stop the real collection segment at the existing affliction event and resolve its actual outcome before crediting later capable work. No future save, damage or incapacitation is guessed.'}
 }
 return null
}

/** Retained witnesses of performed work only. A reload never supplies missing
 * elapsed time, quantities, a container, a segment or an earlier attempt. */
export function validateGroundGearRecoveries(state:GameState):string[]{
 const data=state.dmTools?.groundGear;if(!data?.recoveries)return[]
 const issues:string[]=[],at=state.worldTimeSeconds??0,latest=new Map<string,GroundGearRecovery>(),ids=Object.entries(data.recoveries).sort(([,a],[,b])=>a.sequence-b.sequence)
 if(ids.length>128||Object.keys(data.stocks).length>512)issues.push('Ground-gear recovery/stock history exceeds its retained physical bound.')
 if(new Set(ids.map(([,j])=>j.sequence)).size!==ids.length||ids.some(([,j])=>j.sequence>ids.length))issues.push('Actual collection attempts must retain their unique monotone creation sequence; JSON object order is not chronology.')
 for(const[id,job]of ids){
  const start=data.receipts[job.input.eventId],placed=data.placements[job.input.placementId],segments=job.segments
  if(id!==job.id||job.input.recoveryId!==id||job.requiredSeconds!==job.input.requiredSeconds||!placed||!start||start.command!==JSON.stringify({operation:'recovery-start',input:job.input})||start.result.recoveryId!==id)
   issues.push('A collection attempt needs its exact actual start, source placement and immutable request.')
  if(job.startedAt>job.lastWorkedAt||job.lastWorkedAt>at||job.workedSeconds>job.requiredSeconds||job.workedSeconds!==segments.reduce((n,s)=>n+s.seconds,0)||!segments.length||segments[0].from!==job.startedAt||segments.at(-1)?.to!==job.lastWorkedAt||new Set(segments.map(s=>s.eventId)).size!==segments.length)
   issues.push('Collection progress must equal the real retained work segments and their monotone clock.')
  for(let i=0;i<segments.length;i++){
   const segment=segments[i],receipt=data.receipts[segment.eventId]
   if(segment.from>segment.to||segment.to>at||i>0&&segment.from<segments[i-1].to||!receipt||receipt.result.recoveryId!==id||segment.phase==='exploration'&&(segment.to-segment.from!==segment.seconds||segment.turnKey!==undefined)||segment.phase==='combat'&&(segment.from!==segment.to||segment.seconds>6||!segment.turnKey))issues.push('A collection segment needs the original action/time event; combat credit cannot advance the clock.')
  }
  if(['ready','awaiting_time','completed'].includes(job.status)&&job.workedSeconds!==job.requiredSeconds)issues.push('A ready collection needs all of its actual performed work.')
  if(job.status==='completed'){
   const receipt=job.completionEventId?data.receipts[job.completionEventId]:undefined
   if(job.completedAt===undefined||job.completedAt>at||job.completedAt-job.startedAt<job.requiredSeconds||!receipt||receipt.command!==JSON.stringify({operation:'recovery-finish',input:{eventId:job.completionEventId,recoveryId:id}})||!job.result||groundGearPhysicalWitness(receipt.result)!==groundGearPhysicalWitness(job.result)||job.result.unitsCollected!==job.input.units)
    issues.push('A completed collection needs the one actual completion receipt, elapsed duration and exact units.')
   latest.set(job.input.placementId,job)
  }else if(job.completedAt!==undefined||job.completionEventId!==undefined||job.result!==undefined)issues.push('Unfinished work cannot carry completed stock or an applied outcome.')
  if(job.status==='cancelled'&&(job.cancelledAt===undefined||job.cancelledAt>at||!job.cancellationEventId||!data.receipts[job.cancellationEventId]||!job.cancellationReason))issues.push('Cancellation needs its real retained bookkeeping event, never refunded work.')
 }
 for(const[placementId,job]of latest){const placed=data.placements[placementId];if(placed&&job.result&&(placed.unitsRemaining!==job.result.remainingUnits||JSON.stringify(placed.cells)!==JSON.stringify(job.result.remainingCells)))issues.push('The last actual collection outcome must retain the exact uncollected units and remaining covered cells.')}
 for(const[id,stock]of Object.entries(data.stocks)){
  const owned=state.player.inventory.find(i=>i.id===id),dropped=state.droppedItems?.[id],container=state.player.inventory.find(i=>i.id===stock.containerItemId),groundContainer=state.droppedItems?.[stock.containerItemId]
  if(id!==stock.itemId||id===stock.containerItemId||Boolean(owned)===Boolean(dropped)||owned&&!container||dropped&&(!groundContainer||dropped.mapId!==groundContainer.mapId||dropped.roomId!==groundContainer.roomId||dropped.position.x!==groundContainer.position.x||dropped.position.y!==groundContainer.position.y))issues.push('Counted recovered units must remain with their one real owned/deposited container.')
  if(stock.lastRecoveryEventId||stock.lastTransferEventId){const item=owned??dropped?.item;if(item?.equipmentId!=='ground_gear_stock'||item.type!=='misc'||item.quantity!==1)issues.push('A retained counted contents record needs its exact real one-unit stock item representation.')}
  if(stock.lastTransferEventId){const receipt=data.receipts[stock.lastTransferEventId],stocks=receipt?.result.stocks as Record<string,unknown>|undefined;if(!stocks?.[id]||groundGearPhysicalWitness(stocks[id])!==groundGearPhysicalWitness(stock))issues.push('The current counted stock needs its exact last actual transfer receipt.')}
  else if(stock.lastRecoveryEventId){const receipt=data.receipts[stock.lastRecoveryEventId];if(!receipt?.result.stock||groundGearPhysicalWitness(receipt.result.stock)!==groundGearPhysicalWitness(stock))issues.push('The current recovered stock needs its exact last physical collection receipt.')}
 }
 return issues
}
