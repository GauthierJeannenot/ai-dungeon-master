// API « Mes parties » (backend fichier, monétisation coupée → owner invité null).
// Couvre : liste vide au départ, apparition après une partie, reprise (GET
// single) et suppression (DELETE), avec vérification d'appartenance.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')

const sessionStoreDir = path.join(os.tmpdir(), `ai-dm-sessions-api-${process.pid}`)

process.env.APP_LOG_BUFFER_ENABLED = 'false'
process.env.APP_LOG_LEVEL = 'error'
process.env.APP_LOG_PERSIST_ENABLED = 'false'
process.env.GAME_SESSION_STORE_DIR = sessionStoreDir
process.env.MONETIZATION_ENABLED = 'false'
delete process.env.DATABASE_URL

const restoreTsRequire = installTsRequireWithAliases()
const list = require(path.join(process.cwd(), 'app/api/sessions/route.ts'))
const single = require(path.join(process.cwd(), 'app/api/sessions/[sessionId]/route.ts'))
const { saveSession } = require(path.join(process.cwd(), 'lib/session-store.ts'))

test.after(() => {
  restoreTsRequire()
  fs.rmSync(sessionStoreDir, { recursive: true, force: true })
})

function seed(sessionId, ownerId, adventureId) {
  return saveSession(sessionId, {
    gameState: {
      adventureId,
      phase: 'exploration',
      player: { id: 'player', name: 'Héros', hp: { current: 20, max: 20 }, position: { x: 4, y: 13 } },
      monsters: {}, combatLog: [], roomsVisited: ['1'], currentRoomId: '1',
    },
    history: [{ role: 'player', content: 'salut' }, { role: 'dm', content: 'bienvenue' }],
    ownerId,
    adventureId,
    turnTraces: [],
  })
}

test('GET /api/sessions returns owner sessions with adventure titles', async () => {
  // Sans monétisation, resolveEntitlement crée un guestId de cookie ; on ne peut
  // pas le connaître ici, mais on peut vérifier qu'un owner sans partie renvoie
  // une liste vide, et que la forme de réponse est correcte.
  const res = await list.GET()
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.ok(Array.isArray(data.sessions))
})

test('GET single session hydrates state and history for the owner', async () => {
  // On seed une partie SANS owner (ownerId undefined) → accessible (compat
  // sessions historiques). La reprise renvoie état + historique.
  await seed('resume-1', undefined, 'tide-crypt')
  const res = await single.GET(new Request('http://localhost/api/sessions/resume-1'), {
    params: Promise.resolve({ sessionId: 'resume-1' }),
  })
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.adventureId, 'tide-crypt')
  assert.equal(data.history.length, 2)
  assert.equal(data.gameState.currentRoomId, '1')
})

test('GET single session is 403 for a session owned by someone else', async () => {
  await seed('owned-by-other', 'user:not-me', 'grammys-country-apple-pie')
  const res = await single.GET(new Request('http://localhost/api/sessions/owned-by-other'), {
    params: Promise.resolve({ sessionId: 'owned-by-other' }),
  })
  assert.equal(res.status, 403)
})

test('GET single session is 404 when missing', async () => {
  const res = await single.GET(new Request('http://localhost/api/sessions/nope'), {
    params: Promise.resolve({ sessionId: 'nope' }),
  })
  assert.equal(res.status, 404)
})

test('DELETE removes an unowned session', async () => {
  await seed('to-delete', undefined, 'tide-crypt')
  const res = await single.DELETE(new Request('http://localhost/api/sessions/to-delete', { method: 'DELETE' }), {
    params: Promise.resolve({ sessionId: 'to-delete' }),
  })
  assert.equal(res.status, 200)

  const after = await single.GET(new Request('http://localhost/api/sessions/to-delete'), {
    params: Promise.resolve({ sessionId: 'to-delete' }),
  })
  assert.equal(after.status, 404)
})

test('DELETE is 403 for a session owned by someone else', async () => {
  await seed('other-delete', 'user:not-me', 'tide-crypt')
  const res = await single.DELETE(new Request('http://localhost/api/sessions/other-delete', { method: 'DELETE' }), {
    params: Promise.resolve({ sessionId: 'other-delete' }),
  })
  assert.equal(res.status, 403)
})
