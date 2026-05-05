import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as gs from '../game-state'

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
            alreadyVisited: gs.getState().roomsVisited.filter(r => r === roomId).length > 1,
            currentRoomId: gs.getState().currentRoomId,
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
