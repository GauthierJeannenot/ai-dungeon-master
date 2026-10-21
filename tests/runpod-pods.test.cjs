const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')
process.env.MONETIZATION_ENABLED = 'false'
process.env.RUNPOD_MODE = 'pod'
process.env.RUNPOD_AUTO_MANAGE = 'true'
process.env.LLM_PROVIDER = 'vllm'
process.env.LLM_MODE = 'live'
process.env.ALLOW_PAID_LLM = 'true'
process.env.RUNPOD_POD_ID = 'seed'
process.env.RUNPOD_GLOBAL_VOLUME_ID = 'global-volume'
process.env.RUNPOD_TEMPLATE_ID = 'vllm-template'
process.env.RUNPOD_API_KEY = 'control-secret'
process.env.VLLM_API_KEY = 'inference-secret'
process.env.RUNPOD_GPU_TYPES = 'NVIDIA H100 PCIe,NVIDIA A100 80GB PCIe'
process.env.RUNPOD_MAX_HOURLY_USD = '3'
for (const name of ['DM_MODEL', 'DM_PLANNER_MODEL', 'DM_COMPRESS_MODEL', 'VLLM_BASE_URL']) delete process.env[name]
const pg = installPgMem()
const { getRunpodConfig } = require('../lib/runpod-config.ts')
const { createPodControl, podMetricsDrained } = require('../lib/runpod-pod-control.ts')
const { loadManagedPod, saveManagedPod, managedPodBaseUrl } = require('../lib/runpod-pod-store.ts')
const config = getRunpodConfig()
test.after(() => pg.restore())
test.beforeEach(async () => { await pg.db.dbQuery('DELETE FROM runpod_pod_state') })

function fixture(t, options = {}) {
  options = { ...options, global: true }
  const pod = (id, overrides = {}) => ({ id, name: id,
    ...(options.global ? { mounts: { global: [{ volumeId: 'global-volume', path: '/workspace' }] }, status: 'EXITED', cost: 2.89 } : {}),
    gpu: { id: 'NVIDIA H100 PCIe', count: 1 }, costPerHr: 2.89, desiredStatus: 'EXITED', interruptible: false, ...overrides })
  const pods = new Map([['seed', pod('seed', options.seed)]])
  const calls = []
  let created = 0
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input)
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    let pathname = url.pathname.replace(/^\/v2\//, '/v1/')
    if (pathname.endsWith('/action')) pathname = pathname.replace(/\/action$/, body.action === 'terminate' ? '' : `/${body.action}`)
    calls.push({ url: url.toString(), method, body })
    if (url.host.endsWith('.proxy.runpod.net')) {
      assert.equal(init.headers.Authorization, 'Bearer inference-secret')
      if (url.pathname === '/metrics') return new Response(options.metrics ?? 'vllm:num_requests_running{model_name="qwen"} 0\nvllm:num_requests_waiting{model_name="qwen"} 0\n')
      if (url.pathname === '/v1/models') return Response.json({ data: [{ id: 'Qwen/Qwen3.6-27B' }] })
      if (url.pathname === '/v1/chat/completions') return Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Bonjour.' } }] })
      assert.fail(`Unexpected inference URL ${url}`)
    }
    assert.equal(init.headers.Authorization, 'Bearer control-secret')
    if (url.pathname === '/graphql') {
      assert.equal(method, 'POST')
      assert.equal(body.variables.offer.dataCenterId, undefined)
      const price = options.price ?? 2.89
      return Response.json({ data: { gpuTypes: [{ id: body.variables.gpu.id,
        lowestPrice: { uninterruptablePrice: price, availableGpuCounts: [1] } }] } })
    }
    assert.equal(url.host, options.global ? 'api.runpod.io' : 'rest.runpod.io')
    if (pathname === '/v1/global-volumes/global-volume') return Response.json({ id: 'global-volume' })
    if (pathname === '/v1/pods' && method === 'GET') {
      if (options.global && options.pagination && !url.searchParams.has('cursor')) {
        return Response.json({ pods: [pods.get('seed')], pagination: { hasNextPage: true, nextCursor: 'next-page' } })
      }
      return Response.json(options.global ? { pods: [...pods.values()], pagination: { hasNextPage: false } } : [...pods.values()].filter(p => p.name === url.searchParams.get('name')))
    }
    if (pathname === '/v1/pods' && method === 'POST') {
      created++
      const id = `new-${created}`
      const fresh = pod(id, { name: body.name, costPerHr: options.actualPrice ?? 2.89, desiredStatus: 'RUNNING', gpu: { id: options.global ? body.gpu.id : body.gpuTypeIds[0], count: 1 },
        ...(options.global ? { status: 'RUNNING', cost: options.actualPrice ?? 2.89 } : {}) })
      if (!options.noCreate) pods.set(id, fresh)
      if (options.lostResponse) throw new Error('control-secret')
      {
        assert.deepEqual(body.mounts, { global: [{ volumeId: 'global-volume', path: '/workspace' }] })
        assert.equal(body.cloud, 'SECURE')
        assert.equal(body.gpu.count, 1)
        assert.equal(body.dataCenterIds, undefined)
      }
      return Response.json(fresh)
    }
    const match = pathname.match(/^\/v1\/pods\/([^/]+)(?:\/(start|stop))?$/)
    assert.ok(match, `Unexpected management URL ${url}`)
    const existing = pods.get(match[1])
    if (!existing) return new Response('', { status: 404 })
    if (method === 'DELETE' || body?.action === 'terminate') { pods.delete(existing.id); return new Response(null, { status: 204 }) }
    if (match[2] === 'start') {
      if (options.resumeUnavailable) return new Response('No capacity', { status: 400 })
      existing.desiredStatus = 'RUNNING'
      if (options.global) { existing.status = 'RUNNING'; existing.cost = options.resumePrice ?? 2.89 }
      if (options.resumePrice) existing.costPerHr = options.resumePrice
      return new Response('')
    }
    if (match[2] === 'stop') { existing.desiredStatus = 'EXITED'; existing.status = 'EXITED'; return new Response('') }
    return Response.json(existing)
  })
  return { pods, calls, created: () => created }
}

test('pod config works without a fixed inference URL and enforces the agreed maximum', () => {
  assert.equal(config.mode, 'pod')
  assert.equal(config.maxHourlyUsd, 3)
  process.env.RUNPOD_MAX_HOURLY_USD = '4'
  try { assert.throws(getRunpodConfig, /entre 0 et 3/) } finally { process.env.RUNPOD_MAX_HOURLY_USD = '3' }
})

test('reuse starts and stops the existing Pod, accepts empty API responses and preserves the global volume', async t => {
  const f = fixture(t)
  const control = createPodControl(config)
  await control.setActive(true)
  assert.equal(await control.isReady(), true)
  assert.equal(await control.isDrained(), true)
  await control.setActive(false)
  assert.equal(f.created(), 0)
  assert.equal(f.pods.get('seed').desiredStatus, 'EXITED')
  assert.equal(f.calls.filter(call => call.body?.action === 'start').length, 1)
  assert.equal(f.calls.some(call => call.method === 'DELETE'), false)
})

test('unavailable GPU creates one replacement using the same volume and changes the inference address', async t => {
  const f = fixture(t, { resumeUnavailable: true })
  const control = createPodControl(config)
  await control.setActive(true)
  assert.equal(await control.isReady(), true)
  assert.equal(f.created(), 1)
  assert.equal(await managedPodBaseUrl(config), 'https://new-1-8000.proxy.runpod.net/v1')
  const fresh = createPodControl(config) // simulates rebuilding the controller after a restart
  assert.equal(await fresh.isReady(), true)
  assert.equal(f.created(), 1)
  const { createVllmMessage } = require('../lib/dm/vllm.ts')
  const result = await createVllmMessage({ model: 'Qwen/Qwen3.6-27B', max_tokens: 100, messages: [{ role: 'user', content: 'Bonjour' }] })
  assert.equal(result.content[0].text, 'Bonjour.')
  assert.ok(f.calls.some(call => call.url === 'https://new-1-8000.proxy.runpod.net/v1/chat/completions'))
})

test('no offer under the cap means no allocation', async t => {
  const f = fixture(t, { resumeUnavailable: true, price: 3.01 })
  await assert.rejects(createPodControl(config).setActive(true), /3 \$\/h/)
  assert.equal(f.created(), 0)
})

test('price increasing after allocation deletes the new Pod, never the volume, and blocks allocation loops', async t => {
  const f = fixture(t, { resumeUnavailable: true, actualPrice: 3.2 })
  const control = createPodControl(config)
  await assert.rejects(control.setActive(true), /Pod refusé/)
  assert.equal(f.pods.has('new-1'), false)
  await assert.rejects(control.setActive(true), /bloquées/)
  assert.equal(f.created(), 1)
  assert.equal(f.calls.some(call => call.method !== 'GET' && call.url.includes('global-volumes')), false)
})

test('a lost creation response is recovered by its persisted name rather than creating a duplicate', async t => {
  const f = fixture(t, { resumeUnavailable: true, lostResponse: true })
  await assert.rejects(createPodControl(config).setActive(true), /incertain/)
  assert.ok((await loadManagedPod(config)).pendingName)
  assert.equal(await createPodControl(config).isReady(), true)
  assert.equal(f.created(), 1)
  assert.equal((await loadManagedPod(config)).podId, 'new-1')
})

test('an uncertain creation that cannot be found blocks all further allocation', async t => {
  const f = fixture(t, { resumeUnavailable: true, lostResponse: true, noCreate: true })
  await assert.rejects(createPodControl(config).setActive(true), /incertain/)
  await assert.rejects(createPodControl(config).setActive(true), /aucun doublon/)
  assert.equal(f.created(), 1)
})

test('a wrong global volume never authorizes mutating an existing Pod', async t => {
  const f = fixture(t, { seed: { mounts: { global: [{ volumeId: 'someone-else', path: '/workspace' }] } } })
  await assert.rejects(createPodControl(config).setActive(true), /aucune mutation/)
  assert.equal(f.calls.some(call => call.method !== 'GET'), false)
})

test('a higher price after resume puts the Pod back to sleep', async t => {
  const f = fixture(t, { resumePrice: 3.4 })
  await assert.rejects(createPodControl(config).setActive(true), /remis à l’arrêt/)
  assert.equal(f.pods.get('seed').desiredStatus, 'EXITED')
  assert.equal(f.created(), 0)
})

test('vLLM drain metrics require zero running and waiting requests on all models', () => {
  const zero = 'vllm:num_requests_running{model_name="a"} 0\nvllm:num_requests_waiting{model_name="a"} 0\n'
  assert.equal(podMetricsDrained(zero), true)
  assert.equal(podMetricsDrained(zero + 'vllm:num_requests_running{model_name="b"} 1\n'), false)
  assert.equal(podMetricsDrained(zero + 'vllm:num_requests_swapped 1\n'), false)
  assert.throws(() => podMetricsDrained('# no gauges'), /absentes/)
  assert.throws(() => podMetricsDrained(zero + 'vllm:num_requests_running NaN\n'), /invalides/)
})

test('pod state round-trips pending allocation and rejection markers through Postgres', async () => {
  await loadManagedPod(config)
  const state = { podId: 'persisted', pendingName: 'pending', rejectedPod: true, blocked: true, created: true }
  await saveManagedPod(config, state)
  assert.deepEqual(await loadManagedPod(config), state)
  await assert.rejects(managedPodBaseUrl(config), /pas encore disponible/)
})

const globalConfig = config
test('global volume ID is required', () => {
  delete process.env.RUNPOD_GLOBAL_VOLUME_ID
  try { assert.throws(getRunpodConfig, /RUNPOD_GLOBAL_VOLUME_ID/) }
  finally { process.env.RUNPOD_GLOBAL_VOLUME_ID = 'global-volume' }
})

test('global Pod with zero stopped cost resumes through v2 and stops without deleting storage', async t => {
  const f = fixture(t, { global: true, seed: { cost: 0 } })
  const control = createPodControl(globalConfig)
  await control.setActive(true)
  assert.equal(await control.isReady(), true)
  assert.equal(await control.isDrained(), true)
  await control.setActive(false)
  assert.deepEqual(f.calls.filter(c => c.url.endsWith('/action')).map(c => c.body.action), ['start', 'stop'])
  assert.equal(f.created(), 0)
})

test('global replacement mounts the same volume across datacenters and recovers an uncertain creation', async t => {
  const f = fixture(t, { global: true, resumeUnavailable: true, lostResponse: true, pagination: true })
  await assert.rejects(createPodControl(globalConfig).setActive(true), /incertain/)
  assert.equal(await createPodControl(globalConfig).isReady(), true)
  assert.equal(f.created(), 1)
  assert.ok(f.calls.some(c => c.url.endsWith('/v2/pods?cursor=next-page')))
  assert.equal(await managedPodBaseUrl(globalConfig), 'https://new-1-8000.proxy.runpod.net/v1')
})

test('global mount identity and path are checked before any mutation', async t => {
  const f = fixture(t, { global: true, seed: { mounts: { global: [{ volumeId: 'global-volume', path: '/other' }] } } })
  await assert.rejects(createPodControl(globalConfig).setActive(false), /aucune mutation/)
  assert.equal(f.calls.some(c => c.method !== 'GET'), false)
})

test('an overpriced global replacement is terminated once without deleting any volume', async t => {
  const f = fixture(t, { global: true, resumeUnavailable: true, actualPrice: 3.2 })
  const control = createPodControl(globalConfig)
  await assert.rejects(control.setActive(true), /Pod refusé/)
  await assert.rejects(control.setActive(true), /bloquées/)
  assert.equal(f.created(), 1)
  assert.equal(f.pods.has('new-1'), false)
  assert.ok(f.calls.some(c => c.body?.action === 'terminate'))
  assert.equal(f.calls.some(c => c.method !== 'GET' && c.url.includes('global-volumes')), false)
})

test('different global volumes keep separate persistent Pod state', async () => {
  const other = { ...config, globalVolumeId: 'another-global-volume' }
  await loadManagedPod(config)
  await saveManagedPod(config, { podId: 'first-persisted' })
  await loadManagedPod(other)
  await saveManagedPod(other, { podId: 'second-persisted', created: true })
  assert.equal((await loadManagedPod(config)).podId, 'first-persisted')
  assert.equal((await loadManagedPod(other)).podId, 'second-persisted')
})

test('global provisioning keeps one allocation and validates the eventual running price', async t => {
  const f = fixture(t, { global: true, resumeUnavailable: true })
  const control = createPodControl(globalConfig)
  await control.setActive(true)
  const pod = f.pods.get('new-1')
  pod.status = 'PROVISIONING'; pod.cost = 0
  assert.equal(await control.isReady(), false)
  pod.status = 'STARTING'
  assert.equal(await control.isReady(), false)
  assert.equal(f.created(), 1)
  pod.status = 'RUNNING'; pod.cost = 3.2
  await assert.rejects(control.isReady(), /Pod refusé/)
  assert.equal(f.pods.has('new-1'), false)
})

test('global resumed price above the cap stops the existing Pod', async t => {
  const f = fixture(t, { global: true, seed: { cost: 0 }, resumePrice: 3.4 })
  await assert.rejects(createPodControl(globalConfig).setActive(true), /remis à l’arrêt/)
  assert.equal(f.pods.get('seed').status, 'EXITED')
  assert.equal(f.created(), 0)
})
