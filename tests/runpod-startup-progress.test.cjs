const assert = require('node:assert/strict')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
const { startupProgressFromLog, createStartupLogReader, isDmStartupProgress } = require('../lib/runpod-startup-progress.ts')
test.after(restore)

const event = (line, id = 'one', ts = new Date(Date.now() + 1000).toISOString()) =>
  `id: ${id}\r\ndata: ${JSON.stringify({ source: 'container', ts, line })}\r\n\r\n`

test('percentages measure only the current phase; milestones never invent total progress or readiness', () => {
  assert.deepEqual(startupProgressFromLog('\x1b[32mLoading safetensors checkpoint shards: 40% Completed | 2/5'),
    { phase: 'loading', percent: 40, label: 'Chargement des fichiers du modèle…' })
  assert.equal(startupProgressFromLog('Loading safetensors checkpoint shards: 100% Completed | 5/5').percent, 100)
  assert.equal(startupProgressFromLog('Model loading took 24 GiB').percent, null)
  assert.equal(startupProgressFromLog('torch.compile takes 10s').percent, null)
  assert.equal(startupProgressFromLog('Capturing CUDA graphs: 50%').percent, 50)
  assert.equal(startupProgressFromLog('Capturing CUDA graphs').percent, null)
  assert.equal(startupProgressFromLog('Capturing CUDA graphs: 999%').percent, null)
  assert.deepEqual(startupProgressFromLog('Application startup complete.'),
    { phase: 'verifying', percent: null, label: 'Vérification de la disponibilité du MJ…' })
  assert.equal(startupProgressFromLog('Loading safetensors checkpoint shards: 999%'), null)
  assert.equal(startupProgressFromLog('unrelated secret printed by the container'), null)
})

test('the client accepts unmeasured phases and rejects invalid telemetry', () => {
  assert.equal(isDmStartupProgress(startupProgressFromLog('torch.compile takes 10s')), true)
  assert.equal(isDmStartupProgress(startupProgressFromLog('Capturing CUDA graphs: 50%')), true)
  for (const percent of [undefined, -1, 101, NaN, Infinity, '80']) {
    assert.equal(isDmStartupProgress({ phase: 'loading', percent, label: 'Loading' }), false)
  }
  assert.equal(isDmStartupProgress({ phase: 'unknown', percent: null, label: 'Loading' }), false)
  assert.equal(isDmStartupProgress(null), false)
})

test('SSE snapshots tolerate fragmented frames, ignore old logs and resume without exposing logs', async t => {
  const reader = createStartupLogReader('management-secret')
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init })
    const text = calls.length === 1
      ? event('Application startup complete', 'old', '2020-01-01T00:00:00Z')
        + event('Loading safetensors checkpoint shards: 40% Completed | 2/5', 'latest')
      : event('Loading safetensors checkpoint shards: 80% Completed | 4/5', 'next')
    return new Response(new ReadableStream({ start(controller) {
      const bytes = new TextEncoder().encode(text)
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
      controller.close()
    } }), { headers: { 'Content-Type': 'text/event-stream' } })
  })
  assert.deepEqual(await reader.read('pod-one'), { phase: 'loading', percent: 40, label: 'Chargement des fichiers du modèle…' })
  assert.equal(await reader.read('pod-one').then(p => p.percent), 80)
  assert.equal(calls[1].init.headers['Last-Event-ID'], 'latest')
  assert.equal(new URL(calls[0].url).pathname, '/v2/pods/pod-one/logs')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer management-secret')
  reader.reset()
  await reader.read('pod-two')
  assert.equal(calls[2].init.headers['Last-Event-ID'], undefined)
})

test('completed phases advance to unmeasured phases and restart signals clear previous progress', async t => {
  const reader = createStartupLogReader('secret')
  const batches = [
    ['Loading safetensors checkpoint shards: 100% Completed | 5/5'],
    ['Model loading took 24 GiB', 'Loading safetensors checkpoint shards: 80% Completed | 4/5'],
    ['Capturing CUDA graphs: 10%', 'Capturing CUDA graphs: 0%'],
    ['Application startup complete.'],
    ['Initializing a V1 LLM engine'],
    ['Starting to load model', 'Loading safetensors checkpoint shards: 0% Completed | 0/5'],
  ]
  t.mock.method(globalThis, 'fetch', async () => new Response(batches.shift().map(line => event(line)).join(''),
    { headers: { 'Content-Type': 'text/event-stream' } }))
  assert.equal((await reader.read('pod')).percent, 100)
  assert.deepEqual(await reader.read('pod'), { phase: 'preparing', percent: null, label: 'Modèle chargé, préparation du MJ…' })
  assert.equal((await reader.read('pod')).percent, 10)
  assert.equal((await reader.read('pod')).phase, 'verifying')
  assert.equal((await reader.read('pod')).phase, 'initializing')
  assert.equal((await reader.read('pod')).percent, 0)
})

test('unavailable telemetry remains optional and an endless log stream is cancelled', async t => {
  const reader = createStartupLogReader('secret')
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 403 }))
  assert.equal(await reader.read('pod'), null)
  let aborted = false
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(event('Capturing CUDA graphs: 10%')))
        init.signal.addEventListener('abort', () => { aborted = true; controller.error(new Error('aborted')) }, { once: true })
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } })
  })
  const result = await reader.read('pod')
  assert.equal(result.percent, 10)
  // The abort ends the network stream even if cancellation sees an errored reader.
  assert.equal(aborted, true)
})

test('a log stream that ignores abort and never finishes cancellation cannot block readiness polling', { timeout: 5000 }, async t => {
  const reader = createStartupLogReader('secret')
  let cancelled = false
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(event('Capturing CUDA graphs: 10%')))
    },
    cancel() {
      cancelled = true
      return new Promise(() => {})
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } }))

  assert.equal((await reader.read('pod')).percent, 10)
  assert.equal(cancelled, true)
  // A subsequent availability poll can proceed even if cleanup is still pending.
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 403 }))
  assert.equal((await reader.read('pod')).percent, 10)
})
