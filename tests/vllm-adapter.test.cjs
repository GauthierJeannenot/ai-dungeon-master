const assert = require('node:assert/strict')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
const { buildVllmRequest, parseVllmResponse, createVllmMessage } = require('../lib/dm/vllm.ts')
const { logAnthropicUsage } = require('../lib/anthropic-usage.ts')
test.after(restore)

const tool = { name: 'move_token', description: 'Move', input_schema: {
  type: 'object', properties: { tokenId: { type: 'string' } }, required: ['tokenId'],
} }
const params = { model: 'Qwen/Qwen3.6-27B', max_tokens: 1024,
  system: [{ type: 'text', text: 'Rules', cache_control: { type: 'ephemeral', ttl: '1h' } }],
  messages: [{ role: 'user', content: 'Move' }], tools: [tool] }
function completion(overrides = {}) {
  return { id: 'chat-test', choices: [{ finish_reason: 'tool_calls', message: {
    role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function',
      function: { name: 'move_token', arguments: '{"tokenId":"player"}' } }], ...overrides,
  } }], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 40 } } }
}
function env(t, values) {
  const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  t.after(() => { for (const [key, value] of Object.entries(before)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  } })
}

test('vLLM converts cached Messages, forced tools, results and errors without altering the source', () => {
  const input = { ...params, output_config: { effort: 'medium' }, tool_choice: { type: 'tool', name: tool.name },
    messages: [params.messages[0], { role: 'assistant', content: [{ type: 'tool_use', id: 'call-1', name: tool.name, input: { tokenId: 'player' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: '{"error":"blocked"}', is_error: true,
        cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'Retry' }] }] }
  const before = JSON.stringify(input)
  const body = buildVllmRequest(input)
  assert.equal(JSON.stringify(input), before)
  assert.deepEqual(body.tool_choice, { type: 'function', function: { name: tool.name } })
  assert.equal(body.parallel_tool_calls, false)
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false })
  assert.deepEqual(body.messages.map(m => m.role), ['system', 'user', 'assistant', 'tool', 'user'])
  assert.equal(body.messages[2].tool_calls[0].function.arguments, '{"tokenId":"player"}')
  assert.deepEqual(JSON.parse(body.messages[3].content), { is_error: true, content: '{"error":"blocked"}' })
  assert.equal(body.messages[3].tool_call_id, 'call-1')
  assert.equal(JSON.stringify(body).includes('cache_control'), false)
  assert.equal(JSON.stringify(body).includes('output_config'), false)
  assert.deepEqual(body.tools[0].function.parameters, tool.input_schema)
  for (const [type, expected] of [['any', 'required'], ['auto', 'auto'], ['none', 'none']]) {
    assert.equal(buildVllmRequest({ ...params, tool_choice: { type } }).tool_choice, expected)
  }
  assert.equal(buildVllmRequest({ ...params, tools: undefined }).tools, undefined)
})

test('vLLM preserves tool identities and token totals, and never exposes separate reasoning', () => {
  const result = parseVllmResponse(completion({ reasoning: 'private', reasoning_content: 'private' }), params)
  assert.equal(result.stop_reason, 'tool_use')
  assert.deepEqual(result.content, [{ type: 'tool_use', id: 'call-1', name: tool.name, input: { tokenId: 'player' }, caller: { type: 'direct' } }])
  assert.equal(result.usage.input_tokens, 60)
  assert.equal(result.usage.cache_read_input_tokens, 40)
  const text = completion({ content: 'Tu avances.', tool_calls: null })
  text.choices[0].finish_reason = 'stop'
  assert.equal(parseVllmResponse(text, params).stop_reason, 'end_turn')
})

test('vLLM refuses malformed, truncated, unknown, parallel and unfulfilled tool calls before execution', () => {
  for (const value of [null, {}, { choices: [] }]) assert.throws(() => parseVllmResponse(value, params))
  for (const args of ['{', 'null', '[]', '"player"']) {
    const value = completion()
    value.choices[0].message.tool_calls[0].function.arguments = args
    assert.throws(() => parseVllmResponse(value, params), /arguments/)
  }
  const unknown = completion()
  unknown.choices[0].message.tool_calls[0].function.name = 'replace_game_state'
  assert.throws(() => parseVllmResponse(unknown, params), /non exposé/)
  const parallel = completion()
  parallel.choices[0].message.tool_calls.push({ ...parallel.choices[0].message.tool_calls[0], id: 'call-2' })
  assert.throws(() => parseVllmResponse(parallel, params), /parallèles/)
  for (const reason of ['length', 'content_filter', 'stop']) {
    const value = completion()
    value.choices[0].finish_reason = reason
    assert.throws(() => parseVllmResponse(value, params))
  }
  const text = completion({ tool_calls: [], content: 'Success' })
  text.choices[0].finish_reason = 'stop'
  for (const choice of [{ type: 'any' }, { type: 'tool', name: tool.name }]) {
    assert.throws(() => parseVllmResponse(text, { ...params, tool_choice: choice }), /outil/)
  }
  assert.throws(() => parseVllmResponse(completion(), { ...params, tool_choice: { type: 'none' } }), /interdit/)
  text.choices[0].message.content = '<think>private</think>Success'
  assert.throws(() => parseVllmResponse(text, params), /raisonnement/)
})

test('vLLM transport sends bearer auth to /v1/chat/completions and sanitizes HTTP failures', async t => {
  env(t, { VLLM_BASE_URL: 'https://pod.example/v1/', VLLM_API_KEY: 'private-key', VLLM_TIMEOUT_MS: '1234' })
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://pod.example/v1/chat/completions')
    assert.equal(options.headers.Authorization, 'Bearer private-key')
    assert.equal(options.redirect, 'error')
    assert.equal(options.signal.aborted, false)
    assert.equal(JSON.parse(options.body).model, params.model)
    return Response.json(completion())
  })
  assert.equal((await createVllmMessage(params)).stop_reason, 'tool_use')
  fetch.mock.mockImplementation(async () => new Response('private-key and private prompt', { status: 401 }))
  await assert.rejects(createVllmMessage(params), { message: 'vLLM : erreur HTTP 401.' })
  fetch.mock.mockImplementation(async () => { throw new Error('secret URL') })
  await assert.rejects(createVllmMessage(params), { message: 'vLLM indisponible ou délai de réponse dépassé.' })
  fetch.mock.mockImplementation(async () => new Response('not JSON'))
  await assert.rejects(createVllmMessage(params), /non JSON/)
})

test('vLLM transport aborts a slow request', async t => {
  env(t, { VLLM_BASE_URL: 'http://localhost:8000/v1', VLLM_API_KEY: 'test', VLLM_TIMEOUT_MS: '10' })
  t.mock.method(globalThis, 'fetch', async (_url, options) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('test timeout')), 1000)
    options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal.reason) }, { once: true })
  }))
  await assert.rejects(createVllmMessage(params), /délai/)
})

test('vLLM usage never falls back to Sonnet pricing', t => {
  env(t, { VLLM_INPUT_USD_PER_MTOK: undefined, VLLM_OUTPUT_USD_PER_MTOK: undefined })
  const input = { requestId: 'usage-test', operation: 'dm.turn', model: params.model,
    usage: { input_tokens: 60, cache_read_input_tokens: 40, output_tokens: 20 }, provider: 'vllm' }
  assert.equal(logAnthropicUsage(input).estimatedCostUsd, 0)
  process.env.VLLM_INPUT_USD_PER_MTOK = '1'
  process.env.VLLM_OUTPUT_USD_PER_MTOK = '2'
  assert.equal(logAnthropicUsage(input).estimatedCostUsd, 0.00014)
  assert.equal(logAnthropicUsage(input).totalInputTokens, 100)
  assert.ok(logAnthropicUsage({ ...input, provider: 'anthropic', model: 'claude-sonnet-4-6' }).estimatedCostUsd > 0)
})

test('server config selects the provider and validates vLLM without an Anthropic key', t => {
  env(t, { NODE_ENV: 'production', MONETIZATION_ENABLED: 'false', DATABASE_URL: 'postgres://local/db',
    LLM_MODE: 'live', LLM_PROVIDER: 'vllm', ANTHROPIC_API_KEY: undefined,
    VLLM_BASE_URL: 'https://pod.example/v1', VLLM_API_KEY: 'test', VLLM_TIMEOUT_MS: '45000' })
  const { validateServerConfig } = require('../lib/config-check.ts')
  assert.doesNotThrow(validateServerConfig)
  process.env.VLLM_BASE_URL = 'https://pod.example/runsync'
  assert.throws(validateServerConfig, /VLLM_BASE_URL/)
  process.env.VLLM_BASE_URL = 'https://user:secret@pod.example/v1'
  assert.throws(validateServerConfig, error => !error.message.includes('secret') && /VLLM_BASE_URL/.test(error.message))
  process.env.LLM_PROVIDER = 'anthropic'
  assert.throws(validateServerConfig, /ANTHROPIC_API_KEY/)
  process.env.LLM_PROVIDER = 'typo'
  assert.throws(validateServerConfig, /LLM_PROVIDER/)
})
