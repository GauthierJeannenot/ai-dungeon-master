import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as gs from '../game-state'
import * as rules from '../rules'
import { resolveAbilityCheck } from '../ability-check'
import { assertDoorReach, getDoor, getDoorState, setDoorState } from '../doors'
import { hiddenDoorRecord } from '../../lib/door-discovery'
import { recordAlarmPanelContact } from '../alarm-spell'
import { alarmPingCount, alarmPingsSince } from '../../lib/alarm-state'

export function interactDoor(doorId: string, action: 'open' | 'close' | 'force', actorId = 'player') {

        const { door, side } = getDoor(doorId, actorId)
        assertDoorReach(doorId, actorId)
        if (door.opening) {
          if (action !== 'open') throw new rules.RuleViolation('NO_DOOR_PANEL', 'This is an empty opening, with no door to close or force.', { doorId })
          return { content: [{ type: 'text' as const, text: JSON.stringify({ doorId, name: door.name,
            opening: true, doorState: 'open', unchanged: true, crossed: false, currentRoomId: gs.getState().currentRoomId }) }] }
        }
        if (gs.getEntity(actorId)) rules.validateActionUse(actorId)
        const before = getDoorState(doorId)
        const hidden=hiddenDoorRecord(gs.getState(),doorId)
        if (before === 'broken' || (action === 'open' && before === 'open') || (action === 'close' && before === 'closed')) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ doorId, name: door.name, doorState: before, unchanged: true, currentRoomId: gs.getState().currentRoomId }) }] }
        }
        if (action === 'open' && door.barredFromRoomId === side.roomId && before === 'closed') {
          throw new rules.RuleViolation('DOOR_BARRED', 'The door is barred from the other side; force it or find another entrance.', { doorId })
        }
        if(actorId==='player'&&action==='open'&&before==='closed'&&hidden?.definition.mechanism&&!hidden.mechanismUnderstood)
          throw new rules.RuleViolation('DOOR_MECHANISM_UNKNOWN','The detected door has an established non-obvious opening mechanism; finding it did not determine how to open it.',{doorId})
        const forceDc=hidden?.definition.forceDc??door.forceDc
        if(action==='force'&&hidden&&forceDc===undefined)throw new rules.RuleViolation('DOOR_FORCE_DC_REQUIRED','No actual difficulty for breaking this hidden door/wall has been established. No default DC, die or action is substituted.',{doorId})
        const check = action === 'force' ? resolveAbilityCheck({ entityId: actorId, ability: 'str', skill: hidden?undefined:'athletics', dc: forceDc ?? 15, label: `Forcer ${door.name}` }) : undefined
        const after = action === 'force' ? check?.success ? 'broken' : before : action === 'open' ? 'open' : 'closed'
        setDoorState(doorId, after)
        if (!check && gs.getState().phase === 'combat') rules.recordAction(actorId)
        const beforePings = alarmPingCount(gs.getState())
        recordAlarmPanelContact(doorId, actorId)
        gs.addLogEntry({ round: gs.getState().round, turn: actorId, action: `${door.name} : ${after}`, mechanicalDetail: check?.mechanicalSummary })
        return { content: [{ type: 'text' as const, text: JSON.stringify({ doorId, name: door.name, action, doorState: after, previousState: before, check, currentRoomId: gs.getState().currentRoomId, crossed: false, ...alarmPingsSince(gs.getState(), beforePings) }) }] }

}

export function registerDoorTools(server: McpServer): void {
  server.tool('interact_door',
    'Opens, closes or forces an authored door, without crossing it. First approach its current-room cell with move_token(doorId, doorMode="approach"). Validates reach before any roll/action. Force uses the authored STR Athletics DC (default 15).',
    { actorId: z.string().default('player'), doorId: z.string(), action: z.enum(['open', 'close', 'force']) },
    async ({ actorId, doorId, action }) => {
      try {
        if (actorId !== 'player') throw new rules.RuleViolation('NPC_ACTIVATION_REQUIRED', 'Use npc_action for an NPC door action.', {})
        return interactDoor(doorId, action, actorId)
      } catch (err) { return rules.ruleErrorResult(err) }
    })
}
