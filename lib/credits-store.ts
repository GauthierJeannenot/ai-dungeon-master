import fs from 'fs/promises'
import path from 'path'
import { acquireSessionLock } from './session-lock'
import { logEvent } from './server-logger'
import { isDatabaseEnabled } from './db'
import * as dbCredits from './credits-store-db'

// ─────────────────────────────────────────────────────────────────────────────
// Portefeuille de tokens (utilisateurs connectés) + quota invité (anonymes).
//
// Deux backends derrière la même API :
//   - DATABASE_URL définie → Postgres (lib/credits-store-db.ts), mutations SQL
//     atomiques, multi-instance safe. Backend recommandé en production.
//   - sinon → fichiers JSON sous .data/credits/ (verrou in-process, adapté au
//     dev sans DB et aux tests).
//
// Un « token » ici = un crédit de message envoyé au DM (pas un token LLM).
// ─────────────────────────────────────────────────────────────────────────────

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
  // Idempotence Stripe : ids d'événements webhook déjà crédités.
  // Backend fichier uniquement — en Postgres, l'idempotence vit dans la table
  // stripe_events et cette liste reste vide.
  processedEventIds: string[]
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

// ── API publique : dispatch Postgres / fichiers ──────────────────────────────

export async function getUserCredits(userId: string): Promise<UserCredits> {
  return isDatabaseEnabled() ? dbCredits.getUserCredits(userId) : getUserCreditsFile(userId)
}

// Crédite le bonus de bienvenue une seule fois (appelé au premier accès d'un
// utilisateur connecté). Idempotent.
export async function ensureSignupBonus(userId: string, email?: string): Promise<UserCredits> {
  return isDatabaseEnabled() ? dbCredits.ensureSignupBonus(userId, email) : ensureSignupBonusFile(userId, email)
}

// Crédite des tokens achetés. Idempotent par eventId (webhook Stripe rejoué).
export async function addPurchasedCredits(
  userId: string,
  amount: number,
  meta: { eventId: string; email?: string; source?: string }
): Promise<UserCredits> {
  return isDatabaseEnabled()
    ? dbCredits.addPurchasedCredits(userId, amount, meta)
    : addPurchasedCreditsFile(userId, amount, meta)
}

// Consomme 1 token pour un message DM. Refuse si solde nul.
export async function consumeUserCredit(userId: string): Promise<ConsumeResult> {
  return isDatabaseEnabled() ? dbCredits.consumeUserCredit(userId) : consumeUserCreditFile(userId)
}

// Rembourse 1 token (échec technique APRÈS débit : le joueur ne paie pas une
// erreur serveur).
export async function refundUserCredit(userId: string): Promise<void> {
  return isDatabaseEnabled() ? dbCredits.refundUserCredit(userId) : refundUserCreditFile(userId)
}

export async function getGuestUsage(guestId: string): Promise<GuestUsage> {
  return isDatabaseEnabled() ? dbCredits.getGuestUsage(guestId) : getGuestUsageFile(guestId)
}

// Consomme 1 message du quota invité (GUEST_MESSAGE_LIMIT messages gratuits).
export async function consumeGuestMessage(guestId: string): Promise<GuestConsumeResult> {
  return isDatabaseEnabled() ? dbCredits.consumeGuestMessage(guestId) : consumeGuestMessageFile(guestId)
}

export async function refundGuestMessage(guestId: string): Promise<void> {
  return isDatabaseEnabled() ? dbCredits.refundGuestMessage(guestId) : refundGuestMessageFile(guestId)
}

// ── Backend fichier (.data/credits/) ─────────────────────────────────────────

const DEFAULT_CREDITS_DIR = path.join(process.cwd(), '.data', 'credits')

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function getCreditsDir(): string {
  return process.env.CREDITS_STORE_DIR || DEFAULT_CREDITS_DIR
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 160)
}

function userPath(userId: string): string {
  return path.join(getCreditsDir(), `user-${safeId(userId)}.json`)
}

function guestPath(guestId: string): string {
  return path.join(getCreditsDir(), `guest-${safeId(guestId)}.json`)
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null
    logEvent('error', 'credits.read.error', { filePath, err })
    return null
  }
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  try {
    await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf-8')
    await fs.rename(tmpPath, filePath)
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => undefined)
    throw err
  }
}

function normalizeUserCredits(raw: unknown, userId: string): UserCredits {
  const record = raw && typeof raw === 'object' ? raw as Partial<UserCredits> : {}
  return {
    schemaVersion: 1,
    userId: safeId(record.userId ?? userId),
    email: typeof record.email === 'string' ? record.email : undefined,
    balance: typeof record.balance === 'number' && Number.isFinite(record.balance) ? Math.max(0, Math.floor(record.balance)) : 0,
    totalPurchased: typeof record.totalPurchased === 'number' ? record.totalPurchased : 0,
    totalConsumed: typeof record.totalConsumed === 'number' ? record.totalConsumed : 0,
    signupBonusGranted: Boolean(record.signupBonusGranted),
    processedEventIds: Array.isArray(record.processedEventIds)
      ? record.processedEventIds.filter((id): id is string => typeof id === 'string').slice(-200)
      : [],
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
  }
}

// Sérialise les mutations d'un même utilisateur dans ce process. Suffisant pour
// un déploiement mono-instance ; en multi-instance, utiliser le backend Postgres.
function creditsLock(key: string): Promise<() => void> {
  return acquireSessionLock(`credits:${key}`)
}

async function getUserCreditsFile(userId: string): Promise<UserCredits> {
  const existing = await readJson<UserCredits>(userPath(userId))
  return normalizeUserCredits(existing, userId)
}

async function ensureSignupBonusFile(userId: string, email?: string): Promise<UserCredits> {
  const release = await creditsLock(userId)
  try {
    const credits = normalizeUserCredits(await readJson<UserCredits>(userPath(userId)), userId)
    if (email && credits.email !== email) credits.email = email
    if (!credits.signupBonusGranted) {
      credits.signupBonusGranted = true
      credits.balance += SIGNUP_BONUS_TOKENS
      logEvent('info', 'credits.signup_bonus.granted', { userId: credits.userId, amount: SIGNUP_BONUS_TOKENS })
    }
    credits.updatedAt = new Date().toISOString()
    await writeJsonAtomic(userPath(userId), credits)
    return credits
  } finally {
    release()
  }
}

async function addPurchasedCreditsFile(
  userId: string,
  amount: number,
  meta: { eventId: string; email?: string; source?: string }
): Promise<UserCredits> {
  const release = await creditsLock(userId)
  try {
    const credits = normalizeUserCredits(await readJson<UserCredits>(userPath(userId)), userId)
    if (credits.processedEventIds.includes(meta.eventId)) {
      logEvent('info', 'credits.purchase.duplicate_event', { userId: credits.userId, eventId: meta.eventId })
      return credits
    }
    credits.balance += Math.max(0, Math.floor(amount))
    credits.totalPurchased += Math.max(0, Math.floor(amount))
    credits.processedEventIds = [...credits.processedEventIds, meta.eventId].slice(-200)
    if (meta.email && !credits.email) credits.email = meta.email
    credits.updatedAt = new Date().toISOString()
    await writeJsonAtomic(userPath(userId), credits)
    logEvent('info', 'credits.purchase.ok', {
      userId: credits.userId,
      amount,
      balance: credits.balance,
      eventId: meta.eventId,
      source: meta.source,
    })
    return credits
  } finally {
    release()
  }
}

async function consumeUserCreditFile(userId: string): Promise<ConsumeResult> {
  const release = await creditsLock(userId)
  try {
    const credits = normalizeUserCredits(await readJson<UserCredits>(userPath(userId)), userId)
    if (credits.balance <= 0) {
      return { ok: false, balance: 0 }
    }
    credits.balance -= 1
    credits.totalConsumed += 1
    credits.updatedAt = new Date().toISOString()
    await writeJsonAtomic(userPath(userId), credits)
    return { ok: true, balance: credits.balance }
  } finally {
    release()
  }
}

async function refundUserCreditFile(userId: string): Promise<void> {
  const release = await creditsLock(userId)
  try {
    const credits = normalizeUserCredits(await readJson<UserCredits>(userPath(userId)), userId)
    credits.balance += 1
    credits.totalConsumed = Math.max(0, credits.totalConsumed - 1)
    credits.updatedAt = new Date().toISOString()
    await writeJsonAtomic(userPath(userId), credits)
  } finally {
    release()
  }
}

async function getGuestUsageFile(guestId: string): Promise<GuestUsage> {
  const existing = await readJson<GuestUsage>(guestPath(guestId))
  const record = existing && typeof existing === 'object' ? existing : null
  return {
    schemaVersion: 1,
    guestId: safeId(guestId),
    messagesUsed: typeof record?.messagesUsed === 'number' && Number.isFinite(record.messagesUsed)
      ? Math.max(0, Math.floor(record.messagesUsed))
      : 0,
    updatedAt: typeof record?.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
  }
}

async function consumeGuestMessageFile(guestId: string): Promise<GuestConsumeResult> {
  const release = await creditsLock(`guest:${guestId}`)
  try {
    const usage = await getGuestUsageFile(guestId)
    if (usage.messagesUsed >= GUEST_MESSAGE_LIMIT) {
      return { ok: false, remaining: 0 }
    }
    usage.messagesUsed += 1
    usage.updatedAt = new Date().toISOString()
    await writeJsonAtomic(guestPath(guestId), usage)
    return { ok: true, remaining: GUEST_MESSAGE_LIMIT - usage.messagesUsed }
  } finally {
    release()
  }
}

async function refundGuestMessageFile(guestId: string): Promise<void> {
  const release = await creditsLock(`guest:${guestId}`)
  try {
    const usage = await getGuestUsageFile(guestId)
    usage.messagesUsed = Math.max(0, usage.messagesUsed - 1)
    usage.updatedAt = new Date().toISOString()
    await writeJsonAtomic(guestPath(guestId), usage)
  } finally {
    release()
  }
}

// ── Lecture brute du backend fichier (script d'import vers Postgres) ─────────

export async function listFileUserCredits(): Promise<UserCredits[]> {
  return listFileRecords<UserCredits>('user-', raw => normalizeUserCredits(raw, 'unknown'))
}

export async function listFileGuestUsage(): Promise<GuestUsage[]> {
  return listFileRecords<GuestUsage>('guest-', raw => {
    const record = raw as Partial<GuestUsage>
    return {
      schemaVersion: 1,
      guestId: typeof record.guestId === 'string' ? record.guestId : 'unknown',
      messagesUsed: typeof record.messagesUsed === 'number' ? Math.max(0, Math.floor(record.messagesUsed)) : 0,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    }
  })
}

async function listFileRecords<T>(prefix: string, normalize: (raw: unknown) => T): Promise<T[]> {
  let files: string[]
  try {
    files = await fs.readdir(getCreditsDir())
  } catch {
    return []
  }
  const records: T[] = []
  for (const file of files) {
    if (!file.startsWith(prefix) || !file.endsWith('.json')) continue
    const raw = await readJson<unknown>(path.join(getCreditsDir(), file))
    if (raw) records.push(normalize(raw))
  }
  return records
}
