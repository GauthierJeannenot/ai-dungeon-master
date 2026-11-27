const test = require('node:test'), assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error', LLM_MAX_CALLS_PER_REQUEST: '12' })
const pg = installPgMem(), llm = require('../lib/dm/llm.ts'), mcp = require('../lib/mcp-client.ts')
const { POST } = require('../app/api/dm/route.ts'), { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
test.after(() => pg.restore())
const plain = value => JSON.parse(JSON.stringify(value))
const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `search-${name}-${Math.random()}`, name, input }] })
const text = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'La recherche se poursuit uniquement par les appels explicitement choisis et leurs résultats.' }] })

// This fixture isolates application accounting, without claiming to resolve
// navigation or ammunition rules. Their real MCP scenarios are exercised in
// ammunition-search.test.cjs. Here only model calls may mutate the fixture.
for (const checkpoints of [true, false]) test(`the API ${checkpoints ? 'allows moves between performed search checkpoints and recovery' : 'refuses a repeated move without new search credit'}, without selecting calls or destinations`, async t => {
  let state = buildInitialGameState('tide-crypt', 'fighter')
  const sessionId = `dm-ammunition-search-${checkpoints}-${process.pid}-${Date.now()}`, seen = [], chosen = []
  state.combatGeneration = 1
  state.currentMapId = 'shore'
  state.worldTimeSeconds ??= 0
  const searchId = 'selected-search', initialPosition = { ...state.player.position }
  const moves = [{ tokenId: 'player', toCell: { x: initialPosition.x + 1, y: initialPosition.y } },
    { tokenId: 'player', toCell: { x: initialPosition.x + 2, y: initialPosition.y } }]
  const names = ['begin_ammunition_search','advance_ammunition_search','move_token','recover_ammunition','equip_item']
  t.mock.method(mcp, 'listMCPTools', async () => names.map(name => ({ name, description: name, inputSchema: { type: 'object', properties: {} } })))
  t.mock.method(mcp, 'callMCPTool', async (name, input = {}) => {
    if (name === 'get_game_state') return plain(state)
    if (name === 'replace_game_state') { state = plain(input.gameState); return plain(state) }
    seen.push({ name, input: plain(input) })
    if (name === 'begin_ammunition_search') {
      state.dmTools ??= {}
      state.dmTools.ammunition = { expenditures: {}, recoveries: {}, searches: { [input.searchId]: {
        searchId: input.searchId, creation: JSON.stringify(input), combatGeneration: 1, combatGenerationAtStart: 1,
        mapId: state.currentMapId, requiredRoomIds: [state.currentRoomId], expenditures: [], startedAt: state.worldTimeSeconds,
        status: 'active', elapsedSeconds: 0, marks: {}, markOrder: [],
      } } }
    } else if (name === 'advance_ammunition_search') {
      const search = state.dmTools.ammunition.searches[input.searchId]
      search.markOrder.push(input.eventId)
      search.marks[input.eventId] = { eventId: input.eventId, seconds: input.seconds, roomId: state.currentRoomId, cell: { ...state.player.position } }
      search.elapsedSeconds += input.seconds
      state.worldTimeSeconds += input.seconds
    } else if (name === 'move_token') state.player.position = { ...input.toCell }
    else if (name === 'recover_ammunition') {
      assert.equal(state.dmTools.ammunition.searches[input.searchId].elapsedSeconds, 60)
      state.dmTools.ammunition.searches[input.searchId].status = 'completed'
    } else assert.fail(`Unexpected gameplay call ${name}`)
    return { success: true }
  })
  await saveSession(sessionId, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  t.after(async () => { await mcp.closeMCPClient(sessionId); await deleteSession(sessionId) })
  const script = [
    ['begin_ammunition_search', { searchId, combatGeneration: 1 }],
    ['advance_ammunition_search', { searchId, eventId: 'local', seconds: 20 }],
    ['move_token', moves[0]],
    ...(checkpoints ? [['advance_ammunition_search', { searchId, eventId: 'next-room', seconds: 20 }]] : []),
    ['move_token', moves[1]],
    ...(checkpoints ? [['advance_ammunition_search', { searchId, eventId: 'last-room', seconds: 20 }],
      ['recover_ammunition', { searchId, recoveryId: 'one-recovery', combatGeneration: 1, ammunitionType: 'arrow' }],
      ['equip_item', { itemId: 'longsword', slot: 'main_hand', operation: 'unequip' }]] : []),
  ]
  let index = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    if (index === script.length) {
      const block = params.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === 'tool_result').at(-1)
      assert.equal(block.is_error, true)
      assert.equal(JSON.parse(block.content).code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
      return text()
    }
    const [name, input] = script[index++]
    if (index !== script.length) chosen.push({ name, input: plain(input) })
    return tool(name, input)
  })
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, adventureId: state.adventureId, characterId: state.characterId, message: 'Je cherche les munitions de ce combat dans les lieux parcourus.' }) }))
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  assert.deepEqual(seen, chosen, 'the server forwards exact chosen moves and checkpoints, and fabricates none')
  assert.deepEqual(result.newGameState.player.position, checkpoints ? moves[1].toCell : moves[0].toCell)
  assert.equal(result.newGameState.dmTools.ammunition.searches[searchId].status, checkpoints ? 'completed' : 'active')
  assert.deepEqual(plain((await loadSession(sessionId)).gameState), result.newGameState, 'the application persists the actual returned state without completing the search itself')
})
