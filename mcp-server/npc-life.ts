import { validateLegacyNpcLifeObservation } from './legacy-npc-life'
import { randomUUID } from 'node:crypto'
import type { GameState, MonsterState } from '../lib/types'
import { getMonsterRecord } from '../lib/srd/monsters'
import { getMapSpec, inferRoomIdOnMap } from '../lib/adventure-map'
import { completedRoundEvents } from '../lib/combat-round-events'
import { hasIndependentUnconscious, persistedKnockoutActors } from '../lib/nonlethal-state'
import { isDyingNpc,isNpcStabilizationCandidate,npcStabilizationMatches,hasUnresolvedNpcLifeObservation, npcTurnKey, npcTimeEventId, npcTurnEventId, npcLifeValidation, npcBreathingWitnessValidation, type NpcLifeEpisode } from '../lib/npc-life-state'
import { assertBreathingRecoveryAllowed, clearBlockedBreathingStabilization, clearBreathingBlockedRecovery, breathingBlockedRecoveryOf, type BreathingCollapseEvent } from './breathing'
import * as gs from './game-state'
import { RuleViolation } from './rules'
import { rollDice } from './dice'
import { removeHeroEffect } from './hero-rules'
import { endInvisibility, reconcileMonsterEffects } from './monster-rules'
import { validateNpcHealingRecovery } from '../lib/affliction-healing'

const now=()=>gs.getState().worldTimeSeconds??0
const refuse=(code:string,message:string,detail:Record<string,unknown>={}):never=>{throw new RuleViolation(code,message,detail)}
export const persistedNpc=(id:string)=>persistedKnockoutActors(gs.getState()).find(({monster})=>monster.id===id)
const data=(monster:MonsterState)=>monster.npcLife??={receipts:{}}
function sourceImmune(monster:MonsterState,condition:string){const record=getMonsterRecord(monster.type);return ((record?.reference??record?.source)?.condition_immunities as Array<{index:string}>|undefined)?.some(value=>value.index===condition)??false}

export function configureNpcDeathSaves(input:{entityId:string;eventId:string;reason:string}){
 const monster=gs.getMonster(input.entityId)??refuse('NPC_LIFE_ACTOR_REQUIRED','Choose an actual active MonsterState with authored HP and statistics.')
 if(monster.group)refuse('NPC_GROUP_DEATH_SAVES_UNSUPPORTED','A shared-HP group has no individual death-save episodes; its losses track able members only.')
 const old=monster.npcLife?.policy
 if(old){if(old.eventId!==input.eventId||old.reason!==input.reason)refuse('NPC_POLICY_IMMUTABLE','This actor already has a different immutable death-save policy.');return {entityId:monster.id,configured:true,alreadyConfigured:true,policy:old}}
 if(persistedKnockoutActors(gs.getState()).some(({monster:other})=>other.id!==monster.id&&other.npcLife?.policy?.eventId===input.eventId))
  refuse('NPC_POLICY_EVENT_CONFLICT','This policy eventId already belongs to another actual actor.')
 if(!monster.isAlive||monster.hp.current<=0)refuse('NPC_POLICY_PREINJURY_REQUIRED','Choose this policy while the actual actor is alive with positive HP, never after death or a zero-HP injury.')
 if(gs.getState().phase==='combat'&&!gs.getState().initiativeOrder.includes(monster.id))
  refuse('NPC_POLICY_COMBAT_ROSTER_REQUIRED','Declare this policy before combat or for an actor already explicitly included in its current roster; no mid-combat enrollment is invented.')
 if(sourceImmune(monster,'unconscious'))refuse('NPC_LIFE_CONDITION_IMMUNE','This source profile cannot enter the supported unconscious zero-HP cycle.')
 const policy={eventId:input.eventId,reason:input.reason,at:now()};data(monster).policy=policy
 return {entityId:monster.id,configured:true,policy}
}

function dyingEpisode(monster:MonsterState,origin:'policy'|'knockout',at:number,id=randomUUID()):NpcLifeEpisode {
 const nextSaveAt=now()+6
 return {id,origin,at,status:'dying',successes:0,failures:0,nextSaveAt,timeEventId:npcTimeEventId(id,nextSaveAt),
  ...(gs.getState().phase==='combat'&&gs.getState().currentTurn===monster.id?{enteredTurnKey:npcTurnKey(gs.getState(),monster.id)}:{})}
}
export function trackStableKnockout(monster:MonsterState):void {
 const knockout=monster.knockout;if(!knockout||data(monster).episode)return
 data(monster).episode={id:`ko-${knockout.attackEventId}`,origin:'knockout',at:knockout.at,status:'stable',successes:0,failures:0,stableAt:knockout.at,
  knockoutAttackEventId:knockout.attackEventId,
  ...(knockout.independentUnconscious?{independentUnconscious:true}:{})}
}
function dropDyingEvent(episode:NpcLifeEpisode){delete episode.nextSaveAt;delete episode.timeEventId;delete episode.turnEventId;delete episode.eligibleTurnKey;delete episode.recovery;delete episode.stableAt}
function unconscious(monster:MonsterState){if(!monster.conditions.includes('unconscious'))monster.conditions.push('unconscious');if(!sourceImmune(monster,'prone')&&!monster.conditions.includes('prone'))monster.conditions.push('prone')}
export function recordNpcDeath(monster:MonsterState,reason:'failed_saves'|'massive_damage'|'source_effect'){
 const observation=monster.npcLife?.legacyObservation;if(observation&&!observation.resolution)observation.resolution={kind:'actual_death',at:now()}
 monster.isAlive=false;delete monster.knockout
 const episode=monster.npcLife?.episode;if(episode){const existing=episode.status==='dead'?episode.deathReason:undefined;dropDyingEvent(episode);episode.status='dead';episode.deathReason=existing??reason}
 gs.recordActualDeath(monster.id)
 const concentration=gs.getState().hero?.concentrationIds[monster.id]
 if(concentration)removeHeroEffect(concentration)
 for(const effect of [...gs.getState().hero?.effects??[]])if(effect.kind==='grapple'&&(effect.sourceId===monster.id||effect.targetIds.includes(monster.id)))removeHeroEffect(effect.id)
 if(gs.getMonster(monster.id)===monster){endInvisibility(monster.id);reconcileMonsterEffects()}
}
/** Actual source destruction; the caller already resolved its source exceptions
 * (such as Death Ward). Never route this through damage/temporary HP. */
export function killActiveNpcBySource(id:string){
 const monster=gs.getMonster(id)??refuse('NPC_LIFE_ACTOR_REQUIRED','A source destruction requires its actual active NPC stat block.')
 const before=monster.hp.current
 monster.hp.current=0;recordNpcDeath(monster,'source_effect')
 return {entityId:id,hpBefore:before,hpAfter:0,dead:true,deathReason:monster.npcLife?.episode?.deathReason??'source_effect',damageDealt:0}
}
/** Suffocation is neither received damage nor instant source destruction. */
export function dropNpcForSuffocation(event:BreathingCollapseEvent):void {
 const monster=persistedNpc(event.entityId)?.monster??refuse('NPC_LIFE_ACTOR_REQUIRED','Suffocation requires the actual persisted actor, without activating its archive.')
 if(!monster.isAlive)refuse('ENTITY_DEAD','A breathing collapse cannot restart a dead creature.')
 const before=monster.hp.current,old=monster.npcLife?.episode
 if(!monster.npcLife?.policy&&(!old||before>0))refuse('BREATHING_NPC_LIFE_POLICY_REQUIRED','This actual new zero-HP episode needs its policy declared before injury.')
 if(sourceImmune(monster,'unconscious'))refuse('NPC_LIFE_CONDITION_IMMUNE','The actual source cannot enter this supported unconscious life cycle.')
 monster.hp.current=0
 clearBreathingBlockedRecovery(monster.id,old?.id)
 if(!old)data(monster).episode=dyingEpisode(monster,'policy',event.at)
 else if(old.status==='stable'){
  dropDyingEvent(old);old.status='dying';old.successes=0;old.failures=0
  old.nextSaveAt=event.at+6;old.timeEventId=npcTimeEventId(old.id,old.nextSaveAt)
  if(event.scope==='turn')old.enteredTurnKey=event.turnKey
 }
 delete monster.knockout
 unconscious(monster)
 const concentration=gs.getState().hero?.concentrationIds[monster.id]
 if(concentration)removeHeroEffect(concentration)
 for(const effect of [...gs.getState().hero?.effects??[]])if(effect.kind==='grapple'&&effect.sourceId===monster.id)removeHeroEffect(effect.id)
}
export function clearNpcEpisodeOnHealing(monster:MonsterState,at=now()):void {
 const observation=monster.npcLife?.legacyObservation
 if(observation&&!observation.resolution&&observation.input.observedState==='living_zero_unresolved'&&monster.hp.current>0){observation.resolution={kind:'healed',at};if(!hasIndependentUnconscious(gs.getState(),monster.id,at))monster.conditions=monster.conditions.filter(c=>c!=='unconscious')}
 const episode=monster.npcLife?.episode,independent=episode?.independentUnconscious||monster.knockout?.independentUnconscious
 if(!episode&&!monster.knockout)return
 clearBlockedBreathingStabilization(monster.id,episode?.id)
 clearBreathingBlockedRecovery(monster.id,episode?.id)
 delete monster.npcLife?.episode;delete monster.knockout
 if(!independent&&!hasIndependentUnconscious(gs.getState(),monster.id,at))monster.conditions=monster.conditions.filter(condition=>condition!=='unconscious')
}

/** Called after actual HP assignment and temporary HP resolution, before death
 * consequences. No save, policy or source statistics is inferred here. */
export function reconcileNpcHpChange(monster:MonsterState,hpBefore:number,received:number,hpDamage:number,critical=false,knockoutCreated=false,independentUnconscious=false):void {
 if(monster.hp.current>0){clearNpcEpisodeOnHealing(monster);monster.isAlive=true;return}
 if(knockoutCreated){trackStableKnockout(monster);monster.isAlive=true;return}
 if(hpBefore>0){
  if(!monster.npcLife?.policy){monster.isAlive=false;return}
  const episode=data(monster).episode=dyingEpisode(monster,'policy',now())
  if(independentUnconscious)episode.independentUnconscious=true
  monster.isAlive=true;unconscious(monster)
  if(hpDamage-hpBefore>=monster.hp.max)recordNpcDeath(monster,'massive_damage')
  return
 }
 if(!monster.isAlive||received<=0)return
 if(!monster.npcLife?.episode&&monster.knockout)trackStableKnockout(monster)
 const episode=monster.npcLife?.episode
 if(!episode)refuse('NPC_ZERO_HP_UNTRACKED','A living NPC at zero HP must have a real KO or configured death-save episode.')
 if(episode!.status==='dead')return
 const lastResolvedTurnKey=episode!.lastResolvedTurnKey,eligibleTurnKey=episode!.eligibleTurnKey,turnEventId=episode!.turnEventId,
  priorNextSaveAt=episode!.nextSaveAt,wasDying=episode!.status==='dying'
 if(!wasDying)clearBreathingBlockedRecovery(monster.id,episode!.id)
 delete monster.knockout;dropDyingEvent(episode!)
 episode!.status='dying';episode!.failures=Math.min(3,episode!.failures+(critical?2:1))
 episode!.nextSaveAt=wasDying?priorNextSaveAt!:now()+6;episode!.timeEventId=npcTimeEventId(episode!.id,episode!.nextSaveAt)
 episode!.lastResolvedTurnKey=lastResolvedTurnKey
 if(wasDying){episode!.eligibleTurnKey=eligibleTurnKey;episode!.turnEventId=turnEventId}
 else if(gs.getState().phase==='combat'&&gs.getState().currentTurn===monster.id)episode!.enteredTurnKey=npcTurnKey(gs.getState(),monster.id)
 if(received>=monster.hp.max)recordNpcDeath(monster,'massive_damage')
 else if(episode!.failures>=3)recordNpcDeath(monster,'failed_saves')
 else {monster.isAlive=true;unconscious(monster)}
}

export function startNpcDeathSaveTurn(id:string|null):void {
 if(!id||id==='player')return
 const monster=gs.getMonster(id);if(!monster||!isDyingNpc(monster))return
 const episode=monster.npcLife!.episode!,key=npcTurnKey(gs.getState(),id)
 if(episode.enteredTurnKey===key)return
 episode.eligibleTurnKey=key;episode.turnEventId=npcTurnEventId(episode.id,key)
}
export function npcDeathSaveEvent(monster:MonsterState,state=gs.getState()){
 if(!isDyingNpc(monster))return undefined
 const episode=monster.npcLife!.episode!,active=state.monsters[monster.id]===monster
 if(active&&state.phase==='combat'&&state.initiativeOrder.includes(monster.id)){
  const key=npcTurnKey(state,monster.id)
  if(state.currentTurn!==monster.id||episode.enteredTurnKey===key||episode.eligibleTurnKey!==key||episode.lastResolvedTurnKey===key)return undefined
  return {entityId:monster.id,eventId:npcTurnEventId(episode.id,key),episodeId:episode.id,scope:'turn' as const,turnKey:key,at:state.worldTimeSeconds??0}
 }
 if((state.worldTimeSeconds??0)<episode.nextSaveAt!)return undefined
 return {entityId:monster.id,eventId:npcTimeEventId(episode.id,episode.nextSaveAt!),episodeId:episode.id,scope:'time' as const,at:episode.nextSaveAt!}
}
export function dueNpcDeathSaveEvents(){return persistedKnockoutActors(gs.getState()).flatMap(({monster})=>{const event=npcDeathSaveEvent(monster);return event?[event]:[]})}
export function assertNpcLifeTimeAdvance(seconds:number):void {
 if(seconds<=0)return
 const state=gs.getState(),end=now()+seconds
 const unknown=persistedKnockoutActors(state).filter(({monster})=>hasUnresolvedNpcLifeObservation(monster)&&end>monster.npcLife!.legacyObservation!.at+6)
 if(unknown.length)refuse('NPC_LIFE_HISTORY_UNRESOLVED','Past stability/counters are unknown. This conservative present-observation bound is not an old death-save date. A genuine heal or Medicine stabilization remains possible now without advancing time; no history, automatic save or extra action is invented.',{entityIds:unknown.map(a=>a.monster.id),uncertaintyBoundaryAt:Math.min(...unknown.map(a=>a.monster.npcLife!.legacyObservation!.at+6))})
 const blocked=persistedKnockoutActors(state).filter(({monster,active})=>isDyingNpc(monster)
  &&!(active&&state.phase==='combat'&&state.initiativeOrder.includes(monster.id))&&end>monster.npcLife!.episode!.nextSaveAt!)
 if(blocked.length)refuse('NPC_DEATH_SAVE_EVENT_REQUIRED','Resolve each actual due NPC death save explicitly before advancing beyond its six-second boundary; archived actors are not activated.',{
  events:blocked.map(({monster})=>({entityId:monster.id,eventId:monster.npcLife!.episode!.timeEventId,at:monster.npcLife!.episode!.nextSaveAt,episodeId:monster.npcLife!.episode!.id}))})
}
export function assertNpcTurnDeathSaveResolved(id:string):void {
 const monster=gs.getMonster(id),event=monster?npcDeathSaveEvent(monster):undefined
 if(event?.scope==='turn')refuse('NPC_DEATH_SAVE_EVENT_REQUIRED','This NPC must resolve its actual start-of-turn death save before this turn can end.',{events:[event]})
}
export function assertNpcCombatRoster(combatants:readonly string[]):void {
 const state=gs.getState();if(state.phase==='combat')return
 const omitted=Object.values(state.monsters).filter(monster=>isDyingNpc(monster)&&!combatants.includes(monster.id))
 if(omitted.length)refuse('NPC_DYING_COMBATANT_REQUIRED','Resolve these actual dying NPCs in exploration, or explicitly include them in enter_combat for their saving-throw turns. A new encounter cannot silently omit them or invent their initiative.',{
  actors:omitted.map(monster=>({entityId:monster.id,episodeId:monster.npcLife!.episode!.id,nextSaveAt:monster.npcLife!.episode!.nextSaveAt,eventId:monster.npcLife!.episode!.timeEventId}))})
 const hazards=npcRoundEventVictims(state,Number.POSITIVE_INFINITY,combatants,false)
 if(hazards.length)refuse('NPC_ROUND_EVENT_ROSTER_REQUIRED','A tracked active NPC omitted from this new combat is on a real pending authored damage-event path. Resolve its placement or explicitly include an eligible actor before combat; no initiative is invented.',{victims:hazards})
}
/** Read-only victims of existing authored round events only. Infinity is the
 * explicitly conservative entry preflight; finite rounds keep real triggers. */
export function npcRoundEventVictims(state:GameState,nextRound:number,combatants:readonly string[]=state.initiativeOrder,requireActualTrigger=true){
 const map=getMapSpec(state.currentMapId,state),completed=completedRoundEvents(state),actors=[state.player,...Object.values(state.monsters)]
 return (map.roundEvents??[]).filter(event=>nextRound>event.afterRound&&!completed[event.id]
  &&(!requireActualTrigger||actors.some(actor=>(actor.id==='player'?!state.player.deathSaves?.dead:'isAlive'in actor&&actor.isAlive)
   &&inferRoomIdOnMap(actor.position,map.id,state)===event.roomId)))
  .flatMap(event=>Object.values(state.monsters).filter(monster=>monster.isAlive&&!combatants.includes(monster.id)
   &&(monster.npcLife?.policy||monster.npcLife?.episode||monster.knockout)
   &&event.path.some(cell=>cell.x===monster.position.x&&cell.y===monster.position.y))
   .map(monster=>({entityId:monster.id,eventId:event.id,afterRound:event.afterRound,mapId:map.id})))
}
export function assertNpcRoundEventRoster(nextRound:number):void {
 const victims=npcRoundEventVictims(gs.getState(),nextRound)
 if(victims.length)refuse('NPC_ROUND_EVENT_ROSTER_REQUIRED','This next real authored round event could injure a tracked NPC omitted from initiative. The unsupported tick is refused before effects, time, logs or damage dice.',{victims,nextRound})
}
export function assertNpcDamageRosterSupported(monster:MonsterState):void {
 const state=gs.getState()
 if(state.phase==='combat'&&state.monsters[monster.id]===monster&&!state.initiativeOrder.includes(monster.id)
  &&(monster.npcLife?.policy||monster.npcLife?.episode||monster.knockout))
  refuse('NPC_DEATH_SAVE_ROSTER_REQUIRED','This tracked active NPC is absent from the current combat roster. Harm could require an actual saving-throw turn; the unsupported action is refused before dice/costs instead of creating an orphaned zero-HP actor.',{entityId:monster.id})
}
export function stabilizeNpc(monster:MonsterState):void {
 assertBreathingRecoveryAllowed(monster.id)
 if(!isNpcStabilizationCandidate(monster))refuse('STABILIZATION_TARGET_INVALID','Choose a living unstable tracked NPC at exactly zero HP.')
 if(hasUnresolvedNpcLifeObservation(monster)){const observation=monster.npcLife!.legacyObservation!;observation.resolution={kind:'stabilized',at:now()};data(monster).episode={id:`observed-stable:${observation.input.eventId}`,origin:'observation',at:now(),status:'stable',successes:0,failures:0,stableAt:now()}}
 const episode=monster.npcLife!.episode!,hours=rollDice('1d4').total
 clearBlockedBreathingStabilization(monster.id,episode.id);clearBreathingBlockedRecovery(monster.id,episode.id);delete episode.breathingBlockedStabilization
 dropDyingEvent(episode);episode.status='stable';episode.successes=0;episode.failures=0;episode.stableAt=now();episode.recovery={hours,wakeAt:now()+hours*3600}
 unconscious(monster)
}
export function validateNpcLifeState(state:GameState):{valid:boolean;errors:string[]}{
 const errors=[...Object.values(state.npcs??{}).filter(n=>n.npcLife?.legacyObservation).flatMap(n=>validateLegacyNpcLifeObservation(n as MonsterState,state)),...persistedKnockoutActors(state).flatMap(({monster})=>[...npcLifeValidation(monster,state.worldTimeSeconds??0),...validateLegacyNpcLifeObservation(monster,state),...npcBreathingWitnessValidation(monster,state),...validateNpcHealingRecovery(state,monster)])]
 for(const {monster,active}of persistedKnockoutActors(state)){
  const episode=monster.npcLife?.episode
  if(!episode){if(Object.values(monster.npcLife?.receipts??{}).some(receipt=>receipt.status==='pending'))errors.push(`NPC ${monster.id} has a held receipt without a current zero-HP episode.`);continue}
  if(active&&state.phase==='combat'&&episode.status==='dying'&&!state.initiativeOrder.includes(monster.id))
   errors.push(`Dying active NPC ${monster.id} cannot be omitted from its actual combat roster.`)
  if(episode.status==='stable'&&episode.recovery&&(state.worldTimeSeconds??0)>=episode.recovery.wakeAt&&!breathingBlockedRecoveryOf(monster.id,state)&&!(monster.knockout?.recovery??episode.recovery).healingHold)
   errors.push(`NPC ${monster.id} has an already-due stable recovery; loading never heals.`)
  if(episode.status==='dying'&&!(active&&state.phase==='combat'&&state.initiativeOrder.includes(monster.id))
   &&(state.worldTimeSeconds??0)>episode.nextSaveAt!)errors.push(`NPC ${monster.id} skipped its required six-second death-save event.`)
  for(const [eventId,receipt]of Object.entries(monster.npcLife?.receipts??{}))if(receipt.status==='pending'){
   const pending=state.hero?.pending,event=npcDeathSaveEvent(monster,state)
   if(pending?.command.type!=='npc-death-save'||pending.command.entityId!==monster.id||pending.command.eventId!==eventId
    ||event?.eventId!==eventId||receipt.command!==JSON.stringify({entityId:monster.id,eventId}))
    errors.push(`NPC ${monster.id} has an unmatched held death-save receipt.`)
  }
 }
 const resolution=state.hero?.pending?.command.toolkitResolution as {domain?:string;command?:Record<string,unknown>}|undefined
 if(resolution?.domain==='combat-simple'&&resolution.command?.action==='stabilize'&&typeof resolution.command.targetId==='string'&&resolution.command.targetId!=='player'){
  const target=state.monsters[String(resolution.command.targetId)]??state.npcs?.[String(resolution.command.targetId)] as MonsterState|undefined,actorId=String(resolution.command.actorId),actor=actorId==='player'?state.player:state.monsters[actorId]??state.npcs?.[actorId] as MonsterState|undefined
  if(!target||!isNpcStabilizationCandidate(target)||!npcStabilizationMatches(target,resolution.command)||!actor||actor.hp.current<=0
   ||actor.conditions.some(condition=>['incapacitated','unconscious','paralyzed','stunned','petrified'].includes(condition))
   ||state.phase==='combat'&&state.currentTurn!==actorId)
    errors.push('The held NPC medicine check no longer matches its exact unstable episode and conscious active helper.')
 }
 return {valid:errors.length===0,errors}
}
