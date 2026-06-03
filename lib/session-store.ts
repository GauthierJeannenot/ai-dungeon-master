import fs from 'fs/promises'
import path from 'path'
import { ConversationTurn, GameState } from './types'

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

export async function loadSession(sessionId: string | undefined): Promise<StoredGameSession | null> {
  if (!sessionId?.trim()) return null

  try {
    const raw = await fs.readFile(sessionPath(sessionId), 'utf-8')
    return JSON.parse(raw) as StoredGameSession
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return null
    }
    console.error(`[session-store] Failed to load session ${sessionId}:`, err)
    return null
  }
}

export async function saveSession(
  sessionId: string | undefined,
  data: Omit<StoredGameSession, 'sessionId' | 'updatedAt'>
): Promise<void> {
  if (!sessionId?.trim()) return

  const dir = getSessionDir()
  await fs.mkdir(dir, { recursive: true })

  const payload: StoredGameSession = {
    ...data,
    sessionId,
    updatedAt: new Date().toISOString(),
  }

  await fs.writeFile(sessionPath(sessionId), JSON.stringify(payload, null, 2), 'utf-8')
}

export async function deleteSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId?.trim()) return

  try {
    await fs.unlink(sessionPath(sessionId))
  } catch (err) {
    if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
      throw err
    }
  }
}
