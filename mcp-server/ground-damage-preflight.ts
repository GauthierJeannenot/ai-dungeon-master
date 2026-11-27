import type { GameState,MonsterState } from '../lib/types'
import { hasNpcZeroHpEpisode,hasUnresolvedNpcLifeObservation } from '../lib/npc-life-state'
import { validatePetrifiedSpriteHistory } from './petrified-sprite-effects'
import { validatePetrifiedAfflictionHistory } from './afflictions'

/** Read-only forecast on the actual projected body state, before contact/save
 * dice. Mirrors existing damage history gates without opening a death episode,
 * activating an NPC, changing visibility or manufacturing past events. */
export function groundDamageIssue(state:GameState,entityId:string,maximumRawDamage:number){
 const sprite=validatePetrifiedSpriteHistory(state)
 if(sprite.errors.length)return{code:sprite.errors[0].code,message:sprite.errors[0].message}
 if(sprite.unresolvedEffectIds.length)return{code:'PETRIFIED_SPRITE_HISTORY_REQUIRED',message:'This existing petrification has an unanchored sprite poison/sleep; no past onset or remaining duration is invented.'}
 const affliction=validatePetrifiedAfflictionHistory(state)
 if(affliction.errors.length)return{code:affliction.errors[0].code,message:affliction.errors[0].message}
 if(affliction.unresolvedRecordIds.length)return{code:'PETRIFIED_AFFLICTION_HISTORY_REQUIRED',message:'The existing petrified actor has an unanchored poison/disease. Its past onset is unknown; no duration is guessed.'}
 const target=entityId==='player'?state.player:state.monsters[entityId]??state.npcs?.[entityId]
 if(maximumRawDamage>0&&target&&'isAlive'in target){
  const body=target as MonsterState
  if(hasUnresolvedNpcLifeObservation(body))return{code:'NPC_LIFE_HISTORY_UNRESOLVED',message:'This actual living0HP body has unknown stability/counters. A real heal or Medicine stabilization must normalize its life before damage/save dice.'}
  if(state.phase==='combat'&&!state.initiativeOrder.includes(entityId)&&(body.npcLife?.policy||body.npcLife?.episode||body.knockout))return{code:'NPC_DEATH_SAVE_ROSTER_REQUIRED',message:'The actual tracked body needs its real initiative slot before possible ground-hazard damage; no orphaned saving-throw lifecycle is created.'}
  if(body.isAlive&&body.hp.current===0&&!hasNpcZeroHpEpisode(body))return{code:'NPC_ZERO_HP_UNTRACKED',message:'Living zero-HP NPC damage requires an actual stable KO or tracked death-save episode before the source save/damage dice.'}
 }
 return null
}
