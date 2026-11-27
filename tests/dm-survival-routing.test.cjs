const test = require('node:test'), assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { LLM_MODE: 'mock', MONETIZATION_ENABLED: 'false', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_LEVEL: 'error' })
const pg = installPgMem()
const { POST } = require('../app/api/dm/route.ts'), llm = require('../lib/dm/llm.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
const { engine, ok, addSupply } = require('./helpers/mcp-toolkit.cjs')
test.after(() => pg.restore())
const json = value => JSON.parse(JSON.stringify(value))

function responses() {
  let sequence = 0, lastId
  return {
    tool(name, input) {
      lastId = `survival-route-${++sequence}`
      return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: lastId, name, input }] }
    },
    text(text) { return { stop_reason: 'end_turn', content: [{ type: 'text', text }] } },
    result(params) {
      const block = params.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
        .findLast(item => item.type === 'tool_result' && item.tool_use_id === lastId)
      assert.ok(block, `the exact result ${lastId} reaches the model`)
      return JSON.parse(block.content)
    },
  }
}
async function routeSession(t, state, dice) {
  const id = `survival-route-${process.pid}-${Date.now()}-${Math.random()}`
  const previous = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = dice
  t.after(async () => {
    await closeMCPClient(id); await deleteSession(id)
    if (previous === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE
    else process.env.AI_DM_TEST_DICE_SEQUENCE = previous
  })
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  return { id, async play(message) {
    const response = await POST(new Request('http://localhost/api/dm', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: id, message,
        adventureId: state.adventureId, characterId: state.characterId }) }))
    const data = await response.json()
    assert.equal(response.status, 200, JSON.stringify(data))
    assert.deepEqual(json((await loadSession(id)).gameState), data.newGameState)
    return data
  } }
}
function establishedNutrition(eventId) {
  return { eventId, operation: 'begin', standardNeedsConfirmed: true, hotWeather: false,
    source: 'Faits de cette préparation de test : besoins standards et absence de privation antérieure attestés.',
    foodDebtHalfDays: 0, priorDeprivation: 'none' }
}

test('nutrition establishment checkpoints the exact MJ facts without consuming provisions or satisfying a planned check', async t => {
  const call = await engine(t), before = await call('get_game_state')
  const session = await routeSession(t, before, '15,19'), response = responses()
  const facts = establishedNutrition('route-nutrition-establishment')
  let turn = 0, check
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (context.operation === 'dm.final_narration' || context.operation === 'dm.repair_narration')
      return response.text('Tu comprends les signes.')
    turn++
    if (turn === 1) {
      for (const name of ['inspect_survival', 'begin_nutrition_tracking', 'consume_provisions', 'resolve_survival_day'])
        assert.ok(context.availableTools.some(tool => tool.name === name), `${name} is exposed`)
      return response.tool('begin_nutrition_tracking', facts)
    }
    if (turn === 2) {
      assert.equal(params.tool_choice, undefined)
      const checkpoint = (await loadSession(session.id)).gameState
      const nutrition = checkpoint.dmTools.survival
      assert.deepEqual(JSON.parse(nutrition.receipts[facts.eventId].command), { kind: 'begin', input: facts })
      assert.equal(nutrition.source, facts.source)
      assert.deepEqual(nutrition.recoveryIntake, { foodHalfPounds: 0, waterPints: 0 })
      assert.equal(nutrition.day.foodHalfPounds, 0); assert.equal(nutrition.day.waterPints, 0)
      assert.deepEqual(checkpoint.player.inventory, before.player.inventory)
      assert.equal(checkpoint.worldTimeSeconds, before.worldTimeSeconds)
      return response.tool('inspect_survival', {})
    }
    if (turn === 3) {
      assert.equal(params.tool_choice, undefined)
      assert.equal(response.result(params).tracked, true)
      return response.tool('roll_ability_check', { ability: 'int', dc: 10 })
    }
    if (turn === 4) {
      check = response.result(params)
      assert.equal(check.roll.rolls[0], 15, 'establishment and inspection consumed no d20')
      return response.tool('roll_ability_check', { ability: 'int', dc: 10 })
    }
    if (turn === 5) assert.equal(response.result(params).code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
    return response.text('Tu comprends les signes.')
  })
  const data = await session.play('J’examine attentivement les signes pour les comprendre.')
  assert.ok(check)
  assert.deepEqual(data.toolsUsed, ['begin_nutrition_tracking', 'inspect_survival', 'roll_ability_check'])
  assert.deepEqual(data.newGameState.player.hp, before.player.hp)
  assert.deepEqual(data.newGameState.player.inventory, before.player.inventory)
  assert.deepEqual(data.newGameState.dmTools.survival.provisions, {})
  assert.deepEqual(data.newGameState.dmTools.survival.recoveryIntake, { foodHalfPounds: 0, waterPints: 0 })
  assert.equal(Object.keys(data.newGameState.dmTools.survival.receipts).length, 1)
})

test('one explicitly chosen provision consumption uses the primary action and survives SQL and engine round-trips without double debit', async t => {
  const call = await engine(t, { dice: '19' })
  await addSupply(call, 'ration_1_day', 'route-owned-ration')
  const facts = establishedNutrition('route-existing-nutrition')
  ok(await call('begin_nutrition_tracking', facts))
  const before = await call('get_game_state'), session = await routeSession(t, before, '19')
  const response = responses(), chosen = { eventId: 'route-consumed-half-pound', itemId: 'route-owned-ration', units: 1 }
  let turn = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (context.operation === 'dm.final_narration' || context.operation === 'dm.repair_narration')
      return response.text('Tu manges une demi-livre de ta ration et ranges le reste.')
    turn++
    if (turn === 1) return response.tool('consume_provisions', chosen)
    if (turn === 2) {
      assert.equal(response.result(params).remainingUnits, 3)
      const checkpoint = (await loadSession(session.id)).gameState.dmTools.survival
      assert.deepEqual(JSON.parse(checkpoint.receipts[chosen.eventId].command), { kind: 'consume', input: chosen })
      assert.equal(checkpoint.provisions[chosen.itemId].remainingUnits, 3)
      assert.equal(checkpoint.day.foodHalfPounds, 1)
      return response.tool('consume_provisions', { eventId: 'route-unrequested-second-consumption', itemId: chosen.itemId, units: 2 })
    }
    if (turn === 3) {
      assert.equal(response.result(params).code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
      return response.tool('roll_ability_check', { ability: 'int', dc: 10 })
    }
    if (turn === 4) {
      assert.equal(response.result(params).code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
      return response.tool('inspect_survival', {})
    }
    if (turn === 5) {
      const inspection = response.result(params)
      assert.equal(inspection.provisions[chosen.itemId].remainingUnits, 3)
      assert.equal(inspection.day.foodHalfPounds, 1)
    }
    return response.text('Tu manges une demi-livre de ta ration et ranges le reste.')
  })
  const data = await session.play('Je mange une demi-livre de la ration que je possède, puis je range le reste.')
  assert.deepEqual(data.toolsUsed, ['consume_provisions', 'inspect_survival'])
  const nutrition = data.newGameState.dmTools.survival
  assert.deepEqual(nutrition.provisions[chosen.itemId], { kind: 'ration_1_day', remainingUnits: 3 })
  assert.equal(nutrition.day.foodHalfPounds, 1); assert.equal(nutrition.day.waterPints, 0)
  assert.deepEqual(nutrition.recoveryIntake, { foodHalfPounds: 1, waterPints: 0 })
  assert.equal(Object.keys(nutrition.receipts).length, 2)
  assert.equal(nutrition.receipts['route-unrequested-second-consumption'], undefined)
  assert.deepEqual(data.newGameState.player.inventory, before.player.inventory, 'the partly consumed physical ration still exists')
  assert.deepEqual(data.newGameState.player.hp, before.player.hp)
  assert.equal(data.newGameState.worldTimeSeconds, before.worldTimeSeconds)
  ok(await call('replace_game_state', { gameState: data.newGameState }))
  assert.deepEqual((await call('get_game_state')).dmTools.survival, nutrition)
  const replay = ok(await call('consume_provisions', chosen))
  assert.equal(replay.replayed, true); assert.equal(replay.remainingUnits, 3)
  assert.deepEqual((await call('get_game_state')).dmTools.survival, nutrition, 'the persisted event receipt prevents a second physical consumption')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19, 'consumption and restoration used no dice')
})
