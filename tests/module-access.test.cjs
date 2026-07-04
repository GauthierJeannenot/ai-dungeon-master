// Accès aux modules payants (achat unique par compte, backend Postgres pg-mem).
// Vérifie l'octroi, la lecture, et l'idempotence par event id Stripe (table
// stripe_events partagée avec le portefeuille de tokens).

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

const pg = installPgMem()
const access = require(path.join(process.cwd(), 'lib/module-access.ts'))

test.after(() => {
  pg.restore()
})

test('a user without a purchase has no module access', async () => {
  assert.equal(await access.hasModuleAccess('user-none', 'tide-crypt'), false)
  assert.deepEqual(await access.getOwnedModules('user-none'), [])
})

test('grant unlocks the module and lists it as owned', async () => {
  await access.grantModuleAccess('user-buy', 'tide-crypt', { eventId: 'evt_mod_1' })

  assert.equal(await access.hasModuleAccess('user-buy', 'tide-crypt'), true)
  assert.deepEqual(await access.getOwnedModules('user-buy'), ['tide-crypt'])
  // L'accès est ciblé : un autre module reste verrouillé.
  assert.equal(await access.hasModuleAccess('user-buy', 'other-module'), false)
})

test('grant is idempotent when Stripe replays the same event', async () => {
  await access.grantModuleAccess('user-replay', 'tide-crypt', { eventId: 'evt_mod_replay' })
  // Rejeu du même event : aucun doublon, aucune erreur.
  await access.grantModuleAccess('user-replay', 'tide-crypt', { eventId: 'evt_mod_replay' })

  assert.deepEqual(await access.getOwnedModules('user-replay'), ['tide-crypt'])
})

test('access is not shared between users', async () => {
  await access.grantModuleAccess('user-a', 'tide-crypt', { eventId: 'evt_mod_a' })
  assert.equal(await access.hasModuleAccess('user-b', 'tide-crypt'), false)
})
