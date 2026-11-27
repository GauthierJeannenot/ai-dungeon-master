import { EncounterCadenceConfigureSchema,activeEncounterCadence,encounterCadenceStateOf,encounterCadenceWitness as witness,type EncounterCadenceState } from '../lib/encounter-cadence-state'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { toolkitState,toolkitError } from './toolkit'
import { readRandomEncounterCadenceSource } from './rules-library'
import * as gs from './game-state'
const data=():EncounterCadenceState=>toolkitState().randomEncounterCadence??={version:1,episodes:{},receipts:{}}
const now=()=>gs.getState().worldTimeSeconds??0
function scene(){const state=gs.getState(),mapId=state.currentMapId,roomId=state.currentRoomId;if(state.phase==='combat'||!mapId||!roomId||inferRoomIdOnMap(state.player.position,mapId,state)!==roomId)toolkitError('ENCOUNTER_CADENCE_SCENE_REQUIRED','Choose the actual outside-combat current map and room, without a fabricated journey or elapsed interval.');return{mapId:mapId!,roomId:roomId!}}
export function configureRandomEncounterCadence(raw:unknown){
 const input=EncounterCadenceConfigureSchema.parse(raw),state=gs.getState(),command=witness(input),old=encounterCadenceStateOf(state)?.receipts[input.eventId]
 if(old){if(old.command!==command)toolkitError('ENCOUNTER_CADENCE_EVENT_CONFLICT','Retain this exact original configuration command.');return{...structuredClone(old.result),replayed:true}}
 if(Object.keys(encounterCadenceStateOf(state)?.receipts??{}).length>=128)toolkitError('ENCOUNTER_CADENCE_HISTORY_LIMIT','Retain bounded original configuration history; no old cadence, due check or receipt is evicted.')
 if(input.operation==='start'){
  if(Object.keys(encounterCadenceStateOf(state)?.receipts??{}).length>=127)toolkitError('ENCOUNTER_CADENCE_HISTORY_LIMIT','Reserve the actual future stop receipt before starting another cadence.')
  if(Object.keys(state.dmTools?.randomEncounters?.checks??{}).length>=512)toolkitError('ENCOUNTER_CHECK_LIMIT','A new cadence requires real source occurrence-check capacity before adoption.')
  if(!input.start)toolkitError('ENCOUNTER_CADENCE_ADOPTION_REQUIRED','Explicitly select the actual map environment, fact, whole-map scope and printed interval.')
  if(activeEncounterCadence(state))toolkitError('ENCOUNTER_CADENCE_ALREADY_ACTIVE','Resolve and explicitly stop the existing actual cadence before adopting another; a new nonce cannot reset it.')
  if(encounterCadenceStateOf(state)?.episodes[input.cadenceId])toolkitError('ENCOUNTER_CADENCE_ID_REUSED','A stopped or retained cadence id is never rebased or reused.')
  if(Object.keys(encounterCadenceStateOf(state)?.episodes??{}).length>=64)toolkitError('ENCOUNTER_CADENCE_HISTORY_LIMIT','Retain all original campaign cadence periods.')
  const here=scene(),fact=state.worldFacts?.find(f=>f.id===input.start!.factId)
  if(!fact||fact.source!=='record_scene_fact'||fact.expires!=='never'||fact.mapId!==here.mapId||fact.roomId!==here.roomId)toolkitError('ENCOUNTER_CADENCE_MAP_FACT_REQUIRED','Choose the actual durable current-map observation explicitly qualifying this whole-map wilderness/dungeon scope; no name or prose is classified.')
  const source=readRandomEncounterCadenceSource(),at=now(),episode={id:input.cadenceId,input,command,at,mapId:here.mapId,adventureId:state.adventureId!,fact:structuredClone(fact) as unknown as Record<string,unknown>,source,intervalSeconds:input.start!.intervalHours*3600,nextIndex:1,nextAt:at+input.start!.intervalHours*3600,checkIds:[],status:'active' as const}
  data().episodes[episode.id]=episode;data().activeId=episode.id
  const result={success:true,operation:'start',cadenceId:episode.id,adoptedAt:at,firstDueAt:episode.nextAt,source,intervalSeconds:episode.intervalSeconds,clock:'actual-world-time',diceRolled:false,sceneCreated:false}
  data().receipts[input.eventId]={input,command,at,result,resultWitness:witness(result)};return result
 }
 if(input.start)toolkitError('ENCOUNTER_CADENCE_STOP_ARGUMENT','Stopping does not rewrite the original source, scope or interval.')
 const episode=activeEncounterCadence(state);if(!episode||episode.id!==input.cadenceId)toolkitError('ENCOUNTER_CADENCE_ACTIVE_REQUIRED','Choose this actual current active cadence.')
 if(now()>=episode!.nextAt)toolkitError('ENCOUNTER_CADENCE_CHECK_DUE','Stopping cannot erase the source occurrence check already due; resolve it explicitly with its cadenceId first.')
 episode!.status='stopped';episode!.stoppedAt=now();episode!.stopEventId=input.eventId;delete data().activeId
 const result={success:true,operation:'stop',cadenceId:episode!.id,stoppedAt:now(),retainedNextAt:episode!.nextAt,checkIds:[...episode!.checkIds],diceRolled:false,elapsedSeconds:0}
 data().receipts[input.eventId]={input,command,at:now(),result,resultWitness:witness(result)};return result
}
export function prepareEncounterCadenceCheck(cadenceId?:string){
 const state=gs.getState(),episode=activeEncounterCadence(state)
 if(!cadenceId){if(episode&&now()>=episode.nextAt)toolkitError('ENCOUNTER_CADENCE_ID_REQUIRED','This actual due checkpoint needs its explicit cadenceId; a generic extra check cannot silently fill or replace it.');return undefined}
 if(!episode||episode.id!==cadenceId)toolkitError('ENCOUNTER_CADENCE_ACTIVE_REQUIRED','Choose the original actual active cadence.')
 scene();if(episode!.mapId!==state.currentMapId||now()!==episode!.nextAt)toolkitError('ENCOUNTER_CADENCE_CHECK_NOT_DUE','A cadence occurrence check belongs only to its exact current world-time boundary, never a previous or future interval.')
 const source=readRandomEncounterCadenceSource();if(witness(source)!==witness(episode!.source))toolkitError('ENCOUNTER_CADENCE_SOURCE_CHANGED','Retain the original exact supplied DMG frequency and threshold source before the occurrence die.')
 return{id:episode!.id,index:episode!.nextIndex,dueAt:episode!.nextAt}
}
export function commitEncounterCadenceCheck(checkId:string,link:ReturnType<typeof prepareEncounterCadenceCheck>){if(!link)return;const e=data().episodes[link.id];e.checkIds.push(checkId);e.nextIndex++;e.nextAt=e.at+e.nextIndex*e.intervalSeconds}
export function inspectRandomEncounterCadence(){const state=gs.getState(),episode=activeEncounterCadence(state);return{confidentialMjReference:true,worldTimeSeconds:now(),active:episode??null,history:encounterCadenceStateOf(state)??null,checkDue:Boolean(episode&&now()===episode.nextAt),notice:'Explicit optional campaign cadence only. No occurrence die, table draw, creature, scene, turn or elapsed interval is created. Stop before combat/map departure; an already due checkpoint cannot be stopped away.'}}
