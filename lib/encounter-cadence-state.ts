import { z } from 'zod'
import type { GameState } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
const Id=z.string().min(1).max(100).refine(value=>!['__proto__','prototype','constructor'].includes(value))
const Value=z.record(z.string(),z.unknown()),Time=z.number().int().nonnegative()
export const ENCOUNTER_CADENCE_SOURCE={book:'dmg-2014',sha256:'fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1',startLine:3157,endLine:3168} as const
export const EncounterCadenceConfigureSchema=z.object({eventId:Id,cadenceId:Id,operation:z.enum(['start','stop']),reason:z.string().trim().min(1).max(1000),
 start:z.object({factId:Id,environment:z.enum(['wilderness','dungeon']),intervalHours:z.union([z.literal(1),z.literal(4),z.literal(5),z.literal(6),z.literal(7),z.literal(8)]),actualMapScopeConfirmed:z.literal(true)}).strict().optional()}).strict()
export const EncounterCadenceCheckLinkSchema=z.object({id:Id,index:z.number().int().positive(),dueAt:Time}).strict()
const Episode=z.object({id:Id,input:EncounterCadenceConfigureSchema,command:z.string(),at:Time,mapId:Id,adventureId:Id,fact:Value,source:Value,
 intervalSeconds:z.number().int().positive(),nextIndex:z.number().int().positive(),nextAt:Time,checkIds:z.array(Id).max(512),status:z.enum(['active','stopped']),stoppedAt:Time.optional(),stopEventId:Id.optional()}).strict()
export const EncounterCadenceStateSchema=z.object({version:z.literal(1),activeId:Id.optional(),episodes:z.record(z.string(),Episode),
 receipts:z.record(z.string(),z.object({input:EncounterCadenceConfigureSchema,command:z.string(),at:Time,result:Value,resultWitness:z.string()}).strict())}).strict()
export type EncounterCadenceState=z.infer<typeof EncounterCadenceStateSchema>
export type EncounterCadenceInput=z.infer<typeof EncounterCadenceConfigureSchema>
export const encounterCadenceWitness=witness
export const encounterCadenceStateOf=(state:GameState)=>state.dmTools?.randomEncounterCadence
export const activeEncounterCadence=(state:GameState)=>{const data=encounterCadenceStateOf(state);return data?.activeId?data.episodes[data.activeId]:undefined}
export function encounterCadenceTimeIssue(state:GameState,seconds:number){
 const e=activeEncounterCadence(state);if(!e||seconds<=0)return null
 const at=state.worldTimeSeconds??0
 if(e.mapId!==state.currentMapId||state.phase==='combat')return{code:'ENCOUNTER_CADENCE_CONTEXT_CHANGED',message:'Retain the actual adopted outside-combat map cadence; no off-map or combat checkpoint is invented.'}
 if(at>=e.nextAt)return{code:'ENCOUNTER_CADENCE_CHECK_DUE',message:'Resolve the original due cadence with check_random_encounter and its cadenceId before more fictional time.',cadenceId:e.id,dueAt:e.nextAt}
 if(at+seconds>=e.nextAt&&Object.keys(state.dmTools?.randomEncounters?.checks??{}).length>=512)return{code:'ENCOUNTER_CHECK_LIMIT',message:'Retain check capacity before reaching this future boundary, or explicitly stop the cadence while its next event is still future.'}
 if(at+seconds>e.nextAt)return{code:'ENCOUNTER_CADENCE_BOUNDARY',message:'Advance only to the exact adopted encounter-check boundary before any work, cost or elapsed interval; no automatic check or partial effort is invented.',cadenceId:e.id,dueAt:e.nextAt}
 return null
}
export function encounterCadenceTransitionIssue(state:GameState){const e=activeEncounterCadence(state);return e?{code:'ENCOUNTER_CADENCE_ACTIVE',message:'Explicitly stop this outside-combat current-map cadence before combat or map departure; first resolve any actually due check.',cadenceId:e.id}:null}
export function protectedEncounterCadenceFactIds(state:GameState){const e=activeEncounterCadence(state);return e?.input.start?[e.input.start.factId]:[]}
export function encounterCadenceStateIssues(state:GameState,expectedAdventureId:string){
 const data=encounterCadenceStateOf(state);if(!data)return Object.values(state.dmTools?.randomEncounters?.checks??{}).some(check=>check.cadence)?['Cadence-linked occurrence checks retain their original adoption and ordered history.']:[]
 if(!EncounterCadenceStateSchema.safeParse(data).success)return['Invalid retained encounter cadence schema.']
 const issues:string[]=[],at=state.worldTimeSeconds??0,active=Object.values(data.episodes).filter(e=>e.status==='active')
 if(Object.keys(data.episodes).length>64||Object.keys(data.receipts).length>128||active.length!==(data.activeId?1:0)||data.activeId&&active[0]?.id!==data.activeId)issues.push('Retain one bounded explicitly active cadence and all original configuration receipts.')
 for(const[id,e]of Object.entries(data.episodes)){
  const start=e.input.start,receipt=data.receipts[e.input.eventId]
  if(e.id!==id||e.input.operation!=='start'||e.input.cadenceId!==id||!start||e.command!==witness(e.input)||receipt?.command!==e.command||e.at>at||e.adventureId!==expectedAdventureId||e.intervalSeconds!==start?.intervalHours!*3600||e.nextIndex!==e.checkIds.length+1||e.nextAt!==e.at+e.nextIndex*e.intervalSeconds)
   issues.push('The cadence uses only its exact present adoption, printed selected interval and complete ordered source check history.')
  if(e.source.book!==ENCOUNTER_CADENCE_SOURCE.book||e.source.sha256!==ENCOUNTER_CADENCE_SOURCE.sha256||e.source.startLine!==ENCOUNTER_CADENCE_SOURCE.startLine||e.source.endLine!==ENCOUNTER_CADENCE_SOURCE.endLine||witness(e.source)!==witness(receipt?.result.source)||e.fact.id!==start?.factId)
   issues.push('The cadence retains its original supplied DMG section, lines, SHA and explicit map qualification.')
  const fact=state.worldFacts?.find(f=>f.id===start?.factId)
  if(e.status==='active'&&(e.mapId!==state.currentMapId||state.phase==='combat'||e.nextAt<at||!fact||witness(fact)!==witness(e.fact)))issues.push('An active cadence remains on its actual outside-combat map and protected fact, with no missed elapsed checkpoint.')
  if(new Set(e.checkIds).size!==e.checkIds.length)issues.push('One actual occurrence check cannot fill multiple cadence windows.')
  for(const[zero,checkId]of e.checkIds.entries()){
   const check=state.dmTools?.randomEncounters?.checks[checkId],index=zero+1,dueAt=e.at+index*e.intervalSeconds
   if(!check||check.cadence?.id!==id||check.cadence.index!==index||check.cadence.dueAt!==dueAt||check.at!==dueAt||check.mapId!==e.mapId||check.adventureId!==e.adventureId)issues.push('Each cadence boundary belongs to its one actually committed exact occurrence check, never an erased, moved or replacement die.')
  }
  if(e.status==='stopped'&&(!e.stopEventId||!data.receipts[e.stopEventId]||e.stoppedAt===undefined||e.stoppedAt<e.at||e.stoppedAt>=e.nextAt||e.stoppedAt>at))issues.push('Stopping preserves the original interval and cannot discard an actually due occurrence check.')
 }
 for(const[id,r]of Object.entries(data.receipts))if(id!==r.input.eventId||r.command!==witness(r.input)||r.resultWitness!==witness(r.result)||r.at>at||!data.episodes[r.input.cadenceId])issues.push('The explicit cadence configuration retains its original exact command and result witness.')
 for(const check of Object.values(state.dmTools?.randomEncounters?.checks??{}))if(check.cadence){const e=data.episodes[check.cadence.id];if(!e||e.checkIds[check.cadence.index-1]!==check.id)issues.push('A cadence-linked check cannot escape or replace its retained source window.')}
 return [...new Set(issues)]
}
