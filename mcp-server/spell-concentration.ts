import { randomUUID } from 'node:crypto'
import { concentrationCommand,concentrationEndingIds,concentrationStartWitness,CONCENTRATION_TIMING_SOURCE,type ConcentrationStart } from '../lib/critical-spells-state'
import type { Condition } from '../lib/types'
import { assertPersistedConditionRemoval } from './persisted-conditions'
import { hero,fail,now,removeHeroEffect } from './hero-rules'
import * as gs from './game-state'

export interface ConcentrationInput {spellId?:string;casterId?:string;concentrationStartId?:string;concentrationStartWitness?:string}
export interface ConcentrationEndPlan {casterId:string;previousConcentrationId?:string;previousEffectIds:string[]}
export function preflightConcentrationEnd(casterId:string):ConcentrationEndPlan{
 const state=gs.getState(),previousConcentrationId=state.hero?.concentrationIds[casterId],previousEffectIds=concentrationEndingIds(state,casterId)
 for(const e of state.hero?.effects.filter(e=>previousEffectIds.includes(e.id))??[])if(e.data.condition)
  for(const targetId of e.targetIds)assertPersistedConditionRemoval(targetId,e.data.condition as Condition,now(),{kind:'hero',id:e.id})
 return{casterId,...previousConcentrationId?{previousConcentrationId}:{},previousEffectIds}
}
export function commitConcentrationEnd(plan:ConcentrationEndPlan){
 if(hero().concentrationIds[plan.casterId]!==plan.previousConcentrationId)fail('CONCENTRATION_START_CONTEXT_CHANGED','Retain the exact previous concentration before the actual new cast begins.')
 if(plan.previousConcentrationId)removeHeroEffect(plan.previousConcentrationId)
}
export function assertConcentrationContinuation(input:ConcentrationInput,continued:boolean){
 const marker=gs.getState().hero?.concentrationStart
 if(!input.concentrationStartId){if(marker||input.concentrationStartWitness)fail('CONCENTRATION_ORIGINAL_REQUIRED','Keep the original internal start of this held cast.');return}
 if(!continued||!marker||marker.id!==input.concentrationStartId||marker.casterId!==(input.casterId??'player')
  ||marker.spellId!==input.spellId||marker.commandWitness!==concentrationCommand(input)
  ||input.concentrationStartWitness!==concentrationStartWitness(marker))
  fail('CONCENTRATION_ORIGINAL_REQUIRED','The original concentration start belongs only to its exact held spell continuation.')
}
export function beginHeldConcentration(input:ConcentrationInput,plan:ConcentrationEndPlan):ConcentrationStart{
 const original={...input};delete original.concentrationStartId
 const marker:ConcentrationStart={id:`spell-start-${randomUUID()}`,casterId:plan.casterId,spellId:input.spellId!,at:now(),
  source:CONCENTRATION_TIMING_SOURCE,commandWitness:concentrationCommand(original),previousEffectIds:[...plan.previousEffectIds],
  ...plan.previousConcentrationId?{previousConcentrationId:plan.previousConcentrationId}:{}}
 commitConcentrationEnd(plan)
 hero().concentrationStart=marker
 return marker
}
export function finishConcentrationContinuation(input:ConcentrationInput){
 if(input.concentrationStartId&&hero().concentrationStart?.id===input.concentrationStartId)delete hero().concentrationStart
}
