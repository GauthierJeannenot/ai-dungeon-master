const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', DM_RATE_LIMIT_PER_MINUTE: '0' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, spawn } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { prepareFrigidWater } = require('./helpers/frigid-water-fixture.cjs')
const { groundGearPhysicalWitness } = require('../mcp-server/dist/lib/ground-gear-recovery-state.js')

const wizard = { adventureId: 'fey-shadow-fair', characterId: 'wizard' }
test.after(() => pg.restore())

async function refused(call, name, input, code) {
  const before = await call('get_game_state')
  assert.equal((await call(name, input)).code, code)
  assert.deepEqual(await call('get_game_state'), before)
}

async function inspect(call) { return ok(await call('inspect_frigid_water')) }

async function restoreSql(t, call, state, label) {
  const id = `frigid-${process.pid}-${label}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  return call('replace_game_state', { gameState: (await loadSession(id)).gameState })
}

test('a real surface swim reaches the exact Constitution grace and each extra minute costs one original save', async t => {
  const call = await engine(t, { ...wizard, dice: '1,20,19' })
  const before = await call('get_game_state'), f = await prepareFrigidWater(call)
  assert.equal((await inspect(call)).active, null)
  assert.equal(ok(await f.enter()).goalReached, true)
  const entered = await inspect(call), grace = before.player.stats.con * 60
  assert.equal(entered.active.startedAt, before.worldTimeSeconds)
  assert.equal(entered.active.constitution, before.player.stats.con)
  assert.equal(entered.nextSave.at, before.worldTimeSeconds + grace + 60)
  await refused(call, 'resolve_frigid_water_save', { eventId: entered.nextSave.eventId }, 'FRIGID_WATER_SAVE_REQUIRED')
  await refused(call, 'advance_time', { seconds: grace + 61 }, 'FRIGID_WATER_TIME_BOUNDARY')
  ok(await call('advance_time', { seconds: grace }))
  assert.equal((await inspect(call)).dueSave, null)
  const due = ok(await call('advance_time', { seconds: 60 })).frigidWaterEvent
  assert.deepEqual(due, entered.nextSave)
  await refused(call, 'advance_game_time', { seconds: 1 }, 'FRIGID_WATER_SAVE_DUE')
  const failed = ok(await call('resolve_frigid_water_save', { eventId: due.eventId }))
  assert.equal(failed.success, false)
  assert.equal(failed.save.roll.rolls[0], 1)
  assert.equal(failed.dc, 10)
  assert.equal(ok(await call('inspect_exhaustion', { targetId: 'player' })).level, 1)
  const once = await call('get_game_state')
  assert.equal(ok(await call('resolve_frigid_water_save', { eventId: due.eventId })).replayed, true)
  assert.deepEqual(await call('get_game_state'), once)
  const next = ok(await call('advance_time', { seconds: 60 })).frigidWaterEvent
  assert.equal(next.at, due.at + 60)
  const passed = ok(await call('resolve_frigid_water_save', { eventId: next.eventId }))
  assert.equal(passed.success, true)
  assert.equal(passed.save.roll.rolls[0], 20)
  assert.equal(ok(await call('inspect_exhaustion', { targetId: 'player' })).level, 1)
  assert.deepEqual((await call('get_game_state')).player.spellSlots, before.player.spellSlots)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('only a genuine dry bank exit resets the grace, not movement in water, a duplicate classification or replay', async t => {
  const call = await engine(t, { ...wizard, dice: '19' })
  const f = await prepareFrigidWater(call, { cells: [{ x: 4, y: 13 }, { x: 5, y: 13 }] })
  ok(await f.enter())
  const initial = (await inspect(call)).active
  ok(await call('advance_time', { seconds: 30 }))
  const side = { x: 5, y: 13 }
  ok(await f.swim('frigid-side', f.water, side))
  ok(await f.swim('frigid-back', side, f.water))
  assert.deepEqual((await inspect(call)).active, initial)
  const beforeReplay = await call('get_game_state')
  assert.equal(ok(await call('record_frigid_water', f.classification)).replayed, true)
  assert.deepEqual(await call('get_game_state'), beforeReplay)
  await refused(call, 'record_frigid_water', { ...f.classification, eventId: 'frigid-another-nonce' }, 'FRIGID_WATER_ENTRY_HISTORY_REQUIRED')
  assert.equal(ok(await f.leave()).goalReached, true)
  assert.deepEqual((await call('get_game_state')).player.position, f.bank)
  assert.equal((await inspect(call)).active, null)
  ok(await call('advance_time', { seconds: 50 }))
  assert.equal(ok(await f.reenter()).goalReached, true)
  const reentered = await inspect(call)
  assert.equal(reentered.active.startedAt, initial.startedAt + 80)
  assert.equal(reentered.nextSave.at, reentered.active.startedAt + (initial.constitution + 1) * 60)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a real round stops at the cold boundary, survives SQL, then resumes the original initiative and unused tick', async t => {
  const call = await engine(t, { ...wizard, dice: '20,1' })
  const f = await prepareFrigidWater(call)
  ok(await f.enter())
  const save = (await inspect(call)).nextSave
  ok(await call('advance_time', { seconds: save.at - 1 }))
  const hostile = await spawn(call, 'goblin', { x: 9, y: 13 })
  ok(await call('enter_combat', { combatants: ['player', hostile.id] }))
  const first = await call('get_game_state')
  assert.equal(first.currentTurn, 'player')
  ok(await call('pass_turn', { reason: 'The character actually holds position in the water.' }))
  const step = ok(await call('next_turn', { actorId: hostile.id, skipAction: true, reason: 'The actual combatant holds position.' }))
  assert.deepEqual(step.frigidWaterEvent, save)
  const paused = await call('get_game_state')
  assert.equal(paused.currentTurn, null)
  assert.equal(paused.worldTimeSeconds, save.at)
  assert.equal(paused.dmTools.weather.pendingCombatRound.tickEndsAt, save.at + 5)
  const resumed = await engine(t, { ...wizard, dice: '20,19' })
  // JSONB can reorder the object keys of both observations and tool receipts.
  const reordered = structuredClone(paused)
  reordered.dmTools.jumping.locomotion = JSON.parse(groundGearPhysicalWitness(paused.dmTools.jumping.locomotion))
  reordered.dmTools.frigidWater = JSON.parse(groundGearPhysicalWitness(paused.dmTools.frigidWater))
  reordered.worldFacts = JSON.parse(groundGearPhysicalWitness(paused.worldFacts))
  ok(await restoreSql(t, resumed, reordered, 'round-boundary'))
  const resolved = ok(await resumed('resolve_frigid_water_save', { eventId: save.eventId }))
  assert.equal(resolved.resumedCombatTurn, 'player')
  const after = await resumed('get_game_state')
  assert.equal(after.worldTimeSeconds, save.at + 5)
  assert.deepEqual(after.initiativeOrder, first.initiativeOrder)
  assert.equal(after.currentTurn, 'player')
  assert.equal(after.dmTools.weather.pendingCombatRound, undefined)
  assert.equal(ok(await resumed('roll_dice', { notation: '1d20' })).total, 19)
})

test('the real DM POST reads and resolves the exact due cold save, preserving the original SQL outcome', async t => {
  const call = await engine(t, { ...wizard, dice: '1,19' })
  for (const roomId of ['2', '9', '5']) ok(await call('move_token', { tokenId: 'player', roomId }))
  const f = await prepareFrigidWater(call, { bank: { x: 15, y: 1 } })
  ok(await f.enter())
  const next = (await inspect(call)).nextSave
  ok(await call('advance_time', { seconds: next.at }))
  const turn = await play(t, call, [
    { name: 'inspect_frigid_water', input: {} },
    params => ({ name: 'resolve_frigid_water_save', input: { eventId: lastResult(params).dueSave.eventId } }),
    params => {
      assert.equal(lastResult(params).save.roll.rolls[0], 1)
      return 'L’eau glaciale t’épuise.'
    },
  ], 'Résous exactement le jet dû de l’eau glaciale.')
  assert.deepEqual(turn.seen, turn.selected)
  assert.equal(turn.result.newGameState.dmTools.exhaustion.creatures.player.level, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a measured whole immersion establishes cold exposure without replacing its actual breathing deadline', async t => {
  const call = await engine(t, { ...wizard, dice: '19' })
  const state = await call('get_game_state')
  const f = await prepareFrigidWater(call, { water: state.player.position, surfaceZFeet: 8 })
  await refused(call, 'advance_time', { seconds: 1 }, 'FRIGID_WATER_CONTACT_REQUIRED')
  assert.equal((await inspect(call)).active, null)
  const source = 'The actual wizard is measured fully below this water surface, already on the floor.'
  ok(await call('record_physical_body', {
    eventId: 'actual-frigid-body', entityId: 'player', heightFeet: 5.5, actualMeasuredBodyConfirmed: true, source,
  }))
  ok(await call('set_breathing_context', { entityId: 'player', eventId: 'actual-frigid-held-air', mode: 'hold_breath', reason: source }))
  const air = (await call('get_game_state')).dmTools.breathing.creatures.player.episode
  ok(await call('record_underwater_context', {
    eventId: 'actual-frigid-immersion', subject: { kind: 'creature', entityId: 'player' }, fullyImmersed: true,
    waterMediumId: f.classification.waterMediumId, factId: f.classification.factId,
    actualPhysicalObservationConfirmed: true, breathingEpisodeId: air.id, source,
  }))
  const exposure = await inspect(call)
  assert.equal(exposure.active.entry.kind, 'whole_immersion')
  assert.ok(air.breathEndsAt < exposure.nextSave.at)
  await refused(call, 'set_breathing_context', { entityId: 'player', eventId: 'false-air', mode: 'air', reason: source }, 'UNDERWATER_AIR_CONTEXT_REQUIRED')
  ok(await call('advance_time', { seconds: 60 }))
  assert.deepEqual((await call('get_game_state')).dmTools.breathing.creatures.player.episode, air)
  assert.equal((await inspect(call)).dueSave, null)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('an actual simultaneous air and water event allows explicit ordering without pooling the two saves', async t => {
  const call = await engine(t, { ...wizard, dice: '20,1,19' })
  const state = await call('get_game_state'), source = 'Actual frigid air independently observed at the player.'
  const f = await prepareFrigidWater(call)
  ok(await call('configure_weather', { eventId: 'frigid-air-physical', roomId: state.currentRoomId, temperatureF: 0,
    strongWind: false, precipitation: 'none', sandstorm: false, fog: 'none', source }))
  ok(await call('record_weather_exposure', { eventId: 'frigid-air-entry', entityId: 'player', operation: 'begin',
    exposed: true, breathes: true, altitudeFeet: 0, historyKnown: true, knownColdPartialSeconds: 0,
    knownHeatPartialSeconds: 0, priorResolvedHeatHours: 0, knownAcclimationSeconds: 0, source }))
  const coldWaterSeconds = (state.player.stats.con + 1) * 60
  ok(await call('advance_time', { seconds: 3600 - coldWaterSeconds }))
  ok(await f.enter())
  ok(await call('advance_time', { seconds: coldWaterSeconds }))
  const air = ok(await call('inspect_weather')).events[0], water = (await inspect(call)).dueSave
  assert.equal(air.at, water.at)
  const airSave = ok(await call('resolve_weather_event', { eventId: air.eventId }))
  assert.equal(airSave.save.roll.rolls[0], 20)
  assert.deepEqual((await inspect(call)).dueSave, water)
  const waterSave = ok(await call('resolve_frigid_water_save', { eventId: water.eventId }))
  assert.equal(waterSave.save.roll.rolls[0], 1)
  assert.equal(ok(await call('inspect_exhaustion', { targetId: 'player' })).level, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
