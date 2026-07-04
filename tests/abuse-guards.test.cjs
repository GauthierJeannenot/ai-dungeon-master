// Protections anti-abus : rate-limit par IP (fenêtre mémoire, par instance) et
// plafond global journalier (compteur SQL atomique sur daily_usage, ici pg-mem).

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

process.env.DM_RATE_LIMIT_PER_MINUTE = '3'
process.env.DM_DAILY_GLOBAL_MESSAGE_LIMIT = '4'

// Backend unique Postgres, émulé en mémoire (pg-mem injecté).
const pg = installPgMem()
const rateLimit = require(path.join(process.cwd(), 'lib/rate-limit.ts'))

test.after(() => {
  pg.restore()
})

test('rate limit allows up to the per-minute cap then refuses with a retry delay', () => {
  rateLimit.__resetRateLimitForTests()

  for (let i = 0; i < 3; i++) {
    assert.equal(rateLimit.checkRateLimit('dm:1.2.3.4').ok, true)
  }

  const refused = rateLimit.checkRateLimit('dm:1.2.3.4')
  assert.equal(refused.ok, false)
  assert.ok(refused.retryAfterSeconds >= 1 && refused.retryAfterSeconds <= 60)

  // Une autre IP a sa propre fenêtre.
  assert.equal(rateLimit.checkRateLimit('dm:5.6.7.8').ok, true)
})

test('rate limit is disabled when the cap is 0', () => {
  rateLimit.__resetRateLimitForTests()
  for (let i = 0; i < 50; i++) {
    assert.equal(rateLimit.checkRateLimit('dm:9.9.9.9', 0).ok, true)
  }
})

test('daily global budget refuses beyond the cap (SQL backend)', async () => {
  rateLimit.__resetRateLimitForTests()

  for (let i = 0; i < 4; i++) {
    assert.equal(await rateLimit.consumeDailyGlobalBudget(), true)
  }
  assert.equal(await rateLimit.consumeDailyGlobalBudget(), false)

  // 0 = désactivé.
  assert.equal(await rateLimit.consumeDailyGlobalBudget(0), true)
})

test('client IP extraction uses the last x-forwarded-for entry (trusted proxy hop)', () => {
  // Le proxy de confiance ajoute son entrée en FIN de liste ; la 1re est
  // déclarée par le client (falsifiable). On prend donc la dernière.
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })
  assert.equal(rateLimit.clientIpFromHeaders(headers), '10.0.0.1')

  assert.equal(rateLimit.clientIpFromHeaders(new Headers()), 'unknown')
})
