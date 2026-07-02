const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')

const creditsDir = path.join(os.tmpdir(), `ai-dm-credits-test-${process.pid}`)

process.env.CREDITS_STORE_DIR = creditsDir
delete process.env.DATABASE_URL // force le backend fichier
process.env.GUEST_MESSAGE_LIMIT = '5'
process.env.SIGNUP_BONUS_TOKENS = '10'
process.env.APP_LOG_BUFFER_ENABLED = 'false'
process.env.APP_LOG_LEVEL = 'error'
process.env.APP_LOG_PERSIST_ENABLED = 'false'

const restoreTsRequire = installTsRequireWithAliases()
const credits = require(path.join(process.cwd(), 'lib/credits-store.ts'))

test.after(() => {
  restoreTsRequire()
  fs.rmSync(creditsDir, { recursive: true, force: true })
})

test('signup bonus is granted exactly once', async () => {
  const first = await credits.ensureSignupBonus('google:user-bonus', 'a@b.c')
  assert.equal(first.balance, 10)
  assert.equal(first.signupBonusGranted, true)

  const second = await credits.ensureSignupBonus('google:user-bonus', 'a@b.c')
  assert.equal(second.balance, 10)
})

test('consume decrements the balance and refuses at zero, refund restores', async () => {
  await credits.ensureSignupBonus('github:user-consume')

  for (let i = 9; i >= 0; i--) {
    const result = await credits.consumeUserCredit('github:user-consume')
    assert.equal(result.ok, true)
    assert.equal(result.balance, i)
  }

  const refused = await credits.consumeUserCredit('github:user-consume')
  assert.equal(refused.ok, false)
  assert.equal(refused.balance, 0)

  await credits.refundUserCredit('github:user-consume')
  const afterRefund = await credits.getUserCredits('github:user-consume')
  assert.equal(afterRefund.balance, 1)
})

test('purchases credit tokens and are idempotent by Stripe event id', async () => {
  const first = await credits.addPurchasedCredits('google:user-buy', 200, { eventId: 'evt_1' })
  assert.equal(first.balance, 200)
  assert.equal(first.totalPurchased, 200)

  // Stripe rejoue le webhook : le même événement ne crédite pas deux fois.
  const replay = await credits.addPurchasedCredits('google:user-buy', 200, { eventId: 'evt_1' })
  assert.equal(replay.balance, 200)

  const second = await credits.addPurchasedCredits('google:user-buy', 50, { eventId: 'evt_2' })
  assert.equal(second.balance, 250)
})

test('guest quota enforces the free message limit and supports refunds', async () => {
  for (let i = 4; i >= 0; i--) {
    const result = await credits.consumeGuestMessage('guest-quota')
    assert.equal(result.ok, true)
    assert.equal(result.remaining, i)
  }

  const refused = await credits.consumeGuestMessage('guest-quota')
  assert.equal(refused.ok, false)
  assert.equal(refused.remaining, 0)

  await credits.refundGuestMessage('guest-quota')
  const retry = await credits.consumeGuestMessage('guest-quota')
  assert.equal(retry.ok, true)
  assert.equal(retry.remaining, 0)
})

test('concurrent consumes never overspend the balance', async () => {
  await credits.addPurchasedCredits('google:user-race', 5, { eventId: 'evt_race' })

  const results = await Promise.all(
    Array.from({ length: 10 }, () => credits.consumeUserCredit('google:user-race'))
  )
  const succeeded = results.filter(result => result.ok).length
  assert.equal(succeeded, 5)

  const finalState = await credits.getUserCredits('google:user-race')
  assert.equal(finalState.balance, 0)
})
