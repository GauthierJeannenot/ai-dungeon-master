const test = require('node:test'), assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error', LLM_MAX_CALLS_PER_REQUEST: '9' })
const pg = installPgMem(), llm = require('../lib/dm/llm.ts'), mcp = require('../lib/mcp-client.ts')
const { POST } = require('../app/api/dm/route.ts'), { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, replace } = require('./helpers/mcp-toolkit.cjs')
const { buildPlayerState } = require('../mcp-server/dist/lib/character-registry.js')
const { initialHeroState } = require('../mcp-server/dist/lib/hero-state.js')
const { getAdventureMap } = require('../mcp-server/dist/lib/adventure-map.js')
test.after(() => pg.restore())
const plain = value => JSON.parse(JSON.stringify(value))
const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `door-${name}-${Math.random()}`, name, input }] })

test('a confidential door reference and actual passive discovery leave the planned player action available, with exact calls and SQL witnesses', async t => {
  const seed = await engine(t, { adventureId: 'grammys-country-apple-pie', dice: '17,19' })
  const initial = await seed('get_game_state'), door = getAdventureMap(initial).doors.find(door => door.id === 'front')
  const side = door.sides.find(side => side.roomId === '1')
  await replace(seed, state => {
    state.player = buildPlayerState({ characterId: state.characterId, level: 3, position: { ...side.cell } })
    state.hero = initialHeroState(state.characterId, 3)
    state.currentRoomId = side.roomId; state.roomsVisited = [side.roomId]
  })
  ok(await seed('configure_hidden_door', { eventId: 'actual-hidden-panel', doorId: door.id,
    definition: { kind: 'secret', detectionDc: 1, sourceDescription: 'Les joints réellement visibles de cette porte existante sont établis par le MJ.' } }))
  const before = await seed('get_game_state'), metadata = (await seed.client.listTools()).tools, seen = []
  const sessionId = `dm-hidden-door-${process.pid}-${Date.now()}`
  await saveSession(sessionId, { gameState: before, history: [], adventureId: before.adventureId, characterId: before.characterId })
  t.after(async () => { await mcp.closeMCPClient(sessionId); await deleteSession(sessionId) })
  t.mock.method(mcp, 'listMCPTools', async () => metadata)
  t.mock.method(mcp, 'callMCPTool', async (name, input = {}) => {
    if (!['get_game_state', 'replace_game_state'].includes(name)) {
      assert.ok(['inspect_hidden_doors','resolve_door_discovery','roll_ability_check'].includes(name), `No opening, move or fabricated call: ${name}`)
      seen.push({ name, input: plain(input) })
    }
    return seed(name, input)
  })
  const calls = [
    { name: 'inspect_hidden_doors', input: { doorId: door.id } },
    { name: 'resolve_door_discovery', input: { eventId: 'actual-passive', doorId: door.id, cell: side.cell, method: 'passive' } },
    { name: 'roll_ability_check', input: { entityId: 'player', ability: 'wis', dc: 10 } },
  ]
  let turn = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn'); ++turn
    if (turn <= calls.length) {
      if (turn === 3) {
        assert.equal(params.tool_choice, undefined)
        assert.equal(context.gameState.hero.actionCredits, before.hero.actionCredits)
        assert.equal(Boolean(context.gameState.actionUsed.player), Boolean(before.actionUsed.player))
      }
      const { name, input } = calls[turn - 1]; return tool(name, input)
    }
    if (turn === 4) return tool('roll_ability_check', { entityId: 'player', ability: 'int', dc: 10 })
    assert.equal(turn, 5)
    const block = params.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === 'tool_result').at(-1)
    assert.equal(block.is_error, true); assert.equal(JSON.parse(block.content).code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Tu distingues les joints de la porte, puis effectues ton examen distinct. La porte demeure fermée.' }] }
  })
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, adventureId: before.adventureId, characterId: before.characterId, message: 'Je prends en compte ce que je remarque et réalise mon examen.' }) }))
  const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result))
  assert.deepEqual(seen, calls)
  const after = result.newGameState
  assert.ok(Object.values(after.dmTools.doorDiscovery.records)[0].discovered)
  assert.equal(after.sceneMemory?.doorStates?.[door.id] ?? door.initialState, 'closed')
  assert.deepEqual(after.player.position, before.player.position)
  assert.deepEqual(plain((await loadSession(sessionId)).gameState), after)
  assert.equal(ok(await seed('roll_dice', { notation: '1d20' })).total, 19, 'the confidential read and passive discovery roll no extra die')
})
