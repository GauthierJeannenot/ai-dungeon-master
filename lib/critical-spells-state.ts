import { z } from 'zod'
import type { GameState,Condition,MonsterState,PlayerState } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'

export const CONCENTRATION_TIMING_SOURCE='xge:Concentration:519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf:84-86'
export const AID_OVERLAP_SOURCE='dmg-2014:Combining Game Effects:8163-8165;xge:Combining Different Effects:60-62'
export const ConcentrationStartSchema=z.object({id:z.string().min(1),casterId:z.string().min(1),spellId:z.string().min(1),
 at:z.number().nonnegative(),source:z.literal(CONCENTRATION_TIMING_SOURCE),commandWitness:z.string(),
 previousEffectIds:z.array(z.string()),previousConcentrationId:z.string().optional()}).strict()
export type ConcentrationStart=z.infer<typeof ConcentrationStartSchema>
export function concentrationCommand(command:object){const copy={...command} as Record<string,unknown>;delete copy.concentrationStartId;delete copy.concentrationStartWitness;delete copy.type;return witness(copy)}
export const concentrationStartWitness=(start:ConcentrationStart)=>witness(start)
export function criticalSpellActor(state:GameState,id:string):PlayerState|MonsterState|undefined{
 if(id==='player')return state.player
 return state.monsters[id]??(state.npcs?.[id]&&'stats'in state.npcs[id]?state.npcs[id] as MonsterState:undefined)
}
export function concentrationEndingIds(state:GameState,casterId:string):string[]{
 const id=state.hero?.concentrationIds[casterId];if(!id)return[]
 return state.hero!.effects.filter(e=>e.id===id||e.data.groupId===id).map(e=>e.id)
}
/** Pure preview of ending the old concentration for casting perception only.
 * No physical actor, cost, timer or condition provider is created. */
export function projectConcentrationEnd(state:GameState,casterId:string):GameState{
 const ids=new Set(concentrationEndingIds(state,casterId));if(!ids.size)return state
 const projected=structuredClone(state),removed=projected.hero!.effects.filter(e=>ids.has(e.id))
 projected.hero!.effects=projected.hero!.effects.filter(e=>!ids.has(e.id))
 delete projected.hero!.concentrationIds[casterId]
 if(casterId==='player')delete projected.hero!.concentrationId
 for(const e of removed)if(e.data.condition)for(const targetId of e.targetIds){
  const target=criticalSpellActor(projected,targetId),condition=e.data.condition as Condition
  const other=projected.hero!.effects.some(p=>p.targetIds.includes(targetId)&&p.data.condition===condition)
    ||projected.monsterEffects?.some(p=>p.targetId===targetId&&!p.petrificationPause&&p.conditions.includes(condition))
  if(target&&!other&&!(condition==='unconscious'&&target.hp.current<=0))target.conditions=target.conditions.filter(c=>c!==condition)
 }
 return projected
}
export function validateCriticalSpellsState(state:GameState):string[]{
 const issues:string[]=[],start=state.hero?.concentrationStart,pending=state.hero?.pending
 const id=pending?.command.concentrationStartId,header=pending?.command.concentrationStartWitness
 if((id!==undefined||header!==undefined)&&!start)issues.push('The original concentration start owner is missing.')
 if(start){
  if(!ConcentrationStartSchema.safeParse(start).success)return['Malformed concentration start.']
  if(!pending||pending.kind!=='spell'||pending.command.type!=='spell'||id!==start.id||pending.sourceId!==start.casterId
   ||pending.command.spellId!==start.spellId||concentrationCommand(pending.command)!==start.commandWitness
   ||header!==concentrationStartWitness(start))
   issues.push('Keep the exact reciprocal concentration start and original held spell.')
  if(start.at>(state.worldTimeSeconds??0)||new Set(start.previousEffectIds).size!==start.previousEffectIds.length
   ||start.previousConcentrationId&&!start.previousEffectIds.includes(start.previousConcentrationId))issues.push('Retain the actual dated previous concentration header.')
  if(start.previousEffectIds.some(old=>state.hero!.effects.some(e=>e.id===old)))issues.push('An effect whose concentration already ended cannot remain active.')
  if(state.hero?.concentrationIds[start.casterId])issues.push('No new concentration effect exists while the original cast is held before its effects.')
 }
 const aids=state.hero?.effects.filter(e=>e.kind==='aid')??[]
 if(aids.some(e=>e.data.aidOverlapVersion!==undefined)&&state.hero?.aidModelVersion!==1)issues.push('Aid overlap model cannot be removed from its real instances.')
 if(state.hero?.aidModelVersion===1){
  const targets=new Set(aids.flatMap(e=>e.targetIds)),time=state.worldTimeSeconds??0
  for(const e of aids){
   if(e.data.aidOverlapVersion!==1||e.targetIds.length!==1||!Number.isInteger(e.data.hpBonus)||Number(e.data.hpBonus)<=0
    ||!Number.isInteger(e.data.aidAppliedBonus)||Number(e.data.aidAppliedBonus)<0
    ||!['cast','legacy'].includes(String(e.data.aidOrigin)))issues.push('Retain the exact Aid instance, raw potency and applied contribution.')
  }
  for(const id of targets){
   const all=aids.filter(e=>e.targetIds.includes(id)),live=all.filter(e=>e.expiresAt>time)
   const strongest=Math.max(0,...live.map(e=>Number(e.data.hpBonus))),applied=all.reduce((sum,e)=>sum+Number(e.data.aidAppliedBonus),0)
   if(applied!==strongest||all.filter(e=>Number(e.data.aidAppliedBonus)>0).length>(strongest?1:0)
    ||all.some(e=>Number(e.data.aidAppliedBonus)>0&&Number(e.data.aidAppliedBonus)!==Number(e.data.hpBonus)))
    issues.push('Only one strongest live Aid contributes to maximum HP; suppression keeps all other durations.')
  }
 }
 return issues
}
