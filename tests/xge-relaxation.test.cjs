const assert = require('node:assert/strict')
const test = require('node:test')
Object.assign(process.env, {
  MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error', DM_RATE_LIMIT_PER_MINUTE: '0',
})
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, adjacent } = require('./helpers/mcp-toolkit.cjs')
const { play } = require('./helpers/dm-scripted-turn.cjs')
const { prepareResearch } = require('./helpers/xge-research-fixture.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
test.after(() => pg.restore())

const weekId = 'actual-paid-week'
const secondsPerDay = 86400
const duration = 28800
const advance = (eventId, seconds = duration) => ({
  weekId, eventId, seconds, activitySource: 'Le PJ choisit un vrai loisir calme au lieu de détente.',
})
const finish = (outcome, afflictionId) => ({
  weekId, eventId: 'exact-week-conclusion', outcome, ...(afflictionId ? { afflictionId } : {}),
  reason: 'Le MJ choisit explicitement cette conclusion pour la période réellement observée.',
})
const get = call => call('get_game_state')

async function preparePayment(call, siteCell) {
  const { player } = await get(call)
  const site = ok(await call('record_scene_fact', {
    description: 'La chambre existante fournit le train de vie choisi pour la semaine payée.',
    cell: siteCell ?? player.position,
  })).worldFact
  ok(await call('create_treasure', {
    treasureId: 'relax-coins', name: 'Pièces déjà détenues dans ce coffre', mode: 'authored',
    description: 'Le PJ collecte des pièces réelles pour payer la chambre.', cell: player.position, coins: { gp: 100 },
  }))
  ok(await call('collect_treasure', { treasureId: 'relax-coins' }))
  return { eventId: weekId, siteFactId: site.id, explicitlyAdopted: true, actualLifestyleAvailable: true,
    lifestyle: 'modest', paid: { gp: 7 } }
}

async function source(call, templateId, delivery, suffix = '') {
  const sourceId = 'real-' + templateId + suffix
  const { player } = await get(call)
  ok(await call('create_affliction_source', {
    sourceId, templateId, name: 'Source réelle choisie par le MJ', cell: player.position, doses: 1,
  }))
  return ok(await call('expose_affliction', { sourceId, eventId: 'actual-exposure', targetId: 'player', delivery }))
}

async function unchanged(call, tool, input, code) {
  const before = await get(call)
  const failed = await call(tool, input)
  assert.equal(failed.code, code, JSON.stringify(failed))
  assert.deepEqual(await get(call), before)
}

async function persist(t, call, suffix, dice) {
  const gameState = await get(call), id = 'w26-relax-' + suffix + '-' + process.pid
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState, history: [], adventureId: gameState.adventureId, characterId: gameState.characterId })
  const restored = await engine(t, { dice })
  ok(await restored('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  return restored
}

test('exact wallet prepayment, local site, measured dates and explicit abandonment are atomic and replayable', async t => {
  const call = await engine(t, { dice: '19' })
  const input = await preparePayment(call)
  await unchanged(call, 'start_xge_relaxation', { ...input, paid: { gp: 8 } }, 'XGE_RELAXATION_PRICE_REQUIRED')
  await unchanged(call, 'start_xge_relaxation', { ...input, siteFactId: 'unknown-site' }, 'XGE_RELAXATION_SITE_REQUIRED')
  const before = await get(call)
  const started = ok(await call('start_xge_relaxation', input))
  assert.equal(started.event.paidCp, 700)
  assert.deepEqual(started.event.sources.map(s => s.book), ['xge','phb-2014'])
  const paid = await get(call)
  assert.equal(copperValue(before.dmTools.wallet) - copperValue(paid.dmTools.wallet), 700)
  assert.equal(paid.worldTimeSeconds, before.worldTimeSeconds)
  assert.deepEqual(paid.dmTools.survival, before.dmTools.survival)
  assert.deepEqual(paid.player.inventory, before.player.inventory)
  assert.equal(ok(await call('start_xge_relaxation', input)).replayed, true)
  await unchanged(call, 'finish_xge_relaxation', finish('decline_benefit'), 'XGE_RELAXATION_INCOMPLETE')
  const moved = adjacent(paid)[0]
  ok(await call('move_token', { tokenId: 'player', toCell: moved }))
  await unchanged(call, 'advance_xge_relaxation', advance('wrong-location'), 'XGE_RELAXATION_SITE_REQUIRED')
  ok(await call('move_token', { tokenId: 'player', toCell: paid.player.position }))
  ok(await call('advance_time', { seconds: secondsPerDay }))
  await unchanged(call, 'advance_xge_relaxation', advance('missed-date'), 'XGE_RELAXATION_INTERVAL_REQUIRED')
  const conclusion = ok(await call('finish_xge_relaxation', finish('abandon')))
  assert.equal(conclusion.event.releasedDamage, 0)
  const after = await get(call)
  assert.deepEqual(after.dmTools.wallet, paid.dmTools.wallet)
  assert.equal(ok(await call('finish_xge_relaxation', finish('abandon'))).replayed, true)
  assert.deepEqual(await get(call), after)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('only a genuine measured leisure interval inside the original long rest qualifies the Sewer Plague recovery save', async t => {
  const call = await engine(t, { dice: '1,4' })
  ok(await call('start_xge_relaxation', await preparePayment(call)))
  const infection = await source(call, 'sewer_plague', 'contact')
  assert.equal(infection.save.roll.rolls.length, 1)
  assert.equal(infection.incubationRoll.total, 4)
  const restId = 'observed-paid-rest'
  ok(await call('begin_rest', { restId, kind: 'long' }))
  ok(await call('advance_rest', { restId, eventId: 'actual-sleep', activity: 'sleep', seconds: 21600,
    reason: 'Le PJ dort réellement six heures au lieu payé.' }))
  const choice = advance('real-leisure-in-rest', 7200)
  const interval = ok(await call('advance_xge_relaxation', choice))
  assert.equal(interval.event.restId, restId)
  const rest = ok(await call('finish_rest', { restId }))
  assert.equal(rest.benefitsGranted, true)
  const restored = await persist(t, call, 'sewer', '1,20,19')
  const state = await get(restored)
  const damaged = structuredClone(state)
  delete damaged.dmTools.xgeRelaxation.weeks[0].segments[0].restId
  assert.equal((await restored('replace_game_state', { gameState: damaged })).code, 'XGE_RELAXATION_STATE_MISMATCH')
  assert.deepEqual(await get(restored), state)
  assert.equal(ok(await restored('advance_xge_relaxation', choice)).replayed, true)
  const result = ok(await restored('resolve_affliction_event', { afflictionId: infection.affliction.id, restId }))
  assert.deepEqual(result.save.roll.rolls, [20])
  assert.match(result.save.roll.detail, /^ADV:/)
  assert.equal(result.save.success, true)
  assert.equal(result.event.result.recovered, false)
  assert.equal(ok(await restored('resolve_affliction_event', { afflictionId: infection.affliction.id, restId })).replayed, true)
  assert.equal(ok(await restored('roll_dice', { notation: '1d20' })).total, 19)
})

test('a paid but unperformed week gives no advantage to the ordinary long-rest save', async t => {
  const call = await engine(t, { dice: '1,4,1,19' })
  ok(await call('start_xge_relaxation', await preparePayment(call)))
  const infection = await source(call, 'sewer_plague', 'contact')
  const rest = ok(await call('take_rest', { kind: 'long' }))
  const result = ok(await call('resolve_affliction_event', { afflictionId: infection.affliction.id, restId: rest.restId }))
  assert.deepEqual(result.save.roll.rolls, [1])
  assert.equal(result.save.success, false)
  assert.deepEqual(ok(await call('inspect_xge_relaxation')).weeks[0].qualifiedDays, [])
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('Pale Tincture retains the actual daily boundary and counts advantage only at the measured endpoint', async t => {
  const call = await engine(t, { dice: '1,3,1,20,19' })
  ok(await call('advance_time', { seconds: 3600 }))
  ok(await call('start_xge_relaxation', await preparePayment(call)))
  const poison = await source(call, 'pale_tincture', 'ingested')
  assert.equal(poison.save.roll.rolls.length, 1)
  ok(await call('advance_xge_relaxation', advance('actual-first-date')))
  ok(await call('advance_time', { seconds: secondsPerDay - (await get(call)).worldTimeSeconds }))
  await unchanged(call, 'advance_xge_relaxation', advance('would-cross-save', 7200), 'XGE_RELAXATION_RECOVERY_BOUNDARY')
  const interval = ok(await call('advance_xge_relaxation', advance('exact-save-endpoint', 3600)))
  assert.equal(interval.event.to, poison.affliction.nextAt)
  const saved = ok(await call('resolve_affliction_event', { afflictionId: poison.affliction.id }))
  assert.deepEqual(saved.save.roll.rolls, [20])
  assert.match(saved.save.roll.detail, /^ADV:/)
  assert.equal(saved.save.success, true)
  assert.equal(saved.affliction.successes, 1)
  assert.equal(saved.affliction.unhealableDamage, 3)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('an actual measured leisure day cannot be credited again to real Research', async t => {
  const call = await engine(t, { dice: '19' })
  ok(await call('start_xge_relaxation', await preparePayment(call)))
  ok(await call('advance_xge_relaxation', advance('actual-eight-hours')))
  const research = await prepareResearch(call)
  await unchanged(call, 'work_xge_research', research.effort('same-day-research', 60, { paid: { gp: 50 } }),
    'DOWNTIME_SHARED_DAY_REQUIRED')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('seven real dates release only the selected Pale Tincture dose, including damage after SQL continuation', async t => {
  const dice = [1,3,...Array.from({ length: 6 }, () => [1,1]).flat(),1,2].join(',')
  const call = await engine(t, { dice })
  ok(await call('start_xge_relaxation', await preparePayment(call)))
  const first = await source(call, 'pale_tincture', 'ingested')
  for (let day = 0; day < 7; day++) {
    if (day > 0) {
      ok(await call('advance_time', { seconds: secondsPerDay - duration }))
      const save = ok(await call('resolve_affliction_event', { afflictionId: first.affliction.id }))
      assert.equal(save.save.success, false)
      assert.deepEqual(save.save.roll.rolls, [1])
    }
    const work = ok(await call('advance_xge_relaxation', advance('real-date-' + day)))
    assert.equal(work.qualifiedDays.length, day + 1)
  }
  const second = await source(call, 'pale_tincture', 'ingested', '-another-dose')
  const before = await get(call)
  const firstRecord = before.dmTools.afflictions.records[first.affliction.id]
  assert.equal(firstRecord.unhealableDamage, 9)
  assert.equal(second.affliction.unhealableDamage, 2)
  await unchanged(call, 'finish_xge_relaxation', finish('release_pale_tincture_block', 'unrelated-affliction'),
    'XGE_RELAXATION_HEALING_BLOCK_REQUIRED')
  const choice = finish('release_pale_tincture_block', first.affliction.id)
  const late = await persist(t, call, 'missed-exact-week-end', '19')
  ok(await late('advance_time', { seconds: 1 }))
  await unchanged(late, 'finish_xge_relaxation', choice, 'XGE_RELAXATION_BENEFIT_BOUNDARY')
  const lateState = await get(late)
  assert.equal(ok(await late('finish_xge_relaxation', finish('decline_benefit'))).event.releasedDamage, 0)
  assert.deepEqual((await get(late)).dmTools.afflictions, lateState.dmTools.afflictions)
  assert.equal(ok(await late('roll_dice', { notation: '1d20' })).total, 19)
  assert.equal(ok(await call('finish_xge_relaxation', choice)).event.releasedDamage, 9)
  const released = await get(call)
  assert.deepEqual(released.player.hp, before.player.hp)
  assert.deepEqual(released.player.conditions, before.player.conditions)
  assert.deepEqual(released.dmTools.afflictions.records[second.affliction.id], second.affliction)
  const exact = released.dmTools.afflictions.records[first.affliction.id]
  assert.equal(exact.status, 'active')
  assert.equal(exact.successes, firstRecord.successes)
  assert.equal(exact.nextAt, firstRecord.nextAt)
  assert.equal(exact.unhealableDamage, 0)
  assert.deepEqual(exact.relaxationHealingRelease, { weekId, eventId: choice.eventId, at: released.worldTimeSeconds })
  const restored = await persist(t, call, 'two-pale-doses', '1,4,19')
  const actual = await get(restored)
  const damaged = structuredClone(actual)
  delete damaged.dmTools.afflictions.records[first.affliction.id].relaxationHealingRelease
  await unchanged(restored, 'replace_game_state', { gameState: damaged }, 'XGE_RELAXATION_STATE_MISMATCH')
  assert.equal(ok(await restored('finish_xge_relaxation', choice)).replayed, true)
  assert.deepEqual(await get(restored), actual)
  ok(await restored('advance_time', { seconds: exact.nextAt - released.worldTimeSeconds }))
  const later = ok(await restored('resolve_affliction_event', { afflictionId: first.affliction.id }))
  assert.equal(later.save.success, false)
  assert.equal(later.damageRoll.total, 4)
  assert.equal(later.affliction.unhealableDamage, 0)
  assert.equal((await get(restored)).player.hp.current, released.player.hp.current - 4)
  ok(await restored('update_hp', { entityId: 'player', delta: 50, reason: 'Un soin effectif choisi après la levée du blocage.' }))
  const healed = await get(restored)
  assert.equal(healed.player.hp.current, healed.player.hp.max - 2)
  assert.equal(healed.dmTools.afflictions.records[second.affliction.id].unhealableDamage, 2)
  assert.equal(ok(await restored('roll_dice', { notation: '1d20' })).total, 19)
})

test('the model selects the actual paid week and measured time in a real DM POST', async t => {
  const call = await engine(t, { dice: '19' })
  const input = await preparePayment(call)
  const before = await get(call)
  const { result, seen, selected } = await play(t, call, [
    { name: 'start_xge_relaxation', input },
    { name: 'advance_xge_relaxation', input: advance('actual-post-leisure') },
    () => 'La première journée de détente a été effectuée dans la chambre payée.',
  ], 'Je paie la chambre au train de vie modeste et me détends pendant huit heures.')
  assert.deepEqual(seen, selected)
  assert.equal(result.newGameState.worldTimeSeconds - before.worldTimeSeconds, duration)
  assert.equal(copperValue(before.dmTools.wallet) - copperValue(result.newGameState.dmTools.wallet), 700)
  assert.equal(result.newGameState.dmTools.xgeRelaxation.weeks[0].segments.length, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('paid lifestyle coexists with actual nutrition, without creating intake or crossing its due boundary', async t => {
  const call = await engine(t, { dice: '19' })
  ok(await call('advance_time', { seconds: 3600 }))
  ok(await call('begin_nutrition_tracking', {
    eventId: 'actual-relax-nutrition', operation: 'begin', standardNeedsConfirmed: true, hotWeather: false,
    source: 'Le MJ établit les besoins standards et l’historique alimentaire réellement connu.',
    foodDebtHalfDays: 0, priorDeprivation: 'none',
  }))
  const input = await preparePayment(call)
  const beforePayment = await get(call)
  ok(await call('start_xge_relaxation', input))
  assert.deepEqual((await get(call)).dmTools.survival, beforePayment.dmTools.survival)
  ok(await call('advance_xge_relaxation', advance('nutrition-first-date')))
  ok(await call('advance_time', { seconds: secondsPerDay - (await get(call)).worldTimeSeconds }))
  await unchanged(call, 'advance_xge_relaxation', advance('would-cross-nutrition', 7200), 'SURVIVAL_DAY_EVENT_DUE')
  const partial = ok(await call('advance_xge_relaxation', advance('exact-nutrition-boundary', 3600)))
  const at = await get(call)
  assert.equal(partial.event.to, at.dmTools.survival.day.endsAt)
  assert.equal(at.dmTools.survival.day.foodHalfPounds, 0)
  assert.equal(at.dmTools.survival.day.waterPints, 0)
  ok(await call('resolve_survival_day', { eventId: 'actual-nutrition-outcome', nextHotWeather: false,
    source: 'Le MJ résout les vrais apports du jour et établit les besoins du suivant.' }))
  const after = await get(call)
  assert.equal(after.worldTimeSeconds, at.worldTimeSeconds)
  assert.deepEqual(after.dmTools.wallet, at.dmTools.wallet)
  assert.equal(after.dmTools.exhaustion.creatures.player.level, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
