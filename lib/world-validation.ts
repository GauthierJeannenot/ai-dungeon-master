import type {
  EngineEvent,
  EngineEventType,
  WorldAlarmState,
  WorldNpcState,
  WorldObjectState,
  WorldQuestState,
  WorldRoomState,
  WorldState,
} from './types'

export interface WorldValidationIssue {
  code: string
  path: string
  message: string
}

export interface WorldValidationResult {
  ok: boolean
  issues: WorldValidationIssue[]
}

const OBJECT_TARGET_EVENTS = new Set<EngineEventType>([
  'room.object_discovered',
  'door.opened',
  'object.opened',
  'object.taken',
  'object.examined',
  'object.used',
  'clue.read',
  'trap.triggered',
  'trap.disarmed',
])

const NPC_TARGET_EVENTS = new Set<EngineEventType>([
  'npc.disposition_changed',
  'npc.information_revealed',
])

const QUEST_TARGET_EVENTS = new Set<EngineEventType>(['quest.completed'])
const ALARM_TARGET_EVENTS = new Set<EngineEventType>(['alarm.raised'])

function issue(code: string, path: string, message: string): WorldValidationIssue {
  return { code, path, message }
}

function validateKeyedEntity<T extends { id: string }>(
  issues: WorldValidationIssue[],
  kind: string,
  records: Record<string, T> | undefined
): void {
  if (!records || typeof records !== 'object') {
    issues.push(issue('WORLD_RECORD_MISSING', kind, `${kind} must be a record.`))
    return
  }

  for (const [id, entity] of Object.entries(records)) {
    if (!entity || typeof entity !== 'object') {
      issues.push(issue('WORLD_ENTITY_INVALID', `${kind}.${id}`, `${kind}.${id} must be an object.`))
      continue
    }
    if (entity.id !== id) {
      issues.push(issue('WORLD_ID_MISMATCH', `${kind}.${id}.id`, `Expected id "${id}", received "${entity.id}".`))
    }
  }
}

function validateUniqueIds(world: WorldState, issues: WorldValidationIssue[]): void {
  const seen = new Map<string, string>()
  const visit = (id: string, path: string) => {
    const previous = seen.get(id)
    if (previous) {
      issues.push(issue('WORLD_ID_DUPLICATE', path, `Id "${id}" already exists at ${previous}.`))
      return
    }
    seen.set(id, path)
  }

  for (const [id] of Object.entries(world.rooms ?? {})) visit(id, `rooms.${id}`)
  for (const [id] of Object.entries(world.objects ?? {})) visit(id, `objects.${id}`)
  for (const [id] of Object.entries(world.npcs ?? {})) visit(id, `npcs.${id}`)
  for (const [id] of Object.entries(world.quests ?? {})) visit(id, `quests.${id}`)
  for (const [id] of Object.entries(world.alarms ?? {})) visit(id, `alarms.${id}`)
}

function validateRoom(roomId: string, room: WorldRoomState, world: WorldState, issues: WorldValidationIssue[]): void {
  if (!room.name?.trim()) {
    issues.push(issue('ROOM_NAME_MISSING', `rooms.${roomId}.name`, 'Room name is required.'))
  }
  for (const exitId of room.exits ?? []) {
    if (!world.rooms[exitId]) {
      issues.push(issue('ROOM_EXIT_UNKNOWN', `rooms.${roomId}.exits`, `Exit "${exitId}" does not exist.`))
    }
    if (exitId === roomId) {
      issues.push(issue('ROOM_EXIT_SELF', `rooms.${roomId}.exits`, 'Room cannot exit to itself.'))
    }
  }
}

function validateDc(
  dc: WorldObjectState['dc'],
  path: string,
  issues: WorldValidationIssue[]
): void {
  for (const [name, value] of Object.entries(dc ?? {})) {
    if (!Number.isInteger(value) || value < 1 || value > 40) {
      issues.push(issue('OBJECT_DC_INVALID', `${path}.dc.${name}`, 'Object DC must be an integer between 1 and 40.'))
    }
  }
}

function validateObject(objectId: string, object: WorldObjectState, world: WorldState, issues: WorldValidationIssue[]): void {
  const path = `objects.${objectId}`
  if (!world.rooms[object.roomId]) {
    issues.push(issue('OBJECT_ROOM_UNKNOWN', `${path}.roomId`, `Room "${object.roomId}" does not exist.`))
  }
  if (!object.name?.trim()) {
    issues.push(issue('OBJECT_NAME_MISSING', `${path}.name`, 'Object name is required.'))
  }
  validateDc(object.dc, path, issues)

  for (const childId of object.contains ?? []) {
    const child = world.objects[childId]
    if (!child) {
      issues.push(issue('OBJECT_CONTAINS_UNKNOWN', `${path}.contains`, `Contained object "${childId}" does not exist.`))
      continue
    }
    if (childId === objectId) {
      issues.push(issue('OBJECT_CONTAINS_SELF', `${path}.contains`, 'Object cannot contain itself.'))
    }
    if (child.roomId !== object.roomId) {
      issues.push(issue('OBJECT_CONTAINS_ROOM_MISMATCH', `${path}.contains`, `Contained object "${childId}" is in room "${child.roomId}".`))
    }
  }

  if (object.portal) {
    if (!Array.isArray(object.portal.roomIds) || object.portal.roomIds.length < 2) {
      issues.push(issue('OBJECT_PORTAL_ROOMS_INVALID', `${path}.portal.roomIds`, 'Portal objects must connect at least two rooms.'))
    } else {
      const uniqueRoomIds = new Set(object.portal.roomIds)
      if (uniqueRoomIds.size !== object.portal.roomIds.length) {
        issues.push(issue('OBJECT_PORTAL_ROOM_DUPLICATE', `${path}.portal.roomIds`, 'Portal roomIds must be unique.'))
      }
      if (!uniqueRoomIds.has(object.roomId)) {
        issues.push(issue('OBJECT_PORTAL_HOST_ROOM_MISSING', `${path}.portal.roomIds`, `Portal roomIds must include host room "${object.roomId}".`))
      }
      for (const portalRoomId of object.portal.roomIds) {
        if (!world.rooms[portalRoomId]) {
          issues.push(issue('OBJECT_PORTAL_ROOM_UNKNOWN', `${path}.portal.roomIds`, `Portal room "${portalRoomId}" does not exist.`))
        }
      }
    }
  }

  if ((object.tags?.includes('readable') || object.readableText) && !object.readableText?.trim()) {
    issues.push(issue('OBJECT_READABLE_TEXT_MISSING', `${path}.readableText`, 'Readable objects must define readableText.'))
  }
  if (object.kind === 'trap' && object.disarmed === undefined) {
    issues.push(issue('TRAP_DISARM_STATE_MISSING', `${path}.disarmed`, 'Trap objects must expose disarmed state.'))
  }
  if (object.tags?.includes('recipe_half') && !['clue', 'item'].includes(object.kind)) {
    issues.push(issue('RECIPE_FRAGMENT_KIND_INVALID', `${path}.kind`, 'Recipe fragments must be clue or item objects.'))
  }
}

function validateNpc(npcId: string, npc: WorldNpcState, world: WorldState, issues: WorldValidationIssue[]): void {
  if (!world.rooms[npc.roomId]) {
    issues.push(issue('NPC_ROOM_UNKNOWN', `npcs.${npcId}.roomId`, `Room "${npc.roomId}" does not exist.`))
  }
  if (!npc.name?.trim()) {
    issues.push(issue('NPC_NAME_MISSING', `npcs.${npcId}.name`, 'NPC name is required.'))
  }
  if (npc.faction !== undefined && !npc.faction.trim()) {
    issues.push(issue('NPC_FACTION_EMPTY', `npcs.${npcId}.faction`, 'NPC faction cannot be empty when provided.'))
  }
  for (const [index, goal] of (npc.goals ?? []).entries()) {
    if (!goal.trim()) {
      issues.push(issue('NPC_GOAL_EMPTY', `npcs.${npcId}.goals.${index}`, 'NPC goals cannot be empty.'))
    }
  }
}

function validateQuest(questId: string, quest: WorldQuestState, world: WorldState, issues: WorldValidationIssue[]): void {
  const path = `quests.${questId}`
  if (!quest.name?.trim()) {
    issues.push(issue('QUEST_NAME_MISSING', `${path}.name`, 'Quest name is required.'))
  }
  if (!Number.isInteger(quest.progress) || quest.progress < 0) {
    issues.push(issue('QUEST_PROGRESS_INVALID', `${path}.progress`, 'Quest progress must be a non-negative integer.'))
  }
  if (!Number.isInteger(quest.goal) || quest.goal < 1) {
    issues.push(issue('QUEST_GOAL_INVALID', `${path}.goal`, 'Quest goal must be a positive integer.'))
  }
  if (quest.progress > quest.goal) {
    issues.push(issue('QUEST_PROGRESS_OVER_GOAL', `${path}.progress`, 'Quest progress cannot exceed goal.'))
  }
  for (const [flagId, value] of Object.entries(quest.flags ?? {})) {
    if (typeof value !== 'boolean') {
      issues.push(issue('QUEST_FLAG_INVALID', `${path}.flags.${flagId}`, 'Quest flags must be booleans.'))
    }
  }

  if (questId === 'grammy_recipe') {
    const fragments = Object.values(world.objects).filter(object => object.tags?.includes('recipe_half'))
    if (fragments.length < quest.goal) {
      issues.push(issue('QUEST_RECIPE_FRAGMENT_COUNT_LOW', path, `Quest goal is ${quest.goal}, but only ${fragments.length} recipe fragments exist.`))
    }
  }
}

function validateAlarm(alarmId: string, alarm: WorldAlarmState, issues: WorldValidationIssue[]): void {
  if (!Number.isInteger(alarm.level) || alarm.level < 0) {
    issues.push(issue('ALARM_LEVEL_INVALID', `alarms.${alarmId}.level`, 'Alarm level must be a non-negative integer.'))
  }
  if (typeof alarm.raised !== 'boolean') {
    issues.push(issue('ALARM_RAISED_INVALID', `alarms.${alarmId}.raised`, 'Alarm raised must be boolean.'))
  }
  if (!alarm.raised && alarm.level > 0) {
    issues.push(issue('ALARM_LEVEL_WITHOUT_RAISED', `alarms.${alarmId}`, 'Alarm with positive level must be raised.'))
  }
  if (alarm.clock) {
    if (!alarm.clock.id?.trim()) {
      issues.push(issue('ALARM_CLOCK_ID_MISSING', `alarms.${alarmId}.clock.id`, 'Alarm clock id is required.'))
    }
    if (!alarm.clock.name?.trim()) {
      issues.push(issue('ALARM_CLOCK_NAME_MISSING', `alarms.${alarmId}.clock.name`, 'Alarm clock name is required.'))
    }
    if (!Number.isInteger(alarm.clock.value) || alarm.clock.value < 0) {
      issues.push(issue('ALARM_CLOCK_VALUE_INVALID', `alarms.${alarmId}.clock.value`, 'Alarm clock value must be a non-negative integer.'))
    }
    if (alarm.clock.value < alarm.level) {
      issues.push(issue('ALARM_CLOCK_BELOW_LEVEL', `alarms.${alarmId}.clock.value`, 'Alarm clock value cannot be lower than alarm level.'))
    }
    for (const [thresholdId, threshold] of Object.entries(alarm.clock.thresholds ?? {})) {
      if (!thresholdId.trim() || !Number.isInteger(threshold) || threshold < 0) {
        issues.push(issue('ALARM_CLOCK_THRESHOLD_INVALID', `alarms.${alarmId}.clock.thresholds.${thresholdId}`, 'Alarm clock thresholds must be non-negative integers.'))
      }
    }
  }
}

function validateEventTarget(event: EngineEvent, index: number, world: WorldState, issues: WorldValidationIssue[]): void {
  const path = `eventLog.${index}`
  if (!event.id?.trim()) {
    issues.push(issue('EVENT_ID_MISSING', `${path}.id`, 'Engine event id is required.'))
  }
  if (!event.summary?.trim()) {
    issues.push(issue('EVENT_SUMMARY_MISSING', `${path}.summary`, 'Engine event summary is required.'))
  }
  if (!event.targetId) return
  if (OBJECT_TARGET_EVENTS.has(event.type) && !world.objects[event.targetId]) {
    issues.push(issue('EVENT_TARGET_OBJECT_UNKNOWN', `${path}.targetId`, `Object target "${event.targetId}" does not exist.`))
  }
  if (NPC_TARGET_EVENTS.has(event.type) && !world.npcs[event.targetId]) {
    issues.push(issue('EVENT_TARGET_NPC_UNKNOWN', `${path}.targetId`, `NPC target "${event.targetId}" does not exist.`))
  }
  if (QUEST_TARGET_EVENTS.has(event.type) && !world.quests[event.targetId]) {
    issues.push(issue('EVENT_TARGET_QUEST_UNKNOWN', `${path}.targetId`, `Quest target "${event.targetId}" does not exist.`))
  }
  if (ALARM_TARGET_EVENTS.has(event.type) && !world.alarms[event.targetId]) {
    issues.push(issue('EVENT_TARGET_ALARM_UNKNOWN', `${path}.targetId`, `Alarm target "${event.targetId}" does not exist.`))
  }
}

export function validateWorldState(world: WorldState): WorldValidationResult {
  const issues: WorldValidationIssue[] = []

  validateKeyedEntity(issues, 'rooms', world.rooms)
  validateKeyedEntity(issues, 'objects', world.objects)
  validateKeyedEntity(issues, 'npcs', world.npcs)
  validateKeyedEntity(issues, 'quests', world.quests)
  validateUniqueIds(world, issues)

  for (const [roomId, room] of Object.entries(world.rooms ?? {})) validateRoom(roomId, room, world, issues)
  for (const [objectId, object] of Object.entries(world.objects ?? {})) validateObject(objectId, object, world, issues)
  for (const [npcId, npc] of Object.entries(world.npcs ?? {})) validateNpc(npcId, npc, world, issues)
  for (const [questId, quest] of Object.entries(world.quests ?? {})) validateQuest(questId, quest, world, issues)
  for (const [alarmId, alarm] of Object.entries(world.alarms ?? {})) validateAlarm(alarmId, alarm, issues)
  for (const [flagId, value] of Object.entries(world.flags ?? {})) {
    if (typeof value !== 'boolean') {
      issues.push(issue('WORLD_FLAG_INVALID', `flags.${flagId}`, 'World flags must be booleans.'))
    }
  }
  for (const [index, event] of (world.eventLog ?? []).entries()) validateEventTarget(event, index, world, issues)

  return {
    ok: issues.length === 0,
    issues,
  }
}

export function assertWorldStateValid(world: WorldState, label = 'WorldState'): void {
  const result = validateWorldState(world)
  if (result.ok) return
  const details = result.issues
    .map(problem => `${problem.code} at ${problem.path}: ${problem.message}`)
    .join('\n')
  throw new Error(`${label} validation failed:\n${details}`)
}
