const assert = require('node:assert/strict')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
const { getRunpodConfig } = require('../lib/runpod-config.ts')
const { createRunpodControl } = require('../lib/runpod-control.ts')
test.after(restore)
const config = { endpointId: 'endpoint-test', apiKey: 'management-secret', inferenceBaseUrl: 'https://api.runpod.ai/v2/endpoint-test/openai/v1' }

function env(t, values) {
  const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  Object.assign(process.env, values)
  t.after(() => { for (const [key, value] of Object.entries(before)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  } })
}

test('Runpod management is opt-in, inactive in mocks/blocked calls, and bound to the inference endpoint', t => {
  env(t, { RUNPOD_AUTO_MANAGE: 'true', LLM_MODE: 'mock', LLM_PROVIDER: 'vllm', ALLOW_PAID_LLM: 'true',
    RUNPOD_ENDPOINT_ID: config.endpointId, RUNPOD_API_KEY: config.apiKey, VLLM_BASE_URL: config.inferenceBaseUrl })
  assert.equal(getRunpodConfig(), null)
  process.env.LLM_MODE = 'live'
  assert.deepEqual(getRunpodConfig(), config)
  process.env.ALLOW_PAID_LLM = 'false'
  assert.equal(getRunpodConfig(), null)
  process.env.ALLOW_PAID_LLM = 'true'
  process.env.VLLM_BASE_URL = 'https://another-pod.example/v1'
  assert.throws(getRunpodConfig, /VLLM_BASE_URL/)
  process.env.VLLM_BASE_URL = config.inferenceBaseUrl
  process.env.LLM_PROVIDER = 'anthropic'
  assert.throws(getRunpodConfig, /LLM_PROVIDER/)
})

test('control PATCH starts exactly one worker, stops all capacity, and confirms both limits', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://rest.runpod.io/v1/endpoints/endpoint-test')
    assert.equal(init.method, 'PATCH')
    assert.equal(init.headers.Authorization, 'Bearer management-secret')
    assert.equal(init.redirect, 'error')
    assert.equal(init.cache, 'no-store')
    return Response.json(JSON.parse(init.body))
  })
  const control = createRunpodControl(config)
  await control.setActive(true)
  await control.setActive(false)
  assert.deepEqual(fetch.mock.calls.map(call => JSON.parse(call.arguments[1].body)), [
    { workersMin: 1, workersMax: 1, idleTimeout: 600 }, { workersMin: 0, workersMax: 0 },
  ])
  fetch.mock.mockImplementation(async () => Response.json({ workersMin: 0, workersMax: 1 }))
  await assert.rejects(control.setActive(false), /confirmé/)
})

test('drain waits for both queued and running jobs and fails closed on malformed health', async t => {
  let jobs = { inProgress: 1, inQueue: 0 }
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, 'https://api.runpod.ai/v2/endpoint-test/health')
    return Response.json({ jobs })
  })
  const control = createRunpodControl(config)
  assert.equal(await control.isDrained(), false)
  jobs = { inProgress: 0, inQueue: 1 }
  assert.equal(await control.isDrained(), false)
  jobs = { inProgress: 0, inQueue: 0 }
  assert.equal(await control.isDrained(), true)
  jobs = {}
  await assert.rejects(control.isDrained(), /Compteur/)
})

test('readiness verifies every configured model without exposing credentials on failures', async t => {
  env(t, { VLLM_API_KEY: 'inference-secret', DM_MODEL: 'dm', DM_PLANNER_MODEL: 'planner', DM_COMPRESS_MODEL: 'summary' })
  const fetch = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, `${config.inferenceBaseUrl}/models`)
    assert.equal(init.headers.Authorization, 'Bearer inference-secret')
    return Response.json({ data: [{ id: 'dm' }, { id: 'planner' }] })
  })
  const control = createRunpodControl(config)
  assert.equal(await control.isReady(), false)
  fetch.mock.mockImplementation(async () => Response.json({ data: [{ id: 'dm' }, { id: 'planner' }, { id: 'summary' }] }))
  assert.equal(await control.isReady(), true)
  fetch.mock.mockImplementation(async () => new Response('management-secret', { status: 401 }))
  await assert.rejects(control.setActive(true), { message: 'API de gestion Runpod : HTTP 401.' })
  fetch.mock.mockImplementation(async () => { throw new Error('management-secret') })
  await assert.rejects(control.isDrained(), { message: 'API de gestion Runpod indisponible.' })
  assert.equal(await control.isReady(), false)
})
