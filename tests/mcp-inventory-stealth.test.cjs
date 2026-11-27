const test = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')

async function engine(t, env = {}) {
  const client = new Client({ name: 'inventory-stealth-test', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, ADVENTURE_ID: 'grammys-country-apple-pie', ...env } }))
  t.after(() => client.close())
  return async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args })
    return JSON.parse(result.content.find(block => block.type === 'text').text)
  }
}

test('stealth movement rolls once at the destination DC, persists failure and never creates dock goblins', async t => {
  const call = await engine(t, { AI_DM_TEST_DICE_SEQUENCE: '1,20' })
  const initial = await call('get_game_state')
  initial.sceneMemory = { doorStates: { front: 'open' } } // the dock has no exterior entrance
  await call('replace_game_state', { gameState: initial })
  const invalid = await call('move_token', { tokenId: 'player', toCell: { x: 999, y: 6 }, stealth: true })
  assert.ok(invalid.error)
  const moved = await call('move_token', { tokenId: 'player', toCell: { x: 3, y: 6 }, stealth: true })
  assert.equal(moved.stealthCheck.dc, 13)
  assert.equal(moved.stealthCheck.roll.rolls[0], 1, 'an invalid move must not consume a die')
  assert.equal(moved.stealthCheck.success, false)
  assert.deepEqual(moved.newPosition, { x: 3, y: 6 })
  let state = await call('get_game_state')
  assert.equal(state.combatLog.filter(entry => /Discrétion/.test(entry.action)).length, 1)
  assert.equal(Object.values(state.npcs).some(npc => npc.roomId === '7'), false)
  assert.equal(Object.keys(state.monsters).length, 0)
  state = await call('replace_game_state', { gameState: state })
  assert.equal(state.worldFacts.at(-1).source, 'move_token:stealth')
  assert.match(state.worldFacts.at(-1).text, /ECHEC/)
  const success = await call('move_token', { tokenId: 'player', toCell: { x: 4, y: 6 }, stealth: true })
  assert.equal(success.stealthCheck.success, true)
})

test('stealth uses character proficiency and rejects combat before rolling or moving', async t => {
  const call = await engine(t, { CHARACTER_ID: 'bard', AI_DM_TEST_DICE_SEQUENCE: '10,20' })
  let state = await call('get_game_state')
  state.player.skillProficiencies = ['stealth']
  state.player.expertise = ['stealth']
  state.phase = 'combat'
  state.round = 1
  state.initiativeOrder = ['player']
  state.currentTurn = 'player'
  await call('replace_game_state', { gameState: state })
  const rejected = await call('move_token', { tokenId: 'player', toCell: { x: 5, y: 13 }, stealth: true })
  assert.equal(rejected.code, 'STEALTH_MOVE_EXPLORATION_ONLY')
  assert.deepEqual((await call('get_game_state')).player.position, state.player.position)
  state.phase = 'exploration'; state.initiativeOrder = []; state.currentTurn = null
  await call('replace_game_state', { gameState: state })
  const moved = await call('move_token', { tokenId: 'player', toCell: { x: 3, y: 6 }, stealth: true })
  assert.equal(moved.stealthCheck.roll.rolls[0], 10)
  assert.equal(moved.stealthCheck.expertise, true)
  assert.equal(moved.stealthCheck.roll.modifier,
    Math.floor((state.player.stats.dex - 10) / 2) + 2 * state.player.proficiencyBonus)
})

test('dropping and recovering items preserves exact identity, location, AC and ownership across hydration', async t => {
  const call = await engine(t)
  const initial = await call('get_game_state')
  const sword = initial.player.inventory.find(item => item.id === 'longsword')
  assert.equal((await call('drop_item', { itemId: 'longsword' })).success, true)
  let state = await call('get_game_state')
  assert.equal(state.player.inventory.some(item => item.id === sword.id), false)
  assert.deepEqual(state.droppedItems.longsword.item, sword)
  assert.deepEqual(state.droppedItems.longsword.position, initial.player.position)
  assert.equal((await call('drop_item', { itemId: sword.id })).code, 'ITEM_NOT_OWNED')
  state = await call('replace_game_state', { gameState: state })
  assert.deepEqual(state.droppedItems.longsword.item, sword)
  await call('move_token', { tokenId: 'player', toCell: { x: 14, y: 2 } })
  assert.equal((await call('pick_up_item', { itemId: sword.id })).code, 'ITEM_OUT_OF_REACH')
  await call('move_token', { tokenId: 'player', toCell: initial.player.position })
  const wrongMap = await call('get_game_state')
  wrongMap.droppedItems.longsword.mapId = 'another-map'
  await call('replace_game_state', { gameState: wrongMap })
  assert.equal((await call('pick_up_item', { itemId: sword.id })).code, 'ITEM_OUT_OF_REACH')
  wrongMap.droppedItems.longsword.mapId = initial.currentMapId
  await call('replace_game_state', { gameState: wrongMap })
  assert.equal((await call('pick_up_item', { itemId: sword.id })).success, true)
  assert.equal((await call('pick_up_item', { itemId: sword.id })).code, 'ITEM_NOT_DROPPED')
  await call('drop_item', { itemId: 'shield' })
  assert.equal((await call('get_game_state')).player.ac, initial.player.ac - 2)
  await call('pick_up_item', { itemId: 'shield' })
  state = await call('get_game_state')
  assert.equal(state.player.ac, initial.player.ac)
  assert.deepEqual(state.player.inventory.find(item => item.id === sword.id), sword)
  assert.deepEqual(state.droppedItems, {})
})

test('a deposited sword cannot attack and rejected inventory interactions consume no combat action', async t => {
  const call = await engine(t, { AI_DM_TEST_DICE_SEQUENCE: '20,4' })
  await call('drop_item', { itemId: 'longsword' })
  const monster = await call('spawn_monster', { monsterType: 'goblin', cell: { x: 5, y: 13 } })
  let state = await call('get_game_state')
  const targetId = Object.keys(state.monsters)[0]
  assert.ok(monster)
  state.phase = 'combat'; state.round = 1; state.currentTurn = 'player'; state.initiativeOrder = ['player', targetId]
  await call('replace_game_state', { gameState: state })
  assert.equal((await call('resolve_player_attack', { targetId, weaponOrSpell: 'longsword' })).code, 'WEAPON_NOT_OWNED')
  assert.equal((await call('drop_item', { itemId: 'unknown' })).code, 'ITEM_NOT_OWNED')
  assert.equal((await call('get_game_state')).actionUsed.player, undefined)
  assert.equal((await call('pick_up_item', { itemId: 'longsword' })).success, true)
  assert.equal((await call('get_game_state')).actionUsed.player, true)
  assert.ok((await call('drop_item', { itemId: 'longsword' })).error)
})
