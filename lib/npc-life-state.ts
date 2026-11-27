import { z } from 'zod'
import { LegacyNpcLifeObservationSchema } from './legacy-npc-life-state'
import type { GameState, MonsterState } from './types'
import { BreathingBlockedStabilizationSchema, breathingStateOf } from './breathing-state'

export const NpcRecoverySchema=z.object({hours:z.number().int().min(1).max(4),wakeAt:z.number().nonnegative(),
 healingHold:z.object({blockedAt:z.number().nonnegative(),maximumAtBlock:z.number().nonnegative(),
  sources:z.array(z.object({id:z.string().min(1),damage:z.number().positive()}).strict()).min(1),
  availableAt:z.number().nonnegative().optional()}).strict().optional(),
}).strict()
export const NpcLifePolicySchema=z.object({eventId:z.string().min(1).max(180),reason:z.string().trim().min(1).max(1000),at:z.number().nonnegative()}).strict()
export const NpcLifeEpisodeSchema=z.object({
 id:z.string().min(1).max(180),origin:z.enum(['policy','knockout','observation']),at:z.number().nonnegative(),
 status:z.enum(['dying','stable','dead']),successes:z.number().int().min(0).max(3),failures:z.number().int().min(0).max(3),
 nextSaveAt:z.number().nonnegative().optional(),timeEventId:z.string().min(1).max(500).optional(),
 turnEventId:z.string().min(1).max(500).optional(),eligibleTurnKey:z.string().min(1).max(300).optional(),
 lastResolvedTurnKey:z.string().min(1).max(300).optional(),stableAt:z.number().nonnegative().optional(),
 enteredTurnKey:z.string().min(1).max(300).optional(),
 lastResolvedEventId:z.string().min(1).max(500).optional(),
 breathingBlockedStabilization:BreathingBlockedStabilizationSchema.optional(),
 recovery:NpcRecoverySchema.optional(),independentUnconscious:z.literal(true).optional(),
 deathReason:z.enum(['failed_saves','massive_damage','source_effect']).optional(),
 knockoutAttackEventId:z.string().min(1).max(180).optional(),
}).strict().superRefine((episode,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message})
 const blocked=episode.breathingBlockedStabilization
 const witnessedThird=episode.successes===3&&blocked?.lifeEpisodeId===episode.id&&blocked.eventId===episode.lastResolvedEventId
 if(episode.status==='dying'&&((episode.successes>=3&&!witnessedThird)||episode.failures>=3||episode.nextSaveAt===undefined||!episode.timeEventId||episode.recovery||episode.stableAt!==undefined))
  fail('A dying NPC needs an exact next save event and unfinished counters, without a stable timer.')
 if(blocked&&(episode.status!=='dying'||!witnessedThird))fail('A breathing exception belongs only to its exact current third-success dying event.')
 if(episode.status==='stable'&&(episode.successes||episode.failures||episode.nextSaveAt!==undefined||episode.timeEventId))
  fail('Stabilization resets both counters and cancels the dying event.')
 if(episode.recovery&&(episode.stableAt===undefined||episode.recovery.wakeAt!==episode.stableAt+episode.recovery.hours*3600))
  fail('A stable recovery deadline must retain its real stabilization timestamp and one 1d4-hour witness.')
 if(episode.status==='dead'&&(episode.recovery||episode.nextSaveAt!==undefined||episode.timeEventId))fail('Actual death cancels recovery and future saving throws.')
})
export const NpcLifeReceiptSchema=z.object({command:z.string(),status:z.enum(['pending','resolved']),result:z.record(z.string(),z.unknown()).optional()}).strict()
export const NpcLifeStateSchema=z.object({policy:NpcLifePolicySchema.optional(),episode:NpcLifeEpisodeSchema.optional(),legacyObservation:LegacyNpcLifeObservationSchema.optional(),receipts:z.record(z.string(),NpcLifeReceiptSchema)}).strict()
export type NpcLifeState=z.infer<typeof NpcLifeStateSchema>
export type NpcLifeEpisode=z.infer<typeof NpcLifeEpisodeSchema>

export function hasUnresolvedNpcLifeObservation(monster:Pick<MonsterState,'hp'|'isAlive'|'npcLife'>):boolean {return Boolean(monster.isAlive&&monster.hp.current===0&&monster.npcLife?.legacyObservation?.input.observedState==='living_zero_unresolved'&&!monster.npcLife.legacyObservation.resolution)}
export function isNpcStabilizationCandidate(monster:MonsterState):boolean{return isDyingNpc(monster)||hasUnresolvedNpcLifeObservation(monster)}
export function npcStabilizationMatches(monster:MonsterState,command:Record<string,unknown>):boolean{return isDyingNpc(monster)?monster.npcLife?.episode?.id===command.episodeId&&command.observationEventId===undefined:hasUnresolvedNpcLifeObservation(monster)&&monster.npcLife!.legacyObservation!.input.eventId===command.observationEventId&&command.episodeId===undefined}
export function hasNpcZeroHpEpisode(monster:MonsterState):boolean {
 return monster.isAlive&&monster.hp.current===0&&Boolean(monster.knockout||monster.npcLife?.episode&&monster.npcLife.episode.status!=='dead')
}
export function isDyingNpc(monster:MonsterState):boolean {
 return monster.isAlive&&monster.hp.current===0&&monster.npcLife?.episode?.status==='dying'
}
export function npcTurnKey(state:GameState,id:string):string {
 return `${state.combatGeneration??0}:${state.turnCounter??0}:${id}`
}
export function npcTimeEventId(episodeId:string,at:number):string {return `npc-death:${episodeId}:time:${at}`}
export function npcTurnEventId(episodeId:string,key:string):string {return `npc-death:${episodeId}:turn:${key}`}

/** Cleanup only after a genuine source has already set zero HP and isAlive=false.
 * No damage, concentration check, resurrection, time or recursive death call. */
export function cleanupNpcActualDeath(monster:MonsterState):void {
 if(monster.isAlive||monster.hp.current>0)return
 delete monster.knockout
 const episode=monster.npcLife?.episode;if(!episode)return
 episode.status='dead';episode.deathReason??='source_effect'
 delete episode.recovery;delete episode.stableAt;delete episode.nextSaveAt;delete episode.timeEventId
 delete episode.turnEventId;delete episode.eligibleTurnKey
 delete episode.breathingBlockedStabilization
}

/** The exceptional DYING3 shape must be backed by the exact live respiratory
 * episode and the last genuinely resolved save receipt, never by a bare flag. */
export function npcBreathingWitnessValidation(monster:MonsterState,state:GameState):string[] {
 const episode=monster.npcLife?.episode,marker=episode?.breathingBlockedStabilization
 if(!marker)return []
 const breathing=breathingStateOf(state)?.creatures[monster.id]?.episode,receipt=monster.npcLife?.receipts[marker.eventId]
 const result=receipt?.result
 if(marker.entityId!==monster.id||marker.lifeEpisodeId!==episode!.id||marker.eventId!==episode!.lastResolvedEventId
   ||!breathing||breathing.phase==='holding'||breathing.id!==marker.breathingEpisodeId
   ||JSON.stringify(breathing.blockedStabilization)!==JSON.stringify(marker)||receipt?.status!=='resolved'
   ||result?.episodeId!==episode!.id||result?.eventId!==marker.eventId||result?.successes!==3||result?.at!==marker.at
   ||marker.at>(state.worldTimeSeconds??0))return [`NPC blocked stabilization has no exact last resolved breathing/save witness: ${monster.id}.`]
 return []
}

export function npcLifeValidation(monster:MonsterState,now:number):string[] {
 const life=monster.npcLife;if(!life)return []
 const parsed=NpcLifeStateSchema.safeParse(life)
 if(!parsed.success)return [`Invalid NPC life state for ${monster.id}.`]
 const errors:string[]=[],episode=life.episode
 if(life.policy&&life.policy.at>now)errors.push(`Future NPC policy for ${monster.id}.`)
 if(episode){
  if(episode.at>now)errors.push(`Future NPC zero-HP episode for ${monster.id}.`)
  if(episode.origin==='observation'&&life.legacyObservation?.resolution?.kind!=='stabilized')errors.push(`An observed NPC episode requires a genuine new stabilization: ${monster.id}.`)
  if(episode.origin==='policy'&&!life.policy)errors.push(`NPC episode without its explicit policy for ${monster.id}.`)
  if(episode.origin==='policy'&&life.policy&&life.policy.at>episode.at)errors.push(`NPC policy cannot be declared after its zero-HP episode: ${monster.id}.`)
  if(episode.origin==='knockout'&&!episode.knockoutAttackEventId)errors.push(`NPC knockout episode has no actual attack witness: ${monster.id}.`)
  if(monster.knockout&&episode.knockoutAttackEventId!==monster.knockout.attackEventId)errors.push(`NPC knockout episode does not match its attack: ${monster.id}.`)
  if(monster.hp.current!==0||monster.isAlive!==(episode.status!=='dead'))errors.push(`NPC HP/life mismatch for ${monster.id}.`)
  if(episode.status!=='dead'&&!monster.conditions.includes('unconscious'))errors.push(`A living zero-HP NPC must retain unconsciousness: ${monster.id}.`)
  if(episode.status==='dying'&&episode.timeEventId!==npcTimeEventId(episode.id,episode.nextSaveAt!))errors.push(`NPC save event mismatch for ${monster.id}.`)
  if(episode.status==='stable'&&!episode.recovery&&!monster.knockout)errors.push(`Stable NPC without a recovery witness for ${monster.id}.`)
  if(episode.stableAt!==undefined&&episode.stableAt<episode.at)errors.push(`NPC stabilized before its actual injury: ${monster.id}.`)
  if(episode.deathReason==='failed_saves'&&episode.failures<3)errors.push(`NPC death by failures requires three actual failures: ${monster.id}.`)
 }
 return errors
}
