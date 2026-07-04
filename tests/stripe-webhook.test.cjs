// Webhook Stripe : vérification de signature, crédit des tokens, idempotence.
// Utilise stripe.webhooks.generateTestHeaderString (aucun appel réseau) ;
// l'idempotence (rejeu du même event) est portée par la table stripe_events.

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_key_for_signature_checks'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'

// Backend unique Postgres, émulé en mémoire (pg-mem injecté).
const pg = installPgMem()
const { POST } = require(path.join(process.cwd(), 'app/api/stripe/webhook/route.ts'))
const credits = require(path.join(process.cwd(), 'lib/credits-store.ts'))
const Stripe = require('stripe')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

test.after(() => {
  pg.restore()
})

function checkoutCompletedEvent({ eventId, userId, tokens, paymentStatus = 'paid' }) {
  return JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_test_${eventId}`,
        object: 'checkout.session',
        payment_status: paymentStatus,
        metadata: { userId, packageId: 'pack-apprenti', tokens: String(tokens) },
        customer_details: { email: 'buyer@example.com' },
      },
    },
  })
}

// Requête minimale compatible avec le handler (text() + headers.get()).
function webhookRequest(payload, signature) {
  return {
    text: async () => payload,
    headers: new Headers(signature ? { 'stripe-signature': signature } : {}),
  }
}

function signedRequest(payload) {
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  })
  return webhookRequest(payload, signature)
}

test('webhook refuses a missing or invalid signature', async () => {
  const payload = checkoutCompletedEvent({ eventId: 'evt_sig', userId: 'user-sig', tokens: 50 })

  const missing = await POST(webhookRequest(payload, null))
  assert.equal(missing.status, 400)

  const forged = await POST(webhookRequest(payload, 't=1,v1=deadbeef'))
  assert.equal(forged.status, 400)

  // Rien n'a été crédité.
  const balance = (await credits.getUserCredits('user-sig')).balance
  assert.equal(balance, 0)
})

test('webhook credits tokens on a signed checkout.session.completed', async () => {
  const payload = checkoutCompletedEvent({ eventId: 'evt_ok_1', userId: 'user-buy', tokens: 200 })
  const response = await POST(signedRequest(payload))
  assert.equal(response.status, 200)

  const after = await credits.getUserCredits('user-buy')
  assert.equal(after.balance, 200)
  assert.equal(after.totalPurchased, 200)
})

test('webhook is idempotent when Stripe replays the same event', async () => {
  const payload = checkoutCompletedEvent({ eventId: 'evt_replay', userId: 'user-replay', tokens: 50 })

  assert.equal((await POST(signedRequest(payload))).status, 200)
  assert.equal((await POST(signedRequest(payload))).status, 200)

  const after = await credits.getUserCredits('user-replay')
  assert.equal(after.balance, 50)
})

test('webhook ignores unpaid sessions and invalid metadata without crediting', async () => {
  const unpaid = checkoutCompletedEvent({
    eventId: 'evt_unpaid', userId: 'user-unpaid', tokens: 50, paymentStatus: 'unpaid',
  })
  assert.equal((await POST(signedRequest(unpaid))).status, 200)
  assert.equal((await credits.getUserCredits('user-unpaid')).balance, 0)

  const badMetadata = JSON.stringify({
    id: 'evt_bad_meta',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_bad', object: 'checkout.session', payment_status: 'paid', metadata: {} } },
  })
  assert.equal((await POST(signedRequest(badMetadata))).status, 200)
})
