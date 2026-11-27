import { prepareEncounterCadenceCheck,commitEncounterCadenceCheck } from './encounter-cadence'
import type { RandomEncounterState } from '../lib/random-encounter-state'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { ACTIVE_ADVENTURE_ID } from './adventure'
import { rollDice } from './dice'
import { readRollableTable,RulesLookupError } from './rules-library'
import { rollSourceTableDice } from './source-table-dice'
import { readCampaignEncounterTable } from './random-encounter-tables'
import { toolkitError,toolkitState } from './toolkit'
import * as gs from './game-state'

interface CheckInput{checkId:string;method:'d20'|'dm_occurrence'|'dm_no_occurrence';reason:string;cadenceId?:string}
interface DrawInput{checkId:string;drawId:string;tableId:string;dieColumn?:number;
  reroll?:{previousDrawId:string;contextIncompatibleConfirmed:true;reason:string}}
function ledger():RandomEncounterState{return toolkitState().randomEncounters??={version:1,checks:{},draws:{}}}
function currentScene(){
 const state=gs.getState(),mapId=state.currentMapId,roomId=state.currentRoomId
 if(!mapId||!roomId||inferRoomIdOnMap(state.player.position,mapId,state)!==roomId)
  toolkitError('ENCOUNTER_SCENE_REQUIRED','Use the actual current map, player position and room; no scene or journey is invented.')
 return{adventureId:state.adventureId??ACTIVE_ADVENTURE_ID,mapId:mapId!,roomId:roomId!,at:state.worldTimeSeconds??0}
}
function checkResult(record:RandomEncounterState['checks'][string]){
 const {command:_command,...reference}=structuredClone(record)
 return{kind:'random_encounter_check',...reference,notice:'MJ occurrence/reference only. No actor, combat, elapsed interval, action, resource or discovery created. The model must explicitly select any later scene tools.'}
}
function selectedTable(input:DrawInput){
 if(input.tableId.startsWith('campaign:'))return readCampaignEncounterTable(input.tableId,input.dieColumn??0)
 try{return readRollableTable(input.tableId,input.dieColumn??0)}catch(error){
  if(error instanceof RulesLookupError)toolkitError(error.code,error.message)
  throw error
 }
}
export function checkRandomEncounter(input:CheckInput){
 const command=JSON.stringify([input.method,input.reason,...input.cadenceId?[input.cadenceId]:[]]),old=gs.getState().dmTools?.randomEncounters?.checks[input.checkId]
 if(old){if(old.command!==command)toolkitError('ENCOUNTER_CHECK_CONFLICT','Keep the exact original check method and reason. A retry never replaces its die or decision.');return{...checkResult(old),replayed:true}}
 const cadence=prepareEncounterCadenceCheck(input.cadenceId),scene=currentScene(),data=gs.getState().dmTools?.randomEncounters
 if(Object.keys(data?.checks??{}).length>=512)toolkitError('ENCOUNTER_CHECK_LIMIT','The retained actual check history is full before any new die; no old receipt is evicted.')
 const roll=input.method==='d20'?rollDice('1d20'):undefined
 const record={id:input.checkId,command,method:input.method,reason:input.reason,...scene,
  occurs:roll?roll.total>=18:input.method==='dm_occurrence',...roll?{roll}:{},...cadence?{cadence}:{}}
 ledger().checks[input.checkId]=record;commitEncounterCadenceCheck(input.checkId,cadence);return checkResult(record)
}
export function drawRandomEncounter(input:DrawInput){
 const command=JSON.stringify([input.checkId,input.tableId,input.dieColumn??0,input.reroll?.previousDrawId??null,input.reroll?.reason??null])
 const state=gs.getState(),data=state.dmTools?.randomEncounters,old=data?.draws[input.drawId]
 if(old){if(old.command!==command)toolkitError('ENCOUNTER_DRAW_CONFLICT','Keep the exact original check, table, column and contextual reroll.');return{...structuredClone(old.result),replayed:true}}
 const check=data?.checks[input.checkId]
 if(!check?.occurs)toolkitError('ENCOUNTER_NOT_DUE','Choose an actual occurrence check, not an absent check or a no-encounter result.')
 const scene=currentScene()
 if(check!.mapId!==scene.mapId||check!.roomId!==scene.roomId)
  toolkitError('ENCOUNTER_SCENE_CHANGED','This check belongs to another actual scene. Inspect its retained history; do not draw a new encounter there retroactively.')
 const previous=check!.latestDrawId?data!.draws[check!.latestDrawId]:undefined
 if(previous?!input.reroll||input.reroll.previousDrawId!==previous.id:input.reroll!==undefined)
  toolkitError('ENCOUNTER_REROLL_CONTEXT_REQUIRED','A further draw must explicitly name the latest same-check draw and the actual incompatible circumstance; a first draw has no prior result.')
 if(Object.keys(data?.draws??{}).length>=1024)toolkitError('ENCOUNTER_DRAW_LIMIT','The retained actual draw history is full before dice; no source result is evicted.')
 const {rows,...table}=selectedTable(input)
 const roll=rollSourceTableDice(table.dice),row=rows.find(value=>value.low<=roll.total&&roll.total<=value.high)!
 const sequence=(previous?.sequence??0)+1
 const result={kind:'random_encounter_draw',checkId:input.checkId,drawId:input.drawId,sequence,dieColumn:input.dieColumn??0,...table,roll,row,
  ...input.reroll?{previousDrawId:input.reroll.previousDrawId,rerollReason:input.reroll.reason}:{},
  notice:'One actual source row, for MJ interpretation only. No nested quantity, creature, hostility, clue, reward, discovery or combat is created. Unsupported source creatures/powers remain documentary.'}
 const record={id:input.drawId,checkId:input.checkId,command,at:scene.at,sequence,
  ...input.reroll?{previousDrawId:input.reroll.previousDrawId,rerollReason:input.reroll.reason}:{},result}
 ledger().draws[input.drawId]=record;check!.latestDrawId=input.drawId;return result
}
export function inspectRandomEncounters(input:{checkId?:string;view:'checks'|'draws';offset:number;limit:number}){
 const {checkId,view,offset,limit}=input
 const data=gs.getState().dmTools?.randomEncounters
 if(checkId&&!data?.checks[checkId])toolkitError('ENCOUNTER_CHECK_REQUIRED','Choose an actual retained encounter check.')
 const records=view==='checks'
  ?Object.values(data?.checks??{}).filter(check=>!checkId||check.id===checkId).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id)).map(checkResult)
  :Object.values(data?.draws??{}).filter(draw=>!checkId||draw.checkId===checkId).sort((a,b)=>a.at-b.at||a.checkId.localeCompare(b.checkId)||a.sequence-b.sequence).map(draw=>({...structuredClone(draw.result),at:draw.at}))
 if(offset>records.length)toolkitError('ENCOUNTER_HISTORY_OFFSET','Choose an offset within the actual retained history.')
 return{confidentialMjReference:true,view,totalMatches:records.length,offset,nextOffset:offset+limit<records.length?offset+limit:null,results:records.slice(offset,offset+limit),
  notice:'Reference only. No encounter frequency, creature, scene, action, time or discovery is activated.'}
}
