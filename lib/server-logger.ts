import { GameState } from './types'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

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

  const line = `[ai-dm:${event}] ${JSON.stringify(sanitizeValue(payload))}`

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}
