// Protections anti-abus : rate-limit par IP (fenêtre mémoire) et plafond
// global journalier (backend mémoire — le backend Postgres est couvert par
// db-stores via le même motif SQL que le quota invité).

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')

process.env.APP_LOG_BUFFER_ENABLED = 'false'
process.env.APP_LOG_LEVEL = 'error'
process.env.APP_LOG_PERSIST_ENABLED = 'false'
delete process.env.DATABASE_URL // plafond journalier en mémoire
process.env.DM_RATE_LIMIT_PER_MINUTE = '3'
process.env.DM_DAILY_GLOBAL_MESSAGE_LIMIT = '4'

const restoreTsRequire = installTsRequireWithAliases()
const rateLimit = require(path.join(process.cwd(), 'lib/rate-limit.ts'))

test.after(() => {
  restoreTsRequire()
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

test('daily global budget refuses beyond the cap (memory backend)', async () => {
  rateLimit.__resetRateLimitForTests()

  for (let i = 0; i < 4; i++) {
    assert.equal(await rateLimit.consumeDailyGlobalBudget(), true)
  }
  assert.equal(await rateLimit.consumeDailyGlobalBudget(), false)

  // 0 = désactivé.
  assert.equal(await rateLimit.consumeDailyGlobalBudget(0), true)
})

test('client IP extraction prefers x-forwarded-for first entry', () => {
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })
  assert.equal(rateLimit.clientIpFromHeaders(headers), '203.0.113.7')

  assert.equal(rateLimit.clientIpFromHeaders(new Headers()), 'unknown')
})
