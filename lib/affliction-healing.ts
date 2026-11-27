import type { GameState, MonsterState, PlayerState } from './types'

/** Pale Tincture's existing per-source damage ceiling, including suspension. */
export function healingDamageSources(state:GameState,targetId:string){
 return Object.values(state.dmTools?.afflictions?.records??{}).filter(record=>record.targetId===targetId
  &&['active','pending'].includes(record.status)&&!record.petrificationPause&&record.unhealableDamage>0)
}
export function limitedAfflictionHealing(state:GameState,target:PlayerState|MonsterState,delta:number):number{
 if(delta<=0)return delta
 const blocked=healingDamageSources(state,target.id).reduce((sum,record)=>sum+record.unhealableDamage,0)
 return Math.max(0,Math.min(delta,target.hp.max-blocked-target.hp.current))
}

/** Called only at a real cap-changing source event, never loading/inspection. */
export function noticeNpcHealingCeilingChange(state:GameState,monster:MonsterState,at=state.worldTimeSeconds??0):void{
 const recovery=monster.knockout?.recovery??monster.npcLife?.episode?.recovery,hold=recovery?.healingHold
 if(!hold)return
 if(limitedAfflictionHealing(state,monster,1)>=1)hold.availableAt??=at
 else delete hold.availableAt
}
export function holdNpcHealingRecovery(state:GameState,monster:MonsterState,at:number):void{
 const recovery=monster.knockout?.recovery??monster.npcLife?.episode?.recovery
 if(!recovery||limitedAfflictionHealing(state,monster,1)>=1||at<recovery.wakeAt)return
 recovery.healingHold??={blockedAt:at,maximumAtBlock:monster.hp.max,
  sources:healingDamageSources(state,monster.id).map(record=>({id:record.id,damage:record.unhealableDamage}))}
 delete recovery.healingHold.availableAt
}
export function validateNpcHealingRecovery(state:GameState,monster:MonsterState):string[]{
 const recovery=monster.knockout?.recovery??monster.npcLife?.episode?.recovery,hold=recovery?.healingHold
 if(!hold)return []
 const at=state.worldTimeSeconds??0,sources=state.dmTools?.afflictions?.records??{}
 const valid=monster.isAlive&&monster.hp.current===0&&Boolean(monster.knockout?.stable||monster.npcLife?.episode?.status==='stable')
  &&hold.blockedAt>=recovery!.wakeAt&&hold.blockedAt<=at
  &&hold.sources.length>0&&new Set(hold.sources.map(source=>source.id)).size===hold.sources.length
  &&hold.sources.reduce((sum,source)=>sum+source.damage,0)>=hold.maximumAtBlock
  &&hold.sources.every(source=>Object.hasOwn(sources,source.id)&&sources[source.id].targetId===monster.id
   &&sources[source.id].appliedAt<=hold.blockedAt&&sources[source.id].unhealableDamage>=source.damage)
  &&(hold.availableAt===undefined?limitedAfflictionHealing(state,monster,1)<1
   :hold.availableAt>=hold.blockedAt&&hold.availableAt<=at&&limitedAfflictionHealing(state,monster,1)>=1)
 return valid?[]:[`NPC ${monster.id} has no exact held healing-ceiling recovery witness.`]
}
