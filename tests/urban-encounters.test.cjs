const test = require('node:test')
const assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { prepareUrbanEncounter, urbanReroll } = require('./helpers/urban-encounter-fixture.cjs')
test.after(() => pg.restore())

const get = call => call('get_game_state')
async function refused(call, name, input, code) {
  const before = await get(call), result = await call(name, input)
  assert.ok(result.error)
  if (code) assert.equal(result.code, code)
  assert.deepEqual(await get(call), before)
}

test('a current qualified district still needs two actual local calendar references before any die', async t => {
  const call = await engine(t, { dice: '19' })
  const { input } = await prepareUrbanEncounter(call, { calendar: false })
  await refused(call, 'check_urban_encounter', { ...input, districtFactId: 'unknown-district' }, 'URBAN_ENCOUNTER_DISTRICT_REQUIRED')
  await refused(call, 'check_urban_encounter', input, 'URBAN_ENCOUNTER_CLOCK_REQUIRED')
  assert.equal((await get(call)).dmTools.urbanEncounters, undefined)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('one source d12+d8 proposal and only the qualified latest same-hour reroll survive SQL and new process', async t => {
  const call = await engine(t, { dice: '12,8,1,1,19' })
  const { input: prepared } = await prepareUrbanEncounter(call)
  const input = { ...prepared, eventId: prepared.eventId.padEnd(95, 'x') }
  const before = await get(call)
  const first = ok(await call('check_urban_encounter', input))
  assert.equal(first.clock.phase, 'day')
  assert.equal(first.source.startLine, 4652)
  assert.equal(first.source.endLine, 4672)
  assert.deepEqual(first.proposal, { faces: [12, 8], total: 20, label: 'Urchin' })
  await refused(call, 'check_urban_encounter', { ...input, eventId: 'fresh-nonce' }, 'URBAN_ENCOUNTER_PHASE_ALREADY_CHECKED')
  const choice = urbanReroll(input.eventId)
  await refused(call, 'reroll_urban_encounter', { ...choice, previousDrawId: 'unrelated-proposal' }, 'URBAN_ENCOUNTER_LATEST_DRAW_REQUIRED')
  const { incompatibleWithActualHourConfirmed: _, ...unqualified } = choice
  await refused(call, 'reroll_urban_encounter', unqualified)
  const second = ok(await call('reroll_urban_encounter', choice))
  assert.deepEqual(second.proposal, { faces: [1, 1], total: 2, label: 'Animals on the loose' })
  await refused(call, 'reroll_urban_encounter', urbanReroll(input.eventId, input.eventId, 'stale-proposal'), 'URBAN_ENCOUNTER_LATEST_DRAW_REQUIRED')
  assert.equal(ok(await call('check_urban_encounter', input)).replayed, true)
  assert.equal(ok(await call('reroll_urban_encounter', choice)).replayed, true)
  const saved = await get(call)
  const world = structuredClone(saved)
  delete world.dmTools.urbanEncounters
  assert.deepEqual(world, before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)

  const id = 'actual-urban-reroll-sql'
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: saved, history: [], adventureId: saved.adventureId, characterId: saved.characterId })
  const restored = await engine(t, { dice: '17' })
  const sql = (await loadSession(id)).gameState
  delete sql.adventureId
  ok(await restored('replace_game_state', { gameState: sql }))
  const baseline = await get(restored)
  assert.deepEqual(baseline.dmTools.urbanEncounters, saved.dmTools.urbanEncounters)
  for (const mutate of [
    state => state.dmTools.urbanEncounters.rerolls.pop(),
    state => { state.dmTools.urbanEncounters.checks[0].clock.phaseDate.day = 2 },
    state => { state.dmTools.urbanEncounters.rerolls[0].proposal.label = 'Fire' },
  ]) {
    const corrupt = structuredClone(baseline)
    mutate(corrupt)
    await refused(restored, 'replace_game_state', { gameState: corrupt }, 'URBAN_ENCOUNTER_STATE_MISMATCH')
  }
  const history = ok(await restored('inspect_urban_encounters', { checkId: input.eventId }))
  assert.deepEqual(history.results.map(row => row.proposal), [first.proposal, second.proposal])
  ok(await restored('advance_time', { seconds: 1 }))
  await refused(restored, 'reroll_urban_encounter', urbanReroll(input.eventId, choice.eventId, 'new-hour'), 'URBAN_ENCOUNTER_HOUR_CHANGED')
  assert.equal(ok(await restored('reroll_urban_encounter', choice)).replayed, true)
  assert.equal(ok(await restored('roll_dice', { notation: '1d20' })).total, 17)
})

test('night starts at the chosen hour and remains on the same phase date through midnight', async t => {
  const call = await engine(t, { dice: '4,2,19' })
  const { input } = await prepareUrbanEncounter(call, { secondOfDay: 20 * 3600 - 1 })
  const no = { ...input, decision: 'no_encounter' }
  const day = ok(await call('check_urban_encounter', no))
  assert.equal(day.clock.phase, 'day')
  assert.equal(day.proposal, undefined)
  ok(await call('advance_time', { seconds: 1 }))
  await refused(call, 'check_urban_encounter', { ...input, eventId: 'unproved-night' }, 'URBAN_ENCOUNTER_NIGHT_OUTSIDE_REQUIRED')
  const night = ok(await call('check_urban_encounter', { ...input, eventId: 'actual-night', nightOutsideConfirmed: true }))
  assert.equal(night.clock.phase, 'night')
  assert.equal(night.clock.phaseDate.day, 1)
  assert.deepEqual(night.proposal, { faces: [4, 2], total: 6, label: 'Companion' })
  await refused(call, 'reroll_urban_encounter', urbanReroll(night.checkId), 'URBAN_ENCOUNTER_NIGHT_OUTSIDE_REQUIRED')
  ok(await call('advance_time', { seconds: 4 * 3600 }))
  const midnight = ok(await call('inspect_urban_encounters'))
  assert.equal(midnight.clock.observedDate.day, 2)
  assert.equal(midnight.clock.phaseDate.day, 1)
  assert.equal(midnight.phaseChecked, true)
  await refused(call, 'check_urban_encounter', { ...no, eventId: 'midnight-duplicate', nightOutsideConfirmed: true }, 'URBAN_ENCOUNTER_PHASE_ALREADY_CHECKED')
  ok(await call('advance_time', { seconds: 6 * 3600 }))
  const morning = ok(await call('check_urban_encounter', { ...no, eventId: 'following-day' }))
  assert.equal(morning.clock.phase, 'day')
  assert.equal(morning.clock.phaseDate.day, 2)
  const support = ok(await call('get_rules_support', { domain: 'urban_encounters' }))
  assert.deepEqual(support.tools, ['check_urban_encounter', 'reroll_urban_encounter', 'inspect_urban_encounters'])
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})


async function recordUrbanMoment(call, referenceId, secondAdjustment = 0) {
  const { player } = await get(call)
  const { date: { year, segmentId, day, secondOfDay } } = ok(await call('inspect_campaign_calendar'))
  const { worldFact } = ok(await call('record_scene_fact', {
    description: 'Le MJ constate un nouvel instant distinct dans le quartier actuel.', cell: player.position,
  }))
  ok(await call('record_calendar_reference', {
    eventId: referenceId + '-event', referenceId, factId: worldFact.id, actualReferenceConfirmed: true,
    category: 'civic_observance', name: 'Instant distinct du quartier', description: 'Instant local effectivement constaté.',
    anchor: { year, segmentId, day, secondOfDay: secondOfDay + secondAdjustment },
  }))
  return referenceId
}

test('urban occurrence consumes d20 alone on 17 and d20 then d12+d8 on 18, preserving content reroll and SQL', async t => {
  const call = await engine(t, { dice: '17,18,12,8,1,1,19' })
  const { input: prepared } = await prepareUrbanEncounter(call)
  const input = { ...prepared, decision: 'd20' }
  const first = ok(await call('check_urban_encounter', input))
  assert.deepEqual(first.occurrenceRoll, { notation: '1d20', face: 17 })
  assert.equal(first.drawId, null)
  assert.equal(first.proposal, undefined)
  assert.deepEqual(ok(await call('check_urban_encounter', input)), { ...first, replayed: true })
  await refused(call, 'check_urban_encounter', { ...input, decision: 'draw' }, 'URBAN_ENCOUNTER_EVENT_CONFLICT')
  await refused(call, 'reroll_urban_encounter', urbanReroll(first.checkId), 'URBAN_ENCOUNTER_LATEST_DRAW_REQUIRED')

  const extra = { ...input, eventId: 'urban-distinct-afternoon', additionalDayCheck: {
    previousCheckId: first.checkId, momentReferenceId: 'real-later-moment', actualDistinctMomentConfirmed: true,
  } }
  await refused(call, 'check_urban_encounter', extra, 'URBAN_ENCOUNTER_DISTINCT_DAY_REQUIRED')
  ok(await call('advance_time', { seconds: 60 }))
  const wrongMoment = await recordUrbanMoment(call, 'wrong-local-time', -1)
  await refused(call, 'check_urban_encounter', { ...extra, additionalDayCheck: {
    ...extra.additionalDayCheck, momentReferenceId: wrongMoment,
  } }, 'URBAN_ENCOUNTER_MOMENT_REQUIRED')
  await recordUrbanMoment(call, extra.additionalDayCheck.momentReferenceId)
  await refused(call, 'check_urban_encounter', {
    ...extra, dayStartReferenceId: input.nightStartReferenceId, nightStartReferenceId: input.dayStartReferenceId,
    nightOutsideConfirmed: true,
  }, 'URBAN_ENCOUNTER_CLOCK_IMMUTABLE')
  const { player } = await get(call)
  const otherDistrict = ok(await call('record_scene_fact', {
    description: 'Le MJ consigne un autre fait local, distinct du fait d’origine.', cell: player.position,
  })).worldFact
  await refused(call, 'check_urban_encounter', { ...extra, districtFactId: otherDistrict.id },
    'URBAN_ENCOUNTER_DISTINCT_DAY_REQUIRED')
  const before = await get(call)
  const second = ok(await call('check_urban_encounter', extra))
  assert.equal(second.at, first.at + 60)
  assert.deepEqual(second.clock.phaseDate, first.clock.phaseDate)
  assert.deepEqual(second.occurrenceRoll, { notation: '1d20', face: 18 })
  assert.deepEqual(second.proposal, { faces: [12, 8], total: 20, label: 'Urchin' })
  await refused(call, 'check_urban_encounter', { ...extra, eventId: 'same-moment-nonce', additionalDayCheck: {
    ...extra.additionalDayCheck, previousCheckId: second.checkId,
  } }, 'URBAN_ENCOUNTER_DISTINCT_DAY_REQUIRED')
  const redrawInput = urbanReroll(second.checkId)
  const redraw = ok(await call('reroll_urban_encounter', redrawInput))
  assert.deepEqual(redraw.proposal, { faces: [1, 1], total: 2, label: 'Animals on the loose' })
  assert.equal(redraw.occurrenceRoll, undefined)
  const saved = await get(call)
  assert.deepEqual({ ...saved, dmTools: { ...saved.dmTools, urbanEncounters: before.dmTools.urbanEncounters } }, before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)

  const id = 'actual-urban-occurrence-sql'
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: saved, history: [], adventureId: saved.adventureId, characterId: saved.characterId })
  const resumed = await engine(t, { dice: '20' })
  const sql = (await loadSession(id)).gameState
  delete sql.adventureId
  ok(await resumed('replace_game_state', { gameState: sql }))
  const baseline = await get(resumed)
  assert.deepEqual(baseline.dmTools.urbanEncounters, saved.dmTools.urbanEncounters)
  assert.deepEqual(ok(await resumed('check_urban_encounter', extra)), { ...second, replayed: true })
  assert.deepEqual(ok(await resumed('reroll_urban_encounter', redrawInput)), { ...redraw, replayed: true })
  const { urbanEncounterCommand } = require('../mcp-server/dist/lib/urban-encounter-state.js')
  for (const corruptReceipt of [
    receipt => { receipt.occurrenceRoll.face = 17 },
    receipt => { receipt.input.additionalDayCheck.momentReferenceId = wrongMoment },
    receipt => { delete receipt.input.additionalDayCheck },
  ]) {
    const corrupt = structuredClone(baseline)
    const receipt = corrupt.dmTools.urbanEncounters.checks[1]
    corruptReceipt(receipt)
    receipt.command = urbanEncounterCommand(receipt)
    await refused(resumed, 'replace_game_state', { gameState: corrupt }, 'URBAN_ENCOUNTER_STATE_MISMATCH')
  }
  assert.equal(ok(await resumed('roll_dice', { notation: '1d20' })).total, 20)
})

test('urban d20 requires actual night outing and another nighttime instant cannot bypass the same phase after midnight', async t => {
  const call = await engine(t, { dice: '17,19' })
  const { input: prepared } = await prepareUrbanEncounter(call, { secondOfDay: 21 * 3600 })
  const input = { ...prepared, decision: 'd20' }
  await refused(call, 'check_urban_encounter', input, 'URBAN_ENCOUNTER_NIGHT_OUTSIDE_REQUIRED')
  const confirmed = { ...input, nightOutsideConfirmed: true }
  const check = ok(await call('check_urban_encounter', confirmed))
  assert.equal(check.clock.phase, 'night')
  assert.deepEqual(check.occurrenceRoll, { notation: '1d20', face: 17 })
  assert.equal(check.drawId, null)
  ok(await call('advance_time', { seconds: 3 * 3600 }))
  const momentReferenceId = await recordUrbanMoment(call, 'new-instant-same-night')
  await refused(call, 'check_urban_encounter', { ...confirmed, eventId: 'extra-night', additionalDayCheck: {
    previousCheckId: check.checkId, momentReferenceId, actualDistinctMomentConfirmed: true,
  } }, 'URBAN_ENCOUNTER_DAY_EXTRA_REQUIRED')
  await refused(call, 'check_urban_encounter', { ...confirmed, eventId: 'extra-night-without-cadence' },
    'URBAN_ENCOUNTER_PHASE_ALREADY_CHECKED')
  const { clock } = ok(await call('inspect_urban_encounters'))
  assert.equal(clock.observedDate.day, 2)
  assert.equal(clock.phaseDate.day, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
