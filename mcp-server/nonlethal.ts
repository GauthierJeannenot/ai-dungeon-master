import type { GameState, MonsterState, PlayerState } from '../lib/types'
import { KnockoutStateSchema, hasIndependentUnconscious, isKnockedOut, persistedKnockoutActors, reconcileKnockoutHp, type KnockoutState } from '../lib/nonlethal-state'
import { getMonsterRecord } from '../lib/srd/monsters'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { getMapSpec } from '../lib/adventure-map'
import { completedRoundEvents } from '../lib/combat-round-events'
import { RuleViolation } from './rules'
import * as gs from './game-state'
import { rollDice } from './dice'
import { hasNpcZeroHpEpisode,hasUnresolvedNpcLifeObservation } from '../lib/npc-life-state'
import { clearNpcEpisodeOnHealing, assertNpcDamageRosterSupported } from './npc-life'
import { breathingRecoveryBlocked, breathingBlockedRecoveryOf, noteBreathingBlockedRecovery, assertBreathingRecoveryAllowed } from './breathing'
import { limitedAfflictionHealing,holdNpcHealingRecovery,validateNpcHealingRecovery } from '../lib/affliction-healing'

type Creature = MonsterState | PlayerState

/** Explicit declaration, validated before the attack rolls or spends anything. */
export function validateNonlethalAttack(requested: boolean | undefined, attackerId: string, target: Creature, melee: boolean): void {
  if (!requested) return
  if ('group' in target && target.group)
    throw new RuleViolation('NPC_GROUP_NONLETHAL_UNSUPPORTED', 'A shared-HP group has no per-member knockout episodes; select an individual actor for nonlethal combat.', { targetId: target.id })
  if (attackerId !== 'player' || !('isAlive' in target))
    throw new RuleViolation('NONLETHAL_PLAYER_ATTACK_REQUIRED', 'Knockout requires a real player melee attack against an exact living monster.', {})
  if (!melee)
    throw new RuleViolation('NONLETHAL_MELEE_REQUIRED', 'A ranged or thrown attack cannot knock a creature out.', {})
  if (!target.isAlive || target.hp.current <= 0)
    throw new RuleViolation('NONLETHAL_LIVING_TARGET_REQUIRED', 'Declare knockout before attacking a living creature with positive hit points; this cannot revive a corpse.', {})
  const record = getMonsterRecord(target.type)
  const immunities = (record?.reference ?? record?.source)?.condition_immunities as Array<{index:string}> | undefined
  if (immunities?.some(condition => condition.index === 'unconscious'))
    throw new RuleViolation('NONLETHAL_CONDITION_IMMUNE', 'The source creature is immune to unconsciousness; no attack has rolled or spent its action.', { targetId: target.id })
  const state=gs.getState(),cell=target.position
  const burning=Boolean(state.dmTools?.weaponConsumables?.burning[target.id])
  const affliction=Object.values(state.dmTools?.afflictions?.records??{}).some(record=>record.targetId===target.id
    && ['pending','active'].includes(record.status) && AFFLICTIONS[record.templateId].damage
    && (record.status==='pending'||AFFLICTIONS[record.templateId].repeat))
  const roundEvent=(getMapSpec(state.currentMapId,state).roundEvents??[]).some(event=>!completedRoundEvents(state)[event.id]
    && event.path.some(at=>at.x===cell.x&&at.y===cell.y))
  const complexTrap=Object.values(state.dmTools?.complexTraps??{}).some(trap=>trap.mapId===state.currentMapId
    && ['armed','active'].includes(trap.status)&&cell.x>=trap.fromCell.x&&cell.x<=trap.toCell.x&&cell.y>=trap.fromCell.y&&cell.y<=trap.toCell.y)
  if(burning||affliction||roundEvent||complexTrap)
    throw new RuleViolation('NONLETHAL_ONGOING_DAMAGE_UNSUPPORTED', 'The target has a pending damaging poison, burning effect, unresolved round-event path or armed/active complex-trap area. The initial knockout choice is conservatively refused before attack dice/costs for these represented recurrent hazards; existing NPC zero-HP episodes retain their own damage rules.', {targetId:target.id,burning,affliction,roundEvent,complexTrap})
}

export function knockoutFromAttack(requested: boolean | undefined, attackEventId: string): KnockoutState | undefined {
  return requested ? { stable: true, sourceId: 'player', attackEventId, at:gs.getState().worldTimeSeconds??0 } : undefined
}

/** Only called for the real positive-to-zero stable transition, never loading,
 * inspecting, replaying a receipt or preparing nonlethal intent. */
export function startKnockoutRecovery(knockout:KnockoutState):KnockoutState {
  if(knockout.recovery)return knockout
  const hours=rollDice('1d4').total
  return {...knockout,recovery:{hours,wakeAt:knockout.at+hours*3600}}
}

/** Legacy W5 saves have no random witness. Keep their explicit migration bound;
 * new timers only refuse an actual unsupported combat-roster crossing. */
export function assertKnockoutTimeAdvance(seconds:number,conservativeCombat=false):void {
  if(seconds<=0)return
  const state=gs.getState(),to=(state.worldTimeSeconds??0)+seconds
  const bodies=persistedKnockoutActors(state).filter(({monster})=>isKnockedOut(monster)||monster.isAlive&&monster.hp.current===0&&monster.npcLife?.episode?.status==='stable')
  const legacy=bodies.filter(({monster})=>monster.knockout&&!monster.knockout.recovery&&to>=monster.knockout.at+3600)
  if(legacy.length)throw new RuleViolation('KNOCKOUT_RECOVERY_PENDING','This legacy stable KO has no persisted 1d4-hour witness. Crossing its first possible recovery boundary remains unsupported; loading never invents or rerolls that die.'+(conservativeCombat?' Combat preflight conservatively reserves six seconds per possible turn advance.':''),{targetIds:legacy.map(({monster})=>monster.id),earliestAt:Math.min(...legacy.map(({monster})=>monster.knockout!.at+3600)),reservedSeconds:seconds,conservativeCombat})
  const outside=bodies.filter(({monster,active})=>active&&!breathingRecoveryBlocked(monster.id)&&limitedAfflictionHealing(state,monster,1)>=1&&state.phase==='combat'&&!state.initiativeOrder.includes(monster.id)
    &&(monster.knockout?.recovery??monster.npcLife?.episode?.recovery)&&to>=(monster.knockout?.recovery??monster.npcLife!.episode!.recovery)!.wakeAt)
  if(outside.length)throw new RuleViolation('KNOCKOUT_INITIATIVE_NOT_REGISTERED','A scheduled stable NPC recovery would wake a body absent from the current combat roster. This time crossing is refused before effects, costs or dice; no initiative slot is invented.',{targetIds:outside.map(({monster})=>monster.id),wakeAt:Math.min(...outside.map(({monster})=>(monster.knockout?.recovery??monster.npcLife!.episode!.recovery)!.wakeAt)),reservedSeconds:seconds,conservativeCombat})
}

export interface KnockoutRecoveryEvent {entityId:string;mapId?:string;archived:boolean;attackEventId?:string;episodeId?:string;origin:'knockout'|'policy'|'observation';stabilizedAt:number;hours:number;wakeAt:number;recoveredAt?:number;hpBefore:0;hpAfter:1;unconsciousRetained:boolean}

export function dueKnockoutRecoveries(until:number):Array<{key:string;at:number;recover:()=>KnockoutRecoveryEvent|undefined}> {
  const state=gs.getState()
  return persistedKnockoutActors(state).filter(({monster})=>hasNpcZeroHpEpisode(monster)
    &&(!breathingBlockedRecoveryOf(monster.id)||breathingBlockedRecoveryOf(monster.id)!.resumedAt!==undefined)
    &&(monster.knockout?.recovery??(monster.npcLife?.episode?.status==='stable'?monster.npcLife.episode.recovery:undefined))
    &&(!(monster.knockout?.recovery??monster.npcLife!.episode!.recovery)!.healingHold||(monster.knockout?.recovery??monster.npcLife!.episode!.recovery)!.healingHold!.availableAt!==undefined)
    &&(monster.knockout?.recovery??monster.npcLife!.episode!.recovery)!.wakeAt<=until)
    .map(({monster,active,mapId})=>{
      const knockout=monster.knockout,episode=monster.npcLife?.episode,recovery=(knockout?.recovery??episode!.recovery)!
      const blocked=breathingBlockedRecoveryOf(monster.id),at=Math.max(blocked?.resumedAt??0,recovery.healingHold?.availableAt??0,recovery.wakeAt)
      return {key:`npc-recovery:${monster.id}:${episode?.id??knockout!.attackEventId}:${at}`,at,recover:()=>{
        const currentRecovery=monster.knockout?.recovery??(monster.npcLife?.episode?.status==='stable'?monster.npcLife.episode.recovery:undefined)
        if(monster.knockout!==knockout||monster.npcLife?.episode!==episode||currentRecovery!==recovery||!hasNpcZeroHpEpisode(monster))return undefined
        const airBlocked=breathingRecoveryBlocked(monster.id),healingBlocked=limitedAfflictionHealing(state,monster,1)<1
        if(airBlocked)noteBreathingBlockedRecovery(monster.id,episode!.id,recovery.wakeAt)
        if(healingBlocked)holdNpcHealingRecovery(state,monster,at)
        if(airBlocked||healingBlocked)return undefined
        // A source cure cannot invent a combat slot for an omitted stable body.
        if(active&&state.phase==='combat'&&!state.initiativeOrder.includes(monster.id))return undefined
        const preserve=hasIndependentUnconscious(state,monster.id,at)
        monster.hp.current=1
        clearNpcEpisodeOnHealing(monster,at)
        reconcileKnockoutHp(monster,0,undefined,preserve)
        const event:KnockoutRecoveryEvent={entityId:monster.id,mapId,archived:!active,attackEventId:knockout?.attackEventId??episode?.knockoutAttackEventId,
          episodeId:episode?.id,origin:episode?.origin??'knockout',stabilizedAt:knockout?.at??episode!.stableAt!,hours:recovery.hours,wakeAt:recovery.wakeAt,...(blocked||recovery.healingHold?{recoveredAt:at}:{}),hpBefore:0,hpAfter:1,
          unconsciousRetained:monster.conditions.includes('unconscious')}
        gs.addLogEntry({round:state.round,turn:'system',action:'Récupération naturelle après KO stable',mechanicalDetail:JSON.stringify(event)})
        return event
      }}
    })
}

/** Refuse stale/corrupt recovery snapshots; hydration never heals or rolls. */
export function validateKnockoutRecoveryHistory(state:GameState):{valid:boolean;errors:string[]} {
  const errors:string[]=[],now=state.worldTimeSeconds??0
  for(const {monster}of persistedKnockoutActors(state))if(monster.knockout){
    const parsed=KnockoutStateSchema.safeParse(monster.knockout)
    if(!parsed.success||!isKnockedOut(monster)){errors.push(`Invalid stable knockout for ${monster.id}.`);continue}
    const deadline=monster.knockout.recovery?.wakeAt??monster.knockout.at+3600
    if(monster.knockout.at>now||now>=deadline&&!breathingBlockedRecoveryOf(monster.id,state)&&!monster.knockout.recovery?.healingHold)errors.push(`Knockout ${monster.id} is dated in the future or its required recovery has already elapsed.`)
    errors.push(...validateNpcHealingRecovery(state,monster))
  }
  return {valid:errors.length===0,errors}
}

/** PHB damage at zero needs the NPC death-save lifecycle, which is not exposed yet.
 * Refuse before mutation rather than silently killing or restoring a stable body. */
export function assertKnockoutDamageSupported(target: Creature, amount: number): void {
  if(amount>0&&'isAlive'in target&&hasUnresolvedNpcLifeObservation(target))throw new RuleViolation('NPC_LIFE_HISTORY_UNRESOLVED','The actual living0HP legacy body has unknown stability/counters. Resolve a genuine heal or Medicine stabilization before damage whose consequences depend on that history.',{targetId:target.id})
  if(amount>0&&'isAlive'in target)assertNpcDamageRosterSupported(target)
  if (amount > 0 && 'isAlive' in target && target.isAlive &&target.hp.current === 0&&!hasNpcZeroHpEpisode(target))
    throw new RuleViolation('NPC_ZERO_HP_UNTRACKED','Living zero-HP NPC damage requires an actual stable KO or tracked death-save episode.',{targetId:target.id})
}

/** A new encounter cannot silently invent an initiative slot for an old body. */
export function assertKnockoutHealingSupported(target:Creature,amount:number):void {
  if(amount>0&&'group'in target&&target.group)throw new RuleViolation('NPC_GROUP_HEALING_FORBIDDEN','This authored shared-HP group cannot regain hit points.',{targetId:target.id})
  if(amount>0)assertBreathingRecoveryAllowed(target.id)
  const state=gs.getState()
  if(amount>0&&'isAlive'in target&&hasNpcZeroHpEpisode(target)&&state.phase==='combat'&&!state.initiativeOrder.includes(target.id))
    throw new RuleViolation('KNOCKOUT_INITIATIVE_NOT_REGISTERED','This knocked-out creature has no assigned initiative slot in the current encounter. Healing it during this combat is unsupported; finish the encounter and heal it in exploration. No healing die, HP or resource has been spent.',{targetId:target.id})
}
