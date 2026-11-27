import type { GameState } from '../lib/types'
import { breathingStateOf, type BreathingBlockedStabilization, type SuffocationPlayerDying } from '../lib/breathing-state'
import type { BreathingCollapseEvent } from './breathing'
import { toolkitError } from './toolkit'
import * as gs from './game-state'
import { playerLifeStateOf,hasGeneralPlayerSaveWitness } from '../lib/player-life-state'
import { getPlayerDeathSaveEvent } from './player-life'

const recordOf = (state = gs.getState()) => breathingStateOf(state)?.creatures.player
const now = (state = gs.getState()) => state.worldTimeSeconds ?? 0
const dying = (state = gs.getState()) => state.player.hp.current === 0 && !state.player.deathSaves?.dead && !state.player.deathSaves?.stable
const turnKey = (state = gs.getState()) => `player-death:${state.combatGeneration ?? 0}:${state.turnCounter ?? 0}:player`
const temporalId = (life: SuffocationPlayerDying) => `suffocation-player:${life.lifeEpisodeId}:${life.sequence}`

export function startSuffocationPlayerDying(event: BreathingCollapseEvent, options: {skipCurrentTurn: boolean}) {
  if (event.entityId !== 'player') toolkitError('SUFFOCATION_PLAYER_REQUIRED', 'This source lifecycle belongs only to the actual player collapse.')
  const record = recordOf()
  if (!record) toolkitError('SUFFOCATION_PLAYER_SOURCE_REQUIRED', 'The actual breathing source record must already exist.')
  if(playerLifeStateOf(gs.getState())?.episode)return
  if (record!.playerDying) return
  record!.playerDying = {source:'suffocation',breathingEpisodeId:event.breathingEpisodeId,lifeEpisodeId:event.breathingEpisodeId,
    collapsedAt:event.at,nextSaveAt:event.at+6,sequence:1,
    ...(options.skipCurrentTurn && gs.getState().phase === 'combat' ? {skipCombatTurnKey:turnKey()} : {})}
}
export function clearSuffocationPlayerDying() {
  const record=recordOf()
  if (record) delete record.playerDying
}
export function isSuffocationPlayerCollapseTurn(state = gs.getState()) {
  return state.phase === 'combat' && state.currentTurn === 'player' && recordOf(state)?.playerDying?.skipCombatTurnKey === turnKey(state)
}
export function getSuffocationPlayerDeathSaveEvent(state = gs.getState()) {
  const life=recordOf(state)?.playerDying
  if (!life || state.phase === 'combat' || !dying(state) || life.nextSaveAt > now(state)) return null
  return {kind:'suffocation_player_death_save' as const,entityId:'player' as const,eventId:temporalId(life),
    lifeEpisodeId:life.lifeEpisodeId,breathingEpisodeId:life.breathingEpisodeId,at:life.nextSaveAt}
}
export function assertSuffocationPlayerTimeAdvance(seconds: number) {
  const state=gs.getState(),life=recordOf(state)?.playerDying
  if (seconds > 0 && state.phase !== 'combat' && life && dying(state) && now(state)+seconds > life.nextSaveAt)
    toolkitError('SUFFOCATION_PLAYER_DEATH_SAVE_PENDING', 'Resolve the exact due player death-save event before advancing beyond its next six-second bookkeeping turn.')
}
export function replaySuffocationPlayerDeathSave(eventId: string | undefined) {
  const receipts=recordOf()?.playerDeathSaveReceipts
  return eventId && receipts && Object.hasOwn(receipts,eventId) ? {...receipts[eventId].result,replayed:true} : undefined
}
export type SuffocationPlayerSaveContext = {eventId:string;breathingEpisodeId:string;lifeEpisodeId:string;at:number}
/** All refusal/capacity checks happen before the real d20, bonuses or costs. */
export function prepareSuffocationPlayerDeathSave(eventId?: string): SuffocationPlayerSaveContext | undefined {
  const state=gs.getState(),record=recordOf(),life=record?.playerDying
  if (state.phase !== 'combat') {
    const event=getSuffocationPlayerDeathSaveEvent(state)
    if (!event || !eventId || eventId !== event.eventId)
      toolkitError('SUFFOCATION_PLAYER_DEATH_SAVE_EVENT_REQUIRED', 'Select the exact due player event from inspect_breathing; no historical or legacy episode is reconstructed.')
    if (event!.at !== now(state)) toolkitError('SUFFOCATION_PLAYER_CLOCK_INVALID', 'The due save must be resolved at its actual six-second bookkeeping boundary.')
  } else {
    if (eventId) toolkitError('PLAYER_COMBAT_DEATH_SAVE_EVENT_UNEXPECTED', 'The combat player procedure uses its actual current turn, without a temporal event selector.')
    if (isSuffocationPlayerCollapseTurn(state)) toolkitError('SUFFOCATION_PLAYER_COLLAPSE_TURN', 'This is the actual collapse turn; the first death save belongs to the next player turn.')
  }
  const episode=record?.episode
  const source=life ?? (state.phase === 'combat' && dying(state) && episode
    && (episode.phase !== 'holding' || episode.breathEndsAt! <= now(state))
    ? {breathingEpisodeId:episode.id,lifeEpisodeId:episode.id} : undefined)
  if (!source) return undefined
  if (Object.keys(record!.playerDeathSaveReceipts ?? {}).length >= 256)
    toolkitError('SUFFOCATION_PLAYER_SAVE_HISTORY_LIMIT', 'The retained player suffocation death-save receipts are full; no witness is evicted to permit another roll.')
  return {eventId:eventId ?? turnKey(state),breathingEpisodeId:source.breathingEpisodeId,lifeEpisodeId:source.lifeEpisodeId,at:now(state)}
}
export function completeSuffocationPlayerDeathSave(context: SuffocationPlayerSaveContext | undefined, result: Record<string,unknown>) {
  if (!context) return
  const record=recordOf()
  if (!record) toolkitError('SUFFOCATION_PLAYER_SOURCE_REQUIRED', 'The actual source record cannot disappear during its death-save resolution.')
  record!.playerDeathSaveReceipts ??= {}
  record!.playerDeathSaveReceipts[context.eventId] = {source:'suffocation',breathingEpisodeId:context.breathingEpisodeId,
    lifeEpisodeId:context.lifeEpisodeId,at:context.at,result:structuredClone(result)}
  const life=record!.playerDying
  if (life && life.lifeEpisodeId === context.lifeEpisodeId) {
    if (!dying()) delete record!.playerDying
    else { life.sequence++; life.nextSaveAt=now()+6; delete life.skipCombatTurnKey }
  }
}
export function hasSuffocationPlayerDeathSaveWitness(marker: BreathingBlockedStabilization, state = gs.getState()) {
  if(hasGeneralPlayerSaveWitness(marker,state))return true
  const receipts=recordOf(state)?.playerDeathSaveReceipts ?? {},receipt=receipts[marker.eventId]
  return Boolean(receipt && receipt.lifeEpisodeId === marker.lifeEpisodeId && receipt.at === marker.at
    && receipt.result.successes === 3 && Object.values(receipts).some(previous => previous.lifeEpisodeId === marker.lifeEpisodeId
      && previous.at <= receipt.at && previous.result.success === true && previous.result.successes === 3))
}
export function suffocationPlayerSaveSnapshot(state = gs.getState()) {
  const record=recordOf(state),receipts=Object.entries(record?.playerDeathSaveReceipts ?? {})
  const general=playerLifeStateOf(state)?.episode
  const latest=receipts.at(-1)
  return {playerDeathSaveEvent:general?getPlayerDeathSaveEvent(state):getSuffocationPlayerDeathSaveEvent(state),
    ...(general?{playerDying:{source:general.source,lifeEpisodeId:general.id,startedAt:general.startedAt,nextSaveAt:general.nextSaveAt}}:{}),
    ...(record?.playerDying ? {playerDying:structuredClone(record.playerDying)} : {}),
    ...(latest ? {lastPlayerDeathSave:{eventId:latest[0],...structuredClone(latest[1])}} : {})}
}
export function validateSuffocationPlayerDying(state: GameState): string[] {
  const record=recordOf(state),life=record?.playerDying
  if (!life) return []
  const errors:string[]=[]
  if (!dying(state)) errors.push('A suffocation player life episode requires an actually dying zero-HP player.')
  if (life.collapsedAt > now(state) || state.phase !== 'combat' && life.nextSaveAt < now(state))
    errors.push('The source collapse and next death-save boundary must agree with the actual world clock.')
  if (record?.episode?.phase === 'collapsed' && record.episode.collapsedAt! < life.collapsedAt)
    errors.push('The active source collapse cannot precede its retained player life episode.')
  return errors
}
