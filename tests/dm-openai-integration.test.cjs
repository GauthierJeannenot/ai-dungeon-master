const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')
const wire = require('./helpers/openai-wire.cjs')
Object.assign(process.env, { LLM_PROVIDER: 'openai', LLM_MODE: 'live', ALLOW_PAID_LLM: 'true',
  MONETIZATION_ENABLED: 'false', RUNPOD_AUTO_MANAGE: 'true', // stale GPU config must be inert
  OPENAI_BASE_URL: 'https://openai.simulated/v1', OPENAI_API_KEY: 'simulated-key',
  OPENAI_CONTEXT_WINDOW_TOKENS: '32768', DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_LEVEL: 'error' })
for (const name of ['DM_MODEL', 'DM_COMPRESS_MODEL']) delete process.env[name]
const pg = installPgMem()
const { POST } = require('../app/api/dm/route.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
const { loadSession, deleteSession, saveSession } = require('../lib/session-store.ts')
test.after(() => pg.restore())
async function send(sessionId, body) {
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, ...body }) }))
  return { response, data: await response.json() }
}
function session(t, label) {
  const id = `openai-${label}-${process.pid}`
  t.after(async () => { await closeMCPClient(id); await deleteSession(id) })
  return id
}

test('OpenAI resolves a real MCP refusal, exact retry, narration and trace without GPU calls', async t => {
  const id = session(t, 'integration')
  assert.equal(require('../lib/runpod-config.ts').getRunpodConfig(), null)
  let round = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer simulated-key')
    const body = JSON.parse(options.body)
    assert.equal(body.model, 'gpt-5.4-mini')
    assert.equal(body.chat_template_kwargs, undefined)
    if (url.endsWith('/responses/input_tokens')) return Response.json({ input_tokens: 100 })
    assert.equal(url, 'https://openai.simulated/v1/responses')
    assert.equal(body.store, false)
    assert.equal(body.parallel_tool_calls, false)
    assert.equal(body.tool_choice, 'auto')
    assert.ok(body.tools.every(tool => tool.name !== 'decide_action'))
    const turn = ++round
    if (turn < 3) {
      if (turn === 2) {
        assert.equal(body.input.at(-1).call_id, 'call-1')
        assert.equal(JSON.parse(body.input.at(-1).output).is_error, true)
        assert.ok(!JSON.stringify(body.input).includes('Réussite inventée'))
      }
      return wire.response([wire.text('Réussite inventée avant résolution.'),
        wire.call('move_token', { tokenId: 'player', toCell: { x: turn === 1 ? 999 : 11, y: 13 } }, `call-${turn}`)],
        { input_tokens: 100, output_tokens: 20 })
    }
    assert.equal(turn, 3)
    const result = body.input.at(-1)
    assert.equal(result.type, 'function_call_output')
    assert.equal(result.call_id, 'call-2')
    assert.equal(JSON.parse(result.output).success, true)
    assert.ok(JSON.parse(result.output).narrationFacts.some(fact => /\(11,13\)/.test(fact)))
    return wire.response([wire.text('Tu arrives à destination.')], { input_tokens: 100, output_tokens: 20 })
  })
  const { response, data } = await send(id, { message: 'Je vais en (11,13).' })
  assert.equal(response.status, 200, JSON.stringify(data))
  assert.equal(round, 3)
  assert.equal(data.narrative, 'Tu arrives à destination.')
  assert.deepEqual(data.newGameState.player.position, { x: 11, y: 13 })
  assert.equal(data.usage.llm.calls, 3)
  assert.equal((await loadSession(id)).history.at(-1).content, data.narrative)
  const { dbQuery } = require('../lib/db.ts')
  const trace = (await dbQuery('SELECT * FROM training_turns WHERE session_id=$1', [id])).rows[0]
  assert.deepEqual(trace.outcome.body, data)
  const events = (await dbQuery('SELECT kind,payload FROM training_events WHERE turn_id=$1 ORDER BY sequence', [trace.id])).rows
  const calls = events.filter(event => event.kind === 'llm.request')
  assert.equal(calls.length, 3)
  assert.ok(calls.every(event => event.payload.mode === 'live' && event.payload.provider === 'openai'))
  assert.ok(calls[0].payload.params.tools.some(tool => tool.name === 'move_token' && tool.input_schema))
  for (const kind of ['llm.http.request', 'llm.http.response']) {
    assert.equal(events.filter(event => event.kind === kind && event.payload.operation === 'generation').length, 3)
  }
  assert.ok(events.some(event => event.kind === 'mcp.request' && event.payload.name === 'move_token'))
  assert.ok(events.some(event => event.kind === 'mcp.response'))
  assert.ok(!JSON.stringify(events).includes('simulated-key'))
})

test('an OpenAI failure returns a server error without invented narration', async t => {
  const id = session(t, 'failure')
  t.mock.method(globalThis, 'fetch', async () => new Response('private provider error', { status: 500 }))
  const { response, data } = await send(id, { message: 'Bonjour.' })
  assert.equal(response.status, 500)
  assert.equal(data.newGameState, undefined)
  assert.ok(!JSON.stringify(data).includes('private provider error'))
})

test('a narration overflow returns the checkpointed movement and request id', async t => {
  const id = session(t, 'overflow'), clientRequestId = 'move-before-overflow'
  let round = 0
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/responses/input_tokens')) return Response.json({ input_tokens: 100 })
    assert.equal(url, 'https://openai.simulated/v1/responses')
    if (++round === 2) return Response.json({ error: { code: 'context_length_exceeded' } }, { status: 400 })
    return wire.response([wire.call('move_token', { tokenId: 'player', toCell: { x: 11, y: 13 } })])
  })
  const { response, data } = await send(id, { clientRequestId, message: 'Je vais en (11,13).' })
  assert.equal(response.status, 500)
  assert.equal(data.error, 'OpenAI : capacité de contexte du modèle dépassée.')
  assert.deepEqual(data.newGameState.player.position, { x: 11, y: 13 })
  assert.ok(data.newGameState.handledRequestIds.includes(clientRequestId))
  const saved = await loadSession(id)
  assert.deepEqual(data.newGameState, saved.gameState)
  assert.deepEqual(saved.history, [])
  assert.equal(round, 2)
})

for (const pressureAt of ['before_turn', 'after_tool']) test(`OpenAI context pressure ${pressureAt} preserves the active transcript and persisted summary`, async t => {
  const id = session(t, `budget-${pressureAt}`)
  const history = [{ role: 'player', content: 'OLDEST_EXCHANGE: question.' }, { role: 'dm', content: 'Ancienne réponse.' },
    { role: 'player', content: 'RECENT_EXCHANGE: promesse.' }, { role: 'dm', content: 'Promesse établie.' }]
  await saveSession(id, { gameState: require('../lib/initial-game-state.ts').buildInitialGameState(), history })
  let summaries = 0, moving = true, frozenUser, resolvedSuffix
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body), input = body.input
    if (url.endsWith('/responses/input_tokens')) {
      const suffix = input.slice(-3)
      const pressured = moving && (pressureAt === 'before_turn' || suffix.at(-1).type === 'function_call_output')
        && JSON.stringify(input).includes('OLDEST_EXCHANGE')
      if (pressured && pressureAt === 'after_tool') resolvedSuffix = JSON.stringify(suffix)
      return Response.json({ input_tokens: pressured ? 30000 : 100 })
    }
    assert.equal(url, 'https://openai.simulated/v1/responses')
    if (body.max_output_tokens === 300) {
      summaries++
      assert.match(input[0].content, /OLDEST_EXCHANGE/)
      assert.doesNotMatch(input[0].content, /RECENT_EXCHANGE|CURRENT_MOVE|narrationFacts|call_id/)
      return wire.response([wire.text('Résumé des anciens événements.')])
    }
    if (moving && input.at(-1).type !== 'function_call_output') {
      frozenUser = JSON.stringify(input.at(-1))
      return wire.response([wire.call('move_token', { tokenId: 'player', toCell: { x: 11, y: 13 } }, 'budget-move')])
    }
    if (moving) {
      assert.equal(summaries, 1)
      assert.equal(JSON.stringify(input.at(-3)), frozenUser)
      if (pressureAt === 'after_tool') assert.equal(JSON.stringify(input.slice(-3)), resolvedSuffix)
      assert.match(JSON.stringify(input), /RECENT_EXCHANGE/)
      assert.doesNotMatch(JSON.stringify(input), /OLDEST_EXCHANGE/)
    }
    return wire.response([wire.text('Tu observes les environs.')])
  })
  const first = await send(id, { message: 'CURRENT_MOVE : je vais en (11,13).', history })
  assert.equal(first.response.status, 200, JSON.stringify(first.data))
  assert.equal(first.data.summaryContext, 'Résumé des anciens événements.')
  assert.deepEqual(first.data.newGameState.player.position, { x: 11, y: 13 })
  let saved = await loadSession(id)
  assert.equal(saved.history.length, 4)
  assert.equal(saved.history[0].content, history[2].content)
  moving = false
  const next = await send(id, { message: 'Je regarde.', history })
  assert.equal(next.response.status, 200, JSON.stringify(next.data))
  saved = await loadSession(id)
  assert.equal(saved.history.length, 6)
  assert.equal(summaries, 1)
  assert.doesNotMatch(JSON.stringify(saved.history), /OLDEST_EXCHANGE/)
})
