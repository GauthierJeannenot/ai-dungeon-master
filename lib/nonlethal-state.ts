import { z } from 'zod'
import type { GameState, MonsterState } from './types'
import { isStatBackedNpc } from './npc-stat-blocks'
import { NpcRecoverySchema,hasUnresolvedNpcLifeObservation } from './npc-life-state'

/** A source-attested exception to the usual NPC death at zero hit points. */
export const KnockoutStateSchema = z.object({
  stable: z.literal(true),
  sourceId: z.literal('player'),
  attackEventId: z.string().min(1).max(180),
  at: z.number().nonnegative(),
  recovery:NpcRecoverySchema.optional(),
  independentUnconscious:z.literal(true).optional(),
}).strict().superRefine((knockout,ctx)=>{
  if(knockout.recovery&&knockout.recovery.wakeAt!==knockout.at+knockout.recovery.hours*3600)
    ctx.addIssue({code:'custom',message:'The recovery deadline must equal the real stabilization timestamp plus its one persisted 1d4-hour result.'})
})
export type KnockoutState = z.infer<typeof KnockoutStateSchema>
export type KnockoutMonster = Pick<MonsterState, 'hp' | 'isAlive' | 'conditions'> & { knockout?: KnockoutState; npcLife?:MonsterState['npcLife'] }

export function isKnockedOut(monster: KnockoutMonster): boolean {
  return Boolean(monster.knockout?.stable && monster.isAlive && monster.hp.current === 0
    && monster.conditions.includes('unconscious'))
}

/** Living unconscious bodies continue to occupy their square. */
export function isActiveMonster(monster: KnockoutMonster): boolean {
  return monster.isAlive && monster.hp.current>0
}

/** Called after real HP assignment, before death/concentration consequences. */
export function reconcileKnockoutHp(monster: KnockoutMonster, hpBefore: number, knockout?: KnockoutState, preserveUnconscious=false): boolean {
  const entersKnockout = hpBefore > 0 && monster.hp.current === 0 && knockout !== undefined
  if (entersKnockout) monster.knockout = knockout
  if (monster.hp.current > 0 && monster.knockout) {
    const independent=preserveUnconscious||monster.knockout.independentUnconscious
    delete monster.knockout
    if(!independent)monster.conditions = monster.conditions.filter(condition => condition !== 'unconscious')
  }
  monster.isAlive = monster.hp.current > 0 || Boolean(hasUnresolvedNpcLifeObservation(monster)||monster.knockout||monster.npcLife?.episode&&monster.npcLife.episode.status!=='dead')
  return entersKnockout
}

/** Read providers at the source event's exact timestamp, not the end of a jump.
 * Suspended afflictions leave hero.effects; paused sprite effects have no active
 * conditions, so neither can keep a symptom active during petrification. */
export function hasIndependentUnconscious(state:GameState,targetId:string,at:number):boolean {
  return Boolean(state.hero?.effects.some(effect=>effect.targetIds.includes(targetId)&&effect.data.condition==='unconscious'&&effect.expiresAt>at)
    ||state.monsterEffects?.some(effect=>effect.targetId===targetId&&effect.conditions.includes('unconscious')
      &&(effect.expiresAt===undefined||effect.expiresAt>at)))
}

/** Archived records are bookkeeping targets, never active board actors. The
 * current floor cache is a stale copy and must not override the actual actor. */
export function persistedKnockoutActors(state:GameState):Array<{monster:MonsterState;active:boolean;mapId?:string}> {
  const actors:Array<{monster:MonsterState;active:boolean;mapId?:string}>=Object.values(state.monsters).map(monster=>({monster,active:true,mapId:state.currentMapId}))
  const seen=new Set(actors.map(entry=>entry.monster.id))
  for(const npc of Object.values(state.npcs??{}))if(isStatBackedNpc(npc)&&!seen.has(npc.id)){seen.add(npc.id);actors.push({monster:npc,active:npc.mapId===undefined||npc.mapId===state.currentMapId,mapId:npc.mapId})}
  const retired=state.sceneMemory?.retiredMonsters as Record<string,MonsterState>|undefined
  for(const monster of Object.values(retired??{}))if(!seen.has(monster.id)){seen.add(monster.id);actors.push({monster,active:false})}
  const floors=state.sceneMemory?.floorMonsters as Record<string,Record<string,MonsterState>>|undefined
  for(const [mapId,monsters]of Object.entries(floors??{}))if(mapId!==state.currentMapId)
    for(const monster of Object.values(monsters))if(!seen.has(monster.id)){seen.add(monster.id);actors.push({monster,active:false,mapId})}
  return actors
}
