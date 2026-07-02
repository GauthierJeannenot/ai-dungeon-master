import fs from 'fs/promises'
import path from 'path'
import { ConversationTurn, GameState, TurnTrace } from './types'
import { logEvent, summarizeGameState } from './server-logger'
import { isDatabaseEnabled } from './db'
import * as dbSessions from './session-store-db'

// Deux backends derrière la même API : Postgres (table game_sessions) quand
// DATABASE_URL est définie, sinon fichiers JSON sous .data/sessions/.

export const SESSION_SCHEMA_VERSION = 1

export interface StoredGameSession {
  schemaVersion: 1
  sessionId: string
  // "user:<id>" ou "guest:<id>" — créateur de la partie. undefined pour les
  // sessions antérieures à ce champ ou créées hors monétisation.
  ownerId?: string
  // Module d'aventure de la partie. undefined pour les sessions antérieures à
  // ce champ → traitées comme le module par défaut (Grammy's) par la route.
  adventureId?: string
  gameState: GameState
  history: ConversationTurn[]
  summaryContext?: string
  turnTraces?: TurnTrace[]
  updatedAt: string
}

const DEFAULT_SESSION_DIR = path.join(process.cwd(), '.data', 'sessions')

function getSessionDir(): string {
  return process.env.GAME_SESSION_STORE_DIR || DEFAULT_SESSION_DIR
}

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
}

function sessionPath(sessionId: string): string {
  return path.join(getSessionDir(), `${safeSessionId(sessionId)}.json`)
}

function tempSessionPath(sessionId: string): string {
  return `${sessionPath(sessionId)}.${process.pid}.${Date.now()}.tmp`
}

function normalizeStoredSession(raw: unknown, requestedSessionId: string): StoredGameSession {
  const record = raw && typeof raw === 'object' ? raw as Partial<StoredGameSession> : {}
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: safeSessionId(record.sessionId ?? requestedSessionId),
    ownerId: typeof record.ownerId === 'string' ? record.ownerId : undefined,
    adventureId: typeof record.adventureId === 'string' ? record.adventureId : undefined,
    gameState: record.gameState as GameState,
    history: Array.isArray(record.history) ? record.history : [],
    summaryContext: typeof record.summaryContext === 'string' ? record.summaryContext : undefined,
    turnTraces: Array.isArray(record.turnTraces) ? record.turnTraces.slice(-50) : [],
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
  }
}

export async function loadSession(sessionId: string | undefined): Promise<StoredGameSession | null> {
  if (!sessionId?.trim()) {
    logEvent('debug', 'session.load.skipped', { reason: 'missing-session-id' })
    return null
  }

  if (isDatabaseEnabled()) {
    return dbSessions.loadSession(sessionId)
  }

  try {
    const raw = await fs.readFile(sessionPath(sessionId), 'utf-8')
    const session = normalizeStoredSession(JSON.parse(raw), sessionId)
    logEvent('debug', 'session.load.hit', {
      sessionId: safeSessionId(sessionId),
      schemaVersion: session.schemaVersion,
      updatedAt: session.updatedAt,
      historyLength: session.history.length,
      hasSummary: Boolean(session.summaryContext),
      turnTraceCount: session.turnTraces?.length ?? 0,
      gameState: summarizeGameState(session.gameState),
    })
    return session
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      logEvent('debug', 'session.load.miss', { sessionId: safeSessionId(sessionId) })
      return null
    }
    logEvent('error', 'session.load.error', { sessionId: safeSessionId(sessionId), err })
    return null
  }
}

export async function saveSession(
  sessionId: string | undefined,
  data: Omit<StoredGameSession, 'sessionId' | 'updatedAt' | 'schemaVersion'>
): Promise<void> {
  if (!sessionId?.trim()) {
    logEvent('debug', 'session.save.skipped', { reason: 'missing-session-id' })
    return
  }

  if (isDatabaseEnabled()) {
    return dbSessions.saveSession(sessionId, data)
  }

  const dir = getSessionDir()
  await fs.mkdir(dir, { recursive: true })

  const safeId = safeSessionId(sessionId)
  const payload: StoredGameSession = {
    ...data,
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: safeId,
    turnTraces: data.turnTraces?.slice(-50),
    updatedAt: new Date().toISOString(),
  }

  const targetPath = sessionPath(sessionId)
  const tmpPath = tempSessionPath(sessionId)
  try {
    await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf-8')
    await fs.rename(tmpPath, targetPath)
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => undefined)
    throw err
  }

  logEvent('debug', 'session.save.ok', {
    sessionId: safeId,
    dir,
    schemaVersion: payload.schemaVersion,
    historyLength: payload.history.length,
    hasSummary: Boolean(payload.summaryContext),
    turnTraceCount: payload.turnTraces?.length ?? 0,
    gameState: summarizeGameState(payload.gameState),
  })
}

// Lecture brute du backend fichier (script d'import vers Postgres).
export async function listFileSessions(): Promise<StoredGameSession[]> {
  let files: string[]
  try {
    files = await fs.readdir(getSessionDir())
  } catch {
    return []
  }
  const sessions: StoredGameSession[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = await fs.readFile(path.join(getSessionDir(), file), 'utf-8')
      const session = normalizeStoredSession(JSON.parse(raw), file.replace(/\.json$/, ''))
      if (session.gameState) sessions.push(session)
    } catch (err) {
      logEvent('warn', 'session.list.parse_error', { file, err })
    }
  }
  return sessions
}

export async function deleteSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId?.trim()) {
    logEvent('debug', 'session.delete.skipped', { reason: 'missing-session-id' })
    return
  }

  if (isDatabaseEnabled()) {
    return dbSessions.deleteSession(sessionId)
  }

  try {
    await fs.unlink(sessionPath(sessionId))
    logEvent('info', 'session.delete.ok', { sessionId: safeSessionId(sessionId) })
  } catch (err) {
    if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
      logEvent('error', 'session.delete.error', { sessionId: safeSessionId(sessionId), err })
      throw err
    }
    logEvent('debug', 'session.delete.miss', { sessionId: safeSessionId(sessionId) })
  }
}
