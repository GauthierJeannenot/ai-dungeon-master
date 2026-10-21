const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

process.env.LLM_MODE = 'mock'
process.env.ALLOW_PAID_LLM = 'false'
process.env.LLM_PROVIDER = 'anthropic'
process.env.MONETIZATION_ENABLED = 'false'
process.env.LLM_MAX_CALLS_PER_REQUEST = '3'
process.env.DM_RATE_LIMIT_PER_MINUTE = '0'
process.env.LLM_PLANNER_ENABLED = 'true'
const pg = installPgMem()
const llm = require('../lib/dm/llm.ts')
const { POST } = require('../app/api/dm/route.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
const { loadSession, deleteSession } = require('../lib/session-store.ts')
test.after(() => pg.restore())

function text(value) { return { type: 'text', text: value } }
function toolCall(id, x) {
  return { type: 'tool_use', id, name: 'move_token', input: { tokenId: 'player', toCell: { x, y: 13 } } }
}
function answer(content, stop_reason = 'tool_use') { return { content, stop_reason } }
const planner = answer([{ type: 'tool_use', id: 'plan', name: 'decide_action', input: {
  requiresMechanic: true, confidence: 'high', tool: 'move_token', reason: 'Movement', sceneMarkers: [],
} }])

async function run(t, handler) {
  const sessionId = `reliability-${process.pid}-${Date.now()}`
  t.after(async () => { await closeMCPClient(sessionId); await deleteSession(sessionId) })
  let turn = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {
    if (context.operation === 'dm.plan') return planner
    return handler(params, context, ++turn)
  })
  const response = await POST(new Request('http://localhost/api/dm', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, message: 'je vais en (11,13)' }),
  }))
  return { response, data: await response.json(), sessionId }
}

test('a real engine rejection does not satisfy the plan or consume the primary action; pre-tool prose is discarded', async t => {
  const result = await run(t, (params, context, turn) => {
    if (turn === 1) return answer([text('Tu atteins déjà ta destination imaginaire.'), toolCall('bad', 999)])
    if (turn === 2) {
      assert.deepEqual(params.tool_choice, { type: 'tool', name: 'move_token', disable_parallel_tool_use: true })
      const last = params.messages.at(-1).content[0]
      assert.equal(last.is_error, true)
      assert.equal(typeof JSON.parse(last.content).error, 'string')
      assert.equal(JSON.stringify(params.messages).includes('destination imaginaire'), false)
      return answer([text('Tu gagnes aussi un trésor inventé.'), toolCall('good', 11)])
    }
    assert.equal(params.tool_choice, undefined)
    assert.deepEqual(context.gameState.player.position, { x: 11, y: 13 })
    assert.equal(JSON.stringify(params.messages).includes('trésor inventé'), false)
    return answer([text('Tu arrives à destination.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.deepEqual(result.data.newGameState.player.position, { x: 11, y: 13 })
  assert.equal(result.data.narrative, 'Tu arrives à destination.')
  assert.equal((await loadSession(result.sessionId)).history.at(-1).content, result.data.narrative)
})

test('exhausting rejected tools never invokes free narration or claims success', async t => {
  const result = await run(t, (params, context, turn) => {
    assert.equal(context.operation, 'dm.turn')
    assert.equal(params.tool_choice.name, 'move_token')
    return answer([text('Réussite inventée.'), toolCall(`bad-${turn}`, 999)])
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.match(result.data.narrative, /n’a pas pu être résolue/)
  assert.equal(result.data.narrative.includes('inventée'), false)
  assert.notEqual(result.data.newGameState.player.position.x, 999)
})

test('fallback narration retains successful results and refusals and excludes pre-tool claims', async t => {
  const result = await run(t, (params, context, turn) => {
    if (turn === 1) return answer([text('Faux résultat.'), toolCall('bad', 999)])
    if (turn === 2) return answer([toolCall('good', 11)])
    if (turn === 3) return answer([toolCall('duplicate', 12)])
    assert.equal(context.operation, 'dm.final_narration')
    assert.equal(params.tools, undefined)
    const results = params.messages.flatMap(m => Array.isArray(m.content) ? m.content : [])
      .filter(block => block.type === 'tool_result')
    assert.equal(results.length, 3)
    assert.equal(results[0].is_error, true)
    assert.equal(results[1].is_error, undefined)
    assert.equal(results[2].is_error, true)
    assert.equal(JSON.parse(results[2].content).code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
    assert.equal(JSON.stringify(params.messages).includes('Faux résultat'), false)
    return answer([text('Tu avances une seule fois.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.equal(result.data.narrative, 'Tu avances une seule fois.')
  assert.deepEqual(result.data.newGameState.player.position, { x: 11, y: 13 })
})

test('a provider ignoring forced tools cannot bypass mandatory mechanics with prose', async t => {
  const result = await run(t, (_params, context) => {
    assert.equal(context.operation, 'dm.turn')
    return answer([text('Tu réussis sans jet.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.match(result.data.narrative, /n’a pas pu être résolue/)
})

test('a truncated tool response never executes a partial action', async t => {
  const result = await run(t, () => answer([toolCall('partial', 11)], 'max_tokens'))
  assert.equal(result.response.status, 500)
  assert.match(result.data.error, /tronquée/)
  assert.equal(await loadSession(result.sessionId), null)
})

test('MCP isError with plain text from schema validation also allows a corrected retry', async t => {
  const result = await run(t, (params, _context, turn) => {
    if (turn === 1) return answer([toolCall('invalid-schema', -1)])
    if (turn === 2) {
      assert.equal(params.tool_choice.name, 'move_token')
      const last = params.messages.at(-1).content[0]
      assert.equal(last.is_error, true)
      assert.equal(JSON.parse(last.content).code, 'MCP_TOOL_ERROR')
      return answer([toolCall('corrected', 11)])
    }
    return answer([text('Déplacement effectué.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.deepEqual(result.data.newGameState.player.position, { x: 11, y: 13 })
})
