import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { DiceRollResult } from '../../lib/types'
import { npcTurnKey, isDyingNpc, npcTimeEventId } from '../../lib/npc-life-state'
import { configureNpcDeathSaves, persistedNpc, npcDeathSaveEvent, stabilizeNpc, clearNpcEpisodeOnHealing, recordNpcDeath } from '../npc-life'
import { toolkitResult, toolkitTransaction, toolkitError } from '../toolkit'
import { rollRuleD20 } from '../roll-rules'
import { hero, effects, now, bonusOnRoll } from '../hero-rules'
import { reactionWindow } from '../hero-combat'
import * as gs from '../game-state'
import { breathingRecoveryBlocked, noteBlockedBreathingStabilization } from '../breathing'
import { breathingStateOf } from '../../lib/breathing-state'
import { afflictionHealingLimit } from '../afflictions'

const command=(entityId:string,eventId:string)=>JSON.stringify({entityId,eventId})
export function validateNpcHeldDeathSave(input:{entityId:string;eventId:string}){
 const holder=persistedNpc(input.entityId)
 if(!holder)toolkitError('NPC_LIFE_ACTOR_REQUIRED','The saved NPC actor no longer has an actual persisted stat block.')
 const monster=holder!.monster,event=npcDeathSaveEvent(monster),receipt=monster.npcLife?.receipts[input.eventId]
 if(!event||event.eventId!==input.eventId||receipt?.status!=='pending'||receipt.command!==command(input.entityId,input.eventId))
  toolkitError('NPC_DEATH_SAVE_EVENT_MISMATCH','The held save must still match its exact zero-HP episode and genuinely due event; no die or cost is newly resolved.')
 return {monster,event,receipt:receipt!}
}
export function finishNpcDeathSave(input:{entityId:string;eventId:string},roll:DiceRollResult){
 const {monster,event,receipt}=validateNpcHeldDeathSave(input),episode=monster.npcLife!.episode!,natural=roll.rolls[0]??roll.total
 const recoveryBlocked=breathingRecoveryBlocked(monster.id)
 const afflictionHealingBlocked=afflictionHealingLimit(monster.id,1)<1,hitPointRecoveryBlocked=recoveryBlocked||afflictionHealingBlocked
 if(natural===20&&!hitPointRecoveryBlocked){monster.hp.current=1;clearNpcEpisodeOnHealing(monster,event.at)}
 else {
  if(natural===1)episode.failures=Math.min(3,episode.failures+2)
  else if(natural===20||roll.total>=10)episode.successes=Math.min(3,episode.successes+1)
  else episode.failures=Math.min(3,episode.failures+1)
  if(episode.failures>=3)recordNpcDeath(monster,'failed_saves')
  else if(episode.successes>=3&&!recoveryBlocked)stabilizeNpc(monster)
  else {episode.nextSaveAt=event.at+6;episode.timeEventId=npcTimeEventId(episode.id,episode.nextSaveAt)}
 }
 if(event.scope==='turn'&&monster.npcLife?.episode)monster.npcLife.episode.lastResolvedTurnKey=event.turnKey
 const current=monster.npcLife?.episode
 if(current)current.lastResolvedEventId=input.eventId
 const result={entityId:monster.id,eventId:input.eventId,episodeId:event.episodeId,scope:event.scope,at:event.at,roll,naturalRoll:natural,
  success:natural===20||natural!==1&&roll.total>=10,criticalSuccess:natural===20,criticalFailure:natural===1,
  successes:current?.successes??0,failures:current?.failures??0,stable:current?.status==='stable',dead:!monster.isAlive,
  hpAfter:monster.hp.current,recovery:current?.recovery,nextSaveAt:current?.nextSaveAt,timeEventId:current?.timeEventId,
  archived:gs.getMonster(monster.id)!==monster,actionSpent:false,recoveryBlocked,afflictionHealingBlocked,hitPointRecoveryBlocked}
 receipt.status='resolved';receipt.result=result
 if(recoveryBlocked&&current?.status==='dying'&&current.successes===3){
  const breathingEpisode=breathingStateOf(gs.getState())!.creatures[monster.id].episode!
  current.breathingBlockedStabilization=noteBlockedBreathingStabilization({source:'suffocation',entityId:monster.id,
   breathingEpisodeId:breathingEpisode.id,lifeEpisodeId:current.id,eventId:input.eventId,at:event.at})
 }
 gs.addLogEntry({round:gs.getState().round,turn:'system',action:'Sauvegarde contre la mort du PNJ',mechanicalDetail:JSON.stringify(result)})
 return toolkitResult(result)
}
export function resolveNpcDeathSave(input:{entityId:string;eventId:string}){
 const holder=persistedNpc(input.entityId)
 if(!holder)toolkitError('NPC_LIFE_ACTOR_REQUIRED','Choose an actual active or archived MonsterState, never an unstatted narrative NPC.')
 const monster=holder!.monster,old=monster.npcLife?.receipts[input.eventId]
 if(old){
  if(old.command!==command(input.entityId,input.eventId))toolkitError('NPC_DEATH_SAVE_EVENT_CONFLICT','This exact event already identifies different immutable arguments.')
  if(old.status==='resolved')return toolkitResult({...old.result,alreadyResolved:true})
  if(hero()?.pending?.command.type==='npc-death-save'&&hero().pending!.command.eventId===input.eventId)return toolkitResult({alreadyPending:true,pendingReaction:hero().pending})
  toolkitError('NPC_DEATH_SAVE_PENDING_MISSING','The saved pending event has no matching held roll.')
 }
 if(hero()?.pending)toolkitError('REACTION_PENDING','Resolve the current held result before a different death-save event.')
 if(!isDyingNpc(monster))toolkitError('NPC_NOT_DYING','Choose a living tracked NPC with an unstable zero-HP episode.')
 const event=npcDeathSaveEvent(monster)
 if(!event||event.eventId!==input.eventId)toolkitError('NPC_DEATH_SAVE_EVENT_NOT_DUE','Select the exact current episode eventId exposed by the actual start of turn or due six-second boundary.')
 if(holder!.active&&gs.getState().phase==='combat'&&!gs.getState().initiativeOrder.includes(monster.id))
  toolkitError('NPC_DEATH_SAVE_ROSTER_REQUIRED','A death save could restore HP; this active-map body has no slot in the current combat. Resolve after the encounter instead of inventing an initiative position.')
 if(Object.keys(monster.npcLife!.receipts).length>=256)toolkitError('NPC_LIFE_RECEIPT_LIMIT','256 retained NPC save events reached; no old receipt is evicted or die rolled.')
 if(monster.conditions.includes('exhaustion')&&!gs.getState().dmTools?.exhaustion?.creatures[monster.id])toolkitError('EXHAUSTION_LEVEL_REQUIRED','The actual exhaustion level is required before this death-save d20.')
 const roll=rollRuleD20(monster.id,'save',0,effects('beacon-of-hope',monster.id).length>0,false)
 const bonus=bonusOnRoll('save',monster.id);if(bonus){roll.total+=bonus;roll.modifier+=bonus;roll.detail+=` | Bonus de sauvegarde +${bonus}`}
 monster.npcLife!.receipts[input.eventId]={command:command(input.entityId,input.eventId),status:'pending'}
 if(hero()?.inspiration.some(entry=>entry.targetId===monster.id&&entry.expiresAt>now()))
  return reactionWindow('save',monster.id,monster.id,['bardic_inspiration','decline'],{type:'npc-death-save',...input,inspiredActorId:monster.id},roll)
 return finishNpcDeathSave(input,roll)
}
export function registerNpcLifeTools(server:McpServer){
 server.registerTool('configure_npc_death_saves',{
  description:'Explicit immutable MJ choice, before a lethal injury, for one actual living active MonsterState with positive HP to use the PHB NPC death-save exception. No narrative NPC statistics, post-death resurrection, inferred importance or action/resource cost. Same eventId/reason replays its original policy; changed policy refuses. Ordinary monsters still die at zero by default, while real nonlethal knockouts get only their current zero-HP episode.',
  inputSchema:{entityId:z.string().min(1).max(180),eventId:z.string().min(1).max(180),reason:z.string().trim().min(1).max(1000)},
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 },async input=>toolkitTransaction(()=>{
  if(hero()?.pending)toolkitError('REACTION_PENDING','Resolve the held reaction before declaring a different policy.')
  return toolkitResult(configureNpcDeathSaves(input))
 }))
}
