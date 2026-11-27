import { PitGeometryInputSchema,pitWitness } from '../../lib/pit-trap-state'
import { qualifyPitGeometry,preparePitTrigger,commitPitOutcome,finishPitLanding,MigrateHeldPitSchema,migrateHeldPitSave } from '../pit-traps'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitCellSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import { equipmentId } from '../equipment'
import { effectiveAC, available, hero, now, addHeroEffect, removeHeroEffect, reactionAvailable, distance } from '../hero-rules'
import { visibleCell } from '../monster-perception'
import { rollDice } from '../dice'
import { reactionWindow } from '../hero-combat'
import { dealDamage, conditionImmune } from '../monster-rules'
import { assertCoverOriginKnown } from '../cover'
import { checkedResolution, savedResolution, registerCheckedResolution, registerToolkitAttack } from '../toolkit-checks'
import { toolkitState, toolkitResult, toolkitError, toolkitLocation, toolkitTransaction, assertToolkitPreparation, assertToolkitReach } from '../toolkit'
import * as gs from '../game-state'
import * as rules from '../rules'
import { assertKnockoutDamageSupported } from '../nonlethal'

const Templates = z.enum(['bear', 'crossbow', 'pit', 'poison_needle'])
const profile = {
  bear: { detection: 10, disarm: 10, threshold: undefined, attacks: 1 },
  crossbow: { detection: 15, disarm: 15, threshold: 5, attacks: 2 },
  pit: { detection: 10, disarm: undefined, threshold: undefined, attacks: 0 },
  poison_needle: { detection: 20, disarm: 20, threshold: 10, attacks: 0 },
} as const
function livingTrapTarget(id: string) {
  const target = gs.getEntity(id)
  return Boolean(target && (id === 'player' ? !gs.getPlayer().deathSaves?.dead : 'isAlive' in target && target.isAlive))
}
function trapById(id: string) {
  const trap = gs.getState().dmTools?.traps[id]
  if (!trap) toolkitError('SCENE_TRAP_NOT_FOUND', 'Select an exact prepared trap ID.')
  return trap!
}
function summary(id: string) {
  const { creation: _creation, ...trap } = trapById(id)
  return trap
}
function logged(data: Record<string, unknown>, message: string) {
  gs.addLogEntry({ round: gs.getState().round, turn: 'system', action: 'Piège', mechanicalDetail: message })
  return toolkitResult({ ...data, mechanicalSummary: message })
}
function attackTrap(trapId: string, targetId: string, index = 0, previous: unknown[] = [], held?: import('../../lib/types').DiceRollResult): ReturnType<typeof toolkitResult> {
  const trap = trapById(trapId), target = gs.getEntity(targetId)!, attacks = [...previous]
  // These templates store the tripwire/victim cell, not the crossbow's firing
  // point. Never award or ignore a directional bonus from an invented origin.
  if(trap.template==='crossbow')assertCoverOriginKnown(undefined,targetId)
  for (; index < profile[trap.template].attacks; index++) {
    if (targetId === 'player' && gs.getPlayer().deathSaves?.dead || targetId !== 'player' && 'isAlive'in target&&!target.isAlive) break
    const roll = held ?? rollDice('1d20+8'), natural = roll.rolls[0]
    const wouldHit = natural === 20 || natural !== 1 && roll.total >= effectiveAC(targetId)
    if (!held && wouldHit && targetId === 'player' && reactionAvailable() && gs.getPlayer().knownSpells?.includes('shield')
      && Object.values(gs.getPlayer().spellSlots ?? {}).some(pool => pool.current > 0)) {
      return reactionWindow('attack', trap.id, targetId, ['shield', 'decline'], {
        type: 'toolkit_attack', domain: 'trap', trapId, targetId, index, attacks,
      }, roll)
    }
    held = undefined
    const hit = natural === 20 || natural !== 1 && roll.total >= effectiveAC(targetId)
    const damageRoll = hit ? rollDice(natural === 20 ? '2d10' : '1d10') : undefined
    const damage = damageRoll ? dealDamage(targetId, damageRoll.total, 'piercing') : undefined
    if (trap.template === 'bear' && hit && livingTrapTarget(targetId)) {
      addHeroEffect('bear-trap', 'player', [targetId], 1e12, { trapId, speedZero: true })
      if (!trap.victims.includes(targetId)) trap.victims.push(targetId)
    }
    attacks.push({ targetId, attackRoll: roll, targetAC: effectiveAC(targetId), hit, damageRoll, damageResolution: damage })
  }
  return logged({ success: true, trap: summary(trapId), attacks }, `${trap.name} déclenché : ${attacks.length} attaque(s) résolue(s).`)
}
function triggerTrap(trapId: string, targetId: string, successCell?:{x:number;y:number}) {
  const trap = trapById(trapId), target = gs.getEntity(targetId)
  if(target)assertKnockoutDamageSupported(target,1)
  if (!target || targetId === 'player' && gs.getPlayer().deathSaves?.dead || targetId !== 'player' && 'isAlive'in target&&!target.isAlive)
    toolkitError('TRAP_TARGET_INVALID', 'Select an existing living triggering creature.')
  if (trap.status !== 'armed') toolkitError('TRAP_NOT_ARMED', 'This trap is disabled or has already triggered; its effects cannot be rolled again.')
  // A selected victim receives the physical trap even when unconscious or
  // unable to see it. Keep real map/room/range and the unobstructed grid ray;
  // voluntary search/disarm still use the acting creature's normal senses.
  const location = toolkitLocation(target!.position)
  if (trap.mapId !== location.mapId || trap.roomId !== location.roomId
    || distance(target!.position, trap.cell) > (trap.objectId ? 1 : 0)
    || !visibleCell({ ...target!, conditions: [] }, trap.cell))
    toolkitError('SCENE_TARGET_OUT_OF_REACH', 'The exact triggering victim must physically occupy the floor trap or reach its trapped object on the same map and in the same room.')
  if(successCell&&trap.template!=='pit')toolkitError('PIT_TRIGGER_ARGUMENT_REQUIRED','The safe cell belongs only to a pit trigger.')
  const pitPlan=trap.template==='pit'?preparePitTrigger(trap,targetId,successCell):undefined
  trap.status = 'triggered'; trap.discovered = true
  if (trap.template === 'bear' || trap.template === 'crossbow') return attackTrap(trapId, targetId)
  const answer=savedResolution({ entityId: targetId, ability: trap.template === 'pit' ? 'dex' : 'con',
    origin: trap.cell,
    dc: trap.template === 'pit' ? 10 : 20, ...(trap.template === 'poison_needle' ? { againstCondition: 'poisoned' as const } : {}) },
  { domain: 'trap-save', command: { trapId, targetId,...pitPlan } })
  if(pitPlan&&hero().pending)trap.pitGeometry!.attempt!.heldWitness=pitWitness(hero().pending)
  return answer
}
export function registerTrapTools(server: McpServer) {
  registerToolkitAttack('trap', (command, roll) => attackTrap(String(command.trapId), String(command.targetId), Number(command.index), command.attacks as unknown[], roll))
  registerCheckedResolution('trap-save', (command, save) => {
    const trap = trapById(String(command.trapId)), targetId = String(command.targetId), target = gs.getEntity(targetId)!
    const pitLanding=trap.template==='pit'?commitPitOutcome(trap,targetId,command.pitDefinition,save as import('../../lib/types').SavingThrowResult):undefined
    const raw = trap.template === 'pit' && save.success ? undefined : rollDice(trap.template === 'pit' ? '1d6' : '4d6')
    const amount = raw ? save.success ? Math.floor(raw.total / 2) : raw.total : 0
    if (!save.success && trap.template === 'poison_needle' && livingTrapTarget(targetId) && !conditionImmune(target, 'poisoned')) {
      const conditions = (['poisoned', 'paralyzed'] as const).filter(condition => gs.applyCondition(targetId, condition).applied)
      gs.getState().monsterEffects ??= []
      gs.getState().monsterEffects!.push({ id: `trap:${trap.id}:${targetId}`, sourceId: targetId, targetId,
        kind: 'trap-poison', conditions, expiresAt: now() + 600 })
    }
    const damage = amount ? dealDamage(targetId, amount, trap.template === 'pit' ? 'bludgeoning' : 'poison') : undefined
    if (!save.success && trap.template === 'pit' && (damage?.damageDealt ?? 0) > 0) gs.applyCondition(targetId, 'prone')
    const groundGearContactIds=trap.template==='pit'?finishPitLanding(targetId,pitLanding):[]
    return logged({ success: true, trap: summary(trap.id), save, damageRoll: raw, damageResolution: damage,groundGearContactIds,
      ...(trap.template === 'pit' && !save.success ? { depthFeet: 10, geometrySupport: 'The actual body is on the qualified ten-foot lower support. Use its real climbing route and selected measured rim; ordinary XY movement grants no ascent.' } : {}) },
    `${trap.name} : sauvegarde ${save.success ? 'réussie' : 'échouée'}, ${amount} dégâts bruts ; état de la cible confirmé par le moteur.`)
  })
  registerCheckedResolution('trap-check', (command, check) => {
    const trap = trapById(String(command.trapId)), action = String(command.action), actorId = String(command.actorId)
    rules.recordAction(actorId)
    if (check.success) {
      if (action === 'search') trap.discovered = true
      if (action === 'disarm') trap.status = 'disabled'
      if (action === 'free') {
        for (const effect of [...hero().effects]) if (effect.kind === 'bear-trap' && effect.data.trapId === trap.id && effect.targetIds.includes(String(command.targetId))) removeHeroEffect(effect.id)
        trap.victims = trap.victims.filter(id => id !== command.targetId)
      }
    }
    const threshold = profile[trap.template].threshold
    if (action === 'disarm' && !check.success && threshold !== undefined && check.roll.total <= threshold) {
      const triggered = triggerTrap(trap.id, actorId)
      return toolkitResult({ success: false, check, trigger: JSON.parse(triggered.content[0].text), pendingReaction: hero().pending,
        mechanicalSummary: `Désamorçage échoué avec ${check.roll.total} : le piège est déclenché, ses conséquences sont ${hero().pending ? 'en attente de réaction' : 'résolues'}.` })
    }
    return logged({ success: check.success, check, trap: summary(trap.id) },
      `${trap.name} : ${action}, ${check.roll.detail} contre DD ${check.dc}, ${check.success ? 'réussite' : 'échec'}. Les informations encore cachées ne sont pas découvertes après un échec.`)
  })
  server.registerTool('migrate_held_pit_save',{description:'Explicit MJ adoption of current measured physical geometry for ONE original W37 pit saving throw still held before its outcome. Provide its exact pendingId, real selected surfaces/body/face measurements and safe successCell. No past height, trigger time, roll, damage, body, action or resource is reconstructed. The same original pending/d20 is retained, then resolve_reaction explicitly resumes it. Measurements are scoped internally only to that owner; all unrelated reaction guards remain. Exact replay is read-only.',inputSchema:MigrateHeldPitSchema.shape,annotations:{idempotentHint:true}},async input=>toolkitTransaction(()=>toolkitResult(migrateHeldPitSave(input))))
  server.registerTool('qualify_pit_geometry',{description:'Explicit MJ preparation for an armed simple pit, including an old unqualified pit: select existing measured one-cell canvas, sameXY floor exactly10ft lower, adjacent safe rim and actual climbing medium spanning that height. Durable actual pit fact required. No floor/wall/map, DC, position, past victim, die or damage is created. Exact replay preserves original qualification. Trigger later needs an explicit successCell on the safe rim; edge-catching is not represented.',inputSchema:PitGeometryInputSchema.shape},async input=>toolkitTransaction(()=>toolkitResult(qualifyPitGeometry(input))))
  server.registerTool('create_trap', {
    description: 'Prepare one uniquely identified, initially armed simple trap from an exact Xanathar 2014-compatible source template outside combat: bear, crossbow, pit, poison_needle. Source detection/disarm DCs, attack bonuses, damage and effects are fixed, not chosen by the model. A poison needle requires an exact prepared container objectId at the same cell. No trigger, damage, discovery or additional actor is automatic on creation. Identical creation is idempotent. A pit requires separate qualify_pit_geometry before its save; creation supplies no lower floor or exit. Complex traps are handled by their own tools.',
    inputSchema: { trapId: ToolkitIdSchema, name: z.string().trim().min(1).max(80), template: Templates,
      cell: ToolkitCellSchema, objectId: ToolkitIdSchema.optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => toolkitTransaction(() => {
    assertToolkitPreparation()
    const location = toolkitLocation(input.cell), data = toolkitState(), creation = JSON.stringify(input), existing = data.traps[input.trapId]
    if (existing) {
      if (existing.creation === creation) return toolkitResult({ success: true, alreadyCreated: true, trap: summary(existing.id) })
      toolkitError('TRAP_ID_CONFLICT', 'This trap ID is already used.')
    }
    if (Object.keys(data.traps).length >= 64) toolkitError('TRAP_LIMIT_REACHED', 'At most 64 prepared traps per adventure session.')
    if ((input.template === 'poison_needle') !== Boolean(input.objectId)) toolkitError('TRAP_OBJECT_REQUIRED', 'Only the poison needle requires a prepared container objectId.')
    if (input.objectId) {
      const object = data.objects[input.objectId]
      if (!object || object.kind !== 'container' || !object.locked || object.mapId !== location.mapId || object.roomId !== location.roomId
        || object.cell.x !== input.cell.x || object.cell.y !== input.cell.y) toolkitError('TRAP_OBJECT_INVALID', 'Choose a locked prepared container at this exact location.')
      if (Object.values(data.traps).some(trap => trap.objectId === input.objectId)) toolkitError('TRAP_OBJECT_OCCUPIED', 'This lock already has a trap.')
    }
    data.traps[input.trapId] = { id: input.trapId, name: input.name, template: input.template, cell: { ...input.cell }, ...location,
      ...(input.objectId ? { objectId: input.objectId } : {}), discovered: false, status: 'armed', victims: [], creation }
    return toolkitResult({ success: true, trap: summary(input.trapId), source: { book: 'xge', section: input.template },
      notice: 'Confidential prepared trap. Creation neither triggers it nor reveals it to the player.' })
  }))
  server.registerTool('interact_trap', {
    description: 'Resolve an exact prepared trap event or action, using its fixed source rules. search: WIS Perception in the same room; disarm: DEX with explicitly owned thieves tools adjacent to a discovered trap. Source failure thresholds can trigger it. trigger is an explicit MJ event with an exact victim standing on the floor trap or adjacent to its trapped lock, never a second player action. free releases one exact bear-trap victim using STR DC15 and one actor action. Shield/Bardic Inspiration windows suspend outcomes without rerolling. Never narrate discovery or damage before confirmation. One-shot triggers refuse repetition.',
    inputSchema: { trapId: ToolkitIdSchema, action: z.enum(['search', 'disarm', 'trigger', 'free']),
      actorId: z.string().default('player'), targetId: z.string().optional(), toolItemId: z.string().optional(), successCell:ToolkitCellSchema.optional() },
  }, async input => toolkitTransaction(() => {
    available()
    const trap = trapById(input.trapId)
    if (input.action === 'trigger') {
      if (!input.targetId) toolkitError('TRAP_TARGET_REQUIRED', 'Choose the exact triggering targetId.')
      return triggerTrap(trap.id, input.targetId!,input.successCell)
    }
    if(input.successCell)toolkitError('PIT_TRIGGER_ARGUMENT_REQUIRED','The explicit safe destination belongs only to a qualified pit trigger.')
    rules.validateActionUse(input.actorId)
    assertToolkitReach(trap, input.actorId, input.action === 'search' ? 6 : 1)
    if (input.action === 'search' && trap.discovered) toolkitError('TRAP_ALREADY_DISCOVERED', 'This trap is already discovered.')
    if (input.action === 'disarm') {
      if (!trap.discovered) toolkitError('TRAP_NOT_DISCOVERED', 'Search successfully before attempting disarmament.')
      if (trap.status !== 'armed') toolkitError('TRAP_NOT_ARMED', 'This trap has already triggered or been disabled.')
      if (profile[trap.template].disarm === undefined) toolkitError('TRAP_DISARM_UNSUPPORTED', 'The source pit has no disarm check; its discovered ledge permits bypass, subject to authored geometry.')
      const tool = gs.getPlayer().inventory.find(item => item.id === input.toolItemId)
      if (input.actorId !== 'player' || !tool || equipmentId(tool) !== 'thieves_tools') toolkitError('THIEVES_TOOLS_REQUIRED', 'Select the player owned thieves tools item.')
    }
    if (input.action === 'free') {
      if (trap.template !== 'bear' || !input.targetId || !trap.victims.includes(input.targetId)) toolkitError('TRAP_VICTIM_REQUIRED', 'Choose an exact creature held by this bear trap.')
    }
    const dc = input.action === 'search' ? profile[trap.template].detection : input.action === 'free' ? 15 : profile[trap.template].disarm!
    return checkedResolution({ entityId: input.actorId, ability: input.action === 'search' ? 'wis' : input.action === 'free' ? 'str' : 'dex',
      ...(input.action === 'search' ? { skill: 'perception' } : input.action === 'disarm' ? { proficient: Boolean(gs.getPlayer().toolProficiencies?.includes('thieves_tools')) } : {}),
      dc, label: `${input.action} — piège` },
    { domain: 'trap-check', command: { trapId: trap.id, actorId: input.actorId, action: input.action, targetId: input.targetId } })
  }))
}
