const test = require('node:test'), assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error', LLM_MAX_CALLS_PER_REQUEST: '12' })
const pg = installPgMem(), llm = require('../lib/dm/llm.ts'), mcp = require('../lib/mcp-client.ts')
const { POST } = require('../app/api/dm/route.ts'), { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
test.after(() => pg.restore())
const plain = value => JSON.parse(JSON.stringify(value))
const source = 'Route, distance et historique réellement établis par le MJ, sans destination choisie par le serveur.'
const route = extra => ({ journeyId: 'chosen-route', origin: 'Origine établie', destination: 'Destination établie', distanceFeet: 1000000,
  terrain: 'normal', actualRouteConfirmed: true, source, ...extra })
const step = (eventId, extra = {}) => ({ eventId, journeyId: 'chosen-route', pace: 'normal', scale: 'hour', durationSeconds: 3600,
  activity: 'watch', rank: 'front', openTerrain: true, source, ...extra })
const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `travel-${name}-${Math.random()}`, name, input }] })
const text = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Tu parcours uniquement la distance résolue par le moteur, sans déplacement implicite du pion.' }] })
function latest(params) {
  const block = params.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === 'tool_result').at(-1)
  assert.ok(block); return { block, result: JSON.parse(block.content) }
}
async function prepare(seed, distanceFeet) {
  ok(await seed('begin_nutrition_tracking', { eventId: 'nutrition', operation: 'begin', standardNeedsConfirmed: true, hotWeather: false,
    source, foodDebtHalfDays: 0, priorDeprivation: 'none' }))
  ok(await seed('begin_travel_tracking', { eventId: 'walking-history', dayStartsAt: 0, knownWalkingSeconds: 0, historyKnown: true, source }))
  ok(await seed('create_travel_route', route(distanceFeet === undefined ? {} : { distanceFeet })))
}
async function bind(t, seed) {
  const before = await seed('get_game_state'), seen = [], sessionId = `dm-travel-${process.pid}-${Date.now()}-${Math.random()}`
  const metadata = (await seed.client.listTools()).tools
  t.mock.method(mcp, 'listMCPTools', async () => metadata)
  t.mock.method(mcp, 'callMCPTool', async (name, input = {}) => {
    if (!['get_game_state', 'replace_game_state'].includes(name)) {
      assert.ok(['advance_travel','create_travel_route','resolve_forced_march'].includes(name), `No extra or fabricated gameplay call: ${name}`)
      seen.push({ name, input: plain(input) })
    }
    return seed(name, input)
  })
  await saveSession(sessionId, { gameState: before, history: [], adventureId: before.adventureId, characterId: before.characterId })
  t.after(async () => { await mcp.closeMCPClient(sessionId); await deleteSession(sessionId) })
  return { before, seen, async post() {
    const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, adventureId: before.adventureId, characterId: before.characterId, message: 'Je poursuis ce même trajet avec les étapes et sauvegardes nécessaires.' }) }))
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result))
    assert.deepEqual(plain((await loadSession(sessionId)).gameState), result.newGameState, 'the authoritative distance/time/save receipts persist unchanged in SQL')
    return result.newGameState
  } }
}

test('one selected journey permits successive real segments and exact replay, but another journey is a separate action', async t => {
  const seed = await engine(t, { dice: '19' }); await prepare(seed, 31680)
  const f = await bind(t, seed), chosen = []
  const script = [['advance_travel', step('first')], ['advance_travel', step('first')], ['advance_travel', step('second')],
    ['create_travel_route', route({ journeyId: 'another-route' })], ['advance_travel', step('other-first', { journeyId: 'another-route' })]]
  let turn = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    if (turn === script.length) {
      const { block, result } = latest(params)
      assert.equal(block.is_error, true); assert.equal(result.code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
      return text()
    }
    const [name, input] = script[turn++]
    if (turn < script.length) chosen.push({ name, input: plain(input) })
    return tool(name, input)
  })
  const after = await f.post()
  assert.deepEqual(f.seen, chosen)
  assert.equal(after.worldTimeSeconds, f.before.worldTimeSeconds + 7200)
  assert.equal(after.dmTools.travel.routes['chosen-route'].progressedFeet, 31680)
  assert.equal(after.dmTools.travel.routes['chosen-route'].status, 'distance_complete')
  assert.equal(after.dmTools.travel.routes['another-route'].progressedFeet, 0)
  assert.deepEqual(after.player.position, f.before.player.position)
  assert.equal(after.currentMapId, f.before.currentMapId)
  assert.equal(ok(await seed('roll_dice', { notation: '1d20' })).total, 19)
})

test('successive real forced hours keep the exact chosen saves between segments, without free rest or server-selected resolution', async t => {
  const seed = await engine(t, { dice: '1,20,19' }); await prepare(seed)
  ok(await seed('advance_travel', step('first-eight', { scale: 'day', durationSeconds: 28800 })))
  const f = await bind(t, seed), chosen = []; let turn = 0
  const emit = (name, input) => { chosen.push({ name, input: plain(input) }); return tool(name, input) }
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn'); ++turn
    if (turn === 1) return emit('advance_travel', step('ninth'))
    if (turn === 2 || turn === 4) {
      const event = context.gameState.dmTools.travel.pendingForcedMarch
      assert.ok(event); assert.equal(event.hour, turn === 2 ? 9 : 10)
      return emit('resolve_forced_march', { eventId: event.eventId })
    }
    if (turn === 3) return emit('advance_travel', step('tenth'))
    if (turn === 5) return tool('take_rest', { kind: 'short', hitDice: 0 })
    assert.equal(turn, 6)
    const { block, result } = latest(params)
    assert.equal(block.is_error, true); assert.equal(result.code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
    return text()
  })
  const after = await f.post()
  assert.deepEqual(f.seen, chosen)
  assert.equal(after.worldTimeSeconds, 36000)
  assert.equal(after.dmTools.travel.days['0'].walkingSeconds, 36000)
  assert.equal(after.dmTools.travel.pendingForcedMarch, undefined)
  assert.equal(after.dmTools.exhaustion.creatures.player.level, 1)
  assert.deepEqual(after.player.position, f.before.player.position)
  assert.equal(ok(await seed('roll_dice', { notation: '1d20' })).total, 19)
})
