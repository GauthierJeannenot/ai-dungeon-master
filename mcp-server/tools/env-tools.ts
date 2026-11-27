import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as gs from '../game-state'
import * as rules from '../rules'
import { socialActors } from '../../lib/social'

export function registerEnvTools(server: McpServer): void {
  // Triggers a predefined room event and marks room as visited
  server.tool(
    'trigger_room_event',
    'Triggers an event in a room (trap, discovery, ambush, etc.) and marks room as visited.',
    {
      roomId: z.string().describe('Room identifier from the adventure module'),
      eventType: z.enum([
        'enter',
        'trap',
        'discovery',
        'ambush',
        'puzzle',
        'treasure',
        'exit',
        'custom',
      ]).describe('Type of event being triggered'),
      description: z.string().optional().describe('Additional context for the event'),
    },
    async ({ roomId, eventType, description }) => {
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
        action: `[SALLE ${roomId}] Événement: ${eventType}`,
        mechanicalDetail: description,
      })

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            roomId,
            eventType,
            description,
            alreadyVisited,
            currentRoomId: gs.getState().currentRoomId,
          }),
        }],
      }
    }
  )

  // Reveals NPCs or updates an already-visible NPC's established disposition.
  server.tool(
    'reveal_npc',
    'Reveals NPCs in the current room or updates the disposition of an already-visible NPC after an established interaction. Target by exact npcId or by kind. Use disposition to record trust, an accepted mission or testimony even when certain and requiring no roll; a successful check or narrative alone does not change it. Never grant trust just to satisfy a quest condition. Also shows hidden NPC map tokens.',
    {
      npcId: z.string().optional().describe('Exact NPC id to reveal (e.g. "mac", "dryad_1")'),
      kind: z.string().optional().describe('Reveal every hidden NPC of this kind in the room (e.g. "dryad")'),
      disposition: z.enum(['hostile', 'wary', 'neutral', 'helpful', 'offended']).optional().describe('Established disposition to record, including for an already-visible NPC; not implied by a roll or by narration.'),
      reason: z.string().optional().describe('Narrative reason for the reveal (logged)'),
    },
    async ({ npcId, kind, disposition, reason }) => {
      if (!npcId && !kind) {
        return rules.ruleErrorResult(new rules.RuleViolation('NPC_REVEAL_NO_TARGET', 'reveal_npc requires either npcId or kind.', {}))
      }

      if (disposition) {
        const state = gs.getState()
        const cooperation = { hostile: 0, offended: 1, wary: 1, neutral: 2, helpful: 3 }
        const locked = socialActors(state).find(actor => {
          const npc = state.npcs?.[actor.targetId]
          return npc && !actor.profile.influenceable && cooperation[disposition] > cooperation[npc.disposition]
            && actor.mapId === state.currentMapId && (npc.roomId === null || npc.roomId === state.currentRoomId)
            && (npcId === npc.id || kind === npc.kind || kind === npc.id)
        })
        if (locked) return rules.ruleErrorResult(new rules.RuleViolation('SOCIAL_TARGET_UNINFLUENCEABLE',
          locked.profile.refusalReason ?? 'Campaign rule: this actor cannot be socially influenced.', { targetId: locked.targetId }))
      }
      const revealed = gs.revealNpcs({ npcId, kind, disposition })
      if (revealed.length === 0) {
        return rules.ruleErrorResult(new rules.RuleViolation('NPC_NOT_FOUND', 'No NPC matched in the current room.', {
          npcId,
          kind,
          currentRoomId: gs.getState().currentRoomId,
        }))
      }

      const names = revealed.map(npc => npc.name).join(', ')
      gs.addLogEntry({
        round: gs.getState().round,
        turn: 'system',
        action: `${names} se révèle${revealed.length > 1 ? 'nt' : ''}`,
        mechanicalDetail: reason,
      })

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            revealed: revealed.map(npc => ({
              id: npc.id,
              name: npc.name,
              kind: npc.kind,
              position: npc.position,
              disposition: npc.disposition,
            })),
          }),
        }],
      }
    }
  )

  // Adds a manual entry to the combat/event log
  server.tool(
    'add_to_log',
    'Adds a narrative or mechanical entry to the combat/event log.',
    {
      action: z.string().describe('Main description of the action or event'),
      mechanicalDetail: z.string().optional().describe('Mechanical detail (dice results, DC, etc.)'),
      turn: z.string().optional().describe('Entity ID performing the action (defaults to current turn)'),
    },
    async ({ action, mechanicalDetail, turn }) => {
      const state = gs.getState()
      gs.addLogEntry({
        round: state.round,
        turn: turn ?? state.currentTurn ?? 'narration',
        action,
        mechanicalDetail,
      })

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, action, mechanicalDetail }),
        }],
      }
    }
  )
}
