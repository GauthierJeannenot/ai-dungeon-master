import type { EngineEvent, FictionFactState, WorldNpcDisposition, WorldState } from './types'
import { validateWorldState, type WorldValidationIssue } from './world-validation'

export interface WorldEventReplayIssue {
  code: string
  eventId?: string
  eventType?: string
  targetId?: string
  message: string
}

export interface WorldEventReplayResult {
  world: WorldState
  issues: WorldEventReplayIssue[]
}

function replayIssue(
  code: string,
  event: EngineEvent,
  message: string
): WorldEventReplayIssue {
  return {
    code,
    eventId: event.id,
    eventType: event.type,
    targetId: event.targetId,
    message,
  }
}

function validationIssue(problem: WorldValidationIssue): WorldEventReplayIssue {
  return {
    code: problem.code,
    message: `${problem.path}: ${problem.message}`,
  }
}

function targetObject(world: WorldState, event: EngineEvent, issues: WorldEventReplayIssue[]) {
  if (!event.targetId || !world.objects[event.targetId]) {
    issues.push(replayIssue('REPLAY_OBJECT_TARGET_MISSING', event, `Object target "${event.targetId ?? 'none'}" does not exist.`))
    return undefined
  }
  return world.objects[event.targetId]
}

function targetNpc(world: WorldState, event: EngineEvent, issues: WorldEventReplayIssue[]) {
  if (!event.targetId || !world.npcs[event.targetId]) {
    issues.push(replayIssue('REPLAY_NPC_TARGET_MISSING', event, `NPC target "${event.targetId ?? 'none'}" does not exist.`))
    return undefined
  }
  return world.npcs[event.targetId]
}

function targetQuest(world: WorldState, event: EngineEvent, issues: WorldEventReplayIssue[]) {
  if (!event.targetId || !world.quests[event.targetId]) {
    issues.push(replayIssue('REPLAY_QUEST_TARGET_MISSING', event, `Quest target "${event.targetId ?? 'none'}" does not exist.`))
    return undefined
  }
  return world.quests[event.targetId]
}

function targetAlarm(world: WorldState, event: EngineEvent, issues: WorldEventReplayIssue[]) {
  if (!event.targetId || !world.alarms[event.targetId]) {
    issues.push(replayIssue('REPLAY_ALARM_TARGET_MISSING', event, `Alarm target "${event.targetId ?? 'none'}" does not exist.`))
    return undefined
  }
  return world.alarms[event.targetId]
}

function targetFictionFact(world: WorldState, event: EngineEvent, issues: WorldEventReplayIssue[]) {
  if (!event.targetId || !world.fictionFacts?.[event.targetId]) {
    issues.push(replayIssue('REPLAY_FICTION_FACT_TARGET_MISSING', event, `Fiction fact target "${event.targetId ?? 'none'}" does not exist.`))
    return undefined
  }
  return world.fictionFacts[event.targetId]
}

function metadataFact(event: EngineEvent): Partial<FictionFactState> {
  const raw = event.metadata?.fact
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Partial<FictionFactState>
    : {}
}

function applyEvent(world: WorldState, event: EngineEvent, issues: WorldEventReplayIssue[]): void {
  switch (event.type) {
    case 'room.object_discovered':
    case 'object.examined':
      {
        const object = targetObject(world, event, issues)
        if (object) {
          object.visible = true
          object.discovered = true
        }
      }
      return

    case 'door.opened':
    case 'object.opened':
      {
        const object = targetObject(world, event, issues)
        if (object) {
          object.visible = true
          object.discovered = true
          object.opened = true
          object.locked = false
        }
      }
      return

    case 'object.taken':
      {
        const object = targetObject(world, event, issues)
        if (object) {
          if (object.taken) {
            issues.push(replayIssue('REPLAY_DUPLICATE_TAKE', event, `${object.name} was taken more than once.`))
          }
          object.visible = true
          object.discovered = true
          object.taken = true
        }
      }
      return

    case 'quest.item_found':
      {
        const object = targetObject(world, event, issues)
        const questId = typeof event.metadata?.questId === 'string' ? event.metadata.questId : 'grammy_recipe'
        const quest = world.quests[questId]
        if (!object || !quest) {
          issues.push(replayIssue('REPLAY_QUEST_ITEM_INVALID', event, 'Quest item event lacks a valid object or quest.'))
          return
        }
        quest.flags ??= {}
        if (!quest.flags[object.id]) {
          quest.flags[object.id] = true
          quest.progress = Math.min(quest.goal, quest.progress + 1)
        }
      }
      return

    case 'quest.completed':
      {
        const quest = targetQuest(world, event, issues)
        if (quest) {
          quest.flags ??= {}
          quest.flags.recipe_combined = true
          quest.progress = Math.max(quest.progress, quest.goal)
          quest.completed = true
          world.flags ??= {}
          world.flags.recipe_combined = true
        }
      }
      return

    case 'trap.disarmed':
      {
        const object = targetObject(world, event, issues)
        if (object) {
          object.disarmed = true
          object.used = false
        }
      }
      return

    case 'trap.triggered':
      {
        const object = targetObject(world, event, issues)
        if (object) {
          if (object.disarmed) {
            issues.push(replayIssue('REPLAY_TRIGGERED_DISARMED_TRAP', event, `${object.name} was triggered after being disarmed.`))
          }
          object.used = true
        }
      }
      return

    case 'object.used':
      {
        const object = targetObject(world, event, issues)
        if (object) object.used = true
      }
      return

    case 'npc.disposition_changed':
      {
        const npc = targetNpc(world, event, issues)
        const to = event.metadata?.to
        if (npc && typeof to === 'string') {
          npc.disposition = to as WorldNpcDisposition
          npc.known = true
        }
      }
      return

    case 'alarm.raised':
      {
        const alarm = targetAlarm(world, event, issues)
        if (alarm) {
          const alarmLevel = typeof event.metadata?.alarmLevel === 'number' ? event.metadata.alarmLevel : alarm.level + 1
          alarm.level = Math.max(alarm.level, alarmLevel)
          alarm.raised = true
          alarm.reason = typeof event.metadata?.reason === 'string' ? event.metadata.reason : alarm.reason
          if (alarm.clock) alarm.clock.value = Math.max(alarm.clock.value, alarm.level)
        }
      }
      return

    case 'fiction.fact_created':
      {
        if (!event.targetId) {
          issues.push(replayIssue('REPLAY_FICTION_FACT_ID_MISSING', event, 'Fiction fact creation lacks a target id.'))
          return
        }
        const factPatch = metadataFact(event)
        const existing = world.fictionFacts[event.targetId]
        if (existing && existing.status === 'active') {
          issues.push(replayIssue('REPLAY_DUPLICATE_FICTION_FACT', event, `${existing.text} was created more than once.`))
        }
        world.fictionFacts[event.targetId] = {
          id: event.targetId,
          text: typeof factPatch.text === 'string' && factPatch.text.trim() ? factPatch.text : event.summary,
          status: 'active',
          roomId: typeof factPatch.roomId === 'string' ? factPatch.roomId : undefined,
          source: typeof factPatch.source === 'string' ? factPatch.source : undefined,
          tags: Array.isArray(factPatch.tags) ? factPatch.tags.filter((tag): tag is string => typeof tag === 'string') : [],
          createdAt: typeof factPatch.createdAt === 'string' ? factPatch.createdAt : undefined,
          updatedAt: typeof factPatch.updatedAt === 'string' ? factPatch.updatedAt : undefined,
          expires: typeof factPatch.expires === 'string' || factPatch.expires === null ? factPatch.expires : undefined,
          softAffordances: Array.isArray(factPatch.softAffordances) ? factPatch.softAffordances : undefined,
          metadata: factPatch.metadata,
        }
      }
      return

    case 'fiction.fact_used':
      {
        const fact = targetFictionFact(world, event, issues)
        if (fact) {
          fact.status = 'used'
          fact.updatedAt = typeof event.metadata?.updatedAt === 'string' ? event.metadata.updatedAt : fact.updatedAt
        }
      }
      return

    case 'fiction.fact_expired':
      {
        const fact = targetFictionFact(world, event, issues)
        if (fact) {
          fact.status = 'expired'
          fact.updatedAt = typeof event.metadata?.updatedAt === 'string' ? event.metadata.updatedAt : fact.updatedAt
        }
      }
      return

    default:
      return
  }
}

export function replayWorldEvents(initialWorld: WorldState, events: EngineEvent[]): WorldEventReplayResult {
  const world = structuredClone(initialWorld)
  world.fictionFacts ??= {}
  const issues: WorldEventReplayIssue[] = []

  for (const event of events) applyEvent(world, event, issues)

  const validation = validateWorldState(world)
  for (const problem of validation.issues) issues.push(validationIssue(problem))

  return { world, issues }
}
