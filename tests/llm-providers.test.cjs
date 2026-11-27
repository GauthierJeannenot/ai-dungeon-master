const assert = require('node:assert/strict')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
test.after(restore)
const modulePath = require.resolve('../lib/dm/llm.ts')

function configure(t, values) {
  const keys = ['LLM_PROVIDER', 'LLM_MODE', 'ALLOW_PAID_LLM', 'DM_MODEL', 'DM_PLANNER_MODEL',
    'DM_COMPRESS_MODEL', 'OPENAI_BASE_URL', 'OPENAI_API_KEY']
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

test('live OpenAI uses only OpenAI, defaults DM and compression to OpenAI and records usage', async t => {
  const llm = configure(t, { LLM_PROVIDER: 'openai', LLM_MODE: 'live', ALLOW_PAID_LLM: 'true',
    OPENAI_BASE_URL: 'https://pod.example/v1', OPENAI_API_KEY: 'openai-test' })
  const fetch = t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, 'https://pod.example/v1/responses')
    return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Bonjour.' }] }], usage: { input_tokens: 50, output_tokens: 5 } })
  })
  assert.equal(llm.MODEL, 'gpt-5.4-mini')
  assert.equal(llm.PLANNER_MODEL, undefined)
  assert.equal(llm.COMPRESS_MODEL, llm.MODEL)
  const ctx = context()
  assert.equal((await llm.createLlmMessage({ model: llm.MODEL, max_tokens: 100, messages: [] }, ctx)).content[0].text, 'Bonjour.')
  assert.equal(fetch.mock.callCount(), 1)
  assert.equal(ctx.usageLog[0].provider, 'openai')
  assert.equal(ctx.usageLog[0].inputTokens, 50)
})

test('OpenAI is the default transport, with no SDK dependency or provider cache options', t => {
  const llm = configure(t, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false' })
  assert.equal(llm.LLM_PROVIDER, 'openai')
  assert.equal(llm.MODEL, 'gpt-5.4-mini')
  assert.equal(llm.COMPRESS_MODEL, llm.MODEL)
  assert.equal(require('../package.json').dependencies['@anthropic-ai/sdk'], undefined)
  const { getLlmProvider } = require('../lib/dm/llm-config.ts')
  process.env.LLM_PROVIDER = 'removed-provider'
  assert.throws(getLlmProvider, /LLM_PROVIDER/)
})

test('OpenAI honors mock mode and the paid-call guard without network access', async t => {
  t.mock.method(globalThis, 'fetch', () => { assert.fail('Network access forbidden') })
  for (const provider of ['openai']) {
    await t.test(provider, async st => {
      const llm = configure(st, { LLM_PROVIDER: provider, LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false' })
      const params = { model: llm.MODEL, max_tokens: 100, messages: [] }
      assert.equal(await llm.measureLlmContext(params), null)
      assert.equal((await llm.createLlmMessage(params, context())).stop_reason, 'end_turn')
      await st.test('live guard', async guard => {
        const live = configure(guard, { LLM_PROVIDER: provider, LLM_MODE: 'live', ALLOW_PAID_LLM: 'false' })
        assert.equal(await live.measureLlmContext(params), null)
        await assert.rejects(live.createLlmMessage(params, context()), /désactivés/)
      })
    })
  }
})

test('a legacy planner override cannot change the compression model', async t => {
  for (const provider of ['openai']) {
    await t.test(provider, st => {
      const llm = configure(st, { LLM_PROVIDER: provider, LLM_MODE: 'mock', DM_MODEL: 'dm-model', DM_PLANNER_MODEL: 'removed-model' })
      assert.equal(llm.PLANNER_MODEL, undefined)
      assert.equal(llm.COMPRESS_MODEL, 'dm-model')
    })
  }
})
