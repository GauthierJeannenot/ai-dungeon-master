// Stores Postgres (credits-store, session-store) testés contre pg-mem, une
// émulation Postgres en mémoire compatible avec le driver pg. Vérifie le SQL
// réel (schéma, ON CONFLICT, gardes atomiques) sans base externe.

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

process.env.GUEST_MESSAGE_LIMIT = '5'
process.env.SIGNUP_BONUS_TOKENS = '10'

const pg = installPgMem()
const db = pg.db
const credits = require(path.join(process.cwd(), 'lib/credits-store.ts'))
const sessionStore = require(path.join(process.cwd(), 'lib/session-store.ts'))

test.after(() => {
  pg.restore()
})

test('db: schema bootstrap creates auth + business tables', async () => {
  await db.ensureSchema()
  const result = await db.dbQuery(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  )
  const names = result.rows.map(row => row.table_name)
  for (const expected of ['users', 'accounts', 'sessions', 'verification_token', 'game_sessions', 'user_credits', 'stripe_events', 'guest_usage']) {
    assert.ok(names.includes(expected), `table manquante: ${expected}`)
  }
})

test('db: signup bonus granted exactly once', async () => {
  const first = await credits.ensureSignupBonus('42', 'a@b.c')
  assert.equal(first.balance, 10)
  assert.equal(first.signupBonusGranted, true)
  assert.equal(first.email, 'a@b.c')

  const second = await credits.ensureSignupBonus('42', 'a@b.c')
  assert.equal(second.balance, 10)
})

test('db: consume decrements atomically, refuses at zero, refund restores', async () => {
  await credits.ensureSignupBonus('43')

  for (let i = 9; i >= 0; i--) {
    const result = await credits.consumeUserCredit('43')
    assert.equal(result.ok, true)
    assert.equal(result.balance, i)
  }

  const refused = await credits.consumeUserCredit('43')
  assert.equal(refused.ok, false)

  await credits.refundUserCredit('43')
  const after = await credits.getUserCredits('43')
  assert.equal(after.balance, 1)
})

test('db: purchases are idempotent by Stripe event id', async () => {
  const first = await credits.addPurchasedCredits('44', 200, { eventId: 'evt_db_1', email: 'x@y.z' })
  assert.equal(first.balance, 200)
  assert.equal(first.totalPurchased, 200)

  const replay = await credits.addPurchasedCredits('44', 200, { eventId: 'evt_db_1' })
  assert.equal(replay.balance, 200)

  const second = await credits.addPurchasedCredits('44', 50, { eventId: 'evt_db_2' })
  assert.equal(second.balance, 250)
})

test('db: guest quota enforces the limit and supports refunds', async () => {
  for (let i = 4; i >= 0; i--) {
    const result = await credits.consumeGuestMessage('guest-db')
    assert.equal(result.ok, true)
    assert.equal(result.remaining, i)
  }

  const refused = await credits.consumeGuestMessage('guest-db')
  assert.equal(refused.ok, false)

  await credits.refundGuestMessage('guest-db')
  const retry = await credits.consumeGuestMessage('guest-db')
  assert.equal(retry.ok, true)
  assert.equal(retry.remaining, 0)
})

test('db: game session save/load/delete round-trip', async () => {
  const gameState = {
    phase: 'exploration',
    player: { id: 'player', name: 'Héros', hp: { current: 20, max: 20 } },
    monsters: {},
    combatLog: [],
    roomsVisited: ['1'],
    currentRoomId: '1',
  }

  await sessionStore.saveSession('db-session-1', {
    gameState,
    history: [
      { role: 'player', content: 'bonjour' },
      { role: 'dm', content: 'bienvenue' },
    ],
    summaryContext: 'résumé de test',
    turnTraces: [],
    ownerId: 'user:42',
    adventureId: 'tide-crypt',
    characterId: 'wizard',
  })

  const loaded = await sessionStore.loadSession('db-session-1')
  assert.ok(loaded)
  assert.equal(loaded.sessionId, 'db-session-1')
  assert.equal(loaded.history.length, 2)
  assert.equal(loaded.summaryContext, 'résumé de test')
  assert.equal(loaded.gameState.player.name, 'Héros')
  assert.equal(loaded.ownerId, 'user:42')
  assert.equal(loaded.adventureId, 'tide-crypt')
  assert.equal(loaded.characterId, 'wizard')

  // Upsert : la sauvegarde suivante écrase la précédente. Une sauvegarde SANS
  // characterId ne doit PAS l'effacer (COALESCE, comme owner_id/adventure_id).
  await sessionStore.saveSession('db-session-1', {
    gameState: { ...gameState, currentRoomId: '4' },
    history: loaded.history,
    summaryContext: undefined,
    turnTraces: [],
  })
  const reloaded = await sessionStore.loadSession('db-session-1')
  assert.equal(reloaded.gameState.currentRoomId, '4')
  assert.equal(reloaded.summaryContext, undefined)
  assert.equal(reloaded.characterId, 'wizard')
  assert.equal(reloaded.adventureId, 'tide-crypt')

  await sessionStore.deleteSession('db-session-1')
  assert.equal(await sessionStore.loadSession('db-session-1'), null)
})

test('db: lists sessions by owner, most recent first, with summaries', async () => {
  const baseState = (roomId) => ({
    adventureId: 'tide-crypt',
    phase: 'exploration',
    player: { id: 'player', name: 'Héros', hp: { current: 18, max: 28 } },
    monsters: {}, combatLog: [], roomsVisited: [roomId], currentRoomId: roomId,
  })

  await sessionStore.saveSession('own-a', {
    gameState: baseState('1'),
    history: [{ role: 'player', content: 'a' }, { role: 'dm', content: 'b' }, { role: 'player', content: 'c' }],
    ownerId: 'user:owner-1', adventureId: 'tide-crypt', turnTraces: [],
  })
  await sessionStore.saveSession('own-b', {
    gameState: baseState('4'),
    history: [{ role: 'player', content: 'x' }, { role: 'dm', content: 'y' }],
    ownerId: 'user:owner-1', adventureId: 'grammys-country-apple-pie', turnTraces: [],
  })
  await sessionStore.saveSession('own-other', {
    gameState: baseState('1'),
    history: [], ownerId: 'user:someone-else', adventureId: 'tide-crypt', turnTraces: [],
  })

  const mine = await sessionStore.listSessionsByOwner('user:owner-1')
  assert.equal(mine.length, 2)
  assert.ok(mine.every(s => s.sessionId === 'own-a' || s.sessionId === 'own-b'))
  const a = mine.find(s => s.sessionId === 'own-a')
  assert.equal(a.turnCount, 2)        // deux messages joueur
  assert.equal(a.phase, 'exploration')
  assert.equal(a.playerHp.max, 28)
  assert.equal(a.adventureId, 'tide-crypt')

  const other = await sessionStore.listSessionsByOwner('user:someone-else')
  assert.equal(other.length, 1)
  assert.equal(other[0].sessionId, 'own-other')
})

test('db: sanitizes hostile session ids like the file backend', async () => {
  await sessionStore.saveSession('../../etc/passwd', {
    gameState: {
      phase: 'exploration',
      player: { id: 'player', name: 'Héros', hp: { current: 20, max: 20 } },
      monsters: {},
      combatLog: [],
      roomsVisited: [],
      currentRoomId: null,
    },
    history: [],
    summaryContext: undefined,
    turnTraces: [],
  })
  const loaded = await sessionStore.loadSession('../../etc/passwd')
  assert.ok(loaded)
  assert.equal(loaded.sessionId, '______etc_passwd')
})
