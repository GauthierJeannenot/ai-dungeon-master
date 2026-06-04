import fs from 'fs/promises'
import path from 'path'
import { ConversationTurn, GameState } from './types'
import { logEvent, summarizeGameState } from './server-logger'

export interface StoredGameSession {
  sessionId: string
  gameState: GameState
  history: ConversationTurn[]
  summaryContext?: string
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

export async function loadSession(sessionId: string | undefined): Promise<StoredGameSession | null> {
  if (!sessionId?.trim()) {
    logEvent('debug', 'session.load.skipped', { reason: 'missing-session-id' })
    return null
  }

  try {
    const raw = await fs.readFile(sessionPath(sessionId), 'utf-8')
    const session = JSON.parse(raw) as StoredGameSession
    logEvent('debug', 'session.load.hit', {
      sessionId: safeSessionId(sessionId),
      updatedAt: session.updatedAt,
      historyLength: session.history.length,
      hasSummary: Boolean(session.summaryContext),
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
  data: Omit<StoredGameSession, 'sessionId' | 'updatedAt'>
): Promise<void> {
  if (!sessionId?.trim()) {
    logEvent('debug', 'session.save.skipped', { reason: 'missing-session-id' })
    return
  }

  const dir = getSessionDir()
  await fs.mkdir(dir, { recursive: true })

  const safeId = safeSessionId(sessionId)
  const payload: StoredGameSession = {
    ...data,
    sessionId: safeId,
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
    historyLength: payload.history.length,
    hasSummary: Boolean(payload.summaryContext),
    gameState: summarizeGameState(payload.gameState),
  })
}

export async function deleteSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId?.trim()) {
    logEvent('debug', 'session.delete.skipped', { reason: 'missing-session-id' })
    return
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
