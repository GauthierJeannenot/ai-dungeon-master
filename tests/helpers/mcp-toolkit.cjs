const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
const { getMapSpec, inferRoomIdOnMap } = require('../../mcp-server/dist/lib/adventure-map.js')
const { navigationGrid } = require('../../mcp-server/dist/lib/navigation.js')

async function engine(t, { characterId = 'fighter', dice = '', adventureId = 'sarah-of-yellowcrest-manor' } = {}) {
  const client = new Client({ name: 'mcp-toolkit-regression', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, ADVENTURE_ID: adventureId, CHARACTER_ID: characterId, AI_DM_TEST_DICE_SEQUENCE: dice,
      MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false' } }))
  t.after(() => client.close())
  const call = async (name, input = {}) => {
    const response = await client.callTool({ name, arguments: input })
    const text = response.content.find(block => block.type === 'text')?.text
    try { return JSON.parse(text) } catch { return { error: text, code: 'MCP_INPUT_INVALID' } }
  }
  call.client = client
  return call
}
function ok(value) { assert.ok(!value.error, JSON.stringify(value)); return value }
async function replace(call, update) {
  const state = await call('get_game_state')
  update(state)
  return ok(await call('replace_game_state', { gameState: state }))
}
function grid(state, actorId = 'player') {
  return navigationGrid(state, actorId, getMapSpec(state.currentMapId, state).geometry)
}
function adjacent(state) {
  const nav = grid(state), from = state.player.position
  const result = nav.neighbors(from).filter(cell => nav.step(from, cell)
    && inferRoomIdOnMap(cell, state.currentMapId, state) === state.currentRoomId)
  assert.ok(result.length, 'fixture needs a free adjacent cell in the current room')
  return result
}
async function spawn(call, type = 'goblin', cell) {
  const state = await call('get_game_state')
  return ok(await call('spawn_monster', { monsterType: type, cell: cell ?? adjacent(state)[0], hpOverride: 200 }))
}
async function battle(call, ids, currentTurn = 'player') {
  return replace(call, state => {
    Object.assign(state, { phase: 'combat', round: 1, currentTurn, initiativeOrder: ['player', ...ids], actionUsed: {}, bonusActionUsed: {}, movementUsed: {} })
    state.hero.actionCredits = 1
    delete state.hero.attackAction; delete state.hero.pending
  })
}
async function addSupply(call, equipmentId, id = equipmentId) {
  await replace(call, state => state.player.inventory.push({ id, equipmentId, name: equipmentId, type: 'misc' }))
  return id
}
async function object(call, id = 'test-chest', overrides = {}) {
  const state = await call('get_game_state')
  return ok(await call('create_scene_object', { objectId: id, name: 'Coffre', description: 'Un coffre sans autre secret établi.', cell: state.player.position,
    kind: 'container', material: 'wood', size: 'small', resilience: 'resilient', ...overrides }))
}
module.exports = { engine, ok, replace, grid, adjacent, spawn, battle, addSupply, object }
