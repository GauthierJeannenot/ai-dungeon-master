import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as gs from '../game-state'
import * as rules from '../rules'

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

  // Reveals one or more NPCs that are present but hidden in the current room.
  server.tool(
    'reveal_npc',
    'Reveals one or more NPCs that are present but hidden in the current room (shows their map token). Target by npcId or by kind (e.g. kind:"dryad" reveals all dryads). Use when hidden NPCs show themselves to the player (offering accepted, successful social check, ambush sprung).',
    {
      npcId: z.string().optional().describe('Exact NPC id to reveal (e.g. "mac", "dryad_1")'),
      kind: z.string().optional().describe('Reveal every hidden NPC of this kind in the room (e.g. "dryad")'),
      disposition: z.enum(['hostile', 'wary', 'neutral', 'helpful', 'offended']).optional().describe('Optional new disposition to set on the revealed NPCs'),
      reason: z.string().optional().describe('Narrative reason for the reveal (logged)'),
    },
    async ({ npcId, kind, disposition, reason }) => {
      if (!npcId && !kind) {
        return rules.ruleErrorResult(new rules.RuleViolation('NPC_REVEAL_NO_TARGET', 'reveal_npc requires either npcId or kind.', {}))
      }

      const revealed = gs.revealNpcs({ npcId, kind, disposition })
      if (revealed.length === 0) {
        return rules.ruleErrorResult(new rules.RuleViolation('NPC_NOT_FOUND', 'No hidden NPC matched in the current room.', {
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
