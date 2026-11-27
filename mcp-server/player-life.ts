import { randomUUID } from 'node:crypto'
import type { GameState } from '../lib/types'
import { breathingStateOf } from '../lib/breathing-state'
import { PlayerLifeStateSchema,PlayerLifeCheckpointSchema,playerLifeStateOf,playerLifeEpisodeId,
 type PlayerLifeState,type PlayerDyingEpisode } from '../lib/player-life-state'
import { clearSuffocationPlayerDying,completeSuffocationPlayerDeathSave,replaySuffocationPlayerDeathSave,hasSuffocationPlayerDeathSaveWitness } from './suffocation-player'
import { breathingRecoveryBlocked } from './breathing'
import { toolkitError,toolkitState } from './toolkit'
import * as gs from './game-state'

const now=(state=gs.getState())=>state.worldTimeSeconds??0
const dying=(state=gs.getState())=>state.player.hp.current===0&&!state.player.deathSaves?.dead&&!state.player.deathSaves?.stable
const turnKey=(state=gs.getState())=>`player-death:${state.combatGeneration??0}:${state.turnCounter??0}:player`
const legacy=(state=gs.getState())=>breathingStateOf(state)?.creatures.player?.playerDying
const data=():PlayerLifeState=>(toolkitState() as NonNullable<GameState['dmTools']>&{playerLife?:PlayerLifeState}).playerLife??={version:1,saveReceipts:{},checkpoints:{}}
function active(state=gs.getState()){
 const current=playerLifeStateOf(state)?.episode,old=legacy(state)
 if(current&&old)toolkitError('PLAYER_LIFE_DOUBLE_EPISODE','A player cannot have both a general and a source-specific dying clock.')
 return current?{storage:'general' as const,id:current.id,source:current.source,sourceEventId:current.sourceEventId,reason:current.reason,startedAt:current.startedAt,nextSaveAt:current.nextSaveAt,
  sequence:current.sequence,skipCombatTurnKey:current.skipCombatTurnKey,eligibleTurnKey:current.eligibleTurnKey,lastResolvedTurnKey:current.lastResolvedTurnKey}
  :old?{storage:'suffocation' as const,id:old.lifeEpisodeId,source:'suffocation' as const,sourceEventId:undefined,reason:'Actual recorded suffocation collapse; its original explicit context remains in the breathing history.',startedAt:old.collapsedAt,nextSaveAt:old.nextSaveAt,
    sequence:old.sequence,skipCombatTurnKey:old.skipCombatTurnKey,eligibleTurnKey:undefined,lastResolvedTurnKey:undefined}:undefined
}
function receiptCount(state=gs.getState()){
 return Object.keys(playerLifeStateOf(state)?.saveReceipts??{}).length
  +Object.keys(breathingStateOf(state)?.creatures.player?.playerDeathSaveReceipts??{}).length
}
function createEpisode(source:PlayerDyingEpisode['source'],sourceEventId:string,reason:string,skipCurrentTurn:boolean):PlayerDyingEpisode {
 const at=now(),state=gs.getState(),marker=breathingStateOf(state)?.creatures.player?.episode?.blockedStabilization
 const priorWitness=marker&&hasSuffocationPlayerDeathSaveWitness(marker,state)?marker.lifeEpisodeId:undefined
 const episode:PlayerDyingEpisode={id:priorWitness??randomUUID(),source,sourceEventId,reason,startedAt:at,nextSaveAt:at+6,sequence:1,
  ...(skipCurrentTurn&&state.phase==='combat'&&state.currentTurn==='player'?{skipCombatTurnKey:turnKey()}: {})}
 data().episode=episode;return episode
}

/** Actual received damage only. Never labels an ordinary damage fall as air deprivation. */
export function reconcilePlayerDamageLife(input:{hpBefore:number;wasStable:boolean;damageReceived:number}):void {
 if(input.damageReceived<=0||!dying()||active())return
 createEpisode(input.hpBefore>0?'damage_fall':'damage_at_zero',`player-damage:${randomUUID()}`,
  input.hpBefore>0?'Actual damage caused this observed positive-HP fall.':input.wasStable?'Actual damage ended this observed stable state.':'Actual damage observes an already dying legacy body without reconstructing its earlier fall.',true)
}
export function closePlayerDyingLife(reason:'healed'|'stable'|'dead'):void {
 const saved=playerLifeStateOf(gs.getState()),episode=saved?.episode
 if(saved&&episode){saved.lastClosed={episode:structuredClone(episode),at:now(),reason};delete saved.episode}
 clearSuffocationPlayerDying()
}
export function checkpointPlayerDying(raw:{eventId:string;reason:string}):Record<string,unknown> {
 const input=PlayerLifeCheckpointSchema.parse(raw),command=JSON.stringify(input),retained=playerLifeStateOf(gs.getState())?.checkpoints
 const old=retained&&Object.hasOwn(retained,input.eventId)?retained[input.eventId]:undefined
 if(old){if(old.command!==command)toolkitError('PLAYER_LIFE_CHECKPOINT_CONFLICT','This retained checkpoint has different immutable arguments.');return {...structuredClone(old.result),replayed:true}}
 if(gs.getState().hero?.pending)toolkitError('REACTION_PENDING','Resolve the held result before a different source observation.')
 if(!dying())toolkitError('PLAYER_NOT_DYING','Only the actual living unstable zero-HP player can receive a present-time dying checkpoint.')
 if(Object.keys(playerLifeStateOf(gs.getState())?.checkpoints??{}).length>=128)toolkitError('PLAYER_LIFE_CHECKPOINT_LIMIT','128 retained checkpoint events reached; none is evicted.')
 const existing=active(),episode=existing?undefined:createEpisode('checkpoint',input.eventId,input.reason,true)
 const result={entityId:'player',eventId:input.eventId,episodeId:existing?.id??episode!.id,observedAt:now(),
  nextSaveAt:existing?.nextSaveAt??episode!.nextSaveAt,alreadyTracked:Boolean(existing),pastReconstructed:false,actionSpent:false}
 data().checkpoints[input.eventId]={command,result};return result
}

/** The real start is a fact, not a rolled save or a fabricated MCP request. */
export function observePlayerDyingCombatEntry():void {
 const state=gs.getState()
 if(state.phase==='combat'&&state.initiativeOrder.includes('player')&&dying(state)&&!active())
  createEpisode('combat_observation',`combat-entry:${state.combatGeneration??0}:player`,'The explicitly selected combat roster observes the living zero-HP player now; no earlier fall is dated.',false)
}
export function startPlayerDyingTurn(id:string|null):void {
 const state=gs.getState()
 if(id!=='player'||state.phase!=='combat'||state.currentTurn!=='player'||!dying(state))return
 const view=active()
 const episode=!view?createEpisode('combat_observation',turnKey(),'The actually selected current turn observes a living zero-HP player; no earlier fall is dated.',false)
  :view.storage==='general'?playerLifeStateOf(state)!.episode:undefined
 if(episode&&episode.skipCombatTurnKey!==turnKey(state))episode.eligibleTurnKey=turnKey(state)
}
export function getPlayerDeathSaveEvent(state=gs.getState()){
 if(!dying(state))return null
 const view=active(state)
 if(!view)return null
 if(state.phase==='combat'){
  const key=turnKey(state)
  if(state.currentTurn!=='player'||view.skipCombatTurnKey===key||view.lastResolvedTurnKey===key
    ||view.storage==='general'&&view.eligibleTurnKey!==key||replayedPlayerDeathSave(key,state))return null
  return{kind:'player_death_save' as const,entityId:'player' as const,eventId:key,episodeId:view.id,scope:'turn' as const,turnKey:key,at:now(state)}
 }
 if(now(state)<view.nextSaveAt)return null
 return{kind:'player_death_save' as const,entityId:'player' as const,
  eventId:view.storage==='suffocation'?`suffocation-player:${view.id}:${view.sequence}`:`player-death-time:${view.id}:${view.sequence}`,
  episodeId:view.id,scope:'time' as const,at:view.nextSaveAt}
}
export function replayedPlayerDeathSave(eventId:string|undefined,state=gs.getState()):Record<string,unknown>|undefined {
 const key=eventId??(state.phase==='combat'&&state.currentTurn==='player'?turnKey(state):undefined)
 const retained=playerLifeStateOf(state)?.saveReceipts
 const receipt=key&&retained&&Object.hasOwn(retained,key)?retained[key]:undefined
 if(receipt)return{...structuredClone(receipt.result),replayed:true}
 if(state===gs.getState())return replaySuffocationPlayerDeathSave(key)
 const history=breathingStateOf(state)?.creatures.player?.playerDeathSaveReceipts
 const old=key&&history&&Object.hasOwn(history,key)?history[key]:undefined
 return old?{...structuredClone(old.result),replayed:true}:undefined
}
export interface PlayerDeathSaveContext {storage:'general'|'suffocation';episodeId:string;eventId:string;at:number;scope:'turn'|'time';turnKey?:string;breathingEpisodeId?:string;
 source?:{kind:PlayerDyingEpisode['source'];sourceEventId:string;startedAt:number;reason:string}}
export function preparePlayerDeathSave(eventId?:string):PlayerDeathSaveContext {
 const state=gs.getState()
 if(state.hero?.pending)toolkitError('REACTION_PENDING','Resolve the currently held result before another death save.')
 if(!dying(state))toolkitError(state.player.deathSaves?.dead?'PLAYER_DEAD':state.player.deathSaves?.stable?'PLAYER_STABLE':'PLAYER_NOT_DYING','A living unstable zero-HP player is required.')
 if(state.phase==='combat'&&state.currentTurn!=='player')toolkitError('PLAYER_TURN_REQUIRED','This is not the actual player turn.')
 if(receiptCount(state)>=256)toolkitError('PLAYER_DEATH_SAVE_HISTORY_LIMIT','The 256 retained player save witnesses are full; no old event is evicted and no die rolled.')
 if(state.phase==='combat'&&eventId&&eventId!==turnKey(state))toolkitError('PLAYER_DEATH_SAVE_EVENT_MISMATCH','Select this actual player turn event, or omit its selector; no arbitrary nonce is accepted.')
 if(!active()&&state.phase==='combat')toolkitError('PLAYER_LIFE_CHECKPOINT_REQUIRED','This old mid-turn snapshot does not prove zero HP at its start. Explicitly checkpoint the present body, then use its next actually started turn; no earlier save is reconstructed.')
 const view=active(),event=getPlayerDeathSaveEvent(state)
 if(!view||!event)toolkitError(view?.skipCombatTurnKey===turnKey(state)?'PLAYER_DEATH_SAVE_COLLAPSE_TURN':'PLAYER_DEATH_SAVE_EVENT_REQUIRED','Use the exact due event exposed by inspect_player_life. A newly observed own-turn fall cannot create a retroactive start-of-turn save.')
 if(state.phase!=='combat'&&(!eventId||eventId!==event!.eventId||event!.at!==now(state)))
  toolkitError('PLAYER_DEATH_SAVE_EVENT_REQUIRED','Select the exact current six-second event from inspect_player_life; no past turn or arbitrary nonce is reconstructed.')
 return{storage:view!.storage,episodeId:view!.id,eventId:event!.eventId,at:event!.at,scope:event!.scope,
  ...(view!.storage==='general'?{source:{kind:playerLifeStateOf(state)!.episode!.source,sourceEventId:playerLifeStateOf(state)!.episode!.sourceEventId,
    startedAt:view!.startedAt,reason:playerLifeStateOf(state)!.episode!.reason}}:{}),
  ...(event!.scope==='turn'?{turnKey:event!.turnKey}:{}),...(view!.storage==='suffocation'?{breathingEpisodeId:legacy(state)!.breathingEpisodeId}:{})}
}
export function completePlayerDeathSave(context:PlayerDeathSaveContext,result:Record<string,unknown>):void {
 if(context.storage==='suffocation'){
  completeSuffocationPlayerDeathSave({eventId:context.eventId,breathingEpisodeId:context.breathingEpisodeId!,lifeEpisodeId:context.episodeId,at:context.at},result)
  data().lastSaveEventId=context.eventId
  return
 }
 const saved=data()
 saved.saveReceipts[context.eventId]={episodeId:context.episodeId,at:context.at,scope:context.scope,source:context.source!,
  ...(context.turnKey?{turnKey:context.turnKey}:{}),result:structuredClone(result)}
 saved.lastSaveEventId=context.eventId
 const episode=saved.episode
 if(episode?.id===context.episodeId){
  if(!dying())closePlayerDyingLife(gs.getPlayer().deathSaves?.dead?'dead':gs.getPlayer().deathSaves?.stable?'stable':'healed')
  else {episode.sequence++;episode.lastResolvedAt=context.at;episode.nextSaveAt=Math.max(episode.nextSaveAt,context.at+6)
   if(context.scope==='turn')episode.lastResolvedTurnKey=context.turnKey;delete episode.skipCombatTurnKey}
 }
}
export function assertPlayerLifeTimeAdvance(seconds:number):void {
 if(seconds<=0||gs.getState().phase==='combat'||!dying())return
 const view=active()
 if(!view)toolkitError('PLAYER_LIFE_CHECKPOINT_REQUIRED','This old dying body has no observed fall or scheduled save. Read inspect_player_life and explicitly checkpoint its present state; loading never reconstructs earlier saves.')
 if(now()+seconds>view!.nextSaveAt)toolkitError('PLAYER_DEATH_SAVE_PENDING','Resolve the exact due player save before crossing its six-second boundary.')
}
export function assertPlayerTurnSaveResolved():void {
 if(gs.getState().phase==='combat'&&gs.getState().currentTurn==='player'&&getPlayerDeathSaveEvent())
  toolkitError('PLAYER_DEATH_SAVE_PENDING','The actual start-of-turn player save must be explicitly resolved before ending this turn or combat; skipAction does not skip a source event.')
}
export function inspectPlayerLife():Record<string,unknown> {
 const state=gs.getState(),view=active(state),lastId=playerLifeStateOf(state)?.lastSaveEventId
 const own=playerLifeStateOf(state)?.saveReceipts,older=breathingStateOf(state)?.creatures.player?.playerDeathSaveReceipts
 const last=lastId?(own&&Object.hasOwn(own,lastId)?own[lastId]:older&&Object.hasOwn(older,lastId)?older[lastId]:undefined):undefined
 return{entityId:'player',at:now(),dying:dying(state),hp:structuredClone(state.player.hp),deathSaves:structuredClone(state.player.deathSaves),
  episode:view?structuredClone(view):null,event:getPlayerDeathSaveEvent(state),legacyUnresolved:dying(state)&&!view,
  lastClosed:playerLifeStateOf(state)?.lastClosed?structuredClone(playerLifeStateOf(state)!.lastClosed):null,
  lastSave:last?{eventId:lastId,...structuredClone(last)}:null,
  actionSpent:false,source:'PHB 2014, chapter9 Death Saving Throws. Saves belong to the real start of turn, never to the normal action.'}
}
export function validatePlayerLifeState(state:GameState):string[] {
 const saved=playerLifeStateOf(state),old=legacy(state),errors:string[]=[]
 if(saved&&!PlayerLifeStateSchema.safeParse(saved).success)return['Invalid persisted player life state.']
 if(saved?.episode&&old)return['A player cannot have two independent dying clocks.']
 if(receiptCount(state)>256)errors.push('Player save witnesses exceed their bounded non-evicting history.')
 if(Object.keys(saved?.saveReceipts??{}).some(key=>Object.hasOwn(breathingStateOf(state)?.creatures.player?.playerDeathSaveReceipts??{},key)))
  errors.push('The same actual player save event cannot belong to two independent receipt stores.')
 const view=active(state)
 if(view&&(!dying(state)||view.startedAt>now(state)||state.phase!=='combat'&&now(state)>view.nextSaveAt))
  errors.push('The actual player dying episode skipped its source time or no longer matches a living unstable zero-HP player.')
 if(view){
  const resolved=view.storage==='general'?Object.values(saved?.saveReceipts??{}).filter(receipt=>receipt.episodeId===view.id)
   :Object.values(breathingStateOf(state)?.creatures.player?.playerDeathSaveReceipts??{}).filter(receipt=>receipt.lifeEpisodeId===view.id&&receipt.at>=view.startedAt)
  const latest=resolved.length?Math.max(...resolved.map(receipt=>receipt.at)):undefined
  if(view.sequence!==resolved.length+1||latest!==undefined&&view.nextSaveAt<latest+6)
   errors.push('The player save sequence cannot rewind, repeat a retained event or skip its real next boundary.')
  if(view.storage==='general'&&saved!.episode!.lastResolvedAt!==latest)
   errors.push('The player next-save clock must retain its exact latest real resolution.')
 }
 if(saved?.lastClosed&&saved.lastClosed.at>now(state))errors.push('Player life closure cannot be in the future.')
 for(const [key,receipt]of Object.entries(saved?.saveReceipts??{})){
  if(receipt.at>now(state)||receipt.source.startedAt>receipt.at||receipt.result.eventId!==key||receipt.result.episodeId!==receipt.episodeId||receipt.result.at!==receipt.at
    ||receipt.scope==='turn'&&receipt.turnKey!==key||receipt.scope==='time'&&receipt.turnKey)
    errors.push('A retained player save must match its exact real event, episode, scope and timestamp.')
 }
 if(saved?.lastSaveEventId){
  const key=saved.lastSaveEventId,older=breathingStateOf(state)?.creatures.player?.playerDeathSaveReceipts
  const receipt=Object.hasOwn(saved.saveReceipts,key)?saved.saveReceipts[key]:older&&Object.hasOwn(older,key)?older[key]:undefined
  if(!receipt||receipt.at>now(state))errors.push('The last real player save requires its retained exact source receipt.')
 }
 if(state.player.hp.current===0&&!state.player.deathSaves?.dead){
  if((state.player.deathSaves?.failures??0)>=3)errors.push('Three actual failures cannot remain a living player.')
  if((state.player.deathSaves?.successes??0)>=3&&!state.player.deathSaves?.stable){
   const marker=breathingStateOf(state)?.creatures.player?.episode?.blockedStabilization
   if(!breathingRecoveryBlocked('player',state)||!marker||marker.lifeEpisodeId!==(playerLifeEpisodeId(state)??marker.breathingEpisodeId)
     ||!hasSuffocationPlayerDeathSaveWitness(marker,state))errors.push('A third-success dying player requires its exact real blocked-air save witness.')
  }
 }
 return errors
}
