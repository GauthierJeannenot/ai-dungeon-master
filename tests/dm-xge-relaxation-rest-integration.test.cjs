const assert = require('node:assert/strict')
const test = require('node:test')

Object.assign(process.env, {
  MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
})
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
test.after(() => pg.restore())

test('one real DM POST credits measured Relaxation to the open long rest and completes that same rest', async t => {
  const call = await engine(t, { dice: '1,4,19' })
  const { player } = await call('get_game_state')
  const cell = player.position
  const { worldFact } = ok(await call('record_scene_fact', {
    description: 'Le PJ dispose réellement de cette chambre calme au train de vie modeste.',
    cell,
  }))
  ok(await call('create_treasure', {
    treasureId: 'relax-rest-funds', name: 'Fonds disponibles',
    description: 'Le PJ prend ces sept pièces pour payer son hébergement.', mode: 'authored',
    cell, coins: { gp: 7 },
  }))
  ok(await call('collect_treasure', { treasureId: 'relax-rest-funds' }))
  const funded = await call('get_game_state')
  const weekId = 'paid-relaxation-week'
  ok(await call('start_xge_relaxation', {
    eventId: weekId, siteFactId: worldFact.id, explicitlyAdopted: true,
    actualLifestyleAvailable: true, lifestyle: 'modest', paid: { gp: 7 },
  }))
  const paid = await call('get_game_state')
  assert.equal(copperValue(funded.dmTools.wallet) - copperValue(paid.dmTools.wallet), 700)

  const sourceId = 'rest-relaxation-contamination'
  ok(await call('create_affliction_source', {
    sourceId, templateId: 'sewer_plague', name: 'Souillure réelle au sol',
    cell, doses: 1,
  }))
  const infection = ok(await call('expose_affliction', {
    sourceId, eventId: 'actual-ground-contact', targetId: 'player', delivery: 'contact',
  }))
  assert.equal(infection.save.success, false)
  assert.equal(infection.incubationRoll.total, 4)
  ok(await call('update_hp', { entityId: 'player', delta: -3, reason: 'Blessure réelle avant le repos.' }))

  const restId = 'same-relaxation-long-rest'
  const sleepSeconds = 6 * 3600
  const lightSeconds = 2 * 3600
  ok(await call('begin_rest', { restId, kind: 'long' }))
  ok(await call('advance_rest', {
    restId, eventId: 'actual-six-hours-sleep', activity: 'sleep', seconds: sleepSeconds,
    reason: 'Le PJ dort réellement six heures avant de se réveiller.',
  }))
  const leisure = {
    weekId, eventId: 'actual-leisure-within-rest', seconds: lightSeconds,
    activitySource: 'Le PJ choisit deux heures de détente calme dans cette même chambre.',
  }
  const chosen = [
    { name: 'advance_xge_relaxation', input: leisure },
    { name: 'finish_rest', input: { restId } },
  ]
  // The shared harness calls the real POST and compares its final state with the SQL session.
  const { result, seen, selected, before } = await play(t, call, [
    chosen[0],
    params => {
      const measured = ok(lastResult(params))
      assert.equal(measured.event.restId, restId)
      assert.equal(measured.event.to - measured.event.from, lightSeconds)
      return chosen[1]
    },
    params => {
      const completed = ok(lastResult(params))
      assert.equal(completed.restId, restId)
      assert.equal(completed.benefitsGranted, true)
      return 'Les deux heures de détente terminent le même repos long.'
    },
  ], 'Je passe les deux dernières heures de mon repos à me détendre calmement dans la chambre payée, puis je termine ce repos.')
  assert.deepEqual(seen, chosen)
  assert.deepEqual(selected, chosen)
  assert.equal(before.dmTools.rests.active.restId, restId)
  const after = result.newGameState
  assert.equal(after.worldTimeSeconds, before.worldTimeSeconds + lightSeconds)
  assert.deepEqual(after.dmTools.wallet, paid.dmTools.wallet)
  assert.ok(after.player.hp.current > before.player.hp.current)
  assert.equal(after.player.hp.current, after.player.hp.max)
  assert.equal(after.dmTools.rests.active, undefined)
  assert.deepEqual(Object.keys(after.dmTools.rests.receipts), [restId])
  const receipt = after.dmTools.rests.receipts[restId]
  assert.equal(receipt.completedAt, after.worldTimeSeconds)
  assert.equal(receipt.result.benefitsGranted, true)
  assert.deepEqual(receipt.session.segments.map(segment => [segment.activity, segment.to - segment.from]), [
    ['sleep', sleepSeconds], ['light', lightSeconds],
  ])
  const [segment] = after.dmTools.xgeRelaxation.weeks[0].segments
  assert.deepEqual(segment.input, leisure)
  assert.equal(segment.restId, restId)
  assert.equal(segment.to, receipt.completedAt)
  assert.equal(receipt.result.sewerPlagueEvent.afflictionId, infection.affliction.id)
  assert.equal(receipt.result.sewerPlagueEvent.restId, restId)
  assert.equal(after.dmTools.afflictions.records[infection.affliction.id].sewerPlague.restEvents[restId].result, undefined)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
