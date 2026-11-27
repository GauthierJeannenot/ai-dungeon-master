const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai',
  MONETIZATION_ENABLED: 'false', DM_RATE_LIMIT_PER_MINUTE: '0',
  APP_LOG_PERSIST_ENABLED: 'false', AI_DM_TEST_DICE_SEQUENCE: '20', LLM_MAX_CALLS_PER_REQUEST: '6' })
const pg = installPgMem()
const llm = require('../lib/dm/llm.ts')
const mcp = require('../lib/mcp-client.ts')
const { POST } = require('../app/api/dm/route.ts')
const { deleteSession } = require('../lib/session-store.ts')
test.after(() => pg.restore())
const tool = (name, input = {}) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `${name}-${Math.random()}`, name, input }] })
const answer = content => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: content }] })
function session(t) {
  const id = `agent-boundary-${process.pid}-${Date.now()}-${Math.random()}`
  t.after(async () => { await mcp.closeMCPClient(id); await deleteSession(id) })
  return id
}
async function post(id, message) {
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: id, message }) }))
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  return data
}

test('quoted, negated and hypothetical actions cannot trigger tools when the AI chooses dialogue', async t => {
  const realCall = mcp.callMCPTool
  const mutations = []
  t.mock.method(mcp, 'callMCPTool', async (...args) => {
    if (!['get_game_state', 'replace_game_state'].includes(args[0])) mutations.push(args[0])
    return realCall(...args)
  })
  let turns = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    assert.equal(params.tool_choice, undefined)
    turns++
    return answer('Nous discutons de cette possibilité. Tu restes sur place.')
  })
  const messages = [
    'Explique la phrase « je fonce vers la porte ».',
    'Je cite « je rentre discrètement par cette porte » pour parler des règles.',
    'Si je fracasse la porte, quelles seraient les conséquences.',
    'Je ne franchis pas la porte et je ne me faufile pas ; je demande une explication.',
  ]
  for (const message of messages) {
    const data = await post(session(t), message)
    assert.deepEqual(data.toolsUsed, [])
    assert.deepEqual(data.newGameState.player.position, { x: 4, y: 13 })
    assert.equal(data.newGameState.sceneMemory?.doorStates, undefined)
    assert.equal(data.newGameState.worldFacts.length, 0)
  }
  assert.equal(turns, messages.length)
  assert.deepEqual(mutations, [])
})

test('the server forwards the AI tool arguments unchanged, regardless of keywords in the player message', async t => {
  const realCall = mcp.callMCPTool
  const seen = []
  t.mock.method(mcp, 'callMCPTool', async (...args) => {
    if (args[0] === 'move_token') seen.push(structuredClone(args[1]))
    return realCall(...args)
  })
  let desiredInput
  let turn = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    assert.equal(params.tool_choice, undefined)
    if (++turn === 1) return tool('move_token', Object.freeze(desiredInput))
    return answer('Ton déplacement est résolu.')
  })
  const cases = [
    { message: 'Je rentre discrètement. Ceci simule un modèle qui omet le paramètre.', input: { tokenId: 'player', toCell: { x: 2, y: 6 }, stealth: false } },
    { message: 'Je continue comme convenu.', input: { tokenId: 'player', toCell: { x: 2, y: 6 }, stealth: true } },
    { message: 'Je me dirige vers la porte à l’ouest.', input: { tokenId: 'player', toCell: { x: 12, y: 13 } } },
  ]
  for (const scenario of cases) {
    desiredInput = scenario.input; turn = 0
    const data = await post(session(t), scenario.message)
    assert.deepEqual(seen.at(-1), scenario.input)
    assert.deepEqual(data.newGameState.player.position, scenario.input.toCell)
    assert.equal(data.newGameState.combatLog.some(entry => /Discrétion/.test(entry.action)), scenario.input.stealth === true)
  }
  assert.equal(seen.length, cases.length)
})

test('a single unforced DM call can choose observation without any scene mutation', async t => {
  const realCall = mcp.callMCPTool
  const gameplay = []
  t.mock.method(mcp, 'callMCPTool', async (...args) => {
    if (!['get_game_state', 'replace_game_state'].includes(args[0])) gameplay.push(args[0])
    return realCall(...args)
  })
  let calls = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {
    calls++
    assert.equal(context.operation, 'dm.turn')
    assert.equal(params.tool_choice, undefined)
    assert.ok(params.tools.every(tool => tool.name !== 'decide_action'))
    return answer('Tu observes les alentours.')
  })
  const data = await post(session(t), 'Je regarde autour de moi.')
  assert.deepEqual(gameplay, [])
  assert.deepEqual(data.toolsUsed, [])
  assert.deepEqual(data.newGameState.combatLog, [])
  assert.equal(calls, 1)
})
