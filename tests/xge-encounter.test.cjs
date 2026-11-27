const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { readXgeEncounterRatios, readXgeWeakMonsterSource } = require('../mcp-server/dist/mcp-server/rules-library.js')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')

const planned = (...groups) => ({ mode: 'planned', groups })
const group = (monsterType, count = 1) => ({ monsterType, count })
const encounter = (call, input) => call('assess_xge_encounter', input)
const ratio = (rows, challengeRating) => rows.find(row => row.challengeRating === challengeRating)?.ratio

test('all twenty printed XGE rows remain tied to their exact source cells and bands', () => {
  const rows = Array.from({ length: 20 }, (_, index) => readXgeEncounterRatios(index + 1))
  assert.deepEqual(rows.map(row => row.source.rowLine),
    [1216, 1217, 1218, 1219, 1220, 1229, 1230, 1231, 1232, 1233,
      1240, 1241, 1242, 1243, 1244, 1251, 1252, 1253, 1254, 1255])
  assert.deepEqual(ratio(rows[0].ratios, 0.125), { characters: 1, monsters: 2 })
  assert.deepEqual(ratio(rows[6].ratios, 3), { characters: 1, monsters: 1 })
  assert.equal(ratio(rows[0].ratios, 2), null)
  assert.equal(ratio(rows[10].ratios, 0.5), undefined)
  assert.deepEqual(ratio(rows[19].ratios, 20), { characters: 6, monsters: 1 })
  const weak = readXgeWeakMonsterSource()
  assert.equal(weak.title, 'Weak Monsters and High-Level Characters')
  assert.equal(weak.startLine, 1257); assert.equal(weak.endLine, 1259)
  assert.equal(weak.sha256, rows[0].source.sha256)
  assert.equal(weak.tableId, undefined); assert.equal(weak.rowLine, undefined)
  for (const level of [0, 3.5, 21]) assert.throws(() => readXgeEncounterRatios(level), { code: 'XGE_ENCOUNTER_LEVEL_UNSUPPORTED' })
})

test('changed local source bytes are refused even after the original book was cached', t => {
  assert.equal(readXgeEncounterRatios(1).source.book, 'xge')
  assert.equal(readXgeWeakMonsterSource().book, 'xge')
  const original = fs.readFileSync
  const sourcePath = path.join(process.cwd(), 'rules', 'books', 'xge.md')
  t.mock.method(fs, 'readFileSync', (file, ...args) => {
    const value = original(file, ...args)
    return file === sourcePath && Buffer.isBuffer(value) ? Buffer.concat([value, Buffer.from('\n')]) : value
  })
  assert.throws(() => readXgeEncounterRatios(1), { code: 'XGE_ENCOUNTER_SOURCE_UNAVAILABLE' })
  assert.throws(() => readXgeWeakMonsterSource(), { code: 'XGE_ENCOUNTER_SOURCE_UNAVAILABLE' })
})

test('real level-one session compares exact mixed ratios without advancing its state or die', async t => {
  const call = await engine(t, { adventureId: 'grammys-country-apple-pie', dice: '19' })
  const before = await call('get_game_state')
  const below = ok(await encounter(call, planned(group('bandit'))))
  assert.equal(before.player.level, 1)
  assert.equal(below.playerLevel, before.player.level)
  assert.equal(below.partySize, 1)
  assert.deepEqual(below.characterEquivalent, { numerator: 1, denominator: 2 })
  assert.equal(below.comparison, 'below_one_character')
  const equal = ok(await encounter(call, planned(group('bandit', 2))))
  assert.deepEqual(equal.characterEquivalent, { numerator: 1, denominator: 1 })
  assert.equal(equal.comparison, 'equal_to_one_character')
  const over = ok(await encounter(call, planned(group('bandit'), group('goblin'))))
  assert.deepEqual(over.characterEquivalent, { numerator: 3, denominator: 2 })
  assert.equal(over.comparison, 'above_one_character')
  assert.deepEqual(over.groups.map(row => row.challengeRating), [0.125, 0.25])
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('real level-seven catalogue keeps an empty FP cell, exact profile references and no scene disclosure', async t => {
  const call = await engine(t, { characterId: 'cleric' })
  const before = await call('get_game_state')
  const result = ok(await encounter(call, { mode: 'catalogue' }))
  assert.equal(result.confidential, true)
  assert.equal(before.player.level, 7)
  assert.equal(result.playerLevel, before.player.level)
  assert.equal(result.source.rowLine, 1230)
  assert.match(result.source.sha256, /^[a-f0-9]{64}$/)
  const row5 = result.rows.find(row => row.challengeRating === 5)
  assert.deepEqual(row5.ratio, { characters: 3, monsters: 1 })
  assert.equal(row5.wholeMonstersAtOrBelowOneCharacter, 0)
  assert.deepEqual(row5.profiles, [])
  const row3 = result.rows.find(row => row.challengeRating === 3)
  assert.equal(row3.wholeMonstersAtOrBelowOneCharacter, 1)
  assert.ok(row3.profiles.some(p => p.monsterType === 'wight' && /^[a-f0-9]{64}$/.test(p.source.sha256)))
  const profileKeys = ['challengeRating', 'monsterType', 'name', 'source']
  for (const profile of [...result.rows.flatMap(row => row.profiles), ...result.profilesOutsidePrintedColumns])
    assert.deepEqual(Object.keys(profile).sort(), profileKeys)
  const support = ok(await call('get_rules_support', { domain: 'xge_encounter' }))
  assert.deepEqual(support.tools, ['assess_xge_encounter'])
  assert.deepEqual(await call('get_game_state'), before)
})

test('blank and out-of-table profiles do not become zero-cost or definite totals', async t => {
  const call = await engine(t, { adventureId: 'grammys-country-apple-pie' })
  const before = await call('get_game_state')
  const result = ok(await encounter(call, planned(group('goblin'), group('awakened_tree'), group('rat'))))
  assert.deepEqual(result.groups.map(group => group.ratioStatus), ['printed', 'blank_source_cell', 'weak_monster_guideline'])
  assert.equal(result.characterEquivalent, null)
  assert.equal(result.comparison, 'indeterminate')
  assert.deepEqual(await call('get_game_state'), before)
})

test('unknown types, duplicate groups and fabricated levels or CR are refused before state and RNG', async t => {
  const call = await engine(t, { dice: '17' })
  const before = await call('get_game_state')
  assert.equal((await encounter(call, planned(group('unpublished_dragon')))).code, 'XGE_ENCOUNTER_MONSTER_UNKNOWN')
  assert.equal((await encounter(call, planned(group('goblin'), group('goblin')))).code, 'XGE_ENCOUNTER_DUPLICATE_GROUP')
  for (const input of [{ mode: 'catalogue', playerLevel: 20 }, { mode: 'catalogue', groups: [group('goblin')] },
    { ...planned(group('goblin')), partySize: 4 }, { mode: 'planned', groups: [{ ...group('goblin'), challengeRating: 0 }] }])
    assert.ok((await encounter(call, input)).error)
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})
