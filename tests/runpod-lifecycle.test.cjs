const assert = require('node:assert/strict')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
const { RunpodLifecycle, RUNPOD_IDLE_MS, RUNPOD_PRESENCE_TTL_MS } = require('../lib/runpod-lifecycle.ts')
test.after(restore)

function setup() {
  let time = 0
  const calls = []
  const control = {
    setActive: async value => { calls.push(value) },
    isReady: async () => true,
    isDrained: async () => true,
  }
  const manager = new RunpodLifecycle(control, () => time)
  return { manager, control, calls, advance: ms => { time += ms } }
}

test('opening starts one worker; heartbeats and departure do not extend the activity deadline', async () => {
  const { manager, calls, advance } = setup()
  await manager.presence('tab-a', 1, true)
  await manager.presence('tab-b', 1, true)
  await manager.presence('tab-a', 2, false)
  advance(60000)
  await manager.presence('tab-b', 2, true)
  assert.deepEqual(calls, [true])
  assert.equal(manager.status().ready, true)
  await manager.presence('tab-b', 3, false)
  advance(RUNPOD_IDLE_MS - 60000 - 1)
  await manager.reconcile()
  assert.deepEqual(calls, [true])
  advance(1)
  await manager.reconcile()
  await manager.reconcile()
  assert.deepEqual(calls, [true, false])
})

test('an open tab keeps polling without preventing sleep or waking the worker; an explicit message wakes it', async () => {
  const { manager, calls, advance } = setup()
  await manager.presence('a', 1, true)
  for (let sequence = 2; sequence <= 22; sequence++) {
    advance(30000)
    await manager.presence('a', sequence, true)
  }
  assert.deepEqual(calls, [true, false])
  await manager.presence('a', 23, true, true)
  assert.deepEqual(calls, [true, false, true])
})

test('pending generations block shutdown for the whole turn and release is idempotent', async () => {
  const { manager, calls, advance } = setup()
  await manager.presence('a', 1, true)
  const finishA = await manager.beginGeneration()
  const finishB = await manager.beginGeneration()
  await manager.presence('a', 2, false)
  advance(RUNPOD_IDLE_MS + 1)
  await manager.reconcile()
  finishA(); finishA()
  await manager.reconcile()
  assert.deepEqual(calls, [true])
  finishB()
  await manager.reconcile()
  advance(RUNPOD_IDLE_MS - 1)
  await manager.reconcile()
  assert.deepEqual(calls, [true])
  advance(1)
  await manager.reconcile()
  assert.deepEqual(calls, [true, false])
})

test('provider-side in-flight work and health errors postpone shutdown without losing the deadline', async () => {
  const { manager, control, calls, advance } = setup()
  await manager.presence('a', 1, true)
  await manager.presence('a', 2, false)
  advance(RUNPOD_IDLE_MS)
  control.isDrained = async () => false
  await manager.reconcile()
  assert.deepEqual(calls, [true])
  control.isDrained = async () => { throw new Error('health down') }
  await assert.rejects(manager.reconcile(), /health down/)
  assert.deepEqual(calls, [true])
  control.isDrained = async () => true
  await manager.reconcile()
  assert.deepEqual(calls, [true])
  advance(RUNPOD_IDLE_MS)
  await manager.reconcile()
  assert.deepEqual(calls, [true, false])
})

test('a player arriving during the drain check cancels shutdown', async () => {
  const { manager, control, calls, advance } = setup()
  await manager.presence('a', 1, true)
  await manager.presence('a', 2, false)
  advance(RUNPOD_IDLE_MS)
  let releaseHealth
  control.isDrained = () => new Promise(resolve => { releaseHealth = resolve })
  const stopping = manager.reconcile()
  await Promise.resolve()
  const joining = manager.presence('b', 1, true)
  releaseHealth(true)
  await Promise.all([stopping, joining])
  assert.deepEqual(calls, [true])
  assert.equal(manager.status().ready, true)
})

test('a generation arriving while a stop PATCH is in flight waits for the new start before running', async () => {
  const { manager, control, calls, advance } = setup()
  await manager.presence('a', 1, true)
  await manager.presence('a', 2, false)
  advance(RUNPOD_IDLE_MS)
  let finishStop
  control.setActive = async value => {
    calls.push(value)
    if (!value) await new Promise(resolve => { finishStop = resolve })
  }
  const stopping = manager.reconcile()
  for (let i = 0; i < 10 && !finishStop; i++) await Promise.resolve()
  assert.equal(typeof finishStop, 'function')
  const generation = manager.beginGeneration()
  finishStop()
  await stopping
  const finish = await generation
  assert.deepEqual(calls, [true, false, true])
  assert.equal(manager.status().ready, true)
  // Keep a player so releasing does not initiate a second deferred stop.
  await manager.presence('b', 1, true)
  finish()
  await manager.reconcile()
})

test('failed start and warm-up do not leak generation reservations; the next attempt recovers', async () => {
  const { manager, control, calls, advance } = setup()
  control.setActive = async () => { throw new Error('patch down') }
  await assert.rejects(manager.beginGeneration(), /patch down/)
  control.setActive = async active => { calls.push(active) }
  control.isReady = async () => false
  await assert.rejects(manager.beginGeneration(), /prépare/)
  control.isReady = async () => true
  const finish = await manager.beginGeneration()
  assert.equal(manager.status().ready, true)
  finish()
  advance(RUNPOD_IDLE_MS)
  await manager.reconcile()
  assert.deepEqual(calls, [true, false])
})

test('after a server restart the controller grants ten minutes then reconciles an orphan worker', async () => {
  const { manager, calls, advance } = setup()
  advance(RUNPOD_IDLE_MS - 1)
  await manager.reconcile()
  assert.deepEqual(calls, [])
  advance(1)
  await manager.reconcile()
  assert.deepEqual(calls, [false])
})

test('periodic reconciliation runs without any further browser requests', async t => {
  const { manager, calls, advance } = setup()
  await manager.presence('a', 1, true)
  await manager.presence('a', 2, false)
  advance(RUNPOD_IDLE_MS)
  t.mock.timers.enable({ apis: ['setInterval'] })
  manager.start()
  t.after(() => manager.stopTimer())
  t.mock.timers.tick(15000)
  await manager.reconcile()
  assert.deepEqual(calls, [true, false])
})
