import { pendingGroundGearContacts } from '../../lib/ground-gear-state'
import { bindGroundGearContinuation } from '../ground-gear-contacts'
import { registerPhysicalContinuation,type EngineEffectContinuation } from '../movement-continuation'
import { toolkitResult } from '../toolkit'
import { assertGameTimeAdvance } from '../time-preflight'
import { assertBreathingRecoveryAllowed } from '../breathing'
import { advanceHeroTime } from '../hero-rules'
import { dueNpcDeathSaveEvents } from '../npc-life'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as gs from '../game-state'
import * as rules from '../rules'
import { addEffect, conditionImmune, endEffect, endInvisibility, expireMonsterEffects, hasTrait,
  monsterSource, savingThrow, sourceAction } from '../monster-rules'
import { canSee, visibleCell } from '../monster-perception'
import { navigationGrid } from '../../lib/navigation'
import { engineGeometry } from '../navigation'
import { rollDice } from '../dice'
import { resolveAttack } from './combat-tools'
import { resolveAbilityCheck } from '../ability-check'

export const MonsterPowerFields = {
  powerName: z.enum(['Invisibility', 'Teleport', 'Consume Life', 'Fey Charm', 'End Fey Charm', 'Horrifying Visage']),
  targetId: z.string().optional(), targetIds: z.array(z.string()).optional(),
  toCell: z.object({ x: z.number().int(), y: z.number().int() }).optional(),
  biteTiming: z.enum(['before', 'after']).optional(),
}
type PowerInput = { monsterId: string } & z.infer<z.ZodObject<typeof MonsterPowerFields>>

const TELEPORT_BITE_DOMAIN='native-teleport-after-contact-bite'
let teleportContinuationRegistered=false
function registerTeleportBiteContinuation(){
 if(teleportContinuationRegistered)return
 registerPhysicalContinuation(TELEPORT_BITE_DOMAIN,(command,_movementStopped,completedEffect)=>{
  const state=gs.getState(),monsterId=String(command.monsterId),targetId=String(command.targetId),ids=command.contactIds as string[],destination=command.toCell as{x:number;y:number}|undefined
  const contacts=Array.isArray(ids)?ids.map(id=>state.dmTools?.groundGear?.contacts[id]):[]
  if(!contacts.length||contacts.some(contact=>!contact||contact.status!=='resolved'||contact.entityId!==monsterId))throw new rules.RuleViolation('TELEPORT_CONTACT_CONTEXT_CHANGED','Finish all exact physical contacts of this already committed native teleport before its original optional bite.',{})
  if(command.result)return toolkitResult({...command.result as Record<string,unknown>,replayed:true})
  const monster=gs.getPhysicalCreature(monsterId),target=gs.getPhysicalCreature(targetId)
  if(!monster||monsterId==='player'||!destination||monster.position.x!==destination.x||monster.position.y!==destination.y||state.currentMapId!==command.mapId||state.worldTimeSeconds!==command.at||!('monsterRuntime'in monster)||monster.monsterRuntime?.recharge?.Teleport!==false)
   throw new rules.RuleViolation('TELEPORT_CONTINUATION_CONTEXT_CHANGED','The original real native actor, map, destination, time and spent recharge must still match; no teleport, action or target is recreated.',{})
  const store=(data:Record<string,unknown>)=>{command.result=structuredClone(data);for(const contact of contacts){const saved=contact!.continuation?.command as Record<string,unknown>|undefined;if(saved)saved.result=structuredClone(data);if(contact!.finalResult)contact!.finalResult={...structuredClone(data),groundGearContact:contact!.finalResult.groundGearContact??contact!.finalResult}}return toolkitResult(data)}
  if(completedEffect!==undefined)return store({monsterId,powerName:'Teleport',toCell:destination,attack:completedEffect,sourcePowerAlreadySpent:true,physicalContactResolved:true})
  const actualDead=(body:{id:string;isAlive?:boolean})=>body.id==='player'?Boolean(state.player.deathSaves?.dead):body.isAlive===false
  if(monster.hp.current<=0||actualDead(monster)||monster.conditions.some(condition=>['unconscious','incapacitated','paralyzed','petrified','stunned'].includes(condition))||!target||actualDead(target))
   return store({monsterId,powerName:'Teleport',toCell:destination,attackCancelled:true,reason:'actual_actor_or_target_unavailable_after_contact',sourcePowerAlreadySpent:true})
  if(command.started){const pending=state.hero?.pending;if(pending?.continuation?.type==='engine-effect'&&pending.continuation.domain===TELEPORT_BITE_DOMAIN)return toolkitResult({monsterId,powerName:'Teleport',pendingReaction:pending,alreadyPending:true});throw new rules.RuleViolation('TELEPORT_BITE_RECEIPT_REQUIRED','This exact bite was already started; complete its original held attack instead of rolling another.',{})}
  command.started=true
  const response=gs.withPhysicalCreatureResolution([monsterId,targetId],()=>resolveAttack(monsterId,targetId,'Bite',undefined,undefined,undefined,undefined,undefined,{deferAction:true,spentNativePowerContactId:ids[0]}))
  const attack=JSON.parse(response.content[0].text) as Record<string,unknown>
  if('isError'in response&&response.isError)return store({monsterId,powerName:'Teleport',toCell:destination,attackCancelled:true,attackBoundary:attack,sourcePowerAlreadySpent:true})
  if(state.hero?.pending){state.hero.pending.continuation={type:'engine-effect',domain:TELEPORT_BITE_DOMAIN,command};return toolkitResult({monsterId,powerName:'Teleport',toCell:destination,pendingReaction:state.hero.pending,sourcePowerAlreadySpent:true})}
  return store({monsterId,powerName:'Teleport',toCell:destination,attack,sourcePowerAlreadySpent:true,physicalContactResolved:true})
 })
 teleportContinuationRegistered=true
}

export function resolveMonsterPower(input: PowerInput) {
  registerTeleportBiteContinuation()
  const before = structuredClone(gs.getState())
  try {
    const { monsterId, powerName, targetId, targetIds, toCell, biteTiming } = input
    const monster = gs.getMonster(monsterId)
    if (!monster?.srd) throw new rules.RuleViolation('MONSTER_SOURCE_REQUIRED', 'This power requires an SRD monster actor.', {})
    const source = sourceAction(monster, powerName)
    if (!source && !(powerName === 'Consume Life' && hasTrait(monster, powerName))
      && !(powerName === 'End Fey Charm' && sourceAction(monster, 'Fey Charm')))
      throw new rules.RuleViolation('MONSTER_POWER_UNAVAILABLE', 'This creature does not have this source power.', { powerName })
    const bonus = powerName === 'Consume Life' || powerName === 'End Fey Charm'
    if (bonus) rules.validateBonusActionUse(monsterId)
    else rules.validateActionUse(monsterId)
    monster.monsterRuntime ??= {}
    const runtime = monster.monsterRuntime
    const state = gs.getState(), now = state.worldTimeSeconds ?? 0
    const immunityKey = powerName === 'Fey Charm' ? 'fey-charm' : 'horrifying-visage'
    const immune = (id: string) => state.monsterPowerImmunities?.some(i => i.sourceId === monsterId && i.targetId === id && i.power === immunityKey && i.expiresAt > now)
    const rememberImmunity = (id: string) => { state.monsterPowerImmunities ??= []; state.monsterPowerImmunities.push({ sourceId: monsterId, targetId: id, power: immunityKey, expiresAt: now + 86400 }) }
    const target = targetId ? gs.getEntity(targetId) : undefined
    const requireTarget = (range: number, mutualSight = false) => {
      if (!target || target.id === monsterId) throw new rules.RuleViolation('TARGET_REQUIRED', 'Choose an explicit, distinct existing targetId.', {})
      if (rules.distanceCells(monster.position, target.position) > range || !canSee(monster, target) || mutualSight && !canSee(target, monster))
        throw new rules.RuleViolation('TARGET_OUT_OF_RANGE', 'Target must be visible and in source range.', {})
      return target
    }
    if (targetIds && powerName !== 'Horrifying Visage' || toCell && powerName !== 'Teleport' || biteTiming && powerName !== 'Teleport'
      || targetId && (powerName === 'Invisibility' || powerName === 'Horrifying Visage'))
      throw new rules.RuleViolation('POWER_ARGUMENTS_INVALID', 'Arguments do not belong to this source power.', {})
    let result: object
    switch (powerName) {
      case 'Invisibility':
        runtime.invisibleConcentration = true
        gs.applyCondition(monsterId, 'invisible')
        result = { condition: 'invisible', concentration: true, endsOn: 'attack, spell, Consume Life, failed concentration, incapacitation' }
        break
      case 'Teleport': {
        if (!toCell) throw new rules.RuleViolation('DESTINATION_REQUIRED', 'The AI must choose toCell explicitly.', {})
        rules.validateMapCell(toCell)
        if (runtime.recharge?.[powerName] === false) throw new rules.RuleViolation('POWER_NOT_RECHARGED', 'Teleport has not recharged.', {})
        if (rules.distanceCells(monster.position, toCell) > 8 || !visibleCell(monster, toCell)
          || !navigationGrid(state, monsterId, engineGeometry()).free(toCell))
          throw new rules.RuleViolation('DESTINATION_INVALID', 'Teleport needs an unoccupied visible cell within 40 feet.', {})
        if (Boolean(targetId) !== Boolean(biteTiming)) throw new rules.RuleViolation('POWER_ARGUMENTS_INVALID', 'An optional bite requires both targetId and biteTiming.', {})
        gs.assertGroundMovementPath(monsterId,[toCell],'teleport')
        let attack
        const bite = () => {
          const response = resolveAttack(monsterId, targetId!, 'Bite', undefined, undefined, undefined, undefined, undefined, { deferAction: true })
          if ('isError' in response && response.isError) throw new rules.RuleViolation('TELEPORT_BITE_INVALID', response.content[0].text, {})
          return JSON.parse(response.content[0].text)
        }
        if (biteTiming === 'before') attack = bite()
        const contactsBefore=new Set(pendingGroundGearContacts(state).map(contact=>contact.id))
        gs.moveToken(monsterId, toCell.x, toCell.y,{groundContactKind:'teleport'})
        const contacts=pendingGroundGearContacts(state).filter(contact=>!contactsBefore.has(contact.id))
        if(biteTiming==='after'&&contacts.length){const continuation:EngineEffectContinuation={type:'engine-effect',domain:TELEPORT_BITE_DOMAIN,command:{monsterId,targetId:targetId!,toCell:{...toCell},mapId:state.currentMapId,at:state.worldTimeSeconds??0,contactIds:contacts.map(contact=>contact.id)}};bindGroundGearContinuation(contacts.map(contact=>contact.id),continuation)}
        else if (biteTiming === 'after') attack = bite()
        runtime.recharge ??= {}; runtime.recharge[powerName] = false
        result = { toCell, attack, recharged: false,groundGearContactIds:contacts.map(contact=>contact.id),biteAfterContactPending:biteTiming==='after'&&contacts.length>0 }
        break
      }
      case 'Consume Life': {
        assertBreathingRecoveryAllowed(monsterId)
        const victim = requireTarget(1)
        if (victim.hp.current !== 0 || ('isAlive' in victim ? !victim.isAlive : victim.deathSaves?.dead))
          throw new rules.RuleViolation('TARGET_NOT_DYING', 'Consume Life requires a creature at 0 HP that is still alive.', {})
        const save = savingThrow(victim.id, 'con', 10, true)
        let healing
        if (!save.success) {
          if ('isAlive' in victim) { delete victim.knockout; victim.isAlive = false }
          else { victim.deathSaves ??= { successes: 0, failures: 0 }; victim.deathSaves.dead = true }
          gs.recordActualDeath(victim.id)
          healing = rollDice('3d6'); gs.updateMonsterHP(monsterId, healing.total)
        }
        endInvisibility(monsterId)
        result = { targetId: victim.id, save, killed: !save.success, healing, hpAfter: monster.hp.current }
        break
      }
      case 'Fey Charm': {
        const victim = requireTarget(6, true)
        const type = victim.id === 'player' ? 'humanoid' : monsterSource(victim)?.type
        if (!['humanoid', 'beast'].includes(type ?? '')) throw new rules.RuleViolation('TARGET_TYPE_INVALID', 'Fey Charm requires a humanoid or beast.', {})
        if (immune(victim.id)) throw new rules.RuleViolation('POWER_TARGET_IMMUNE', 'This target has 24-hour immunity.', {})
        const existing = state.monsterEffects?.filter(e => e.kind === 'fey-charm' && e.sourceId === monsterId) ?? []
        if (existing.some(e => e.targetId === victim.id) || existing.filter(e => (e.targetId === 'player' ? 'humanoid' : monsterSource(gs.getEntity(e.targetId))?.type) === type).length >= (type === 'humanoid' ? 1 : 3))
          throw new rules.RuleViolation('CHARM_LIMIT', 'End an existing charm before exceeding the source limit.', {})
        const save = savingThrow(victim.id, 'wis', 14, true, 'charmed')
        const effect = !save.success && !conditionImmune(victim, 'charmed') ? addEffect({ sourceId: monsterId, targetId: victim.id,
          kind: 'fey-charm', conditions: ['charmed'], expiresAt: now + 86400 }) : undefined
        if (!effect) rememberImmunity(victim.id)
        result = { targetId: victim.id, save, effect, immune: conditionImmune(victim, 'charmed') }
        break
      }
      case 'End Fey Charm': {
        const effect = state.monsterEffects?.find(e => e.kind === 'fey-charm' && e.sourceId === monsterId && e.targetId === targetId)
        if (!effect) throw new rules.RuleViolation('EFFECT_NOT_FOUND', 'Choose a target currently charmed by this source.', {})
        endEffect(effect.id); result = { targetId, ended: true }; break
      }
      case 'Horrifying Visage': {
        // This is an area power, not discretionary target selection: every eligible
        // creature that can see the source must be included by the agent.
        const eligible = gs.getAllEntities().filter(e => e.id !== monsterId && rules.occupiesSpace(e)
          && monsterSource(e)?.type !== 'undead' && rules.distanceCells(e.position, monster.position) <= 12 && canSee(e, monster))
        if (!targetIds || new Set(targetIds).size !== targetIds.length || targetIds.slice().sort().join('|') !== eligible.map(e => e.id).sort().join('|'))
          throw new rules.RuleViolation('AREA_TARGETS_REQUIRED', 'Select every non-undead in range that can see this source.', { eligibleTargetIds: eligible.map(e => e.id) })
        result = { targets: eligible.map(victim => {
          if (immune(victim.id)) return { targetId: victim.id, immune: true }
          const save = savingThrow(victim.id, 'wis', 13, false, 'frightened')
          if (save.success) rememberImmunity(victim.id)
          const effect = !save.success && !conditionImmune(victim, 'frightened') ? addEffect({ sourceId: monsterId, targetId: victim.id, kind: 'horrifying-visage',
            conditions: ['frightened'], dc: 13, repeatSave: 'wis', expiresAt: now + 60 }) : undefined
          const agingRoll = !save.success && save.roll.total <= 8 ? rollDice('1d4') : undefined
          const aging = agingRoll ? addEffect({ sourceId: monsterId, targetId: victim.id, kind: 'supernatural-aging', conditions: [], agingYears: agingRoll.total * 10 }) : undefined
          return { targetId: victim.id, save, effect, aging }
        }) }; break
      }
    }
    if (state.phase === 'combat') {
      if (bonus) gs.markBonusActionUsed(monsterId)
      else rules.recordAction(monsterId)
    }
    const mechanicalSummary = `${monster.name} : ${powerName} résolu ; ${bonus ? 'action bonus' : 'action'} consommée.`
    gs.addLogEntry({ round: state.round, turn: monsterId, action: powerName, mechanicalDetail: mechanicalSummary })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ monsterId, powerName, ...result, mechanicalSummary }) }] }
  } catch (err) { gs.replaceState(before); return rules.ruleErrorResult(err) }
}

export function registerMonsterPowerTools(server: McpServer): void {
  registerTeleportBiteContinuation()
  server.tool('use_monster_power', 'Resolve an implemented source power, with actual cost, saves, duration and recharge. No inferred targets/destination. Reactive NPCs must use npc_action kind=power. Other source powers require dedicated support; never narrate their mechanical success without a resolving tool.',
    { monsterId: z.string(), ...MonsterPowerFields }, async input => {
      if (gs.getMonster(input.monsterId)?.controller === 'reactive_npc') return rules.ruleErrorResult(new rules.RuleViolation('NPC_ACTION_REQUIRED', 'Use npc_action for a reactive NPC.', {}))
      return resolveMonsterPower(input)
    })
  server.tool('escape_monster_grapple', 'Spend an action attempting Athletics (STR) or Acrobatics (DEX) against a tracked monster grapple escape DC. Choose the ability explicitly.',
    { entityId: z.string(), effectId: z.string(), ability: z.enum(['str', 'dex']) }, async ({ entityId, effectId, ability }) => {
      try {
        const effect = gs.getState().monsterEffects?.find(e => e.id === effectId && e.targetId === entityId && e.kind === 'grapple')
        if (!effect?.dc) throw new rules.RuleViolation('EFFECT_NOT_FOUND', 'Choose a grapple on this actor.', {})
        const check = resolveAbilityCheck({ entityId, ability, skill: ability === 'str' ? 'athletics' : 'acrobatics', dc: effect.dc })
        if (check.success) endEffect(effectId)
        return { content: [{ type: 'text', text: JSON.stringify({ check, escaped: check.success }) }] }
      } catch (err) { return rules.ruleErrorResult(err) }
    })
  server.tool('wake_sleeping_creature', 'Spend an action waking an adjacent creature put to sleep by a tracked monster poison effect. Does not heal or stabilize 0 HP.',
    { actorId: z.string(), targetId: z.string() }, async ({ actorId, targetId }) => {
      try {
        rules.validateActionUse(actorId)
        const actor = gs.getEntity(actorId)!, target = gs.getEntity(targetId)
        const effect = gs.getState().monsterEffects?.find(e => e.targetId === targetId && e.kind === 'sprite-sleep')
        if (effect?.petrificationPause)
          throw new rules.RuleViolation('SPRITE_EFFECT_SUSPENDED', 'The sprite sleep is suspended by petrification; shaking stone cannot neutralize this poison source.', {})
        if (!target || !effect || rules.distanceCells(actor.position, target.position) > 1 || !visibleCell(actor, target.position))
          throw new rules.RuleViolation('WAKE_TARGET_INVALID', 'Choose an adjacent accessible creature with tracked sleep.', {})
        endEffect(effect.id); rules.recordAction(actorId)
        return { content: [{ type: 'text', text: JSON.stringify({ targetId, awakened: true, conditions: target.conditions }) }] }
      } catch (err) { return rules.ruleErrorResult(err) }
    })
  server.tool('advance_game_time', 'Explicit elapsed fictional time outside combat, in seconds; expires monster effects. completedLongRestForIds only restores max HP lost to Life Drain after at least eight hours, and does not heal or replenish other resources.',
    { seconds: z.number().int().min(1).max(31536000), completedLongRestForIds: z.array(z.string()).optional() }, async ({ seconds, completedLongRestForIds }) => {
      try {
        const state = gs.getState()
        if (state.phase === 'combat') throw new rules.RuleViolation('TIME_ADVANCE_IN_COMBAT', 'Combat time advances via turns.', {})
        if (completedLongRestForIds && (seconds < 28800 || completedLongRestForIds.some(id => !gs.getEntity(id) || gs.getEntity(id)!.hp.current <= 0 || gs.getEntity(id)!.conditions.includes('unconscious'))))
          throw new rules.RuleViolation('LONG_REST_INVALID', 'Rest recovery requires eight hours and living conscious actors.', {})
        assertGameTimeAdvance(seconds)
        const naturalRecoveries=advanceHeroTime(seconds)
        for (const effect of [...state.monsterEffects ?? []]) if (effect.kind === 'life-drain' && completedLongRestForIds?.includes(effect.targetId)) {
          gs.getEntity(effect.targetId)!.hp.max += effect.hpMaxReduction ?? 0; endEffect(effect.id)
        }
        return { content: [{ type: 'text', text: JSON.stringify({ worldTimeSeconds: state.worldTimeSeconds, monsterEffects: state.monsterEffects,naturalRecoveries,npcDeathSaveEvents:dueNpcDeathSaveEvents() }) }] }
      } catch (err) { return rules.ruleErrorResult(err) }
    })
}
