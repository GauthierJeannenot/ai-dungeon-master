const test = require('node:test')
const assert = require('node:assert/strict')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
test.after(restore)
const wire = require('./helpers/openai-wire.cjs')
const { buildOpenAIInput, buildOpenAIRequest, parseOpenAIResponse, createOpenAIMessage, measureOpenAIContext } = require('../lib/dm/openai.ts')
const { getOpenAIConfig, getOpenAIContextWindow } = require('../lib/dm/llm-config.ts')
const { logLlmUsage } = require('../lib/llm-usage.ts')
const tool = { name: 'move_token', description: 'Explicit movement', input_schema: { type: 'object',
  properties: { tokenId: { type: 'string' }, toCell: { type: 'object' } }, required: ['tokenId', 'toCell'] } }
const params = { model: 'gpt-5.4-mini', max_tokens: 1024, system: [{ type: 'text', text: 'Règles.' }],
  messages: [{ role: 'user', content: 'Je bouge.' }], tools: [tool] }
const result = (output, extra = {}) => ({ id: 'resp-1', status: 'completed', output, ...extra })
function env(t, values) {
  for (const [name, value] of Object.entries(values)) {
    const old = process.env[name]
    if (value === undefined) delete process.env[name]; else process.env[name] = value
    t.after(() => { if (old === undefined) delete process.env[name]; else process.env[name] = old })
  }
}

test('Responses preserves tool schemas, exact arguments, error results and encrypted reasoning', () => {
  const reasoning = { id: 'rs-1', type: 'reasoning', summary: [], encrypted_content: 'opaque-continuation' }
  const input = { tokenId: 'player', toCell: { x: 2, y: 3 } }
  const parsed = parseOpenAIResponse(result([reasoning, wire.text('Prose avant outil.'), wire.call(tool.name, input)]), params)
  const next = { ...params, tool_choice: { type: 'tool', name: tool.name }, messages: [...params.messages,
    { role: 'assistant', content: parsed.content.filter(block => block.type !== 'text') },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', is_error: true, content: 'Hors portée.' }] }] }
  const before = JSON.stringify(next), body = buildOpenAIRequest(next)
  assert.equal(body.store, false)
  assert.equal(body.stream, false)
  assert.equal(body.max_output_tokens, 1024)
  assert.equal(body.truncation, 'disabled')
  assert.deepEqual(body.tools[0].parameters, tool.input_schema)
  assert.equal(body.tools[0].strict, false, 'do not rewrite optional MCP arguments for strict mode')
  assert.deepEqual(body.tool_choice, { type: 'function', name: tool.name })
  assert.equal(body.parallel_tool_calls, false)
  assert.deepEqual(body.input.slice(1), [reasoning, { type: 'function_call', call_id: 'call-1', name: tool.name,
    arguments: JSON.stringify(input) }, { type: 'function_call_output', call_id: 'call-1', output: JSON.stringify({ is_error: true, content: 'Hors portée.' }) }])
  assert.equal(JSON.stringify(next), before)
  assert.ok(!JSON.stringify(body.input).includes('Prose avant outil'))
})

test('Responses rejects incomplete output, refusals, invalid/unknown/parallel calls and tool choice violations', () => {
  const good = wire.call(tool.name, { tokenId: 'player', toCell: { x: 1, y: 1 } })
  const bad = [null, {}, result([]), result([good], { status: 'incomplete' }), result([good], { status: 'failed' }),
    result([{ ...good, arguments: 'broken' }]), result([{ ...good, arguments: '[]' }]),
    result([{ ...good, name: 'unexposed_tool' }]), result([good, { ...good, call_id: 'call-2' }]), result([good, good]),
    result([{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'No' }] }])]
  for (const value of bad) assert.throws(() => parseOpenAIResponse(value, params))
  assert.throws(() => parseOpenAIResponse(result([good]), { ...params, tool_choice: { type: 'none' } }))
  for (const choice of [{ type: 'any' }, { type: 'tool', name: tool.name }]) {
    assert.throws(() => parseOpenAIResponse(result([wire.text('Sans outil.')]), { ...params, tool_choice: choice }))
  }
  assert.equal(buildOpenAIRequest({ ...params, tool_choice: { type: 'any' } }).tool_choice, 'required')
  assert.throws(() => buildOpenAIRequest({ ...params, stop_sequences: ['STOP'] }), /stop_sequences/)
})

test('Responses measures the same complete input without generation or truncation', async t => {
  env(t, { OPENAI_API_KEY: 'private-key', OPENAI_BASE_URL: undefined, OPENAI_CONTEXT_WINDOW_TOKENS: undefined })
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses/input_tokens')
    assert.equal(options.headers.Authorization, 'Bearer private-key')
    assert.equal(options.redirect, 'error')
    assert.deepEqual(JSON.parse(options.body), buildOpenAIInput(params))
    return Response.json({ input_tokens: 30100 })
  })
  assert.deepEqual(await measureOpenAIContext(params), { inputTokens: 30100, contextWindow: 400000 })
})

test('OpenAI transport sanitizes errors and fails closed when token counting is unavailable', async t => {
  env(t, { OPENAI_API_KEY: 'secret', OPENAI_BASE_URL: 'https://openai.simulated/v1' })
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('private prompt and secret', { status: 429 }))
  await assert.rejects(createOpenAIMessage(params), { message: 'OpenAI : erreur HTTP 429.' })
  await assert.rejects(measureOpenAIContext(params), /HTTP 429/)
  for (const input_tokens of [-1, 1.5, '10', undefined]) {
    fetch.mock.mockImplementation(async () => Response.json({ input_tokens }))
    await assert.rejects(measureOpenAIContext(params), /mesure du contexte invalide/)
  }
  fetch.mock.mockImplementation(async () => new Response('not JSON'))
  await assert.rejects(createOpenAIMessage(params), /non JSON/)
  fetch.mock.mockImplementation(async () => { throw new Error('private endpoint') })
  await assert.rejects(createOpenAIMessage(params), { message: 'OpenAI indisponible ou délai de réponse dépassé.' })
  env(t, { OPENAI_TIMEOUT_MS: '10' })
  fetch.mock.mockImplementation(async (_url, options) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(Error('test timeout')), 1000)
    options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal.reason) }, { once: true })
  }))
  await assert.rejects(createOpenAIMessage(params), /délai/)
})

test('OpenAI validates server settings and requires an explicit window for model overrides', t => {
  env(t, { OPENAI_API_KEY: undefined })
  assert.throws(getOpenAIConfig, /OPENAI_API_KEY/)
  process.env.OPENAI_API_KEY = 'test'
  env(t, { OPENAI_BASE_URL: 'https://user:secret@example.com/v1' })
  assert.throws(getOpenAIConfig, error => /OPENAI_BASE_URL/.test(error.message) && !error.message.includes('secret'))
  env(t, { OPENAI_BASE_URL: undefined, OPENAI_TIMEOUT_MS: '-1', OPENAI_CONTEXT_WINDOW_TOKENS: undefined })
  assert.throws(getOpenAIConfig, /OPENAI_TIMEOUT_MS/)
  assert.throws(() => getOpenAIContextWindow('custom-model'), /OPENAI_CONTEXT_WINDOW_TOKENS/)
  process.env.OPENAI_CONTEXT_WINDOW_TOKENS = '128000'
  assert.equal(getOpenAIContextWindow('custom-model'), 128000)
})

test('OpenAI usage separates cached tokens and configurable cache pricing', t => {
  env(t, { OPENAI_INPUT_USD_PER_MTOK: '1', OPENAI_CACHED_INPUT_USD_PER_MTOK: '0.1', OPENAI_OUTPUT_USD_PER_MTOK: '2' })
  const message = parseOpenAIResponse(result([wire.text('Tu avances.')],
    { usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 40 }, output_tokens: 20 } }), params)
  assert.deepEqual(message.usage, { input_tokens: 60, cache_read_input_tokens: 40, output_tokens: 20 })
  const usage = logLlmUsage({ requestId: 'test', operation: 'dm.turn', model: params.model, provider: 'openai', usage: message.usage })
  assert.equal(usage.totalInputTokens, 100)
  assert.equal(usage.estimatedCostUsd, 0.000104)
})
