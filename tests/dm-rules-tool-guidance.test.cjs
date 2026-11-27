const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const llm = require('../lib/dm/llm.ts')
const { POST } = require('../app/api/dm/route.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
test.after(() => pg.restore())

test('a model source read loads linked specialist schemas and procedures without calling gameplay tools', async t => {
  const sessionId = `rules-guidance-${process.pid}-${Date.now()}`
  const state = buildInitialGameState('sarah-of-yellowcrest-manor', 'fighter')
  state.worldTimeSeconds = 0
  await saveSession(sessionId, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  t.after(async () => { await closeMCPClient(sessionId); await deleteSession(sessionId) })
  let iteration = 0
  const call = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `rule-${iteration}`, name, input }] })
  t.mock.method(llm, 'createLlmMessage', async params => {
    iteration++
    const names = params.tools.map(tool => tool.name)
    if (iteration === 1) {
      assert.ok(!names.includes('begin_rest'))
      return call('consult_rules', { book: 'phb-2014', query: 'long rest' })
    }
    const receipt = JSON.parse(params.messages.at(-1).content.at(-1).content)
    if (iteration === 2) {
      assert.ok(!names.includes('begin_rest'), 'search does not load schemas or execute a rest')
      assert.ok(receipt.results[0].engineGuidance.domains.includes('rests'))
      return call('consult_rules', { sectionId: receipt.results[0].sectionId })
    }
    assert.equal(iteration, 3)
    assert.ok(names.includes('begin_rest'), JSON.stringify({ guidance: receipt.engineGuidance, names }))
    assert.ok(!names.includes('resolve_player_attack'), 'exploration restriction is preserved')
    assert.ok(receipt.engineGuidance.procedures.some(guide => guide.id === 'rests-1'))
    assert.match(receipt.text, /Long Rest/)
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Tu examines les conditions du repos sans te reposer.' }] }
  })
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, message: 'Explique-moi le repos long sans commencer de repos.', adventureId: state.adventureId, characterId: state.characterId }) }))
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  assert.deepEqual(data.toolsUsed, ['consult_rules'])
  assert.equal(iteration, 3, 'search and passage reads precede narration')
  const after = (await loadSession(sessionId)).gameState
  for (const key of ['player', 'dmTools', 'worldTimeSeconds']) assert.deepEqual(after[key], JSON.parse(JSON.stringify(state))[key])
})
