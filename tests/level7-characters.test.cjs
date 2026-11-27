const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
test.after(restore)
const registry = require('../lib/character-registry.ts')
const { getSpell, spellAtLevel } = require('../lib/srd/spells.ts')
const { getSkill } = require('../lib/srd/skills.ts')
const { loadContextFiles } = require('../lib/context-loader.ts')
const { characterSheetFromTemplate, characterSheetFromPlayerState } = require('../lib/character-sheet-view.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { buildDynamicPrompt } = require('../lib/dm/prompts.ts')
const ADVENTURE_ID = 'sarah-of-yellowcrest-manor'
const expected = { fighter: ['Darian', 67, 18], bard: ['Lyra', 45, 14], wizard: ['Aldric', 37, 12], cleric: ['Séréna', 52, 18] }

async function engine(t, characterId, dice = '15,4,5,15,4,5') {
  const client = new Client({ name: 'level7-characters', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, ADVENTURE_ID, CHARACTER_ID: characterId, AI_DM_TEST_DICE_SEQUENCE: dice } }))
  t.after(() => client.close())
  return async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args })
    return JSON.parse(response.content.find(c => c.type === 'text').text)
  }
}
function ok(result) { assert.ok(!result.error, JSON.stringify(result)); return result }
async function enemy(call, cell = { x: 5, y: 8 }) {
  return ok(await call('spawn_monster', { monsterType: 'goblin', cell, hpOverride: 200 }))
}
async function combat(call, target) {
  const state = await call('get_game_state')
  Object.assign(state, { phase: 'combat', initiativeOrder: ['player', target.id], currentTurn: 'player', round: 1,
    actionUsed: {}, bonusActionUsed: {}, movementUsed: {} })
  return ok(await call('replace_game_state', { gameState: state }))
}

test('level-seven profiles are distinct from historical templates and contain only supported data', () => {
  const profiles = registry.listCharacters(7)
  assert.deepEqual(profiles.map(p => p.id), Object.keys(expected))
  for (const profile of profiles) {
    const [name, hp, ac] = expected[profile.id]
    const base = registry.getCharacterTemplate(profile.id)
    assert.equal(base.proficiencyBonus, 2)
    assert.notEqual(profile, base)
    assert.equal(profile.name, name)
    assert.equal(profile.proficiencyBonus, 3)
    assert.equal(registry.maxHpForLevel(profile, 7), hp)
    assert.equal(profile.ac, ac)
    assert.equal(new Set(profile.inventory.map(i => i.id)).size, profile.inventory.length)
    assert.ok(profile.skillProficiencies.every(id => getSkill(id)))
    for (const id of profile.expertise ?? []) assert.ok(profile.skillProficiencies.includes(id))
    if (profile.spellcasting) {
      assert.deepEqual(profile.spellcasting.slots, { level1: 4, level2: 3, level3: 3, level4: 1 })
      for (const id of profile.spellcasting.cantrips) assert.equal(getSpell(id)?.level, 0)
      for (const id of profile.spellcasting.knownSpells) assert.ok(getSpell(id)?.level >= 1 && getSpell(id)?.level <= 4)
    }
    const text = fs.readFileSync(`characters/${profile.id}/level7.ts`, 'utf8')
    assert.doesNotMatch(text, /Yellowcrest|Candlekeep|Greenfast|Gaernoo/)
    const sheet = loadContextFiles(ADVENTURE_ID, profile.id).playerCharacter
    assert.match(sheet, new RegExp(name))
    assert.match(sheet, /niveau 7/)
    assert.match(sheet, new RegExp(`${hp} PV`))
    const preview = characterSheetFromTemplate(base, 7)
    const player = buildInitialGameState(ADVENTURE_ID, profile.id).player
    assert.equal(preview.level, 7)
    assert.equal(preview.hp.max, player.hp.max)
    assert.deepEqual(preview.abilities.map(a => a.score), Object.values(player.stats))
    if (player.spellSlots) {
      assert.deepEqual(preview.spellcasting.levels.map(g => g.slots.max), [4, 3, 3, 1])
      assert.deepEqual(characterSheetFromPlayerState(player).spellcasting.levels.map(g => g.level), [1, 2, 3, 4])
    }
  }
  assert.equal(registry.getCharacterTemplate('fighter').name, 'Héros')
  assert.equal(registry.buildPlayerState({ level: 3, position: { x: 0, y: 0 } }).hp.max, 36)
  assert.match(loadContextFiles('tide-crypt', 'wizard').playerCharacter, /Intelligence \(INT\) \| 16/)
})

test('new spell and class sources preserve exact API responses, and scaling is a pure SRD calculation', () => {
  const sources = require('../lib/srd/level7-sources.json')
  for (const record of Object.values(sources.records)) {
    assert.equal(record.sha256, crypto.createHash('sha256').update(JSON.stringify(record.source)).digest('hex'))
    if (record.source.level !== undefined && record.url.includes('/spells/')) assert.equal(getSpell(record.source.index).level, record.source.level)
  }
  assert.equal(spellAtLevel(getSpell('ray-of-frost'), 7, 0).effect.damage, '2d8')
  assert.equal(spellAtLevel(getSpell('magic-missile'), 7, 4).effect.damage, '6d4+6')
  assert.equal(spellAtLevel(getSpell('cure-wounds'), 7, 3).effect.amount, '3d8+MOD')
  assert.equal(getSpell('ray-of-frost').effect.damage, '1d8', 'no mutation of shared spell data')
})

for (const characterId of Object.keys(expected)) test(`${characterId}: engine spawn, client preview and hydration agree on the level-seven profile`, async t => {
  const call = await engine(t, characterId), initial = await call('get_game_state')
  const client = buildInitialGameState(ADVENTURE_ID, characterId)
  assert.deepEqual(initial.player, client.player)
  ok(await call('replace_game_state', { gameState: initial }))
  const after = await call('get_game_state')
  assert.deepEqual(after.player, initial.player)
  const prompt = buildDynamicPrompt(after)
  assert.match(prompt, new RegExp(expected[characterId][0]))
  if (characterId !== 'fighter') assert.match(prompt, /level4/)
})

test('fighter extra attacks spend one action; invalid second choice has no effect, and surge restores only the action', async t => {
  const call = await engine(t, 'fighter', '15,4,15,4,5,15,4'), target = await enemy(call)
  await combat(call, target)
  const before = await call('get_game_state')
  const invalid = await call('resolve_player_multiattack', { attacks: [
    { targetId: target.id, weaponOrSpell: 'longsword' }, { targetId: 'missing', weaponOrSpell: 'longsword' },
  ] })
  assert.ok(invalid.error)
  assert.deepEqual(await call('get_game_state'), before)
  const result = ok(await call('resolve_player_multiattack', { attacks: [
    { targetId: target.id, weaponOrSpell: 'longsword' }, { targetId: target.id, weaponOrSpell: 'longsword' },
  ] }))
  assert.equal(result.attacks.length, 2)
  assert.equal(result.attacks[0].hit, true)
  assert.equal(result.attacks[0].damageDealt, 10) // Dueling adds +2.
  assert.equal((await call('resolve_player_attack', { targetId: target.id, weaponOrSpell: 'longsword' })).code, 'ACTION_ALREADY_USED')
  ok(await call('use_class_feature', { featureId: 'second_wind' }))
  const used = await call('get_game_state')
  ok(await call('use_class_feature', { featureId: 'action_surge' }))
  const surged = await call('get_game_state')
  assert.equal(Boolean(surged.actionUsed.player), false)
  assert.deepEqual(surged.movementUsed, used.movementUsed)
  assert.deepEqual(surged.bonusActionUsed, used.bonusActionUsed)
  assert.equal(surged.player.resources.action_surge.current, 0)
  ok(await call('resolve_player_multiattack', { attacks: [{ targetId: target.id, weaponOrSpell: 'longsword' }] }))
  assert.equal((await call('use_class_feature', { featureId: 'action_surge' })).code, 'RESOURCE_EXHAUSTED')
})

test('wizard cantrip and upcast damage use level-seven dice, while exhausted pools never select higher slots implicitly', async t => {
  const call = await engine(t, 'wizard', '15,4,5,1,1,1,1'), target = await enemy(call, { x: 7, y: 8 })
  const ray = ok(await call('cast_spell', { spellId: 'ray-of-frost', targetId: target.id }))
  assert.equal(ray.damageDealt, 9)
  assert.equal(ray.damageRoll.notation, '2d8')
  const missile = ok(await call('cast_spell', { spellId: 'magic-missile', targetId: target.id, slotLevel: 2 }))
  assert.equal(missile.damageDealt, 8)
  assert.equal(missile.damageRoll.notation, '4d4+4')
  let state = await call('get_game_state')
  assert.equal(state.player.spellSlots.level1.current, 4)
  assert.equal(state.player.spellSlots.level2.current, 2)
  state.player.spellSlots.level1.current = 0
  ok(await call('replace_game_state', { gameState: state }))
  assert.equal((await call('cast_spell', { spellId: 'magic-missile', targetId: target.id })).code, 'SPELL_SLOTS_EXHAUSTED')
  state = await call('get_game_state')
  assert.equal(state.player.spellSlots.level2.current, 2)
  const before = structuredClone(state)
  assert.equal((await call('cast_spell', { spellId: 'lightning-bolt', targetId: target.id, slotLevel: 1 })).code, 'SPELL_SLOT_LEVEL_INVALID')
  assert.deepEqual(await call('get_game_state'), before)
})

test('dimension door validates destination before debit and teleports within the same map without opening doors', async t => {
  const call = await engine(t, 'wizard'), before = await call('get_game_state')
  assert.equal((await call('cast_spell', { spellId: 'dimension-door' })).code, 'SPELL_DESTINATION_REQUIRED')
  assert.equal((await call('cast_spell', { spellId: 'dimension-door', toCell: { x: 99, y: 99 } })).code, 'INVALID_GRID_CELL')
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('cast_spell', { spellId: 'dimension-door', toCell: { x: 12, y: 4 } }))
  const after = await call('get_game_state')
  assert.equal(after.currentMapId, 'candlekeep')
  assert.equal(after.currentRoomId, '2')
  assert.equal(after.player.spellSlots.level4.current, 0)
})

test('cleric restoration removes only the chosen condition; divination consumes the exact offering and survives hydration', async t => {
  const call = await engine(t, 'cleric', '1')
  ok(await call('equip_item', { itemId: 'mace', operation: 'unequip', slot: 'main_hand' }))
  const state = await call('get_game_state')
  state.player.conditions = ['poisoned', 'blinded']
  ok(await call('replace_game_state', { gameState: state }))
  ok(await call('cast_spell', { spellId: 'lesser-restoration', targetId:'player', condition: 'poisoned' }))
  assert.deepEqual((await call('get_game_state')).player.conditions, ['blinded'])
  const before = await call('get_game_state')
  assert.equal((await call('cast_spell', { spellId: 'divination', materialItemId: 'holy_symbol' })).code, 'SPELL_MATERIAL_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
  const oracle = ok(await call('cast_spell', { spellId: 'divination', materialItemId: 'divination_offering_1' }))
  assert.equal(oracle.oracleReliable, true)
  const spent = await call('get_game_state')
  assert.ok(!spent.player.inventory.some(item => item.id === 'divination_offering_1'))
  assert.equal(spent.player.spellSlots.level4.current, 0)
  ok(await call('replace_game_state', { gameState: spent }))
  assert.deepEqual((await call('get_game_state')).player.spellSlots, spent.player.spellSlots)
  spent.player.spellSlots.level4.current = 1 // Test a second oracle before a map rest.
  ok(await call('replace_game_state', { gameState: spent }))
  assert.equal(ok(await call('cast_spell', { spellId: 'divination', materialItemId: 'divination_offering_2' })).oracleReliable, false)
})

test('long healing prayers require real casting work in combat; map travel preserves spent pools and a long rest restores them', async t => {
  const call = await engine(t, 'cleric'), target = await enemy(call)
  await combat(call, target)
  const before = await call('get_game_state')
  const casting=ok(await call('cast_spell', { spellId: 'prayer-of-healing',targetId:'player' }))
  assert.equal(casting.durationSeconds,600);assert.equal(casting.activeSeconds,6)
  const started=await call('get_game_state');assert.equal(started.worldTimeSeconds,before.worldTimeSeconds);assert.deepEqual(started.player.spellSlots,before.player.spellSlots)
  ok(await call('cancel_casting',{castingId:casting.castingId}))
  ok(await call('end_combat', { force: true, reason: 'Scène de test terminée.' }))
  let state = await call('get_game_state')
  for (const pool of Object.values(state.player.spellSlots)) pool.current = 0
  ok(await call('replace_game_state', { gameState: state }))
  ok(await call('reveal_npc', { npcId: 'sarah', disposition: 'helpful' }))
  ok(await call('pick_up_item', { itemId: 'sarah_diary_copy' }))
  ok(await call('travel_to_map', { toMapId: 'waterdeep' }))
  state = await call('get_game_state')
  assert.deepEqual(Object.values(state.player.spellSlots).map(p => p.current), [0,0,0,0])
  ok(await call('take_rest',{kind:'long'}))
  state = await call('get_game_state')
  assert.deepEqual(Object.values(state.player.spellSlots).map(p => p.current), [4, 3, 3, 1])
})

test('bard expertise and jack-of-all-trades are derived from the profile, not requested flags', async t => {
  const call = await engine(t, 'bard')
  const expert = ok(await call('roll_ability_check', { ability: 'str', skill: 'persuasion', targetId: 'sarah', dc: 10, proficient: false }))
  assert.equal(expert.roll.modifier, 10)
  const untrained = ok(await call('roll_ability_check', { ability: 'str', skill: 'athletics', dc: 10 }))
  assert.equal(untrained.roll.modifier, 0) // STR −1 + half proficiency 1.
})
