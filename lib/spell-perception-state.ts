import { z } from 'zod'
import type { GameState } from './types'
import { spellRules } from './srd/hero-spells'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
const Id=z.string().min(1).max(180).refine(s=>!['__proto__','prototype','constructor'].includes(s)),Value=z.record(z.string(),z.unknown()),At=z.number().finite().nonnegative()
export const SpellObserverSchema=z.object({observerId:Id,channels:z.array(z.enum(['sight','hearing'])).min(1).max(2).refine(v=>new Set(v).size===v.length),verbalAudibility:z.object({factId:Id,actualAudibleConfirmed:z.literal(true),reason:z.string().trim().min(1).max(1000)}).strict().optional()}).strict()
export const SpellObserversSchema=z.array(SpellObserverSchema).min(1).max(16).refine(v=>new Set(v.map(o=>o.observerId)).size===v.length,'Select each actual observer once.')
export type SpellObserverSelection=z.infer<typeof SpellObserverSchema>
const Observation=z.object({selection:SpellObserverSchema,observerFrame:Value,sight:z.boolean(),hearing:z.boolean(),perceivedComponents:z.array(z.enum(['V','S','M'])).max(3),fact:Value.optional(),sense:Value.optional()}).strict()
const Phase=z.enum(['begun','incanting','cast','interrupted'])
const Original=z.object({id:Id,casterId:Id,spellId:Id,mapId:Id,roomId:Id,at:At,sourceFrame:Value,componentProof:Value,effectiveComponents:z.array(z.enum(['V','S','M'])).max(3),observers:z.array(Observation).min(1).max(16),command:z.string().max(50000)}).strict()
export const SpellPerceptionStateSchema=z.object({version:z.literal(1),records:z.record(z.string(),z.object({original:Original,originalCommand:z.string().max(100000),phase:Phase,transitions:z.array(z.object({phase:Phase,at:At,reason:z.string().min(1).max(160)}).strict()).min(1).max(4),castingId:Id.optional()}).strict())}).strict()
export type SpellPerceptionRecord=z.infer<typeof SpellPerceptionStateSchema>['records'][string]
export type SpellPerceptionOriginal=SpellPerceptionRecord['original']
export const spellPerceptionCommand=(original:SpellPerceptionOriginal)=>witness(original)
export function spellPerceptionView(record:SpellPerceptionRecord,observerId:string){
 const observation=record.original.observers.find(o=>o.selection.observerId===observerId)
 if(!observation)return undefined
 const castingPerceived=observation.perceivedComponents.length>0,sourceAttributed=castingPerceived&&observation.sight
 return{eventId:record.original.id,observerId,...castingPerceived?{observedAt:record.original.at}:{},castingPerceived,perceivedComponents:[...observation.perceivedComponents],sourceAttributed,...sourceAttributed?{casterId:record.original.casterId}:{},spellIdentified:false,targetRevealed:false,source:'original_actual_cast_observer_snapshot',readOnly:true,diceRolled:false,actionSpent:false,reactionSpent:false}
}
export function validateSpellPerceptionState(state:GameState){
 const data=state.dmTools?.spellPerception;if(!data)return[]
 if(!SpellPerceptionStateSchema.safeParse(data).success)return['Invalid original spell perception schema.']
 const issues:string[]=[]
 if(Object.keys(data.records).length>512)issues.push('Retain bounded actual original casting observations.')
 for(const[id,record]of Object.entries(data.records)){
  const o=record.original,exempt=o.componentProof.exemption!==undefined
  let components:string[]=[];try{components=exempt?[]:spellRules(o.spellId).components}catch{issues.push('Actual spell source required.')}
  if(exempt&&!['validated-magic-item','validated-spell-scroll'].includes(String(o.componentProof.exemption)))issues.push('Only an actual validated existing item/scroll producer can remove its casting components.')
  if(id!==o.id||record.originalCommand!==spellPerceptionCommand(o)||o.at>(state.worldTimeSeconds??0)||witness(components)!==witness(o.effectiveComponents)||o.componentProof.valid!==true||o.componentProof.spellId!==o.spellId||o.componentProof.casterId!==o.casterId||o.sourceFrame.entityId!==o.casterId)issues.push('Retain the first actual caster/component source, original command and dated physical snapshot; no synthetic cast or material exemption.')
  try{const input=JSON.parse(o.command);if(o.componentProof.exemption==='validated-magic-item'){const original=o.sourceFrame.magicItemSource as Record<string,unknown>|undefined,current=state.dmTools?.magicItems?.[input.magicItemId];if(!original||!current||original.id!==input.magicItemId||original.templateId!==current.templateId||original.creation!==current.creation)issues.push('The component-free item casting retains its actual original item producer, never an ordinary cast flag.')}if(o.componentProof.exemption==='validated-spell-scroll'){const original=o.sourceFrame.scrollSource as Record<string,unknown>|undefined,current=state.dmTools?.spellScrolls?.[input.scrollItemId];if(!original||!current||original.id!==input.scrollItemId||original.spellId!==o.spellId||current.spellId!==o.spellId||original.creation!==current.creation)issues.push('The component-free scroll casting retains its actual original physical source and spent tombstone.')}if(input.spellId!==o.spellId||(input.casterId??'player')!==o.casterId||witness(input.spellObservers)!==witness(o.observers.map(v=>v.selection)))issues.push('Original selected spell observers and actual caster command must match its producer.')}catch{issues.push('The actual original casting command is required.')}
  if(new Set(o.observers.map(v=>v.selection.observerId)).size!==o.observers.length)issues.push('An actual observer is selected once per cast.')
  for(const v of o.observers){
   const actual=o.effectiveComponents.filter(c=>c==='V'?v.hearing:v.sight)
   if(witness(actual)!==witness(v.perceivedComponents)||v.observerFrame.entityId!==v.selection.observerId||v.selection.observerId===o.casterId||v.sight&&!v.selection.channels.includes('sight')||v.hearing&&(!v.selection.channels.includes('hearing')||!v.selection.verbalAudibility||v.fact?.id!==v.selection.verbalAudibility.factId)||v.hearing&&v.observerFrame.soundSuppressed===true||v.hearing&&Array.isArray(v.observerFrame.conditions)&&v.observerFrame.conditions.includes('deafened'))issues.push('Keep the exact original actually observed channels and verbal qualification; no new source or spell identity from an effect.')
  }
  if(record.phase!==record.transitions.at(-1)?.phase||record.transitions.some(t=>t.at<o.at||t.at>(state.worldTimeSeconds??0))||record.transitions.filter(t=>t.phase==='cast').length>1)issues.push('One actual incantation retains its original progress without a second cast on release or replay.')
  if(record.phase==='begun'){
   const p=state.hero?.pending;if(p?.command.type!=='spell'||p.command.spellPerceptionEventId!==id||p.sourceId!==o.casterId||p.command.spellId!==o.spellId)issues.push('A begun reactive spell keeps the same original actual pending cast.')
  }
  if(record.castingId){const cast=state.dmTools?.casting?.records[record.castingId];if(!cast||cast.input.spellPerceptionEventId!==id||cast.spellId!==o.spellId||record.phase==='incanting'&&!['active','ready'].includes(cast.status)||record.phase==='interrupted'&&cast.status!=='interrupted'||record.phase==='cast'&&cast.status!=='completed')issues.push('A long incantation must retain its real casting producer and interruption, never a fictitious spell success.')}
 }
 return issues
}

export function interruptSpellPerceptionInState(state:Pick<GameState,'dmTools'>,castingId:string,reason:string,at:number){
 for(const record of Object.values(state.dmTools?.spellPerception?.records??{}))if(record.castingId===castingId&&record.phase==='incanting'){record.phase='interrupted';record.transitions.push({phase:'interrupted',at,reason:reason.slice(0,160)})}
}
