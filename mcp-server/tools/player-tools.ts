import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as gs from '../game-state'
import { GameState } from '../../lib/types'

const ConditionSchema = z.enum([
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
  'prone', 'restrained', 'stunned', 'unconscious', 'exhaustion',
])

const EntityStatsSchema = z.object({
  str: z.number().int(),
  dex: z.number().int(),
  con: z.number().int(),
  int: z.number().int(),
  wis: z.number().int(),
  cha: z.number().int(),
})

const PositionSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
})

const HpSchema = z.object({
  current: z.number().int().min(0),
  max: z.number().int().positive(),
})

const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['weapon', 'armor', 'potion', 'misc']),
  damage: z.string().optional(),
  acBonus: z.number().optional(),
  description: z.string().optional(),
})

const PlayerStateSchema = z.object({
  id: z.literal('player'),
  name: z.string(),
  class: z.string(),
  level: z.number().int().positive(),
  hp: HpSchema,
  ac: z.number().int(),
  stats: EntityStatsSchema,
  proficiencyBonus: z.number().int(),
  position: PositionSchema,
  conditions: z.array(ConditionSchema),
  inventory: z.array(ItemSchema),
  speed: z.number().int().positive(),
  initiative: z.number().optional(),
})

const MonsterStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  hp: HpSchema,
  ac: z.number().int(),
  stats: EntityStatsSchema,
  position: PositionSchema,
  conditions: z.array(ConditionSchema),
  xpValue: z.number().int().min(0),
  attackBonus: z.number().int(),
  damageDice: z.string(),
  speed: z.number().int().positive(),
  initiative: z.number().optional(),
  isAlive: z.boolean(),
})

const CombatLogEntrySchema = z.object({
  id: z.string(),
  round: z.number().int().min(0),
  turn: z.string(),
  action: z.string(),
  mechanicalDetail: z.string().optional(),
  timestamp: z.number(),
})

const GameStateSchema = z.object({
  phase: z.enum(['exploration', 'combat', 'dialogue']),
  player: PlayerStateSchema,
  monsters: z.record(z.string(), MonsterStateSchema),
  initiativeOrder: z.array(z.string()),
  currentTurn: z.string().nullable(),
  round: z.number().int().min(0),
  combatLog: z.array(CombatLogEntrySchema),
  roomsVisited: z.array(z.string()),
  currentRoomId: z.string().nullable(),
})

export function registerPlayerTools(server: McpServer): void {
  // Returns full serializable game state snapshot
  server.tool(
    'get_game_state',
    'Returns the complete current game state (player, monsters, phase, initiative, log)',
    {},
    async () => {
      const state = gs.getState()
      return {
        content: [{ type: 'text', text: JSON.stringify(state, null, 2) }],
      }
    }
  )

  // Internal sync point used by the Next.js API to hydrate this per-session MCP process.
  // The route filters this tool out before sending the tool list to the LLM.
  server.tool(
    'replace_game_state',
    'Internal: replaces the complete game state for this MCP session.',
    {
      gameState: GameStateSchema.describe('Complete serializable game state snapshot'),
    },
    async ({ gameState }) => {
      const state = gs.replaceState(gameState as GameState)
      return {
        content: [{ type: 'text', text: JSON.stringify(state) }],
      }
    }
  )

  // Moves any token (player or monster) to a grid cell
  server.tool(
    'move_token',
    'Moves a token to a new grid cell. tokenId is "player" or a monster ID.',
    {
      tokenId: z.string().describe('ID of the token to move ("player" or monster ID)'),
      toCell: z.object({
        x: z.number().int().min(0),
        y: z.number().int().min(0),
      }).describe('Target grid coordinates'),
    },
    async ({ tokenId, toCell }) => {
      gs.moveToken(tokenId, toCell.x, toCell.y)
      const entity = gs.getEntity(tokenId)
      const name = entity ? ('name' in entity ? entity.name : 'Player') : tokenId
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            tokenId,
            name,
            newPosition: toCell,
          }),
        }],
      }
    }
  )

  // Modifies HP of any entity (positive = heal, negative = damage)
  server.tool(
    'update_hp',
    'Modifies HP of an entity. delta is positive for healing, negative for damage.',
    {
      entityId: z.string().describe('Entity ID ("player" or monster ID)'),
      delta: z.number().describe('HP change: positive = heal, negative = damage'),
      reason: z.string().describe('Reason for HP change (e.g. "longsword hit", "fireball")'),
    },
    async ({ entityId, delta, reason }) => {
      let entity
      if (entityId === 'player') {
        entity = gs.updatePlayerHP(delta)
      } else {
        entity = gs.updateMonsterHP(entityId, delta)
      }

      const died = 'isAlive' in entity ? !entity.isAlive : entity.hp.current === 0
      gs.addLogEntry({
        round: gs.getState().round,
        turn: gs.getState().currentTurn ?? 'N/A',
        action: `${entity.name}: ${delta > 0 ? '+' : ''}${delta} HP (${reason})`,
        mechanicalDetail: `HP: ${entity.hp.current}/${entity.hp.max}${died ? ' — MORT' : ''}`,
      })

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            entityId,
            name: entity.name,
            hpBefore: entity.hp.current - delta,
            hpAfter: entity.hp.current,
            hpMax: entity.hp.max,
            died,
            reason,
          }),
        }],
      }
    }
  )

  // Returns full stats of any entity
  server.tool(
    'get_entity_stats',
    'Returns complete stats of a player or monster entity',
    {
      entityId: z.string().describe('Entity ID ("player" or monster ID)'),
    },
    async ({ entityId }) => {
      const entity = gs.getEntity(entityId)
      if (!entity) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Entity not found: ${entityId}` }) }],
          isError: true,
        }
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(entity, null, 2) }],
      }
    }
  )
}
