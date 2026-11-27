import { readCackleFeverSource, readCackleMadnessSource } from './rules-library'
import { createHash, randomUUID } from 'node:crypto'
import type { GameState, SavingThrowResult } from '../lib/types'
import type { AfflictionRecord } from '../lib/affliction-state'
import { getMonsterRecord } from '../lib/srd/monsters'
import { entityVerticalContext } from '../lib/jumping-state'
import { exhaustionLevel } from '../lib/exhaustion'
import { npcExplicitlyOffMap } from '../lib/npc-continuity-state'
import { preparedNpcSeparation } from './npc-continuity'
import { cackleCarrierImmune, cackleBodyAlive, cackleStateOf, cackleRecords, cackleDiseaseActive, cackleIncubationBoundary, cackleLaughter,
  cackleWitness as witness, initialCackleFever, CACKLE_SOURCE, QualifyCackleHostSchema,
  SeedCackleCaseSchema, RecordCackleStressSchema, ResolveCackleEventSchema, type CackleEvent } from '../lib/cackle-fever-state'
import { afflictions, endAffliction, commitAfflictionTurnEnd } from './afflictions'
import { available, now, hero, addHeroEffect, removeHeroEffect } from './hero-rules'
import { changeExhaustion, inspectExhaustion } from './exhaustion'
import { dealDamage } from './monster-rules'
import { rollDice } from './dice'
import { savedResolution, registerCheckedResolution } from './toolkit-checks'
import { toolkitState, toolkitError, toolkitResult, assertToolkitPreparation } from './toolkit'
import { hasRelaxationRecoveryAdvantage } from './xge-relaxation'
import * as gs from './game-state'

const data=()=>toolkitState().cackleFever??=initialCackleFever()
const key=(kind:string,body:unknown)=>`${kind}:${createHash('sha256').update(witness(body)).digest('hex')}`
const turnKey=(state:GameState)=>`${state.combatGeneration??0}:${state.turnCounter??0}:${state.currentTurn??''}`
let resolving=0, selfDamage=0, applyingEventId:string|undefined
export function withCackleConsequences<T>(operation:()=>T):T{return inside(operation)}
function inside<T>(operation:()=>T):T{resolving++;try{return operation()}finally{resolving--}}
function body(id:string){const value=gs.getPhysicalCreature(id);if(!value||'group'in value&&value.group||('isAlive'in value?!value.isAlive:value.deathSaves?.dead))toolkitError('CACKLE_ACTUAL_BODY_REQUIRED','Choose one actual living individual body; no missing, collective or dead host is created.');return value}
function physicalFact(id:string,targetId:string){
  const state=gs.getState(),target=body(targetId),fact=state.worldFacts?.find(f=>f.id===id)
  if(!fact||fact.source!=='record_scene_fact'||fact.expires!=='never'||fact.mapId!==state.currentMapId
    ||fact.narrativeEffect?.cell.x!==target.position.x||fact.narrativeEffect.cell.y!==target.position.y)
    toolkitError('CACKLE_ACTUAL_FACT_REQUIRED','Choose a durable actual current-map observation at this exact real body, without inferring its species or illness from prose.')
  return structuredClone(fact) as unknown as Record<string,unknown>
}
function host(id:string){const qualified=cackleStateOf(gs.getState())?.hosts[id];if(!qualified)toolkitError('CACKLE_HOST_QUALIFICATION_REQUIRED','Explicitly qualify this actual humanoid and whether it is a gnome before the source disease save.');return qualified}
function sourceReady(){const source=readCackleFeverSource(),stored=cackleStateOf(gs.getState())?.source;if(stored&&witness(stored)!==witness(source))toolkitError('CACKLE_SOURCE_CHANGED','Retain the exact original supplied disease and indefinite-madness source provenance.');return source}
function capacity(){if(Object.keys(data().events).length>=2048)toolkitError('CACKLE_EVENT_LIMIT','Keep the bounded original disease event history before any source die or new stress.');if(Object.keys(data().madness).length>=128)toolkitError('CACKLE_MADNESS_LIMIT','Keep the original indefinite flaws before another possible third failed recovery.')}
function assertPendingFree(){if(gs.getState().hero?.pending)toolkitError('REACTION_PENDING','Resolve the original held save before a different disease event.')}
export function qualifyCackleHost(raw:unknown){
 const input=QualifyCackleHostSchema.parse(raw),state=gs.getState(),target=body(input.creatureId),old=cackleStateOf(state)?.hosts[input.creatureId]
 if(old){if(witness(old.input)!==witness(input))toolkitError('CACKLE_HOST_CONFLICT','Retain the original explicit actual humanoid/gnome qualification.');return{success:true,replayed:true,qualification:old}}
 if(Object.keys(cackleStateOf(state)?.hosts??{}).length>=128)toolkitError('CACKLE_HOST_LIMIT','Retain the bounded actual host qualifications.')
 const type=input.creatureId==='player'?'humanoid':String(getMonsterRecord((target as {type:string}).type)?.source.type??'')
 if(type!=='humanoid')toolkitError('CACKLE_HUMANOID_REQUIRED','The actual catalog type is not humanoid; a fact does not replace its source statistics.')
 const fact=physicalFact(input.factId,input.creatureId),record={input,at:now(),bodyType:type,fact,command:witness({input,at:now(),bodyType:type,fact})}
 data().hosts[input.creatureId]=record
 return{success:true,replayed:false,qualification:record,source:CACKLE_SOURCE,noRacialBonusGranted:true}
}
function newInfection(targetId:string,sourceId:string,sourceActorId:string|undefined,eventId:string){
 const state=gs.getState(),target=body(targetId)
 if(target.conditions.includes('petrified')||host(targetId).input.actualGnome)toolkitError('CACKLE_HOST_IMMUNE','A gnome or actually petrified body cannot acquire this disease.')
 if(cackleRecords(state).some(r=>r.targetId===targetId&&['active','pending'].includes(r.status)))toolkitError('CACKLE_ALREADY_INFECTED','Retain the original actual infection, incubation and recovery progression.')
 if(Object.keys(state.dmTools?.afflictions?.records??{}).length>=512)toolkitError('AFFLICTION_EVENT_LIMIT','Keep the original actual disease records before the incubation die.')
 const id=key('cackle',eventId)
 if(state.dmTools?.afflictions?.records[id])toolkitError('CACKLE_INFECTION_ID_CONFLICT','Retain the original exact source infection identity; no case can replace another event.')
 const source=sourceReady();data().source=source
 const incubation=rollDice('1d4')
 const record:AfflictionRecord={id,sourceId,...sourceActorId?{sourceActorId}:{},targetId,templateId:'cackle_fever',eventId,
  creation:witness({sourceId,sourceActorId,targetId,eventId}),status:'active',appliedAt:now(),nextAt:now()+incubation.total*3600,
  successes:0,lastTurn:state.turnCounter??0,unhealableDamage:0,sightPenalty:0,ointmentDoses:0,ointmentPending:false,
  cackleFever:{incubationHours:incubation.total,dc:13,recoveryFailures:0}}
 afflictions().records[id]=record
 return{record,incubation}
}
export function recordCackleCase(raw:unknown){
 const input=SeedCackleCaseSchema.parse(raw),prior=cackleStateOf(gs.getState())?.seeds[input.eventId]
 if(prior){if(witness(prior.input)!==witness(input))toolkitError('CACKLE_SEED_CONFLICT','Retain the original exact current NPC infection preparation.');return{success:true,replayed:true,seed:prior,affliction:gs.getState().dmTools!.afflictions!.records[prior.afflictionId]}}
 if(input.creatureId==='player')toolkitError('CACKLE_PLAYER_CONTAGION_REQUIRED','The actual player acquires Cackle Fever only from its real source turn contagion save, never this NPC preparation.')
 assertToolkitPreparation();capacity();host(input.creatureId)
 const fact=physicalFact(input.factId,input.creatureId),fresh=newInfection(input.creatureId,input.eventId,undefined,input.eventId)
 const seed={input,at:now(),afflictionId:fresh.record.id,incubation:fresh.incubation as unknown as Record<string,unknown>,fact,
  command:witness({input,at:now(),afflictionId:fresh.record.id,incubation:fresh.incubation,fact})}
 data().seeds[input.eventId]=seed
 return{success:true,replayed:false,seed,affliction:fresh.record,source:CACKLE_SOURCE,notice:'Explicit MJ preparation of one new actual NPC infection now. No previous onset, attack, player infection or monster power is inferred.'}
}
function stage(kind:CackleEvent['kind'],targetId:string,source:Record<string,unknown>,options:{afflictionId?:string;sourceId?:string;sourceAfflictionId?:string;dc:number;turnKey?:string;identity?:unknown}){
 const id=key(`cackle-${kind}`,options.identity??{targetId,source,sequence:Object.keys(data().events).length})
 const old=data().events[id];if(old)return old
 capacity()
 const event:CackleEvent={id,kind,targetId,at:now(),source,sourceWitness:witness(source),dc:options.dc,
  ...options.afflictionId?{afflictionId:options.afflictionId}:{},...options.sourceId?{sourceId:options.sourceId}:{},
  ...options.sourceAfflictionId?{sourceAfflictionId:options.sourceAfflictionId}:{},...options.turnKey?{turnKey:options.turnKey}:{}}
 data().events[id]=event
 return event
}
export function stageCackleStress(targetId:string,cause:Record<string,unknown>){
 if(selfDamage)return
 const record=cackleDiseaseActive(gs.getState(),targetId)
 if(!record?.cackleFever?.onset||record.cackleFever.dc<=0)return
 return stage('stress',targetId,cause,{afflictionId:record.id,dc:record.cackleFever.dc})
}
export function recordCackleStress(raw:unknown){
 const input=RecordCackleStressSchema.parse(raw),old=cackleStateOf(gs.getState())?.stressFacts[input.eventId]
 if(old){if(witness(old.input)!==witness(input))toolkitError('CACKLE_STRESS_CONFLICT','Retain the exact already witnessed external great stress.');return{success:true,replayed:true,event:data().events[old.eventId]}}
 assertPendingFree();const fact=physicalFact(input.factId,input.creatureId)
 if(Object.values(data().stressFacts).some(receipt=>receipt.input.factId===input.factId&&receipt.input.creatureId===input.creatureId))toolkitError('CACKLE_STRESS_FACT_REUSED','The same actual stress occurrence cannot trigger another source save under a new nonce.')
 const event=stageCackleStress(input.creatureId,{kind:'explicit-great-stress',fact,reason:input.reason})
 if(!event)toolkitError('CACKLE_SYMPTOMATIC_HOST_REQUIRED','Only this actual symptomatic live infection can supply this external stress event.')
 data().stressFacts[input.eventId]={input,at:now(),eventId:event.id,command:witness({input,at:now(),eventId:event.id})}
 return{success:true,replayed:false,event,actionSpent:false,seconds:0}
}
function inRange(sourceId:string,targetId:string){
 const state=gs.getState(),source=gs.getPhysicalCreature(sourceId),target=gs.getPhysicalCreature(targetId)
 if(!source||!target)return false
 const a=entityVerticalContext(state,sourceId),b=entityVerticalContext(state,targetId)
 if(!a.known||!b.known)toolkitError('CACKLE_RANGE_GEOMETRY_REQUIRED','Establish the actual carrier and target heights before a ten-foot contagion range; no XY-only elevated proximity is inferred.')
 return Math.hypot((source.position.x-target.position.x)*5,(source.position.y-target.position.y)*5,a.zFeet!-b.zFeet!)<=10+1e-9
}
export function stageCackleTurn(targetId:string|null){
 const state=gs.getState();if(!targetId||state.phase!=='combat')return
 const target=gs.getPhysicalCreature(targetId)
 if(!target||targetId==='player'&&state.player.deathSaves?.dead||'isAlive'in target&&!target.isAlive||target.conditions.includes('petrified')||cackleDiseaseActive(state,targetId))return
 const known=targetId==='player'?'humanoid':getMonsterRecord((target as{type:string}).type)?.source.type
 if(known!=='humanoid')return
 for(const source of cackleRecords(state)){
  if(source.targetId===targetId||!cackleLaughter(state,source.targetId)||!inRange(source.targetId,targetId))continue
  const immune=cackleCarrierImmune(state,targetId,source.targetId)
  if(immune)continue
  stage('contagion',targetId,{sourceId:source.targetId,sourceAfflictionId:source.id,crisisId:source.cackleFever!.crisis!.id,crisis:structuredClone(source.cackleFever!.crisis!),
   targetCell:{...target.position},sourceCell:{...body(source.targetId).position}},{sourceId:source.targetId,sourceAfflictionId:source.id,dc:10,turnKey:turnKey(state),identity:[targetId,source.targetId,turnKey(state)]})
 }
}
export function stageCackleCombat(){for(const record of cackleRecords(gs.getState()))if(record.status==='active'&&!record.petrificationPause&&gs.getState().initiativeOrder.includes(record.targetId))stageCackleStress(record.targetId,{kind:'enter-combat',generation:gs.getState().combatGeneration??0})}
const actualDepartureIds=new Set<string>()
/** Internal scope of one explicit, physically preflighted map departure only. */
export function withCackleDeclaredDeparture<T>(ids:readonly string[],operation:()=>T):T{
 const added=ids.filter(id=>!actualDepartureIds.has(id));for(const id of added)actualDepartureIds.add(id)
 try{return operation()}finally{for(const id of added)actualDepartureIds.delete(id)}
}
export function cackleDueEvent(state=gs.getState()){
 const onset=cackleIncubationBoundary(state,state.worldTimeSeconds??0,actualDepartureIds)
 if(onset)return{kind:'onset' as const,afflictionId:onset.id,at:onset.nextAt!}
 const event=Object.values(cackleStateOf(state)?.events??{}).find(event=>!event.result&&cackleBodyAlive(state,event.targetId)&&!npcExplicitlyOffMap(state,event.targetId))
 return event?{kind:event.kind,eventId:event.id,at:event.at}:undefined
}
export function assertCackleEventsResolved(allowOnsetAt?:number){if(resolving)return;const event=cackleDueEvent();if(event?.kind==='onset'&&event.at===allowOnsetAt)return;if(event)toolkitError('CACKLE_EVENT_REQUIRED',`Resolve the retained actual ${event.kind} disease event before another action or clock advance.`)}
export function assertCackleTimeAdvance(seconds:number){
 if(!resolving)assertCackleEventsResolved()
 const onset=cackleIncubationBoundary(gs.getState(),now()+Math.max(0,seconds),actualDepartureIds)
 if(seconds>0&&onset?.nextAt!==undefined&&now()+seconds>onset.nextAt)toolkitError('CACKLE_INCUBATION_BOUNDARY',`Advance only to the exact actual incubation boundary ${onset.nextAt}, then resolve its retained symptoms.`)
}
export function resolveCackleOnset(afflictionId:string){return inside(()=>{
 assertPendingFree();const record=gs.getState().dmTools?.afflictions?.records[afflictionId]
 if(record?.cackleFever?.onset)return{success:true,replayed:true,affliction:record}
 if(record?.templateId!=='cackle_fever'||record.status!=='active'||record.petrificationPause||!cackleBodyAlive(gs.getState(),record.targetId)||record.nextAt===undefined||record.nextAt>now())
  toolkitError('CACKLE_ONSET_NOT_DUE','Choose the retained actual incubation that has reached its precise onset.')
 sourceReady()
 const at=record.nextAt,eventId=key('cackle-onset',record.id)
 gs.withPhysicalCreatureResolution([record.targetId],()=>changeExhaustion({eventId,targetId:record.targetId,operation:'add',levels:1,reason:'DMG2014 Cackle Fever symptomatic exhaustion, protected until the disease is cured.'}))
 record.cackleFever!.onset={at,exhaustionEventId:eventId};delete record.nextAt
 return{success:true,replayed:false,affliction:record}
})}
function remember(event:CackleEvent,result:Record<string,unknown>){event.result=structuredClone(result);event.resultWitness=witness(event.result);delete event.heldWitness;return toolkitResult({...result,eventId:event.id,event})}
function crisisEnd(record:AfflictionRecord){const crisis=record.cackleFever?.crisis;if(!crisis)return;crisis.endedAt=record.petrificationPause?now():Math.min(now(),crisis.endsAt);if(record.petrificationPause)record.petrificationPause.effects=record.petrificationPause.effects.filter(effect=>effect.id!==crisis.effectId);removeHeroEffect(crisis.effectId)}
function startCrisis(record:AfflictionRecord,event:CackleEvent){
 if(record.cackleFever?.crisis)crisisEnd(record)
 const effect=addHeroEffect(`cackle-laughter:${record.id}`,record.id,[record.targetId],60,{afflictionId:record.id,condition:'incapacitated'})
 record.cackleFever!.crisis={id:event.id,dc:event.dc,startedAt:now(),endsAt:now()+60,effectId:effect.id}
}

export function stageCackleLongRest(restId:string){
 const record=cackleDiseaseActive(gs.getState(),'player')
 if(!record?.cackleFever)return
 const event=stage('rest','player',{restId,completedAt:now()},{afflictionId:record.id,dc:record.cackleFever.dc,identity:[record.id,restId]})
 return{eventId:event.id,afflictionId:record.id,restId,at:event.at,dc:event.dc}
}
export function preflightCackleNpcRest(targetId:string){
 const record=cackleDiseaseActive(gs.getState(),targetId)
 if(record){capacity();sourceReady()}
}
export function stageCackleNpcLongRest(restId:string,targetId:string){
 const record=cackleDiseaseActive(gs.getState(),targetId)
 if(!record?.cackleFever)return
 const event=stage('rest',targetId,{npcRestId:restId,completedAt:now()},{afflictionId:record.id,dc:record.cackleFever.dc,identity:['npc',record.id,restId]})
 return{eventId:event.id,afflictionId:record.id,restId,at:event.at,dc:event.dc}
}
export function preflightCackleLongRest(){
 const record=cackleDiseaseActive(gs.getState(),'player');if(record){if(cackleRecords(gs.getState()).length&&Object.values(gs.getState().dmTools?.afflictions?.records??{}).some(other=>other.templateId==='sewer_plague'&&other.targetId==='player'&&other.status==='active'))toolkitError('CACKLE_SEWER_REST_ADJUDICATION_REQUIRED','The joint disease recovery order and protected exhaustion require a separate represented adjudication before any rest cost or benefit.');capacity();if(Object.keys(gs.getState().dmTools?.afflictions?.records??{}).length>=512)toolkitError('AFFLICTION_EVENT_LIMIT','Retain the original source disease before the completed rest event.')}
}
export function resolveCackleTurn(raw:{afflictionId:string;endTurn:true;attemptSave?:boolean}){
 const state=gs.getState(),record=state.dmTools?.afflictions?.records[raw.afflictionId],live=record?cackleLaughter(state,record.targetId):undefined
 const crisis=record?.cackleFever?.crisis,prior=crisis?cackleStateOf(state)?.events[key('cackle-repeat',[crisis.id,turnKey(state)])]:undefined
 if(prior?.result)return resolveCackleEvent({eventId:prior.id,endTurn:true,...raw.attemptSave!==undefined?{attemptSave:raw.attemptSave}:{}})
 if(raw.endTurn!==true||!live||state.phase!=='combat'||state.currentTurn!==record!.targetId)toolkitError('CACKLE_ACTUAL_END_TURN_REQUIRED','Only the current actual laughing creature may explicitly end its turn for this crisis save; no outside-combat turn is invented.')
 const event=stage('repeat',record!.targetId,{crisisId:live.crisis.id,startedAt:live.crisis.startedAt,endsAt:live.crisis.endsAt},
  {afflictionId:record!.id,dc:live.crisis.dc,turnKey:turnKey(state),identity:[live.crisis.id,turnKey(state)]})
 return resolveCackleEvent({eventId:event.id,endTurn:true,...raw.attemptSave!==undefined?{attemptSave:raw.attemptSave}:{}})
}
export function assertCackleTurnMayEnd(targetId:string){
 if(resolving)return
 assertCackleEventsResolved()
 const state=gs.getState(),live=cackleLaughter(state,targetId)
 if(live&&!Object.values(cackleStateOf(state)?.events??{}).some(event=>event.kind==='repeat'&&event.afflictionId===live.record.id&&event.source.crisisId===live.crisis.id&&event.turnKey===turnKey(state)&&event.result))
  toolkitError('CACKLE_END_TURN_SAVE_REQUIRED','Explicitly end this actual laughing creature’s turn through resolve_cackle_fever_turn before advancing initiative.')
}
function validateEvent(event:CackleEvent){
 const state=gs.getState(),target=body(event.targetId)
 if(event.kind==='contagion'){
  host(event.targetId)
  if(state.phase!=='combat'||state.currentTurn!==event.targetId||turnKey(state)!==event.turnKey
   ||!event.sourceId||!event.source.crisis)
   toolkitError('CACKLE_CONTAGION_SOURCE_CHANGED','Retain the actual original start-of-turn target and laughing infected carrier inside ten physical feet before any save die.')
 }
 if(event.kind==='stress'||event.kind==='rest'||event.kind==='repeat'){
  const record=state.dmTools?.afflictions?.records[event.afflictionId??'']
  if(!record||record.templateId!=='cackle_fever'||record.targetId!==event.targetId||record.status!=='active'||record.petrificationPause)
   toolkitError('CACKLE_EVENT_SOURCE_CHANGED','Retain the same actual live unsuspended infection before its original source save.')
  if(event.kind==='repeat'&&(state.phase!=='combat'||state.currentTurn!==event.targetId||turnKey(state)!==event.turnKey||!cackleLaughter(state,event.targetId)||record.cackleFever?.crisis?.id!==event.source.crisisId))
   toolkitError('CACKLE_CRISIS_SOURCE_CHANGED','Repeat the exact original crisis DC at this actual end of turn, never a new source, duration or turn.')
 }
 if(target.conditions.includes('petrified'))toolkitError('CACKLE_STONE_EVENT_SUSPENDED','The actual source disease is suspended by petrification; no new source save is invented.')
}
export function resolveCackleEvent(raw:unknown){
 const input=ResolveCackleEventSchema.parse(raw),event=cackleStateOf(gs.getState())?.events[input.eventId]
 if(!event)toolkitError('CACKLE_EVENT_UNKNOWN','Choose one retained exact actual Cackle Fever event.')
 if(event.input&&witness(event.input)!==witness(input))toolkitError('CACKLE_EVENT_ARGUMENT_CONFLICT','Retain the same original event and explicit end-of-turn choice.')
 if(event.result)return toolkitResult({...event.result,event,replayed:true})
 if(hero().pending){if(event.heldWitness&&witness(hero().pending)===event.heldWitness)return toolkitResult({alreadyPending:true,event,pendingReaction:hero().pending});toolkitError('REACTION_PENDING','Complete the already held source save before a different disease event.')}
 validateEvent(event);capacity();sourceReady()
 if(event.kind==='repeat'){if(input.endTurn!==true)toolkitError('CACKLE_END_TURN_REQUIRED','Choose endTurn=true to commit this actual turn before its crisis save.');commitAfflictionTurnEnd(event.targetId)}
 else if(input.endTurn!==undefined)toolkitError('CACKLE_EVENT_ARGUMENT_CONFLICT','Only a real crisis repeat uses the explicit end-of-turn choice.')
 if(event.kind==='rest'||event.kind==='repeat'){if(input.attemptSave===undefined)toolkitError('CACKLE_OPTIONAL_SAVE_CHOICE_REQUIRED','Explicitly choose attemptSave=true or false for this optional recovery or end-of-turn save.')}
 else if(input.attemptSave!==undefined)toolkitError('CACKLE_SAVE_IS_MANDATORY','Stress and actual contagion saves are mandatory; no optional-save choice applies.')
 event.input=input;event.command=witness(input)
 if(input.attemptSave===false)return remember(event,{saveDeclined:true,diceRolled:false,source:CACKLE_SOURCE,...event.kind==='repeat'?{endTurnCommitted:true}:{}})
 const target=body(event.targetId)
 if(event.kind==='contagion'&&(host(event.targetId).input.actualGnome||target.conditions.includes('petrified')||cackleDiseaseActive(gs.getState(),event.targetId)))
  return remember(event,{success:true,immune:host(event.targetId).input.actualGnome?'gnome':target.conditions.includes('petrified')?'petrified':'already-infected',diceRolled:false})
 const result=inside(()=>gs.withPhysicalCreatureResolution([event.targetId],()=>savedResolution({entityId:event.targetId,ability:'con',dc:event.dc,
  sourceAdvantage:event.kind==='rest'&&hasRelaxationRecoveryAdvantage(gs.getState(),event.at,String(event.source.restId))},
  {domain:'cackle-fever',command:{eventId:event.id}})))
 if((hero().pending?.command.toolkitResolution as {domain?:string}|undefined)?.domain==='cackle-fever'&&!event.result)event.heldWitness=witness(hero().pending)
 return result
}
function applyCackleSave(command:Record<string,unknown>,save:SavingThrowResult){return inside(()=>{
 const previousApplying=applyingEventId;applyingEventId=String(command.eventId);try{
 const event=cackleStateOf(gs.getState())?.events[String(command.eventId)]
 if(!event||event.result)toolkitError('CACKLE_EVENT_ALREADY_FINISHED','Retain the exact original unresolved source save.')
 validateEvent(event)
 const result:Record<string,unknown>={success:save.success,save,source:CACKLE_SOURCE,replayed:false}
 if(event.kind==='contagion'){
  if(save.success)result.immuneUntil=event.at+86400
  else {const fresh=newInfection(event.targetId,event.id,event.sourceId,event.id);result.afflictionId=fresh.record.id;result.incubation=fresh.incubation}
 }else{
  const record=gs.getState().dmTools!.afflictions!.records[event.afflictionId!],disease=record.cackleFever!
  if(event.kind==='stress'&&!save.success){
   startCrisis(record,event)
   const damageRoll=rollDice('1d10');selfDamage++
   try{result.damageRoll=damageRoll;result.damageResolution=gs.withPhysicalCreatureResolution([event.targetId],()=>dealDamage(event.targetId,damageRoll.total,'psychic',{damageEventId:event.id}))}finally{selfDamage--}
   result.crisis=disease.crisis
  }else if(event.kind==='repeat'&&save.success){crisisEnd(record);result.crisisEnded=true}
  else if(event.kind==='rest'){
   if(save.success){const reduction=rollDice('1d6');disease.dc=Math.max(0,disease.dc-reduction.total);result.reduction=reduction;result.newDC=disease.dc;if(disease.dc===0){endAffliction(record,'cured');result.cured=true}}
   else{disease.recoveryFailures++;result.cumulativeRecoveryFailures=disease.recoveryFailures
    if(disease.recoveryFailures===3){
     const source=readCackleMadnessSource(),roll=rollDice('1d100'),row=source.rows.find(row=>roll.total>=row.range[0]&&roll.total<=row.range[1])!
     const madness={afflictionId:record.id,targetId:record.targetId,at:now(),roll:roll as unknown as Record<string,unknown>,range:row.range,text:row.text,source:source.source,sourceMetadata:source.metadata}
     data().madness[record.id]=madness;result.indefiniteMadness=madness
    }
   }
  }
 }
 return remember(event,result)
 }finally{applyingEventId=previousApplying}
})}
export function validateHeldCackleSave(){
 const pending=gs.getState().hero?.pending,resolution=pending?.command.toolkitResolution as {domain?:string;command?:{eventId?:string}}|undefined
 if(resolution?.domain!=='cackle-fever')return
 const event=cackleStateOf(gs.getState())?.events[resolution.command?.eventId??'']
 if(!event||event.result||event.heldWitness!==witness(pending))toolkitError('CACKLE_HELD_SAVE_CHANGED','Retain the original exact Constitution save, source event, DC and pending d20 before any reaction die.')
 validateEvent(event)
}
export function registerCackleResolutions(){registerCheckedResolution('cackle-fever',(command,save)=>applyCackleSave(command,save as SavingThrowResult))}
export function inspectCackleFever(){const state=gs.getState();return{confidential:true,source:CACKLE_SOURCE,
 hosts:cackleStateOf(state)?.hosts??{},records:cackleRecords(state),events:cackleStateOf(state)?.events??{},
 dueEvent:cackleDueEvent(state)??null,indefiniteMadness:cackleStateOf(state)?.madness??{},
 limitations:['No initial player infection is granted by preparation. Humanoid/gnome qualification is explicit.','Indefinite madness is only its exact persistent roleplaying flaw; no forced player action. Its Greater Restoration cure is not implemented.','NPC rests and outside-combat synthetic turns are not created.']}}
export function validateCackleHistory(state:GameState){
 const issues:string[]=[],stored=cackleStateOf(state),time=state.worldTimeSeconds??0
 if(cackleRecords(state).length&&witness(stored?.source)!==witness(readCackleFeverSource()))issues.push('Retain the exact original supplied Cackle Fever and indefinite-madness book provenance.')
 for(const record of cackleRecords(state)){
  const disease=record.cackleFever,qualification=stored?.hosts[record.targetId]
  if(!disease||!qualification||qualification.input.actualGnome||record.appliedAt>time||record.sourceActorId===record.targetId)
   issues.push('Retain the original real susceptible Cackle Fever host and source disease progression.')
  if(disease&&record.status==='active'&&!record.petrificationPause&&!disease.onset&&record.nextAt===undefined)
   issues.push('Retain the actual original Cackle Fever incubation boundary.')
  if(disease){
   const seed=Object.values(stored?.seeds??{}).find(seed=>seed.afflictionId===record.id)
   const exposure=Object.values(stored?.events??{}).find(event=>event.kind==='contagion'&&event.result?.afflictionId===record.id)
   const incubation=(seed?.incubation??exposure?.result?.incubation) as {notation?:string;rolls?:number[];total?:number}|undefined
   const originalAt=seed?.at??exposure?.at
   if(seed&&(record.targetId!==seed.input.creatureId||record.sourceId!==seed.input.eventId||record.sourceActorId!==undefined||record.eventId!==seed.input.eventId)||exposure&&(record.targetId!==exposure.targetId||record.sourceId!==exposure.id||record.sourceActorId!==exposure.sourceId||record.eventId!==exposure.id)||record.id!==key('cackle',record.eventId)||record.creation!==witness({sourceId:record.sourceId,sourceActorId:record.sourceActorId,targetId:record.targetId,eventId:record.eventId}))issues.push('The actual infection retains its original carrier or NPC seed, never a replacement source or body.')
   if(!incubation||incubation.notation!=='1d4'||incubation.rolls?.length!==1||incubation.rolls[0]!==incubation.total||incubation.total!==disease.incubationHours||originalAt!==record.appliedAt
    ||record.nextAt!==undefined&&record.nextAt!==record.appliedAt+disease.incubationHours*3600+(disease.incubationSuspendedSeconds??0))
    issues.push('Retain the original source case or failed contagion and its exact single incubation die and clock.')
   const suspended=(disease.suspensions??[]).filter(pause=>pause.incubationActive).reduce((total,pause)=>total+pause.to-pause.from,0)
   if(suspended!==(disease.incubationSuspendedSeconds??0)||(disease.suspensions??[]).some(pause=>pause.to<pause.from||pause.to>time||pause.from<record.appliedAt))issues.push('Incubation suspension offsets retain only actual saved petrification intervals.')
   const recoveries=Object.values(stored?.events??{}).filter(event=>event.kind==='rest'&&event.afflictionId===record.id&&event.result?.save).sort((a,b)=>a.at-b.at)
   let expectedDC=13,failures=0
   for(const recovery of recoveries){
    const save=recovery.result!.save as unknown as SavingThrowResult
    if(recovery.dc!==expectedDC||save.dc!==recovery.dc||save.ability!=='con'||save.entityId!==record.targetId)issues.push('Recovery keeps its exact source Constitution DC before the one final original save.')
    if(save.success){const reduction=recovery.result!.reduction as {notation?:string;rolls?:number[];total?:number}|undefined
     if(!reduction||reduction.notation!=='1d6'||reduction.rolls?.length!==1||reduction.rolls[0]!==reduction.total||!Number.isInteger(reduction.total)||reduction.total!<1||reduction.total!>6)issues.push('A successful recovery retains one actual original d6 DC reduction.')
     else expectedDC=Math.max(0,expectedDC-reduction.total!)
    }else failures++
   }
   if(disease.dc!==expectedDC||disease.recoveryFailures!==failures)issues.push('Disease DC and cumulative recovery failures are derived only from their original completed rest saves.')
   if(disease.onset){const receipt=state.dmTools?.exhaustion?.receipts[disease.onset.exhaustionEventId]
    if(!receipt||receipt.targetId!==record.targetId||receipt.operation!=='add'||receipt.levels!==1||receipt.at<disease.onset.at||disease.onset.at<record.appliedAt+disease.incubationHours*3600)issues.push('The actual symptom onset keeps its one original exhaustion receipt after the true incubation.')}
   if(disease.crisis){const source=stored?.events[disease.crisis.id],original=source?.result?.crisis as typeof disease.crisis|undefined
    if((disease.suspensions??[]).filter(pause=>pause.crisisId===disease.crisis!.id).reduce((total,pause)=>total+pause.to-pause.from,0)!==(disease.crisis.suspendedSeconds??0))issues.push('The original crisis keeps only its actual saved petrification suspension duration.')
    if(!source||source.kind!=='stress'||source.afflictionId!==record.id||source.result?.success!==false||!original||original.dc!==disease.crisis.dc||original.startedAt!==disease.crisis.startedAt||original.effectId!==disease.crisis.effectId)issues.push('The crisis retains the original failed stress save, DC, actual start and exact condition effect.')}
  }
  if(disease?.onset&&exhaustionLevel(state,record.targetId)<1&&record.status==='active'&&cackleBodyAlive(state,record.targetId)&&!record.petrificationPause)
   issues.push('The actual symptomatic disease retains its protected exhaustion level until cured.')
  if(disease?.crisis&&(disease.crisis.endsAt!==disease.crisis.startedAt+60+(disease.crisis.suspendedSeconds??0)||disease.crisis.startedAt<record.appliedAt||disease.crisis.startedAt>time))
   issues.push('Retain the exact actual one-minute crisis and its original DC.')
 }
 for(const[id,entry]of Object.entries(stored?.hosts??{}))if(id!==entry.input.creatureId||entry.command!==witness({input:entry.input,at:entry.at,bodyType:entry.bodyType,fact:entry.fact})||entry.at>time)
  issues.push('Retain the original explicit humanoid/gnome qualification and its actual local fact.')
 for(const[id,entry]of Object.entries(stored?.seeds??{}))if(id!==entry.input.eventId||entry.input.creatureId==='player'||entry.command!==witness({input:entry.input,at:entry.at,afflictionId:entry.afflictionId,incubation:entry.incubation,fact:entry.fact})||!state.dmTools?.afflictions?.records[entry.afflictionId]||entry.at>time)
  issues.push('Retain the original actual new NPC source case and its one incubation die.')
 for(const[id,event]of Object.entries(stored?.events??{})){
  if(id!==event.id||event.sourceWitness!==witness(event.source)||event.at>time||event.result&&event.resultWitness!==witness(event.result)||event.input&&event.command!==witness(event.input))
   issues.push('Retain the original actual Cackle Fever event, source, argument and result witnesses.')
 if(event.kind==='rest'){if(Object.hasOwn(event.source,'npcRestId')){const rest=state.dmTools?.npcRests?.records[String(event.source.npcRestId)];if(!rest||rest.status!=='completed'||rest.input.npcId!==event.targetId||rest.endedAt!==event.at||rest.cackleEventId!==event.id)issues.push('An NPC Cackle Fever recovery requires its reciprocal actually completed long rest.')}else{const rest=state.dmTools?.rests?.receipts[String(event.source.restId)],link=rest?.result.cackleFeverEvent as {eventId?:string;afflictionId?:string}|undefined;if(!rest||rest.session.kind!=='long'||rest.completedAt!==event.at||link?.eventId!==event.id||link.afflictionId!==event.afflictionId)issues.push('A Cackle Fever recovery belongs only to its exact actually completed long rest and retained source link.')}}
  if(event.result?.immuneUntil!==undefined&&((event.result.save as {success?:boolean}|undefined)?.success!==true||event.result.immuneUntil!==event.at+86400))issues.push('Only the original successful contagion Constitution save grants24-hour per-carrier immunity.')
  if(event.heldWitness&&(!state.hero?.pending||event.heldWitness!==witness(state.hero.pending)||event.result))issues.push('Retain the exact original held Cackle Fever source save.')
 }
 for(const[afflictionId,madness]of Object.entries(stored?.madness??{})){
  const source=readCackleMadnessSource(),face=Number(madness.roll.total),row=source.rows.find(row=>face>=row.range[0]&&face<=row.range[1])
  const third=Object.values(stored?.events??{}).filter(event=>event.kind==='rest'&&event.afflictionId===afflictionId&&event.result?.success===false).sort((a,b)=>a.at-b.at)[2]
  if(afflictionId!==madness.afflictionId||!cackleRecords(state).some(record=>record.id===afflictionId&&record.targetId===madness.targetId&&(record.cackleFever?.recoveryFailures??0)>=3)||madness.at>time||madness.at!==third?.at
   ||witness(third?.result?.indefiniteMadness)!==witness(madness)||!row||witness(row.range)!==witness(madness.range)||row.text!==madness.text||source.source!==madness.source||witness(source.metadata)!==witness(madness.sourceMetadata)
   ||madness.roll.notation!=='1d100'||witness(madness.roll.rolls)!==witness([face]))issues.push('The exact source table flaw and d100 belong to the actual third cumulative failed Cackle Fever recovery.')
 }
 return [...new Set(issues)]
}


/** Death ends current laughter and voids outstanding consequences, never the
 * disease's original infection/incubation/history or an indefinite flaw. */
export function cackleActualDeath(targetId:string){inside(()=>{
 const state=gs.getState();if(cackleBodyAlive(state,targetId))return
 for(const record of cackleRecords(state).filter(record=>record.targetId===targetId))if(record.cackleFever?.crisis)crisisEnd(record)
 for(const event of Object.values(cackleStateOf(state)?.events??{}))if(event.targetId===targetId&&!event.result&&event.id!==applyingEventId){
  const pending=state.hero?.pending,resolution=pending?.command.toolkitResolution as {domain?:string;command?:{eventId?:string}}|undefined
  const originalPending=resolution?.domain==='cackle-fever'&&resolution.command?.eventId===event.id?structuredClone(pending):undefined
  if(originalPending)delete state.hero!.pending
  remember(event,{source:CACKLE_SOURCE,closedByActualDeath:true,diceRolled:false,at:now(),...originalPending?{originalPending}:{}})
 } 
})}
export function assertCackleMapDeparture(companions:readonly string[],transitionId?:string){
 const state=gs.getState()
 assertCackleEventsResolved()
 const stranded=cackleRecords(state).filter(record=>record.targetId!=='player'&&record.status==='active'&&cackleBodyAlive(state,record.targetId)&&!npcExplicitlyOffMap(state,record.targetId)&&!companions.includes(record.targetId)&&(!transitionId||!preparedNpcSeparation(record.targetId,transitionId)))
 if(stranded.length)toolkitError('CACKLE_OFF_MAP_HOST_UNSUPPORTED','This bounded illness procedure cannot abandon an active NPC case on another map. Declare its actual separation for this exact departure or use an already-authored companion transition; no NPC moves automatically.')
}

export function cackleOnsetRemediationAt(targetId:string){
 const event=cackleDueEvent(),record=event?.kind==='onset'?gs.getState().dmTools?.afflictions?.records[event.afflictionId]:undefined
 return record?.targetId===targetId&&exhaustionLevel(gs.getState(),targetId)===5&&hero().effects.some(effect=>effect.kind==='death-ward'&&effect.targetIds.includes(targetId)&&effect.expiresAt>now())?event!.at:undefined
}
