import { adventuringDayXpReference,EncounterBudgetError } from '../lib/encounter-budget'
import type { GameState } from '../lib/types'
import type { CampaignEngagement } from '../lib/campaign-outcome-state'
import { getAdventureMap,getEncounter,firstMapId,inferRoomIdOnMap } from '../lib/adventure-map'
import { getMonsterRecord } from '../lib/srd/monsters'
import { observeCycleParty,CyclePartyObservationError } from '../lib/adventuring-cycle-party'
import { calculateInitialPartyReference } from '../lib/adventuring-cycle-math'
import { OpenAdventuringCycleSchema,QualifyCycleEncounterSchema,RecordCycleEncounterSchema,CloseAdventuringCycleSchema,
 ADVENTURING_CYCLE_SOURCE,cycleStateOf,cycleWitness as witness,sealCycleRecord,cycleMarkerKey,cyclePresenceWitness,latestCycleQualification,completedCycleRestReferences,
 type AdventuringCycleState,type CyclePartyMember } from '../lib/adventuring-cycle-state'
import { available,now } from './hero-rules'
import { readDmgAdventuringCycleSource } from './rules-library'
import { toolkitState,toolkitError } from './toolkit'
import * as gs from './game-state'
const data=():AdventuringCycleState=>toolkitState().adventuringCycles??={version:1,source:ADVENTURING_CYCLE_SOURCE,cycles:{},qualifications:{},bindings:{},entries:{},closes:{}}
const own=<T>(record:Record<string,T>|undefined,id:string)=>record&&Object.hasOwn(record,id)?record[id]:undefined
function mark(kind:Parameters<typeof cycleMarkerKey>[0],id:string,value:{witness:string}){(gs.getState().adventuringCycleEvents??={})[cycleMarkerKey(kind,id)]=value.witness}
function observe(s:GameState,mapId=s.currentMapId??firstMapId(s),roomId=s.currentRoomId){try{return observeCycleParty(s,mapId,roomId)}catch(e){if(e instanceof CyclePartyObservationError)toolkitError(e.code,e.message);throw e}}
function resources(s:GameState){return{playerId:'player',at:s.worldTimeSeconds??0,mapId:s.currentMapId,phase:s.phase,
 player:structuredClone({id:s.player.id,level:s.player.level,hp:s.player.hp,conditions:s.player.conditions,spellSlots:s.player.spellSlots,resources:s.player.resources}),hitDice:structuredClone(s.hero?.hitDice)}}
function active(cycleId?:string){const d=cycleStateOf(gs.getState()),id=cycleId??d?.activeCycleId,o=id?own(d?.cycles,id):undefined;if(!id||!o||d?.activeCycleId!==id||own(d?.closes,id))toolkitError('ADVENTURING_CYCLE_OPEN_REQUIRED','Choose the one explicitly open real cycle; no old day or automatic reset is created.');return{id:id!,open:o!}}
function outside(){if(gs.getState().phase!=='exploration')toolkitError('ADVENTURING_CYCLE_OUTSIDE_COMBAT','Open, record a closed issue or close this cycle outside combat. Prospective MJ wave qualification remains separate.')}
function newEngagementIds(s:GameState,cycleId:string){const o=cycleStateOf(s)!.cycles[cycleId];return Object.values(s.dmTools?.campaignOutcomes?.engagements??{}).filter(e=>!o.baselineEngagementIds.includes(e.id)&&e.recordedAt>=o.at).sort((a,b)=>a.recordedAt-b.recordedAt||a.id.localeCompare(b.id)).map(e=>e.id)}
function recordedIds(s:GameState,cycleId:string){return new Set(Object.values(cycleStateOf(s)?.entries??{}).filter(e=>e.input.cycleId===cycleId).map(e=>e.input.engagementId))}
export function openAdventuringCycle(raw:unknown){
 const input=OpenAdventuringCycleSchema.parse(raw),command=witness(input),old=own(cycleStateOf(gs.getState())?.cycles,input.cycleId)
 if(old){if(old.command!==command)toolkitError('ADVENTURING_CYCLE_ID_CONFLICT','Retain the exact original cycle opening.');return{success:true,replayed:true,cycle:old,resourcesGranted:false}}
 available();outside();readDmgAdventuringCycleSource();const s=gs.getState()
 if(cycleStateOf(s)?.activeCycleId)toolkitError('ADVENTURING_CYCLE_ALREADY_OPEN','Explicitly close the existing real cycle; midnight and rests never clear it.')
 if(Object.keys(cycleStateOf(s)?.cycles??{}).length>=128)toolkitError('ADVENTURING_CYCLE_HISTORY_LIMIT','Retain the128 original cycles without eviction.')
 const opened=sealCycleRecord({input,command,at:now(),mapId:s.currentMapId??firstMapId(s),combatGeneration:s.combatGeneration??0,
 baselineEngagementIds:Object.keys(s.dmTools?.campaignOutcomes?.engagements??{}).sort(),baselineRestKeys:completedCycleRestReferences(s).map(r=>r.key),resources:resources(s)})
 data().cycles[input.cycleId]=opened;data().activeCycleId=input.cycleId;mark('open',input.cycleId,opened)
 return{success:true,replayed:false,cycle:opened,seconds:0,resourcesGranted:false,xpAward:null}
}
export function qualifyCycleEncounter(raw:unknown){
 const input=QualifyCycleEncounterSchema.parse(raw),command=witness(input),old=own(cycleStateOf(gs.getState())?.qualifications,input.eventId)
 if(old){if(old.command!==command)toolkitError('ADVENTURING_CYCLE_QUALIFICATION_CONFLICT','Retain the exact original prospective presence choice.');return{success:true,replayed:true,qualification:old}}
 available();readDmgAdventuringCycleSource();active(input.cycleId);const s=gs.getState();if(s.phase!=='exploration'&&s.phase!=='combat')toolkitError('ADVENTURING_CYCLE_PHASE_UNSUPPORTED','Use an actual exploration or combat source scene, not an unresolved legacy dialogue phase.');const preset=getEncounter(input.encounterId,s),map=getMapSpecForEncounter(s,input.encounterId)
 if(!preset||map!==s.currentMapId||preset.roomId!==s.currentRoomId||s.encountersTriggered?.includes(input.encounterId))toolkitError('ADVENTURING_CYCLE_PROSPECTIVE_SCENE_REQUIRED','Qualify the real current encounter room before its actual first start, not after closure or on a different map.')
 const fact=s.worldFacts?.find(f=>f.id===input.factId&&f.source==='record_scene_fact'&&f.expires==='never'&&f.mapId===s.currentMapId&&f.roomId===s.currentRoomId&&f.narrativeEffect?.cell.x===s.player.position.x&&f.narrativeEffect.cell.y===s.player.position.y)
 if(!fact)toolkitError('ADVENTURING_CYCLE_PRESENCE_FACT_REQUIRED','Retain the explicit durable current-scene MJ observation before the encounter. No party member is inferred from prose.')
 const observed=observe(s),present=observed.members.filter(m=>m.scope==='present').map(m=>m.npcId).sort(),off=observed.members.filter(m=>m.scope==='off_scene').map(m=>m.npcId).sort()
 if(witness(input.presentNpcIds.slice().sort())!==witness(present)||witness(input.offSceneNpcIds.slice().sort())!==witness(off))toolkitError('ADVENTURING_CYCLE_PARTY_PARTITION_REQUIRED','Choose every actual living declared party body exactly once as physically present or off-scene. Civilian status never removes a present share.')
 if(Object.keys(cycleStateOf(s)?.qualifications??{}).length>=256)toolkitError('ADVENTURING_CYCLE_QUALIFICATION_LIMIT','Retain the prospective qualifications without eviction.')
 const q=sealCycleRecord({input,command,at:now(),mapId:s.currentMapId!,roomId:s.currentRoomId,combatGeneration:s.combatGeneration??0,phase:s.phase as 'exploration'|'combat',sequence:Object.keys(data().qualifications).length,
 ...observed,fact:structuredClone(fact) as unknown as Record<string,unknown>,presenceWitness:cyclePresenceWitness(observed.members,observed.deceasedNpcIds)})
 data().qualifications[input.eventId]=q;mark('qualification',input.eventId,q)
 return{success:true,replayed:false,qualification:q,actionsGranted:false,seconds:0,xpAward:null}
}
function getMapSpecForEncounter(s:GameState,id:string){const e=getEncounter(id,s);return e?.roomId?getAdventureMap(s).rooms.find(r=>r.id===e.roomId)?.mapId??firstMapId(s):undefined}
export interface AdventuringCycleStartPlan {cycleId:string;qualificationId:string;members:CyclePartyMember[];player:Record<string,unknown>}
/** Pure source admission, called by P1 before any movement/spawn/initiative. */
export function preflightAdventuringCycleStart(s:GameState,encounterId:string):AdventuringCycleStartPlan|undefined{
 const d=cycleStateOf(s),id=d?.activeCycleId;if(!id)return
 readDmgAdventuringCycleSource();const q=latestCycleQualification(s,id,encounterId),preset=getEncounter(encounterId,s),observed=observe(s,s.currentMapId,preset?.roomId??s.currentRoomId)
 if(!q||q.combatGeneration!==(s.combatGeneration??0)||q.phase!==s.phase||q.mapId!==s.currentMapId||q.roomId!==s.currentRoomId||q.presenceWitness!==cyclePresenceWitness(observed.members,observed.deceasedNpcIds)
  ||!s.worldFacts?.some(f=>f.id===q.input.factId&&witness(f)===witness(q.fact)))toolkitError('ADVENTURING_CYCLE_PARTY_REQUALIFICATION_REQUIRED','Explicitly qualify this exact real party/scene before its first cost or die; no absent or stale NPC presence is backfilled.')
 if(Object.keys(d!.bindings).length>=128)toolkitError('ADVENTURING_CYCLE_BINDING_LIMIT','Retain the actual128 source bindings before another start.')
 return{cycleId:id,qualificationId:q!.input.eventId,members:structuredClone(observed.members),player:structuredClone(s.player) as unknown as Record<string,unknown>}
}
/** The same admitted synchronous engine call supplies the real P1 identity.
 * No game tool, new body selection, die or possible admission follows here. */
export function commitAdventuringCycleStart(s:GameState,e:CampaignEngagement,plan:AdventuringCycleStartPlan|undefined){
 if(!plan)return
 const b=sealCycleRecord({cycleId:plan.cycleId,qualificationId:plan.qualificationId,engagementId:e.id,at:e.recordedAt,engagementWitness:e.witness,
 members:plan.members,player:structuredClone(e.combatants.find(c=>c.actorId==='player')?.body??plan.player)})
 data().bindings[e.id]=b;mark('binding',e.id,b)
}
function reference(...args:Parameters<typeof calculateInitialPartyReference>){try{return calculateInitialPartyReference(...args)}catch(error){if(error instanceof EncounterBudgetError)toolkitError(error.code,error.message);throw error}}
export function recordCycleEncounter(raw:unknown){
 const input=RecordCycleEncounterSchema.parse(raw),command=witness(input),old=own(cycleStateOf(gs.getState())?.entries,input.eventId)
 if(old){if(old.command!==command)toolkitError('ADVENTURING_CYCLE_ENTRY_CONFLICT','Retain the exact original closed issue and source multiplier decisions.');return{success:true,replayed:true,entry:old,xpAward:null}}
 available();outside();readDmgAdventuringCycleSource();const{open}=active(input.cycleId),s=gs.getState(),d=cycleStateOf(s)!,binding=own(d.bindings,input.engagementId),e=own(s.dmTools?.campaignOutcomes?.engagements,input.engagementId)
 const c=e?Object.values(s.dmTools?.campaignOutcomes?.closures??{}).find(c=>c.engagementId===e.id):undefined,out=c?Object.values(s.dmTools?.campaignOutcomes?.outcomes??{}).find(o=>o.closureId===c.id):undefined
 if(!binding||binding.cycleId!==input.cycleId||!e||!c||!out||e.origin!=='actual_start'||open.baselineEngagementIds.includes(e.id))toolkitError('ADVENTURING_CYCLE_ACTUAL_CLOSED_ISSUE_REQUIRED','Choose the exact bound P1 actual start, closure and explicit outcome in this cycle; no past or merely engaged encounter is invented.')
 if(Object.values(d.entries).some(r=>r.input.engagementId===input.engagementId))toolkitError('ADVENTURING_CYCLE_ENGAGEMENT_ALREADY_RECORDED','The same actual engagement cannot spend another reference budget under a new nonce.')
 if(Object.keys(d.entries).length>=128)toolkitError('ADVENTURING_CYCLE_ENTRY_LIMIT','Retain original entries without eviction.')
 const opponents=e!.participants.filter(p=>p.hostile!==false),ids=input.opponents.map(p=>p.actorId)
 if(new Set(ids).size!==ids.length||witness(ids.slice().sort())!==witness(opponents.map(p=>p.actorId).sort()))toolkitError('ADVENTURING_CYCLE_OPPOSITION_REQUIRED','Select each exact original actual opponent once; excluded weak monsters still retain their full source XP.')
 const rows=opponents.map(p=>{const source=getMonsterRecord(p.sourceType);if(!source)toolkitError('ADVENTURING_CYCLE_SOURCE_TYPE_REQUIRED','No published source XP is invented for an unregistered opposition type.');return{count:1,xpEach:source!.engine.xpValue,countsForMultiplier:input.opponents.find(row=>row.actorId===p.actorId)!.countsForMultiplier}})
 const assessment=reference(Number(binding!.player.level),rows,binding!.members.filter(m=>m.scope==='present').map(m=>({actorId:m.npcId,shareUnits:m.shareUnits,namedMemberIds:m.namedMemberIds,survivingIdentitiesIndeterminate:m.survivingIdentitiesIndeterminate})))
 const r=sealCycleRecord({input,command,at:now(),closureId:c!.id,outcomeId:out!.id,engagementWitness:e!.witness,closureWitness:c!.witness,outcomeWitness:out!.witness,
 assessment:structuredClone(assessment) as unknown as Record<string,unknown>,closurePlayer:structuredClone(c!.player),currentResources:resources(s)})
 d.entries[input.eventId]=r;mark('entry',input.eventId,r)
 return{success:true,replayed:false,entry:r,xpAward:null,seconds:0,resourcesGranted:false,notice:'Initial actual party reference only. Every present civilian/group member has a full informational share; no earned XP, level, victory, rest or progression is granted.'}
}
function summarize(s:GameState,cycleId:string,missing:readonly string[]){
 const entries=Object.values(cycleStateOf(s)?.entries??{}).filter(r=>r.input.cycleId===cycleId),rawXP=entries.reduce((n,r)=>n+Number(r.assessment.rawXP),0),adjustedXP=entries.reduce((n,r)=>n+Number(r.assessment.adjustedXP),0)
 const unknown=entries.some(r=>r.assessment.thresholds===null),o=cycleStateOf(s)!.cycles[cycleId]
 return{recordedEncounters:entries.length,rawXP,adjustedXP,coverageComplete:missing.length===0,unrecordedEngagementIds:[...missing],partyBudgetDeterminate:entries.length>0&&!unknown&&missing.length===0,
 initialSoloDailyReference:adventuringDayXpReference(Number((o.resources.player as{level:number}).level)),
 sourceGuidance:'DMG6–8 medium/hard and roughly2short rests are rough references, not compulsory counts, automatic rests or capacity limits. Different party compositions/real long rests require explicit interpretation.',xpAward:null,resourcesGranted:false}
}
export function closeAdventuringCycle(raw:unknown){
 const input=CloseAdventuringCycleSchema.parse(raw),command=witness(input),old=own(cycleStateOf(gs.getState())?.closes,input.cycleId)
 if(old){if(old.command!==command)toolkitError('ADVENTURING_CYCLE_CLOSE_CONFLICT','Retain the exact actual close and incomplete-history choices.');return{success:true,replayed:true,close:old,xpAward:null}}
 available();outside();readDmgAdventuringCycleSource();const{open}=active(input.cycleId),s=gs.getState(),known=newEngagementIds(s,input.cycleId),recorded=recordedIds(s,input.cycleId),missing=known.filter(id=>!recorded.has(id)),omitted=input.omittedEngagements??[]
 if(witness(omitted.map(x=>x.engagementId).sort())!==witness(missing.slice().sort())||missing.length&&!input.allowIncomplete)toolkitError('ADVENTURING_CYCLE_UNRECORDED_ISSUES','Record every exact tracked engagement, or explicitly allowIncomplete with exactly those IDs and individual reasons; no success is inferred.')
 const rests=completedCycleRestReferences(s).filter(r=>!open.baselineRestKeys.includes(r.key)&&r.completedAt>=open.at&&r.completedAt<=now()),c=sealCycleRecord({input,command,at:now(),knownEngagementIds:known,missingEngagementIds:missing,rests,resources:resources(s),summary:summarize(s,input.cycleId,missing)})
 data().closes[input.cycleId]=c;delete data().activeCycleId;mark('close',input.cycleId,c)
 return{success:true,replayed:false,close:c,xpAward:null,seconds:0,resourcesGranted:false}
}
export function inspectAdventuringCycles(cycleId?:string){
 readDmgAdventuringCycleSource();const s=gs.getState(),d=cycleStateOf(s),id=cycleId??d?.activeCycleId,o=id?own(d?.cycles,id):undefined,c=id?own(d?.closes,id):undefined,known=o?(c?.knownEngagementIds??newEngagementIds(s,id!)):[],recorded=id?recordedIds(s,id):new Set<string>(),missing=known.filter(key=>!recorded.has(key))
 return{readOnly:true,source:ADVENTURING_CYCLE_SOURCE,activeCycleId:d?.activeCycleId??null,cycle:o??null,close:c??null,qualifications:id?Object.values(d?.qualifications??{}).filter(q=>q.input.cycleId===id):[],
 bindings:id?Object.values(d?.bindings??{}).filter(b=>b.cycleId===id):[],entries:id?Object.values(d?.entries??{}).filter(e=>e.input.cycleId===id):[],unrecordedEngagementIds:missing,
 rests:o?(c?.rests??completedCycleRestReferences(s).filter(r=>!o.baselineRestKeys.includes(r.key)&&r.completedAt>=o.at)):[],summary:o?summarize(s,id!,missing):null,
 scope:'P1 actual authored starts with prior explicit party qualification, not retrospective NPC participation or manual untracked combats.',xpAward:null,diceRolled:false,resourcesGranted:false}
}
