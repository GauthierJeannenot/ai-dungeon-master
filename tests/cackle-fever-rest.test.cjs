const assert = require('node:assert/strict')
const test = require('node:test')
Object.assign(process.env, {
  MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
})
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { ok } = require('./helpers/mcp-toolkit.cjs')
const { setupCackle, persistCackle, cackleRefused } = require('./helpers/cackle-fever-fixture.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
test.after(() => pg.restore())

const get = call => call('get_game_state')
const recordOf = (state, id) => state.dmTools.afflictions.records[id]
const levelOf = state => state.dmTools.exhaustion?.creatures.player?.level ?? 0

async function symptomaticPlayer(t, { characterId = 'fighter', dice = '19' } = {}) {
  const fixture = await setupCackle(t, { characterId })
  assert.equal(fixture.infection.success, false)
  ok(await fixture.call('end_combat', { force: true,
    reason: 'Les participants terminent réellement cette confrontation par une décision explicite, sans combat ou déplacement inventé.' }))
  const state = await get(fixture.call), infection = recordOf(state, fixture.infection.afflictionId)
  assert.equal(infection.targetId, 'player')
  assert.ok(infection.nextAt > state.worldTimeSeconds)
  ok(await fixture.call('advance_time', { seconds: infection.nextAt - state.worldTimeSeconds }))
  ok(await fixture.call('resolve_cackle_fever_onset', { afflictionId: infection.id }))
  const call = await persistCackle(t, fixture.call, dice)
  assert.equal(levelOf(await get(call)), 1)
  return { ...fixture, call, afflictionId: infection.id }
}

async function actualLongRest(call) {
  const before = await get(call), rest = ok(await call('take_rest', { kind: 'long' }))
  const result = rest.result ?? rest, link = rest.cackleFeverEvent ?? result.cackleFeverEvent
  assert.equal((await get(call)).worldTimeSeconds - before.worldTimeSeconds, 28800)
  return { rest, result, link }
}

async function nextActualRestWindow(call) {
  ok(await call('advance_time', { seconds: 16 * 3600 }))
}

async function eatActualProvisions(call, id) {
  const state = await get(call)
  ok(await call('create_scene_object', { objectId: id, name: 'Vivres réellement présents',
    description: 'Une ration et deux outres pleines réellement disponibles pour cette prise de nourriture et d’eau.',
    cell: state.player.position, kind: 'container', material: 'wood', size: 'small', resilience: 'fragile',
    contents: ['ration_1_day', 'waterskin_full', 'waterskin_full'] }))
  const items = ok(await call('interact_object', { objectId: id, action: 'open' })).releasedItems
  for (const item of items) ok(await call('pick_up_item', { itemId: item.id }))
  ok(await call('begin_nutrition_tracking', { eventId: id + '-nutrition', operation: 'begin',
    standardNeedsConfirmed: true, hotWeather: false, foodDebtHalfDays: 0, priorDeprivation: 'none',
    source: 'Le MJ établit les besoins standards et l’histoire réelle sans privation antérieure. Cette prise est actuelle, pas rétroactive.' }))
  for (const [index, item] of items.entries()) {
    ok(await call('consume_provisions', { eventId: id + '-intake-' + index, itemId: item.id,
      units: item.equipmentId === 'ration_1_day' ? 2 : 4 }))
  }
  const consumed = await get(call)
  assert.equal(consumed.dmTools.survival.day.foodHalfPounds, 2)
  assert.equal(consumed.dmTools.survival.day.waterPints, 8)
  assert.ok(consumed.player.inventory.some(item => item.id === items[0].id))
  for (const skin of items.slice(1)) {
    assert.equal(consumed.player.inventory.find(item => item.id === skin.id).equipmentId, 'waterskin_empty')
  }
}

test('verified real food and water cannot remove the disease level, and a model-selected declined rest save survives SQL without a die', async t => {
  let { call, afflictionId } = await symptomaticPlayer(t)
  await eatActualProvisions(call, 'cackle-real-meal-before-locked-rest')
  const before = await get(call)
  const { result, link } = await actualLongRest(call)
  assert.ok(link, JSON.stringify(result))
  assert.equal(result.exhaustionRecovery.status, 'verified')
  assert.equal(result.exhaustionRecovery.beforeLevel, 1)
  assert.equal(result.exhaustionRecovery.afterLevel, 1)
  assert.equal(levelOf(await get(call)), 1)
  const choice = { name: 'resolve_cackle_fever_event', input: { eventId: link.eventId, attemptSave: false } }
  const turn = await play(t, call, [choice, params => {
    const declined = ok(lastResult(params))
    assert.equal(declined.saveDeclined, true)
    assert.equal(declined.diceRolled, false)
    return 'Le personnage choisit de ne pas tenter ce jet facultatif après son repos réel.'
  }], 'Je ne tente pas le jet facultatif de rétablissement de la fièvre à cette fin de repos.')
  assert.deepEqual(turn.seen, [choice])
  assert.deepEqual(turn.selected, [choice])
  const after = await get(call), illness = recordOf(after, afflictionId)
  assert.equal(illness.cackleFever.dc, 13)
  assert.equal(illness.cackleFever.recoveryFailures, 0)
  assert.deepEqual(after.dmTools.cackleFever.madness, {})
  assert.equal(levelOf(after), levelOf(before))
  assert.equal(after.dmTools.survival.recoveryIntake.foodHalfPounds, 0)
  assert.equal(after.dmTools.survival.recoveryIntake.waterPints, 0)
  call = await persistCackle(t, call, '19')
  const restored = await get(call)
  assert.equal(ok(await call(choice.name, choice.input)).replayed, true)
  assert.deepEqual(await get(call), restored)
  await cackleRefused(call, choice.name, { ...choice.input, attemptSave: true }, 'CACKLE_EVENT_ARGUMENT_CONFLICT')
  await cackleRefused(call, 'remove_exhaustion', { eventId: 'cannot-remove-fed-fever-level', targetId: 'player',
    levels: 1, reason: 'Le vrai repos et les vivres ne peuvent retirer ce niveau protégé tant que la maladie est active.' }, 'CACKLE_EXHAUSTION_LOCKED')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('three successful real rest saves reduce the original DC to zero, cure the disease and leave exhaustion for later verified recovery', async t => {
  let { call, afflictionId } = await symptomaticPlayer(t, { dice: '20,6,20,6,20,1,19' })
  const expected = [[13, 6, 7], [7, 6, 1], [1, 1, 0]]
  for (const [index, [dc, reduction, remaining]] of expected.entries()) {
    if (index) await nextActualRestWindow(call)
    const { link } = await actualLongRest(call)
    assert.ok(link)
    const result = ok(await call('resolve_cackle_fever_event', { eventId: link.eventId, attemptSave: true }))
    assert.equal(result.success, true)
    assert.equal(result.event.dc, dc)
    assert.equal(result.reduction.notation, '1d6')
    assert.equal(result.reduction.total, reduction)
    assert.equal(result.newDC, remaining)
    const state = await get(call), infection = recordOf(state, afflictionId)
    assert.equal(infection.cackleFever.dc, remaining)
    assert.equal(infection.cackleFever.recoveryFailures, 0)
    assert.equal(infection.status, remaining === 0 ? 'cured' : 'active')
    assert.equal(levelOf(state), 1, 'curing the disease does not itself remove the already gained exhaustion level')
    assert.deepEqual(state.dmTools.cackleFever.madness, {})
  }
  call = await persistCackle(t, call, '19')
  assert.equal(recordOf(await get(call), afflictionId).status, 'cured')
  assert.equal(levelOf(await get(call)), 1)
  await nextActualRestWindow(call)
  await eatActualProvisions(call, 'cackle-real-meal-after-actual-cure')
  const { result, link } = await actualLongRest(call)
  assert.equal(link, undefined)
  assert.equal(result.exhaustionRecovery.status, 'verified')
  assert.equal(result.exhaustionRecovery.beforeLevel, 1)
  assert.equal(result.exhaustionRecovery.afterLevel, 0)
  const recovered = await get(call)
  assert.equal(levelOf(recovered), 0)
  assert.equal(recordOf(recovered, afflictionId).status, 'cured')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('failed recoveries remain cumulative across a success and a declined save; the official indefinite flaw outlives a real Lesser Restoration cure', async t => {
  let { call, afflictionId } = await symptomaticPlayer(t, { characterId: 'cleric', dice: '1,20,1,17' })
  const first = await actualLongRest(call)
  const failed1 = ok(await call('resolve_cackle_fever_event', { eventId: first.link.eventId, attemptSave: true }))
  assert.equal(failed1.success, false)
  assert.equal(failed1.cumulativeRecoveryFailures, 1)
  await nextActualRestWindow(call)
  const second = await actualLongRest(call)
  const succeeded = ok(await call('resolve_cackle_fever_event', { eventId: second.link.eventId, attemptSave: true }))
  assert.equal(succeeded.success, true)
  assert.equal(succeeded.newDC, 12)
  assert.equal(recordOf(await get(call), afflictionId).cackleFever.recoveryFailures, 1)
  await nextActualRestWindow(call)
  const third = await actualLongRest(call)
  const declineInput = { eventId: third.link.eventId, attemptSave: false }
  const declined = ok(await call('resolve_cackle_fever_event', declineInput))
  assert.equal(declined.saveDeclined, true)
  const afterDecline = await get(call)
  assert.equal(recordOf(afterDecline, afflictionId).cackleFever.recoveryFailures, 1)
  assert.equal(recordOf(afterDecline, afflictionId).cackleFever.dc, 12)
  assert.deepEqual(afterDecline.dmTools.cackleFever.madness, {})
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17, 'the declined source save consumed no original die')
  call = await persistCackle(t, call, '1,1,82,19')
  const beforeReplay = await get(call)
  assert.equal(ok(await call('resolve_cackle_fever_event', declineInput)).replayed, true)
  assert.deepEqual(await get(call), beforeReplay)
  let last
  for (let index = 0; index < 2; index++) {
    await nextActualRestWindow(call)
    const { link } = await actualLongRest(call)
    last = ok(await call('resolve_cackle_fever_event', { eventId: link.eventId, attemptSave: true }))
    assert.equal(last.success, false)
    assert.equal(last.event.dc, 12)
    assert.equal(last.cumulativeRecoveryFailures, index + 2)
  }
  assert.equal(last.indefiniteMadness.roll.notation, '1d100')
  assert.equal(last.indefiniteMadness.roll.total, 82)
  assert.deepEqual(last.indefiniteMadness.range, [81, 85])
  assert.equal(last.indefiniteMadness.text, '"There\'s only one person I can trust. And only I can see this special friend."')
  const beforeCure = await get(call), flaw = structuredClone(beforeCure.dmTools.cackleFever.madness[afflictionId])
  assert.equal(flaw.sourceMetadata.book, 'dmg-2014')
  assert.equal(flaw.sourceMetadata.sha256, beforeCure.dmTools.cackleFever.source.madness.sha256)
  assert.equal(recordOf(beforeCure, afflictionId).cackleFever.recoveryFailures, 3)
  assert.equal(levelOf(beforeCure), 1)
  await cackleRefused(call, 'remove_exhaustion', { eventId: 'cannot-remove-cackle-flaw-host-level', targetId: 'player',
    levels: 1, reason: 'Le troisième échec ne retire pas la maladie ni son niveau protégé.' }, 'CACKLE_EXHAUSTION_LOCKED')
  ok(await call('cast_spell', { spellId: 'lesser-restoration', targetId: 'player', slotLevel: 2, afflictionId }))
  const cured = await get(call)
  assert.equal(recordOf(cured, afflictionId).status, 'cured')
  assert.equal(levelOf(cured), 1)
  assert.deepEqual(cured.dmTools.cackleFever.madness[afflictionId], flaw)
  call = await persistCackle(t, call, '19')
  const hydrated = await get(call)
  assert.deepEqual(hydrated.dmTools.cackleFever.madness[afflictionId], flaw)
  assert.equal(recordOf(hydrated, afflictionId).status, 'cured')
  assert.equal(levelOf(hydrated), 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
