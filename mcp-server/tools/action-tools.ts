import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { d20WithModifier, getAbilityModifier, rollDice } from '../dice'
import * as gs from '../game-state'
import * as rules from '../rules'
import {
  AbilityCheckResult,
  EngineEvent,
  EntityStats,
  WorldNpcDisposition,
  WorldNpcState,
  WorldObjectState,
  WorldQuestState,
} from '../../lib/types'
import { normalizeFrenchText } from '../../lib/dm-intent'
import { resolvePlayerAttack, type TargetHint } from './combat-tools'

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

type PlayerActionKind =
  | 'attack'
  | 'move'
  | 'interact'
  | 'search'
  | 'open'
  | 'take'
  | 'unlock'
  | 'force'
  | 'talk'
  | 'threaten'
  | 'hide'
  | 'help'
  | 'flee'
  | 'stabilize'
  | 'use_object'
  | 'ability_check'
  | 'social'
  | 'use_item'
  | 'wait'
  | 'death_save'

const TargetHintSchema = z.enum(['nearest', 'right', 'left', 'front', 'back', 'wounded'])
const AbilitySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha'])
const CellSchema = z.object({ x: z.number().int().min(0), y: z.number().int().min(0) })

const PlayerActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('attack'),
    targetId: z.string().optional(),
    targetName: z.string().optional(),
    targetHint: TargetHintSchema.optional(),
    weaponOrSpell: z.string().optional(),
    advantage: z.boolean().optional(),
    disadvantage: z.boolean().optional(),
    customDamageDice: z.string().optional(),
    rangeCells: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal('move'),
    tokenId: z.string().optional(),
    toCell: CellSchema,
  }),
  z.object({
    kind: z.literal('interact'),
    roomId: z.string(),
    eventType: z.enum(['enter', 'trap', 'discovery', 'ambush', 'puzzle', 'treasure', 'exit', 'custom']),
    description: z.string().optional(),
  }),
  z.object({
    kind: z.literal('search'),
    targetId: z.string().optional(),
    targetName: z.string().optional(),
    roomId: z.string().optional(),
    query: z.string().optional(),
    ability: AbilitySchema.optional(),
    dc: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal('open'),
    targetId: z.string().optional(),
    targetName: z.string().optional(),
    force: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('take'),
    targetId: z.string().optional(),
    targetName: z.string().optional(),
  }),
  z.object({
    kind: z.literal('unlock'),
    targetId: z.string().optional(),
    targetName: z.string().optional(),
  }),
  z.object({
    kind: z.literal('force'),
    targetId: z.string().optional(),
    targetName: z.string().optional(),
  }),
  z.object({
    kind: z.literal('talk'),
    npcId: z.string().optional(),
    targetName: z.string().optional(),
    topic: z.string().optional(),
  }),
  z.object({
    kind: z.literal('threaten'),
    npcId: z.string().optional(),
    targetName: z.string().optional(),
    demand: z.string().optional(),
  }),
  z.object({
    kind: z.literal('hide'),
    dc: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal('help'),
    targetId: z.string().optional(),
    targetName: z.string().optional(),
  }),
  z.object({
    kind: z.literal('flee'),
    dc: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal('stabilize'),
    targetId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('use_object'),
    targetId: z.string().optional(),
    targetName: z.string().optional(),
    useType: z.string().optional(),
  }),
  z.object({
    kind: z.literal('ability_check'),
    entityId: z.string().optional(),
    ability: AbilitySchema,
    dc: z.number().int().optional(),
    proficient: z.boolean().optional(),
    expertise: z.boolean().optional(),
    label: z.string().optional(),
  }),
  z.object({
    kind: z.literal('social'),
    ability: AbilitySchema.optional(),
    dc: z.number().int().optional(),
    proficient: z.boolean().optional(),
    expertise: z.boolean().optional(),
    label: z.string().optional(),
  }),
  z.object({
    kind: z.literal('use_item'),
    itemType: z.enum(['healing_potion']).optional(),
    itemId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('wait'),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('death_save'),
  }),
])

function jsonResponse(value: unknown): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
  }
}

function parseToolPayload(result: ToolResponse): unknown {
  const text = result.content.find(block => block.type === 'text')?.text
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function summarizeState() {
  const state = gs.getState()
  const aliveMonsters = Object.values(state.monsters).filter(monster => monster.isAlive)
  const world = gs.getWorldState()
  const roomId = state.currentRoomId
  const roomObjects = Object.values(world.objects)
    .filter(object => !roomId || object.roomId === roomId)
    .map(object => ({
      id: object.id,
      name: object.name,
      kind: object.kind,
      visible: object.visible,
      discovered: object.discovered,
      opened: object.opened,
      locked: object.locked,
      taken: object.taken,
      used: object.used,
    }))
  const roomNpcs = Object.values(world.npcs)
    .filter(npc => !roomId || npc.roomId === roomId)
    .map(npc => ({
      id: npc.id,
      name: npc.name,
      disposition: npc.disposition,
      known: npc.known,
    }))
  return {
    phase: state.phase,
    round: state.round,
    currentTurn: state.currentTurn,
    player: {
      hp: state.player.hp,
      position: state.player.position,
      conditions: state.player.conditions,
      deathSaves: state.player.deathSaves,
    },
    monsters: {
      alive: aliveMonsters.length,
      aliveIds: aliveMonsters.map(monster => monster.id),
    },
    currentRoomId: state.currentRoomId,
    movementUsed: state.movementUsed,
    actionUsed: state.actionUsed,
    world: {
      roomObjects,
      roomNpcs,
      quests: world.quests,
      alarms: world.alarms,
      lastEventTypes: world.eventLog.slice(-5).map(event => event.type),
    },
  }
}

function wrapActionResult(kind: PlayerActionKind, toolEquivalent: string, result: ToolResponse): ToolResponse {
  if (result.isError) return result

  const parsedResult = parseToolPayload(result)
  const mechanicalSummary = typeof parsedResult === 'object' &&
    parsedResult !== null &&
    'mechanicalSummary' in parsedResult &&
    typeof parsedResult.mechanicalSummary === 'string'
    ? parsedResult.mechanicalSummary
    : undefined

  return jsonResponse({
    success: true,
    kind,
    toolEquivalent,
    mechanicalSummary,
    result: parsedResult,
    gameState: summarizeState(),
  })
}

function blockedAction(code: string, message: string, detail?: Record<string, unknown>): ToolResponse {
  gs.recordWorldEvent({
    type: 'action.blocked',
    summary: message,
    actorId: 'player',
    outcome: 'blocked',
    metadata: { code, ...(detail ?? {}) },
  })
  return rules.ruleErrorResult(new rules.RuleViolation(code, message, detail))
}

function currentRoomOrError(): string {
  const roomId = gs.getState().currentRoomId
  if (!roomId) {
    throw new rules.RuleViolation('ROOM_UNKNOWN', 'The player is not in a known room.', {
      playerPosition: gs.getState().player.position,
    })
  }
  return roomId
}

function recordActionIfCombat(): void {
  const state = gs.getState()
  if (state.phase === 'combat' && state.currentTurn === 'player') {
    rules.recordAction('player')
  }
}

function assertWorldActionAvailable(): ToolResponse | null {
  try {
    rules.validateActionUse('player')
    return null
  } catch (err) {
    const violation = err instanceof rules.RuleViolation
      ? err
      : new rules.RuleViolation('RULE_ERROR', err instanceof Error ? err.message : 'Illegal game action')
    return blockedAction(violation.code, violation.message, violation.detail)
  }
}

function normalizedTargetParts(targetName?: string): string[] {
  const normalized = normalizeFrenchText(targetName ?? '')
  if (!normalized) return []
  return normalized
    .split(/\s+/)
    .map(part => part.trim())
    .filter(part => part.length >= 3)
}

function objectMatchesTarget(object: WorldObjectState, targetName?: string): boolean {
  const target = normalizeFrenchText(targetName ?? '')
  if (!target) return true
  const haystacks = [
    object.id,
    object.name,
    object.kind,
    ...(object.tags ?? []),
  ].map(normalizeFrenchText)

  if (haystacks.some(haystack => haystack === target || haystack.includes(target) || target.includes(haystack))) {
    return true
  }

  const parts = normalizedTargetParts(targetName)
  return parts.length > 0 && parts.some(part => haystacks.some(haystack => haystack.includes(part)))
}

function npcMatchesTarget(npc: WorldNpcState, targetName?: string): boolean {
  const target = normalizeFrenchText(targetName ?? '')
  if (!target) return true
  const haystacks = [
    npc.id,
    npc.name,
    ...(npc.tags ?? []),
  ].map(normalizeFrenchText)
  if (haystacks.some(haystack => haystack === target || haystack.includes(target) || target.includes(haystack))) {
    return true
  }
  const parts = normalizedTargetParts(targetName)
  return parts.length > 0 && parts.some(part => haystacks.some(haystack => haystack.includes(part)))
}

function resolveWorldObjectTarget({
  targetId,
  targetName,
  includeHidden = false,
  kinds,
  onlyOpenable = false,
  onlyTakeable = false,
}: {
  targetId?: string
  targetName?: string
  includeHidden?: boolean
  kinds?: WorldObjectState['kind'][]
  onlyOpenable?: boolean
  onlyTakeable?: boolean
}): WorldObjectState | ToolResponse {
  const roomId = currentRoomOrError()
  const world = gs.getWorldState()
  const candidates = Object.values(world.objects).filter(object => {
    if (targetId && object.id !== targetId) return false
    if (object.roomId !== roomId) return false
    if (object.taken) return false
    if (kinds && !kinds.includes(object.kind)) return false
    if (onlyOpenable && !['door', 'container', 'fixture'].includes(object.kind)) return false
    if (onlyTakeable && !['item', 'clue'].includes(object.kind)) return false
    if (!includeHidden && !object.visible && !object.discovered) return false
    if (!objectMatchesTarget(object, targetName)) return false
    return true
  })

  if (candidates.length === 0) {
    return blockedAction('WORLD_OBJECT_NOT_AFFORDED', 'No matching usable object is currently afforded in this room.', {
      roomId,
      targetId,
      targetName,
      includeHidden,
      onlyOpenable,
      onlyTakeable,
    })
  }

  if (!targetId && !targetName && candidates.length > 1) {
    return blockedAction('WORLD_OBJECT_AMBIGUOUS', 'Several objects could match this action; the player must make the target clearer.', {
      roomId,
      candidates: candidates.map(object => ({ id: object.id, name: object.name, kind: object.kind })),
    })
  }

  return candidates[0]
}

function resolveWorldNpcTarget({
  npcId,
  targetName,
  includeUnknown = false,
}: {
  npcId?: string
  targetName?: string
  includeUnknown?: boolean
}): WorldNpcState | ToolResponse {
  const roomId = currentRoomOrError()
  const world = gs.getWorldState()
  const candidates = Object.values(world.npcs).filter(npc => {
    if (npcId && npc.id !== npcId) return false
    if (npc.roomId !== roomId) return false
    if (!includeUnknown && !npc.known) return false
    if (!npcMatchesTarget(npc, targetName)) return false
    return true
  })

  if (candidates.length === 0) {
    return blockedAction('NPC_NOT_AFFORDED', 'No matching NPC is currently afforded in this room.', {
      roomId,
      npcId,
      targetName,
    })
  }

  if (!npcId && !targetName && candidates.length > 1) {
    return blockedAction('NPC_AMBIGUOUS', 'Several NPCs could match this action; the player must make the target clearer.', {
      roomId,
      candidates: candidates.map(npc => ({ id: npc.id, name: npc.name, disposition: npc.disposition })),
    })
  }

  return candidates[0]
}

function rollPlayerWorldCheck(
  ability: keyof EntityStats,
  dc: number,
  label: string,
  proficient = false
): AbilityCheckResult {
  const player = gs.getPlayer()
  const abilityMod = getAbilityModifier(player.stats[ability])
  const proficiencyMod = proficient ? player.proficiencyBonus : 0
  const roll = rollDice(d20WithModifier(abilityMod + proficiencyMod))
  const success = roll.total >= dc
  const mechanicalSummary = `${label}: ${roll.detail} vs DD ${dc} -> ${success ? 'SUCCES' : 'ECHEC'}`
  const result: AbilityCheckResult = {
    entityId: 'player',
    ability,
    label,
    dc,
    proficient,
    expertise: false,
    roll,
    success,
    mechanicalSummary,
  }

  gs.addLogEntry({
    round: gs.getState().round,
    turn: gs.getState().currentTurn ?? 'player',
    action: `${player.name} - ${label}`,
    mechanicalDetail: mechanicalSummary,
  })

  return result
}

function recordObjectOpened(object: WorldObjectState, outcome: EngineEvent['outcome'], mechanicalDetail?: string): void {
  gs.recordWorldEvent({
    type: object.kind === 'door' ? 'door.opened' : 'object.opened',
    summary: `${object.name} est ouvert.`,
    actorId: 'player',
    targetId: object.id,
    outcome,
    mechanicalDetail,
    metadata: {
      roomId: object.roomId,
      objectKind: object.kind,
    },
  })
}

function discoverContainedObjects(container: WorldObjectState): WorldObjectState[] {
  const discovered: WorldObjectState[] = []
  for (const objectId of container.contains ?? []) {
    const current = gs.getWorldObject(objectId)
    if (!current || current.taken || (current.discovered && current.visible)) continue
    const updated = gs.discoverWorldObject(objectId)
    discovered.push(updated)
    gs.recordWorldEvent({
      type: 'room.object_discovered',
      summary: `${updated.name} est revele dans ${container.name}.`,
      actorId: 'player',
      targetId: updated.id,
      outcome: 'success',
      metadata: {
        roomId: updated.roomId,
        containerId: container.id,
        objectKind: updated.kind,
      },
    })
  }
  return discovered
}

function maybeRecordRecipeFound(object: WorldObjectState): WorldQuestState | undefined {
  if (!object.tags?.includes('recipe_half')) return undefined
  const quest = gs.advanceWorldQuest('grammy_recipe', object.id, 1)
  gs.recordWorldEvent({
    type: 'quest.item_found',
    summary: `${object.name} rejoint la progression de la recette.`,
    actorId: 'player',
    targetId: object.id,
    outcome: 'success',
    metadata: {
      questId: quest.id,
      progress: quest.progress,
      goal: quest.goal,
      completed: quest.completed,
    },
  })
  const state = gs.getState()
  state.sceneMemory = {
    ...(state.sceneMemory ?? {}),
    foundRecipeHalfCount: quest.progress,
    updatedAt: new Date().toISOString(),
  }
  return quest
}

function syncLegacyNpcMemory(npc: WorldNpcState): void {
  if (npc.id !== 'mac') return
  const state = gs.getState()
  state.sceneMemory = {
    ...(state.sceneMemory ?? {}),
    macDisposition: npc.disposition === 'helpful'
      ? 'helpful'
      : npc.disposition === 'offended' || npc.disposition === 'hostile'
        ? 'offended'
        : 'neutral',
    updatedAt: new Date().toISOString(),
  }
}

function resolveMoveAction(tokenId: string, toCell: { x: number; y: number }): ToolResponse {
  try {
    const movement = rules.validateMove(tokenId, toCell)
    const beforeState = gs.getState()
    const entityBefore = gs.getEntity(tokenId)
    const fromCell = entityBefore ? { ...entityBefore.position } : null
    const roomBefore = beforeState.currentRoomId
    gs.moveToken(tokenId, toCell.x, toCell.y)
    rules.recordMove(tokenId, movement.distance)

    const entity = gs.getEntity(tokenId)
    const name = entity ? ('name' in entity ? entity.name : 'Player') : tokenId
    const state = gs.getState()
    const roomTransition = tokenId === 'player'
      ? ` | salle ${roomBefore ?? 'inconnue'} -> ${state.currentRoomId ?? 'inconnue'}`
      : ''
    gs.addLogEntry({
      round: state.round,
      turn: state.currentTurn ?? tokenId,
      action: `${name} se deplace`,
      mechanicalDetail: `Deplacement ${fromCell ? `(${fromCell.x},${fromCell.y})` : '?'} -> (${toCell.x},${toCell.y}) | distance ${movement.distance}${movement.remaining === null ? '' : ` | mouvement restant ${movement.remaining}`}${roomTransition}`,
    })

    return jsonResponse({
      success: true,
      tokenId,
      name,
      newPosition: toCell,
      distanceMoved: movement.distance,
      remainingMovement: movement.remaining,
      currentRoomId: state.currentRoomId,
      roomsVisited: state.roomsVisited,
    })
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
}

function resolveRoomInteraction(roomId: string, eventType: string, description?: string): ToolResponse {
  const beforeState = gs.getState()
  const alreadyVisited = beforeState.roomsVisited.includes(roomId)
  if (beforeState.currentRoomId !== roomId) {
    return rules.ruleErrorResult(new rules.RuleViolation('ROOM_EVENT_LOCATION_MISMATCH', 'Cannot trigger a room event outside the current player room.', {
      requestedRoomId: roomId,
      currentRoomId: beforeState.currentRoomId,
      playerPosition: beforeState.player.position,
    }))
  }

  gs.visitRoom(roomId)
  gs.addLogEntry({
    round: gs.getState().round,
    turn: 'system',
    action: `[SALLE ${roomId}] Evenement: ${eventType}`,
    mechanicalDetail: description,
  })

  return jsonResponse({
    roomId,
    eventType,
    description,
    alreadyVisited,
    currentRoomId: gs.getState().currentRoomId,
  })
}

function resolveAbilityCheck({
  entityId,
  ability,
  dc,
  proficient,
  expertise,
  label,
}: {
  entityId?: string
  ability: keyof EntityStats
  dc?: number
  proficient?: boolean
  expertise?: boolean
  label?: string
}): ToolResponse {
  const resolvedEntityId = entityId ?? 'player'
  const entity = gs.getEntity(resolvedEntityId)
  if (!entity) {
    return rules.ruleErrorResult(new rules.RuleViolation('ENTITY_NOT_FOUND', `Entity not found: ${resolvedEntityId}`, {
      entityId: resolvedEntityId,
    }))
  }

  try {
    rules.validateAbilityCheck(resolvedEntityId)
  } catch (err) {
    return rules.ruleErrorResult(err)
  }

  const abilityMod = getAbilityModifier(entity.stats[ability])
  const proficiencyBonus = 'proficiencyBonus' in entity ? entity.proficiencyBonus : 2
  const proficiencyMod = expertise ? proficiencyBonus * 2 : proficient ? proficiencyBonus : 0
  const totalMod = abilityMod + proficiencyMod
  const roll = rollDice(d20WithModifier(totalMod))
  const success = typeof dc === 'number' ? roll.total >= dc : undefined
  const checkLabel = label?.trim() || `Test ${ability.toUpperCase()}`
  const mechanicalSummary = `${checkLabel}: ${roll.detail}${typeof dc === 'number' ? ` vs DD ${dc} -> ${success ? 'SUCCES' : 'ECHEC'}` : ''}`

  const result: AbilityCheckResult = {
    entityId: resolvedEntityId,
    ability,
    label: checkLabel,
    dc,
    proficient: Boolean(proficient),
    expertise: Boolean(expertise),
    roll,
    success,
    mechanicalSummary,
  }

  gs.addLogEntry({
    round: gs.getState().round,
    turn: gs.getState().currentTurn ?? resolvedEntityId,
    action: `${entity.name} - ${checkLabel}`,
    mechanicalDetail: mechanicalSummary,
  })
  if (gs.getState().phase === 'combat' && gs.getState().currentTurn === resolvedEntityId) {
    rules.recordAction(resolvedEntityId)
  }

  return jsonResponse(result)
}

function resolveHealingPotion(itemId?: string): ToolResponse {
  try {
    rules.validateActionUse('player')

    const playerBefore = gs.getPlayer()
    const potion = playerBefore.inventory.find(item =>
      itemId ? item.id === itemId : item.type === 'potion'
    )
    if (!potion) {
      throw new rules.RuleViolation('ITEM_NOT_FOUND', 'The player has no healing potion to drink.', {
        itemId,
        inventory: playerBefore.inventory.map(item => ({ id: item.id, name: item.name, type: item.type })),
      })
    }

    const hpBefore = playerBefore.hp.current
    const hpMax = playerBefore.hp.max
    const healingRoll = rollDice('2d4+2')
    const consumed = gs.consumePlayerItem(item => item.id === potion.id)
    if (!consumed) {
      throw new rules.RuleViolation('ITEM_NOT_FOUND', 'The healing potion disappeared before it could be consumed.', {
        itemId: potion.id,
      })
    }

    const playerAfter = gs.updatePlayerHP(healingRoll.total)
    if (gs.getState().phase === 'combat' && gs.getState().currentTurn === 'player') {
      rules.recordAction('player')
    }

    const remainingPotions = playerAfter.inventory.filter(item => item.type === 'potion').length
    const mechanicalSummary = `Potion de soin: ${healingRoll.detail} | HP ${hpBefore}/${hpMax} -> ${playerAfter.hp.current}/${playerAfter.hp.max} | potions restantes: ${remainingPotions}`
    gs.addLogEntry({
      round: gs.getState().round,
      turn: gs.getState().currentTurn ?? 'player',
      action: `${playerAfter.name} boit ${consumed.name}`,
      mechanicalDetail: mechanicalSummary,
    })

    return jsonResponse({
      entityId: 'player',
      itemId: consumed.id,
      itemName: consumed.name,
      healingRoll,
      healingDone: playerAfter.hp.current - hpBefore,
      hpBefore,
      hpAfter: playerAfter.hp.current,
      hpMax: playerAfter.hp.max,
      remainingPotions,
      mechanicalSummary,
    })
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
}

function resolveWait(reason?: string): ToolResponse {
  const state = gs.getState()
  if (state.currentTurn !== 'player') {
    return rules.ruleErrorResult(new rules.RuleViolation(
      'PLAYER_TURN_REQUIRED',
      'Only the player turn can be passed through this action.',
      { currentTurn: state.currentTurn }
    ))
  }

  try {
    rules.validateNextTurn('player', true)
  } catch (err) {
    return rules.ruleErrorResult(err)
  }

  gs.addLogEntry({
    round: gs.getState().round,
    turn: 'player',
    action: 'Le joueur passe son tour',
    mechanicalDetail: reason,
  })

  const nextTurn = gs.advanceTurn()
  const nextState = gs.getState()
  return jsonResponse({
    endedTurn: 'player',
    currentTurn: nextTurn,
    round: nextState.round,
    initiativeOrder: nextState.initiativeOrder,
    skippedAction: true,
    reason,
  })
}

function resolveDeathSave(): ToolResponse {
  const state = gs.getState()
  const player = state.player

  try {
    if (state.phase !== 'combat') {
      throw new rules.RuleViolation('NOT_IN_COMBAT', 'Death saves only happen during combat.', { phase: state.phase })
    }
    if (state.currentTurn !== 'player') {
      throw new rules.RuleViolation('PLAYER_TURN_REQUIRED', 'Death saves can only be rolled on the player turn.', {
        currentTurn: state.currentTurn,
      })
    }
    if (gs.hasActionUsed('player')) {
      throw new rules.RuleViolation('ACTION_ALREADY_USED', 'The player has already rolled a death save this turn.', {
        entityId: 'player',
        currentTurn: state.currentTurn,
      })
    }
    if (player.hp.current > 0) {
      throw new rules.RuleViolation('PLAYER_NOT_DYING', 'The player is conscious and does not need a death save.', {
        hp: player.hp,
      })
    }
    if (player.deathSaves?.stable) {
      throw new rules.RuleViolation('PLAYER_STABLE', 'The player is already stable and does not roll more death saves.', {
        deathSaves: player.deathSaves,
      })
    }
    if (player.deathSaves?.dead) {
      throw new rules.RuleViolation('PLAYER_DEAD', 'The player is dead and cannot roll more death saves.', {
        deathSaves: player.deathSaves,
      })
    }
  } catch (err) {
    return rules.ruleErrorResult(err)
  }

  const roll = rollDice('1d20')
  const naturalRoll = roll.rolls[0] ?? roll.total
  const deathSave = gs.rollPlayerDeathSave(naturalRoll)
  const outcome = deathSave.criticalSuccess
    ? 'CRITIQUE: le joueur reprend 1 PV'
    : deathSave.criticalFailure
      ? 'ECHEC CRITIQUE: deux echecs'
      : deathSave.success
        ? 'SUCCES'
        : 'ECHEC'
  const status = deathSave.dead
    ? 'mort'
    : deathSave.stable
      ? 'stable'
      : deathSave.hpAfter > 0
        ? 'conscient'
        : `${deathSave.successes} succes / ${deathSave.failures} echecs`
  const mechanicalSummary = `Jet de mort: ${roll.detail} -> ${outcome} | ${status}`

  rules.recordAction('player')
  gs.addLogEntry({
    round: gs.getState().round,
    turn: 'player',
    action: 'Jet de sauvegarde contre la mort',
    mechanicalDetail: mechanicalSummary,
  })

  return jsonResponse({
    ...deathSave,
    roll,
    mechanicalSummary,
  })
}

function resolveSearchAction({
  targetId,
  targetName,
  roomId,
  query,
  ability,
  dc,
}: {
  targetId?: string
  targetName?: string
  roomId?: string
  query?: string
  ability?: keyof EntityStats
  dc?: number
}): ToolResponse {
  const availabilityError = assertWorldActionAvailable()
  if (availabilityError) return availabilityError

  let resolvedRoomId: string
  try {
    resolvedRoomId = currentRoomOrError()
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
  if (roomId && roomId !== resolvedRoomId) {
    return blockedAction('SEARCH_ROOM_MISMATCH', 'Search can only target the player current room.', {
      requestedRoomId: roomId,
      currentRoomId: resolvedRoomId,
    })
  }

  const targetText = targetName ?? query
  const world = gs.getWorldState()
  const containedBehindClosedObjects = new Set(
    Object.values(world.objects)
      .filter(object => object.contains?.length && object.opened !== true)
      .flatMap(object => object.contains ?? [])
  )
  const hiddenCandidates = Object.values(world.objects).filter(object => {
    if (targetId && object.id !== targetId) return false
    if (object.roomId !== resolvedRoomId) return false
    if (object.taken) return false
    if (containedBehindClosedObjects.has(object.id)) return false
    if (object.discovered && object.visible) return false
    if (targetText && !objectMatchesTarget(object, targetText)) return false
    return true
  })
  const knownOpenedContainers = Object.values(world.objects).filter(object =>
    object.roomId === resolvedRoomId &&
    object.opened &&
    (targetText ? objectMatchesTarget(object, targetText) : true)
  )
  const containedHidden = knownOpenedContainers.flatMap(container =>
    (container.contains ?? [])
      .map(objectId => world.objects[objectId])
      .filter((object): object is WorldObjectState => Boolean(object && !object.taken && (!object.visible || !object.discovered)))
  )
  const candidates = [...hiddenCandidates, ...containedHidden]
  const defaultDc = candidates.length > 0
    ? Math.min(...candidates.map(object => object.dc?.search ?? 10))
    : 10
  const check = rollPlayerWorldCheck(ability ?? 'wis', dc ?? defaultDc, targetText ? `Fouille: ${targetText}` : 'Fouille de la salle', true)

  const discoveredObjects = check.success
    ? candidates.filter(object => check.roll.total >= (object.dc?.search ?? dc ?? defaultDc))
    : []
  const uniqueDiscovered = new Map(discoveredObjects.map(object => [object.id, object]))
  const updatedObjects: WorldObjectState[] = []
  for (const object of uniqueDiscovered.values()) {
    const updated = gs.discoverWorldObject(object.id)
    updatedObjects.push(updated)
    gs.recordWorldEvent({
      type: 'room.object_discovered',
      summary: `${updated.name} est decouvert.`,
      actorId: 'player',
      targetId: updated.id,
      outcome: 'success',
      mechanicalDetail: check.mechanicalSummary,
      metadata: {
        roomId: resolvedRoomId,
        objectKind: updated.kind,
        searchTarget: targetText,
      },
    })
  }

  recordActionIfCombat()

  return jsonResponse({
    success: Boolean(check.success),
    roomId: resolvedRoomId,
    check,
    discoveredObjects: updatedObjects.map(object => ({
      id: object.id,
      name: object.name,
      kind: object.kind,
      locked: object.locked,
      opened: object.opened,
    })),
    mechanicalSummary: `${check.mechanicalSummary} | decouvertes: ${updatedObjects.length}`,
  })
}

function resolveOpenAction({
  targetId,
  targetName,
  force,
}: {
  targetId?: string
  targetName?: string
  force?: boolean
}): ToolResponse {
  if (force) {
    return resolveForceAction({ targetId, targetName })
  }

  const availabilityError = assertWorldActionAvailable()
  if (availabilityError) return availabilityError

  let object: WorldObjectState | ToolResponse
  try {
    object = resolveWorldObjectTarget({
      targetId,
      targetName,
      onlyOpenable: true,
    })
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
  if ('content' in object) return object

  if (object.opened) {
    return blockedAction('OBJECT_ALREADY_OPEN', 'This object is already open.', {
      objectId: object.id,
      objectName: object.name,
    })
  }
  if (object.locked) {
    return blockedAction('OBJECT_LOCKED', 'This object is locked; unlock or force it before opening.', {
      objectId: object.id,
      objectName: object.name,
    })
  }

  const opened = gs.openWorldObject(object.id)
  recordObjectOpened(opened, 'success')
  const discoveries = discoverContainedObjects(opened)
  gs.addLogEntry({
    round: gs.getState().round,
    turn: gs.getState().currentTurn ?? 'player',
    action: `${gs.getPlayer().name} ouvre ${opened.name}`,
    mechanicalDetail: `Ouverture: ${opened.id} | contenu revele: ${discoveries.length}`,
  })
  recordActionIfCombat()

  return jsonResponse({
    success: true,
    object: opened,
    discoveredObjects: discoveries,
    mechanicalSummary: `${opened.name} ouvert | contenu revele: ${discoveries.length}`,
  })
}

function resolveUnlockAction({
  targetId,
  targetName,
}: {
  targetId?: string
  targetName?: string
}): ToolResponse {
  const availabilityError = assertWorldActionAvailable()
  if (availabilityError) return availabilityError

  let object: WorldObjectState | ToolResponse
  try {
    object = resolveWorldObjectTarget({
      targetId,
      targetName,
      onlyOpenable: true,
    })
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
  if ('content' in object) return object

  if (object.opened) {
    return blockedAction('OBJECT_ALREADY_OPEN', 'This object is already open.', {
      objectId: object.id,
      objectName: object.name,
    })
  }
  if (!object.locked) {
    const opened = gs.openWorldObject(object.id)
    recordObjectOpened(opened, 'success')
    const discoveries = discoverContainedObjects(opened)
    recordActionIfCombat()
    return jsonResponse({
      success: true,
      object: opened,
      discoveredObjects: discoveries,
      mechanicalSummary: `${opened.name} n etait pas verrouille et s ouvre.`,
    })
  }

  const dc = object.dc?.unlock ?? 12
  const check = rollPlayerWorldCheck('dex', dc, `Crochetage: ${object.name}`, true)
  if (!check.success) {
    recordActionIfCombat()
    return jsonResponse({
      success: false,
      object,
      check,
      mechanicalSummary: check.mechanicalSummary,
    })
  }

  const opened = gs.openWorldObject(object.id)
  recordObjectOpened(opened, 'success', check.mechanicalSummary)
  const discoveries = discoverContainedObjects(opened)
  recordActionIfCombat()

  return jsonResponse({
    success: true,
    object: opened,
    check,
    discoveredObjects: discoveries,
    mechanicalSummary: `${check.mechanicalSummary} | ${opened.name} ouvert | contenu revele: ${discoveries.length}`,
  })
}

function resolveForceAction({
  targetId,
  targetName,
}: {
  targetId?: string
  targetName?: string
}): ToolResponse {
  const availabilityError = assertWorldActionAvailable()
  if (availabilityError) return availabilityError

  let object: WorldObjectState | ToolResponse
  try {
    object = resolveWorldObjectTarget({
      targetId,
      targetName,
      onlyOpenable: true,
    })
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
  if ('content' in object) return object

  if (object.opened) {
    return blockedAction('OBJECT_ALREADY_OPEN', 'This object is already open.', {
      objectId: object.id,
      objectName: object.name,
    })
  }

  const dc = object.dc?.force ?? 13
  const check = rollPlayerWorldCheck('str', dc, `Forcage: ${object.name}`, true)
  const alarm = gs.raiseWorldAlarm('bakery_alert', `bruit en forcant ${object.name}`, 1)
  gs.recordWorldEvent({
    type: 'alarm.raised',
    summary: `Le bruit autour de ${object.name} augmente l alerte.`,
    actorId: 'player',
    targetId: 'bakery_alert',
    outcome: check.success ? 'success' : 'failure',
    mechanicalDetail: check.mechanicalSummary,
    metadata: {
      alarmLevel: alarm.level,
      objectId: object.id,
    },
  })

  if (!check.success) {
    recordActionIfCombat()
    return jsonResponse({
      success: false,
      object,
      check,
      alarm,
      mechanicalSummary: `${check.mechanicalSummary} | alerte ${alarm.level}`,
    })
  }

  const opened = gs.openWorldObject(object.id)
  recordObjectOpened(opened, 'success', check.mechanicalSummary)
  const discoveries = discoverContainedObjects(opened)
  recordActionIfCombat()

  return jsonResponse({
    success: true,
    object: opened,
    check,
    alarm,
    discoveredObjects: discoveries,
    mechanicalSummary: `${check.mechanicalSummary} | ${opened.name} force et ouvert | contenu revele: ${discoveries.length}`,
  })
}

function resolveTakeAction({
  targetId,
  targetName,
}: {
  targetId?: string
  targetName?: string
}): ToolResponse {
  const availabilityError = assertWorldActionAvailable()
  if (availabilityError) return availabilityError

  let object: WorldObjectState | ToolResponse
  try {
    object = resolveWorldObjectTarget({
      targetId,
      targetName,
      onlyTakeable: true,
    })
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
  if ('content' in object) return object

  if (!object.discovered && !object.visible) {
    return blockedAction('OBJECT_NOT_DISCOVERED', 'The player cannot take an object that has not been discovered.', {
      objectId: object.id,
      objectName: object.name,
    })
  }
  if (object.taken) {
    return blockedAction('OBJECT_ALREADY_TAKEN', 'This object has already been taken.', {
      objectId: object.id,
      objectName: object.name,
    })
  }

  const taken = gs.takeWorldObject(object.id)
  const player = gs.getPlayer()
  if (!player.inventory.some(item => item.id === taken.id)) {
    player.inventory.push({
      id: taken.id,
      name: taken.name,
      type: 'misc',
      description: taken.description,
    })
  }
  gs.recordWorldEvent({
    type: 'object.taken',
    summary: `${taken.name} est pris.`,
    actorId: 'player',
    targetId: taken.id,
    outcome: 'success',
    metadata: {
      roomId: taken.roomId,
      objectKind: taken.kind,
    },
  })
  const quest = maybeRecordRecipeFound(taken)
  gs.addLogEntry({
    round: gs.getState().round,
    turn: gs.getState().currentTurn ?? 'player',
    action: `${player.name} prend ${taken.name}`,
    mechanicalDetail: quest
      ? `Objet pris: ${taken.id} | quete ${quest.id}: ${quest.progress}/${quest.goal}`
      : `Objet pris: ${taken.id}`,
  })
  recordActionIfCombat()

  return jsonResponse({
    success: true,
    object: taken,
    quest,
    inventoryIds: player.inventory.map(item => item.id),
    mechanicalSummary: quest
      ? `${taken.name} pris | recette ${quest.progress}/${quest.goal}`
      : `${taken.name} pris`,
  })
}

function nextDispositionAfterTalk(npc: WorldNpcState, topic?: string): { disposition: WorldNpcDisposition; check?: AbilityCheckResult } {
  const topicText = normalizeFrenchText(topic ?? '')
  const asksHelp = /\b(aide|aider|recette|grammy|conseil|indices?|information|infos?)\b/.test(topicText)

  if (npc.disposition === 'hostile') {
    const check = rollPlayerWorldCheck('cha', 13, `Parlementer avec ${npc.name}`, true)
    return { disposition: check.success ? 'wary' : 'offended', check }
  }

  if (npc.disposition === 'offended') {
    const check = rollPlayerWorldCheck('cha', 14, `Rattraper ${npc.name}`, true)
    return { disposition: check.success ? 'neutral' : 'offended', check }
  }

  if (npc.disposition === 'wary') return { disposition: asksHelp ? 'neutral' : 'wary' }
  if (npc.disposition === 'neutral') return { disposition: asksHelp ? 'helpful' : 'neutral' }
  return { disposition: npc.disposition }
}

function recordNpcDispositionChange(npcBefore: WorldNpcState, npcAfter: WorldNpcState, check?: AbilityCheckResult): void {
  if (npcBefore.disposition === npcAfter.disposition && npcBefore.known === npcAfter.known) return
  gs.recordWorldEvent({
    type: 'npc.disposition_changed',
    summary: `${npcAfter.name}: ${npcBefore.disposition} -> ${npcAfter.disposition}.`,
    actorId: 'player',
    targetId: npcAfter.id,
    outcome: check?.success === false ? 'failure' : 'success',
    mechanicalDetail: check?.mechanicalSummary,
    metadata: {
      roomId: npcAfter.roomId,
      from: npcBefore.disposition,
      to: npcAfter.disposition,
    },
  })
  syncLegacyNpcMemory(npcAfter)
}

function resolveTalkAction({
  npcId,
  targetName,
  topic,
}: {
  npcId?: string
  targetName?: string
  topic?: string
}): ToolResponse {
  const availabilityError = assertWorldActionAvailable()
  if (availabilityError) return availabilityError

  let npc: WorldNpcState | ToolResponse
  try {
    npc = resolveWorldNpcTarget({ npcId, targetName, includeUnknown: true })
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
  if ('content' in npc) return npc

  const before = structuredClone(npc)
  const social = nextDispositionAfterTalk(npc, topic)
  const after = gs.updateNpcDisposition(npc.id, social.disposition)
  recordNpcDispositionChange(before, after, social.check)
  gs.addLogEntry({
    round: gs.getState().round,
    turn: gs.getState().currentTurn ?? 'player',
    action: `${gs.getPlayer().name} parle avec ${after.name}`,
    mechanicalDetail: social.check?.mechanicalSummary ?? `Disposition: ${before.disposition} -> ${after.disposition}`,
  })
  recordActionIfCombat()

  return jsonResponse({
    success: social.check ? Boolean(social.check.success) : true,
    npc: after,
    check: social.check,
    mechanicalSummary: social.check
      ? `${social.check.mechanicalSummary} | disposition ${before.disposition} -> ${after.disposition}`
      : `Disposition ${before.disposition} -> ${after.disposition}`,
  })
}

function resolveThreatenAction({
  npcId,
  targetName,
  demand,
}: {
  npcId?: string
  targetName?: string
  demand?: string
}): ToolResponse {
  const availabilityError = assertWorldActionAvailable()
  if (availabilityError) return availabilityError

  let npc: WorldNpcState | ToolResponse
  try {
    npc = resolveWorldNpcTarget({ npcId, targetName, includeUnknown: true })
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
  if ('content' in npc) return npc

  const before = structuredClone(npc)
  const check = rollPlayerWorldCheck('cha', 13, `Intimidation: ${npc.name}`, true)
  const nextDisposition: WorldNpcDisposition = check.success
    ? npc.disposition === 'hostile' ? 'wary' : 'offended'
    : 'hostile'
  const after = gs.updateNpcDisposition(npc.id, nextDisposition)
  recordNpcDispositionChange(before, after, check)

  let alarm = undefined
  if (!check.success || before.disposition !== 'hostile') {
    alarm = gs.raiseWorldAlarm('bakery_alert', `menace envers ${after.name}`, 1)
    gs.recordWorldEvent({
      type: 'alarm.raised',
      summary: `La menace envers ${after.name} fait monter l alerte.`,
      actorId: 'player',
      targetId: 'bakery_alert',
      outcome: check.success ? 'success' : 'failure',
      mechanicalDetail: check.mechanicalSummary,
      metadata: {
        alarmLevel: alarm.level,
        npcId: after.id,
        demand,
      },
    })
  }

  recordActionIfCombat()
  return jsonResponse({
    success: Boolean(check.success),
    npc: after,
    check,
    alarm,
    mechanicalSummary: `${check.mechanicalSummary} | disposition ${before.disposition} -> ${after.disposition}${alarm ? ` | alerte ${alarm.level}` : ''}`,
  })
}

function resolveHideAction(dc?: number): ToolResponse {
  const availabilityError = assertWorldActionAvailable()
  if (availabilityError) return availabilityError

  const check = rollPlayerWorldCheck('dex', dc ?? 13, 'Discretion', true)
  if (check.success) {
    gs.setWorldFlag('player_hidden', true)
    gs.recordWorldEvent({
      type: 'character.hidden',
      summary: 'Le joueur est cache.',
      actorId: 'player',
      targetId: 'player',
      outcome: 'success',
      mechanicalDetail: check.mechanicalSummary,
      metadata: {
        roomId: gs.getState().currentRoomId,
      },
    })
  } else {
    gs.setWorldFlag('player_hidden', false)
    const alarm = gs.raiseWorldAlarm('bakery_alert', 'discretion ratee', 1)
    gs.recordWorldEvent({
      type: 'alarm.raised',
      summary: 'La tentative de discretion attire l attention.',
      actorId: 'player',
      targetId: 'bakery_alert',
      outcome: 'failure',
      mechanicalDetail: check.mechanicalSummary,
      metadata: { alarmLevel: alarm.level },
    })
  }
  recordActionIfCombat()
  return jsonResponse({
    success: Boolean(check.success),
    check,
    hidden: Boolean(check.success),
    mechanicalSummary: check.mechanicalSummary,
  })
}

function resolveFleeAction(dc?: number): ToolResponse {
  const availabilityError = assertWorldActionAvailable()
  if (availabilityError) return availabilityError

  const check = rollPlayerWorldCheck('dex', dc ?? 12, 'Fuite', true)
  gs.setWorldFlag('player_fled', Boolean(check.success))
  gs.recordWorldEvent({
    type: 'escape.attempted',
    summary: check.success ? 'Le joueur trouve une ouverture pour fuir.' : 'La fuite echoue.',
    actorId: 'player',
    targetId: 'player',
    outcome: check.success ? 'success' : 'failure',
    mechanicalDetail: check.mechanicalSummary,
    metadata: {
      phase: gs.getState().phase,
      roomId: gs.getState().currentRoomId,
    },
  })
  recordActionIfCombat()
  return jsonResponse({
    success: Boolean(check.success),
    check,
    fled: Boolean(check.success),
    mechanicalSummary: check.mechanicalSummary,
  })
}

function resolveHelpAction({
  targetId,
  targetName,
}: {
  targetId?: string
  targetName?: string
}): ToolResponse {
  const availabilityError = assertWorldActionAvailable()
  if (availabilityError) return availabilityError

  const target = targetId ?? normalizeFrenchText(targetName ?? '')
  if (target === 'player' || target.includes('moi')) {
    return blockedAction('HELP_SELF_UNSUPPORTED', 'Helping yourself is not a meaningful engine action here.', {
      targetId,
      targetName,
    })
  }

  gs.setWorldFlag(`helping_${targetId ?? normalizeFrenchText(targetName ?? 'unknown').replace(/\s+/g, '_')}`, true)
  gs.recordWorldEvent({
    type: 'state.changed',
    summary: 'Le joueur se met en position d aider.',
    actorId: 'player',
    targetId: targetId ?? targetName,
    outcome: 'success',
    metadata: {
      targetId,
      targetName,
    },
  })
  recordActionIfCombat()
  return jsonResponse({
    success: true,
    targetId,
    targetName,
    mechanicalSummary: `Aide preparee pour ${targetName ?? targetId ?? 'une cible'}`,
  })
}

function resolveStabilizeAction(targetId?: string): ToolResponse {
  const availabilityError = assertWorldActionAvailable()
  if (availabilityError) return availabilityError

  const resolvedTarget = targetId ?? 'player'
  if (resolvedTarget !== 'player') {
    return blockedAction('STABILIZE_TARGET_UNSUPPORTED', 'Only the player can currently be stabilized by this lightweight world engine.', {
      targetId: resolvedTarget,
    })
  }
  const player = gs.getPlayer()
  if (player.hp.current > 0) {
    return blockedAction('TARGET_NOT_DYING', 'The target is conscious and does not need stabilization.', {
      targetId: resolvedTarget,
      hp: player.hp,
    })
  }

  const check = rollPlayerWorldCheck('wis', 10, 'Stabilisation', false)
  if (check.success) {
    gs.stabilizePlayer(check.mechanicalSummary)
  }
  recordActionIfCombat()
  return jsonResponse({
    success: Boolean(check.success),
    check,
    deathSaves: gs.getPlayer().deathSaves,
    mechanicalSummary: check.mechanicalSummary,
  })
}

function resolveUseObjectAction({
  targetId,
  targetName,
  useType,
}: {
  targetId?: string
  targetName?: string
  useType?: string
}): ToolResponse {
  const availabilityError = assertWorldActionAvailable()
  if (availabilityError) return availabilityError

  let object: WorldObjectState | ToolResponse
  try {
    object = resolveWorldObjectTarget({
      targetId,
      targetName,
      includeHidden: false,
    })
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
  if ('content' in object) return object

  const updated = gs.updateWorldObject(object.id, { used: true })
  let hpDamage = 0
  let alarm = undefined

  if (updated.kind === 'trap' || updated.tags?.includes('trap')) {
    const damageRoll = rollDice('1d6')
    hpDamage = damageRoll.total
    gs.updatePlayerHP(-hpDamage)
    gs.recordWorldEvent({
      type: 'trap.triggered',
      summary: `${updated.name} est declenche.`,
      actorId: 'player',
      targetId: updated.id,
      outcome: 'failure',
      mechanicalDetail: `Degats: ${damageRoll.detail}`,
      metadata: {
        roomId: updated.roomId,
        damage: hpDamage,
        playerHpAfter: gs.getPlayer().hp.current,
      },
    })
  } else {
    gs.recordWorldEvent({
      type: 'object.used',
      summary: `${updated.name} est utilise.`,
      actorId: 'player',
      targetId: updated.id,
      outcome: 'success',
      metadata: {
        roomId: updated.roomId,
        objectKind: updated.kind,
        useType,
      },
    })
  }

  if (updated.tags?.includes('noise') || updated.tags?.includes('dangerous')) {
    alarm = gs.raiseWorldAlarm('bakery_alert', `utilisation de ${updated.name}`, 1)
    gs.recordWorldEvent({
      type: 'alarm.raised',
      summary: `${updated.name} fait monter l alerte.`,
      actorId: 'player',
      targetId: 'bakery_alert',
      outcome: 'success',
      metadata: {
        alarmLevel: alarm.level,
        objectId: updated.id,
      },
    })
  }

  gs.addLogEntry({
    round: gs.getState().round,
    turn: gs.getState().currentTurn ?? 'player',
    action: `${gs.getPlayer().name} utilise ${updated.name}`,
    mechanicalDetail: `Objet utilise: ${updated.id}${hpDamage ? ` | degats ${hpDamage}` : ''}${alarm ? ` | alerte ${alarm.level}` : ''}`,
  })
  recordActionIfCombat()

  return jsonResponse({
    success: true,
    object: updated,
    hpDamage,
    alarm,
    mechanicalSummary: `${updated.name} utilise${hpDamage ? ` | degats ${hpDamage}` : ''}${alarm ? ` | alerte ${alarm.level}` : ''}`,
  })
}

export function registerActionTools(server: McpServer): void {
  server.tool(
    'resolve_player_action',
    'Canonical player action facade. Use one compact action: attack, move, search, open, take, unlock, force, talk, threaten, hide, help, flee, stabilize, use_object, ability_check, social, use_item, wait, or death_save. The engine validates legality, mutates state, records canonical events, and returns the authoritative result.',
    {
      action: PlayerActionSchema.describe('Compact player action to resolve through the rules engine.'),
    },
    async ({ action }) => {
      switch (action.kind) {
        case 'attack':
          return wrapActionResult('attack', 'resolve_player_attack', resolvePlayerAttack({
            targetId: action.targetId,
            targetName: action.targetName,
            targetHint: action.targetHint as TargetHint | undefined,
            weaponOrSpell: action.weaponOrSpell,
            advantage: action.advantage,
            disadvantage: action.disadvantage,
            customDamageDice: action.customDamageDice,
            rangeCells: action.rangeCells,
          }))

        case 'move':
          return wrapActionResult('move', 'move_token', resolveMoveAction(action.tokenId ?? 'player', action.toCell))

        case 'interact':
          return wrapActionResult('interact', 'trigger_room_event', resolveRoomInteraction(action.roomId, action.eventType, action.description))

        case 'search':
          return wrapActionResult('search', 'world.search', resolveSearchAction({
            targetId: action.targetId,
            targetName: action.targetName,
            roomId: action.roomId,
            query: action.query,
            ability: action.ability,
            dc: action.dc,
          }))

        case 'open':
          return wrapActionResult('open', 'world.open', resolveOpenAction({
            targetId: action.targetId,
            targetName: action.targetName,
            force: action.force,
          }))

        case 'take':
          return wrapActionResult('take', 'world.take', resolveTakeAction({
            targetId: action.targetId,
            targetName: action.targetName,
          }))

        case 'unlock':
          return wrapActionResult('unlock', 'world.unlock', resolveUnlockAction({
            targetId: action.targetId,
            targetName: action.targetName,
          }))

        case 'force':
          return wrapActionResult('force', 'world.force', resolveForceAction({
            targetId: action.targetId,
            targetName: action.targetName,
          }))

        case 'talk':
          return wrapActionResult('talk', 'world.talk', resolveTalkAction({
            npcId: action.npcId,
            targetName: action.targetName,
            topic: action.topic,
          }))

        case 'threaten':
          return wrapActionResult('threaten', 'world.threaten', resolveThreatenAction({
            npcId: action.npcId,
            targetName: action.targetName,
            demand: action.demand,
          }))

        case 'hide':
          return wrapActionResult('hide', 'world.hide', resolveHideAction(action.dc))

        case 'help':
          return wrapActionResult('help', 'world.help', resolveHelpAction({
            targetId: action.targetId,
            targetName: action.targetName,
          }))

        case 'flee':
          return wrapActionResult('flee', 'world.flee', resolveFleeAction(action.dc))

        case 'stabilize':
          return wrapActionResult('stabilize', 'world.stabilize', resolveStabilizeAction(action.targetId))

        case 'use_object':
          return wrapActionResult('use_object', 'world.use_object', resolveUseObjectAction({
            targetId: action.targetId,
            targetName: action.targetName,
            useType: action.useType,
          }))

        case 'ability_check':
          return wrapActionResult('ability_check', 'roll_ability_check', resolveAbilityCheck({
            entityId: action.entityId,
            ability: action.ability,
            dc: action.dc,
            proficient: action.proficient,
            expertise: action.expertise,
            label: action.label,
          }))

        case 'social':
          return wrapActionResult('social', 'roll_ability_check', resolveAbilityCheck({
            entityId: 'player',
            ability: action.ability ?? 'cha',
            dc: action.dc,
            proficient: action.proficient ?? true,
            expertise: action.expertise,
            label: action.label ?? 'Interaction sociale',
          }))

        case 'use_item':
          if (action.itemType && action.itemType !== 'healing_potion') {
            return rules.ruleErrorResult(new rules.RuleViolation('UNSUPPORTED_ITEM_ACTION', 'Only healing potions are currently supported by resolve_player_action.', {
              itemType: action.itemType,
            }))
          }
          return wrapActionResult('use_item', 'use_healing_potion', resolveHealingPotion(action.itemId))

        case 'wait':
          return wrapActionResult('wait', 'pass_turn', resolveWait(action.reason))

        case 'death_save':
          return wrapActionResult('death_save', 'roll_death_save', resolveDeathSave())
      }
    }
  )
}
