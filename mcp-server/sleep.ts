import { wakeAfflictionSleeper } from './afflictions'
import { SleepPolicyInputSchema,NaturalSleepInputSchema,SleepNoiseInputSchema,sleepStateOf,initialSleepState,naturalSleepEpisode,sleepBody,dueSleepDeprivation,type SleepArmorSnapshot,type SleepState } from '../lib/sleep-state'
import { naturalSleepNoisePrerequisite,XGE_SLEEP_SOURCE } from '../lib/srd/xge-sleep'
import { ARMOR_RULES } from '../lib/srd/equipment'
import { entityVerticalContext } from '../lib/jumping-state'
import { swallowBoundary } from '../lib/swallow-state'
import { toolkitState,toolkitError,toolkitResult } from './toolkit'
import { available,assertHero,hero,now } from './hero-rules'
import { currentLoadout,equipmentId } from './equipment'
import { addEffect,endEffect } from './monster-rules'
import { naturalSleepPassiveHearing } from './check-modes'
import { inspectExhaustion,changeExhaustion } from './exhaustion'
import { registerCheckedResolution,savedResolution } from './toolkit-checks'
import type { SavingThrowResult } from '../lib/types'
import { coverFor } from './cover'
import * as rules from './rules'
import * as gs from './game-state'
const data=()=>toolkitState().sleep??=initialSleepState()
const original=(eventId:string,command:string)=>{const old=sleepStateOf(gs.getState())?.receipts[eventId];if(old&&old.command!==command)toolkitError('SLEEP_EVENT_CONFLICT','Keep this exact original policy, episode or physical wake choice.');return old?{...structuredClone(old.result),replayed:true}:undefined}
function room(){if(Object.keys(sleepStateOf(gs.getState())?.receipts??{}).length>=2048)toolkitError('SLEEP_HISTORY_LIMIT','Retain actual sleep and optional-rule receipts before time, condition or dice change.')}
function remember(id:string,command:string,result:Record<string,unknown>){data().receipts[id]={command,result:structuredClone(result)};return result}
export function configureSleepRules(raw:unknown){
 const input=SleepPolicyInputSchema.parse(raw),command=JSON.stringify({kind:'sleep-policy',input}),old=original(input.eventId,command);if(old)return old
 assertHero();if(hero().pending)toolkitError('REACTION_PENDING','Complete the original actual resolution first.');room()
 const p=sleepStateOf(gs.getState())?.policy
 if(p){if(p.armorRecovery!==input.armorRecovery||p.deprivation!==input.deprivation)toolkitError('SLEEP_POLICY_CHANGE_UNSUPPORTED','This adopted option cannot be disabled or readopted to erase actual debt, defer a boundary or retrofit an interval. Policy changes require a separately represented procedure.');return remember(input.eventId,command,{success:true,alreadyAdopted:true,policy:structuredClone(p),clockReset:false})}
 data().policy={...input,adoptedAt:now(),command,resolvedPeriods:0,...input.deprivation?{deprivationAnchorAt:now()}:{}}
 return remember(input.eventId,command,{success:true,policy:structuredClone(data().policy),pastHistoryInvented:false})
}
export function sleepArmorSnapshot():SleepArmorSnapshot|undefined{
 const p=sleepStateOf(gs.getState())?.policy;if(!p?.armorRecovery)return undefined
 const loadout=currentLoadout(),item=gs.getPlayer().inventory.find(i=>i.id===loadout.armorId),reference=item?equipmentId(item):undefined,armor=reference?ARMOR_RULES[reference]:undefined
 if(loadout.armorId&&(!item||!armor||armor.category==='shield'))toolkitError('SLEEP_ARMOR_PROFILE_REQUIRED','Observe the actual worn source armor before optional sleeping recovery; no category or final equipment is retroactively inferred.')
 return{policyEventId:p.eventId,adoptedAt:p.adoptedAt,at:now(),category:armor?.category??'none',...item?{itemId:item.id,equipmentId:reference}:{},itemWitness:JSON.stringify(item??null)} as SleepArmorSnapshot
}
export function beginNaturalSleep(raw:unknown){
 const input=NaturalSleepInputSchema.parse(raw),command=JSON.stringify({kind:'natural-sleep',input}),old=original(input.eventId,command);if(old)return old
 available();if(gs.getState().phase==='combat')toolkitError('SLEEP_NATURAL_OUTSIDE_COMBAT','An observation of actual natural sleep does not force an alert combatant asleep or spend another actor turn.')
 const body=sleepBody(gs.getState(),input.entityId)
 if(!body||body.hp.current<=0||'isAlive'in body&&!body.isAlive||'group'in body&&body.group||body.conditions.some(c=>['unconscious','incapacitated','stunned','paralyzed','petrified'].includes(c)))toolkitError('NATURAL_SLEEP_BODY_REQUIRED','Choose one actual living available body entering real natural sleep, not zero HP, an aggregated group, poison or magic.')
 if(naturalSleepEpisode(gs.getState(),input.entityId))toolkitError('NATURAL_SLEEP_ALREADY_ACTIVE','Keep the original actual natural sleep source.')
 room();if(Object.keys(data().episodes).length>=512)toolkitError('SLEEP_EPISODE_LIMIT','Retain each actual natural sleep and wake before another one.')
 const effect=addEffect({kind:'natural-sleep',sourceId:input.entityId,targetId:input.entityId,conditions:['unconscious']})
 if(!body!.conditions.includes('unconscious'))toolkitError('NATURAL_SLEEP_IMMUNE','The actual body did not become naturally unconscious; no sleep history is fabricated.')
 const episode={id:input.eventId,entityId:input.entityId,kind:'natural' as const,effectId:effect.id,mapId:gs.getState().currentMapId!,startedAt:now(),status:'sleeping' as const,reason:input.reason};data().episodes[input.eventId]=episode
 return remember(input.eventId,command,{success:true,episode:structuredClone(episode),secondsAdvanced:0,restBenefitsGranted:false})
}
export function wakeNaturalSleeper(entityId:string,cause:'damage'|'shake'|'noise'|'mental_alarm'|'chosen_interval_end'|'superseded_by_zero_hp'){
 const episode=naturalSleepEpisode(gs.getState(),entityId);if(!episode)return{awakened:false,naturalSourceRemoved:false}
 episode.status=cause==='superseded_by_zero_hp'?'superseded':'awakened';episode.endedAt=now();episode.wakeCause=cause;endEffect(episode.effectId)
 const body=sleepBody(gs.getState(),entityId,true)
 return{awakened:cause!=='superseded_by_zero_hp',naturalSourceRemoved:true,episodeId:episode.id,entityId,cause,conditions:body?.conditions??[],hp:body?.hp,otherUnconsciousSourceRemains:Boolean(body?.conditions.includes('unconscious'))}
}
export function endNaturalSleep(input:{eventId:string;episodeId:string;actualNaturalSleepEndedConfirmed:true;reason:string}){
 const command=JSON.stringify({kind:'natural-sleep-ended',input}),old=original(input.eventId,command);if(old)return old
 assertHero();if(hero().pending)toolkitError('REACTION_PENDING','Complete the actual held result first.')
 const e=sleepStateOf(gs.getState())?.episodes[input.episodeId];if(!e||e.status!=='sleeping'||!sleepBody(gs.getState(),e.entityId))toolkitError('NATURAL_SLEEP_EPISODE_REQUIRED','Observe the actual present natural sleeper ending its own source interval, not a past episode or an inactive archive.')
 room();return remember(input.eventId,command,{success:true,...wakeNaturalSleeper(e!.entityId,'chosen_interval_end'),secondsAdvanced:0,sleepCreditGranted:false})
}
export function shakeNaturalSleeper(input:{eventId:string;actorId:string;targetId:string}){
 const command=JSON.stringify({kind:'natural-shake',input}),old=original(input.eventId,command);if(old)return old
 available();if(hero().pending)toolkitError('REACTION_PENDING','Resolve the actual held result first.');
 if(gs.getMonster(input.actorId)?.controller==='reactive_npc')toolkitError('NPC_ACTIVATION_REQUIRED','The actual reactive body must use its authored available npc_action activation; no direct shake bypasses the ledger.')
 rules.validateActionUse(input.actorId)
 const state=gs.getState(),actor=sleepBody(state,input.actorId),target=sleepBody(state,input.targetId),episode=naturalSleepEpisode(state,input.targetId)
 if(!actor||!target||!episode||input.actorId===input.targetId||actor.hp.current<=0||actor.conditions.some(c=>['incapacitated','unconscious','paralyzed','petrified','stunned'].includes(c)))toolkitError('NATURAL_WAKE_TARGET_REQUIRED','Choose another actual capable adjacent actor and its actual naturally sleeping target; a self-command cannot wake or cure another source.')
 const a=entityVerticalContext(state,input.actorId),b=entityVerticalContext(state,input.targetId)
 if(!a.known||!b.known||a.airborne||b.airborne||a.zFeet!==b.zFeet)toolkitError('NATURAL_WAKE_SPATIAL_CONTEXT_REQUIRED','The actual contact requires coplanar nonairborne bodies at known current heights; unsupported nonplanar hand points are not inferred from body feet.')
 const feet=rules.distanceCells(actor!.position,target!.position)*5
 if(feet>5||swallowBoundary(state,input.actorId,input.targetId)==='blocked'||coverFor(input.actorId,input.targetId).degree==='total')toolkitError('NATURAL_WAKE_OUT_OF_REACH','A real action must physically reach the actual sleeper; no wall, height or interior boundary is bypassed.')
 room();const result=wakeNaturalSleeper(input.targetId,'shake');wakeAfflictionSleeper(input.targetId,false);rules.recordAction(input.actorId)
 const finalBody=sleepBody(gs.getState(),input.targetId)!;result.conditions=[...finalBody.conditions];result.otherUnconsciousSourceRemains=finalBody.conditions.includes('unconscious')
 return remember(input.eventId,command,{success:true,...result,actionSpent:true,secondsAdvanced:0})
}
export function reportSleepNoise(raw:unknown){
 const input=SleepNoiseInputSchema.parse(raw),command=JSON.stringify({kind:'actual-sleep-noise',input}),old=original(input.eventId,command);if(old)return old
 assertHero();if(hero().pending)toolkitError('REACTION_PENDING','Complete the original actual resolution first.');const state=gs.getState(),origin=sleepBody(state,input.originEntityId),fact=state.worldFacts?.find(f=>f.id===input.factId&&f.mapId===state.currentMapId)
 if(!origin||!fact||fact.narrativeEffect?.cell.x!==origin.position.x||fact.narrativeEffect?.cell.y!==origin.position.y||origin.hp.current<=0||origin.conditions.some(c=>['unconscious','incapacitated','paralyzed','petrified','stunned'].includes(c)))toolkitError('SLEEP_NOISE_ACTUAL_SOURCE_REQUIRED','Choose an existing capable source body and current-map observation of this real audible noise, not player-text inference or an automatic scene event.')
 if(input.kind!=='normal_speech'&&input.otherwiseSilent!==undefined)toolkitError('SLEEP_NOISE_ARGUMENTS','Ambient silence qualifies normal speech only.')
 const sourcePoint=entityVerticalContext(state,input.originEntityId),plans=input.sleeperIds.map(id=>{
  const body=sleepBody(state,id),episode=naturalSleepEpisode(state,id)
  if(!body)toolkitError('SLEEP_NOISE_NATURAL_TARGET_REQUIRED','Choose the actual present body; no archive is made audible.')
  const boundary=swallowBoundary(state,input.originEntityId,id)
  if(boundary==='blocked'||boundary==='interior_geometry_required')toolkitError('SLEEP_NOISE_BOUNDARY_REQUIRED','Neither an exterior source nor two interior host projections prove an actual acoustic path or whisper distance; no inside map or ear points are invented.')
  if(!episode)toolkitError('SLEEP_NOISE_NATURAL_TARGET_REQUIRED','Select actual active natural sleep episodes; this procedure never removes chemical, magical or zero-HP unconsciousness.')
  const hearing=naturalSleepPassiveHearing(id),point=entityVerticalContext(state,id)
  if(input.kind==='whisper'&&(!sourcePoint.known||!point.known||sourcePoint.airborne||point.airborne||sourcePoint.zFeet!==point.zFeet))toolkitError('SLEEP_WHISPER_ACTUAL_RANGE_REQUIRED','The whisper threshold currently requires known coplanar nonairborne bodies and the actual standard grid range; unsupported nonplanar ear/origin points are not inferred from feet.')
  const distanceFeet=input.kind==='whisper'?rules.distanceCells(origin!.position,body!.position)*5:undefined
  const verdict=naturalSleepNoisePrerequisite({kind:input.kind,actualAudibility:hearing.score!==null,passiveHearingPerception:hearing.score??0,distanceFeet,otherwiseSilent:input.otherwiseSilent})
  if('issue'in verdict)toolkitError(verdict.issue!,'Qualify the exact actual audible source, threshold, range and ambient circumstances before waking a body.')
  return{id,episodeId:episode!.id,hearing,verdict,distanceFeet}
 })
 room();const results=plans.map(plan=>({...plan,...plan.verdict.wakes?wakeNaturalSleeper(plan.id,'noise'):{awakened:false}}))
 return remember(input.eventId,command,{success:true,results,noiseActionCreated:false,secondsAdvanced:0,noiseWitness:{originEntityId:input.originEntityId,mapId:state.currentMapId,position:{...origin!.position},vertical:sourcePoint,factId:fact!.id,factWitness:JSON.stringify(fact),kind:input.kind,actualAudibilityConfirmed:true,...input.otherwiseSilent!==undefined?{otherwiseSilent:input.otherwiseSilent}:{}}})
}
export function assertSleepTimeAdvance(seconds:number){const due=dueSleepDeprivation(gs.getState());if(seconds>0&&due&&now()+seconds>due.at&&!(gs.getState().phase==='combat'&&seconds<=6&&now()<due.at))toolkitError('SLEEP_DEPRIVATION_BOUNDARY','Advance only to the exact explicitly adopted source deprivation boundary, then choose its real resolution or an eligible completed long rest.')}
export function afterSleepLongRest(restId:string){const p=sleepStateOf(gs.getState())?.policy;if(!p?.deprivation)return;const due=dueSleepDeprivation(gs.getState());if(due&&due.at<now())toolkitError('SLEEP_DEPRIVATION_DUE','An overdue actual source period cannot be erased by completing another rest.');p.deprivationAnchorAt=now();p.resolvedPeriods=0;p.lastResetRestId=restId}
function finishDeprivation(eventId:string,save:SavingThrowResult){
 const event=data().deprivations[eventId],p=data().policy,due=dueSleepDeprivation(gs.getState())
 if(!event||!p||!due||due.id!==eventId||event.status!=='pending'||save.entityId!=='player'||save.ability!=='con'||save.dc!==event.dc)toolkitError('SLEEP_DEPRIVATION_CONTEXT_CHANGED','Keep the actual original option, day, DC and retained CON save.')
 if(!save.success)changeExhaustion({eventId:`sleep:${eventId}`,targetId:'player',operation:'add',levels:1,reason:'Explicitly adopted XGE sleep deprivation: failed actual source24hourCON.'})
 const result={success:true,eventId,save,exhaustionAdded:!save.success,periodIndex:event!.periodIndex};event!.status='resolved';event!.result=structuredClone(result);p!.resolvedPeriods++;return toolkitResult(result)
}
export function resolveSleepDeprivation(eventId:string){
 assertHero();if(hero().pending)toolkitError('REACTION_PENDING','Complete the original held source save, never repeat it.')
 const previous=sleepStateOf(gs.getState())?.deprivations[eventId];if(previous?.status==='resolved')return toolkitResult({...previous.result,replayed:true})
 const due=dueSleepDeprivation(gs.getState());if(!due?.due||due.id!==eventId)toolkitError('SLEEP_DEPRIVATION_NOT_DUE','Choose the exact due event of the explicitly adopted option; disabled policies create no save.')
 const nutrition=gs.getState().dmTools?.survival;if(nutrition?.status==='active'&&now()>=nutrition.day.endsAt&&nutrition.day.endsAt<due!.at)toolkitError('SLEEP_EARLIER_NUTRITION_EVENT_REQUIRED','Resolve the earlier actual nutrition event first; only equal simultaneous timestamps allow a first-resolver choice.')
 room();inspectExhaustion('player');if(Object.keys(data().deprivations).length>=1024)toolkitError('SLEEP_DEPRIVATION_HISTORY_LIMIT','Retain each original source save before another die.')
 const p=data().policy!;data().deprivations[eventId]={id:eventId,policyEventId:p.eventId,anchorAt:p.deprivationAnchorAt!,periodIndex:due!.periodIndex,at:due!.at,dc:due!.dc,status:'pending'}
 return savedResolution({entityId:'player',ability:'con',dc:due!.dc},{domain:'sleep-deprivation-save',command:{eventId}})
}
export function validateHeldSleepSave(command:Record<string,unknown>){const r=command.toolkitResolution as{domain?:string;command?:{eventId?:string}}|undefined;if(r?.domain!=='sleep-deprivation-save')return;const due=dueSleepDeprivation(gs.getState()),e=sleepStateOf(gs.getState())?.deprivations[String(r.command?.eventId)];if(!due?.due||!e||e.status!=='pending'||due.id!==e.id||e.dc!==due.dc)toolkitError('SLEEP_DEPRIVATION_CONTEXT_CHANGED','Retain the exact explicitly selected original deprivation CON before any Inspiration cost or die.')}
export function registerSleepResolutions(){registerCheckedResolution('sleep-deprivation-save',(command,save)=>finishDeprivation(String(command.eventId),save as SavingThrowResult))}
export function inspectSleep(){return{confidential:true,source:XGE_SLEEP_SOURCE,state:sleepStateOf(gs.getState())??null,due:dueSleepDeprivation(gs.getState()),optionalDefaults:{armorRecovery:false,deprivation:false}}}
