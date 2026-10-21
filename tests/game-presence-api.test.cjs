const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')
process.env.RUNPOD_AUTO_MANAGE = 'true'
process.env.RUNPOD_ENDPOINT_ID = 'test-endpoint'
process.env.RUNPOD_API_KEY = 'never-contact-runpod'
process.env.VLLM_BASE_URL = 'https://api.runpod.ai/v2/test-endpoint/openai/v1'
process.env.VLLM_API_KEY = 'never-contact-inference'
process.env.LLM_MODE = 'live'
process.env.LLM_PROVIDER = 'vllm'
process.env.ALLOW_PAID_LLM = 'true'
process.env.MONETIZATION_ENABLED = 'false'
const pg = installPgMem()
const { POST } = require('../app/api/game-presence/route.ts')
const { RunpodLifecycle, RUNPOD_IDLE_MS } = require('../lib/runpod-lifecycle.ts')
const { saveSession, deleteSession } = require('../lib/session-store.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { DEFAULT_ADVENTURE_ID } = require('../lib/adventure-map.ts')
const { DEFAULT_CHARACTER_ID } = require('../lib/character-registry.ts')
const { __resetRateLimitForTests } = require('../lib/rate-limit.ts')
test.after(() => pg.restore())
let time, calls, manager
test.beforeEach(t => {
  __resetRateLimitForTests()
  time = 0; calls = []
  manager = new RunpodLifecycle({ setActive: async value => { calls.push(value) },
    isReady: async () => true, isDrained: async () => true }, () => time)
  globalThis.aiDmRunpodLifecycle = manager
  t.mock.method(globalThis, 'fetch', () => { assert.fail('No real network allowed') })
})
test.afterEach(() => { manager.stopTimer(); delete globalThis.aiDmRunpodLifecycle })
function body(overrides = {}) {
  return { clientId: 'a-valid-presence-id', sessionId: 'presence-test-session', adventureId: DEFAULT_ADVENTURE_ID,
    characterId: DEFAULT_CHARACTER_ID, sequence: 1, present: true, ...overrides }
}
function request(value, headers = {}) {
  return new Request('http://localhost/api/game-presence', { method: 'POST',
    headers: { 'content-type': 'application/json', ...headers }, body: typeof value === 'string' ? value : JSON.stringify(value) })
}

test('joining starts the shared worker without creating a game or charging a message; leaving starts the grace', async () => {
  const response = await POST(request(body()))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).ready, true)
  assert.deepEqual(calls, [true])
  assert.equal((await POST(request(body({ sequence: 2, present: false })))).status, 200)
  time = RUNPOD_IDLE_MS
  await manager.reconcile()
  assert.deepEqual(calls, [true, false])
})

test('polling an open tab allows sleep and only an explicit wake restarts capacity', async () => {
  await POST(request(body()))
  for (let sequence = 2; sequence <= 22; sequence++) {
    time += 30000
    assert.equal((await POST(request(body({ sequence })))).status, 200)
  }
  assert.deepEqual(calls, [true, false])
  const response = await POST(request(body({ sequence: 23, wake: true })))
  assert.equal((await response.json()).ready, true)
  assert.deepEqual(calls, [true, false, true])
})

test('a different session owner cannot start or stop paid capacity', async t => {
  await saveSession('presence-private', { gameState: buildInitialGameState(DEFAULT_ADVENTURE_ID, DEFAULT_CHARACTER_ID),
    history: [], ownerId: 'user:another-user', adventureId: DEFAULT_ADVENTURE_ID, characterId: DEFAULT_CHARACTER_ID })
  t.after(() => deleteSession('presence-private'))
  for (const present of [true, false]) assert.equal((await POST(request(body({ sessionId: 'presence-private', present })))).status, 403)
  assert.deepEqual(calls, [])
})

test('invalid, oversized, cross-origin and unavailable-adventure requests cannot start capacity', async () => {
  assert.equal((await POST(request('{'))).status, 400)
  assert.equal((await POST(request(body({ sequence: -1 })))).status, 400)
  assert.equal((await POST(request(body({ present: 'true' })))).status, 400)
  assert.equal((await POST(request('x'.repeat(2001)))).status, 413)
  assert.equal((await POST(request(body(), { origin: 'https://untrusted.example' }))).status, 403)
  assert.equal((await POST(request(body({ adventureId: 'missing-adventure' })))).status, 403)
  assert.deepEqual(calls, [])
})

test('mock and disabled configurations have no network or capacity effects', async () => {
  process.env.LLM_MODE = 'mock'
  try {
    const response = await POST(request(body()))
    assert.deepEqual(await response.json(), { enabled: false, ready: true, state: 'ready' })
    assert.deepEqual(calls, [])
  } finally { process.env.LLM_MODE = 'live' }
})
