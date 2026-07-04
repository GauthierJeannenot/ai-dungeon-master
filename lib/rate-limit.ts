import { dbQuery } from './db'
import { logEvent } from './server-logger'

// ─────────────────────────────────────────────────────────────────────────────
// Protections anti-abus de /api/dm — chaque message coûte de l'argent (appels
// Anthropic), et le quota invité se réinitialise en effaçant le cookie. Deux
// gardes complémentaires, évaluées AVANT tout débit et tout appel LLM :
//
//   1. Rate-limit par IP (fenêtre fixe 1 min, en mémoire). Par instance : en
//      multi-instance chaque nœud applique sa propre fenêtre, ce qui reste une
//      borne correcte (limite globale = limite × nb d'instances).
//   2. Plafond global de messages par jour — disjoncteur de dépense Anthropic.
//      Compteur Postgres atomique (table daily_usage), partagé entre instances.
// ─────────────────────────────────────────────────────────────────────────────

// Messages par minute et par IP (0 = désactivé).
export const RATE_LIMIT_PER_MINUTE = parseNonNegativeInt(process.env.DM_RATE_LIMIT_PER_MINUTE, 8)
// Messages toutes IP confondues par jour UTC (0 = désactivé).
export const DAILY_GLOBAL_MESSAGE_LIMIT = parseNonNegativeInt(process.env.DM_DAILY_GLOBAL_MESSAGE_LIMIT, 2000)

const WINDOW_MS = 60_000
const MAX_TRACKED_KEYS = 10_000

interface WindowBucket {
  windowStart: number
  count: number
}

const buckets = new Map<string, WindowBucket>()

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

// IP du client derrière le proxy de l'hébergeur (Railway renseigne
// x-forwarded-for). Fallback 'unknown' : mieux vaut regrouper les requêtes sans
// IP dans un même bucket que de les exempter.
//
// On prend la DERNIÈRE entrée de x-forwarded-for, pas la première : les proxys
// AJOUTENT en fin de liste, donc le dernier hop est celui posé par le proxy de
// confiance (Railway) devant l'app ; les entrées précédentes sont DÉCLARÉES par
// le client et falsifiables (un client qui envoie « X-Forwarded-For: <fake> »
// obtiendrait un bucket de rate-limit neuf à chaque requête si on lisait la 1re).
// NB : si un jour un CDN s'ajoute devant Railway (2 hops de confiance), la
// dernière entrée deviendrait l'IP du CDN — revoir alors ce choix (sans aller
// jusqu'à une liste de proxys de confiance tant qu'il n'y a qu'un hop).
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',').map(part => part.trim()).filter(Boolean)
    const last = parts.at(-1)
    if (last) return last
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

function pruneExpiredBuckets(now: number): void {
  if (buckets.size <= MAX_TRACKED_KEYS) return
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS) buckets.delete(key)
  }
}

export interface RateLimitResult {
  ok: boolean
  retryAfterSeconds: number
}

export function checkRateLimit(key: string, limitPerMinute = RATE_LIMIT_PER_MINUTE): RateLimitResult {
  if (limitPerMinute <= 0) return { ok: true, retryAfterSeconds: 0 }

  const now = Date.now()
  pruneExpiredBuckets(now)

  const bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { windowStart: now, count: 1 })
    return { ok: true, retryAfterSeconds: 0 }
  }

  if (bucket.count >= limitPerMinute) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000)),
    }
  }

  bucket.count += 1
  return { ok: true, retryAfterSeconds: 0 }
}

// Hook de test : réinitialise les fenêtres de rate-limit en mémoire.
export function __resetRateLimitForTests(): void {
  buckets.clear()
}

// ── Plafond global journalier ────────────────────────────────────────────────

function utcDay(): string {
  return new Date().toISOString().slice(0, 10)
}

// Consomme 1 message du budget global du jour. Refuse au-delà du plafond.
// Compteur Postgres atomique (même motif que le quota invité : INSERT DO NOTHING
// + UPDATE gardé) — partagé entre instances.
export async function consumeDailyGlobalBudget(
  limit = DAILY_GLOBAL_MESSAGE_LIMIT
): Promise<boolean> {
  if (limit <= 0) return true

  const day = utcDay()

  await dbQuery(
    `INSERT INTO daily_usage (day, messages) VALUES ($1, 0)
     ON CONFLICT (day) DO NOTHING`,
    [day]
  )
  const result = await dbQuery<{ messages: number }>(
    `UPDATE daily_usage
     SET messages = messages + 1
     WHERE day = $1 AND messages < $2
     RETURNING messages`,
    [day, limit]
  )
  const ok = result.rows.length > 0
  if (!ok) {
    logEvent('warn', 'abuse.daily_budget.exhausted', { day, limit })
  }
  return ok
}
