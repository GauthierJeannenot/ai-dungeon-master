const test = require('node:test')
const assert = require('node:assert/strict')
const wire = require('./helpers/openai-wire.cjs')
process.env.MONETIZATION_ENABLED = 'false'
process.env.LLM_MODE = 'live'
process.env.LLM_PROVIDER = 'openai'
process.env.ALLOW_PAID_LLM = 'true'
process.env.RUNPOD_AUTO_MANAGE = 'false'
process.env.OPENAI_BASE_URL = 'https://simulated.example/v1'
process.env.OPENAI_API_KEY = 'never-export-this-openai-key'
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { dbQuery } = require('../lib/db.ts')
const { withRecording, startRecording, finishRecording } = require('../lib/training-recorder.ts')
const { trainingFetch } = require('../lib/training-fetch.ts')
const { createOpenAIMessage, measureOpenAIContext } = require('../lib/dm/openai.ts')
const { createLlmMessage, MODEL } = require('../lib/dm/llm.ts')
test.after(() => pg.restore())

test('OpenAI records the exact serialized requests and raw responses without authentication headers', async t => {
  let wireBody
  const responseBody = JSON.stringify({ id: 'resp-test', status: 'completed', output: [wire.text('Tu avances.\nÉcho.')], usage: { input_tokens: 10, output_tokens: 5 } })
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const request = new Request(input, init)
    assert.equal(request.headers.get('authorization'), `Bearer ${process.env.OPENAI_API_KEY}`)
    wireBody = await request.text()
    return new Response(responseBody, { headers: { 'content-type': 'application/json', 'request-id': 'req-test', 'set-cookie': 'private-cookie' } })
  })
  const params = { model: MODEL, max_tokens: 100, system: [{ type: 'text', text: 'Règles exactes\n'.repeat(300) }],
    messages: [{ role: 'user', content: 'Bonjour.' }] }
  await withRecording(async () => {
    await startRecording('http-openai-normalized', { message: 'Bonjour.' })
    await createLlmMessage(params, { requestId: 'test', inputMode: 'text', operation: 'dm.turn', usageLog: [] })
    await finishRecording(Response.json({ narrative: 'Tu avances.' }))
  })
  const events = (await dbQuery('SELECT kind,payload FROM training_events ORDER BY sequence')).rows
  assert.deepEqual(events.map(e => e.kind), ['llm.request', 'llm.http.request', 'llm.http.response', 'llm.response'])
  assert.deepEqual(events[0].payload.params, params)
  assert.equal(events[1].payload.body, wireBody)
  assert.equal(JSON.parse(wireBody).instructions, params.system[0].text)
  assert.equal(events[2].payload.body, responseBody)
  assert.equal(events[2].payload.headers['request-id'], 'req-test')
  assert.equal(events[1].payload.id, events[2].payload.id)
  assert.ok(!JSON.stringify(events).includes(process.env.OPENAI_API_KEY))
  assert.ok(!JSON.stringify(events).includes('private-cookie'))
})

test('OpenAI translation, tokenization, HTTP failure bodies and network errors all survive in the trace', async t => {
  let round = 0, wireBody
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    if (String(input).endsWith('/responses/input_tokens')) return Response.json({ input_tokens: 100 })
    if (++round === 1) {
      wireBody = init.body
      return Response.json({ status: 'completed', output: [wire.text('Tu regardes.')], extra_raw_field: 'kept' })
    }
    if (round === 2) return new Response('<html>provider failed</html>', { status: 500 })
    throw new Error('connection lost')
  })
  await withRecording(async () => {
    await startRecording('http-openai', { message: 'Regarde.' })
    const params = { model: MODEL, max_tokens: 100, system: [{ type: 'text', text: 'Système A' }, { type: 'text', text: 'Système B' }],
      messages: [{ role: 'user', content: 'Regarde.' }] }
    await measureOpenAIContext(params)
    await createOpenAIMessage(params)
    await assert.rejects(createOpenAIMessage(params), /HTTP 500/)
    await assert.rejects(trainingFetch('openai', 'https://simulated.example/v1/responses?api_key=private-query',
      { method: 'POST', headers: { authorization: 'Bearer private-header' }, body: '{}' }), /connection lost/)
  })
  const turn = (await dbQuery('SELECT id FROM training_turns WHERE session_id=$1', ['http-openai'])).rows[0]
  const events = (await dbQuery('SELECT kind,payload FROM training_events WHERE turn_id=$1 ORDER BY sequence', [turn.id])).rows
  assert.equal(events[0].payload.operation, 'tokenize')
  assert.equal(events[2].payload.body, wireBody)
  assert.equal(JSON.parse(wireBody).instructions, 'Système A\n\nSystème B')
  assert.equal(JSON.parse(events[3].payload.body).extra_raw_field, 'kept')
  assert.equal(events[5].payload.body, '<html>provider failed</html>')
  assert.equal(events[5].payload.status, 500)
  assert.equal(events.at(-1).kind, 'llm.http.error')
  assert.equal(events.at(-1).payload.message, 'connection lost')
  const serialized = JSON.stringify(events)
  for (const secret of ['private-query', 'private-header', process.env.OPENAI_API_KEY]) assert.ok(!serialized.includes(secret))
})

test('recording a Request object leaves its original body readable by the provider', async t => {
  const body = '{ "system": "écho exact" }'
  t.mock.method(globalThis, 'fetch', async input => {
    assert.equal(input.bodyUsed, false)
    assert.equal(await input.text(), body)
    return Response.json({ ok: true })
  })
  await withRecording(async () => {
    await startRecording('request-object', {})
    const request = new Request('https://simulated.example/messages', { method: 'POST', body })
    assert.equal((await trainingFetch('openai', request)).status, 200)
  })
  const turn = (await dbQuery('SELECT id FROM training_turns WHERE session_id=$1', ['request-object'])).rows[0]
  const event = (await dbQuery('SELECT payload FROM training_events WHERE turn_id=$1 AND kind=$2', [turn.id, 'llm.http.request'])).rows[0]
  assert.equal(event.payload.body, body)
})
