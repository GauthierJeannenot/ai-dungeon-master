import type { DMDebugTurnView, EngineEvent, WorldState } from '@/lib/types'

function objectWorldDebug(object: WorldState['objects'][string]): Record<string, unknown> {
  return {
    visible: object.visible,
    discovered: object.discovered,
    opened: object.opened,
    locked: object.locked,
    taken: object.taken,
    used: object.used,
    disarmed: object.disarmed,
  }
}

function npcWorldDebug(npc: WorldState['npcs'][string]): Record<string, unknown> {
  return {
    roomId: npc.roomId,
    disposition: npc.disposition,
    known: npc.known,
    memory: npc.memory ?? {},
  }
}

function questWorldDebug(quest: WorldState['quests'][string]): Record<string, unknown> {
  return {
    progress: quest.progress,
    goal: quest.goal,
    completed: quest.completed,
    flags: quest.flags ?? {},
  }
}

function alarmWorldDebug(alarm: WorldState['alarms'][string]): Record<string, unknown> {
  return {
    level: alarm.level,
    raised: alarm.raised,
    reason: alarm.reason,
  }
}

function fictionFactWorldDebug(fact: WorldState['fictionFacts'][string]): Record<string, unknown> {
  return {
    text: fact.text,
    roomId: fact.roomId,
    status: fact.status,
    source: fact.source,
    tags: fact.tags ?? [],
    expires: fact.expires,
  }
}

function debugRecordsChanged(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  return JSON.stringify(before) !== JSON.stringify(after)
}

function diffWorldRecords<T>(
  beforeRecords: Record<string, T> | undefined,
  afterRecords: Record<string, T> | undefined,
  summarize: (value: T) => Record<string, unknown>
): Record<string, { before: Record<string, unknown>; after: Record<string, unknown> }> | undefined {
  const diff: Record<string, { before: Record<string, unknown>; after: Record<string, unknown> }> = {}
  for (const id of new Set([...Object.keys(beforeRecords ?? {}), ...Object.keys(afterRecords ?? {})])) {
    const before = beforeRecords?.[id] ? summarize(beforeRecords[id]) : {}
    const after = afterRecords?.[id] ? summarize(afterRecords[id]) : {}
    if (debugRecordsChanged(before, after)) diff[id] = { before, after }
  }
  return Object.keys(diff).length > 0 ? diff : undefined
}

export function buildWorldDebugDiff(
  beforeWorld: WorldState | undefined,
  afterWorld: WorldState | undefined,
  events: EngineEvent[]
): DMDebugTurnView['worldDiff'] {
  if (!beforeWorld && !afterWorld) return { events }
  const beforeFlags = beforeWorld?.flags ?? {}
  const afterFlags = afterWorld?.flags ?? {}
  const flagsChanged = debugRecordsChanged(beforeFlags, afterFlags)
  return {
    events,
    objects: diffWorldRecords(beforeWorld?.objects, afterWorld?.objects, objectWorldDebug),
    npcs: diffWorldRecords(beforeWorld?.npcs, afterWorld?.npcs, npcWorldDebug),
    quests: diffWorldRecords(beforeWorld?.quests, afterWorld?.quests, questWorldDebug),
    alarms: diffWorldRecords(beforeWorld?.alarms, afterWorld?.alarms, alarmWorldDebug),
    fictionFacts: diffWorldRecords(beforeWorld?.fictionFacts, afterWorld?.fictionFacts, fictionFactWorldDebug),
    ...(flagsChanged ? { flags: { before: beforeFlags, after: afterFlags } } : {}),
  }
}
