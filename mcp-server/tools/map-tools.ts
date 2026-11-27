import { PartyTravelSelectionSchema } from '../../lib/npc-party-state'
import { preparePartyTransfer,commitPartyTransfer } from '../npc-party'
import { campaignOutcomeIdsForMap } from '../campaign-outcomes'
import { encounterCadenceTransitionIssue } from '../../lib/encounter-cadence-state'
import { assertCackleMapDeparture,withCackleDeclaredDeparture } from '../cackle-fever'
import { assertNpcRestMapDeparture,prepareNpcMapDepartures,commitNpcContinuityMapChange,returningSeparatedNpcIds,npcArrivalOnsets } from '../npc-continuity'
import { assertSurvivalEventsResolved } from '../survival'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as gs from '../game-state'
import * as rules from '../rules'
import {
  evaluateMapQuest,
  getMapSpec,
  mapTransitionsFrom,
  resolveMapTransition,
  inferRoomIdOnMap,
} from '../../lib/adventure-map'
import { navigationActor, navigationGrid, geometricDistanceCells, NavigationError } from '../../lib/navigation'
import { ACTIVE_ADVENTURE_ID } from './../adventure'
import { advanceHeroTime } from '../hero-rules'
import { assertWeatherMapArrival } from '../weather-flight'

// ─────────────────────────────────────────────────────────────────────────────
// travel_to_map — SEUL point d'entrée de changement de map d'un module.
// Le moteur est l'unique juge de la complétion (docs/multi-map-adventures.md) :
// le LLM/joueur ne fait que déclencher la sortie, jamais la décider. Sens
// unique : une map quittée (présente dans mapOutcomes) est inaccessible.
// ─────────────────────────────────────────────────────────────────────────────

export function registerMapTools(server: McpServer): void {
  server.tool(
    'travel_to_map',
    "Moves the player through an explicit authored map transition. Refused during combat or toward a closed story act. Story exits require all required objectives. Local passage transitions (stairs) require approaching their exact departure cell in the correct room; they are reversible, require no quest completion, grant no rest and close no map. Call only after the player's deliberate choice.",
    {
      partyCompanions: z.array(PartyTravelSelectionSchema).max(16).optional().describe('Explicit recruited NPC IDs and distinct actual free destination cells. Bodies must stand adjacent to this departure; never teleport a remote helpful NPC.'),
      transitionId: z.string().optional().describe('Exact transition id from the adventure data.'),
      toMapId: z.string().optional().describe('Destination map id (used when no transitionId is given).'),
      reason: z.string().optional().describe('Short narrative reason, logged only; never used to select a destination. Supply transitionId or toMapId explicitly.'),
    },
    async ({ transitionId, toMapId, reason,partyCompanions }) => {
      try {
        const state = gs.getState()
        const cadence=encounterCadenceTransitionIssue(state);if(cadence)throw new rules.RuleViolation(cadence.code,cadence.message,cadence)
        assertSurvivalEventsResolved()
        rules.assertWeatherEventsResolved()
        if(state.hero?.pending)throw new rules.RuleViolation('REACTION_PENDING','Resolve the held reaction before map travel.',{})
        if(state.hero?.effects.some(effect=>effect.kind==='grapple'&&(effect.sourceId==='player'||effect.targetIds.includes('player'))&&effect.expiresAt>(state.worldTimeSeconds??0))
          ||state.monsterEffects?.some(effect=>effect.kind==='grapple'&&effect.targetId==='player'&&(effect.expiresAt===undefined||effect.expiresAt>(state.worldTimeSeconds??0))))
          throw new rules.RuleViolation('GRAPPLE_MAP_TRAVEL_UNSUPPORTED','Release or escape the actual grapple before changing maps; paired transport currently resolves cells on one map.',{})
        const currentMapId = getMapSpec(state.currentMapId, gs.getState()).id

        const transition = resolveMapTransition(
          { fromMapId: currentMapId, transitionId, toMapId },
          state
        )
        if (!transition) {
          throw new rules.RuleViolation('NO_MAP_TRANSITION', 'No matching map transition leaves the current map.', {
            currentMapId,
            transitionId,
            toMapId,
            available: mapTransitionsFrom(currentMapId, gs.getState()).map(t => ({ id: t.id, toMapId: t.toMapId })),
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

        const partyPlan=preparePartyTransfer(transition.id,transition.toMapId,transition.arrivalRoomId,partyCompanions??[],transition.passage?.cell??state.player.position,transition.arrivalCell)
        if(partyPlan.bodies.some(b=>b.to.x===transition.arrivalCell.x&&b.to.y===transition.arrivalCell.y))throw new rules.RuleViolation('NPC_PARTY_PLAYER_ARRIVAL_OCCUPIED','A companion cannot occupy the player destination.',{})
        const actualCompanions=transition.passage?[]:(transition.companions??[]).filter(id=>{const npc=gs.getNpc(id);return npc?.disposition==='helpful'&&gs.npcOnCurrentMap(npc)})
        assertNpcRestMapDeparture()
        assertCackleMapDeparture([...actualCompanions,...partyPlan.bodies.map(b=>b.npcId)],transition.id)
        const separationIds=prepareNpcMapDepartures(transition.id,[...actualCompanions,...partyPlan.bodies.map(b=>b.npcId)]),departedAt=state.worldTimeSeconds??0
        const departingNpcIds=separationIds.map(id=>state.dmTools!.npcContinuity!.separations[id].input.npcId),returningNpcIds=returningSeparatedNpcIds(transition.toMapId)
        if (transition.passage) {
          const from = getMapSpec(currentMapId, gs.getState())
          const to = getMapSpec(transition.toMapId, gs.getState())
          const passage = transition.passage
          if (!transition.generatedDungeonId && (!from.travelGroup || from.travelGroup !== to.travelGroup)) {
            throw new rules.RuleViolation('INVALID_MAP_PASSAGE', 'Local stairs must stay inside the same story act.', {})
          }
          const actor = navigationActor(state, 'player')
          const distance = geometricDistanceCells(actor.position, passage.cell)
          const grid = navigationGrid(state, 'player', from.geometry)
          if (actor.speed <= 0 || grid.roomAt(actor.position) !== passage.roomId || distance > 1
            || (distance === 1 && !grid.step(actor.position, passage.cell, false, false))) {
            throw new rules.RuleViolation('PASSAGE_OUT_OF_REACH', 'Approach the staircase before changing floors.', { roomId: passage.roomId, approachCell: passage.cell })
          }
          const floors = state.sceneMemory?.floorMonsters as Record<string, typeof state.monsters> | undefined
          const destinationState = { ...state, currentMapId: to.id, monsters: floors?.[to.id] ?? {} }
          if (inferRoomIdOnMap(transition.arrivalCell, to.id, gs.getState()) !== transition.arrivalRoomId
            || !navigationGrid(destinationState, 'player', to.geometry).free(transition.arrivalCell)) {
            throw new rules.RuleViolation('PASSAGE_ARRIVAL_BLOCKED', 'The staircase arrival is blocked.', {})
          }
          withCackleDeclaredDeparture(returningNpcIds,()=>{
            gs.applyMapPassage(to.id, transition.arrivalCell, transition.arrivalRoomId)
            commitPartyTransfer(partyPlan)
            commitNpcContinuityMapChange(currentMapId,to.id,transition.id,partyPlan.bodies.map(b=>b.npcId),departedAt,separationIds)
            gs.addLogEntry({ round: 0, turn: 'player', action: passage.label })
          })
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, localPassage: true,
            companionsMoved:partyPlan.bodies.map(b=>b.npcId), fromMapId: currentMapId, toMapId: to.id, currentRoomId: gs.getState().currentRoomId,
            arrival: { cell: transition.arrivalCell, roomId: transition.arrivalRoomId }, travelSeconds: 0, cackleFeverOnsetsDue:npcArrivalOnsets([...returningNpcIds,...partyPlan.bodies.map(b=>b.npcId)]) }) }] }
        }

        const quest = evaluateMapQuest(state, currentMapId, gs.getState())
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
          ...(campaignOutcomeIdsForMap(state,currentMapId).length?{campaignOutcomeIds:campaignOutcomeIdsForMap(state,currentMapId)}:{}),
        }
        gs.prepareMapDepartureItems(currentMapId, transition.departureItemIds)
        assertWeatherMapArrival(transition.toMapId,transition.arrivalCell)
        if(state.hero&&transition.travelSeconds)withCackleDeclaredDeparture(departingNpcIds,()=>advanceHeroTime(transition.travelSeconds))
        const { companionsMoved, itemsTaken } = withCackleDeclaredDeparture(returningNpcIds,()=>{const committed=gs.applyMapTravel({
          fromMapId: currentMapId,
          toMapId: transition.toMapId,
          arrivalCell: transition.arrivalCell,
          arrivalRoomId: transition.arrivalRoomId,
          companions: transition.companions ?? [],
          outcome,
          departureItemIds: transition.departureItemIds,
        })

        commitPartyTransfer(partyPlan)
        committed.companionsMoved.push(...partyPlan.bodies.map(b=>b.npcId))
        commitNpcContinuityMapChange(currentMapId,transition.toMapId,transition.id,committed.companionsMoved,departedAt,separationIds);return committed})
        const toMap = getMapSpec(transition.toMapId, gs.getState())
        gs.addLogEntry({
          round: gs.getState().round,
          turn: 'system',
          action: `VOYAGE: ${getMapSpec(currentMapId, gs.getState()).name} -> ${toMap.name}`,
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
              itemsTaken: itemsTaken.map(item => ({ id: item.id, name: item.name })),
              cackleFeverOnsetsDue:npcArrivalOnsets([...returningNpcIds,...partyPlan.bodies.map(b=>b.npcId)]),
              travelSeconds: transition.travelSeconds ?? 0,
              currentRoomId: after.currentRoomId,
            }),
          }],
        }
      } catch (err) {
        if (err instanceof NavigationError) return rules.ruleErrorResult(new rules.RuleViolation(err.code, err.message, err.detail))
        return rules.ruleErrorResult(err)
      }
    }
  )
}
