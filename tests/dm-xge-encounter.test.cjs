const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, {
  LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
})
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
test.after(() => pg.restore())

test('POST forwards the confidential assessment and leaves the actual action and saved state available', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '18,19' })
  const assessment = { name: 'assess_xge_encounter',
    input: { mode: 'planned', groups: [{ monsterType: 'goblin', count: 12 }] } }
  const check = { name: 'roll_ability_check', input: { entityId: 'player', ability: 'wis', dc: 10 } }
  const { result, seen, before } = await play(t, call, [
    assessment,
    params => {
      const reference = lastResult(params)
      assert.equal(reference.confidential, true)
      assert.equal(reference.playerLevel, 7)
      assert.deepEqual(reference.characterEquivalent, { numerator: 1, denominator: 1 })
      assert.equal(reference.mechanicalFact, undefined)
      return check
    },
    params => {
      assert.equal(lastResult(params).success, true)
      return 'Tu examines les environs.'
    },
  ], 'Je prends un instant pour examiner les environs.')
  assert.deepEqual(seen, [assessment, check])
  assert.deepEqual(result.newGameState.monsters, before.monsters)
  assert.equal(result.newGameState.worldTimeSeconds, before.worldTimeSeconds)
  assert.doesNotMatch(JSON.stringify(result), /characterEquivalent|blank_source_cell|xge:\d+:table:/)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('POST preserves the chosen low-CR documentary assessment and SQL while one separate real action alone rolls and changes gameplay', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '18,19' })
  const assessment = { name: 'assess_xge_encounter', input: { mode: 'planned', groups: [{ monsterType: 'rat', count: 12 }] } }
  const check = { name: 'roll_ability_check', input: { entityId: 'player', ability: 'wis', dc: 10 } }
  const { result, seen, selected, before } = await play(t, call, [assessment, params => {
    const reference = ok(lastResult(params))
    assert.equal(reference.confidential, true); assert.equal(reference.playerLevel, 7)
    assert.equal(reference.groups[0].ratioStatus, 'weak_monster_guideline')
    assert.deepEqual(reference.characterEquivalent, { numerator: 1, denominator: 1 })
    assert.equal(reference.groups[0].ratioSource.startLine, 1257)
    assert.equal(reference.mechanicalFact, undefined)
    return check
  }, params => {
    assert.equal(lastResult(params).success, true)
    return 'Tu examines les environs.'
  }], 'Je prépare cette opposition précise, puis j’examine les environs.')
  assert.deepEqual(seen, [assessment, check]); assert.deepEqual(selected, [assessment, check])
  assert.deepEqual(result.newGameState.monsters, before.monsters)
  assert.deepEqual(result.newGameState.player.inventory, before.player.inventory)
  assert.equal(result.newGameState.worldTimeSeconds, before.worldTimeSeconds)
  assert.doesNotMatch(JSON.stringify(result), /characterEquivalent|weak_monster_guideline|weakMonsterRule|xge:\d+:table:/)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
