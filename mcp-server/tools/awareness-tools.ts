import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getAdventureMap, getMapSpec, inferRoomIdOnMap, resolveRoomMapId } from '../../lib/adventure-map'
import { encounterActorId, encounterAwareness, type EncounterAwareness } from '../../lib/encounter-awareness'
import { adjacentRoomConnections } from '../../lib/scene-perception'
import { findNavigationPath, navigationActor, navigationGrid, navigationPathCost } from '../../lib/navigation'
import { d20WithModifier, getAbilityModifier, rollDice } from '../dice'
import * as gs from '../game-state'
import { RuleViolation, ruleErrorResult, validateMapCell } from '../rules'
import { engineGeometry } from '../navigation'
import { GoalFields, explicitGoal } from './navigation-tools'
import { createMonster } from './phase-tools'
import { getMonsterRecord } from '../../lib/srd/monsters'

const Move = z.object({ monsterIndex: z.number().int().nonnegative(), ...GoalFields, allowPartial: z.boolean().optional() }).strict()

export function registerAwarenessTools(server: McpServer): void {
  server.tool('react_to_noise',
    'Model-chosen reaction of an authored, not-yet-engaged encounter to ACTUALLY RESOLVED noise in the same/adjacent room. First response=alert records vigilance without movement/combat. On a later player action choose investigate with explicit moves (monsterIndex and exactly one navigation goal each); movement is limited to creature speed and stops at closed doors. For an authored noiseAmbush encounter choose response=ambush, explicit doorId facing the source and moves inside its own room, even on the first noise: it must never investigate or join an outside combat. Never opens a door, teleports, attacks or reveals hidden creatures. response=join_combat explicitly adds the investigating encounter at its real positions to an existing combat, without rerolling existing initiative. One reaction per encounter per exploration action revision or combat round; no textual intent parsing. reason is the model interpretation, not an engine-certified acoustic fact.',
    { encounterId: z.string(), sourceRoomId: z.string(), reason: z.string().min(1).max(600),
      response: z.enum(['alert', 'investigate', 'join_combat', 'ambush']), doorId: z.string().optional(), moves: z.array(Move).min(1).optional() },
    async ({ encounterId, sourceRoomId, reason, response, moves, doorId }) => {
      const before = structuredClone(gs.getState())
      try {
        const state = gs.getState(), map = getMapSpec(state.currentMapId, state)
        const preset = getAdventureMap(state).encounters[encounterId]
        if (!preset || resolveRoomMapId(preset.roomId, state) !== map.id)
          throw new RuleViolation('ENCOUNTER_WRONG_MAP', 'Select an authored encounter on the current map.', {})
        if (gs.hasEncounterTriggered(encounterId)) throw new RuleViolation('ENCOUNTER_ALREADY_RESOLVED', 'Use the existing combatants and their normal turns.', {})
        if (state.hero?.pending) throw new RuleViolation('REACTION_PENDING', 'Resolve the held player reaction first.', {})
        const revision = state.playerActionRevision ?? 0
        if (revision <= 0) throw new RuleViolation('RESOLVED_ACTION_REQUIRED', 'A resolved player action must precede a noise reaction.', {})
        const previous = encounterAwareness(state)[encounterId]
        if (previous?.entryPending) throw new RuleViolation('AMBUSH_RESOLUTION_REQUIRED', 'Resolve the entered ambush before another noise reaction.', {})
        if (preset.noiseAmbush && (response === 'investigate' || response === 'join_combat'))
          throw new RuleViolation('ENCOUNTER_HOLDS_ROOM', 'This encounter stays inside its authored room and prepares a doorway ambush.', {})
        if (response === 'alert' && previous && previous.status !== 'alert')
          throw new RuleViolation('ENCOUNTER_ALREADY_INVESTIGATING', 'Do not erase investigating creatures or reset their positions with a new alert.', {})
        const positions = previous?.positions ?? preset.monsters.map(monster => ({ ...monster.cell }))
        const sourceIsLocal = sourceRoomId === state.currentRoomId || (state.phase === 'combat' && state.initiativeOrder.some(id => {
          const entity = gs.getEntity(id)
          return entity && inferRoomIdOnMap(entity.position, map.id, state) === sourceRoomId
        }))
        const audibleRooms = new Set([sourceRoomId, ...adjacentRoomConnections(state, sourceRoomId).map(c => c.room.id)])
        if (!sourceIsLocal || !positions.some(cell => audibleRooms.has(inferRoomIdOnMap(cell, map.id, state) ?? '')))
          throw new RuleViolation('NOISE_SOURCE_OUT_OF_SCOPE', 'Source must be an active scene room connected to an encounter member room.', {})
        const activation = state.phase === 'combat' ? `${map.id}:combat:${state.combatGeneration ?? 0}:${state.round}` : `${map.id}:action:${revision}`
        if (previous?.lastActivation === activation) throw new RuleViolation('ENCOUNTER_REACTION_ALREADY_USED', 'This encounter has already reacted to this action/round.', {})
        if (response !== 'alert' && response !== 'ambush' && (!previous || revision <= previous.revision))
          throw new RuleViolation('PRIOR_ALERT_REQUIRED', 'First record alert; investigation requires a subsequent resolved player action.', {})
        if ((response === 'investigate' || response === 'ambush') !== Boolean(moves)) throw new RuleViolation('EXPLICIT_MOVES_REQUIRED', 'Investigation and ambush require explicit moves; other responses forbid them.', {})
        if (response === 'ambush') {
          const door = getAdventureMap(state).doors?.find(door => door.id === doorId)
          if (!preset.noiseAmbush || !door || !door.sides.some(side => side.roomId === preset.roomId)
            || !door.sides.some(side => side.roomId === sourceRoomId && side.roomId !== preset.roomId))
            throw new RuleViolation('AMBUSH_DOOR_REQUIRED', 'Choose the exact door connecting this encounter room to the noise source.', {})
        } else if (doorId !== undefined) throw new RuleViolation('AMBUSH_DOOR_UNEXPECTED', 'Only ambush accepts doorId.', {})
        if (response === 'join_combat' && (state.phase !== 'combat' || previous?.status !== 'investigating'))
          throw new RuleViolation('COMBAT_JOIN_UNAVAILABLE', 'Joining requires an investigating encounter and an already active combat.', {})
        const awareness: EncounterAwareness = { mapId: map.id, status: response === 'ambush' ? 'ambushing' : response === 'alert' ? 'alert' : 'investigating',
          ...(response === 'ambush' ? { doorId } : {}),
          sourceRoomId, reason, revision, lastActivation: activation, positions: structuredClone(positions),
          speeds: preset.monsters.map(monster => {
            const record = getMonsterRecord(monster.monsterType)
            if (!record) throw new RuleViolation('MONSTER_UNKNOWN', 'Encounter must use an authored SRD monster.', {})
            return record.engine.speed
          }) }
        state.sceneMemory = { ...state.sceneMemory, encounterAwareness: { ...encounterAwareness(state), [encounterId]: awareness } }
        const results: unknown[] = []
        if (moves) {
          const seen = new Set<number>(), geometry = engineGeometry()
          for (let index = 0; index < awareness.positions.length; index++) {
            if (!navigationGrid(state, encounterActorId(encounterId, index), geometry).free(awareness.positions[index]))
              throw new RuleViolation('CELL_OCCUPIED', 'An investigating creature position is blocked; do not overlap or relocate it implicitly.', { monsterIndex: index })
          }
          for (const move of moves) {
            if (!preset.monsters[move.monsterIndex] || seen.has(move.monsterIndex)) throw new RuleViolation('MONSTER_SELECTION_REQUIRED', 'Choose each exact encounter monsterIndex at most once.', {})
            seen.add(move.monsterIndex)
            const id = encounterActorId(encounterId, move.monsterIndex), goal = explicitGoal(move)
            const actor = navigationActor(state, id), grid = navigationGrid(state, id, geometry)
            let path, stopReason = 'goal_reached'
            try { path = findNavigationPath(state, id, goal, { geometry }) }
            catch (err) {
              if (!(err instanceof Error) || !('code' in err) || err.code !== 'NO_PATH' || goal.kind === 'door') throw err
              const hypothetical = findNavigationPath(state, id, goal, { geometry, ignoreClosed: true })
              const stop = hypothetical.findIndex((cell, i) => i > 0 && !grid.step(hypothetical[i - 1], cell))
              if (stop < 1) throw err
              path = hypothetical.slice(0, stop); stopReason = 'closed_door'
            }
            const budget = Math.floor(actor.speed / 5)
            if (navigationPathCost(state, path, id) > budget) {
              if (!move.allowPartial) throw new RuleViolation('MOVEMENT_EXCEEDED', 'Investigation exceeds one creature movement budget.', { costCells: navigationPathCost(state, path, id), remaining: budget })
              let end = 1
              while (end < path.length && navigationPathCost(state, path.slice(0, end + 1), id) <= budget) end++
              path = path.slice(0, end); stopReason = 'movement_budget'
            }
            awareness.positions[move.monsterIndex] = { ...path[path.length - 1] }
            if (response === 'ambush' && (stopReason !== 'goal_reached' || path.some(cell => inferRoomIdOnMap(cell, map.id, state) !== preset.roomId)))
              throw new RuleViolation('ENCOUNTER_HOLDS_ROOM', 'An ambush path must remain entirely inside the encounter room.', {})
            results.push({ monsterIndex: move.monsterIndex, path, costCells: navigationPathCost(state, path, id),
              finalPosition: path[path.length - 1], finalRoomId: inferRoomIdOnMap(path[path.length - 1], map.id, state),
              goalReached: stopReason === 'goal_reached', stopReason })
          }
          if (response === 'ambush') {
            const side = getAdventureMap(state).doors!.find(door => door.id === doorId)!.sides.find(side => side.roomId === preset.roomId)!
            if (!awareness.positions.some(cell => Math.max(Math.abs(cell.x - side.cell.x), Math.abs(cell.y - side.cell.y)) === 1))
              throw new RuleViolation('AMBUSH_POSITION_REQUIRED', 'Place at least one attacker beside the inside threshold, leaving it free for entry.', {})
            if (awareness.positions.some(cell => cell.x === side.cell.x && cell.y === side.cell.y))
              throw new RuleViolation('AMBUSH_THRESHOLD_BLOCKED', 'Leave the inside threshold free for the entering player.', {})
          }
        }
        if (response === 'join_combat') {
          // New combatants enter at the end of the current round. Existing order,
          // current actor and spent actions/movement are preserved.
          const spawned = preset.monsters.map((spec, index) => {
            const cell = awareness.positions[index]; validateMapCell(cell)
            const grid = navigationGrid(state, encounterActorId(encounterId, index), engineGeometry())
            if (!grid.free(cell)) throw new RuleViolation('CELL_OCCUPIED', 'A reinforcement cell is blocked.', { cell })
            const monster = createMonster(spec.monsterType, cell, spec.name, spec.hpOverride)
            monster.socialIdentity = encounterActorId(encounterId, index)
            return monster
          })
          for (const monster of spawned) {
            monster.initiative = rollDice(d20WithModifier(getAbilityModifier(monster.stats.dex))).total
            gs.spawnMonster(monster)
          }
          state.initiativeOrder.push(...spawned.sort((a, b) => b.initiative! - a.initiative!).map(monster => monster.id))
          gs.markEncounterTriggered(encounterId)
          results.push({ joinedCombat: spawned })
        }
        return { content: [{ type: 'text', text: JSON.stringify({ encounterId, response, awareness, results,
          interpretation: 'Noise audibility and reaction chosen by the MJ; geometry, movement and persistence validated by the engine.',
          phase: state.phase, currentTurn: state.currentTurn }) }] }
      } catch (err) { gs.replaceState(before); return ruleErrorResult(err) }
    })
}
