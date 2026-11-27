const assert = require('node:assert/strict')
const test = require('node:test')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { prepareFrigidWater } = require('./helpers/frigid-water-fixture.cjs')

test('a paid relaxation interval gives no advantage on a frigid water save and the advisory remains read-only at that boundary', async t => {
  const call = await engine(t, { adventureId: 'fey-shadow-fair', characterId: 'wizard', dice: '1,19' })
  const { player } = await call('get_game_state')
  const cell = player.position
  const { worldFact } = ok(await call('record_scene_fact', {
    cell, description: 'The actual dry lodging offers a modest lifestyle for this relaxation week.',
  }))
  ok(await call('create_treasure', {
    treasureId: 'w26-lodging-funds', name: 'Lodging funds', mode: 'authored', cell, coins: { gp: 7 },
    description: 'These are the actual coins paid for the modest week.',
  }))
  ok(await call('collect_treasure', { treasureId: 'w26-lodging-funds' }))
  const weekId = 'w26-paid-week'
  ok(await call('start_xge_relaxation', {
    eventId: weekId, siteFactId: worldFact.id, explicitlyAdopted: true,
    actualLifestyleAvailable: true, lifestyle: 'modest', paid: { gp: 7 },
  }))
  const activity = { weekId, seconds: 60, activitySource: 'The player rests quietly at the paid dry lodging.' }
  ok(await call('advance_xge_relaxation', { ...activity, eventId: 'w26-actual-relaxation' }))
  const paidWeek = ok(await call('inspect_xge_relaxation'))

  const water = await prepareFrigidWater(call)
  assert.equal(ok(await water.enter()).goalReached, true)
  const entered = await call('get_game_state')
  const immersion = ok(await call('inspect_frigid_water'))
  assert.equal(immersion.active.entry.kind, 'surface_swim')
  const seconds = (entered.player.stats.con + 1) * 60
  assert.equal(immersion.nextSave.at, entered.worldTimeSeconds + seconds)
  ok(await call('advance_time', { seconds }))
  const due = ok(await call('inspect_frigid_water')).dueSave
  const beforeSave = await call('get_game_state')
  assert.equal((await call('advance_xge_relaxation', { ...activity, eventId: 'w26-blocked-relaxation' })).code, 'FRIGID_WATER_SAVE_DUE')
  assert.deepEqual(await call('get_game_state'), beforeSave)

  const advisory = ok(await call('assess_xge_encounter', {
    mode: 'planned', groups: [{ monsterType: 'goblin', count: 2 }],
  }))
  assert.deepEqual(advisory.characterEquivalent, { numerator: 1, denominator: 1 })
  assert.deepEqual(await call('get_game_state'), beforeSave)
  const resolved = ok(await call('resolve_frigid_water_save', { eventId: due.eventId }))
  assert.equal(resolved.success, false)
  assert.deepEqual(resolved.save.roll.rolls, [1])
  const afterSave = await call('get_game_state')
  assert.equal(afterSave.dmTools.exhaustion.creatures.player.level, 1)
  assert.equal(afterSave.worldTimeSeconds, beforeSave.worldTimeSeconds)
  assert.deepEqual(afterSave.dmTools.wallet, beforeSave.dmTools.wallet)
  assert.deepEqual(ok(await call('inspect_xge_relaxation')), paidWeek)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
