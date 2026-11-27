const test = require('node:test')
const assert = require('node:assert/strict')

Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { prepareHerbalismCourse, prepareBrewAtCurrentSite } = require('./helpers/xge-brewing-fixture.cjs')
const { prepareScribingAtCurrentSite } = require('./helpers/xge-scribing-fixture.cjs')
const { prepareRechargeCalendar, expendPearl } = require('./helpers/recharge-calendar-fixture.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')

test.after(() => pg.restore())

test('scribing crosses one real recharge and leaves no second workday for brewing, even after SQL replay', async t => {
  const options = { adventureId: 'fey-shadow-fair', characterId: 'wizard', dice: '19' }
  const call = await engine(t, options)
  const course = await prepareHerbalismCourse(call, 'w28-cross-herbalism')
  await course.completeInstruction()
  ok(await call('complete_xge_training', course.completion))
  await course.nextDay()

  const pearlId = await expendPearl(call, 'w28-cross-pearl')
  const recharge = await prepareRechargeCalendar(call, { firstAfterSeconds: 3_600 })
  const brew = await prepareBrewAtCurrentSite(call, course.input.practiceToolItemId, {
    eventId: 'w28-cross-brew', potionItemId: 'w28-cross-potion',
  })
  const scribe = await prepareScribingAtCurrentSite(call, {
    eventId: 'w28-cross-scribing', scrollItemId: 'w28-cross-scroll',
  })
  const before = await call('get_game_state')
  assert.equal(recharge.result.firstAt, before.worldTimeSeconds + 3_600)
  assert.equal(before.dmTools.magicItems[pearlId].charges, 0)
  ok(await call('scribe_xge_spell_scroll', scribe))
  const after = await call('get_game_state')
  assert.equal(after.worldTimeSeconds, before.worldTimeSeconds + 28_800)
  assert.equal(copperValue(before.dmTools.wallet) - copperValue(after.dmTools.wallet), 2_500)
  assert.equal(after.dmTools.magicItems[pearlId].charges, 1)
  assert.equal(after.dmTools.rechargeCalendar.evaluatedThrough, after.worldTimeSeconds)
  assert.deepEqual(after.player.spellSlots, before.player.spellSlots)
  assert.equal(after.droppedItems[scribe.scrollItemId].item.equipmentId, 'spell_scroll')
  assert.equal(after.dmTools.spellScrolls[scribe.scrollItemId].spellId, scribe.spellId)
  assert.equal((await call('brew_xge_healing_potion', brew)).code, 'DOWNTIME_SHARED_DAY_REQUIRED')
  assert.deepEqual(await call('get_game_state'), after)

  const sessionId = `w28-scribing-recharge-${process.pid}`
  t.after(() => deleteSession(sessionId))
  await saveSession(sessionId, { gameState: after, history: [], adventureId: after.adventureId, characterId: after.characterId })
  const resumed = await engine(t, options)
  ok(await resumed('replace_game_state', { gameState: (await loadSession(sessionId)).gameState }))
  const restored = await resumed('get_game_state')
  assert.deepEqual(restored.dmTools.rechargeCalendar, after.dmTools.rechargeCalendar)
  assert.deepEqual(restored.dmTools.spellScrolls, after.dmTools.spellScrolls)
  assert.equal(ok(await resumed('scribe_xge_spell_scroll', scribe)).replayed, true)
  assert.equal((await resumed('brew_xge_healing_potion', brew)).code, 'DOWNTIME_SHARED_DAY_REQUIRED')
  assert.deepEqual(await resumed('get_game_state'), restored)
  ok(await resumed('advance_time', { seconds: 86_400 - restored.worldTimeSeconds % 86_400 }))
  const tomorrow = await resumed('get_game_state')
  assert.equal((await resumed('brew_xge_healing_potion', { ...brew, suppliesFactId: scribe.suppliesFactId })).code,
    'XGE_BREW_SUPPLIES_ALREADY_USED')
  assert.deepEqual(await resumed('get_game_state'), tomorrow)
  assert.equal(ok(await resumed('roll_dice', { notation: '1d20' })).total, 19)
})

