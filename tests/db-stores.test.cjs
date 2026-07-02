// Backends Postgres (credits-store-db, session-store-db) testés contre pg-mem,
// une émulation Postgres en mémoire compatible avec le driver pg. Vérifie le
// SQL réel (schéma, ON CONFLICT, gardes atomiques) sans base externe.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const Module = require('node:module')
const ts = require('typescript')

process.env.APP_LOG_BUFFER_ENABLED = 'false'
process.env.APP_LOG_LEVEL = 'error'
process.env.APP_LOG_PERSIST_ENABLED = 'false'
process.env.GUEST_MESSAGE_LIMIT = '5'
process.env.SIGNUP_BONUS_TOKENS = '10'
// Active la branche Postgres des dispatchers ; le pool réel est injecté (pg-mem).
process.env.DATABASE_URL = 'postgres://pg-mem/in-memory'

function installTsRequireWithAliases() {
  const previousTs = Module._extensions['.ts']
  const previousResolve = Module._resolveFilename

  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      const mapped = path.join(process.cwd(), request.slice(2))
      return previousResolve.call(this, mapped, parent, isMain, options)
    }

    return previousResolve.call(this, request, parent, isMain, options)
  }

  Module._extensions['.ts'] = function loadTs(mod, filename) {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    mod._compile(output, filename)
  }

  return () => {
    Module._resolveFilename = previousResolve
    if (previousTs) Module._extensions['.ts'] = previousTs
    else delete Module._extensions['.ts']
  }
}

const restoreTsRequire = installTsRequireWithAliases()

const { newDb } = require('pg-mem')
const db = require(path.join(process.cwd(), 'lib/db.ts'))

const mem = newDb()
const { Pool } = mem.adapters.createPg()
db.__setDbPoolForTests(new Pool())

const credits = require(path.join(process.cwd(), 'lib/credits-store.ts'))
const sessionStore = require(path.join(process.cwd(), 'lib/session-store.ts'))

test.after(() => {
  restoreTsRequire()
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
  })

  const loaded = await sessionStore.loadSession('db-session-1')
  assert.ok(loaded)
  assert.equal(loaded.sessionId, 'db-session-1')
  assert.equal(loaded.history.length, 2)
  assert.equal(loaded.summaryContext, 'résumé de test')
  assert.equal(loaded.gameState.player.name, 'Héros')

  // Upsert : la sauvegarde suivante écrase la précédente.
  await sessionStore.saveSession('db-session-1', {
    gameState: { ...gameState, currentRoomId: '4' },
    history: loaded.history,
    summaryContext: undefined,
    turnTraces: [],
  })
  const reloaded = await sessionStore.loadSession('db-session-1')
  assert.equal(reloaded.gameState.currentRoomId, '4')
  assert.equal(reloaded.summaryContext, undefined)

  await sessionStore.deleteSession('db-session-1')
  assert.equal(await sessionStore.loadSession('db-session-1'), null)
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
