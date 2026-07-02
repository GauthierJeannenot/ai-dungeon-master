import { dbQuery } from './db'
import { logEvent, summarizeGameState } from './server-logger'
import type { GameState, TurnTrace, ConversationTurn } from './types'
import { SESSION_SCHEMA_VERSION, type StoredGameSession } from './session-store'

// Backend Postgres des sessions de jeu (table game_sessions). L'état, l'historique
// et les traces sont stockés en JSONB — mêmes données que les fichiers
// .data/sessions/*.json, mais partagées entre instances.

interface GameSessionRow {
  session_id: string
  schema_version: number
  owner_id: string | null
  adventure_id: string | null
  game_state: GameState
  history: ConversationTurn[]
  summary_context: string | null
  turn_traces: TurnTrace[] | null
  updated_at: Date
}

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
}

export async function loadSession(sessionId: string): Promise<StoredGameSession | null> {
  const safeId = safeSessionId(sessionId)
  const result = await dbQuery<GameSessionRow>(
    'SELECT * FROM game_sessions WHERE session_id = $1',
    [safeId]
  )
  const row = result.rows[0]
  if (!row) {
    logEvent('debug', 'session.load.miss', { sessionId: safeId, backend: 'db' })
    return null
  }

  const session: StoredGameSession = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: row.session_id,
    ownerId: row.owner_id ?? undefined,
    adventureId: row.adventure_id ?? undefined,
    gameState: row.game_state,
    history: Array.isArray(row.history) ? row.history : [],
    summaryContext: row.summary_context ?? undefined,
    turnTraces: Array.isArray(row.turn_traces) ? row.turn_traces.slice(-50) : [],
    updatedAt: new Date(row.updated_at).toISOString(),
  }
  logEvent('debug', 'session.load.hit', {
    sessionId: safeId,
    backend: 'db',
    schemaVersion: session.schemaVersion,
    updatedAt: session.updatedAt,
    historyLength: session.history.length,
    hasSummary: Boolean(session.summaryContext),
    turnTraceCount: session.turnTraces?.length ?? 0,
    gameState: summarizeGameState(session.gameState),
  })
  return session
}

export async function saveSession(
  sessionId: string,
  data: Omit<StoredGameSession, 'sessionId' | 'updatedAt' | 'schemaVersion'>
): Promise<void> {
  const safeId = safeSessionId(sessionId)
  await dbQuery(
    `INSERT INTO game_sessions
       (session_id, schema_version, owner_id, adventure_id, game_state, history, summary_context, turn_traces, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (session_id) DO UPDATE SET
       schema_version = EXCLUDED.schema_version,
       owner_id = COALESCE(EXCLUDED.owner_id, game_sessions.owner_id),
       adventure_id = COALESCE(EXCLUDED.adventure_id, game_sessions.adventure_id),
       game_state = EXCLUDED.game_state,
       history = EXCLUDED.history,
       summary_context = EXCLUDED.summary_context,
       turn_traces = EXCLUDED.turn_traces,
       updated_at = now()`,
    [
      safeId,
      SESSION_SCHEMA_VERSION,
      data.ownerId ?? null,
      data.adventureId ?? null,
      JSON.stringify(data.gameState),
      JSON.stringify(data.history ?? []),
      data.summaryContext ?? null,
      data.turnTraces ? JSON.stringify(data.turnTraces.slice(-50)) : null,
    ]
  )
  logEvent('debug', 'session.save.ok', {
    sessionId: safeId,
    backend: 'db',
    schemaVersion: SESSION_SCHEMA_VERSION,
    historyLength: data.history.length,
    hasSummary: Boolean(data.summaryContext),
    turnTraceCount: data.turnTraces?.length ?? 0,
    gameState: summarizeGameState(data.gameState),
  })
}

export async function deleteSession(sessionId: string): Promise<void> {
  const safeId = safeSessionId(sessionId)
  const result = await dbQuery(
    'DELETE FROM game_sessions WHERE session_id = $1',
    [safeId]
  )
  if ((result.rowCount ?? 0) > 0) {
    logEvent('info', 'session.delete.ok', { sessionId: safeId, backend: 'db' })
  } else {
    logEvent('debug', 'session.delete.miss', { sessionId: safeId, backend: 'db' })
  }
}
