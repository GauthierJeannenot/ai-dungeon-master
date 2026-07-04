import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'
import { logEvent } from './server-logger'

// ─────────────────────────────────────────────────────────────────────────────
// Accès Postgres central — backend UNIQUE de persistance (auth NextAuth,
// sessions de jeu, crédits, disjoncteur journalier). DATABASE_URL est requise :
// getPool() lève sans elle (config-check refuse de démarrer en prod).
//
// Le schéma est appliqué paresseusement (CREATE TABLE IF NOT EXISTS, idempotent)
// au premier accès, et explicitement via `npm run db:migrate`. Les tests et le
// playtest injectent un pool pg-mem via __setDbPoolForTests (voir
// tests/helpers/pg-mem.cjs) — aucun Postgres réel requis.
// ─────────────────────────────────────────────────────────────────────────────

// Tables NextAuth (@auth/pg-adapter — schéma officiel Auth.js) + tables métier.
export const DB_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL,
  name VARCHAR(255),
  email VARCHAR(255),
  "emailVerified" TIMESTAMPTZ,
  image TEXT,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL,
  "userId" INTEGER NOT NULL,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS accounts_provider_account_idx
  ON accounts (provider, "providerAccountId");

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL,
  "userId" INTEGER NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_idx ON sessions ("sessionToken");

-- Sessions de jeu (état, historique, traces en JSONB). owner_id lie la partie à
-- son propriétaire ("user:<id>" ou "guest:<id>") — NULL pour les sessions
-- créées avant cette colonne ou hors monétisation.
CREATE TABLE IF NOT EXISTS game_sessions (
  session_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1,
  owner_id TEXT,
  adventure_id TEXT,
  game_state JSONB NOT NULL,
  history JSONB NOT NULL DEFAULT '[]',
  summary_context TEXT,
  turn_traces JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Disjoncteur de dépense : messages DM toutes IP confondues, par jour UTC.
CREATE TABLE IF NOT EXISTS daily_usage (
  day TEXT PRIMARY KEY,
  messages INTEGER NOT NULL DEFAULT 0
);

-- Portefeuille de tokens. user_id est TEXT (users.id sérialisé) sans FK :
-- le quota invité y stocke aussi des clés "guest:<id>" côté owner ailleurs.
CREATE TABLE IF NOT EXISTS user_credits (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_purchased INTEGER NOT NULL DEFAULT 0,
  total_consumed INTEGER NOT NULL DEFAULT 0,
  signup_bonus_granted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotence des webhooks Stripe (un événement crédité une seule fois).
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quota invité (messages d'essai gratuits par cookie invité).
CREATE TABLE IF NOT EXISTS guest_usage (
  guest_id TEXT PRIMARY KEY,
  messages_used INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Accès aux modules payants (achat unique par compte, définitif). Distinct du
-- portefeuille de tokens : déverrouille l'ACCÈS à un module, les messages
-- continuent de consommer des tokens. user_id est TEXT (users.id sérialisé),
-- sans FK, cohérent avec user_credits. L'idempotence des webhooks Stripe reste
-- portée par la table stripe_events.
CREATE TABLE IF NOT EXISTS module_entitlements (
  user_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  source TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, module_id)
);
`

let pool: Pool | null = null
let schemaReady: Promise<void> | null = null

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// DATABASE_SSL=require pour les Postgres managés exposés en TLS avec certificat
// non vérifiable. Railway interne : laisser vide.
function sslConfig(): { rejectUnauthorized: boolean } | undefined {
  const mode = (process.env.DATABASE_SSL ?? '').toLowerCase()
  if (mode === 'require' || mode === 'true' || mode === '1') {
    return { rejectUnauthorized: false }
  }
  return undefined
}

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL?.trim()
    if (!connectionString) {
      throw new Error('DATABASE_URL manquante — le backend Postgres est désactivé.')
    }
    pool = new Pool({
      connectionString,
      max: parsePositiveInt(process.env.DATABASE_POOL_MAX, 10),
      ssl: sslConfig(),
    })
    pool.on('error', err => {
      logEvent('error', 'db.pool.error', { err: err.message })
    })
  }
  return pool
}

// Hook de test : injecte un pool factice (pg-mem) sans DATABASE_URL réelle.
export function __setDbPoolForTests(testPool: Pool): void {
  pool = testPool
  schemaReady = null
}

// Migrations additives pour les bases créées avant ces colonnes (CREATE TABLE
// IF NOT EXISTS ne modifie pas une table existante). Tolérées en échec : sur
// une base fraîche la colonne existe déjà via le CREATE.
const ADDITIVE_MIGRATIONS_SQL = [
  'ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS owner_id TEXT',
  'ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS adventure_id TEXT',
]

async function applyAdditiveMigrations(): Promise<void> {
  for (const sql of ADDITIVE_MIGRATIONS_SQL) {
    try {
      await getPool().query(sql)
    } catch (err) {
      logEvent('warn', 'db.schema.additive_migration_failed', {
        sql,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(DB_SCHEMA_SQL)
      .then(applyAdditiveMigrations)
      .then(() => {
        logEvent('info', 'db.schema.ready', {})
      })
      .catch(err => {
        // Échec → on relâche le verrou pour permettre un retry au prochain appel.
        schemaReady = null
        logEvent('error', 'db.schema.error', { err: err instanceof Error ? err.message : String(err) })
        throw err
      })
  }
  return schemaReady
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  await ensureSchema()
  return getPool().query<T>(text, params as never[])
}

// Transaction avec rollback automatique.
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema()
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

// Client minimal { query } pour l'adapter NextAuth : garantit que le schéma
// existe avant la première requête d'auth.
export function getAuthDbClient(): Pool {
  const facade = {
    query: async (text: string, params?: unknown[]) => dbQuery(text, params),
  }
  return facade as unknown as Pool
}
