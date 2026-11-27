const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
test.after(restore)
const { getAdventureMap } = require('../lib/adventure-map.ts')
const snapshot = require('../lib/srd/monsters.json')
const { project, renderBestiary } = require('../scripts/sync-srd-bestiaries.cjs')
const dice = require('../mcp-server/dist/mcp-server/dice.js')

test('the offline catalog is traceable to complete API records and preserves their numerical statistics', () => {
  assert.equal(snapshot.ruleset, '2014')
  assert.equal(Object.keys(snapshot.monsters).length, 31)
  assert.equal(snapshot.monsters.rat.source.type, 'beast')
  assert.equal(snapshot.monsters.rat.source.size, 'Tiny')
  for (const [type, record] of Object.entries(snapshot.monsters)) {
    const raw = record.source
    assert.equal(record.sourceUrl, `https://www.dnd5eapi.co${raw.url}`)
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex'), record.sourceSha256)
    assert.equal(record.engine.hp.max, raw.hit_points)
    assert.equal(record.engine.ac, raw.armor_class[0].value)
    assert.deepEqual(Object.values(record.engine.stats), [raw.strength, raw.dexterity, raw.constitution, raw.intelligence, raw.wisdom, raw.charisma])
    assert.equal(record.engine.xpValue, raw.xp)
    assert.deepEqual(record.engine, project(type, raw), 'projection must still match the pinned original, not a handwritten block')
    assert.ok(Array.isArray(raw.actions))
    assert.ok(Array.isArray(raw.damage_immunities))
    assert.ok(Array.isArray(raw.condition_immunities))
  }
})

test('previously mixed-up species have their actual SRD values and source traits', () => {
  const data = snapshot.monsters
  assert.equal(data.dryad.engine.stats.cha, 18)
  assert.equal(data.dryad.engine.attackBonus, 2)
  assert.equal(data.dryad.engine.damageDice, '1d4')
  assert.equal(data.zombie.engine.hp.max, 22)
  assert.deepEqual(data.zombie.source.condition_immunities.map(c => c.index), ['poisoned'])
  assert.equal(data.sprite.engine.attackBonus, 2)
  assert.equal(data.sprite.engine.damageDice, '1')
  assert.equal(data.sprite.engine.speed, 10)
  assert.equal(data.sprite.engine.movementModes.fly, 40)
  assert.equal(data.will_o_wisp.engine.speed, 0)
  assert.equal(data.will_o_wisp.engine.movementModes.fly, 50)
  assert.equal(data.violet_fungus.engine.attackRangeCells, 2)
  assert.ok(!JSON.stringify(data.violet_fungus.source).includes('regain hit points'))
  const block = renderBestiary({ title: 'Source', notes: [], creatures: [{ type: 'violet_fungus', title: 'Fungus' }] })
  assert.match(block, /blinded, deafened, frightened/, 'official SRD erratum must correct the duplicate API immunity')
  assert.deepEqual(data.violet_fungus.reference.condition_immunities.map(c => c.index), ['blinded', 'deafened', 'frightened'])
  assert.deepEqual(data.violet_fungus.source.condition_immunities.map(c => c.index), ['blinded', 'blinded', 'frightened'], 'preserve the original API record separately')
  assert.match(block, /SRD officiel, p. 309/)
  assert.equal(data.wight.engine.hp.max, 45)
  assert.equal(data.wight.source.type, 'undead')
  assert.equal(data.ghost.source.type, 'undead')
})

for (const { id } of require('../lib/adventures.ts').ADVENTURES) {
  test(`${id}: bestiary is generated from its own casting, covers engine encounters and contains no silent HP reductions`, () => {
    const manifest = require(`../adventures/${id}/bestiary.json`)
    const map = getAdventureMap(id)
    const covered = new Set(manifest.creatures.map(creature => creature.type))
    const actual = fs.readFileSync(`adventures/${id}/bestiary.md`, 'utf8').replaceAll('\r\n', '\n')
    assert.equal(actual, renderBestiary(manifest), 'regenerate instead of copying another campaign bestiary')
    for (const creature of manifest.creatures) assert.ok(snapshot.monsters[creature.type])
    for (const encounter of Object.values(map.encounters)) for (const monster of encounter.monsters) {
      assert.ok(covered.has(monster.monsterType), `missing bestiary entry: ${monster.monsterType}`)
      assert.equal(monster.hpOverride, undefined, 'authored encounters must use the documented SRD HP')
    }
    for (const npc of map.npcs) {
      if (npc.reactive?.combatTemplate) assert.ok(covered.has(npc.reactive.combatTemplate))
      if (npc.statBlock) assert.ok(snapshot.monsters[npc.statBlock], `missing NPC stat block: ${npc.statBlock}`)
    }
  })
}

async function engine(t, extraEnv = {}) {
  const client = new Client({ name: 'srd-bestiary-test', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, ADVENTURE_ID: 'grammys-country-apple-pie', CHARACTER_ID: 'fighter', ...extraEnv } }))
  t.after(() => client.close())
  return async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args })
    return JSON.parse(response.content.find(c => c.type === 'text').text)
  }
}

test('complete source blocks and monster projection metadata survive an MCP hydration, including zero walking speed', async t => {
  const call = await engine(t)
  const wisp = await call('spawn_monster', { monsterType: 'will_o_wisp', cell: { x: 6, y: 13 } })
  assert.equal(wisp.speed, 0)
  assert.equal(wisp.movementModes.fly, 50)
  assert.equal(wisp.srd.url, snapshot.monsters.will_o_wisp.sourceUrl)
  const state = await call('get_game_state')
  await call('replace_game_state', { gameState: state })
  const after = await call('get_game_state')
  assert.deepEqual(after.monsters[wisp.id], wisp)
  const block = await call('get_monster_stat_block', { monsterId: wisp.id })
  assert.deepEqual(block.source, snapshot.monsters.will_o_wisp.source)
  assert.deepEqual(block.currentMonster, wisp)
  assert.deepEqual(await call('get_game_state'), after, 'looking up a block is read only')
})

test('unknown monster types are refused before spawn or encounter movement; explicit HP variants are labeled', async t => {
  const call = await engine(t)
  const before = await call('get_game_state')
  assert.equal((await call('spawn_monster', { monsterType: 'imaginary_monster', cell: { x: 5, y: 13 } })).code, 'MONSTER_UNKNOWN')
  assert.deepEqual(await call('get_game_state'), before)
  const invalid = await call('start_encounter', { playerCell: { x: 5, y: 13 }, monsters: [
    { monsterType: 'goblin', cell: { x: 6, y: 13 } }, { monsterType: 'goblin_boss', cell: { x: 7, y: 13 } },
  ] })
  assert.equal(invalid.code, 'MONSTER_UNKNOWN')
  assert.deepEqual(await call('get_game_state'), before)
  const variant = await call('spawn_monster', { monsterType: 'goblin', cell: { x: 5, y: 13 }, hpOverride: 4 })
  assert.equal(variant.hp.max, 4)
  assert.equal(variant.srd.hpOverride, 4)
  const base = await call('get_monster_stat_block', { monsterId: variant.id })
  assert.equal(base.source.hit_points, 7)
  assert.equal(base.currentMonster.hp.max, 4)
})

async function combatMonster(call, type) {
  const monster = await call('spawn_monster', { monsterType: type, cell: { x: 5, y: 13 } })
  const state = await call('get_game_state')
  Object.assign(state, { phase: 'combat', round: 1, currentTurn: monster.id, initiativeOrder: [monster.id, 'player'] })
  state.player.ac = 1; state.player.hp = { current: 40, max: 40 }
  await call('replace_game_state', { gameState: state })
  return monster
}

test('sprite sword deals exactly one damage even on a critical hit and never consumes a fake damage die', async t => {
  const call = await engine(t, { AI_DM_TEST_DICE_SEQUENCE: '20,17' })
  const sprite = await combatMonster(call, 'sprite')
  const unsupported = await call('resolve_attack', { attackerId: sprite.id, targetId: 'player', weaponOrSpell: 'Imaginary attack' })
  assert.equal(unsupported.code, 'MONSTER_ACTION_NOT_SUPPORTED')
  const attack = await call('resolve_attack', { attackerId: sprite.id, targetId: 'player', weaponOrSpell: 'Longsword' })
  assert.equal(attack.criticalHit, true)
  assert.equal(attack.damageDealt, 1)
  assert.equal(attack.targetHpAfter, 39)
  assert.deepEqual(attack.damageRoll.rolls, [])
  assert.equal((await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('awakened shrub damage can be zero instead of being artificially increased to one', async t => {
  const call = await engine(t, { AI_DM_TEST_DICE_SEQUENCE: '15,1' })
  const shrub = await combatMonster(call, 'awakened_shrub')
  const attack = await call('resolve_attack', { attackerId: shrub.id, targetId: 'player', weaponOrSpell: 'Rake' })
  assert.equal(attack.hit, true)
  assert.equal(attack.damageDealt, 0)
  assert.equal(attack.targetHpAfter, 40)
})

test('a sourced ten-foot melee attack retains its reach after persistence', async t => {
  const call = await engine(t, { AI_DM_TEST_DICE_SEQUENCE: '15,3' })
  const fungus = await combatMonster(call, 'violet_fungus')
  const state = await call('get_game_state')
  state.monsters[fungus.id].position = { x: 6, y: 13 }
  await call('replace_game_state', { gameState: state })
  const attack = await call('resolve_attack', { attackerId: fungus.id, targetId: 'player', weaponOrSpell: 'Rotting Touch' })
  assert.equal(attack.hit, true)
  assert.equal(attack.damageDealt, 3)
})

test('fixed amounts do not advance deterministic dice sequences', () => {
  const old = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = '17'
  try {
    assert.equal(dice.rollDice('1').total, 1)
    assert.equal(dice.rollDice('0').total, 0)
    assert.equal(dice.rollDice('1d20').total, 17)
  } finally { if (old === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE; else process.env.AI_DM_TEST_DICE_SEQUENCE = old }
})
