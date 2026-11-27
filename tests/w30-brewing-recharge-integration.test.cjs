const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { prepareHerbalismCourse, prepareBrewAtCurrentSite } = require('./helpers/xge-brewing-fixture.cjs')
const { prepareRechargeCalendar, createRechargeItem } = require('./helpers/recharge-calendar-fixture.cjs')
const { approachManorStairs, prepareRechargePlaneMap } = require('./helpers/recharge-plane-fixture.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
test.after(() => pg.restore())

test('an unfinished greater potion also reserves its identity against the new razorvine producer before creation', async t => {
  const { prepareRazorvine } = require('./helpers/razorvine-fixture.cjs')
  const call = await engine(t, { characterId: 'wizard', dice: '19' })
  const course = await prepareHerbalismCourse(call, 'w30-cross-hedge-herbalism')
  await course.completeInstruction()
  ok(await call('complete_xge_training', course.completion))
  await course.nextDay()
  const state = await call('get_game_state')
  ok(await call('create_treasure', { treasureId: 'w30-cross-hedge-funds', name: 'Vraies pièces', mode: 'authored',
    description: 'Pièces réellement ramassées pour les fournitures de la potion majeure.', cell: state.player.position, coins: { gp: 100 } }))
  ok(await call('collect_treasure', { treasureId: 'w30-cross-hedge-funds' }))
  const hedge = await prepareRazorvine(call, { publish: false })
  const start = await prepareBrewAtCurrentSite(call, course.input.practiceToolItemId, {
    eventId: 'w30-cross-reserved-hedge', potionItemId: hedge.hedgeId, paid: { gp: 100 },
  })
  ok(await call('start_xge_greater_healing_potion', start))
  const before = await call('get_game_state')
  const refused = await call('record_razorvine', hedge.qualification)
  assert.equal(refused.code, 'XGE_BREW_OUTPUT_ID_RESERVED', JSON.stringify(refused))
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('five actual greater-brewing workdays share the ledger and advance a bound plane recharge through SQL', async t => {
  const options = { characterId: 'wizard' }
  const call = await engine(t, options)
  const course = await prepareHerbalismCourse(call, 'w30-cross-herbalism')
  await course.completeInstruction()
  ok(await call('complete_xge_training', course.completion))
  await course.nextDay()
  const fundedAt = await call('get_game_state')
  ok(await call('create_treasure', { treasureId: 'w30-cross-real-funds', name: 'Fournitures financées', mode: 'authored',
    description: 'Pièces présentes pour acheter les véritables fournitures des deux potions.',
    cell: fundedAt.player.position, coins: { gp: 200 } }))
  ok(await call('collect_treasure', { treasureId: 'w30-cross-real-funds' }))
  await approachManorStairs(call)
  const calendar = await prepareRechargeCalendar(call, { firstAfterSeconds: 3600 })
  assert.equal((await call('get_game_state')).currentMapId, 'temple')
  ok(await call('travel_to_map', { transitionId: 'descend_manor' }))
  const binding = await prepareRechargePlaneMap(call)
  ok(await call('bind_xge_recharge_plane_map', binding.input))
  const itemId = await createRechargeItem(call, 'pearl_of_power', 'w30-cross-real-pearl', { initialCharges: 0 })
  const normal = await prepareBrewAtCurrentSite(call, course.input.practiceToolItemId, {
    eventId: 'w30-cross-normal', potionItemId: 'w30-cross-normal-output',
  })
  const site = await call('get_game_state')
  const supplies = ok(await call('record_scene_fact', { cell: site.player.position,
    description: 'Fournitures distinctes réellement disponibles ici pour une unique potion de soins majeurs.' })).worldFact
  const start = { eventId: 'w30-cross-greater', potionItemId: 'w30-cross-greater-output',
    toolItemId: course.input.practiceToolItemId, suppliesFactId: supplies.id, paid: { gp: 100 },
    explicitlyAdopted: true, actualOneDoseSuppliesConfirmed: true,
    activitySource: 'Le PJ achète les fournitures de la potion majeure au lieu de travail mesuré.' }
  const beforeStart = await call('get_game_state')
  ok(await call('start_xge_greater_healing_potion', start))
  const started = await call('get_game_state')
  assert.equal(copperValue(beforeStart.dmTools.wallet) - copperValue(started.dmTools.wallet), 10000)
  assert.equal(started.worldTimeSeconds, beforeStart.worldTimeSeconds)
  assert.equal(started.droppedItems[start.potionItemId], undefined)
  const work = day => ({ eventId: `w30-cross-effort-${day}`, projectId: start.eventId,
    activitySource: 'Huit heures effectives consacrées à cette même potion majeure au même établi.' })
  for (let day = 0; day < 5; day++) {
    if (day) {
      const state = await call('get_game_state')
      ok(await call('advance_time', { seconds: 86400 - state.worldTimeSeconds % 86400 }))
    }
    const before = await call('get_game_state')
    ok(await call('work_xge_greater_healing_potion', work(day)))
    const after = await call('get_game_state')
    assert.equal(after.worldTimeSeconds, before.worldTimeSeconds + 28800)
    assert.equal(after.dmTools.magicItems[itemId].charges, 1)
    assert.equal(after.dmTools.rechargeCalendar.adoption.firstAt, calendar.result.firstAt)
    if (!day) {
      const refused = await call('brew_xge_healing_potion', normal)
      assert.equal(refused.code, 'DOWNTIME_SHARED_DAY_REQUIRED', JSON.stringify(refused))
      assert.deepEqual(await call('get_game_state'), after)
    }
    assert.equal(Boolean(after.droppedItems[start.potionItemId]), day === 4)
  }
  const complete = await call('get_game_state')
  assert.equal(complete.droppedItems[start.potionItemId].item.equipmentId, 'potion_of_greater_healing')
  const sessionId = `w30-brewing-plane-${process.pid}`
  t.after(() => deleteSession(sessionId))
  await saveSession(sessionId, { gameState: complete, history: [],
    adventureId: complete.adventureId, characterId: complete.characterId })
  const fresh = await engine(t, { ...options, dice: '19' })
  ok(await fresh('replace_game_state', { gameState: (await loadSession(sessionId)).gameState }))
  const restored = await fresh('get_game_state')
  assert.equal(ok(await fresh('bind_xge_recharge_plane_map', binding.input)).replayed, true)
  assert.equal(ok(await fresh('start_xge_greater_healing_potion', start)).replayed, true)
  for (let day = 0; day < 5; day++) assert.equal(ok(await fresh('work_xge_greater_healing_potion', work(day))).replayed, true)
  assert.deepEqual(await fresh('get_game_state'), restored)
  assert.equal(ok(await fresh('roll_dice', { notation: '1d20' })).total, 19)
})
