import { GameState } from './types'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface BufferedLogEntry {
  sequence: number
  timestamp: string
  level: LogLevel
  event: string
  line: string
  payload: Record<string, unknown>
}

export interface BufferedLogQuery {
  after?: number
  since?: Date
  level?: LogLevel
  event?: string
  requestId?: string
  sessionId?: string
  limit?: number
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const DEFAULT_LOG_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'debug' : 'info'
const LOG_LEVEL = parseLogLevel(process.env.APP_LOG_LEVEL) ?? DEFAULT_LOG_LEVEL
const STRING_LIMIT = parsePositiveInt(process.env.APP_LOG_STRING_LIMIT, 800)
const ARRAY_LIMIT = parsePositiveInt(process.env.APP_LOG_ARRAY_LIMIT, 30)
const OBJECT_KEY_LIMIT = parsePositiveInt(process.env.APP_LOG_OBJECT_KEY_LIMIT, 80)
const INCLUDE_TEXT = process.env.APP_LOG_INCLUDE_TEXT !== 'false'
const BUFFER_ENABLED = process.env.APP_LOG_BUFFER_ENABLED !== 'false'
const BUFFER_LIMIT = parseBoundedInt(process.env.APP_LOG_BUFFER_LIMIT, 1000, 0, 5000)

const SECRET_KEY_PATTERN = /api[_-]?key|authorization|bearer|cookie|password|secret|access[_-]?token|refresh[_-]?token|id[_-]?token/i
const TEXT_KEY_PATTERN = /content|message|narrative|prompt|summary|text/i

function parseLogLevel(value: string | undefined): LogLevel | null {
  if (!value) return null
  const normalized = value.toLowerCase()
  return normalized in LEVEL_ORDER ? normalized as LogLevel : null
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseBoundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[LOG_LEVEL]
}

function truncateString(value: string): string {
  if (value.length <= STRING_LIMIT) return value
  return `${value.slice(0, STRING_LIMIT)}...[truncated ${value.length - STRING_LIMIT} chars]`
}

function sanitizeValue(value: unknown, key = '', depth = 0, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  if (typeof value === 'string') {
    if (SECRET_KEY_PATTERN.test(key)) return '[redacted]'
    if (!INCLUDE_TEXT && TEXT_KEY_PATTERN.test(key)) return `[redacted text:${value.length} chars]`
    return truncateString(value)
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'undefined'
  ) {
    return value
  }

  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`
  if (typeof value !== 'object') return String(value)

  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (depth >= 5) return '[max-depth]'

  if (Array.isArray(value)) {
    const items = value.slice(0, ARRAY_LIMIT).map((item, index) =>
      sanitizeValue(item, `${key}[${index}]`, depth + 1, seen)
    )
    if (value.length > ARRAY_LIMIT) {
      items.push(`[truncated ${value.length - ARRAY_LIMIT} items]`)
    }
    return items
  }

  const result: Record<string, unknown> = {}
  const entries = Object.entries(value)
  for (const [childKey, childValue] of entries.slice(0, OBJECT_KEY_LIMIT)) {
    result[childKey] = sanitizeValue(childValue, childKey, depth + 1, seen)
  }
  if (entries.length > OBJECT_KEY_LIMIT) {
    result.__truncatedKeys = entries.length - OBJECT_KEY_LIMIT
  }
  return result
}

const logBuffer: BufferedLogEntry[] = []
let nextLogSequence = 1

function appendBufferedLog(entry: Omit<BufferedLogEntry, 'sequence'>): void {
  if (!BUFFER_ENABLED || BUFFER_LIMIT <= 0) return

  logBuffer.push({
    sequence: nextLogSequence++,
    ...entry,
  })

  if (logBuffer.length > BUFFER_LIMIT) {
    logBuffer.splice(0, logBuffer.length - BUFFER_LIMIT)
  }
}

export function getBufferedLogEvents(query: BufferedLogQuery = {}): {
  entries: BufferedLogEntry[]
  totalBuffered: number
  bufferLimit: number
  nextAfter: number | null
} {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500)
  const eventFilter = query.event?.toLowerCase()
  const requestIdFilter = query.requestId?.toLowerCase()
  const sessionIdFilter = query.sessionId?.toLowerCase()
  const sinceTime = query.since?.getTime()

  const entries = logBuffer.filter(entry => {
    if (query.after !== undefined && entry.sequence <= query.after) return false
    if (query.level && entry.level !== query.level) return false
    if (eventFilter && !entry.event.toLowerCase().includes(eventFilter)) return false
    if (requestIdFilter && String(entry.payload.requestId ?? '').toLowerCase() !== requestIdFilter) {
      return false
    }
    if (sessionIdFilter && String(entry.payload.sessionId ?? '').toLowerCase() !== sessionIdFilter) {
      return false
    }
    if (sinceTime !== undefined && Date.parse(entry.timestamp) < sinceTime) return false
    return true
  })

  const limitedEntries = entries.slice(-limit)
  const lastEntry = limitedEntries.at(-1)

  return {
    entries: limitedEntries,
    totalBuffered: logBuffer.length,
    bufferLimit: BUFFER_LIMIT,
    nextAfter: lastEntry?.sequence ?? null,
  }
}

export function clearBufferedLogEvents(): number {
  const cleared = logBuffer.length
  logBuffer.length = 0
  return cleared
}

export function summarizeGameState(gameState: GameState | undefined | null): Record<string, unknown> | null {
  if (!gameState) return null

  const monsters = Object.values(gameState.monsters)
  const aliveMonsters = monsters.filter(monster => monster.isAlive)
  const deadMonsters = monsters.filter(monster => !monster.isAlive)

  return {
    phase: gameState.phase,
    round: gameState.round,
    currentTurn: gameState.currentTurn,
    player: {
      hp: gameState.player.hp,
      position: gameState.player.position,
      conditions: gameState.player.conditions,
    },
    monsters: {
      total: monsters.length,
      alive: aliveMonsters.length,
      dead: deadMonsters.length,
      aliveIds: aliveMonsters.map(monster => monster.id),
      deadIds: deadMonsters.map(monster => monster.id),
    },
    initiativeOrder: gameState.initiativeOrder,
    movementUsed: gameState.movementUsed,
    actionUsed: gameState.actionUsed,
    combatLogCount: gameState.combatLog.length,
    roomsVisitedCount: gameState.roomsVisited.length,
    currentRoomId: gameState.currentRoomId,
  }
}

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {}
): void {
  if (!shouldLog(level)) return

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: 'ai-dungeon-master',
    env: process.env.NODE_ENV,
    railway: {
      environment: process.env.RAILWAY_ENVIRONMENT_NAME,
      serviceId: process.env.RAILWAY_SERVICE_ID,
      deploymentId: process.env.RAILWAY_DEPLOYMENT_ID,
      projectId: process.env.RAILWAY_PROJECT_ID,
    },
    ...fields,
  }

  const sanitizedPayload = sanitizeValue(payload) as Record<string, unknown>
  const line = `[ai-dm:${event}] ${JSON.stringify(sanitizedPayload)}`

  appendBufferedLog({
    timestamp: sanitizedPayload.timestamp as string,
    level,
    event,
    line,
    payload: sanitizedPayload,
  })

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}
