import { z } from 'zod'
import { RestSessionSchema, inspectRestPeriod } from './rest-state'
import type { GameState } from './types'
const Id=z.string().min(1).max(80).refine(id=>!['constructor','prototype','__proto__'].includes(id)),At=z.number().int().nonnegative(),Value=z.record(z.string(),z.unknown())
export const BeginNpcRestSchema=z.object({restId:Id,npcId:Id,kind:z.literal('long'),factId:Id,actualWillingRestConfirmed:z.literal(true)}).strict()
export const AdvanceNpcRestSchema=z.object({restId:Id,eventId:Id,seconds:z.number().int().min(1).max(28800),activity:z.enum(['sleep','light']),reason:z.string().trim().min(1).max(600)}).strict()
export const NpcRestRecordSchema=z.object({input:BeginNpcRestSchema,command:z.string(),mapId:Id,roomId:z.string().nullable(),
 session:RestSessionSchema,checkpoint:z.string(),status:z.enum(['active','completed','abandoned']),endedAt:At.optional(),
 definition:z.string().optional(),result:Value.optional(),cackleEventId:Id.optional(),
 hpBeforeCompletion:z.number().int().nonnegative().optional(),hpAfterCompletion:z.number().int().nonnegative().optional(),
 sourceObservations:z.array(z.object({kind:z.literal('cackle_onset'),afflictionId:Id,exhaustionEventId:Id,at:At,beforeWitness:z.string(),afterWitness:z.string()}).strict()).max(128).optional(),
}).strict()
export const NpcRestStateSchema=z.object({version:z.literal(1),records:z.record(z.string(),NpcRestRecordSchema)}).strict()
export type NpcRestRecord=z.infer<typeof NpcRestRecordSchema>
export const npcRestsOf=(s:GameState)=>s.dmTools?.npcRests
/** Stable bounded identity, not an authorization/signature. Any existing ID
 * collision refuses before a sleep or time change. */
export function npcRestSleepId(restId:string,eventId:string){let hash=BigInt('14695981039346656037');for(const c of JSON.stringify([restId,eventId]))hash=BigInt.asUintN(64,(hash^BigInt(c.codePointAt(0)!))*BigInt('1099511628211'));return `npc-rest:${hash.toString(16).padStart(16,'0')}`}
export function validateNpcRestState(s:GameState){
 const errors:string[]=[],records=npcRestsOf(s)?.records??{},active=new Set<string>(),at=s.worldTimeSeconds??0
 for(const[id,p]of Object.entries(records)){
  if(id!==p.input.restId||p.command!==JSON.stringify(p.input)||p.session.restId!==id||p.session.kind!=='long'||p.session.startedAt>at||p.session.creditedUntil>at||p.mapId!==p.session.checkpoint?.mapId)
   errors.push('NPC rest identity, exact input and actual recorded clock must remain linked.')
  const npc=s.npcs?.[p.input.npcId];if(!npc?.hp)errors.push('NPC rest requires its retained actual NPC body.')
  if(p.session.checkpoint?.fingerprint!==p.checkpoint)errors.push('The NPC rest checkpoint retains its exact current canonical observation.')
  if(p.status==='active'){if(active.has(p.input.npcId)||p.endedAt!==undefined||p.result)errors.push('One actual NPC has one active rest, without premature benefits.');active.add(p.input.npcId)}
  else if(p.endedAt===undefined||p.endedAt>at||!p.result||p.definition===undefined)errors.push('Each concluded NPC rest retains its actual conclusion and immutable result.')
  if(p.status==='completed'){
   if(!inspectRestPeriod(p.session).eligible||p.endedAt!==p.session.creditedUntil||p.hpBeforeCompletion===undefined||p.hpAfterCompletion===undefined||p.hpAfterCompletion<p.hpBeforeCompletion)
    errors.push('NPC long-rest benefits require the original eligible real period and HP receipt.')
   const hp=p.result?.hp as {current?:number}|undefined
   if(p.definition!==JSON.stringify({restId:id})||p.result?.restId!==id||p.result?.npcId!==p.input.npcId||p.result?.completedAt!==p.endedAt||p.result?.hpBefore!==p.hpBeforeCompletion||hp?.current!==p.hpAfterCompletion)
    errors.push('The completed rest keeps its exact original HP and completion result, not a rewritten benefit.')
   const previous=Object.values(records).filter(q=>q!==p&&q.input.npcId===p.input.npcId&&q.status==='completed'&&q.endedAt!<p.endedAt!).sort((a,b)=>b.endedAt!-a.endedAt!)[0]
   if(previous&&p.endedAt!-previous.endedAt!<86400)errors.push('NPC long-rest benefits are limited to once per actual 24 hours.')
   if(p.cackleEventId){const event=s.dmTools?.cackleFever?.events[p.cackleEventId];if(!event||event.kind!=='rest'||event.targetId!==p.input.npcId||event.source.npcRestId!==id||event.at!==p.endedAt)errors.push('NPC disease recovery requires its reciprocal exact completed rest event.')}
  }
  for(const segment of p.session.segments)if(segment.activity==='sleep'){
   const episode=s.dmTools?.sleep?.episodes[npcRestSleepId(id,segment.eventId)]
   if(!episode||episode.npcRest?.restId!==id||episode.npcRest.eventId!==segment.eventId||episode.entityId!==p.input.npcId||episode.startedAt!==segment.from||episode.endedAt!==segment.to||episode.status!=='awakened'||episode.wakeCause!=='chosen_interval_end')errors.push('Each credited NPC sleep interval needs its own actual completed natural sleep and reciprocal owner.')
  }
  const seen=new Set<string>()
  for(const observation of p.sourceObservations??[]){
   const affliction=s.dmTools?.afflictions?.records[observation.afflictionId],onset=affliction?.cackleFever?.onset,receipt=s.dmTools?.exhaustion?.receipts[observation.exhaustionEventId]
   if(seen.has(observation.afflictionId)||affliction?.targetId!==p.input.npcId||onset?.npcRestId!==id||onset.exhaustionEventId!==observation.exhaustionEventId||receipt?.targetId!==p.input.npcId||receipt.at!==observation.at||observation.at<p.session.startedAt||observation.at>p.session.creditedUntil||observation.beforeWitness===observation.afterWitness)
    errors.push('A passive NPC onset observation requires its exact reciprocal actual symptom/exhaustion event, without new time or credit.')
   seen.add(observation.afflictionId)
  }
 }
 for(const affliction of Object.values(s.dmTools?.afflictions?.records??{})){const onset=affliction.cackleFever?.onset;if(onset?.npcRestId){const p=records[onset.npcRestId];if(!p||p.input.npcId!==affliction.targetId||!(p.sourceObservations??[]).some(o=>o.afflictionId===affliction.id&&o.exhaustionEventId===onset.exhaustionEventId))errors.push('An onset rest-observation marker cannot outlive its exact real NPC rest owner.')}}
 for(const episode of Object.values(s.dmTools?.sleep?.episodes??{}))if(episode.npcRest){
  const p=records[episode.npcRest.restId],segment=p?.session.segments.find(x=>x.eventId===episode.npcRest!.eventId)
  if(!p||!segment||segment.activity!=='sleep'||episode.id!==npcRestSleepId(p.input.restId,segment.eventId)||episode.entityId!==p.input.npcId||episode.startedAt!==segment.from||episode.endedAt!==segment.to)errors.push('A natural sleep NPC-rest marker cannot outlive its actual owning period, even without the new registry.')
 }
 for(const event of Object.values(s.dmTools?.cackleFever?.events??{}))if(event.kind==='rest'&&Object.hasOwn(event.source,'npcRestId')){
  const p=records[String(event.source.npcRestId)];if(!p||p.status!=='completed'||p.cackleEventId!==event.id||p.input.npcId!==event.targetId||p.endedAt!==event.at)errors.push('An NPC disease-rest event cannot outlive or replace its actual rest owner.')
 }
 return errors
}
