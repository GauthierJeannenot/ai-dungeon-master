import { z } from 'zod'
import type { GameState } from './types'
import { breathingStateOf,type BreathingBlockedStabilization } from './breathing-state'

const Id=z.string().min(1).max(180).refine(value=>!['__proto__','constructor','prototype'].includes(value))
export const PlayerLifeCheckpointSchema=z.object({eventId:Id,reason:z.string().trim().min(1).max(1000)}).strict()
export const PlayerDyingEpisodeSchema=z.object({
  id:Id,source:z.enum(['damage_fall','damage_at_zero','checkpoint','combat_observation']),
  sourceEventId:z.string().min(1).max(500),reason:z.string().min(1).max(1000),
  startedAt:z.number().nonnegative(),nextSaveAt:z.number().nonnegative(),sequence:z.number().int().positive(),
  skipCombatTurnKey:z.string().min(1).max(300).optional(),eligibleTurnKey:z.string().min(1).max(300).optional(),
  lastResolvedTurnKey:z.string().min(1).max(300).optional(),lastResolvedAt:z.number().nonnegative().optional(),
}).strict().superRefine((episode,ctx)=>{
  if(episode.nextSaveAt<episode.startedAt+6||episode.lastResolvedAt!==undefined&&(episode.lastResolvedAt<episode.startedAt||episode.nextSaveAt<episode.lastResolvedAt+6))
    ctx.addIssue({code:'custom',message:'Real death-save boundaries must retain the actual observation/fall and monotonically follow their latest actual save.'})
})
export const PlayerLifeStateSchema=z.object({
  version:z.literal(1),episode:PlayerDyingEpisodeSchema.optional(),
  lastSaveEventId:z.string().min(1).max(500).optional(),
  saveReceipts:z.record(z.string(),z.object({episodeId:Id,at:z.number().nonnegative(),scope:z.enum(['time','turn']),
    source:z.object({kind:z.enum(['damage_fall','damage_at_zero','checkpoint','combat_observation']),sourceEventId:z.string().min(1).max(500),
      startedAt:z.number().nonnegative(),reason:z.string().min(1).max(1000)}).strict(),
    turnKey:z.string().min(1).max(300).optional(),result:z.record(z.string(),z.unknown())}).strict()),
  checkpoints:z.record(z.string(),z.object({command:z.string(),result:z.record(z.string(),z.unknown())}).strict()),
  lastClosed:z.object({episode:PlayerDyingEpisodeSchema,at:z.number().nonnegative(),reason:z.enum(['healed','stable','dead'])}).strict().optional(),
}).strict().superRefine((state,ctx)=>{
  if(Object.keys(state.saveReceipts).length>256||Object.keys(state.checkpoints).length>128)
    ctx.addIssue({code:'custom',message:'Retained player save/checkpoint histories are bounded and never evicted.'})
  if(state.lastClosed&&state.lastClosed.at<state.lastClosed.episode.startedAt)
    ctx.addIssue({code:'custom',message:'A real life episode cannot end before its source observation.'})
  if(state.episode?.id===state.lastClosed?.episode.id&&state.episode)
    ctx.addIssue({code:'custom',message:'A player life episode cannot be both open and closed.'})
})
export type PlayerLifeState=z.infer<typeof PlayerLifeStateSchema>
export type PlayerDyingEpisode=z.infer<typeof PlayerDyingEpisodeSchema>
export function playerLifeStateOf(state:GameState):PlayerLifeState|undefined {
 return (state.dmTools as (NonNullable<GameState['dmTools']>&{playerLife?:PlayerLifeState})|undefined)?.playerLife
}
export function playerLifeEpisodeId(state:GameState):string|undefined {
 return playerLifeStateOf(state)?.episode?.id??breathingStateOf(state)?.creatures.player?.playerDying?.lifeEpisodeId
}
/** The source-specific breathing exception accepts only real saved rolls of
 * this exact life, including an actual third success before a later failure. */
export function hasGeneralPlayerSaveWitness(marker:BreathingBlockedStabilization,state:GameState):boolean {
 const receipts=playerLifeStateOf(state)?.saveReceipts??{},receipt=receipts[marker.eventId]
 return Boolean(receipt&&receipt.episodeId===marker.lifeEpisodeId&&receipt.at===marker.at&&receipt.result.successes===3
  &&Object.values(receipts).some(previous=>previous.episodeId===marker.lifeEpisodeId&&previous.at<=receipt.at
    &&previous.result.success===true&&previous.result.successes===3))
}
