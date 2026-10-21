const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

// Adaptateur live, HTTP simulé uniquement. Toute destination inattendue échoue.
process.env.LLM_PROVIDER = 'vllm'
process.env.LLM_MODE = 'live'
process.env.ALLOW_PAID_LLM = 'true'
process.env.MONETIZATION_ENABLED = 'false'
process.env.RUNPOD_AUTO_MANAGE = 'false'
process.env.LLM_PLANNER_ENABLED = 'true'
process.env.VLLM_BASE_URL = 'https://simulated-pod.example/v1'
process.env.VLLM_API_KEY = 'simulated-key'
process.env.DM_RATE_LIMIT_PER_MINUTE = '0'
for (const name of ['DM_MODEL', 'DM_PLANNER_MODEL', 'DM_COMPRESS_MODEL', 'ANTHROPIC_API_KEY']) delete process.env[name]
const pg = installPgMem()
const { POST } = require('../app/api/dm/route.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
const { loadSession, deleteSession } = require('../lib/session-store.ts')
test.after(() => pg.restore())

test('Qwen Chat Completions completes a planned action with a real MCP refusal, retry and final narration', async t => {
  let generationReserved = false
  const lifecycle = require('../lib/runpod-lifecycle.ts')
  const reserve = t.mock.method(lifecycle, 'beginRunpodGeneration', async () => {
    generationReserved = true
    return () => { generationReserved = false }
  })
  const sessionId = `vllm-integration-${process.pid}`
  t.after(async () => { await closeMCPClient(sessionId); await deleteSession(sessionId) })
  let round = 0
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(generationReserved, true, 'The whole turn must retain the worker reservation')
    assert.equal(url, 'https://simulated-pod.example/v1/chat/completions')
    assert.equal(options.headers.Authorization, 'Bearer simulated-key')
    const body = JSON.parse(options.body)
    assert.equal(body.model, 'Qwen/Qwen3.6-27B')
    assert.equal(body.chat_template_kwargs.enable_thinking, false)
    const turn = ++round
    let name, input
    if (turn === 1) {
      assert.equal(body.tool_choice.function.name, 'decide_action')
      name = 'decide_action'
      input = { requiresMechanic: true, confidence: 'high', tool: 'move_token', sceneMarkers: [], reason: 'Move' }
    } else if (turn === 2 || turn === 3) {
      assert.equal(body.tool_choice.function.name, 'move_token')
      if (turn === 3) {
        const result = body.messages.at(-1)
        assert.equal(result.role, 'tool')
        assert.equal(result.tool_call_id, 'call-2')
        assert.equal(JSON.parse(result.content).is_error, true)
        assert.equal(JSON.stringify(body.messages).includes('Réussite inventée'), false)
      }
      name = 'move_token'
      input = { tokenId: 'player', toCell: { x: turn === 2 ? 999 : 11, y: 13 } }
    } else {
      assert.equal(turn, 4)
      assert.equal(body.tool_choice, 'auto')
      assert.equal(body.messages.at(-1).tool_call_id, 'call-3')
      assert.equal(JSON.parse(body.messages.at(-1).content).success, true)
    }
    return Response.json({ choices: [{ finish_reason: name ? 'tool_calls' : 'stop', message: {
      role: 'assistant', content: name ? 'Réussite inventée avant résolution.' : 'Tu arrives à destination.',
      ...(name ? { tool_calls: [{ id: `call-${turn}`, type: 'function', function: { name, arguments: JSON.stringify(input) } }] } : {}),
    } }], usage: { prompt_tokens: 100, completion_tokens: 20 } })
  })
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, message: 'je vais en (11,13)' }) }))
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  assert.equal(fetch.mock.callCount(), 4)
  assert.equal(data.narrative, 'Tu arrives à destination.')
  assert.deepEqual(data.newGameState.player.position, { x: 11, y: 13 })
  assert.equal(data.usage.llm.calls, 4)
  assert.equal(reserve.mock.callCount(), 1)
  assert.equal(generationReserved, false)
  assert.equal((await loadSession(sessionId)).history.at(-1).content, data.narrative)
})

test('DM releases its worker reservation on a provider error', async t => {
  const sessionId = `vllm-error-${process.pid}`
  t.after(async () => { await closeMCPClient(sessionId); await deleteSession(sessionId) })
  let released = 0
  const lifecycle = require('../lib/runpod-lifecycle.ts')
  t.mock.method(lifecycle, 'beginRunpodGeneration', async () => () => { released++ })
  t.mock.method(globalThis, 'fetch', async () => new Response('Provider error', { status: 500 }))
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, message: 'Bonjour' }) }))
  assert.equal(response.status, 500)
  assert.equal(released, 1)
})
