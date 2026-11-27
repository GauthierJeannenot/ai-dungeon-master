const test = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
const restore = require('./helpers/ts-require.cjs').installTsRequireWithAliases()
test.after(restore)
const { getCharacterTemplate } = require('../lib/character-registry.ts')
const { characterSheetFromTemplate } = require('../lib/character-sheet-view.ts')
const { buildDynamicPrompt } = require('../lib/dm/prompts.ts')

async function engine(t, dice = '1,1,1,1,1,1') {
  const client = new Client({ name: 'charm-person-test', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, ADVENTURE_ID: 'sarah-of-yellowcrest-manor', CHARACTER_ID: 'bard', AI_DM_TEST_DICE_SEQUENCE: dice } }))
  t.after(() => client.close())
  return async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args })
    return JSON.parse(response.content.find(c => c.type === 'text').text)
  }
}
function ok(result) { assert.ok(!result.error, JSON.stringify(result)); return result }
async function spawn(call, type = 'goblin', cell = { x: 5, y: 8 }) {
  return ok(await call('spawn_monster', { monsterType: type, cell, hpOverride: 200 }))
}
async function sceneNpc(call, id = 'avowed') {
  const state = await call('get_game_state')
  Object.assign(state.npcs[id], { visible: true, position: { x: 5, y: 8 }, roomId: state.currentRoomId, mapId: state.currentMapId })
  ok(await call('replace_game_state', { gameState: state }))
  return state.npcs[id]
}
const cast = (call, targetId, extra = {}) => call('cast_spell', { spellId: 'charm-person', targetId, ...extra })

test('Charm Person is a requested bonus for the level-seven bard, visible in the shared sheet preview', () => {
  const bard = getCharacterTemplate('bard', 7)
  assert.equal(bard.spellcasting.knownSpells.length, 13)
  assert.ok(bard.spellcasting.knownSpells.includes('charm-person'))
  assert.ok(!getCharacterTemplate('bard').spellcasting.knownSpells.includes('charm-person'))
  const sheet = characterSheetFromTemplate(bard, 7)
  assert.match(JSON.stringify(sheet), /Charme-personne/)
})

test('a failed save creates an explicit charm fact and condition, preserved through hydration and scene changes', async t => {
  const call = await engine(t), target = await spawn(call)
  const result = ok(await cast(call, target.id))
  assert.equal(result.charmed, true)
  assert.equal(result.save.dc, 15)
  assert.equal(result.save.ability, 'wis')
  assert.match(result.worldFact.text, new RegExp(target.id))
  assert.match(result.worldFact.text, /charmé\(e\) par Lyra \(player\)/)
  let state = await call('get_game_state')
  assert.equal(state.player.spellSlots.level1.current, 3)
  assert.ok(state.monsters[target.id].conditions.includes('charmed'))
  assert.equal(state.hero.effects.find(e => e.kind === 'charm-person').concentration, false)
  assert.match(buildDynamicPrompt(state), /est charmé\(e\) par Lyra/)
  ok(await call('replace_game_state', { gameState: state }))
  assert.deepEqual((await call('get_game_state')).worldFacts, state.worldFacts)
  for (let i = 0; i < 10; i++) ok(await call('record_scene_fact', { description: `Conséquence ${i}`, cell: state.player.position }))
  state = await call('get_game_state')
  assert.ok(state.worldFacts.some(f => f.id === result.worldFact.id))
  ok(await call('move_token', { tokenId: 'player', toCell: { x: 7, y: 8 } }))
  assert.ok((await call('get_game_state')).worldFacts.some(f => f.id === result.worldFact.id))
  ok(await call('advance_time', { seconds: 3599 }))
  assert.ok((await call('get_game_state')).monsters[target.id].conditions.includes('charmed'))
  ok(await call('advance_time', { seconds: 1 }))
  state = await call('get_game_state')
  assert.ok(!state.monsters[target.id].conditions.includes('charmed'))
  assert.ok(!state.hero.effects.some(e => e.kind === 'charm-person'))
  assert.match(state.worldFacts.find(f => f.id === result.worldFact.id).text, /a pris fin.*sait/)
  assert.doesNotMatch(buildDynamicPrompt(state), /est charmé\(e\) par Lyra/)
})

test('narrative NPCs use their authored block, keep their disposition and clues, and persist across map travel', async t => {
  const call = await engine(t), npc = await sceneNpc(call)
  const result = ok(await cast(call, npc.id))
  assert.equal(result.charmed, true)
  const state = await call('get_game_state')
  assert.equal(state.monsters[npc.id], undefined, 'no combatant is spawned')
  assert.equal(state.npcs[npc.id].disposition, npc.disposition)
  assert.equal(state.worldFacts.filter(f => f.clueId).length, 0)
  state.npcs.sarah.disposition = 'helpful'
  state.player.inventory.push({ id: 'sarah_diary_copy', name: 'Copie du journal', type: 'misc' })
  ok(await call('replace_game_state', { gameState: state }))
  ok(await call('travel_to_map', { toMapId: 'waterdeep' }))
  const after = await call('get_game_state')
  assert.ok(after.worldFacts.some(f => f.id === result.worldFact.id), 'travel keeps charm memory even after expiry')
  assert.equal(after.npcs[npc.id].disposition, npc.disposition)
})

test('successful saves spend the action and slot but never create a charm fact', async t => {
  const call = await engine(t, '20'), target = await spawn(call)
  const result = ok(await cast(call, target.id))
  assert.equal(result.charmed, false)
  assert.equal(result.save.success, true)
  const state = await call('get_game_state')
  assert.equal(state.player.spellSlots.level1.current, 3)
  assert.ok(!state.monsters[target.id].conditions.includes('charmed'))
  assert.ok(!state.worldFacts.some(f => f.source === 'cast_spell:charm-person'))
})

test('fighting humanoids save with advantage and a valid cast consumes one combat action', async t => {
  const call = await engine(t, '1,20'), target = await spawn(call)
  const state = await call('get_game_state')
  Object.assign(state, { phase: 'combat', round: 1, currentTurn: 'player', initiativeOrder: ['player', target.id] })
  ok(await call('replace_game_state', { gameState: state }))
  const result = ok(await cast(call, target.id))
  assert.equal(result.save.success, true, 'second d20 wins with advantage')
  const after = await call('get_game_state')
  assert.equal(after.actionUsed.player, true)
  assert.equal(after.hero.actionCredits, 0)
  assert.equal((await cast(call, target.id)).code, 'ACTION_ALREADY_USED')
})

test('missing, duplicate, nonhumanoid, hidden, out-of-range and unstattted targets never spend resources', async t => {
  const call = await engine(t), undead = await spawn(call, 'ghost')
  const initial = await call('get_game_state')
  for (const [args, code] of [
    [{}, 'TARGET_REQUIRED'],
    [{ targetId: 'missing' }, 'ENTITY_NOT_FOUND'],
    [{ targetId: undead.id }, 'CHARM_REQUIRES_HUMANOID'],
    [{ targetId: 'avowed' }, 'SPELL_TARGET_UNSEEN'],
    [{ targetName: 'quelqu’un' }, 'TARGET_ID_REQUIRED'],
    [{ targetIds: [undead.id, undead.id], slotLevel: 2 }, 'TARGET_DUPLICATE'],
  ]) {
    assert.equal((await call('cast_spell', { spellId: 'charm-person', ...args })).code, code)
    assert.deepEqual(await call('get_game_state'), initial)
  }
  const npc = await sceneNpc(call)
  for (const changes of [{ position: { x: 16, y: 2 } }, { mapId: 'waterdeep' }]) {
    const state = structuredClone(initial)
    Object.assign(state.npcs[npc.id], npc, changes)
    const before = ok(await call('replace_game_state', { gameState: state }))
    assert.ok((await cast(call, npc.id)).error)
    assert.deepEqual(await call('get_game_state'), before)
  }
  const state = structuredClone(initial)
  state.npcs.unknown = { ...npc, id: 'unknown', kind: 'unsourced-person' }
  delete state.npcs.unknown.statBlock // This fixture genuinely has no authored mechanical block.
  const before = ok(await call('replace_game_state', { gameState: state }))
  assert.equal((await cast(call, 'unknown')).code, 'NPC_STATS_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
  await sceneNpc(call, 'yaeda')
  const groupBefore = await call('get_game_state')
  assert.equal((await cast(call, 'yaeda')).code, 'NPC_STATS_REQUIRED', 'a group token cannot stand in for one selected humanoid')
  assert.deepEqual(await call('get_game_state'), groupBefore)
})

test('upcasting affects only explicit humanoids and respects the chosen slot target limit', async t => {
  const call = await engine(t), a = await spawn(call), b = await spawn(call, 'goblin', { x: 6, y: 8 })
  const before = await call('get_game_state')
  assert.equal((await call('cast_spell', { spellId: 'charm-person', targetIds: [a.id, b.id] })).code, 'TARGET_COUNT_INVALID')
  assert.deepEqual(await call('get_game_state'), before)
  const result = ok(await call('cast_spell', { spellId: 'charm-person', targetIds: [a.id, b.id], slotLevel: 2 }))
  assert.deepEqual(result.targets, [a.id, b.id])
  assert.ok(result.results.every(r => r.charmed))
  const state = await call('get_game_state')
  assert.equal(state.player.spellSlots.level1.current, 4)
  assert.equal(state.player.spellSlots.level2.current, 2)
  assert.equal(state.worldFacts.filter(f => f.source === 'cast_spell:charm-person').length, 2)
})

test('upcast targets must remain within thirty feet of each other even when both are in caster range', async t => {
  const call = await engine(t), a = await spawn(call, 'goblin', { x: 1, y: 8 }), b = await spawn(call, 'goblin', { x: 8, y: 8 })
  const before = await call('get_game_state')
  assert.equal((await call('cast_spell', { spellId: 'charm-person', targetIds: [a.id, b.id], slotLevel: 2 })).code, 'TARGET_SEPARATION')
  assert.deepEqual(await call('get_game_state'), before)
})

test('ending a simultaneous monster charm cannot remove the still-active Charm Person condition', async t => {
  const call = await engine(t), target = await spawn(call)
  ok(await cast(call, target.id))
  const state = await call('get_game_state')
  state.monsterEffects.push({ id: 'other-charm', kind: 'fey-charm', sourceId: 'player', targetId: target.id,
    conditions: ['charmed'], expiresAt: state.worldTimeSeconds + 6 })
  ok(await call('replace_game_state', { gameState: state }))
  ok(await call('advance_time', { seconds: 6 }))
  const after = await call('get_game_state')
  assert.equal(after.monsterEffects.length, 0)
  assert.ok(after.monsters[target.id].conditions.includes('charmed'))
  assert.ok(after.hero.effects.some(e => e.kind === 'charm-person'))
})

test('a charmed attacker cannot harm its caster; only caster/companion harm ends the charm', async t => {
  const call = await engine(t), target = await spawn(call), other = await spawn(call, 'goblin', { x: 6, y: 8 })
  const result = ok(await cast(call, target.id))
  let before = await call('get_game_state')
  assert.equal((await call('update_hp', { entityId: 'player', delta: -1, sourceId: target.id, reason: 'Harm' })).code, 'CHARMED_TARGET_FORBIDDEN')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal((await call('update_hp', { entityId: target.id, delta: -1, reason: 'Unknown harm' })).code, 'DAMAGE_SOURCE_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('update_hp', { entityId: target.id, delta: -1, reason: 'Fall', damageOrigin: 'environment' }))
  ok(await call('update_hp', { entityId: target.id, delta: -1, reason: 'Enemy hit', sourceId: other.id }))
  assert.ok((await call('get_game_state')).monsters[target.id].conditions.includes('charmed'))
  before = await call('get_game_state')
  before.monsters[other.id].hostile = false
  ok(await call('replace_game_state', { gameState: before }))
  ok(await call('update_hp', { entityId: target.id, delta: -1, reason: 'Companion hit', sourceId: other.id }))
  const after = await call('get_game_state')
  assert.ok(!after.monsters[target.id].conditions.includes('charmed'))
  assert.match(after.worldFacts.find(f => f.id === result.worldFact.id).text, /a pris fin.*sait/)
})

test('a missed attack from the caster breaks the charm and prevents a stale active fact', async t => {
  const call = await engine(t, '1,1'), target = await spawn(call)
  const result = ok(await cast(call, target.id))
  const state = await call('get_game_state')
  Object.assign(state, { phase: 'combat', round: 1, currentTurn: 'player', initiativeOrder: ['player', target.id] })
  ok(await call('replace_game_state', { gameState: state }))
  const attack = ok(await call('resolve_player_attack', { targetId: target.id, weaponOrSpell: 'rapier' }))
  assert.equal(attack.hit, false)
  const after = await call('get_game_state')
  assert.ok(!after.monsters[target.id].conditions.includes('charmed'))
  assert.equal(after.worldFacts.find(f => f.id === result.worldFact.id).source, 'cast_spell:charm-person:ended')
})

test('dispel magic ends a narrative NPC charm and updates the same fact', async t => {
  const call = await engine(t), npc = await sceneNpc(call)
  const result = ok(await cast(call, npc.id))
  const state = await call('get_game_state')
  state.player.knownSpells.push('dispel-magic') // isolate dispel lifecycle from the bard spell selection
  ok(await call('replace_game_state', { gameState: state }))
  ok(await call('cast_spell', { spellId: 'dispel-magic', targetId: npc.id }))
  const after = await call('get_game_state')
  assert.ok(!after.hero.effects.some(e => e.kind === 'charm-person'))
  assert.match(after.worldFacts.find(f => f.id === result.worldFact.id).text, /a pris fin.*sait/)
  assert.equal(after.npcs[npc.id].disposition, npc.disposition)
})
