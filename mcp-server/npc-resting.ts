import { BeginNpcRestSchema,AdvanceNpcRestSchema,npcRestsOf,npcRestSleepId,type NpcRestRecord } from '../lib/npc-rest-state'
import { appendRestActivity,inspectRestPeriod } from '../lib/rest-state'
import { actualLocomotionLocation } from '../lib/locomotion-state'
import { chaseFatigue } from '../lib/chase-state'
import { naturalSleepEpisode } from '../lib/sleep-state'
import { isStatBackedNpc } from '../lib/npc-stat-blocks'
import { limitedAfflictionHealing } from '../lib/affliction-healing'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { available,hero,now,advanceHeroTime } from './hero-rules'
import { beginNaturalSleep,wakeNaturalSleeper } from './sleep'
import { toolkitError,toolkitState } from './toolkit'
import { assertGameTimeAdvance } from './time-preflight'
import { preflightCackleNpcRest,stageCackleNpcLongRest } from './cackle-fever'
import * as gs from './game-state'
const data=()=>toolkitState().npcRests??={version:1 as const,records:{}}
function body(id:string){const n=gs.getNpc(id);if(!isStatBackedNpc(n)||!gs.npcOnCurrentMap(n)||!n.visible||n.hp.current<1||!n.isAlive||n.group)toolkitError('NPC_REST_ACTUAL_BODY_REQUIRED','Choose one real living individual visible sourced NPC on this map with at least one HP.');return n!}
function nearby(id:string){const s=gs.getState(),b=body(id);if(b.roomId!==s.currentRoomId||Math.max(Math.abs(b.position.x-s.player.position.x),Math.abs(b.position.y-s.player.position.y))>1)toolkitError('NPC_REST_OBSERVATION_REQUIRED','Remain at the actual adjacent NPC in its current room; no remote rest is supplied.');return b}
function checkpoint(id:string){const s=gs.getState(),b=body(id);return witness({body:b,observer:s.player.position,room:s.currentRoomId,map:s.currentMapId,generation:s.combatGeneration??0,phase:s.phase,lastLog:s.combatLog.at(-1),logLength:s.combatLog.length,
 effects:(s.monsterEffects??[]).filter(e=>e.targetId===id||e.sourceId===id),heroEffects:(s.hero?.effects??[]).filter(e=>e.sourceId===id||e.targetIds.includes(id)),action:s.actionUsed[id],bonus:s.bonusActionUsed?.[id],move:s.movementUsed[id]})}
function guard(id:string){available();if(gs.getState().phase==='combat')toolkitError('NPC_REST_IN_COMBAT','NPC rest is recorded outside combat only.');const b=nearby(id)
 if(b.conditions.some(c=>['incapacitated','paralyzed','stunned','petrified','unconscious'].includes(c))||actualLocomotionLocation(gs.getState(),id))toolkitError('NPC_REST_UNAVAILABLE','An actual available supported body must rest; swimming, hanging, incapacity or stone never supplies a rest.')
 if(chaseFatigue(gs.getState(),id)>0)toolkitError('NPC_REST_CHASE_RECOVERY_UNSUPPORTED','This disease-rest tranche cannot silently omit or adjudicate actual chase-source recovery.')
 if(Object.values(gs.getState().dmTools?.afflictions?.records??{}).some(r=>r.targetId===id&&['active','pending'].includes(r.status)&&r.templateId!=='cackle_fever'))toolkitError('NPC_REST_OTHER_AFFLICTION_UNSUPPORTED','Resolve a separately supported real rest/healing procedure for this other active affliction before time or benefits.')
 return b
}
function record(id:string){return npcRestsOf(gs.getState())?.records[id]??toolkitError('NPC_REST_REQUIRED','Choose an actual retained NPC rest.')}
function fresh(p:NpcRestRecord){nearby(p.input.npcId);if(p.status!=='active'||p.session.creditedUntil!==now()||p.checkpoint!==checkpoint(p.input.npcId))toolkitError('NPC_REST_HISTORY_CHANGED','The actual observed NPC rest changed or has an uncredited interval. Abandon it explicitly; no gap, action or sleep is inferred.')}
/** Explicit zero-time disease observation only. It never rehabilitates a stale
 * period, an outside gap, movement or damage, and does not credit any sleep. */
export function retainNpcRestForCackleOnset<T>(afflictionId:string,operation:()=>T):T{
 const s=gs.getState(),affliction=s.dmTools?.afflictions?.records[afflictionId],id=affliction?.targetId,npc=id?gs.getNpc(id):undefined
 const p=id&&id!=='player'?Object.values(npcRestsOf(s)?.records??{}).find(r=>r.input.npcId===id&&r.status==='active'):undefined
 const at=now(),hadOnset=Boolean(affliction?.cackleFever?.onset)
 const observed=Boolean(p&&npc?.visible&&npc.hp&&npc.hp.current>0&&gs.npcOnCurrentMap(npc)&&p.session.creditedUntil===at&&p.checkpoint===checkpoint(id!))
 if(observed&&!hadOnset&&(p!.sourceObservations?.length??0)>=128)toolkitError('NPC_REST_OBSERVATION_LIMIT','Retain the finite actual source observations before applying another symptom; explicit abandonment remains available.')
 const result=operation(),onset=affliction?.cackleFever?.onset,current=id?gs.getNpc(id):undefined
 if(observed&&!hadOnset&&onset&&now()===at&&p?.status==='active'&&current?.isAlive&&current.hp&&current.hp.current>0&&current.visible&&gs.npcOnCurrentMap(current)){
  const after=checkpoint(id!)
  if(after!==p.checkpoint){(p.sourceObservations??=[]).push({kind:'cackle_onset',afflictionId,exhaustionEventId:onset.exhaustionEventId,at,beforeWitness:p.checkpoint,afterWitness:after});onset.npcRestId=p.input.restId;p.checkpoint=after;p.session.checkpoint!.fingerprint=after}
 }
 return result
}
export function inspectNpcRest(restId?:string){const records=npcRestsOf(gs.getState())?.records??{};return{readOnly:true,records:restId?{[restId]:records[restId]??null}:records,benefitsGranted:false,seconds:0}}
export function beginNpcRest(raw:unknown){const input=BeginNpcRestSchema.parse(raw),command=JSON.stringify(input),old=npcRestsOf(gs.getState())?.records[input.restId];if(old){if(old.command!==command)toolkitError('NPC_REST_ID_CONFLICT','Retain this original NPC, kind and actual agreement.');return{replayed:true,record:old}}
 const b=guard(input.npcId),s=gs.getState(),fact=s.worldFacts?.find(f=>f.id===input.factId&&f.mapId===s.currentMapId&&f.expires==='never'&&f.narrativeEffect?.cell.x===b.position.x&&f.narrativeEffect?.cell.y===b.position.y)
 if(!fact)toolkitError('NPC_REST_AGREEMENT_REQUIRED','Choose a durable real local fact of this NPC willingly taking the prospective rest; no behavior or service is invented.')
 if(Object.values(npcRestsOf(s)?.records??{}).some(p=>p.status==='active'&&p.input.npcId===input.npcId))toolkitError('NPC_REST_ALREADY_ACTIVE','Finish or abandon this actual NPC rest first.')
 if(Object.keys(npcRestsOf(s)?.records??{}).length>=128)toolkitError('NPC_REST_LIMIT','Retain all NPC rest history; no old record is discarded.')
 preflightCackleNpcRest(input.npcId)
 const p:NpcRestRecord={input,command,mapId:s.currentMapId!,roomId:b.roomId,session:{restId:input.restId,kind:'long',startedAt:now(),creditedUntil:now(),hpAtStart:b.hp.current,segments:[],checkpoint:{fingerprint:checkpoint(input.npcId),mapId:s.currentMapId!,phase:s.phase,combatGeneration:s.combatGeneration??0,position:{...b.position}}},checkpoint:checkpoint(input.npcId),status:'active'}
 data().records[input.restId]=p;return{success:true,replayed:false,record:p,seconds:0,benefitsGranted:false}
}
export function advanceNpcRest(raw:unknown){const input=AdvanceNpcRestSchema.parse(raw),p=record(input.restId),old=p.session.segments.find(e=>e.eventId===input.eventId)
 if(old){if(old.to-old.from!==input.seconds||old.activity!==input.activity||old.reason!==input.reason)toolkitError('NPC_REST_EVENT_CONFLICT','Retain the original actual rest interval.');return{success:true,replayed:true,segment:old,benefitsGranted:false}}
 guard(p.input.npcId);fresh(p);if(p.session.segments.length>=512)toolkitError('NPC_REST_ACTIVITY_LIMIT','Retain the actual finite rest intervals.')
 assertGameTimeAdvance(input.seconds);const from=now(),sleepId=npcRestSleepId(p.input.restId,input.eventId)
 if(input.activity==='sleep'&&gs.getState().dmTools?.sleep?.episodes[sleepId])toolkitError('NPC_REST_SLEEP_SOURCE_CONFLICT','This exact natural sleep identity is already owned before any time or sleep.')
 if(input.activity==='sleep')beginNaturalSleep({eventId:sleepId,entityId:p.input.npcId,actualNaturalSleepConfirmed:true,reason:input.reason})
 const naturalRecoveries=advanceHeroTime(input.seconds)
 if(input.activity==='sleep'){const episode=naturalSleepEpisode(gs.getState(),p.input.npcId);if(!episode||episode.startedAt!==from)toolkitError('NPC_REST_SLEEP_INTERRUPTED','The actual natural sleep source did not persist for the selected interval.');wakeNaturalSleeper(p.input.npcId,'chosen_interval_end');episode.npcRest={restId:p.input.restId,eventId:input.eventId}}
 appendRestActivity(p.session,{eventId:input.eventId,from,to:now(),activity:input.activity,reason:input.reason});p.checkpoint=checkpoint(p.input.npcId);p.session.checkpoint!.fingerprint=p.checkpoint
 return{success:true,replayed:false,eligibility:inspectRestPeriod(p.session),naturalRecoveries,seconds:input.seconds,benefitsGranted:false}
}
export function finishNpcRest(input:{restId:string}){const p=record(input.restId),definition=JSON.stringify(input);if(p.status==='completed'){if(p.definition!==definition)toolkitError('NPC_REST_FINISH_CONFLICT','Retain the original completion.');return{...p.result,replayed:true}}
 const b=guard(p.input.npcId);fresh(p);if(!inspectRestPeriod(p.session).eligible)toolkitError('NPC_REST_NOT_COMPLETE','Record eight actual hours, including six of real sleep and at most two of light activity.')
 const previous=Object.values(npcRestsOf(gs.getState())?.records??{}).filter(q=>q.status==='completed'&&q.input.npcId===p.input.npcId).sort((a,b)=>b.endedAt!-a.endedAt!)[0]
 if(previous&&now()-previous.endedAt!<86400)toolkitError('NPC_LONG_REST_TOO_SOON','Only one actual NPC long-rest benefit per24hours.')
 preflightCackleNpcRest(p.input.npcId);const hpBefore=b.hp.current,healing=limitedAfflictionHealing(gs.getState(),b,b.hp.max-b.hp.current)
 if(healing>0)gs.updateMonsterHP(p.input.npcId,healing)
 p.status='completed';p.endedAt=now();p.definition=definition;p.hpBeforeCompletion=hpBefore;p.hpAfterCompletion=b.hp.current
 const cackleFeverEvent=stageCackleNpcLongRest(p.input.restId,p.input.npcId);if(cackleFeverEvent)p.cackleEventId=cackleFeverEvent.eventId
 const result={success:true,rest:'long',npcId:p.input.npcId,restId:p.input.restId,completedAt:now(),hpBefore,hp:{...b.hp},cackleFeverEvent,seconds:0,playerBenefitsGranted:false,hitDiceRecovered:false,spellSlotsRecovered:false,nutritionExhaustionRecovered:false}
 p.result=structuredClone(result);return result
}
export function abandonNpcRest(input:{restId:string;reason:string}){const p=record(input.restId),definition=JSON.stringify(input);if(p.status!=='active'){if(p.status!=='abandoned'||p.definition!==definition)toolkitError('NPC_REST_CONCLUSION_CONFLICT','Retain the exact original rest conclusion.');return{...p.result,replayed:true}}
 if(hero().pending)toolkitError('REACTION_PENDING','Resolve the actual held source first.');p.status='abandoned';p.endedAt=now();p.definition=definition;p.result={abandoned:true,restId:input.restId,reason:input.reason,benefitsGranted:false,seconds:0};return p.result
}
