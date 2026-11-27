import type { z } from 'zod'
import { ChimeInputSchema, RobeInputSchema, validateChargedItems, ROBE_USER_POLICY, finishRobeTurn } from '../lib/charged-item-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { toolkitState,toolkitError,toolkitResult,assertToolkitReach } from './toolkit'
import { assertMagicUse,consumeMagicCharges,magicHeld,magicSnapshot } from './magic-items'
import { available,spendHeroAction,hero,now,addHeroEffect,removeHeroEffect } from './hero-rules'
import { objectById,objectSnapshot,releaseContents } from './scene-objects'
import { spellComponentConstraints } from './spell-components'
import { creaturePerception } from './senses'
import { lightingRay,physicalLightAt } from '../lib/lighting'
import { savedResolution,registerCheckedResolution } from './toolkit-checks'
import { conditionImmune } from './monster-rules'
import { physicalHeightCombatIssue } from '../lib/jumping-state'
import * as gs from './game-state'
import * as rules from './rules'

const data=()=>toolkitState().chargedItems??={version:1 as const,events:{}}
function current(eventId:string,command:string){
 const prior=gs.getState().dmTools?.chargedItems?.events[eventId]
 if(prior&&prior.command!==command)toolkitError('MAGIC_ACTIVATION_ID_CONFLICT','This event retains its original item and exact source choice.')
 return prior
}
function guard(){available();rules.validateActionUse('player');const e=validateChargedItems(gs.getState());if(e.length)toolkitError('CHARGED_ITEM_STATE_MISMATCH',e.join(' '))}
export function useChime(raw:z.infer<typeof ChimeInputSchema>){
 const input=ChimeInputSchema.parse(raw),command=witness(input),prior=current(input.eventId,command)
 if(prior)return {...prior.result,replayed:true}
 guard();const state=gs.getState(),{record,spec}=assertMagicUse(input.itemId)
 if(spec.kind!=='chime'||!magicHeld(record.id))toolkitError('CHIME_HELD_SOURCE_REQUIRED','Hold this exact owned Chime of Opening, not a label, ordinary tube or worn item.')
 if(record.charges<1)toolkitError('CHIME_USE_EXHAUSTED','The chime cracked after its tenth use and is useless; it never recharges.')
 const object=objectById(input.objectId)
 if(object.kind!=='container'||object.state==='destroyed')toolkitError('CHIME_TARGET_UNSUPPORTED','Select one actual prepared container with its real single lock/latch. Unqualified doors, magical locks and compound mechanisms are outside this physical tranche.')
 assertToolkitReach(object,'player',24)
 const fact=state.worldFacts?.find(f=>f.id===input.soundFactId)
 if(!fact||fact.mapId!==object.mapId||fact.roomId!==object.roomId||fact.narrativeEffect?.cell.x!==object.cell.x||fact.narrativeEffect.cell.y!==object.cell.y)
  toolkitError('CHIME_SOUND_FACT_REQUIRED','Qualify this exact sound reaching or being blocked at the actual selected object; no general sound propagation is inferred.')
 const silenced=spellComponentConstraints(state,'player').some(c=>c.kind==='silenced')||state.hero?.effects.some(e=>e.kind==='silence'&&e.targetIds.includes('player')&&e.expiresAt>now())
 if(silenced&&input.actualSoundReachesTarget)toolkitError('CHIME_SOUND_CONTRADICTION','The actual source is silenced; a sound-reaching assertion cannot override its established suppression.')
 const before=objectSnapshot(object.id),wasLocked=object.locked,charge=consumeMagicCharges(record.id,1)
 let released:unknown[]=[]
 if(input.actualSoundReachesTarget){if(wasLocked)object.locked=false;else{object.state='open';released=releaseContents(object.id)}}
 spendHeroAction()
 const result={success:true,eventId:input.eventId,charge,soundReached:input.actualSoundReachesTarget,unlocked:input.actualSoundReachesTarget&&wasLocked,
  opened:input.actualSoundReachesTarget&&!wasLocked,object:objectSnapshot(object.id),releasedItems:released,useless:record.charges===0,
  notice:'One actual lock/latch per use; an already unlocked container opens. A failed sound route still expends one real use.'}
 data().events[input.eventId]={id:input.eventId,itemId:input.itemId,kind:'chime',command,at:now(),generation:state.combatGeneration??0,
  actorTurn:state.hero?.turnStarted.player??0,activationRound:state.round,status:'resolved',targetIds:[],saveIndex:0,saves:[],effectIds:[],sourceWitness:witness({before,fact}),result}
 ;(record.activationIds??=[]).push(input.eventId)
 return result
}

export function robeAttackDisadvantage(state:import('../lib/types').GameState,attackerId:string,targetId:string){
 const actor=gs.getEntity(attackerId),target=gs.getEntity(targetId)
 return Boolean(actor&&target&&state.hero?.effects.some(e=>e.kind==='scintillating-robe'&&e.targetIds.includes(targetId)&&e.expiresAt>(state.worldTimeSeconds??0)
  &&state.dmTools?.magicItems?.[String(e.data.itemId)]?.worn&&state.dmTools.magicItems[String(e.data.itemId)].attunedTo==='player'
  &&state.player.inventory.some(i=>i.id===e.data.itemId))
  &&creaturePerception(actor!,target!,state).canSee&&creaturePerception(actor!,target!,state).mode!=='blindsight')
}
export function resumeRobe(eventId:string){
 const state=gs.getState(),event=data().events[eventId]
 if(!event||event.kind!=='robe')toolkitError('ROBE_EVENT_REQUIRED','Retain the exact original robe activation.')
 while(event.saveIndex<event.targetIds.length){
  const id=event.targetIds[event.saveIndex]
  if(!gs.getPhysicalCreature(id))toolkitError('ROBE_ORIGINAL_BODY_REQUIRED','The original measured body must remain for its saved consequence; discovery is not a prerequisite.')
  const answer=gs.withPhysicalCreatureResolution([id],()=>savedResolution({entityId:id,ability:'wis',dc:15,magical:true,againstCondition:'stunned'},
   {domain:'robe-save',command:{eventId,robeActivationId:eventId}}))
  const pending=state.hero?.pending,resolution=pending?.command.toolkitResolution as {domain?:string;command?:{eventId?:string}}|undefined
  if(resolution?.domain==='robe-save'&&resolution.command?.eventId===eventId){event.status='saving';event.heldWitness=witness(pending)}
  return answer
 }
 event.status='active';delete event.heldWitness
 return toolkitResult({success:true,eventId,saves:event.saves,item:magicSnapshot(event.itemId),untilEndOf:'player',endTurnCount:event.actorTurn+1,
  notice:'No concentration; actual visible attackers have disadvantage; original visible bright-area creatures saved once. Duration follows the actual next player-turn end.'})
}
export function useRobe(raw:z.infer<typeof RobeInputSchema>){
 const input=RobeInputSchema.parse(raw),command=witness(input),prior=current(input.eventId,command)
 if(prior)return toolkitResult({success:true,eventId:prior.id,replayed:true,status:prior.status,saves:prior.saves})
 guard();const state=gs.getState(),{record,spec}=assertMagicUse(input.itemId)
 if(spec.kind!=='robe'||!record.worn)toolkitError('ROBE_WORN_SOURCE_REQUIRED','Wear and actually attune to this exact robe before its activation.')
 if(state.phase!=='combat'||state.currentTurn!=='player')toolkitError('ROBE_INITIATIVE_REQUIRED','This duration tranche requires the actual player initiative turn, never a guessed exploration round.')
 if(record.charges<1)toolkitError('MAGIC_CHARGES_UNAVAILABLE','The robe has no remaining charge.')
 if(Object.keys(data().events).length>=256)toolkitError('MAGIC_ACTIVATION_HISTORY_FULL','Retain all prior charged-item events before any new cost.')
 const actor=gs.getPlayer(),projection=structuredClone(state)
 projection.hero!.effects.push({id:'projection:robe',kind:'scintillating-robe',sourceId:'player',targetIds:['player'],expiresAt:Number.MAX_SAFE_INTEGER,concentration:false,data:{itemId:record.id}})
 const emission={id:'projection:robe',cell:actor.position,brightFeet:30,dimAdditionalFeet:30}
 // Source geometry is shared with this exact light emission, not ambient light
 // or the observer's sight range. Hidden real bodies remain physical bodies.
 const ids=[...new Set(['player',...Object.keys(state.monsters),...Object.keys(state.npcs??{})])]
 const candidates=ids.flatMap(id=>{const body=gs.getPhysicalCreature(id);return body?[body]:[]})
 for(const npc of Object.values(state.npcs??{}))if(gs.npcOnCurrentMap(npc)&&!gs.getPhysicalCreature(npc.id)
  &&physicalLightAt(emission,npc.position)==='bright'&&lightingRay(projection,actor.position,npc.position))
   toolkitError('ROBE_BODY_SOURCE_REQUIRED','A real nearby body needs its actual sourced visual/saving-throw profile before any robe cost; no NPC statistics or senses are invented.')
 const targets=candidates.filter(t=>t.id!=='player'&&physicalLightAt(emission,t.position)==='bright'
  &&lightingRay(projection,actor.position,t.position)&&creaturePerception(t,actor,projection).canSee&&creaturePerception(t,actor,projection).mode!=='blindsight')
 if(targets.some(t=>'group'in t&&Boolean(t.group)))toolkitError('ROBE_GROUP_SAVES_UNSUPPORTED','A collective token is not one creature saving for all members. Qualify individual actual bodies before activation; no save, charge or action is spent.')
 if(targets.length>64)toolkitError('ROBE_BODY_LIMIT','Resolve at most64 physically represented affected bodies; no omitted save is invented.')
 const height=physicalHeightCombatIssue(state,['player',...targets.map(t=>t.id)])
 if(height)toolkitError(height.code,height.message)
 const charge=consumeMagicCharges(record.id,1),actorTurn=hero().turnStarted.player??0
 spendHeroAction()
 const effect=addHeroEffect('scintillating-robe','player',['player'],Number.MAX_SAFE_INTEGER-now(),{itemId:record.id,eventId:input.eventId,untilEndOf:'player',endTurnCount:actorTurn+1})
 data().events[input.eventId]={id:input.eventId,itemId:record.id,kind:'robe',command,at:now(),generation:state.combatGeneration??0,actorTurn,
  activationRound:state.round,status:'active',targetIds:targets.map(t=>t.id),saveIndex:0,saves:[],effectIds:[effect.id],policy:{...ROBE_USER_POLICY},sourceWitness:witness({charge,wearer:{position:actor.position,hp:actor.hp,conditions:actor.conditions},targets:targets.map(t=>({id:t.id,position:t.position,hp:t.hp,conditions:t.conditions}))})}
 ;(record.activationIds??=[]).push(input.eventId)
 return resumeRobe(input.eventId)
}
/** Called only at the actual end of the preserved source initiative slot.
 * No startHeroTurn, reaction reset, action credit, recovery or resurrection. */
export function finishPassiveRobeSlot(id:string){
 const state=gs.getState()
 for(const event of Object.values(state.dmTools?.chargedItems?.events??{}))if(id==='player'&&event.kind==='robe'&&event.status==='active'&&state.round>event.activationRound)
  for(const effectId of event.effectIds)if(state.hero?.effects.some(e=>e.id===effectId))removeHeroEffect(effectId)
 finishRobeTurn(state,id)
}
export function registerChargedItemResolutions(){
 registerCheckedResolution('robe-save',(command,result)=>{
  const event=data().events[String(command.eventId)]
  if(!event||event.kind!=='robe'||command.robeActivationId!==event.id||event.saveIndex>=event.targetIds.length)toolkitError('ROBE_SAVE_OWNER_REQUIRED','The original robe event and next exact body are required.')
  const targetId=event.targetIds[event.saveIndex]
  return gs.withPhysicalCreatureResolution([targetId],()=>{
   event.saves.push({entityId:targetId,result:structuredClone(result) as unknown as Record<string,unknown>});event.saveIndex++;delete event.heldWitness
   if(!result.success&&!conditionImmune(gs.getEntity(targetId)!,'stunned')){const effect=addHeroEffect(`robe-stunned:${event.id}`, 'player',[targetId],Number.MAX_SAFE_INTEGER-now(),{condition:'stunned',eventId:event.id,untilEndOf:'player',endTurnCount:event.actorTurn+1});event.effectIds.push(effect.id)}
   return resumeRobe(event.id)
  })
 })
}
