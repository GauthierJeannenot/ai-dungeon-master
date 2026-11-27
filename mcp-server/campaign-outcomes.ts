import { preflightAdventuringCycleStart,commitAdventuringCycleStart,type AdventuringCycleStartPlan } from './adventuring-cycles'
import { z } from 'zod'
import { getAdventureMap, getEncounter, inferRoomIdOnMap } from '../lib/adventure-map'
import { CAMPAIGN_TRACKING_SOURCE, CampaignEncounterResultSchema,campaignOutcomesOf,campaignWitness,
 sealedCampaignRecord,getEncounterOutcomeEvidence,campaignOutcomeAdmissionIssue,type CampaignEngagement,type CampaignEncounterClosure } from '../lib/campaign-outcome-state'
import type { GameState, MonsterState } from '../lib/types'
import { available } from './hero-rules'
import { toolkitState,toolkitError,toolkitResult } from './toolkit'
import * as gs from './game-state'

const id=z.string().min(1).max(240).refine(value=>!['__proto__','prototype','constructor'].includes(value))
export const RecordCampaignOutcomeSchema=z.object({eventId:id,closureId:id,result:CampaignEncounterResultSchema,
 reason:z.string().min(1).max(2000),custodianId:z.literal('player').optional()}).strict()
function tracked(state:GameState,encounterId:string){
 const map=getAdventureMap(state)
 return Boolean(map.campaignTracking?.encounterIds.includes(encounterId))||Object.values(map.mapQuests).some(q=>q.objectives.some(o=>o.check.type==='encounterOutcome'&&o.check.encounterId===encounterId))
}
function data(){return toolkitState().campaignOutcomes??={version:1 as const,source:CAMPAIGN_TRACKING_SOURCE,engagements:{},closures:{},outcomes:{}}}
function bodySnapshot(state:GameState,body:MonsterState|GameState['player']){
 return structuredClone({...body,mapId:state.currentMapId,roomId:inferRoomIdOnMap(body.position,state.currentMapId!,state)}) as unknown as Record<string,unknown>
}
function realInitiativeIds(state:GameState){return state.initiativeOrder.filter(id=>{const npc=state.npcs?.[id];return id==='player'||state.monsters[id]||npc&&'stats'in npc})}
function combatants(state:GameState,ids:readonly string[],stage:'engagement'|'closure'){
 return [...new Set(ids)].map(actorId=>{const body=actorId==='player'?state.player:state.monsters[actorId]??state.npcs?.[actorId]
  return{actorId,stage,observedAt:state.worldTimeSeconds??0,...(body&&'stats'in body?{body:bodySnapshot(state,body as MonsterState)}:{})}
 })
}
export function preflightCampaignEngagement(state:GameState,encounterId:string,actualCycleStart=true){
 if(tracked(state,encounterId)&&Object.keys(campaignOutcomesOf(state)?.engagements??{}).length>=128)
  toolkitError('CAMPAIGN_OUTCOME_HISTORY_LIMIT','Retain all128 original engagements; no old campaign outcome is discarded.')
 if(actualCycleStart&&tracked(state,encounterId))return preflightAdventuringCycleStart(state,encounterId)
}
function engagement(state:GameState,encounterId:string,actors:MonsterState[],legacy=false):CampaignEngagement{
 const preset=getEncounter(encounterId,state)!,at=state.worldTimeSeconds??0,generation=state.combatGeneration??0
 return sealedCampaignRecord({id:`campaign:${generation}:${encodeURIComponent(encounterId)}`,encounterId,mapId:state.currentMapId!,roomId:preset.roomId!,
  combatGeneration:generation,recordedAt:at,...legacy?{}:{startedAt:at},origin:legacy?'legacy_present_at_close' as const:'actual_start' as const,
  combatants:combatants(state,realInitiativeIds(state),'engagement'),
  participants:actors.map((actor,authoredIndex)=>({actorId:actor.id,authoredIndex,sourceType:actor.type,
   socialIdentity:`encounter:${encounterId}:${authoredIndex}`,...actor.hostile!==undefined?{hostile:actor.hostile}:{},initialBody:bodySnapshot(state,actor)}))})
}
export function recordCampaignEngagement(state:GameState,encounterId:string,actors:MonsterState[],cyclePlan?:AdventuringCycleStartPlan){
 if(!tracked(state,encounterId))return
 const e=engagement(state,encounterId,actors)
 data().engagements[e.id]=e;(state.campaignOutcomeHistory??=[]).push(e.id)
 commitAdventuringCycleStart(state,e,cyclePlan)
}
/** Pure pre-retirement snapshot. Committing this plan does not close combat,
 * move a body, infer an outcome, award XP or call a gameplay tool. */
export function planCampaignEncounterClosures(state:GameState,force=false){
 const existing=campaignOutcomesOf(state),entries=Object.values(existing?.engagements??{})
  .filter(e=>e.combatGeneration===(state.combatGeneration??0)&&e.mapId===state.currentMapId&&!Object.values(existing?.closures??{}).some(c=>c.engagementId===e.id))
 // Old saves have no ledger. Only a still-present exact canonical roster can
 // be witnessed NOW at its actual close; an old ended encounter is not rebuilt.
 for(const preset of Object.values(getAdventureMap(state).encounters)){
  if(!tracked(state,preset.id)||entries.some(e=>e.encounterId===preset.id)||!state.encountersTriggered?.includes(preset.id))continue
  const actors=preset.monsters.map((_spec,index)=>Object.values(state.monsters).find(m=>m.socialIdentity===`encounter:${preset.id}:${index}`))
  if(!actors.length||actors.some((actor,index)=>!actor||actor.type!==preset.monsters[index].monsterType)
   ||!actors.some(actor=>actor&&state.initiativeOrder.includes(actor.id)))continue
  preflightCampaignEngagement(state,preset.id,false);entries.push(engagement(state,preset.id,actors as MonsterState[],true))
 }
 if(Object.keys(existing?.closures??{}).length+entries.length>128)toolkitError('CAMPAIGN_OUTCOME_HISTORY_LIMIT','Retain all original closures before closing another tracked encounter.')
 return entries.map(e=>({engagement:e,closure:sealedCampaignRecord({id:`${e.id}:closed`,engagementId:e.id,at:state.worldTimeSeconds??0,
  force:Boolean(force),player:bodySnapshot(state,state.player),combatants:combatants(state,[...e.combatants.map(p=>p.actorId),...realInitiativeIds(state)],'closure'),actors:e.participants.map(p=>{
   const body=state.monsters[p.actorId];return{actorId:p.actorId,presentAtClose:Boolean(body),...(body?{body:bodySnapshot(state,body)}:{})}
  })}) as CampaignEncounterClosure}))
}
export function commitCampaignEncounterClosures(state:GameState,plans:ReturnType<typeof planCampaignEncounterClosures>){
 for(const plan of plans){const d=data();if(!d.engagements[plan.engagement.id]){d.engagements[plan.engagement.id]=plan.engagement;(state.campaignOutcomeHistory??=[]).push(plan.engagement.id)}d.closures[plan.closure.id]=plan.closure}
 return plans.map(p=>({closureId:p.closure.id,engagementId:p.engagement.id,encounterId:p.engagement.encounterId,classification:'unclassified' as const}))
}
export function recordCampaignOutcome(raw:unknown){
 const input=RecordCampaignOutcomeSchema.parse(raw),command=campaignWitness(input),old=campaignOutcomesOf(gs.getState())?.outcomes[input.eventId]
 if(old){if(old.command!==command)toolkitError('CAMPAIGN_OUTCOME_EVENT_CONFLICT','Keep the exact original explicit encounter outcome.');return toolkitResult({success:true,replayed:true,outcome:old,seconds:0})}
 available();const state=gs.getState(),d=campaignOutcomesOf(state),c=d?.closures[input.closureId],e=c?d?.engagements[c.engagementId]:undefined
 if(state.phase==='combat'||!c||!e||e.mapId!==state.currentMapId||!tracked(state,e.encounterId))toolkitError('CAMPAIGN_CLOSED_ENCOUNTER_REQUIRED','Choose a retained exact authored encounter closed on this actual map; starting a confrontation is not a resolved outcome.')
 if(Object.values(d!.outcomes).some(o=>o.closureId===c!.id))toolkitError('CAMPAIGN_OUTCOME_ALREADY_RECORDED','One actual closure has one immutable MJ outcome, never a second interpretation or reward.')
 if(Object.keys(d!.outcomes).length>=128)toolkitError('CAMPAIGN_OUTCOME_HISTORY_LIMIT','Retain all128 original outcome decisions.')
 const admission=campaignOutcomeAdmissionIssue(e!,c!,input);if(admission)toolkitError(admission.code,admission.message)
 const outcome=sealedCampaignRecord({id:input.eventId,closureId:c!.id,encounterId:e!.encounterId,result:input.result,reason:input.reason,
  at:state.worldTimeSeconds??0,command,...input.custodianId?{custodianId:input.custodianId}:{}})
 d!.outcomes[input.eventId]=outcome
 return toolkitResult({success:true,replayed:false,outcome,seconds:0,bodyMoved:false,resourcesGranted:false,
  notice:input.result==='player_fled'||input.result==='opponents_fled'?'A real closed flight is retained; no villain, faction or cult is declared defeated.':'Only this explicit issue of the retained actual encounter is recorded; no future consequence, reward or ritual effect is invented.'})
}
export function inspectCampaignOutcomes(){const s=gs.getState();return toolkitResult({source:CAMPAIGN_TRACKING_SOURCE,ledger:campaignOutcomesOf(s)??null,
 encounters:Object.values(getAdventureMap(s).encounters).filter(e=>tracked(s,e.id)).map(e=>{
  const evidence=getEncounterOutcomeEvidence(s,e.id),engaged=Boolean(s.encountersTriggered?.includes(e.id))
  return{encounterId:e.id,evidence:evidence??null,engaged,
   stage:evidence?.outcome?'classified':evidence?.closure?'closed_unclassified':evidence?'engaged':engaged?'legacy_engaged':'not_engaged',
   legacyEngagedWithoutOutcome:Boolean(engaged&&!evidence)}
 })})}
export function campaignOutcomeIdsForMap(state:GameState,mapId:string){
 return [...new Set((getAdventureMap(state).mapQuests[mapId]?.objectives??[]).flatMap(o=>{
  if(o.check.type!=='encounterOutcome')return[]
  const result=getEncounterOutcomeEvidence(state,o.check.encounterId)?.outcome
  return result&&o.check.accepted.includes(result.result)?[result.id]:[]
 }))]
}
