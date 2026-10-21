const assert = require('node:assert/strict')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
test.after(restore)
const modulePath = require.resolve('../lib/dm/llm.ts')

function configure(t, values) {
  const keys = ['LLM_PROVIDER', 'LLM_MODE', 'ALLOW_PAID_LLM', 'ANTHROPIC_API_KEY', 'DM_MODEL', 'DM_PLANNER_MODEL',
    'DM_COMPRESS_MODEL', 'DM_EFFORT', 'VLLM_BASE_URL', 'VLLM_API_KEY']
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  for (const key of keys) delete process.env[key]
  Object.assign(process.env, values)
  delete require.cache[modulePath]
  t.after(() => {
    delete require.cache[modulePath]
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key]
      else process.env[key] = before[key]
    }
  })
  return require(modulePath)
}
function context() { return { requestId: 'provider-test', inputMode: 'text', operation: 'dm.turn', usageLog: [] } }

test('live Qwen uses only vLLM, defaults all three operations to Qwen and records usage', async t => {
  const llm = configure(t, { LLM_PROVIDER: 'vllm', LLM_MODE: 'live', ALLOW_PAID_LLM: 'true',
    VLLM_BASE_URL: 'https://pod.example/v1', VLLM_API_KEY: 'vllm-test' })
  const fetch = t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, 'https://pod.example/v1/chat/completions')
    return Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Bonjour.' } }],
      usage: { prompt_tokens: 50, completion_tokens: 5 } })
  })
  assert.equal(llm.MODEL, 'Qwen/Qwen3.6-27B')
  assert.equal(llm.PLANNER_MODEL, llm.MODEL)
  assert.equal(llm.COMPRESS_MODEL, llm.MODEL)
  const ctx = context()
  assert.equal((await llm.createLlmMessage({ model: llm.MODEL, max_tokens: 100, messages: [] }, ctx)).content[0].text, 'Bonjour.')
  assert.equal(fetch.mock.callCount(), 1)
  assert.equal(ctx.usageLog[0].provider, 'vllm')
  assert.equal(ctx.usageLog[0].inputTokens, 50)
})

test('Anthropic stays the default provider and its Messages contract is unchanged', async t => {
  const llm = configure(t, { LLM_MODE: 'live', ALLOW_PAID_LLM: 'true', ANTHROPIC_API_KEY: 'sk-ant-test' })
  const fetch = t.mock.method(globalThis, 'fetch', async (input, init) => {
    const request = new Request(input, init)
    assert.equal(request.url, 'https://api.anthropic.com/v1/messages')
    assert.equal(request.headers.get('x-api-key'), 'sk-ant-test')
    const body = await request.json()
    assert.equal(body.model, 'claude-sonnet-4-6')
    assert.equal(body.system[0].cache_control.type, 'ephemeral')
    assert.equal(body.output_config.effort, 'medium')
    return Response.json({ id: 'msg-test', type: 'message', role: 'assistant', model: body.model,
      content: [{ type: 'text', text: 'Bonjour.' }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 } })
  })
  assert.equal(llm.LLM_PROVIDER, 'anthropic')
  assert.equal(llm.PLANNER_MODEL, 'claude-haiku-4-5')
  await llm.createLlmMessage({ model: llm.MODEL, max_tokens: 100, messages: [{ role: 'user', content: 'Bonjour' }],
    system: [{ type: 'text', text: 'Rules', cache_control: { type: 'ephemeral' } }], ...llm.effortFor(llm.MODEL) }, context())
  assert.equal(fetch.mock.callCount(), 1)
})

test('both providers honor mock mode and the paid-call guard without network access', async t => {
  t.mock.method(globalThis, 'fetch', () => { assert.fail('Network access forbidden') })
  for (const provider of ['vllm', 'anthropic']) {
    await t.test(provider, async st => {
      const llm = configure(st, { LLM_PROVIDER: provider, LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false' })
      const params = { model: llm.MODEL, max_tokens: 100, messages: [] }
      assert.equal((await llm.createLlmMessage(params, context())).stop_reason, 'end_turn')
      await st.test('live guard', async guard => {
        const live = configure(guard, { LLM_PROVIDER: provider, LLM_MODE: 'live', ALLOW_PAID_LLM: 'false' })
        await assert.rejects(live.createLlmMessage(params, context()), /désactivés/)
      })
    })
  }
})
