const test = require('node:test'), assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error', LLM_MAX_CALLS_PER_REQUEST: '12' })
const pg = installPgMem(), llm = require('../lib/dm/llm.ts'), mcp = require('../lib/mcp-client.ts')
const { POST } = require('../app/api/dm/route.ts'), { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, replace, addSupply, object, adjacent } = require('./helpers/mcp-toolkit.cjs')
test.after(() => pg.restore())
const plain = value => JSON.parse(JSON.stringify(value))
const source = 'Ressource et contenant réels établis par le MJ ; capacités, contenus et masses actuellement connus.'
const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `provisions-${name}-${Math.random()}`, name, input }] })
const text = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Seules les ressources effectivement collectées sont ajoutées ; tu ne les as pas consommées.' }] })
async function container(seed, id) {
  await addSupply(seed, 'waterskin_empty', id)
  ok(await seed('register_water_container', { eventId: 'known-' + id, itemId: id, containerType: 'waterskin', actualContainerConfirmed: true,
    contentsQuarterPints: 0, dryWeightLb: 1, waterWeightLbPerPint: 1, source, hazardFactIds: [] }))
}
async function bind(t, seed, allowed) {
  const before = await seed('get_game_state'), metadata = (await seed.client.listTools()).tools, seen = []
  const sessionId = `dm-provisions-${process.pid}-${Date.now()}-${Math.random()}`
  t.mock.method(mcp, 'listMCPTools', async () => metadata)
  t.mock.method(mcp, 'callMCPTool', async (name, input = {}) => {
    if (!['get_game_state', 'replace_game_state'].includes(name)) {
      assert.ok(allowed.includes(name), `No extra or fabricated gameplay call: ${name}`)
      seen.push({ name, input: plain(input) })
    }
    return seed(name, input)
  })
  await saveSession(sessionId, { gameState: before, history: [], adventureId: before.adventureId, characterId: before.characterId })
  t.after(async () => { await mcp.closeMCPClient(sessionId); await deleteSession(sessionId) })
  return { before, seen, async post(message) {
    const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, message, adventureId: before.adventureId, characterId: before.characterId }) }))
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result))
    assert.deepEqual(plain((await loadSession(sessionId)).gameState), result.newGameState, 'real stock, operations and immutable receipts persist unchanged in SQL')
    return result.newGameState
  } }
}
function last(params) {
  const block = params.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === 'tool_result').at(-1)
  assert.ok(block); return { block, result: JSON.parse(block.content) }
}

test('the model explicitly walks, resolves forage and collects its exact earned food/water within the same journey, without consumption or a second action', async t => {
  const seed = await engine(t, { dice: '9,2,4,19' })
  await container(seed, 'actual-vessel')
  ok(await seed('begin_nutrition_tracking', { eventId: 'nutrition', operation: 'begin', standardNeedsConfirmed: true, hotWeather: false,
    source, foodDebtHalfDays: 0, priorDeprivation: 'none' }))
  ok(await seed('begin_travel_tracking', { eventId: 'walking', dayStartsAt: 0, knownWalkingSeconds: 0, historyKnown: true, source }))
  ok(await seed('create_travel_route', { journeyId: 'actual-route', origin: 'Origine connue', destination: 'Destination connue', distanceFeet: 528000,
    terrain: 'normal', actualRouteConfirmed: true, source }))
  const f = await bind(t, seed, ['advance_travel','resolve_foraging','collect_forage']), chosen = []
  const collection = { eventId: 'earned-collection', attemptId: 'earned-forage', foodHalfPounds: 2, waterTransfers: [{ itemId: 'actual-vessel', quarterPints: 8 }] }
  const script = [
    ['advance_travel', { eventId: 'actual-forage-hour', journeyId: 'actual-route', pace: 'normal', scale: 'hour', durationSeconds: 3600,
      activity: 'forage', rank: 'front', openTerrain: true, source }],
    ['resolve_foraging', { eventId: 'earned-forage', journeyId: 'actual-route', travelEventIds: ['actual-forage-hour'], abundance: 'abundant', source, hazardFactIds: [] }],
    ['collect_forage', collection], ['collect_forage', collection], ['take_rest', { kind: 'short', hitDice: 0 }],
  ]
  let turn = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    if (turn === script.length) {
      const { block, result } = last(params)
      assert.equal(block.is_error, true); assert.equal(result.code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
      return text()
    }
    const [name, input] = script[turn++]
    if (turn < script.length) chosen.push({ name, input: plain(input) })
    return tool(name, input)
  })
  const after = await f.post('Je poursuis ce trajet en cherchant de quoi manger et boire, puis recueille les quantités choisies.')
  assert.deepEqual(f.seen, chosen)
  assert.equal(after.worldTimeSeconds, f.before.worldTimeSeconds + 3600)
  assert.deepEqual(after.player.position, f.before.player.position)
  assert.equal(after.dmTools.foraging.containers['actual-vessel'].contentsQuarterPints, 8)
  assert.equal(after.dmTools.foraging.foods['foraged-food:earned-collection'].remainingHalfPounds, 2)
  assert.equal(after.player.inventory.filter(item => item.id === 'foraged-food:earned-collection').length, 1)
  assert.equal(after.dmTools.survival.day.foodHalfPounds, 0)
  assert.equal(after.dmTools.survival.day.waterPints, 0)
  assert.equal(after.dmTools.foraging.attempts['earned-forage'].remainingFoodHalfPounds, 4)
  assert.equal(after.dmTools.foraging.attempts['earned-forage'].remainingWaterQuarterPints, 152)
  assert.equal(ok(await seed('roll_dice', { notation: '1d20' })).total, 19)
})

test('the API preserves actual source filling, later transfer and a saved fill retry, without creating water, intake, containers or calls', async t => {
  const seed = await engine(t, { dice: '19' }), initial = await seed('get_game_state')
  for (const item of initial.player.inventory) ok(await seed('drop_item', { itemId: item.id }))
  await container(seed, 'first-vessel'); await container(seed, 'second-vessel')
  const current = await seed('get_game_state')
  await replace(seed, state => state.worldFacts.push({ id: 'actual-water-fact', text: 'Réserve d’eau réellement présente et mesurée.', source, mapId: state.currentMapId, expires: 'never' }))
  await object(seed, 'actual-water-object', { kind: 'lever', cell: adjacent(current)[0] })
  ok(await seed('establish_water_source', { eventId: 'actual-water-source', objectId: 'actual-water-object', establishedFactId: 'actual-water-fact',
    actualWaterSourceConfirmed: true, kind: 'finite', quantityQuarterPints: 32, waterWeightLbPerPint: 1, hazardFactIds: [], source }))
  const f = await bind(t, seed, ['fill_water_container','transfer_water']), chosen = []
  const operation = { quarterPints: 8, seconds: 10, cost: 'interaction', handsRequired: 1, objectsManipulated: 1, restActivity: 'light', adjudication: source }
  const fill = { ...operation, eventId: 'actual-fill', objectId: 'actual-water-object', targetItemId: 'first-vessel' }
  const transfer = { ...operation, eventId: 'actual-transfer', sourceItemId: 'first-vessel', targetItemId: 'second-vessel', quarterPints: 5, objectsManipulated: 2 }
  let request = 0, turn = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {
    const name = request === 1 ? 'transfer_water' : 'fill_water_container', input = request === 1 ? transfer : fill

    assert.equal(context.operation, 'dm.turn')
    if (++turn === 1) { chosen.push({ name, input: plain(input) }); return tool(name, input) }
    if (request === 0 && turn === 2) return tool('take_rest', { kind: 'short', hitDice: 0 })
    if (request === 0) { const { block, result } = last(params); assert.equal(block.is_error, true); assert.equal(result.code, 'PRIMARY_ACTION_ALREADY_RESOLVED') }
    if (request === 2) assert.equal(last(params).result.replayed, true)
    return text()
  })
  let after = await f.post('Je remplis le premier récipient avec huit quarts de pinte de cette réserve réelle.')
  assert.equal(after.dmTools.waterSources.sources['actual-water-object'].remainingQuarterPints, 24)
  request = 1; turn = 0
  after = await f.post('Je verse cinq quarts de pinte du premier récipient dans le second.')
  request = 2; turn = 0
  after = await f.post('Je vérifie le reçu exact de mon remplissage précédent.')
  assert.deepEqual(f.seen, chosen)
  assert.equal(after.worldTimeSeconds, f.before.worldTimeSeconds + 20)
  assert.equal(after.dmTools.foraging.containers['first-vessel'].contentsQuarterPints, 3)
  assert.equal(after.dmTools.foraging.containers['second-vessel'].contentsQuarterPints, 5)
  assert.equal(after.dmTools.waterSources.sources['actual-water-object'].remainingQuarterPints, 24)
  assert.equal(after.player.inventory.length, 2)
  assert.equal(after.dmTools.survival, undefined, 'no drinking, meal or nutrition tracking was fabricated')
  assert.equal(ok(await seed('roll_dice', { notation: '1d20' })).total, 19)
})
