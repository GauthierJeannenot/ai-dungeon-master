import { continueTumbleMovement } from '../dmg-tumble'
import { continueOverrunMovement } from '../dmg-overrun'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CellSchema } from '../../lib/battlemap-geometry'
import type { NavigationGoal } from '../../lib/navigation'
import { getAdventureMap } from '../../lib/adventure-map'
import * as gs from '../game-state'
import * as rules from '../rules'
import { planNavigation, executeNavigation } from '../navigation'
import { resolveAbilityCheck } from '../ability-check'

export const GoalFields = {
  acknowledgeEventIds: z.array(z.string()).optional().describe('Explicitly acknowledge a previously returned room decision boundary; permits entry only, never executes the event or encounter.'),
  toCell: CellSchema.optional(), roomId: z.string().optional().describe('Exact room ID, not its name. Engine chooses authored arrival point.'),
  doorId: z.string().optional(), doorMode: z.enum(['approach', 'cross']).optional(),
  targetEntityId: z.string().optional(), relation: z.literal('adjacent').optional(),
}
export function explicitGoal(input: { toCell?: { x: number; y: number }; roomId?: string; doorId?: string;
  doorMode?: 'approach' | 'cross'; targetEntityId?: string; relation?: 'adjacent' }): NavigationGoal {
  if ([input.toCell, input.roomId, input.doorId, input.targetEntityId].filter(v => v !== undefined).length !== 1
    || Boolean(input.doorId) !== Boolean(input.doorMode) || Boolean(input.targetEntityId) !== Boolean(input.relation))
    throw new rules.RuleViolation('INVALID_DESTINATION', 'Choose exactly one explicit cell, room, door+mode or entity+relation; no conflicting or missing arguments.', {})
  if (input.toCell) return { kind: 'cell', cell: input.toCell }
  if (input.roomId) return { kind: 'room', roomId: input.roomId }
  if (input.doorId) return { kind: 'door', doorId: input.doorId, mode: input.doorMode! }
  return { kind: 'entity', entityId: input.targetEntityId!, relation: input.relation! }
}

export function registerNavigationTools(server: McpServer) {
  const fields = { tokenId: z.string(), movementMode: z.enum(['walk', 'fly']).optional().describe('Explicit fly supports only native hover actors with zero walking speed, horizontal projection on this same map. No altitude, incorporeal passage, readied or paired flight. Missing mode keeps walking.'), ...GoalFields, allowPartial: z.boolean().optional().describe('Explicit opt-in to movement limited by combat budget; default rejects without mutation.') }
  server.tool('preview_navigation', 'Read-only shortest legal route to an explicit goal. Cost is grid steps, 5 feet each, diagonals alternate 1/2 across the turn. Current occupancy/doors apply; execution revalidates. Explicit movementMode=fly uses the actual native hover speed on this horizontal map only; ground difficult-terrain cost does not apply, walls/doors/occupants still do. Not an exhaustive roleplay menu.', fields,
    async input => { try { return { content: [{ type: 'text', text: JSON.stringify(planNavigation(input.tokenId, explicitGoal(input), input.allowPartial, input.acknowledgeEventIds, false, undefined, input.movementMode, {})) }] } }
      catch (err) { return rules.ruleErrorResult(err) } })
  server.tool('move_token', 'Move to exactly ONE goal: toCell, roomId, doorId+doorMode or targetEntityId+relation="adjacent". Choose IDs from the scene map; engine computes the full path, never supply intermediate coordinates. Exploration traverses a free path in one call, stops before closed doors without opening/forcing/encounters. Combat rejects over-budget paths unless allowPartial=true. Returns actual path, cost, final room, goalReached and stopReason. Explicit movementMode=fly permits only native hover actors with no walking speed, at this map projection; no altitude or passage through walls is invented. Native non-hover flyers are unsupported. NPC movement uses npc_action during a reactive activation. A retained won unused optional Overrun may be explicitly continued within its original real turn with overrunId, player and its exact original free toCell only; it reuses that source route/cost, never finds another path or contest. Tumble uses its distinct tumbleId with the same exact original player/free exit requirements; select only one source ID, never both.',
    { ...fields, stealth: z.boolean().optional(), overrunId:z.string().min(1).optional(),tumbleId:z.string().min(1).optional() }, async input => {
      try {
        if(input.overrunId&&input.tumbleId)throw new rules.RuleViolation('CROSSING_CONTINUATION_CONFLICT','Choose only the exact original retained crossing mode, never both IDs.',{})
        if(input.tumbleId)return continueTumbleMovement({...input,tumbleId:input.tumbleId})
        if(input.overrunId)return continueOverrunMovement({...input,overrunId:input.overrunId})
        if (gs.getNpc(input.tokenId) && (!gs.getMonster(input.tokenId) || gs.getMonster(input.tokenId)?.controller === 'reactive_npc')) throw new rules.RuleViolation('NPC_ACTIVATION_REQUIRED', 'Use npc_action for this actor.', {})
        const goal = explicitGoal(input), before = gs.getState()
        const roomBefore = before.currentRoomId
        if (input.stealth && (input.tokenId !== 'player' || before.phase === 'combat'))
          throw new rules.RuleViolation('STEALTH_MOVE_EXPLORATION_ONLY', 'Stealth movement is player exploration only.', {})
        const plan = planNavigation(input.tokenId, goal, input.allowPartial, input.acknowledgeEventIds, false, undefined, input.movementMode, {})
        const fromCell = { ...(gs.getEntity(input.tokenId) ?? gs.getNpc(input.tokenId))!.position }
        const dc = getAdventureMap(before.adventureId).rooms.find(r => r.id === plan.finalRoomId)?.entryStealthDc ?? 15
        const stealthCheck = input.stealth && plan.costCells > 0 ? resolveAbilityCheck({ ability: 'dex', skill: 'stealth', dc }) : undefined
        const result = executeNavigation(input.tokenId, goal, input.allowPartial, input.acknowledgeEventIds, [], false, undefined, input.movementMode, {})
        if (stealthCheck) gs.addWorldFact({ source: 'move_token:stealth', text: `Entrée furtive : ${stealthCheck.mechanicalSummary}. ${stealthCheck.success ? 'Le joueur passe inaperçu.' : 'Le joueur fait du bruit.'}`, mapId: before.currentMapId!, roomId: result.finalRoomId ?? undefined, expires: result.finalRoomId ? 'room' : 'map' })
        if (result.costCells > 0) gs.addLogEntry({ round: before.round, turn: before.currentTurn ?? input.tokenId,
          action: `${input.tokenId} se deplace`, mechanicalDetail: `Deplacement (${fromCell.x},${fromCell.y}) -> (${result.finalPosition.x},${result.finalPosition.y}) | salle ${roomBefore} -> ${result.finalRoomId} | trajet ${JSON.stringify(result.path)} | coût ${result.costCells} cases | ${result.stopReason}` })
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, tokenId: input.tokenId, ...result,
          newPosition: result.finalPosition, currentRoomId: gs.getState().currentRoomId, roomsVisited: gs.getState().roomsVisited,
          distanceMoved: result.costCells, remainingMovement: result.remaining, stealthCheck,
          ...(input.doorId ? { doorId: input.doorId, doorMode: input.doorMode, crossed: input.doorMode === 'cross' && (result.goalReached || result.stopReason === 'encounter_ambush') } : {}) }) }] }
      } catch (err) { return rules.ruleErrorResult(err) }
    })
}
