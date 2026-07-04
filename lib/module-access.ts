import { dbQuery, withTransaction } from './db'
import { logEvent } from './server-logger'

// ─────────────────────────────────────────────────────────────────────────────
// Accès aux modules payants (utilisateurs connectés). Achat UNIQUE par compte,
// définitif : déverrouille l'accès à un module (ex. Tide Crypt à 5 €). C'est un
// axe orthogonal au portefeuille de tokens (lib/credits-store) — posséder le
// module ne dispense PAS de consommer un token par message.
//
// Backend unique Postgres : opérations SQL atomiques (INSERT ... ON CONFLICT),
// correctes en multi-instance. L'idempotence des webhooks Stripe reste portée
// par la table stripe_events (même garde que credits-store.addPurchasedCredits).
//
// Aucun import next-auth / next/headers ici → utilisable partout côté serveur
// (route DM, checkout, webhook, landing Server Component).
// ─────────────────────────────────────────────────────────────────────────────

export async function hasModuleAccess(userId: string, moduleId: string): Promise<boolean> {
  const result = await dbQuery(
    'SELECT 1 FROM module_entitlements WHERE user_id = $1 AND module_id = $2',
    [userId, moduleId]
  )
  return result.rows.length > 0
}

export async function getOwnedModules(userId: string): Promise<string[]> {
  const result = await dbQuery<{ module_id: string }>(
    'SELECT module_id FROM module_entitlements WHERE user_id = $1',
    [userId]
  )
  return result.rows.map(row => row.module_id)
}

// Accorde l'accès à un module. Idempotent par eventId (webhook Stripe rejoué) :
// même garde SELECT-puis-INSERT sur stripe_events que addPurchasedCredits (0
// token). L'INSERT ON CONFLICT DO NOTHING sur module_entitlements rend aussi
// l'octroi idempotent par (user, module) si l'accès existe déjà.
export async function grantModuleAccess(
  userId: string,
  moduleId: string,
  meta: { eventId: string; source?: string }
): Promise<void> {
  await withTransaction(async client => {
    const existing = await client.query(
      'SELECT event_id FROM stripe_events WHERE event_id = $1',
      [meta.eventId]
    )
    if (existing.rows.length > 0) {
      logEvent('info', 'module_access.grant.duplicate_event', { userId, moduleId, eventId: meta.eventId })
      return
    }
    await client.query(
      `INSERT INTO stripe_events (event_id, user_id, tokens, source)
       VALUES ($1, $2, 0, $3)`,
      [meta.eventId, userId, meta.source ?? null]
    )
    await client.query(
      `INSERT INTO module_entitlements (user_id, module_id, source)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, module_id) DO NOTHING`,
      [userId, moduleId, meta.source ?? null]
    )
    logEvent('info', 'module_access.grant.ok', { userId, moduleId, eventId: meta.eventId, source: meta.source })
  })
}
