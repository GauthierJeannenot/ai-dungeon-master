import type { GameState } from './types'

/** Pure forecast for a continuous, capable actor activity outside combat.
 * Waiting may legitimately reach a body collapse. Finishing manual work after
 * that loss of capability may not. Actual combat collapses belong to their
 * recorded own-turn engine and are never inferred from a time interval here. */
export function breathingActivityIssue(state:GameState,entityId:string,seconds:number){
  if(seconds<=0||state.phase==='combat'&&state.initiativeOrder.includes(entityId))return null
  const episode=state.dmTools?.breathing?.creatures[entityId]?.episode
  if(!episode)return null
  const now=state.worldTimeSeconds??0
  if(episode.phase==='collapsed')return{code:'ACTIVITY_BREATHING_BOUNDARY',entityId,boundaryAt:episode.collapsedAt??episode.collapseAt??now,
    message:'This actual breathing episode already caused collapse. No continuous capable work can be credited before real capability is restored.'}
  const collapseAt=episode.phase==='holding'?episode.breathEndsAt!+6*episode.graceRounds:episode.collapseAt!
  if(collapseAt<=now+seconds)return{code:'ACTIVITY_BREATHING_BOUNDARY',entityId,boundaryAt:collapseAt,
    message:'The actual breathing episode would incapacitate this actor by the end of the requested continuous work. Resolve that real boundary or restore actual air before committing work, resources or completion order.'}
  return null
}
