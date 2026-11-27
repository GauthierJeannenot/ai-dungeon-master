import type { AbilityCheckResult, DiceRollResult } from '../lib/types'
import { resolveAbilityCheck,type AbilityCheckInput } from './ability-check'
import { reactionWindow } from './hero-combat'
import { hero,canCutWords,now,available } from './hero-rules'
import * as gs from './game-state'
import * as rules from './rules'
import { savingThrow } from './monster-rules'
import type { Condition, EntityStats, SavingThrowResult } from '../lib/types'
import type { CoverOrigin } from './cover'

export function heroAbilityCheck(input:AbilityCheckInput){
  available();const actorId=input.entityId??'player',options:string[]=[]
  if(canCutWords(actorId))options.push('cutting_words_check')
  if(hero().inspiration.some(e=>e.targetId===actorId&&e.expiresAt>now()))options.push('bardic_inspiration')
  if(!options.length){const answer=resolveAbilityCheck(input);return{content:[{type:'text' as const,text:JSON.stringify(answer)}]}}
  const rolled=resolveAbilityCheck({...input,internalHold:true})
  if(rolled.roll.notation==='automatic-failure')return finishHeroCheck(rolled,rolled.roll)
  return reactionWindow('check',actorId,actorId,[...options,'decline'],{type:'check',result:rolled,inspiredActorId:actorId},rolled.roll)
}
export function finishHeroCheck(result:AbilityCheckResult,roll:DiceRollResult){
  const success=roll.notation==='automatic-failure'?false:result.dc===undefined?undefined:roll.total>=result.dc
  const social=result.social?` | Interaction D&D2014 : DD ${result.social.baseDc}.`:''
  const summary=`${result.label}: ${roll.detail}${result.dc!==undefined?` vs DD ${result.dc} → ${success?'réussi':'raté'}`:''}${social}`
  gs.addLogEntry({round:gs.getState().round,turn:result.entityId,action:result.label??'Test',mechanicalDetail:summary})
  if(gs.getState().phase==='combat'&&gs.getState().currentTurn===result.entityId)rules.recordAction(result.entityId)
  return{content:[{type:'text' as const,text:JSON.stringify({...result,roll,success,mechanicalSummary:summary})}]}
}

export function heroSavingThrow(input:{entityId:string;ability:keyof EntityStats;dc:number;magical?:boolean;againstCondition?:Condition;origin?:CoverOrigin}){
  available();rules.validateSavingThrow(input.entityId)
  const saved=savingThrow(input.entityId,input.ability,input.dc,input.magical,input.againstCondition,input.origin)
  if(saved.roll.notation!=='automatic-failure'&&hero().inspiration.some(e=>e.targetId===input.entityId&&e.expiresAt>now()))return reactionWindow('save',input.entityId,input.entityId,['bardic_inspiration','decline'],{type:'save',result:{...saved,success:undefined},inspiredActorId:input.entityId},saved.roll)
  return finishHeroSave(saved,saved.roll)
}
export function finishHeroSave(result:SavingThrowResult,roll:DiceRollResult){
  const success=roll.notation!=='automatic-failure'&&roll.total>=result.dc
  const mechanicalSummary=`JS ${result.ability.toUpperCase()} ${roll.detail} vs DD ${result.dc} : ${success?'SUCCÈS':'ÉCHEC'}`
  gs.addLogEntry({round:gs.getState().round,turn:result.entityId,action:'Jet de sauvegarde',mechanicalDetail:mechanicalSummary})
  return{content:[{type:'text' as const,text:JSON.stringify({...result,roll,success,mechanicalSummary})}]}
}
