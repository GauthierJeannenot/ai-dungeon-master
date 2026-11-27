const assert = require('node:assert/strict')
const test = require('node:test')
Object.assign(process.env, {
  MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
})
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, adjacent } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { makePlayerChaseFatigue } = require('./helpers/chase-fixture.cjs')
test.after(() => pg.restore())

const exposure = { sourceId: 'sewer-filth', eventId: 'actual-contact', targetId: 'player', delivery: 'contact' }
const afflictionId = `${exposure.sourceId}:${exposure.eventId}`
const sourceFact = 'Souillure réelle de la case et contact du PJ explicitement établis.'
const infection = state => state.dmTools.afflictions.records[afflictionId]
const level = state => state.dmTools.exhaustion?.creatures.player?.level ?? 0
const resolve = (call, args = {}) => call('resolve_affliction_event', { afflictionId, ...args })

async function prepareSource(call, cell) {
  const state = await call('get_game_state')
  ok(await call('create_affliction_source', {
    sourceId: exposure.sourceId, templateId: 'sewer_plague', name: sourceFact, cell: cell ?? state.player.position, doses: 3,
  }))
}

async function infect(call) {
  await prepareSource(call)
  const result = ok(await call('expose_affliction', exposure))
  assert.equal(result.save.dc, 11)
  assert.equal(result.save.success, false)
  assert.equal(result.incubationRoll.notation, '1d4')
  return result.affliction
}

async function advanceToSymptoms(call) {
  const state = await call('get_game_state')
  ok(await call('advance_time', { seconds: infection(state).nextAt - state.worldTimeSeconds }))
  return ok(await resolve(call))
}

async function refuse(call, name, input, expected) {
  const before = await call('get_game_state')
  const response = await call(name, input)
  assert.equal(response.code, expected, JSON.stringify(response))
  assert.deepEqual(await call('get_game_state'), before)
}

async function actualDamage(call, amount) {
  ok(await call('update_hp', { entityId: 'player', delta: -amount, reason: 'Blessure réelle préexistante, sans relation avec la souillure.' }))
}

async function persist(t, state, id) {
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  return (await loadSession(id)).gameState
}

test('explicit Sewer Plague contact spends one exposure on either save result, without a free carrier bite or re-infection', async t => {
  const call = await engine(t, { dice: '20,1,4,19' })
  await prepareSource(call)
  const state = await call('get_game_state')
  const npc = ok(await call('spawn_monster', { monsterType: 'commoner', cell: adjacent(state)[0] }))
  // The NPC refusal is independent of delivery and happens before source expense.
  const npcState = await call('get_game_state')
  ok(await call('create_affliction_source', { sourceId: 'npc-ground', templateId: 'sewer_plague', name: sourceFact, cell: npcState.monsters[npc.id].position, doses: 1 }))
  await refuse(call, 'expose_affliction', { ...exposure, sourceId: 'npc-ground', targetId: npc.id }, 'SEWER_PLAGUE_PLAYER_ONLY')
  await refuse(call, 'expose_affliction', { ...exposure, delivery: 'injury' }, 'AFFLICTION_DELIVERY_MISMATCH')
  const saved = ok(await call('expose_affliction', { ...exposure, eventId: 'resisted-contact' }))
  assert.equal(saved.save.success, true)
  assert.equal(saved.affliction.status, 'ended')
  assert.equal(saved.incubationRoll, undefined)
  const failed = ok(await call('expose_affliction', exposure))
  assert.equal(failed.incubationRoll.total, 4)
  assert.equal(failed.affliction.nextAt, failed.affliction.appliedAt + 4 * 86400)
  assert.equal(ok(await call('expose_affliction', exposure)).alreadyResolved, true)
  await refuse(call, 'expose_affliction', { ...exposure, eventId: 'second-infection' }, 'SEWER_PLAGUE_ALREADY_INFECTED')
  const after = await call('get_game_state')
  assert.equal(level(after), 0)
  assert.equal(after.dmTools.afflictions.sources[exposure.sourceId].doses, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('incubating infection owes an actual long-rest save, and success at exhaustion zero does not cure', async t => {
  const call = await engine(t, { dice: '1,1,20,19' })
  await infect(call)
  await actualDamage(call, 12)
  const rest = ok(await call('take_rest', { kind: 'long' }))
  assert.equal(rest.hpBlockedBySewerPlague, false)
  assert.equal(rest.hp.current, rest.hp.max)
  assert.equal(rest.sewerPlagueEvent.restId, rest.restId)
  await refuse(call, 'resolve_affliction_event', { afflictionId, restId: 'uncompleted-rest' }, 'SEWER_PLAGUE_REST_EVENT_NOT_DUE')
  const result = ok(await resolve(call, { restId: rest.restId }))
  assert.equal(result.event.result.success, true)
  assert.equal(result.event.result.recovered, false)
  assert.equal(result.event.result.exhaustionEventId, undefined)
  assert.equal(infection(await call('get_game_state')).status, 'active')
  assert.equal(ok(await resolve(call, { restId: rest.restId })).replayed, true)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('actual onset, both Hit Dice entry points, zero long-rest HP and one curing save survive SQL and a new child', async t => {
  const call = await engine(t, { dice: '1,1,5,6' })
  await infect(call)
  await refuse(call, 'advance_time', { seconds: 86401 }, 'SEWER_PLAGUE_ONSET_BOUNDARY')
  ok(await call('advance_time', { seconds: 86400 }))
  await refuse(call, 'advance_time', { seconds: 1 }, 'AFFLICTION_EVENT_REQUIRED')
  const onset = ok(await resolve(call))
  assert.equal(onset.exhaustion.receipt.afterLevel, 1)
  assert.equal(ok(await resolve(call)).replayed, true)
  await actualDamage(call, 22)
  const damaged = (await call('get_game_state')).player.hp.current
  const short = ok(await call('take_rest', { kind: 'short', hitDice: 1 }))
  assert.equal(short.hp.current - damaged, Math.floor(short.rolls[0].total / 2))
  const next = ok(await call('spend_rest_hit_die', { restId: short.restId, eventId: 'actual-second-die' }))
  assert.equal(next.hpAfter - next.hpBefore, Math.floor(next.roll.total / 2))
  const long = ok(await call('take_rest', { kind: 'long' }))
  assert.equal(long.hpBlockedBySewerPlague, true)
  assert.equal(long.hp.current, next.hpAfter)
  assert.ok(long.hitDice.current > next.hitDice.current)
  const original = await call('get_game_state')
  const restored = await engine(t, { dice: '20,19' })
  ok(await restored('replace_game_state', { gameState: await persist(t, original, 'w25-sewer-original-rest') }))
  assert.deepEqual(await restored('get_game_state'), original)
  const tampered = structuredClone(original)
  delete infection(tampered).sewerPlague.restEvents[long.restId]
  await refuse(restored, 'replace_game_state', { gameState: tampered }, 'SEWER_PLAGUE_STATE_MISMATCH')
  await refuse(restored, 'add_exhaustion', { targetId: 'player', levels: 1, eventId: 'cannot-rewrite-boundary', reason: sourceFact }, 'AFFLICTION_EVENT_REQUIRED')
  const cured = ok(await resolve(restored, { restId: long.restId }))
  assert.equal(cured.event.result.recovered, true)
  const after = await restored('get_game_state')
  assert.equal(level(after), 0)
  assert.equal(after.player.hp.current, next.hpAfter)
  assert.equal(infection(after).status, 'cured')
  assert.equal(ok(await resolve(restored, { restId: long.restId })).replayed, true)
  assert.equal(ok(await restored('roll_dice', { notation: '1d20' })).total, 19)
})

test('ordinary food-and-water recovery resolves before the later failed CON11 and its single source level', async t => {
  const call = await engine(t, { dice: '1,1,1,19' })
  await infect(call)
  await advanceToSymptoms(call)
  const state = await call('get_game_state')
  ok(await call('create_scene_object', {
    objectId: 'actual-sewer-provisions', name: 'Réserve réelle de vivres', description: 'Une vraie ration et une outre sélectionnées pour ce repos.',
    cell: state.player.position, kind: 'container', material: 'wood', size: 'small', resilience: 'fragile', contents: ['ration_1_day', 'waterskin_full'],
  }))
  const provisions = ok(await call('interact_object', { objectId: 'actual-sewer-provisions', action: 'open' })).releasedItems
  for (const item of provisions) ok(await call('pick_up_item', { itemId: item.id }))
  ok(await call('begin_nutrition_tracking', {
    eventId: 'actual-sewer-nutrition', operation: 'begin', standardNeedsConfirmed: true, hotWeather: false,
    source: 'Besoins standards et absence de privation antérieure établis.', foodDebtHalfDays: 0, priorDeprivation: 'none',
  }))
  for (const [i, item] of provisions.entries()) ok(await call('consume_provisions', { eventId: `actual-sewer-intake-${i}`, itemId: item.id, units: 1 }))
  const rest = ok(await call('take_rest', { kind: 'long' }))
  assert.equal(rest.exhaustionRecovery.beforeLevel, 1)
  assert.equal(rest.exhaustionRecovery.afterLevel, 0)
  assert.equal(level(await call('get_game_state')), 0)
  const failed = ok(await resolve(call, { restId: rest.restId }))
  assert.equal(failed.event.exhaustionBeforeSave, 0)
  assert.equal(failed.event.result.success, false)
  assert.equal(level(await call('get_game_state')), 1)
  assert.equal(ok(await resolve(call, { restId: rest.restId })).replayed, true)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a real Lesser Restoration cures the chosen disease without removing its already accrued exhaustion', async t => {
  const call = await engine(t, { characterId: 'cleric', dice: '1,1,19' })
  await infect(call)
  await advanceToSymptoms(call)
  ok(await call('equip_item', { itemId: 'mace', operation: 'unequip', slot: 'main_hand' }))
  const before = await call('get_game_state')
  ok(await call('cast_spell', { spellId: 'lesser-restoration', targetId: 'player', slotLevel: 2, afflictionId }))
  const after = await call('get_game_state')
  assert.equal(infection(after).status, 'cured')
  assert.equal(level(after), 1)
  assert.equal(after.player.spellSlots.level2.current, before.player.spellSlots.level2.current - 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('armored W24 rest ruling is retained and mixed disease removal requires the actual chosen source before rolling', async t => {
  const dice = [20,10,1,...Array.from({length:6},()=>[11,11]).flat(),1,11,1,1,20,19].join(',')
  const { call } = await makePlayerChaseFatigue(t, { dice })
  await infect(call)
  await advanceToSymptoms(call)
  ok(await call('configure_sleep_rules', { eventId: 'sewer-armored-policy', armorRecovery: true, deprivation: false, reason: 'Le MJ adopte la récupération en armure avant cette période.' }))
  const restId = 'actual-sewer-armored-rest'
  ok(await call('begin_rest', { restId, kind: 'long' }))
  ok(await call('advance_rest', { restId, eventId: 'actual-sewer-armored-sleep', seconds: 28800, activity: 'sleep', reason: 'Sommeil réellement effectué en armure portée.' }))
  await refuse(call, 'finish_rest', { restId }, 'CHASE_ARMOR_REST_ADJUDICATION_REQUIRED')
  ok(await call('adjudicate_chase_rest_recovery', { eventId: 'sewer-local-chase-ruling', restId, choice: 'armor_prevents_chase_recovery', reason: 'Arbitrage local explicite pour ce vrai repos.' }))
  ok(await call('finish_rest', { restId }))
  await refuse(call, 'resolve_affliction_event', { afflictionId, restId }, 'EXHAUSTION_SOURCE_CHOICE_REQUIRED')
  const result = ok(await resolve(call, { restId, removalSource: 'other' }))
  assert.equal(result.event.result.success, true)
  assert.equal(result.event.result.recovered, false)
  const after = await call('get_game_state')
  assert.equal(level(after), 1)
  assert.equal(after.dmTools.chases.fatigue.player.levels, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('actual DM POST chooses rest and the separate save exactly once, preserving the resulting disease receipt', async t => {
  const call = await engine(t, { dice: '1,1,20,19' })
  await infect(call)
  await advanceToSymptoms(call)
  const { result, seen, selected } = await play(t, call, [
    { name: 'take_rest', input: { kind: 'long' } },
    params => {
      const rest = ok(lastResult(params))
      return { name: 'resolve_affliction_event', input: { afflictionId, restId: rest.sewerPlagueEvent.restId } }
    },
    () => 'Le repos réellement achevé a été suivi de la sauvegarde choisie.',
  ], 'Je prends le long repos. Le MJ choisit ensuite le jet exigé par cette maladie.')
  assert.deepEqual(seen, selected)
  assert.equal(result.newGameState.dmTools.afflictions.records[afflictionId].status, 'cured')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a real combat tick pauses four seconds into its original six-second step before starting the next turn', async t => {
  const call = await engine(t, { dice: '1,1,20,10,19' })
  const record = await infect(call)
  ok(await call('advance_time', { seconds: 86396 }))
  const state = await call('get_game_state')
  const npc = ok(await call('spawn_monster', { monsterType: 'commoner', cell: adjacent(state)[0] }))
  ok(await call('enter_combat', { combatants: ['player', npc.id], tieOrder: ['player', npc.id] }))
  ok(await call('next_turn', { actorId: 'player', skipAction: true, reason: 'Le joueur passe le vrai tour.' }))
  ok(await call('next_turn', { actorId: npc.id, skipAction: true, reason: 'Le PNJ passe le vrai tour.' }))
  const paused = await call('get_game_state')
  assert.equal(paused.worldTimeSeconds, record.nextAt)
  assert.equal(paused.currentTurn, null)
  assert.equal(paused.round, 2)
  const round = paused.dmTools.weather.pendingCombatRound
  assert.equal(round.sewerPlagueAfflictionId, afflictionId)
  assert.equal(round.roundEventsResolved, false)
  assert.equal(round.tickEndsAt - round.at, 2)
  assert.deepEqual(paused.dmTools.weather.contexts, {})
  assert.deepEqual(paused.dmTools.weather.profiles, {})
  await refuse(call, 'next_turn', { skipAction: true }, 'AFFLICTION_EVENT_REQUIRED')
  ok(await call('replace_game_state', { gameState: paused }))
  const resumed = ok(await resolve(call))
  assert.equal(resumed.resumedCombatTurn, 'player')
  const after = await call('get_game_state')
  assert.equal(after.worldTimeSeconds, record.nextAt + 2)
  assert.equal(after.currentTurn, 'player')
  assert.equal(after.round, 2)
  assert.equal(after.dmTools.weather.pendingCombatRound, undefined)
  assert.equal(level(after), 1)
  assert.deepEqual(after.initiativeOrder, paused.initiativeOrder)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a recorded rest can resume at its exact disease boundary without inventing an interruption', async t => {
  const call = await engine(t, { dice: '1,1,5,19' })
  await infect(call)
  await actualDamage(call, 15)
  ok(await call('advance_time', { seconds: 82800 }))
  await refuse(call, 'take_rest', { kind: 'short', hitDice: 1 }, 'REST_SEWER_PLAGUE_BOUNDARY')
  const restId = 'actual-incubation-boundary-rest'
  ok(await call('begin_rest', { restId, kind: 'short' }))
  ok(await call('advance_rest', { restId, eventId: 'actual-time-to-onset', seconds: 3600, activity: 'light', reason: 'Une heure réelle de repos léger.' }))
  ok(await resolve(call))
  assert.equal(ok(await call('inspect_rest', { restId })).unobservedActivity, false)
  const hpBefore = (await call('get_game_state')).player.hp.current
  const rest = ok(await call('finish_rest', { restId, hitDice: 1 }))
  assert.equal(rest.hp.current - hpBefore, Math.floor(rest.rolls[0].total / 2))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('actual Death Ward and potentially lethal rest failure refuse before recovery and any saving throw', async t => {
  const call = await engine(t, { characterId: 'cleric', dice: '1,1,20,20,19' })
  await infect(call)
  ok(await call('equip_item', { itemId: 'mace', operation: 'unequip', slot: 'main_hand' }))
  ok(await call('add_exhaustion', { eventId: 'actual-level-five', targetId: 'player', levels: 5, reason: 'Le MJ atteste une fatigue réelle indépendante de la maladie.' }))
  const restId = 'actual-late-ward-rest'
  ok(await call('begin_rest', { restId, kind: 'long' }))
  ok(await call('advance_rest', { restId, eventId: 'actual-late-ward-sleep', seconds: 28800, activity: 'sleep', reason: 'Huit heures de sommeil réellement accomplies.' }))
  ok(await call('cast_spell', { spellId: 'death-ward', slotLevel: 4, targetId: 'player' }))
  ok(await call('record_rest_activity', { restId, eventId: 'actual-ward-observation', activity: 'light', reason: 'Le MJ constate le sort réellement lancé à la fin de la période.' }))
  await refuse(call, 'finish_rest', { restId }, 'SEWER_PLAGUE_WARD_ADJUDICATION_REQUIRED')
  ok(await call('remove_exhaustion', { eventId: 'actual-distinct-reduction', targetId: 'player', levels: 1, reason: 'Décision exceptionnelle sur une autre source d’épuisement.' }))
  if (ok(await call('inspect_rest', { restId })).unobservedActivity)
    ok(await call('record_rest_activity', { restId, eventId: 'actual-source-adjustment-observation', activity: 'light', reason: 'Le MJ constate la réduction d’épuisement déjà résolue.' }))
  ok(await call('finish_rest', { restId }))
  const saved = ok(await resolve(call, { restId }))
  assert.equal(saved.event.exhaustionBeforeSave, 4)
  assert.equal(saved.event.result.success, true)
  assert.equal(level(await call('get_game_state')), 3)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('equal weather, nutrition and incubation boundaries retain a single tick and the actual first resolver order', async t => {
  const call = await engine(t, { dice: '1,1,20,10,20,19' })
  const record = await infect(call)
  ok(await call('begin_nutrition_tracking', {
    eventId: 'same-boundary-nutrition', operation: 'begin', standardNeedsConfirmed: true, hotWeather: false,
    source: 'Besoins et journée physique réellement établis.', foodDebtHalfDays: 0, priorDeprivation: 'none',
  }))
  ok(await call('advance_time', { seconds: 86396 }))
  const state = await call('get_game_state')
  const npc = ok(await call('spawn_monster', { monsterType: 'commoner', cell: adjacent(state)[0] }))
  const source = 'Froid et temps déjà exposé réellement constatés avant ce combat.'
  ok(await call('configure_weather', { eventId: 'same-boundary-cold', roomId: state.currentRoomId, temperatureF: 0, strongWind: false, precipitation: 'none', sandstorm: false, fog: 'none', source }))
  const exposureProfile = {
    operation: 'begin', breathes: true, altitudeFeet: 0, historyKnown: true,
    knownHeatPartialSeconds: 0, priorResolvedHeatHours: 0, knownAcclimationSeconds: 0, source,
  }
  ok(await call('record_weather_exposure', { ...exposureProfile, eventId: 'same-boundary-player', entityId: 'player', exposed: true, knownColdPartialSeconds: 3596 }))
  ok(await call('record_weather_exposure', { ...exposureProfile, eventId: 'same-boundary-bystander', entityId: npc.id, exposed: false, knownColdPartialSeconds: 0 }))
  ok(await call('enter_combat', { combatants: ['player', npc.id], tieOrder: ['player', npc.id] }))
  ok(await call('next_turn', { actorId: 'player', skipAction: true }))
  const boundary = ok(await call('next_turn', { actorId: npc.id, skipAction: true }))
  assert.equal(boundary.sewerPlagueEvent.at, record.nextAt)
  assert.equal(boundary.currentTurn, null)
  const paused = await call('get_game_state')
  const thermal = ok(await call('inspect_weather')).events[0]
  assert.equal(thermal.at, record.nextAt)
  assert.equal(paused.dmTools.survival.day.endsAt, record.nextAt)
  assert.equal(paused.dmTools.weather.pendingCombatRound.roundEventsResolved, false)
  const nutrition = { eventId: 'same-boundary-actual-nutrition-day', nextHotWeather: false, source: 'Journée réellement écoulée, aucune prise alimentaire ou hydrique inventée.' }
  ok(await call('resolve_survival_day', nutrition))
  assert.equal((await call('get_game_state')).currentTurn, null)
  assert.equal(ok(await call('resolve_weather_event', { eventId: thermal.eventId })).resumedCombatTurn, null)
  assert.equal(ok(await resolve(call)).resumedCombatTurn, 'player')
  const after = await call('get_game_state')
  assert.equal(after.worldTimeSeconds, record.nextAt + 2)
  assert.equal(level(after), 2)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)

  // A separate child follows the other actual choice from the unmodified
  // original snapshot. Each branch keeps its own authoritative timeline.
  const alternate = await engine(t, { dice: '20,19' })
  ok(await alternate('replace_game_state', { gameState: await persist(t, paused, 'w25-sewer-three-boundaries') }))
  assert.equal(ok(await resolve(alternate)).resumedCombatTurn, null)
  assert.equal(ok(await alternate('resolve_weather_event', { eventId: thermal.eventId })).resumedCombatTurn, null)
  ok(await alternate('resolve_survival_day', nutrition))
  const alternateAfter = await alternate('get_game_state')
  assert.equal(alternateAfter.worldTimeSeconds, record.nextAt + 2)
  assert.equal(alternateAfter.currentTurn, 'player')
  assert.equal(level(alternateAfter), 3, 'The actual thirst rule doubles its level increase once disease exhaustion already exists.')
  assert.deepEqual(alternateAfter.initiativeOrder, paused.initiativeOrder)
  assert.equal(ok(await alternate('roll_dice', { notation: '1d20' })).total, 19)
})
