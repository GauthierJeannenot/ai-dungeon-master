const test = require('node:test'), assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error', LLM_MAX_CALLS_PER_REQUEST: '12' })
const pg = installPgMem(), llm = require('../lib/dm/llm.ts'), mcp = require('../lib/mcp-client.ts')
const { POST } = require('../app/api/dm/route.ts'), { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, replace } = require('./helpers/mcp-toolkit.cjs')
test.after(() => pg.restore())
const plain = value => JSON.parse(JSON.stringify(value))
const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `rest-${name}-${Math.random()}`, name, input }] })
const text = value => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: value }] })
function latestResult(params) {
  const block = params.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === 'tool_result').at(-1)
  assert.ok(block, 'the model receives the actual preceding tool result')
  return { block, value: JSON.parse(block.content) }
}

for (const kind of ['recorded', 'atomic']) test(`the API permits successive explicit hit-die decisions after one ${kind} short rest, persists them, and rejects an unrelated second action`, async t => {
  const seed = await engine(t, { dice: '4,5,19' })
  await replace(seed, state => { state.player.hp.current = 40; state.player.resources.second_wind.current = 0 })
  const before = await seed('get_game_state'), metadata = (await seed.client.listTools()).tools, seen = []
  const sessionId = `dm-rest-${kind}-${process.pid}-${Date.now()}`
  await saveSession(sessionId, { gameState: before, history: [], adventureId: before.adventureId, characterId: before.characterId })
  t.after(async () => { await mcp.closeMCPClient(sessionId); await deleteSession(sessionId) })
  t.mock.method(mcp, 'listMCPTools', async () => metadata)
  const allowed = ['begin_rest', 'advance_rest', 'finish_rest', 'take_rest', 'spend_rest_hit_die']
  t.mock.method(mcp, 'callMCPTool', async (name, input = {}) => {
    seen.push({ name, input: plain(input) })
    if (!['get_game_state', 'replace_game_state'].includes(name)) assert.ok(allowed.includes(name), `No fabricated or extra gameplay call: ${name}`)
    return seed(name, input)
  })
  const chosen = [], restId = 'api-short-rest'
  let turn = 0, actualRestId, firstResult
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    ++turn
    const emit = (name, input) => { chosen.push({ name, input: plain(input) }); return tool(name, input) }
    if (kind === 'recorded') {
      if (turn === 1) return emit('begin_rest', { restId, kind: 'short' })
      if (turn === 2) return emit('advance_rest', { restId, eventId: 'actual-hour', seconds: 3600, activity: 'light', reason: 'Une heure réelle de repos calme est choisie.' })
      if (turn === 3) return emit('finish_rest', { restId, hitDice: 0 })
    } else if (turn === 1) return emit('take_rest', { kind: 'short', hitDice: 0 })
    const decision = turn - (kind === 'recorded' ? 3 : 1)
    if (decision === 1) {
      const { block, value } = latestResult(params)
      assert.equal(block.is_error, undefined, block.content)
      actualRestId = value.restId
      assert.equal(typeof actualRestId, 'string')
      if (kind === 'recorded') assert.equal(actualRestId, restId)
      assert.equal(context.gameState.player.hp.current, 40)
      assert.equal(context.gameState.worldTimeSeconds, before.worldTimeSeconds + 3600)
      return emit('spend_rest_hit_die', { restId: actualRestId, eventId: 'first-die' })
    }
    if (decision === 2) {
      const { block, value } = latestResult(params)
      assert.equal(block.is_error, undefined, block.content)
      firstResult = value
      assert.equal(context.gameState.player.hp.current, 47)
      return emit('spend_rest_hit_die', { restId: actualRestId, eventId: 'first-die' })
    }
    if (decision === 3) {
      const { block, value } = latestResult(params)
      assert.equal(block.is_error, undefined, block.content)
      assert.equal(value.replayed, true)
      assert.deepEqual(value.roll, firstResult.roll)
      assert.equal(context.gameState.player.hp.current, 47)
      return emit('spend_rest_hit_die', { restId: actualRestId, eventId: 'second-die' })
    }
    if (decision === 4) {
      assert.equal(context.gameState.player.hp.current, 55)
      return tool('equip_item', { itemId: 'longsword', slot: 'main_hand', operation: 'unequip' })
    }
    assert.equal(decision, 5)
    const { block, value } = latestResult(params)
    assert.equal(block.is_error, true)
    assert.equal(value.code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
    return text('Tu termines ton repos court, puis dépenses deux DV après lecture de chaque résultat. Le rejeu du premier ne dépense rien. Le changement d’équipement constitue une autre action et est refusé pour ce message.')
  })
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, message: 'Je me repose une heure et dépense mes DV un par un selon les résultats.', adventureId: before.adventureId, characterId: before.characterId }) }))
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  assert.deepEqual(seen.filter(entry => !['get_game_state', 'replace_game_state'].includes(entry.name)), chosen, 'only exact model-selected calls reach MCP')
  const after = result.newGameState
  assert.equal(after.player.hp.current, 55)
  assert.equal(after.worldTimeSeconds, before.worldTimeSeconds + 3600)
  assert.equal(after.hero.hitDice.current, before.hero.hitDice.current - 2)
  assert.equal(after.player.resources.second_wind.current, 1)
  assert.equal(Object.keys(after.dmTools.rests.receipts).length, 1)
  assert.deepEqual(Object.keys(after.dmTools.rests.receipts[actualRestId].hitDiceContinuation.events), ['first-die', 'second-die'])
  assert.deepEqual(plain((await loadSession(sessionId)).gameState), after, 'the actual period and immutable decisions persist unchanged in SQL')
  assert.equal(ok(await seed('roll_dice', { notation: '1d20' })).total, 19, 'only the two chosen hit dice were rolled')
})
