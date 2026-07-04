import { dbQuery } from './db'
import { ConversationTurn, GameState, TurnTrace } from './types'
import { logEvent, summarizeGameState } from './server-logger'

// Store des sessions de jeu — Postgres unique (table game_sessions). L'état,
// l'historique et les traces sont stockés en JSONB, partagés entre instances.
// Sans DATABASE_URL, dbQuery lève (config-check refuse déjà de démarrer en prod).

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

// Résumé léger d'une partie pour l'écran « Mes parties » (sans l'état complet).
export interface StoredSessionSummary {
  sessionId: string
  adventureId?: string
  updatedAt: string
  phase: string
  playerHp: { current: number; max: number }
  currentRoomId: string | null
  // Nombre de messages joueur (≈ nombre de tours joués).
  turnCount: number
}

export function summarizeStoredSession(
  sessionId: string,
  adventureId: string | undefined,
  updatedAt: string,
  gameState: GameState,
  history: ConversationTurn[]
): StoredSessionSummary {
  return {
    sessionId,
    adventureId: adventureId ?? gameState?.adventureId,
    updatedAt,
    phase: gameState?.phase ?? 'exploration',
    playerHp: gameState?.player?.hp ?? { current: 0, max: 0 },
    currentRoomId: gameState?.currentRoomId ?? null,
    turnCount: history.filter(turn => turn.role === 'player').length,
  }
}

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
}

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

export async function loadSession(sessionId: string | undefined): Promise<StoredGameSession | null> {
  if (!sessionId?.trim()) {
    logEvent('debug', 'session.load.skipped', { reason: 'missing-session-id' })
    return null
  }

  const safeId = safeSessionId(sessionId)
  const result = await dbQuery<GameSessionRow>(
    'SELECT * FROM game_sessions WHERE session_id = $1',
    [safeId]
  )
  const row = result.rows[0]
  if (!row) {
    logEvent('debug', 'session.load.miss', { sessionId: safeId })
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
  sessionId: string | undefined,
  data: Omit<StoredGameSession, 'sessionId' | 'updatedAt' | 'schemaVersion'>
): Promise<void> {
  if (!sessionId?.trim()) {
    logEvent('debug', 'session.save.skipped', { reason: 'missing-session-id' })
    return
  }

  const safeId = safeSessionId(sessionId)
  // owner_id/adventure_id : COALESCE pour ne jamais écraser une valeur existante
  // par un null (une sauvegarde sans owner ne doit pas orpheliner la partie).
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
    schemaVersion: SESSION_SCHEMA_VERSION,
    historyLength: data.history.length,
    hasSummary: Boolean(data.summaryContext),
    turnTraceCount: data.turnTraces?.length ?? 0,
    gameState: summarizeGameState(data.gameState),
  })
}

// Résumés des parties d'un propriétaire ("user:<id>" / "guest:<id>"), les plus
// récentes d'abord. Alimente l'écran « Mes parties » (reprise multi-appareils).
// On remonte game_state + history (bornés à 200 tours) et on résume en JS — SQL
// portable (pas de fonctions JSONB, compatible pg-mem).
export async function listSessionsByOwner(
  ownerId: string,
  limit = 50
): Promise<StoredSessionSummary[]> {
  const result = await dbQuery<{
    session_id: string
    adventure_id: string | null
    updated_at: Date
    game_state: GameState
    history: ConversationTurn[]
  }>(
    `SELECT session_id, adventure_id, updated_at, game_state, history
     FROM game_sessions
     WHERE owner_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [ownerId, limit]
  )
  return result.rows.map(row =>
    summarizeStoredSession(
      row.session_id,
      row.adventure_id ?? undefined,
      new Date(row.updated_at).toISOString(),
      row.game_state,
      Array.isArray(row.history) ? row.history : []
    )
  )
}

export async function deleteSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId?.trim()) {
    logEvent('debug', 'session.delete.skipped', { reason: 'missing-session-id' })
    return
  }

  const safeId = safeSessionId(sessionId)
  const result = await dbQuery('DELETE FROM game_sessions WHERE session_id = $1', [safeId])
  if ((result.rowCount ?? 0) > 0) {
    logEvent('info', 'session.delete.ok', { sessionId: safeId })
  } else {
    logEvent('debug', 'session.delete.miss', { sessionId: safeId })
  }
}
