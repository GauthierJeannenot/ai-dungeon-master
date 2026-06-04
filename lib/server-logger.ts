import fs from 'fs'
import path from 'path'
import type { GameState } from './types'

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
  clientRequestId?: string
  sessionId?: string
  limit?: number
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const DEFAULT_LOG_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug'
const LOG_LEVEL = parseLogLevel(process.env.APP_LOG_LEVEL) ?? DEFAULT_LOG_LEVEL
const STRING_LIMIT = parsePositiveInt(process.env.APP_LOG_STRING_LIMIT, 800)
const ARRAY_LIMIT = parsePositiveInt(process.env.APP_LOG_ARRAY_LIMIT, 30)
const OBJECT_KEY_LIMIT = parsePositiveInt(process.env.APP_LOG_OBJECT_KEY_LIMIT, 80)
const INCLUDE_TEXT = process.env.APP_LOG_INCLUDE_TEXT !== 'false'
const BUFFER_ENABLED = process.env.APP_LOG_BUFFER_ENABLED !== 'false'
const BUFFER_LIMIT = parseBoundedInt(process.env.APP_LOG_BUFFER_LIMIT, 1000, 0, 5000)
const PERSIST_ENABLED = process.env.APP_LOG_PERSIST_ENABLED !== 'false'
const PERSIST_MAX_BYTES = parseBoundedInt(process.env.APP_LOG_PERSIST_MAX_BYTES, 20_000_000, 100_000, 100_000_000)

const SECRET_KEY_PATTERN = /api[_-]?key|authorization|bearer|cookie|password|secret|access[_-]?token|refresh[_-]?token|id[_-]?token/i
const TEXT_KEY_PATTERN = /content|message|narrative|prompt|summary|text/i

function defaultPersistDir(): string {
  if (process.env.RAILWAY_ENVIRONMENT_NAME) {
    return path.join('/data', 'ai-dungeon-master', 'logs')
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), '.data', 'logs')
}

const PERSIST_DIR = process.env.APP_LOG_PERSIST_DIR || defaultPersistDir()
const PERSIST_FILE = path.join(/* turbopackIgnore: true */ PERSIST_DIR, process.env.APP_LOG_PERSIST_FILE || 'server.jsonl')
const PERSIST_ROTATED_FILE = `${PERSIST_FILE}.1`

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
let persistWarningLogged = false
let nextLogSequence: number | null = null

function takeNextLogSequence(): number {
  if (nextLogSequence === null) {
    nextLogSequence = readHighestPersistedSequence() + 1
  }

  return nextLogSequence++
}

function warnPersistFailure(action: string, err: unknown): void {
  if (persistWarningLogged) return
  persistWarningLogged = true

  const payload = {
    timestamp: new Date().toISOString(),
    level: 'warn',
    event: 'log_persist.failure',
    service: 'ai-dungeon-master',
    action,
    persistFile: PERSIST_FILE,
    err: sanitizeValue(err),
  }
  console.warn(`[ai-dm:log_persist.failure] ${JSON.stringify(payload)}`)
}

function ensurePersistDir(): void {
  fs.mkdirSync(/* turbopackIgnore: true */ PERSIST_DIR, { recursive: true })
}

function readPersistedFiles(): string[] {
  if (!PERSIST_ENABLED) return []

  const files = [PERSIST_ROTATED_FILE, PERSIST_FILE]
  return files.filter(file => {
    try {
      return fs.existsSync(/* turbopackIgnore: true */ file)
    } catch {
      return false
    }
  })
}

function parsePersistedLogLine(line: string): BufferedLogEntry | null {
  try {
    const parsed = JSON.parse(line) as Partial<BufferedLogEntry>
    if (
      typeof parsed.sequence !== 'number' ||
      typeof parsed.timestamp !== 'string' ||
      typeof parsed.level !== 'string' ||
      !(parsed.level in LEVEL_ORDER) ||
      typeof parsed.event !== 'string' ||
      typeof parsed.line !== 'string' ||
      !parsed.payload ||
      typeof parsed.payload !== 'object'
    ) {
      return null
    }

    return parsed as BufferedLogEntry
  } catch {
    return null
  }
}

function readPersistedLogEntries(): BufferedLogEntry[] {
  if (!PERSIST_ENABLED) return []

  try {
    return readPersistedFiles().flatMap(file => {
      const raw = fs.readFileSync(/* turbopackIgnore: true */ file, 'utf-8')
      return raw
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(parsePersistedLogLine)
        .filter((entry): entry is BufferedLogEntry => Boolean(entry))
    })
  } catch (err) {
    warnPersistFailure('read', err)
    return []
  }
}

function readHighestPersistedSequence(): number {
  if (!PERSIST_ENABLED) return 0

  try {
    return readPersistedLogEntries().reduce(
      (highest, entry) => Math.max(highest, entry.sequence),
      0
    )
  } catch {
    return 0
  }
}

function rotatePersistedLogIfNeeded(nextLineBytes: number): void {
  try {
    if (!fs.existsSync(/* turbopackIgnore: true */ PERSIST_FILE)) return
    const stat = fs.statSync(/* turbopackIgnore: true */ PERSIST_FILE)
    if (stat.size + nextLineBytes <= PERSIST_MAX_BYTES) return

    if (fs.existsSync(/* turbopackIgnore: true */ PERSIST_ROTATED_FILE)) {
      fs.rmSync(/* turbopackIgnore: true */ PERSIST_ROTATED_FILE, { force: true })
    }
    fs.renameSync(/* turbopackIgnore: true */ PERSIST_FILE, PERSIST_ROTATED_FILE)
  } catch (err) {
    warnPersistFailure('rotate', err)
  }
}

function appendPersistedLog(entry: BufferedLogEntry): void {
  if (!PERSIST_ENABLED) return

  try {
    ensurePersistDir()
    const line = `${JSON.stringify(entry)}\n`
    rotatePersistedLogIfNeeded(Buffer.byteLength(line, 'utf-8'))
    fs.appendFileSync(/* turbopackIgnore: true */ PERSIST_FILE, line, 'utf-8')
  } catch (err) {
    warnPersistFailure('append', err)
  }
}

function appendBufferedLog(entry: BufferedLogEntry): void {
  if (!BUFFER_ENABLED || BUFFER_LIMIT <= 0) return

  logBuffer.push(entry)

  if (logBuffer.length > BUFFER_LIMIT) {
    logBuffer.splice(0, logBuffer.length - BUFFER_LIMIT)
  }
}

function queryLogEntries(entriesToQuery: BufferedLogEntry[], query: BufferedLogQuery = {}): BufferedLogEntry[] {
  const eventFilter = query.event?.toLowerCase()
  const requestIdFilter = query.requestId?.toLowerCase()
  const clientRequestIdFilter = query.clientRequestId?.toLowerCase()
  const sessionIdFilter = query.sessionId?.toLowerCase()
  const sinceTime = query.since?.getTime()

  return entriesToQuery.filter(entry => {
    if (query.after !== undefined && entry.sequence <= query.after) return false
    if (query.level && entry.level !== query.level) return false
    if (eventFilter && !entry.event.toLowerCase().includes(eventFilter)) return false
    if (requestIdFilter && String(entry.payload.requestId ?? '').toLowerCase() !== requestIdFilter) {
      return false
    }
    if (clientRequestIdFilter && String(entry.payload.clientRequestId ?? '').toLowerCase() !== clientRequestIdFilter) {
      return false
    }
    if (sessionIdFilter && String(entry.payload.sessionId ?? '').toLowerCase() !== sessionIdFilter) {
      return false
    }
    if (sinceTime !== undefined && Date.parse(entry.timestamp) < sinceTime) return false
    return true
  })
}

function mergeLogEntries(persistedEntries: BufferedLogEntry[], bufferedEntries: BufferedLogEntry[]): BufferedLogEntry[] {
  const bySequence = new Map<number, BufferedLogEntry>()
  for (const entry of persistedEntries) bySequence.set(entry.sequence, entry)
  for (const entry of bufferedEntries) bySequence.set(entry.sequence, entry)

  return [...bySequence.values()].sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence
    return Date.parse(a.timestamp) - Date.parse(b.timestamp)
  })
}

export function getLogEvents(query: BufferedLogQuery = {}): {
  entries: BufferedLogEntry[]
  totalBuffered: number
  totalPersisted: number
  bufferLimit: number
  nextAfter: number | null
  persistent: boolean
  persistFile: string | null
  source: 'persistent' | 'buffer' | 'combined'
} {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500)
  const persistedEntries = readPersistedLogEntries()
  const sourceEntries = mergeLogEntries(persistedEntries, logBuffer)
  const source = persistedEntries.length > 0 && logBuffer.length > 0
    ? 'combined'
    : persistedEntries.length > 0
      ? 'persistent'
      : 'buffer'
  const entries = queryLogEntries(sourceEntries, query)

  const limitedEntries = entries.slice(-limit)
  const lastEntry = limitedEntries.at(-1)

  return {
    entries: limitedEntries,
    totalBuffered: logBuffer.length,
    totalPersisted: persistedEntries.length,
    bufferLimit: BUFFER_LIMIT,
    nextAfter: lastEntry?.sequence ?? null,
    persistent: PERSIST_ENABLED,
    persistFile: PERSIST_ENABLED ? PERSIST_FILE : null,
    source,
  }
}

export function getBufferedLogEvents(query: BufferedLogQuery = {}): {
  entries: BufferedLogEntry[]
  totalBuffered: number
  bufferLimit: number
  nextAfter: number | null
} {
  const result = getLogEvents(query)
  return {
    entries: result.entries,
    totalBuffered: result.totalBuffered,
    bufferLimit: result.bufferLimit,
    nextAfter: result.nextAfter,
  }
}

export function clearBufferedLogEvents(): number {
  const cleared = logBuffer.length
  logBuffer.length = 0
  return cleared
}

export function clearLogEvents(): {
  cleared: number
  clearedBuffered: number
  clearedPersisted: number
} {
  const clearedPersisted = readPersistedLogEntries().length
  const clearedBuffered = clearBufferedLogEvents()

  if (PERSIST_ENABLED) {
    try {
      for (const file of readPersistedFiles()) {
        fs.rmSync(/* turbopackIgnore: true */ file, { force: true })
      }
    } catch (err) {
      warnPersistFailure('clear', err)
    }
  }

  return {
    cleared: clearedBuffered + clearedPersisted,
    clearedBuffered,
    clearedPersisted,
  }
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
      deathSaves: gameState.player.deathSaves,
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
  const entry: BufferedLogEntry = {
    sequence: takeNextLogSequence(),
    timestamp: sanitizedPayload.timestamp as string,
    level,
    event,
    line,
    payload: sanitizedPayload,
  }

  appendBufferedLog(entry)
  appendPersistedLog(entry)

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}
