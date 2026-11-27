import { randomUUID } from 'node:crypto'
import type { GameState } from '../lib/types'
import { PlayerRecoveryStateSchema,playerRecoveryStateOf,type PlayerRecoveryState,type PlayerRecoveryCloseReason } from '../lib/player-recovery-state'
import { breathingStateOf } from '../lib/breathing-state'
import { breathingRecoveryBlocked } from './breathing'
import { rollDice } from './dice'
import { toolkitError,toolkitState } from './toolkit'
import * as gs from './game-state'

const now=(state=gs.getState())=>state.worldTimeSeconds??0
const stable=(state=gs.getState())=>state.player.hp.current===0&&state.player.deathSaves?.stable===true&&!state.player.deathSaves.dead
const knownPrevented=(state=gs.getState())=>playerRecoveryStateOf(state)?.lastClosed?.reason==='healing_prevented'
const data=():PlayerRecoveryState=>(toolkitState() as NonNullable<GameState['dmTools']>&{playerRecovery?:PlayerRecoveryState}).playerRecovery??={version:1}

/** Called only for the actual unstable -> stable transition, after its rule
 * has been resolved. Loading an already stable body must never call this. */
export function beginPlayerStableRecovery():void {
  if(!stable())toolkitError('PLAYER_STABILITY_SOURCE_REQUIRED','A real newly stabilized living zero-HP player is required; loading never creates a d4 witness.')
  if(playerRecoveryStateOf(gs.getState())?.episode)
    toolkitError('PLAYER_STABILITY_ALREADY_TRACKED','The existing true stabilization already has its one d4; a source cannot reroll or refresh it.')
  const roll=rollDice('1d4'),at=now()
  const episode={id:randomUUID(),source:'phb2014_stabilization' as const,stabilizedAt:at,hours:roll.total,wakeAt:at+roll.total*3600}
  data().episode=episode
  gs.addLogEntry({round:gs.getState().round,turn:'system',action:'Récupération stable du joueur programmée',mechanicalDetail:JSON.stringify({...episode,roll})})
}

export function closePlayerStableRecovery(reason:PlayerRecoveryCloseReason):void {
  const saved=playerRecoveryStateOf(gs.getState()),episode=saved?.episode
  if(!saved)return
  if(!episode){if(saved.lastClosed?.reason==='healing_prevented')saved.lastClosed={...saved.lastClosed,at:now(),reason};return}
  saved.lastClosed={episode:structuredClone(episode),at:now(),reason};delete saved.episode
}

/** Unknown old stability has no observed onset or d4. World-time zero gives
 * only a conservative first possible hour, never a claimed stabilization. */
export function assertPlayerRecoveryTimeAdvance(seconds:number):void {
  if(seconds>0&&stable()&&!playerRecoveryStateOf(gs.getState())?.episode&&!knownPrevented()&&now()+seconds>=3600)
    toolkitError('PLAYER_STABLE_RECOVERY_UNKNOWN','This legacy stable player has no observed stabilization time or d4. Its first possible hour remains unresolved; no time advance may cross it or restart it on reload. A real healing, damage or new stabilization event is required.')
}

export interface PlayerNaturalRecoveryEvent {
  entityId:'player';origin:'player_stability';episodeId:string;stabilizedAt:number;hours:number;wakeAt:number;
  recoveredAt:number;hpBefore:0;hpAfter:number;healing:number;healingPrevented:boolean
}
export function duePlayerStableRecovery(until:number):Array<{at:number;recover:()=>PlayerNaturalRecoveryEvent|undefined}> {
  const state=gs.getState(),episode=playerRecoveryStateOf(state)?.episode
  if(!episode||!stable(state)||episode.heldByBreathing&&episode.heldByBreathing.resumedAt===undefined)return []
  const at=episode.heldByBreathing?.resumedAt??episode.wakeAt
  if(at>until)return []
  return [{at,recover:()=>{
    if(playerRecoveryStateOf(gs.getState())?.episode!==episode||!stable())return undefined
    if(breathingRecoveryBlocked('player')){
      const breathing=breathingStateOf(gs.getState())?.creatures.player?.episode
      if(!breathing||now()!==episode.wakeAt)toolkitError('PLAYER_RECOVERY_BREATHING_WITNESS_REQUIRED','A natural recovery can only be held at its actual due boundary by its actual out-of-breath source.')
      episode.heldByBreathing={breathingEpisodeId:breathing!.id,blockedAt:episode.wakeAt};return undefined
    }
    // Close first so the ordinary positive-HP hook cannot mislabel this source
    // as an unrelated spell or potion. Specific healing limits still apply.
    closePlayerStableRecovery('recovered')
    gs.updatePlayerHP(1)
    const hpAfter=gs.getPlayer().hp.current,saved=playerRecoveryStateOf(gs.getState())
    if(hpAfter===0&&saved?.lastClosed?.episode.id===episode.id)saved.lastClosed.reason='healing_prevented'
    const event:PlayerNaturalRecoveryEvent={entityId:'player',origin:'player_stability',episodeId:episode.id,
      stabilizedAt:episode.stabilizedAt,hours:episode.hours,wakeAt:episode.wakeAt,recoveredAt:at,
      hpBefore:0,hpAfter,healing:hpAfter,healingPrevented:hpAfter===0}
    gs.addLogEntry({round:gs.getState().round,turn:'system',action:'Récupération naturelle du joueur stable',mechanicalDetail:JSON.stringify(event)})
    return event
  }}]
}

/** Called after the explicit air receipt has been written, before the shared
 * chronological loop resumes its already due natural-recovery source. */
export function resumePlayerStableRecoveryAfterAir(entityId:string,eventId:string):void {
  const episode=playerRecoveryStateOf(gs.getState())?.episode,held=episode?.heldByBreathing
  if(entityId!=='player'||!held||held.resumedAt!==undefined)return
  const receipt=breathingStateOf(gs.getState())?.creatures.player?.receipts[eventId]
  let command:{mode?:string;entityId?:string}|undefined
  try{command=receipt?JSON.parse(receipt.command):undefined}catch{/* invalid witness rejected below */}
  if(!stable()||command?.mode!=='air'||command.entityId!=='player'||receipt?.result.at!==now())
    toolkitError('PLAYER_RECOVERY_AIR_WITNESS_REQUIRED','Only an actual explicit player air event can resume this exact held natural recovery.')
  held.airEventId=eventId;held.resumedAt=now()
}

export function inspectPlayerRecovery():Record<string,unknown> {
  const state=gs.getState(),saved=playerRecoveryStateOf(state),legacy=stable(state)&&!saved?.episode&&!knownPrevented(state)
  return {entityId:'player',at:now(),stable:stable(state),hp:structuredClone(state.player.hp),
    recovery:saved?.episode?structuredClone(saved.episode):null,
    lastClosed:saved?.lastClosed?structuredClone(saved.lastClosed):null,
    legacyUnresolved:legacy,firstPossibleLegacyBoundary:legacy?3600:null,
    note:legacy?'Unknown original stabilization and d4; no history is reconstructed and reloading never restarts a timer.':undefined,
    source:'PHB 2014, chapter 9, Stabilizing a Creature.'}
}

export function validatePlayerRecoveryState(state:GameState):string[] {
  const saved=playerRecoveryStateOf(state)
  if(!saved)return []
  if(!PlayerRecoveryStateSchema.safeParse(saved).success)return ['Invalid persisted player stable recovery.']
  const errors:string[]=[],episode=saved.episode
  if(saved.lastClosed&&saved.lastClosed.at>now(state))errors.push('Player recovery closure cannot be in the future.')
  if(!episode)return errors
  if(!stable(state)||episode.stabilizedAt>now(state))errors.push('A player recovery belongs to its actual living stable zero-HP episode.')
  const held=episode.heldByBreathing
  if(!held){if(now(state)>=episode.wakeAt)errors.push('A saved player stable recovery skipped its real due boundary.');return errors}
  if(held.blockedAt>now(state))errors.push('An observed blocked recovery cannot be in the future.')
  const breathing=breathingStateOf(state)?.creatures.player
  if(held.resumedAt===undefined){
    if(breathing?.episode?.id!==held.breathingEpisodeId||!breathingRecoveryBlocked('player',state))
      errors.push('A held player stable recovery requires its exact actual out-of-breath episode.')
  }else{
    const receipt=held.airEventId?breathing?.receipts[held.airEventId]:undefined
    let command:{mode?:string;entityId?:string}|undefined
    try{command=receipt?JSON.parse(receipt.command):undefined}catch{/* rejected below */}
    if(held.resumedAt>now(state)||command?.mode!=='air'||command.entityId!=='player'||receipt?.result.at!==held.resumedAt)
      errors.push('A resumed player recovery needs the real exact actual-air receipt, without a backdated heal.')
  }
  return errors
}
