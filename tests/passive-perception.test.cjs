const test = require('node:test'), assert = require('node:assert/strict')
const { passivePerceptionScore } = require('../mcp-server/dist/mcp-server/monster-perception.js')
const { getMonsterRecord } = require('../mcp-server/dist/lib/srd/monsters.js')
const { engine, ok, replace, spawn, battle } = require('./helpers/mcp-toolkit.cjs')

test('passive Perception applies exhaustion -5 once, cancels explicit advantage and never spends a prepared token', () => {
  const observer = { ...structuredClone(getMonsterRecord('goblin').engine), id: 'observer' }
  const state = { monsters: {}, dmTools: { exhaustion: { creatures: {}, receipts: {} }, dmInspiration: {
    held: false, prepared: { spendId: 'player-check', kind: 'check' }, grants: {}, spends: { 'player-check': { kind: 'check', status: 'prepared' } },
  } } }
  const normal = passivePerceptionScore(observer, state)
  observer.conditions.push('exhaustion'); state.dmTools.exhaustion.creatures.observer = { level: 1 }
  const before = structuredClone(state)
  assert.equal(passivePerceptionScore(observer, state), normal - 5)
  assert.equal(passivePerceptionScore(observer, state, false, true), normal - 5, 'multiple disadvantages do not become -10')
  assert.equal(passivePerceptionScore(observer, state, true), normal, 'advantage and exhaustion disadvantage cancel')
  state.dmTools.exhaustion.creatures.observer.level = 3
  assert.equal(passivePerceptionScore(observer, state), normal - 5, 'higher exhaustion still imposes one disadvantage')
  state.dmTools.exhaustion.creatures.observer.level = 1
  assert.deepEqual(state, before)
  delete state.dmTools.exhaustion.creatures.observer
  const unresolved = structuredClone(state)
  assert.throws(() => passivePerceptionScore(observer, state), error => error.code === 'EXHAUSTION_LEVEL_REQUIRED')
  assert.deepEqual(state, unresolved)
})

test('passive player Perception derives proficiency and expertise from the actual sheet without rolling', () => {
  const player = { id: 'player', conditions: [], stats: { wis: 14 }, proficiencyBonus: 3, skillProficiencies: ['perception'], expertise: [], features: [] }
  const state = { monsters: {}, dmTools: { exhaustion: { creatures: {}, receipts: {} } } }
  assert.equal(passivePerceptionScore(player, state), 15)
  player.expertise.push('perception'); assert.equal(passivePerceptionScore(player, state), 18)
  player.conditions.push('exhaustion'); state.dmTools.exhaustion.creatures.player = { level: 1 }
  assert.equal(passivePerceptionScore(player, state), 13)
})

test('Hide opposes real exhausted observer passive Perception without an artificial floor of ten', async t => {
  for (const exhausted of [false, true]) {
    const call = await engine(t, { characterId: 'wizard', dice: '6,19' }), observer = await spawn(call)
    await battle(call, [observer.id])
    await replace(call, state => { state.player.conditions.push('invisible') })
    if (exhausted) ok(await call('add_exhaustion', { eventId: 'watch-fatigue', targetId: observer.id, levels: 1, reason: 'Fatigue de garde explicitement établie.' }))
    const result = ok(await call('combat_action', { action: 'hide' }))
    const after = await call('get_game_state')
    assert.equal(result.check.dc, exhausted ? 5 : 10)
    assert.equal(result.check.roll.rolls[0], 6)
    assert.equal(result.success, exhausted)
    assert.equal(after.hero.effects.some(effect => effect.kind === 'hidden'), exhausted)
    assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19, 'the passive observer never rolls a d20')
  }
})

test('Hide refuses an unknown observer exhaustion level before the player action or any d20', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '19' }), observer = await spawn(call)
  await battle(call, [observer.id])
  await replace(call, state => {
    state.player.conditions.push('invisible')
    state.monsters[observer.id].conditions.push('exhaustion')
  })
  const before = await call('get_game_state')
  assert.equal((await call('combat_action', { action: 'hide' })).code, 'EXHAUSTION_LEVEL_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
