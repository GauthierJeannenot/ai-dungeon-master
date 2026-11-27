const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', MONETIZATION_ENABLED: 'false', DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false' })
const pg = require('./helpers/pg-mem.cjs').installPgMem()
const mcp = require('../lib/mcp-client.ts')
const llm = require('../lib/dm/llm.ts')
const { POST } = require('../app/api/dm/route.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
test.after(() => pg.restore())

for (const failure of [
  { error: 'Invalid structured social event saved-request.', code: 'SOCIAL_INTERACTION_STATE_MISMATCH' },
  { isError: true, content: [] },
  'MCP refused the snapshot',
  null,
]) test(`a failed state replacement returns 503 and leaves the entire stored session intact: ${JSON.stringify(failure)}`, async t => {
  const state = buildInitialGameState(), sessionId = `sync-refusal-${process.pid}-${Math.random()}`
  await saveSession(sessionId, { gameState: state, history: [{ role: 'user', content: 'Une histoire déjà sauvegardée.' }], summaryContext: 'Contexte à conserver.', adventureId: state.adventureId, characterId: state.characterId })
  t.after(() => deleteSession(sessionId))
  const before = await loadSession(sessionId), calls = []
  t.mock.method(mcp, 'prepareDevelopmentMCPClient', async () => {})
  t.mock.method(mcp, 'callMCPTool', async (name) => { calls.push(name); assert.equal(name, 'replace_game_state'); return failure })
  t.mock.method(mcp, 'listMCPTools', async () => assert.fail('No tool catalogue after a failed sync'))
  t.mock.method(llm, 'createLlmMessage', async () => assert.fail('No LLM call after a failed sync'))
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, message: 'Je poursuis la conversation.' }) }))
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'Serveur MCP non disponible.' })
  assert.deepEqual(calls, ['replace_game_state'], 'Never fall back to the fresh engine state')
  assert.deepEqual(await loadSession(sessionId), before, 'State, history, summary and update timestamp must remain untouched')
})

test('a failed initial state read also stops before replacement, narration or persistence', async t => {
  const sessionId = `sync-initial-refusal-${process.pid}`, calls = []
  t.mock.method(mcp, 'prepareDevelopmentMCPClient', async () => {})
  t.mock.method(mcp, 'callMCPTool', async name => { calls.push(name); assert.equal(name, 'get_game_state'); return { error: 'Engine unavailable' } })
  t.mock.method(llm, 'createLlmMessage', async () => assert.fail('No LLM call after a failed initial read'))
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, message: 'Je commence.' }) }))
  assert.equal(response.status, 503)
  assert.deepEqual(calls, ['get_game_state'])
  assert.equal(await loadSession(sessionId), null)
})
