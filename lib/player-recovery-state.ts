import { z } from 'zod'
import type { GameState } from './types'

const RecoveryId=z.string().min(1).max(180)
export const PlayerStableRecoverySchema=z.object({
  id:RecoveryId,
  source:z.literal('phb2014_stabilization'),
  stabilizedAt:z.number().nonnegative(),
  hours:z.number().int().min(1).max(4),
  wakeAt:z.number().nonnegative(),
  heldByBreathing:z.object({
    breathingEpisodeId:RecoveryId,blockedAt:z.number().nonnegative(),
    airEventId:RecoveryId.optional(),resumedAt:z.number().nonnegative().optional(),
  }).strict().optional(),
}).strict().superRefine((episode,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message})
  if(episode.wakeAt!==episode.stabilizedAt+episode.hours*3600)
    fail('A stable recovery retains its true stabilization time and its single real d4 result.')
  const held=episode.heldByBreathing
  if(held&&(held.blockedAt!==episode.wakeAt||Boolean(held.airEventId)!==(held.resumedAt!==undefined)
    ||held.resumedAt!==undefined&&held.resumedAt<held.blockedAt))
    fail('A held natural recovery requires its exact due boundary and an actual later air event.')
})
export const PlayerRecoveryStateSchema=z.object({
  version:z.literal(1),
  episode:PlayerStableRecoverySchema.optional(),
  lastClosed:z.object({
    episode:PlayerStableRecoverySchema,at:z.number().nonnegative(),
    reason:z.enum(['damage','healed','death','source_collapse','recovered','healing_prevented']),
  }).strict().optional(),
}).strict().superRefine((state,ctx)=>{
  if(state.lastClosed&&state.lastClosed.at<state.lastClosed.episode.stabilizedAt)
    ctx.addIssue({code:'custom',message:'A source recovery cannot close before the real stabilization.'})
  if(state.lastClosed&&['recovered','healing_prevented'].includes(state.lastClosed.reason)&&state.lastClosed.at<state.lastClosed.episode.wakeAt)
    ctx.addIssue({code:'custom',message:'A natural recovery cannot be attempted before its actual d4-hour deadline.'})
  if(state.episode&&state.lastClosed?.episode.id===state.episode.id)
    ctx.addIssue({code:'custom',message:'The same recovery cannot be both open and closed.'})
})
export type PlayerStableRecovery=z.infer<typeof PlayerStableRecoverySchema>
export type PlayerRecoveryState=z.infer<typeof PlayerRecoveryStateSchema>
export type PlayerRecoveryCloseReason=NonNullable<PlayerRecoveryState['lastClosed']>['reason']
export function playerRecoveryStateOf(state:GameState):PlayerRecoveryState|undefined {
  return (state.dmTools as (NonNullable<GameState['dmTools']>&{playerRecovery?:PlayerRecoveryState})|undefined)?.playerRecovery
}
