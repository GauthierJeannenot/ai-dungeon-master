const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { prepareHerbalismCourse, prepareBrewAtCurrentSite } = require('./helpers/xge-brewing-fixture.cjs')
const { createRechargeItem } = require('./helpers/recharge-calendar-fixture.cjs')
const { prepareItemRechargeTime } = require('./helpers/item-recharge-time-fixture.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
test.after(() => pg.restore())

test('a real delayed greater potion resumes after one paid adjudication while only elapsed time recharges its selected pearl', async t => {
  const call = await engine(t, { characterId: 'wizard' })
  const course = await prepareHerbalismCourse(call, 'w31-cross-real-course')
  await course.completeInstruction()
  ok(await call('complete_xge_training', course.completion))
  await course.nextDay()
  const at = await call('get_game_state')
  ok(await call('create_treasure', { treasureId: 'w31-cross-coins', name: 'Fournitures et supplément', mode: 'authored',
    description: 'Pièces réellement présentes pour la dose et le supplément explicitement décidé par le MJ.', cell: at.player.position, coins: { gp: 200 } }))
  ok(await call('collect_treasure', { treasureId: 'w31-cross-coins' }))
  const pearlId = await createRechargeItem(call, 'pearl_of_power', 'w31-cross-real-pearl', { initialCharges: 0 })
  const recharge = await prepareItemRechargeTime(call, [pearlId], {
    eventId: 'w31-cross-local-recharge', firstAfterSeconds: 3600,
  })
  const start = await prepareBrewAtCurrentSite(call, course.input.practiceToolItemId, {
    eventId: 'w31-cross-actual-potion', potionItemId: 'w31-cross-completed-dose', paid: { gp: 100 },
  })
  ok(await call('start_xge_greater_healing_potion', start))
  const work = day => ({ eventId: 'w31-cross-effort-' + day, projectId: start.eventId,
    activitySource: 'Huit heures mesurées réellement consacrées à cette même potion au site initial.' })
  ok(await call('work_xge_greater_healing_potion', work(0)))
  assert.equal((await call('get_game_state')).dmTools.magicItems[pearlId].charges, 1)
  const firstDay = Math.floor((await call('get_game_state')).worldTimeSeconds / 86400)
  let state = await call('get_game_state')
  ok(await call('advance_time', { seconds: 10 * 86400 - state.worldTimeSeconds % 86400 }))
  const beforeRefusal = await call('get_game_state')
  assert.equal((await call('work_xge_greater_healing_potion', work(1))).code, 'XGE_BREW_DELAY_ADJUDICATION_REQUIRED')
  assert.deepEqual(await call('get_game_state'), beforeRefusal)
  ok(await call('attune_magic_item', { itemId: pearlId, operation: 'attune' }))
  state = await call('get_game_state')
  if (!state.player.knownSpells.includes('mage-armor')) ok(await call('prepare_spells', { spellIds: ['mage-armor'] }))
  ok(await call('cast_spell', { spellId: 'mage-armor', slotLevel: 1, targetId: 'player', focusItemId: 'component_pouch' }))
  ok(await call('use_magic_item', { itemId: pearlId, slotLevel: 1 }))
  assert.equal((await call('get_game_state')).dmTools.magicItems[pearlId].charges, 0)
  const fact = description => call('get_game_state').then(async current =>
    ok(await call('record_scene_fact', { cell: current.player.position, description })).worldFact)
  const decision = await fact('Le MJ choisit un supplément réel de cent pièces d’or et quatre dates finies pour terminer le projet en retard.')
  const complication = await fact('L’instructeur déjà présent a réellement critiqué le retard de cette préparation. Cette complication introduite ne laisse aucun effet mécanique non résolu.')
  const before = await call('get_game_state')
  const currentDay = Math.floor(before.worldTimeSeconds / 86400)
  assert.equal(currentDay, firstDay + 10)
  const judgment = { eventId: 'w31-cross-delay-judgment', projectId: start.eventId,
    decisionFactId: decision.id, extraComplicationFactId: complication.id, newDeadlineDay: currentDay + 3,
    paid: { gp: 100 }, actualDiscretionaryDecisionConfirmed: true, actualIntroducedComplicationConfirmed: true,
    noUnresolvedMechanicalConsequenceConfirmed: true }
  const adjudicated = ok(await call('adjudicate_xge_greater_healing_delay', judgment))
  assert.equal(adjudicated.totalCostCp, 20000)
  const after = await call('get_game_state')
  assert.equal(copperValue(before.dmTools.wallet) - copperValue(after.dmTools.wallet), 10000)
  assert.equal(after.worldTimeSeconds, before.worldTimeSeconds)
  assert.equal(after.dmTools.magicItems[pearlId].charges, 0)
  assert.equal(after.droppedItems?.[start.potionItemId], undefined)
  for (let day = 1; day < 5; day++) {
    if (day > 1) {
      const clock = await call('get_game_state')
      ok(await call('advance_time', { seconds: 86400 - clock.worldTimeSeconds % 86400 }))
    }
    const beforeWork = await call('get_game_state')
    ok(await call('work_xge_greater_healing_potion', work(day)))
    const afterWork = await call('get_game_state')
    assert.equal(afterWork.worldTimeSeconds - beforeWork.worldTimeSeconds, 28800)
    assert.equal(afterWork.dmTools.magicItems[pearlId].charges, day === 1 ? 0 : 1)
    assert.equal(Boolean(afterWork.droppedItems?.[start.potionItemId]), day === 4)
  }
  const complete = await call('get_game_state')
  assert.equal(complete.droppedItems[start.potionItemId].item.equipmentId, 'potion_of_greater_healing')
  const sessionId = 'w31-real-delay-recharge-' + process.pid
  t.after(() => deleteSession(sessionId))
  await saveSession(sessionId, { gameState: complete, history: [],
    adventureId: complete.adventureId, characterId: complete.characterId })
  const fresh = await engine(t, { characterId: 'wizard', dice: '19' })
  ok(await fresh('replace_game_state', { gameState: (await loadSession(sessionId)).gameState }))
  const restored = await fresh('get_game_state')
  assert.equal(ok(await fresh('adopt_xge_item_recharge_time', recharge.input)).replayed, true)
  assert.equal(ok(await fresh('adjudicate_xge_greater_healing_delay', judgment)).replayed, true)
  assert.equal(ok(await fresh('start_xge_greater_healing_potion', start)).replayed, true)
  for (let day = 0; day < 5; day++) assert.equal(ok(await fresh('work_xge_greater_healing_potion', work(day))).replayed, true)
  assert.deepEqual(await fresh('get_game_state'), restored)
  assert.equal(ok(await fresh('roll_dice', { notation: '1d20' })).total, 19)
})

test('actual fever contagion stops brewing before incubation ends while the same real elapsed interval recharges the chosen item', async t => {
  const { setupCackle } = require('./helpers/cackle-fever-fixture.cjs')
  const call = await engine(t, { characterId: 'wizard', dice: '1,1,2,20,1,1,1,1,20,19' })
  const course = await prepareHerbalismCourse(call, 'w31-cross-fever-course')
  await course.completeInstruction()
  ok(await call('complete_xge_training', course.completion))
  await course.nextDay()
  const at = await call('get_game_state')
  ok(await call('create_treasure', { treasureId: 'w31-cross-fever-funding', name: 'Vraies pièces de fournitures', mode: 'authored',
    description: 'Cent pièces d’or réellement présentes et ramassées pour cette dose.', cell: at.player.position, coins: { gp: 100 } }))
  ok(await call('collect_treasure', { treasureId: 'w31-cross-fever-funding' }))
  const fever = await setupCackle(t, { call, characterId: 'wizard' })
  assert.equal(fever.call, call)
  assert.equal(fever.infection.success, false)
  ok(await call('end_combat', { force: true,
    reason: 'Le porteur neutre et le personnage conviennent réellement de cesser cette confrontation ; aucun corps n’est déplacé, tué ou guéri.' }))
  const pearlId = await createRechargeItem(call, 'pearl_of_power', 'w31-cross-fever-pearl', { initialCharges: 0 })
  const recharge = await prepareItemRechargeTime(call, [pearlId], {
    eventId: 'w31-cross-fever-recharge', firstAfterSeconds: 1800,
  })
  const start = await prepareBrewAtCurrentSite(call, course.input.practiceToolItemId, {
    eventId: 'w31-cross-fever-brew', potionItemId: 'w31-cross-fever-dose', paid: { gp: 100 },
  })
  ok(await call('start_xge_greater_healing_potion', start))
  const work = { eventId: 'w31-cross-fever-effort', projectId: start.eventId,
    activitySource: 'Huit heures effectivement consacrées au même projet, seulement après résolution de la vraie apparition des symptômes.' }
  const before = await call('get_game_state')
  const playerCase = before.dmTools.afflictions.records[fever.infection.afflictionId]
  assert.equal(playerCase.cackleFever.onset, undefined)
  assert.ok(playerCase.nextAt > before.worldTimeSeconds)
  assert.equal((await call('work_xge_greater_healing_potion', work)).code, 'CACKLE_INCUBATION_BOUNDARY')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  assert.equal(before.dmTools.magicItems[pearlId].charges, 0)
  ok(await call('advance_time', { seconds: playerCase.nextAt - before.worldTimeSeconds }))
  const atOnset = await call('get_game_state')
  assert.equal(atOnset.worldTimeSeconds, playerCase.nextAt)
  assert.equal(atOnset.dmTools.magicItems[pearlId].charges, 1)
  ok(await call('resolve_cackle_fever_onset', { afflictionId: playerCase.id }))
  const symptomatic = await call('get_game_state')
  assert.equal(symptomatic.dmTools.exhaustion.creatures.player.level, 1)
  ok(await call('work_xge_greater_healing_potion', work))
  const worked = await call('get_game_state')
  assert.equal(worked.worldTimeSeconds - symptomatic.worldTimeSeconds, 28800)
  assert.equal(worked.dmTools.xgeBrewing.projects[0].segments.length, 1)
  assert.equal(worked.droppedItems?.[start.potionItemId], undefined)
  const sessionId = 'w31-fever-brew-recharge-' + process.pid
  t.after(() => deleteSession(sessionId))
  await saveSession(sessionId, { gameState: worked, history: [],
    adventureId: worked.adventureId, characterId: worked.characterId })
  const fresh = await engine(t, { characterId: 'wizard', dice: '19' })
  ok(await fresh('replace_game_state', { gameState: (await loadSession(sessionId)).gameState }))
  const restored = await fresh('get_game_state')
  assert.equal(ok(await fresh('resolve_cackle_fever_onset', { afflictionId: playerCase.id })).replayed, true)
  assert.equal(ok(await fresh('work_xge_greater_healing_potion', work)).replayed, true)
  assert.equal(ok(await fresh('adopt_xge_item_recharge_time', recharge.input)).replayed, true)
  assert.deepEqual(await fresh('get_game_state'), restored)
  assert.equal(ok(await fresh('roll_dice', { notation: '1d20' })).total, 19)
})

test('a real DM POST persists the NPC stress and disease save while retaining one explicitly selected player movement', async t => {
  const { setupCackle } = require('./helpers/cackle-fever-fixture.cjs')
  const { adjacent } = require('./helpers/mcp-toolkit.cjs')
  const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
  const f = await setupCackle(t, { contagion: false, dice: '1,1,2,19' })
  const call = f.call
  const state = await call('get_game_state')
  const destination = adjacent(state).find(cell => cell.x !== f.cell.x || cell.y !== f.cell.y)
  assert.ok(destination)
  const fact = ok(await call('record_scene_fact', { cell: f.cell,
    description: 'Le MJ atteste le véritable événement extérieur de grand stress qui vient de se produire pour ce porteur.' })).worldFact
  const stress = { name: 'record_cackle_fever_stress', input: { eventId: 'w31-post-real-carrier-stress',
    creatureId: f.npcId, factId: fact.id, actualGreatStressConfirmed: true,
    reason: 'Ce fait distinct établit le grand stress extérieur actuel du porteur réel.' } }
  const move = { name: 'move_token', input: { tokenId: 'player', toCell: destination } }
  const turn = await play(t, call, [
    stress,
    params => ({ name: 'resolve_cackle_fever_event', input: { eventId: ok(lastResult(params)).event.id } }),
    params => {
      const result = ok(lastResult(params))
      assert.equal(result.success, false)
      assert.equal(result.save.ability, 'con')
      assert.equal(result.damageRoll.total, 2)
      return move
    },
    'La crise du porteur est résolue mécaniquement, puis le personnage effectue son déplacement explicitement choisi.',
  ], 'Je décris ce stress réel du porteur, résous sa sauvegarde, puis je me déplace vers cette case précise.')
  assert.deepEqual(turn.seen.map(choice => choice.name), ['record_cackle_fever_stress', 'resolve_cackle_fever_event', 'move_token'])
  assert.deepEqual(turn.selected, turn.seen)
  const after = turn.result.newGameState
  assert.deepEqual(after.player.position, destination)
  assert.equal(after.npcs[f.npcId].hp.current, state.npcs[f.npcId].hp.current - 2)
  assert.ok(Object.values(after.dmTools.cackleFever.events).some(event => event.kind === 'stress' && event.result?.save))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('one real combat round pauses at simultaneous fever onset and selected-item recharge, then SQL resumes only its remaining seconds', async t => {
  const { setupCackle } = require('./helpers/cackle-fever-fixture.cjs')
  const f = await setupCackle(t, { onset: false, contagion: false, dice: '1,20,1,19' })
  const call = f.call
  const pearlId = await createRechargeItem(call, 'pearl_of_power', 'w31-exact-round-pearl', { initialCharges: 0 })
  const before = await call('get_game_state')
  const afflictionId = f.seed.affliction.id
  const dueAt = before.dmTools.afflictions.records[afflictionId].nextAt
  const recharge = await prepareItemRechargeTime(call, [pearlId], {
    eventId: 'w31-exact-round-recharge', firstAfterSeconds: dueAt - before.worldTimeSeconds,
  })
  const now = await call('get_game_state')
  ok(await call('advance_time', { seconds: dueAt - 3 - now.worldTimeSeconds }))
  const entered = ok(await call('enter_combat', { combatants: ['player', f.npcId] }))
  assert.deepEqual(entered.initiativeOrder, ['player', f.npcId])
  ok(await call('next_turn', { actorId: 'player', skipAction: true,
    reason: 'Le joueur termine explicitement son vrai tour sans action.' }))
  ok(await call('next_turn', { actorId: f.npcId, skipAction: true,
    reason: 'Le PNJ termine explicitement son vrai tour sans action.' }))
  const paused = await call('get_game_state')
  assert.equal(paused.worldTimeSeconds, dueAt)
  assert.equal(paused.dmTools.magicItems[pearlId].charges, 1)
  assert.equal(paused.dmTools.itemRechargeCalendar.evaluatedThrough, dueAt)
  assert.equal(paused.dmTools.weather.pendingCombatRound.cackleFeverAfflictionId, afflictionId)
  const sessionId = 'w31-round-fever-recharge-' + process.pid
  t.after(() => deleteSession(sessionId))
  await saveSession(sessionId, { gameState: paused, history: [],
    adventureId: paused.adventureId, characterId: paused.characterId })
  const fresh = await engine(t, { dice: '19' })
  ok(await fresh('replace_game_state', { gameState: (await loadSession(sessionId)).gameState }))
  assert.deepEqual(await fresh('get_game_state'), paused)
  ok(await fresh('resolve_cackle_fever_onset', { afflictionId }))
  const finished = await fresh('get_game_state')
  assert.equal(finished.worldTimeSeconds, dueAt + 3)
  assert.equal(finished.dmTools.magicItems[pearlId].charges, 1)
  assert.equal(finished.dmTools.itemRechargeCalendar.evaluatedThrough, dueAt + 3)
  assert.equal(finished.dmTools.weather.pendingCombatRound, undefined)
  assert.equal(finished.dmTools.exhaustion.creatures[f.npcId].level, 1)
  assert.equal(ok(await fresh('resolve_cackle_fever_onset', { afflictionId })).replayed, true)
  assert.equal(ok(await fresh('adopt_xge_item_recharge_time', recharge.input)).replayed, true)
  assert.deepEqual(await fresh('get_game_state'), finished)
  assert.equal(ok(await fresh('roll_dice', { notation: '1d20' })).total, 19)
})
