import { dbQuery, withTransaction } from './db'
import { logEvent } from './server-logger'
import {
  GUEST_MESSAGE_LIMIT,
  SIGNUP_BONUS_TOKENS,
  type ConsumeResult,
  type GuestConsumeResult,
  type GuestUsage,
  type UserCredits,
} from './credits-store'

// Backend Postgres du portefeuille de tokens et du quota invité.
// Toutes les mutations sont des opérations SQL atomiques (UPDATE conditionnel,
// INSERT ... ON CONFLICT) : correctes même en multi-instance, contrairement au
// verrou in-process du backend fichier.

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
      processedEventIds: [],
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
    // L'idempotence vit dans la table stripe_events — liste vide ici.
    processedEventIds: [],
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

// Import ponctuel des données du backend fichier (scripts/db-import-file-stores.cjs).
export async function importUserCredits(record: UserCredits): Promise<void> {
  await withTransaction(async client => {
    await client.query(
      `INSERT INTO user_credits
         (user_id, email, balance, total_purchased, total_consumed, signup_bonus_granted, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id) DO UPDATE SET
         email = EXCLUDED.email,
         balance = EXCLUDED.balance,
         total_purchased = EXCLUDED.total_purchased,
         total_consumed = EXCLUDED.total_consumed,
         signup_bonus_granted = EXCLUDED.signup_bonus_granted,
         updated_at = now()`,
      [
        record.userId,
        record.email ?? null,
        record.balance,
        record.totalPurchased,
        record.totalConsumed,
        record.signupBonusGranted,
      ]
    )
    for (const eventId of record.processedEventIds) {
      await client.query(
        `INSERT INTO stripe_events (event_id, user_id, tokens, source)
         VALUES ($1, $2, 0, 'file-import')
         ON CONFLICT (event_id) DO NOTHING`,
        [eventId, record.userId]
      )
    }
  })
}

export async function importGuestUsage(record: GuestUsage): Promise<void> {
  await dbQuery(
    `INSERT INTO guest_usage (guest_id, messages_used, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (guest_id) DO UPDATE SET
       messages_used = EXCLUDED.messages_used,
       updated_at = now()`,
    [record.guestId, record.messagesUsed]
  )
}
