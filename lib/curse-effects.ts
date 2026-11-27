import { z } from 'zod'
import type { GameState, EntityStats } from './types'

export const CurseSelectionSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('ability'),ability:z.enum(['str','dex','con','int','wis','cha'])}).strict(),
  z.object({kind:z.literal('attacks_against_caster')}).strict(),
])
export type CurseSelection=z.infer<typeof CurseSelectionSchema>
export function activeCurses(state:GameState,targetId?:string){
  return (state.hero?.effects??[]).filter(effect=>effect.kind==='bestow-curse'&&effect.expiresAt>(state.worldTimeSeconds??0)
    &&(!targetId||effect.targetIds.includes(targetId)))
}
export function curseAbilityDisadvantage(state:GameState,targetId:string,ability:keyof EntityStats){
  return activeCurses(state,targetId).some(effect=>effect.data.curseKind==='ability'&&effect.data.ability===ability)
}
export function curseAttackDisadvantage(state:GameState,attackerId:string,targetId:string){
  return activeCurses(state,attackerId).some(effect=>effect.data.curseKind==='attacks_against_caster'&&effect.sourceId===targetId)
}
