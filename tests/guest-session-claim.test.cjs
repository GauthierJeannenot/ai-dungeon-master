const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const { installPgMem } = require('./helpers/pg-mem.cjs')

process.env.MONETIZATION_ENABLED = 'true'
const pg = installPgMem()
let userId = 'new-player'
let guestId = 'guest-browser-123'
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request === 'next/headers') return { cookies: async () => ({
    get: () => guestId ? { value: guestId } : undefined,
  }) }
  if (request === './auth' && parent?.filename.endsWith('entitlements.ts')) {
    return { auth: async () => ({ userId }) }
  }
  return originalLoad.call(this, request, parent, ...args)
}
const { saveSession, loadSession, claimGuestSessions } = require('../lib/session-store.ts')
const { acquireSessionLock } = require('../lib/session-lock.ts')
const single = require('../app/api/sessions/[sessionId]/route.ts')
const list = require('../app/api/sessions/route.ts')
test.after(() => { Module._load = originalLoad; pg.restore() })

async function seed(id, ownerId) {
  await saveSession(id, {
    ownerId, adventureId: 'tide-crypt', characterId: 'fighter',
    gameState: {
      phase: 'exploration', currentRoomId: '1', monsters: {}, combatLog: [], roomsVisited: ['1'],
      player: { id: 'player', name: 'Héros', hp: { current: 20, max: 20 }, position: { x: 4, y: 13 } },
    },
    history: [{ role: 'player', content: 'bonjour' }], summaryContext: 'résumé',
  })
}

test('first resume after login claims only this browser guest sessions and preserves state', async () => {
  await seed('guest-resume', `guest:${guestId}`)
  await seed('foreign-guest', 'guest:another-browser')
  await seed('foreign-user', 'user:another-player')
  await seed('legacy', undefined)
  const before = await loadSession('guest-resume')
  const response = await single.GET(null, { params: Promise.resolve({ sessionId: 'guest-resume' }) })
  assert.equal(response.status, 200)
  const after = await loadSession('guest-resume')
  assert.deepEqual(after, { ...before, ownerId: `user:${userId}` })
  const listing = await (await list.GET()).json()
  assert.ok(listing.sessions.some(s => s.sessionId === 'guest-resume'))
  for (const id of ['foreign-guest', 'foreign-user']) {
    assert.equal((await single.GET(null, { params: Promise.resolve({ sessionId: id }) })).status, 403)
  }
  assert.equal((await loadSession('legacy')).ownerId, undefined)
  userId = 'second-player'
  assert.equal((await single.GET(null, { params: Promise.resolve({ sessionId: 'guest-resume' }) })).status, 403)
  guestId = undefined
  assert.equal((await single.GET(null, { params: Promise.resolve({ sessionId: 'foreign-guest' }) })).status, 403)
})

test('claim waits for an in-flight turn and is idempotent', async () => {
  await seed('locked-guest', 'guest:locked-browser')
  const release = await acquireSessionLock('locked-guest')
  const claim = claimGuestSessions('locked-browser', 'owner')
  try {
    assert.equal((await loadSession('locked-guest')).ownerId, 'guest:locked-browser')
  } finally { release() }
  await claim
  await claimGuestSessions('locked-browser', 'intruder')
  assert.equal((await loadSession('locked-guest')).ownerId, 'user:owner')
})
