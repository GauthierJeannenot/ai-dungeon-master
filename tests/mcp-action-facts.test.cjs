const test = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  LLM_PROVIDER: 'openai', DM_RATE_LIMIT_PER_MINUTE: '0',
  LLM_MAX_CALLS_PER_REQUEST: '6', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const pg = installPgMem()
const { buildDynamicPrompt, serializeGameState } = require('../lib/dm/prompts.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
const llm = require('../lib/dm/llm.ts')
const { POST } = require('../app/api/dm/route.ts')
test.after(() => pg.restore())
const description = 'L’épée repose au pied de Mac, contre ses racines.'
const deposit = { itemId: 'longsword', nearEntityId: 'mac', description }

async function engine(t) {
  const client = new Client({ name: 'action-facts-test', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, ADVENTURE_ID: 'grammys-country-apple-pie', CHARACTER_ID: 'fighter' } }))
  t.after(() => client.close())
  return async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args })
    const text = result.content.find(block => block.type === 'text').text
    let data
    try { data = JSON.parse(text) } catch { data = { error: text } }
    return { data, isError: Boolean(result.isError) }
  }
}

test('deposit near an explicit actor atomically removes inventory and saves a free fact and fixed landmark', async t => {
  const call = await engine(t)
  const before = (await call('get_game_state')).data
  const item = before.player.inventory.find(item => item.id === 'longsword')
  const result = await call('drop_item', deposit)
  assert.equal(result.isError, false, JSON.stringify(result))
  const state = (await call('get_game_state')).data
  const saved = state.droppedItems.longsword
  assert.equal(state.player.inventory.some(item => item.id === 'longsword'), false)
  assert.deepEqual(saved.item, item)
  assert.deepEqual(saved.position, { x: 4, y: 13 })
  assert.deepEqual(saved.anchor, { entityId: 'mac', name: 'Mac', position: { x: 3, y: 13 } })
  assert.equal(saved.description, description)
  assert.equal(result.data.worldFact.text, description)
  assert.equal(result.data.worldFact.subjectItemId, 'longsword')
  assert.equal(result.data.worldFact.basis, 'ai_interpretation')
  assert.deepEqual(result.data.worldFact.narrativeEffect, { description, cell: saved.position })
  assert.ok(buildDynamicPrompt(state).includes(description))
  const hydrated = await call('replace_game_state', { gameState: state })
  assert.equal(hydrated.isError, false)
  assert.deepEqual(hydrated.data.droppedItems.longsword, saved)
  assert.deepEqual(hydrated.data.worldFacts, state.worldFacts)
})

test('the landmark can move but the sword stays and can only be recovered at the saved ground location', async t => {
  const call = await engine(t)
  await call('drop_item', deposit)
  let state = (await call('get_game_state')).data
  const original = state.droppedItems.longsword
  state.npcs.mac.position = { x: 8, y: 13 }
  await call('replace_game_state', { gameState: state })
  await call('move_token', { tokenId: 'player', toCell: { x: 7, y: 13 } })
  assert.equal((await call('pick_up_item', { itemId: 'longsword' })).data.code, 'ITEM_OUT_OF_REACH')
  assert.deepEqual((await call('get_game_state')).data.droppedItems.longsword, original)
  await call('move_token', { tokenId: 'player', toCell: original.position })
  const retrieved = await call('pick_up_item', { itemId: 'longsword', description: 'L’épée est reprise en main.' })
  assert.equal(retrieved.isError, false)
  state = (await call('get_game_state')).data
  assert.equal(state.droppedItems.longsword, undefined)
  assert.equal(state.player.inventory.filter(item => item.id === 'longsword').length, 1)
  assert.ok(!state.worldFacts.some(fact => fact.source === 'drop_item'))
  assert.ok(!state.worldFacts.some(fact => fact.text === description))
  assert.equal(state.worldFacts.find(fact => fact.subjectItemId === 'longsword').source, 'pick_up_item')
  const redeposit = await call('drop_item', { itemId: 'longsword', toCell: { x: 5, y: 13 }, description: 'L’épée est laissée près du banc.' })
  assert.equal(redeposit.isError, false)
  state = (await call('get_game_state')).data
  assert.deepEqual(state.droppedItems.longsword.position, { x: 5, y: 13 })
  assert.equal(state.droppedItems.longsword.anchor, undefined)
  assert.equal(state.worldFacts.filter(fact => fact.subjectItemId === 'longsword').length, 1)
  assert.equal(state.worldFacts.find(fact => fact.subjectItemId === 'longsword').source, 'drop_item')
})

test('invalid item/landmark/location choices preserve inventory, facts and combat action', async t => {
  const call = await engine(t)
  const initial = (await call('get_game_state')).data
  initial.phase = 'combat'; initial.round = 1; initial.currentTurn = 'player'; initial.initiativeOrder = ['player']
  const before = (await call('replace_game_state', { gameState: initial })).data
  for (const [input, code] of [
    [{ ...deposit, itemId: 'missing' }, 'ITEM_NOT_OWNED'],
    [{ ...deposit, nearEntityId: 'unknown' }, 'ITEM_ANCHOR_NOT_AVAILABLE'],
    [{ ...deposit, nearEntityId: 'dryad_1' }, 'ITEM_ANCHOR_NOT_AVAILABLE'],
    [{ ...deposit, toCell: { x: 4, y: 13 } }, 'ITEM_LOCATION_CONFLICT'],
    [{ itemId: 'longsword', toCell: { x: 10, y: 13 }, description }, 'ITEM_OUT_OF_REACH'],
    [{ itemId: 'longsword', toCell: { x: 99, y: 13 }, description }, 'INVALID_GRID_CELL'],
    [{ ...deposit, description: '   ' }],
  ]) {
    const result = await call('drop_item', input)
    assert.equal(result.isError, true, JSON.stringify(input))
    if (code) assert.equal(result.data.code, code)
    assert.deepEqual((await call('get_game_state')).data, before)
  }
  for (const npcChange of [{ position: { x: 8, y: 13 } }, { mapId: 'another-map' }]) {
    const state = structuredClone(before)
    Object.assign(state.npcs.mac, npcChange)
    const hydrated = (await call('replace_game_state', { gameState: state })).data
    assert.equal((await call('drop_item', deposit)).data.code, 'ITEM_OUT_OF_REACH')
    assert.deepEqual((await call('get_game_state')).data, hydrated)
  }
  await call('replace_game_state', { gameState: before })
  assert.equal((await call('drop_item', deposit)).isError, false)
  const after = (await call('get_game_state')).data
  assert.equal(after.actionUsed.player, true)
  assert.equal((await call('pick_up_item', { itemId: 'longsword' })).data.code, 'ACTION_ALREADY_USED')
  assert.deepEqual((await call('get_game_state')).data, after)
})

test('deposits and retrievals cannot reach through a closed threshold', async t => {
  const call = await engine(t)
  const state = (await call('get_game_state')).data
  state.player.position = { x: 11, y: 13 }
  // An entity placed across the threshold remains unreachable even if its
  // snapshot claims the player room; geometry and current positions decide.
  state.npcs.mac.position = { x: 11, y: 12 }
  await call('replace_game_state', { gameState: state })
  assert.equal((await call('drop_item', deposit)).data.code, 'ITEM_OUT_OF_REACH')
  const sword = state.player.inventory.find(item => item.id === 'longsword')
  state.player.inventory = state.player.inventory.filter(item => item.id !== 'longsword')
  state.droppedItems = { longsword: { item: sword, mapId: 'bakery', roomId: '1', position: { x: 11, y: 12 } } }
  const before = (await call('replace_game_state', { gameState: state })).data
  assert.equal((await call('pick_up_item', { itemId: 'longsword' })).data.code, 'ITEM_OUT_OF_REACH')
  assert.deepEqual((await call('get_game_state')).data, before)
})

test('other narrative actions are remembered without any inventory, HP or turn mutation', async t => {
  const call = await engine(t)
  const initial = (await call('get_game_state')).data
  Object.assign(initial, { phase: 'combat', round: 1, currentTurn: 'player', initiativeOrder: ['player'], actionUsed: { player: true } })
  const before = (await call('replace_game_state', { gameState: initial })).data
  const effect = { description: 'Un signe en forme de spirale a été tracé dans la poussière près du banc.', cell: before.player.position }
  const result = await call('record_scene_fact', effect)
  assert.equal(result.isError, false)
  const after = (await call('get_game_state')).data
  assert.deepEqual(after.player, before.player)
  assert.deepEqual(after.actionUsed, before.actionUsed)
  assert.deepEqual(after.droppedItems, before.droppedItems)
  assert.equal(after.worldFacts[0].text, effect.description)
  assert.equal(after.worldFacts[0].source, 'record_scene_fact')
  assert.equal(after.worldFacts[0].basis, 'ai_interpretation')
  assert.deepEqual(after.worldFacts[0].narrativeEffect, effect)
  const id = `scene-fact-${process.pid}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: after, history: [], summaryContext: 'Résumé sans ce détail.' })
  const loaded = await loadSession(id)
  const hydrated = (await call('replace_game_state', { gameState: loaded.gameState })).data
  assert.ok(buildDynamicPrompt(hydrated, loaded.summaryContext).includes(effect.description))
  const rejected = await call('record_scene_fact', { ...effect, cell: { x: 11, y: 12 } })
  assert.equal(rejected.data.code, 'FACT_WRONG_ROOM')
  assert.deepEqual((await call('get_game_state')).data, hydrated)
})

test('a changed narrative fact is replaced by explicit ID without accumulating contradictory scene facts', async t => {
  const call = await engine(t)
  const cell = { x: 4, y: 13 }
  const original = (await call('record_scene_fact', { description: 'Une spirale est tracée dans la poussière.', cell })).data.worldFact
  const next = await call('record_scene_fact', { description: 'La spirale a été effacée de la poussière.', cell, replaceFactId: original.id })
  assert.equal(next.isError, false)
  const state = (await call('get_game_state')).data
  assert.equal(state.worldFacts.length, 1)
  assert.notEqual(state.worldFacts[0].id, original.id)
  assert.equal(state.worldFacts[0].text, 'La spirale a été effacée de la poussière.')
  assert.ok(buildDynamicPrompt(state).includes(state.worldFacts[0].id))
  assert.ok(!buildDynamicPrompt(state).includes(original.text))
  const rejected = await call('record_scene_fact', { description: 'Un changement.', cell, replaceFactId: original.id })
  assert.equal(rejected.data.code, 'FACT_NOT_REPLACEABLE')
  assert.deepEqual((await call('get_game_state')).data, state)
})

test('free narrative memory cannot overwrite an item location fact or a fact from another scene', async t => {
  const call = await engine(t)
  await call('drop_item', deposit)
  const state = (await call('get_game_state')).data
  const locationFact = state.worldFacts.find(fact => fact.subjectItemId === 'longsword')
  const input = { description: 'L’épée est désormais ailleurs.', cell: { x: 4, y: 13 }, replaceFactId: locationFact.id }
  assert.equal((await call('record_scene_fact', input)).data.code, 'FACT_NOT_REPLACEABLE')
  assert.deepEqual((await call('get_game_state')).data, state)
  const foreign = { ...locationFact, id: 'foreign', source: 'record_scene_fact', subjectItemId: undefined, roomId: '4' }
  state.worldFacts.push(foreign)
  const hydrated = (await call('replace_game_state', { gameState: state })).data
  assert.equal((await call('record_scene_fact', { ...input, replaceFactId: 'foreign' })).data.code, 'FACT_NOT_REPLACEABLE')
  assert.deepEqual((await call('get_game_state')).data, hydrated)
})

const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `${name}-${Math.random()}`, name, input }] })
const text = content => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: content }] })

const lastResult = params => JSON.parse(params.messages.at(-1).content[0].content)
async function session(t, initial = buildInitialGameState()) {
  const id = `action-fact-route-${process.pid}-${Math.random()}`
  await saveSession(id, { gameState: initial, history: [], adventureId: initial.adventureId })
  t.after(async () => { await closeMCPClient(id); await deleteSession(id) })
  return id
}
async function post(id, message) {
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: id, message }) }))
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  return data
}

test('DM chooses an approach before a named deposit; narration, SQL and later prompts receive the placement', async t => {
  const state = buildInitialGameState()
  state.player.position = { x: 7, y: 13 }
  const id = await session(t, state)
  let calls = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.ok(++calls <= 3)
    if (calls === 1) {
      assert.equal(params.tool_choice, undefined)
      return tool('move_token', { tokenId: 'player', toCell: { x: 4, y: 13 } })
    }
    if (calls === 2) {
      assert.equal(params.tool_choice, undefined)
      return tool('drop_item', deposit)
    }
    const result = lastResult(params)
    assert.equal(result.result.description, description)
    assert.equal(result.worldFact.text, description)
    assert.equal(result.inventory.some(item => item.id === 'longsword'), false)
    assert.ok(result.narrationFacts.some(fact => fact.includes(description)))
    return text('Tu rejoins Mac et poses ton épée contre ses racines.')
  })
  const data = await post(id, 'Je dépose mon épée au pied de Mac.')
  assert.deepEqual(data.toolsUsed, ['move_token', 'drop_item'])
  const saved = await loadSession(id)
  assert.equal(saved.gameState.droppedItems.longsword.description, description)
  assert.equal(saved.gameState.worldFacts[0].subjectItemId, 'longsword')
  assert.deepEqual(JSON.parse(serializeGameState(saved.gameState)).player.carriedWeapons, [])
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.ok(JSON.stringify(params.messages).includes(description))
    assert.ok(buildDynamicPrompt(context.gameState).includes(description))
    assert.equal(context.gameState.player.inventory.some(item => item.id === 'longsword'), false)
    return text('Ton épée repose là où tu l’as déposée, contre les racines de Mac.')
  })
  const next = await post(id, 'Où est mon épée ?')
  assert.deepEqual(next.toolsUsed, [])
  assert.deepEqual(next.newGameState.droppedItems.longsword, saved.gameState.droppedItems.longsword)
})

test('a cosmetic memory never changes inventory; only the explicit deposit mutates it', async t => {
  const id = await session(t)
  let calls = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (++calls === 1) return tool('record_scene_fact', { description: 'Une marque figure dans la poussière.', cell: { x: 4, y: 13 } })
    if (calls === 2) {
      assert.equal(params.tool_choice, undefined)
      assert.equal(lastResult(params).success, true)
      assert.equal(context.gameState.player.inventory.some(item => item.id === 'longsword'), true)
      assert.equal(context.gameState.worldFacts.length, 1)
      assert.equal(context.gameState.worldFacts[0].source, 'record_scene_fact')
      return tool('drop_item', deposit)
    }
    return text('Tu poses ton épée au pied de Mac.')
  })
  const data = await post(id, 'Je laisse mon épée au pied de Mac.')
  assert.deepEqual(data.toolsUsed, ['record_scene_fact', 'drop_item'])
  assert.equal(data.newGameState.player.inventory.some(item => item.id === 'longsword'), false)
  assert.equal(data.newGameState.worldFacts.length, 2)
  assert.equal(data.newGameState.worldFacts[1].source, 'drop_item')
})
