import { z } from 'zod'
import type { GameState, MonsterState } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'

export const CAMPAIGN_TRACKING_SOURCE = 'dmg-2014:fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1:2373-2375,2453-2474,5046-5072'
const Id=z.string().min(1).max(240).refine(id=>!['__proto__','prototype','constructor'].includes(id)),At=z.number().int().nonnegative(),Value=z.record(z.string(),z.unknown())
export const CampaignEncounterResultSchema=z.enum(['victory','player_fled','opponents_fled','surrender','capture','agreement'])
export type CampaignEncounterResult=z.infer<typeof CampaignEncounterResultSchema>
const Participant=z.object({actorId:Id,authoredIndex:z.number().int().nonnegative(),sourceType:Id,socialIdentity:Id,
 hostile:z.boolean().optional(),initialBody:Value}).strict()
const Combatant=z.object({actorId:Id,observedAt:At,stage:z.enum(['engagement','closure']),body:Value.optional()}).strict()
const Engagement=z.object({id:Id,encounterId:Id,mapId:Id,roomId:Id,combatGeneration:z.number().int().nonnegative(),
 recordedAt:At,startedAt:At.optional(),origin:z.enum(['actual_start','legacy_present_at_close']),
 participants:z.array(Participant).min(1),combatants:z.array(Combatant),witness:z.string()}).strict()
const ActorAtClose=z.object({actorId:Id,presentAtClose:z.boolean(),body:Value.optional()}).strict()
const Closure=z.object({id:Id,engagementId:Id,at:At,force:z.boolean(),player:Value,actors:z.array(ActorAtClose),combatants:z.array(Combatant),witness:z.string()}).strict()
const Outcome=z.object({id:Id,closureId:Id,encounterId:Id,result:CampaignEncounterResultSchema,reason:z.string().min(1).max(2000),
 at:At,command:z.string(),witness:z.string(),custodianId:Id.optional()}).strict()
export const CampaignOutcomeStateSchema=z.object({version:z.literal(1),source:z.literal(CAMPAIGN_TRACKING_SOURCE),engagements:z.record(z.string(),Engagement),
 closures:z.record(z.string(),Closure),outcomes:z.record(z.string(),Outcome)}).strict()
export type CampaignEngagement=z.infer<typeof Engagement>
export type CampaignEncounterClosure=z.infer<typeof Closure>
export type CampaignEncounterOutcome=z.infer<typeof Outcome>
export type CampaignOutcomeState=z.infer<typeof CampaignOutcomeStateSchema>
export const campaignOutcomesOf=(state:GameState)=>state.dmTools?.campaignOutcomes
export const campaignWitness=(value:unknown)=>witness(value)
export function sealedCampaignRecord<T extends object>(record:T):T&{witness:string}{return{...record,witness:witness(record)}}
function recordWitness(record:object&{witness:string}){const{witness:_witness,...value}=record;return witness(value)}

/** Read-only evidence, including actual present bodies separately from history.
 * A closure snapshot never materializes a retired body or grants possession. */
export function getEncounterOutcomeEvidence(state:GameState,encounterId:string){
 const data=campaignOutcomesOf(state)
 const engagement=Object.values(data?.engagements??{}).filter(e=>e.encounterId===encounterId)
  .sort((a,b)=>b.combatGeneration-a.combatGeneration||b.recordedAt-a.recordedAt)[0]
 if(!engagement)return undefined
 const closure=Object.values(data!.closures).find(c=>c.engagementId===engagement.id)
 const outcome=closure?Object.values(data!.outcomes).find(o=>o.closureId===closure.id):undefined
 return structuredClone({encounterId,mapId:engagement.mapId,engagementId:engagement.id,combatGeneration:engagement.combatGeneration,
  participants:engagement.participants,combatants:engagement.combatants,closure,outcome,currentActors:engagement.participants.map(p=>{
   const monster=state.monsters[p.actorId],npc=state.npcs?.[p.actorId]
   const body=monster??(npc&&npc.mapId===state.currentMapId&&'stats'in npc?npc as MonsterState:undefined)
   return{actorId:p.actorId,currentMapId:body?state.currentMapId:undefined,presentOnCurrentMap:Boolean(body),...(body?{body}:{})}
  })})
}

export function campaignObjectiveOutcomeId(state:GameState,encounterId:string,accepted:readonly CampaignEncounterResult[]){
 const evidence=getEncounterOutcomeEvidence(state,encounterId)
 return evidence?.outcome&&accepted.includes(evidence.outcome.result)?evidence.outcome.id:undefined
}

function hp(body:Record<string,unknown>){return body.hp as{current:number;max:number}}
function validBody(body:Record<string,unknown>){const h=hp(body),p=body.position as{x?:unknown;y?:unknown}|undefined
 return Boolean(h&&Number.isInteger(h.current)&&Number.isInteger(h.max)&&h.current>=0&&h.current<=h.max
  &&p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&Array.isArray(body.conditions)&&body.conditions.every(c=>typeof c==='string'))}
function living(body:Record<string,unknown>){return body.isAlive!==false&&!(body.deathSaves as{dead?:boolean}|undefined)?.dead}
function capable(body:Record<string,unknown>){return living(body)&&hp(body).current>0&&!(body.conditions as string[]).some(c=>['unconscious','incapacitated','paralyzed','stunned','petrified'].includes(c))}
/** One pure admission shared by initial choice and restoration. Narrative
 * surrender/agreement remain explicit MJ decisions, never inferred effects. */
export function campaignOutcomeAdmissionIssue(e:CampaignEngagement,c:CampaignEncounterClosure,input:{result:CampaignEncounterResult;custodianId?:string}){
 const issue=(code:string,message:string)=>({code,message})
 const opponents=e.participants.filter(p=>p.hostile!==false).map(p=>c.actors.find(a=>a.actorId===p.actorId))
 if(!validBody(c.player)||!opponents.length||opponents.some(a=>!a?.presentAtClose||!a.body||!validBody(a.body)))
  return issue('CAMPAIGN_ORIGINAL_ROSTER_REQUIRED','Retain every actual original opponent and player at closure; a missing body is not assumed defeated or escaped.')
 const bodies=opponents.map(a=>a!.body!),live=bodies.filter(living)
 if(input.result==='victory'&&bodies.some(b=>living(b)&&hp(b).current>0))
  return issue('CAMPAIGN_VICTORY_NOT_ATTESTED','A victory requires the original opponents actually dead or at zero HP; dialogue, temporary incapacity or engagement is not silently promoted to victory.')
 if(input.result!=='victory'&&(!c.force||!capable(c.player)))
  return issue('CAMPAIGN_EXPLICIT_CLOSE_REQUIRED','This narrative issue requires the actual explicitly forced close with a capable living player.')
 if(input.result==='player_fled'&&(c.player.roomId===e.roomId||!live.some(b=>hp(b).current>0)))
  return issue('CAMPAIGN_FLIGHT_NOT_ATTESTED','Retain the actual player departure from the encounter room and surviving opposition; reason text does not create an escape.')
 if(input.result==='opponents_fled'&&(!live.length||live.some(b=>b.roomId===e.roomId)))
  return issue('CAMPAIGN_FLIGHT_NOT_ATTESTED','Every surviving original opponent must actually leave the encounter room before the close.')
 if(['surrender','agreement'].includes(input.result)&&!live.some(b=>hp(b).current>0))
  return issue('CAMPAIGN_LIVING_PARTICIPANT_REQUIRED','The explicit surrender or agreement needs actual surviving participants, not retroactive dialogue with defeated bodies.')
 if(input.result==='capture'){
  const p=c.player.position as{x:number;y:number}
  if(input.custodianId!=='player'||!live.length||live.some(b=>hp(b).current!==0||!(b.conditions as string[]).includes('unconscious')
   ||Math.max(Math.abs((b.position as{x:number}).x-p.x),Math.abs((b.position as{y:number}).y-p.y))>1))
   return issue('CAMPAIGN_CAPTURE_NOT_ATTESTED','This bounded capture records only living actually knocked-out original bodies beside the capable explicit player custodian. It grants no restraints, transport or future custody.')
 }else if(input.custodianId!==undefined)return issue('CAMPAIGN_CUSTODIAN_CHOICE_INVALID','A custodian is only selected for the bounded capture issue.')
}

export function validateCampaignOutcomesState(state:GameState):string[]{
 const issues:string[]=[],data=campaignOutcomesOf(state),history=state.campaignOutcomeHistory??[],time=state.worldTimeSeconds??0
 if(data&&[data.engagements,data.closures,data.outcomes].some(records=>Object.keys(records).length>128))issues.push('Retain the bounded campaign history without fabricated extra records.')
 if(history.length!==new Set(history).size)issues.push('Campaign encounter history keeps unique original owners.')
 for(const id of history)if(!data?.engagements[id])issues.push('An actual tracked encounter cannot lose its retained engagement ledger.')
 for(const[id,e]of Object.entries(data?.engagements??{})){
  if(id!==e.id||id!==`campaign:${e.combatGeneration}:${encodeURIComponent(e.encounterId)}`||!history.includes(id)||e.recordedAt>time||e.combatGeneration>(state.combatGeneration??0)
   ||e.witness!==recordWitness(e)||!state.encountersTriggered?.includes(e.encounterId)
   ||new Set(e.participants.map(p=>p.actorId)).size!==e.participants.length
   ||new Set(e.combatants.map(p=>p.actorId)).size!==e.combatants.length||e.combatants.some(p=>p.stage!=='engagement'||p.observedAt!==e.recordedAt||!p.body||!validBody(p.body)||p.body.id!==p.actorId)
   ||e.participants.some((p,index)=>p.authoredIndex!==index||p.socialIdentity!==`encounter:${e.encounterId}:${index}`
    ||!validBody(p.initialBody)||p.initialBody.id!==p.actorId||p.initialBody.type!==p.sourceType||p.initialBody.socialIdentity!==p.socialIdentity||p.initialBody.hostile!==p.hostile)
   ||e.origin==='actual_start'&&e.startedAt!==e.recordedAt||e.origin==='legacy_present_at_close'&&e.startedAt!==undefined)
   issues.push('Retain the actual encounter identity, incarnation, source roster and original engagement timing.')
 }
 const engagementClosures=new Set<string>()
 for(const[id,c]of Object.entries(data?.closures??{})){
  const e=data?.engagements[c.engagementId]
  if(id!==c.id||id!==`${c.engagementId}:closed`||engagementClosures.has(c.engagementId)||!e||c.at<e.recordedAt||c.at>time||c.witness!==recordWitness(c)
   ||!validBody(c.player)||c.player.id!=='player'||c.actors.length!==e.participants.length||c.actors.some((a,index)=>a.actorId!==e.participants[index].actorId
    ||a.presentAtClose!==Boolean(a.body)||a.body&&(!validBody(a.body)||a.body.id!==a.actorId||a.body.type!==e.participants[index].sourceType)))
   issues.push('An actual encounter closure retains its original participants and pre-retirement bodies.')
  if(new Set(c.combatants.map(p=>p.actorId)).size!==c.combatants.length||c.combatants.some(p=>p.stage!=='closure'||p.observedAt!==c.at||p.body&&(!validBody(p.body)||p.body.id!==p.actorId)))
   issues.push('Retain exact observed real combatants, without inventing a body for a hazard turn or retired actor.')
  engagementClosures.add(c.engagementId)
 }
 const closed=new Set<string>()
 for(const[id,o]of Object.entries(data?.outcomes??{})){
  const c=data?.closures[o.closureId],e=c?data?.engagements[c.engagementId]:undefined
  if(id!==o.id||!e||o.encounterId!==e.encounterId||o.at<c!.at||o.at>time||o.witness!==recordWitness(o)
   ||closed.has(o.closureId)||o.command!==witness({eventId:o.id,closureId:o.closureId,result:o.result,reason:o.reason,
     ...(o.custodianId?{custodianId:o.custodianId}:{})}))issues.push('Keep the one exact explicit MJ outcome of the actual closed encounter.')
  closed.add(o.closureId)
  if(c&&e){const issue=campaignOutcomeAdmissionIssue(e,c,o);if(issue)issues.push(issue.message)}
 }
 for(const outcome of Object.values(state.mapOutcomes??{}))for(const id of outcome.campaignOutcomeIds??[])
  if(!data?.outcomes[id])issues.push('A departed map cannot lose an explicitly retained campaign outcome.')
 return issues
}
