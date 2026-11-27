const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
process.env.MONETIZATION_ENABLED = 'false'
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { dbQuery } = require('../lib/db.ts')
const recorder = require('../lib/training-recorder.ts')
const api = require('../app/api/llm_training/route.ts')
const { NextRequest } = require('next/server')
test.after(() => pg.restore())

test('local JSONL preserves full Unicode prompts, concurrent order, outcomes and annotations, independently of diagnostic limits', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-dm-training-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const original = { ...process.env }
  t.after(() => { process.env = original })
  process.env.LLM_TRAINING_DIR = dir
  process.env.LLM_TRAINING_FILE_ENABLED = 'true'
  process.env.NODE_ENV = 'development'
  const payload = { system: 'Consigne exacte : éè🧙\n'.repeat(300), messages: Array.from({ length: 45 }, (_, i) => ({ role: 'user', content: `${i}` })),
    deep: { a: { b: { c: { d: { e: { f: 'entier' } } } } } } }
  await Promise.all(['file-a', 'file-b'].map(session => recorder.withRecording(async () => {
    await recorder.startRecording(session, { message: session })
    await Promise.all(Array.from({ length: 3 }, (_, i) => recorder.recordExchange('llm.request', { ...payload, i })))
    await recorder.finishRecording(Response.json({ narrative: 'Tu avances.' }))
  })))
  const files = fs.readdirSync(dir)
  assert.equal(files.length, 2)
  for (const file of files) {
    const records = fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n').map(JSON.parse)
    assert.deepEqual(records.map(r => r.type), ['turn.start', 'event', 'event', 'event', 'turn.outcome'])
    assert.deepEqual(records.slice(1, 4).map(r => r.sequence), [0, 1, 2])
    assert.deepEqual(records[1].payload, { ...payload, i: 0 })
    assert.equal(records[4].outcome.body.narrative, 'Tu avances.')
    const turn = (await dbQuery('SELECT * FROM training_turns WHERE id=$1', [records[0].turnId])).rows[0]
    assert.equal(turn.session_id, records[0].sessionId)
    assert.equal(turn.metadata.message, records[0].sessionId)
    const stored = (await dbQuery('SELECT payload FROM training_events WHERE turn_id=$1 ORDER BY sequence', [turn.id])).rows
    assert.deepEqual(stored[0].payload, records[1].payload)
    await recorder.appendTrainingRecord(turn.id, turn.session_id, { type: 'turn.annotation', rating: 'good', correction: 'validé' })
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n').at(-1)).correction, 'validé')
  }
  process.env.NODE_ENV = 'production'
  delete process.env.LLM_TRAINING_FILE_ENABLED
  await recorder.appendTrainingRecord('00000000-0000-0000-0000-000000000000', 'production', { type: 'test' })
  assert.equal(fs.readdirSync(dir).length, 2, 'Production defaults to Postgres, without local files')
})

test('global training endpoint requires an admin token and exports complete paginated records with session filters', async t => {
  const oldToken = process.env.LLM_TRAINING_TOKEN, oldDebug = process.env.APP_DEBUG_LOG_TOKEN
  t.after(() => {
    if (oldToken === undefined) delete process.env.LLM_TRAINING_TOKEN; else process.env.LLM_TRAINING_TOKEN = oldToken
    if (oldDebug === undefined) delete process.env.APP_DEBUG_LOG_TOKEN; else process.env.APP_DEBUG_LOG_TOKEN = oldDebug
  })
  delete process.env.LLM_TRAINING_TOKEN
  delete process.env.APP_DEBUG_LOG_TOKEN
  const token = 'training-test-secret-at-least-16'
  const req = (query = '', secret = token) => new NextRequest('http://localhost/api/llm_training' + query,
    { headers: { authorization: `Bearer ${secret}` } })
  assert.equal((await api.GET(req())).status, 404)
  process.env.LLM_TRAINING_TOKEN = token
  assert.equal((await api.GET(req('', 'bad'))).status, 401)
  assert.equal((await api.GET(req('?limit=0'))).status, 400)
  assert.equal((await api.GET(req('?cursor=broken'))).status, 400)
  const first = await api.GET(req('?limit=1'))
  assert.equal(first.headers.get('cache-control'), 'no-store')
  const data = await first.json()
  assert.equal(data.turns.length, 1)
  assert.ok(data.nextCursor)
  const next = await (await api.GET(req('?limit=1&cursor=' + encodeURIComponent(data.nextCursor)))).json()
  assert.equal(next.turns.length, 1)
  assert.notEqual(next.turns[0].id, data.turns[0].id)
  assert.equal(next.nextCursor, null)
  const filtered = await (await api.GET(req('?sessionId=file-a'))).json()
  assert.equal(filtered.turns.length, 1)
  assert.equal(filtered.turns[0].session_id, 'file-a')
  const download = await api.GET(req('?download=1&limit=1'))
  assert.ok(download.headers.get('x-next-cursor'))
  assert.match(download.headers.get('content-type'), /ndjson/)
  const records = (await download.text()).trim().split('\n').map(JSON.parse)
  assert.deepEqual(records.map(r => r.type), ['turn.start', 'event', 'event', 'event', 'turn.outcome', 'turn.annotation'])
  assert.equal(records[1].payload.system, data.turns[0].events[0].payload.system)
  delete process.env.LLM_TRAINING_TOKEN
  process.env.APP_DEBUG_LOG_TOKEN = token
  assert.equal((await api.GET(req())).status, 200, 'Existing debug token can protect the new endpoint')
})
