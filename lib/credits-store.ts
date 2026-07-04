import { dbQuery, withTransaction } from './db'
import { logEvent } from './server-logger'

// ─────────────────────────────────────────────────────────────────────────────
// Portefeuille de tokens (utilisateurs connectés) + quota invité (anonymes).
//
// Backend unique Postgres : toutes les mutations sont des opérations SQL
// atomiques (UPDATE conditionnel, INSERT ... ON CONFLICT), correctes en
// multi-instance. Sans DATABASE_URL, dbQuery lève (config-check refuse déjà de
// démarrer en prod).
//
// Un « token » ici = un crédit de message envoyé au DM (pas un token LLM).
// L'idempotence Stripe vit dans la table stripe_events (pas dans UserCredits).
// ─────────────────────────────────────────────────────────────────────────────

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export const GUEST_MESSAGE_LIMIT = parsePositiveInt(process.env.GUEST_MESSAGE_LIMIT, 5)
// Solde de bienvenue offert au premier login (0 pour désactiver).
export const SIGNUP_BONUS_TOKENS = parsePositiveInt(process.env.SIGNUP_BONUS_TOKENS, 10)

export interface UserCredits {
  schemaVersion: 1
  userId: string
  email?: string
  balance: number
  totalPurchased: number
  totalConsumed: number
  signupBonusGranted: boolean
  updatedAt: string
}

export interface GuestUsage {
  schemaVersion: 1
  guestId: string
  messagesUsed: number
  updatedAt: string
}

export interface ConsumeResult {
  ok: boolean
  balance: number
}

export interface GuestConsumeResult {
  ok: boolean
  remaining: number
}

interface UserCreditsRow {
  user_id: string
  email: string | null
  balance: number
  total_purchased: number
  total_consumed: number
  signup_bonus_granted: boolean
  updated_at: Date
}

interface GuestUsageRow {
  guest_id: string
  messages_used: number
  updated_at: Date
}

function rowToUserCredits(row: UserCreditsRow | undefined, userId: string): UserCredits {
  if (!row) {
    return {
      schemaVersion: 1,
      userId,
      balance: 0,
      totalPurchased: 0,
      totalConsumed: 0,
      signupBonusGranted: false,
      updatedAt: new Date(0).toISOString(),
    }
  }
  return {
    schemaVersion: 1,
    userId: row.user_id,
    email: row.email ?? undefined,
    balance: row.balance,
    totalPurchased: row.total_purchased,
    totalConsumed: row.total_consumed,
    signupBonusGranted: row.signup_bonus_granted,
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export async function getUserCredits(userId: string): Promise<UserCredits> {
  const result = await dbQuery<UserCreditsRow>(
    'SELECT * FROM user_credits WHERE user_id = $1',
    [userId]
  )
  return rowToUserCredits(result.rows[0], userId)
}

// Crédite le bonus de bienvenue une seule fois (appelé au premier accès d'un
// utilisateur connecté). Idempotent.
export async function ensureSignupBonus(userId: string, email?: string): Promise<UserCredits> {
  return withTransaction(async client => {
    await client.query(
      `INSERT INTO user_credits (user_id, email) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, email ?? null]
    )
    const granted = await client.query(
      `UPDATE user_credits
       SET balance = balance + $2, signup_bonus_granted = TRUE, updated_at = now()
       WHERE user_id = $1 AND signup_bonus_granted = FALSE`,
      [userId, SIGNUP_BONUS_TOKENS]
    )
    if ((granted.rowCount ?? 0) > 0) {
      logEvent('info', 'credits.signup_bonus.granted', { userId, amount: SIGNUP_BONUS_TOKENS })
    }
    if (email) {
      await client.query(
        `UPDATE user_credits SET email = $2, updated_at = now()
         WHERE user_id = $1 AND (email IS NULL OR email <> $2)`,
        [userId, email]
      )
    }
    const result = await client.query<UserCreditsRow>(
      'SELECT * FROM user_credits WHERE user_id = $1',
      [userId]
    )
    return rowToUserCredits(result.rows[0], userId)
  })
}

// Crédite des tokens achetés. Idempotent par eventId (webhook Stripe rejoué).
export async function addPurchasedCredits(
  userId: string,
  amount: number,
  meta: { eventId: string; email?: string; source?: string }
): Promise<UserCredits> {
  const tokens = Math.max(0, Math.floor(amount))
  return withTransaction(async client => {
    // Idempotence : l'événement Stripe ne crédite qu'une fois même rejoué.
    // SELECT puis INSERT simple : en cas de course entre deux livraisons du
    // même événement, la PK fait échouer l'un des INSERT (transaction rollback,
    // Stripe rejouera et tombera alors sur le doublon) — jamais de double crédit.
    const existing = await client.query(
      'SELECT event_id FROM stripe_events WHERE event_id = $1',
      [meta.eventId]
    )
    if (existing.rows.length > 0) {
      logEvent('info', 'credits.purchase.duplicate_event', { userId, eventId: meta.eventId })
      const current = await client.query<UserCreditsRow>(
        'SELECT * FROM user_credits WHERE user_id = $1',
        [userId]
      )
      return rowToUserCredits(current.rows[0], userId)
    }
    await client.query(
      `INSERT INTO stripe_events (event_id, user_id, tokens, source)
       VALUES ($1, $2, $3, $4)`,
      [meta.eventId, userId, tokens, meta.source ?? null]
    )

    await client.query(
      `INSERT INTO user_credits (user_id, email) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, meta.email ?? null]
    )
    const result = await client.query<UserCreditsRow>(
      `UPDATE user_credits
       SET balance = balance + $2, total_purchased = total_purchased + $2, updated_at = now()
       WHERE user_id = $1
       RETURNING *`,
      [userId, tokens]
    )
    const credits = rowToUserCredits(result.rows[0], userId)
    logEvent('info', 'credits.purchase.ok', {
      userId,
      amount: tokens,
      balance: credits.balance,
      eventId: meta.eventId,
      source: meta.source,
    })
    return credits
  })
}

// Consomme 1 token pour un message DM. Refuse si solde nul (garde atomique).
export async function consumeUserCredit(userId: string): Promise<ConsumeResult> {
  const result = await dbQuery<{ balance: number }>(
    `UPDATE user_credits
     SET balance = balance - 1, total_consumed = total_consumed + 1, updated_at = now()
     WHERE user_id = $1 AND balance > 0
     RETURNING balance`,
    [userId]
  )
  const row = result.rows[0]
  return row ? { ok: true, balance: row.balance } : { ok: false, balance: 0 }
}

// Rembourse 1 token (échec technique APRÈS débit : le joueur ne paie pas une
// erreur serveur).
export async function refundUserCredit(userId: string): Promise<void> {
  await withTransaction(async client => {
    await client.query(
      `INSERT INTO user_credits (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )
    await client.query(
      `UPDATE user_credits
       SET balance = balance + 1,
           total_consumed = CASE WHEN total_consumed > 0 THEN total_consumed - 1 ELSE 0 END,
           updated_at = now()
       WHERE user_id = $1`,
      [userId]
    )
  })
}

export async function getGuestUsage(guestId: string): Promise<GuestUsage> {
  const result = await dbQuery<GuestUsageRow>(
    'SELECT * FROM guest_usage WHERE guest_id = $1',
    [guestId]
  )
  const row = result.rows[0]
  return {
    schemaVersion: 1,
    guestId,
    messagesUsed: row?.messages_used ?? 0,
    updatedAt: row ? new Date(row.updated_at).toISOString() : new Date(0).toISOString(),
  }
}

// Consomme 1 message du quota invité (GUEST_MESSAGE_LIMIT messages gratuits).
export async function consumeGuestMessage(guestId: string): Promise<GuestConsumeResult> {
  return withTransaction(async client => {
    await client.query(
      `INSERT INTO guest_usage (guest_id, messages_used) VALUES ($1, 0)
       ON CONFLICT (guest_id) DO NOTHING`,
      [guestId]
    )
    // Garde atomique : n'incrémente que sous la limite.
    const result = await client.query<{ messages_used: number }>(
      `UPDATE guest_usage
       SET messages_used = messages_used + 1, updated_at = now()
       WHERE guest_id = $1 AND messages_used < $2
       RETURNING messages_used`,
      [guestId, GUEST_MESSAGE_LIMIT]
    )
    const row = result.rows[0]
    return row
      ? { ok: true, remaining: Math.max(0, GUEST_MESSAGE_LIMIT - row.messages_used) }
      : { ok: false, remaining: 0 }
  })
}

export async function refundGuestMessage(guestId: string): Promise<void> {
  await dbQuery(
    `UPDATE guest_usage
     SET messages_used = CASE WHEN messages_used > 0 THEN messages_used - 1 ELSE 0 END,
         updated_at = now()
     WHERE guest_id = $1`,
    [guestId]
  )
}
