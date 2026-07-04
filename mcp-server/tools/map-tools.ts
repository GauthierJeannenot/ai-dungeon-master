import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as gs from '../game-state'
import * as rules from '../rules'
import {
  evaluateMapQuest,
  getMapSpec,
  mapTransitionsFrom,
  resolveMapTransition,
} from '../../lib/adventure-map'
import { ACTIVE_ADVENTURE_ID } from './../adventure'

// ─────────────────────────────────────────────────────────────────────────────
// travel_to_map — SEUL point d'entrée de changement de map d'un module.
// Le moteur est l'unique juge de la complétion (docs/multi-map-adventures.md) :
// le LLM/joueur ne fait que déclencher la sortie, jamais la décider. Sens
// unique : une map quittée (présente dans mapOutcomes) est inaccessible.
// ─────────────────────────────────────────────────────────────────────────────

export function registerMapTools(server: McpServer): void {
  server.tool(
    'travel_to_map',
    "Moves the player to another map of the adventure through a declared transition. REFUSED while in combat, if the map quest's required objectives are not all complete, or toward an already-departed map (one-way). Call it when the player deliberately leaves the current map (crossing the portal, boarding the ferry...). On refusal, narrate the way as still closed using the missing objectives returned.",
    {
      transitionId: z.string().optional().describe('Exact transition id from the adventure data.'),
      toMapId: z.string().optional().describe('Destination map id (used when no transitionId is given).'),
      reason: z.string().optional().describe('Short narrative reason for the departure (logged).'),
    },
    async ({ transitionId, toMapId, reason }) => {
      try {
        const state = gs.getState()
        const currentMapId = getMapSpec(state.currentMapId, ACTIVE_ADVENTURE_ID).id

        const transition = resolveMapTransition(
          { fromMapId: currentMapId, transitionId, toMapId, text: reason },
          ACTIVE_ADVENTURE_ID
        )
        if (!transition) {
          throw new rules.RuleViolation('NO_MAP_TRANSITION', 'No matching map transition leaves the current map.', {
            currentMapId,
            transitionId,
            toMapId,
            available: mapTransitionsFrom(currentMapId, ACTIVE_ADVENTURE_ID).map(t => ({ id: t.id, toMapId: t.toMapId })),
          })
        }

        if (state.phase === 'combat') {
          throw new rules.RuleViolation('TRAVEL_DURING_COMBAT', 'Cannot travel to another map during combat.', {
            currentTurn: state.currentTurn,
          })
        }

        if (state.mapOutcomes?.[transition.toMapId]) {
          throw new rules.RuleViolation('MAP_TRANSITION_ONE_WAY', 'This map was already departed — transitions are one-way.', {
            toMapId: transition.toMapId,
          })
        }

        const quest = evaluateMapQuest(state, currentMapId, ACTIVE_ADVENTURE_ID)
        if (!quest.requiredDone) {
          const missing = quest.objectives.filter(o => o.required && !o.done)
          throw new rules.RuleViolation('MAP_QUEST_INCOMPLETE', 'The current map quest is not complete enough to leave.', {
            currentMapId,
            missingObjectives: missing.map(o => ({ id: o.id, label: o.label })),
          })
        }

        const outcome = {
          completion: quest.allDone ? ('total' as const) : ('partial' as const),
          objectivesDone: quest.objectives.filter(o => o.done).map(o => o.id),
        }
        const { companionsMoved } = gs.applyMapTravel({
          fromMapId: currentMapId,
          toMapId: transition.toMapId,
          arrivalCell: transition.arrivalCell,
          arrivalRoomId: transition.arrivalRoomId,
          companions: transition.companions ?? [],
          outcome,
        })

        const toMap = getMapSpec(transition.toMapId, ACTIVE_ADVENTURE_ID)
        gs.addLogEntry({
          round: gs.getState().round,
          turn: 'system',
          action: `VOYAGE: ${getMapSpec(currentMapId, ACTIVE_ADVENTURE_ID).name} -> ${toMap.name}`,
          mechanicalDetail: `Quête ${outcome.completion === 'total' ? 'totale' : 'partielle'} (${outcome.objectivesDone.join(', ') || 'aucun objectif'})${reason ? ` | ${reason}` : ''}`,
        })

        const after = gs.getState()
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              fromMapId: currentMapId,
              toMapId: transition.toMapId,
              toMapName: toMap.name,
              outcome,
              arrival: { cell: transition.arrivalCell, roomId: transition.arrivalRoomId },
              companionsMoved,
              currentRoomId: after.currentRoomId,
            }),
          }],
        }
      } catch (err) {
        return rules.ruleErrorResult(err)
      }
    }
  )
}
