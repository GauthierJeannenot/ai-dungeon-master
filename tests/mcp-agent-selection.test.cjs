const test = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')

async function engine(t, env = {}) {
  const client = new Client({ name: 'agent-selection', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'], env: {
    ...process.env, ADVENTURE_ID: 'grammys-country-apple-pie', CHARACTER_ID: 'wizard', AI_DM_TEST_DICE_SEQUENCE: '20,1,1', ...env,
  } }))
  t.after(() => client.close())
  return async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args })
    try { return JSON.parse(result.content[0].text) }
    catch { return { error: result.content[0].text, isError: result.isError } }
  }
}

test('missing or ambiguous target/weapon/spell choices are refused without dice, cost or mutation', async t => {
  const call = await engine(t)
  await call('spawn_monster', { monsterType: 'goblin', cell: { x: 5, y: 13 }, name: 'Garde est' })
  await call('spawn_monster', { monsterType: 'goblin', cell: { x: 4, y: 12 }, name: 'Garde nord' })
  const initial = await call('get_game_state')
  const targetId = Object.keys(initial.monsters)[0]
  initial.phase = 'combat'; initial.round = 1; initial.currentTurn = 'player'; initial.initiativeOrder = ['player', ...Object.keys(initial.monsters)]
  const before = await call('replace_game_state', { gameState: initial })
  assert.equal((await call('resolve_player_attack', { weaponOrSpell: 'dagger' })).code, 'TARGET_REQUIRED')
  assert.ok((await call('resolve_player_attack', { targetId })).error, 'weapon cannot be chosen implicitly')
  assert.equal((await call('resolve_player_attack', { targetHint: 'nearest', weaponOrSpell: 'dagger' })).code, 'TARGET_AMBIGUOUS')
  assert.equal((await call('resolve_player_attack', { targetName: 'Garde', weaponOrSpell: 'dagger' })).code, 'TARGET_NOT_FOUND')
  assert.equal((await call('resolve_player_attack', { targetId, weaponOrSpell: 'je ne frappe pas avec une dague' })).code, 'WEAPON_UNKNOWN')
  assert.equal((await call('cast_spell', { spellId: 'magic-missile' })).code, 'TARGET_REQUIRED')
  assert.equal((await call('cast_spell', { spellName: 'je ne lance pas projectile magique', targetId })).code, 'SPELL_UNKNOWN')
  assert.deepEqual(await call('get_game_state'), before)
  const attack = await call('resolve_player_attack', { targetId, weaponOrSpell: 'dagger' })
  assert.equal(attack.naturalRoll, 20, 'refused actions consumed no dice')
  assert.equal(attack.targetId, targetId)
})

test('a travel reason cannot select a map, even when only one transition exists', async t => {
  const call = await engine(t, { ADVENTURE_ID: 'fey-shadow-fair' })
  const before = await call('get_game_state')
  assert.equal((await call('travel_to_map', { reason: 'Je franchis le portail vers le bois ricanant.' })).code, 'NO_MAP_TRANSITION')
  assert.equal((await call('travel_to_map', {})).code, 'NO_MAP_TRANSITION')
  assert.equal((await call('travel_to_map', { transitionId: 'does-not-exist', toMapId: 'wood' })).code, 'NO_MAP_TRANSITION')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal((await call('travel_to_map', { toMapId: 'wood', reason: 'Texte ignoré pour le choix.' })).code, 'MAP_QUEST_INCOMPLETE')
})
