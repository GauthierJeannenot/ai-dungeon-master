const test = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')

const reason = 'La diversion établie laisse exceptionnellement le temps de réagir une seconde fois.'
async function engine(t, strict = false) {
  const client = new Client({ name: 'additional-action-test', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, ADVENTURE_ID: strict ? 'sarah-of-yellowcrest-manor' : 'grammys-country-apple-pie',
      CHARACTER_ID: 'fighter', AI_DM_TEST_DICE_SEQUENCE: '10' } }))
  t.after(() => client.close())
  return async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args })
    let data
    try { data = JSON.parse(result.content.find(c => c.type === 'text').text) }
    catch { data = { error: result.content.find(c => c.type === 'text').text } }
    return data
  }
}
function beginMessage(state, requestId = 'message-1') {
  state.dmActionAllowance = { requestId, actionRevisionAtStart: state.playerActionRevision ?? 0,
    granted: false, combatTurnKey: state.dmActionAllowance?.combatTurnKey }
  return state
}

test('an exceptional grant needs a message context, a first action and a nonempty reason, and survives hydration', async t => {
  const call = await engine(t)
  assert.equal((await call('grant_player_action', { reason })).code, 'DM_TURN_REQUIRED')
  await call('replace_game_state', { gameState: beginMessage(await call('get_game_state')) })
  assert.equal((await call('grant_player_action', { reason })).code, 'FIRST_ACTION_REQUIRED')
  await call('roll_ability_check', { ability: 'wis', dc: 1 })
  const before = await call('get_game_state')
  assert.ok((await call('grant_player_action', { reason: '   ' })).error)
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal((await call('grant_player_action', { reason })).additionalPlayerAction, true)
  const saved = await call('get_game_state')
  assert.equal(saved.dmActionAllowance.reason, reason)
  assert.equal(saved.combatLog.at(-1).mechanicalDetail, reason)
  assert.deepEqual((await call('replace_game_state', { gameState: saved })).dmActionAllowance, saved.dmActionAllowance)
  assert.equal((await call('grant_player_action', { reason })).code, 'ADDITIONAL_ACTION_ALREADY_GRANTED')
})

for (const strict of [false, true]) {
  test(`${strict ? 'SRD 2014' : 'legacy'}: a DM grant permits exactly one more combat action without refreshing other budgets`, async t => {
    const call = await engine(t, strict)
    const target = await call('spawn_monster', { monsterType: 'goblin', cell: strict ? { x: 5, y: 8 } : { x: 1, y: 0 } })
    const state = beginMessage(await call('get_game_state'))
    Object.assign(state, { phase: 'combat', currentTurn: 'player', round: 1, initiativeOrder: ['player', target.id],
      actionUsed: {}, bonusActionUsed: { player: true }, movementUsed: { player: 2 } })
    await call('replace_game_state', { gameState: state })
    await call('roll_ability_check', { ability: 'wis', dc: 1 })
    assert.equal((await call('roll_ability_check', { ability: 'int', dc: 1 })).code, 'ACTION_ALREADY_USED')
    assert.equal((await call('grant_player_action', { reason })).additionalPlayerAction, true)
    const granted = await call('get_game_state')
    assert.equal(Boolean(granted.actionUsed.player), false)
    assert.equal(granted.movementUsed.player, 2)
    assert.equal(granted.bonusActionUsed.player, true)
    assert.deepEqual(granted.player.resources, state.player.resources)
    if (strict) assert.equal(granted.hero.actionCredits, 1)
    assert.equal((await call('roll_ability_check', { ability: 'int', dc: 1 })).success, true)
    assert.equal((await call('roll_ability_check', { ability: 'cha', dc: 1 })).code, 'ACTION_ALREADY_USED')
    assert.equal((await call('grant_player_action', { reason })).code, 'ADDITIONAL_ACTION_ALREADY_GRANTED')
    const saved = await call('get_game_state')
    await call('replace_game_state', { gameState: beginMessage(saved, 'message-2') })
    assert.equal((await call('grant_player_action', { reason })).code, 'ADDITIONAL_ACTION_ALREADY_GRANTED', 'a new message cannot repeat the grant in the same combat turn')
    assert.equal((await call('roll_ability_check', { ability: 'cha', dc: 1 })).code, 'ACTION_ALREADY_USED')
  })
}
