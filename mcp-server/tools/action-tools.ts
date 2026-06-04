import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { d20WithModifier, getAbilityModifier, rollDice } from '../dice'
import * as gs from '../game-state'
import * as rules from '../rules'
import { AbilityCheckResult, EntityStats } from '../../lib/types'
import { resolvePlayerAttack, type TargetHint } from './combat-tools'

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

type PlayerActionKind =
  | 'attack'
  | 'move'
  | 'interact'
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
  }
}

function wrapActionResult(kind: PlayerActionKind, toolEquivalent: string, result: ToolResponse): ToolResponse {
  if (result.isError) return result

  return jsonResponse({
    success: true,
    kind,
    toolEquivalent,
    result: parseToolPayload(result),
    gameState: summarizeState(),
  })
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

export function registerActionTools(server: McpServer): void {
  server.tool(
    'resolve_player_action',
    'Canonical player action facade. Use one compact action: attack, move, interact, ability_check, social, use_item, wait, or death_save. The engine validates legality, mutates state, and returns the authoritative result.',
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
