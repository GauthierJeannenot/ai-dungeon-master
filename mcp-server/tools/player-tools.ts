import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as gs from '../game-state'

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
