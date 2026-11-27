const test = require('node:test')
const assert = require('node:assert/strict')
process.env.MONETIZATION_ENABLED = 'false'
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { dbQuery } = require('../lib/db.ts')
const { withRecording, startRecording, captureExchange, finishRecording } = require('../lib/training-recorder.ts')
test.after(() => pg.restore())
test('training: exact payloads, errors, outcomes and concurrent session isolation persist', async () => {
  await Promise.all(['session-a','session-b'].map(session => withRecording(async () => {
    await startRecording(session, { message: session })
    const request = { tools: [{ name: 'test' }], messages: [{ role: 'user', content: 'quoted action' }] }
    await captureExchange('llm', request, async () => ({ content: [{ type: 'tool_use', input: { target: session } }] }))
    await assert.rejects(captureExchange('mcp', { name: 'test', arguments: { target: session } }, async () => { throw new Error('refused') }))
    await finishRecording(new Response(JSON.stringify({ narration: session }), { status: 200 }))
  })))
  const turns = (await dbQuery('SELECT * FROM training_turns')).rows
  assert.equal(turns.length, 2)
  for (const turn of turns) {
    const events = (await dbQuery('SELECT * FROM training_events WHERE turn_id=$1 ORDER BY sequence', [turn.id])).rows
    assert.deepEqual(events.map(e => e.kind), ['llm.request','llm.response','mcp.request','mcp.error'])
    assert.equal(events[1].payload.content[0].input.target, turn.session_id)
    assert.equal(events[2].payload.arguments.target, turn.session_id)
    assert.equal(events[3].payload.message, 'refused')
    assert.equal(turn.outcome.body.narration, turn.session_id)
    assert.equal(turn.rating, null)
    assert.equal(turn.correction, '')
    await dbQuery('UPDATE training_turns SET rating=$2, correction=$3 WHERE id=$1', [turn.id,'bad','choose explicit target'])
    const saved = (await dbQuery('SELECT rating,correction FROM training_turns WHERE id=$1',[turn.id])).rows[0]
    assert.deepEqual(saved, { rating: 'bad', correction: 'choose explicit target' })
  }
})

test('training API: access checks, scoped annotations and full export', async () => {
  const api = require('../app/api/sessions/[sessionId]/training/route.ts')
  const { NextRequest } = require('next/server')
  const { saveSession } = require('../lib/session-store.ts')
  const state = { phase: 'exploration', player: { hp: { current: 10, max: 10 } }, monsters: {}, combatLog: [], roomsVisited: [] }
  await saveSession('session-a', { gameState: state, history: [] })
  await saveSession('protected', { gameState: state, history: [], ownerId: 'user:other' })
  const context = id => ({ params: Promise.resolve({ sessionId: id }) })
  const req = new NextRequest('http://localhost/api?download=1')
  assert.equal((await api.GET(req, context('protected'))).status, 403)
  const exported = await api.GET(req, context('session-a'))
  assert.equal(exported.status, 200)
  const data = await exported.json()
  assert.equal(data.turns.length, 1)
  assert.equal(data.turns[0].events.length, 4)
  const patch = body => new NextRequest('http://localhost/api', { method: 'PATCH', body: JSON.stringify(body) })
  const id = data.turns[0].id
  assert.equal((await api.PATCH(patch({ id, rating: 'wrong', correction: '' }), context('session-a'))).status, 400)
  assert.equal((await api.PATCH(patch({ id, rating: 'good', correction: 'reviewed' }), context('session-a'))).status, 200)
  await saveSession('session-b', { gameState: state, history: [] })
  assert.equal((await api.PATCH(patch({ id, rating: 'bad', correction: '' }), context('session-b'))).status, 404)
})
