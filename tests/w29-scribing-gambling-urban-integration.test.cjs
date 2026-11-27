const test = require('node:test')
const assert = require('node:assert/strict')

Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, adjacent } = require('./helpers/mcp-toolkit.cjs')
const { fundScribing, prepareScribingAtCurrentSite } = require('./helpers/xge-scribing-fixture.cjs')
const { prepareUrbanEncounter } = require('./helpers/urban-encounter-fixture.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')

test.after(() => pg.restore())

test('scribing and gambling share the workday while the real clock changes the urban check date', async t => {
  const options = { adventureId: 'fey-shadow-fair', characterId: 'wizard', dice: '17,18,12,8,19' }
  const call = await engine(t, options)
  const { input: urban } = await prepareUrbanEncounter(call)
  const opening = ok(await call('check_urban_encounter', { ...urban, decision: 'd20' }))
  assert.equal(opening.clock.phase, 'day')
  assert.equal(opening.occurrenceRoll.face, 17)
  assert.equal(opening.drawId, null)

  await fundScribing(call, 'w29-cross-funds')
  const scribe = await prepareScribingAtCurrentSite(call, {
    eventId: 'w29-cross-scribing', scrollItemId: 'w29-cross-scroll',
  })
  const state = await call('get_game_state')
  const creditorId = 'w29-actual-creditor'
  ok(await call('create_npc', {
    npcId: creditorId, name: 'Tenancier', statBlock: 'goblin', cell: adjacent(state)[0],
    disposition: 'neutral', visible: true, description: 'Le créancier réel tient cette table de jeu.',
  }))
  const { worldFact } = ok(await call('record_scene_fact', {
    cell: state.player.position, description: 'Le MJ atteste la maison de jeu, la table et le tenancier présents.',
  }))
  const weekId = 'w29-cross-gambling'
  const start = { eventId: weekId, venueFactId: worldFact.id, creditorId,
    paid: { gp: 10 }, explicitlyAdopted: true, actualGamblingVenueConfirmed: true }
  const beforeStake = await call('get_game_state')
  ok(await call('start_xge_gambling', start))
  const afterStake = await call('get_game_state')
  assert.equal(copperValue(beforeStake.dmTools.wallet) - copperValue(afterStake.dmTools.wallet), 1_000)
  ok(await call('scribe_xge_spell_scroll', scribe))

  const work = { eventId: 'w29-cross-gambling-first-day', weekId }
  const before = await call('get_game_state')
  const refused = await call('work_xge_gambling', work)
  assert.equal(refused.code, 'DOWNTIME_SHARED_DAY_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('advance_time', { seconds: 86_400 - before.worldTimeSeconds % 86_400 }))
  const startOfWork = await call('get_game_state')
  ok(await call('work_xge_gambling', work))
  assert.equal((await call('get_game_state')).worldTimeSeconds, startOfWork.worldTimeSeconds + 28_800)

  const night = { ...urban, eventId: 'w29-cross-night', decision: 'd20', nightOutsideConfirmed: true }
  const occurrence = ok(await call('check_urban_encounter', night))
  assert.equal(occurrence.clock.phase, 'night')
  assert.equal(occurrence.clock.phaseDate.day, opening.clock.phaseDate.day + 1)
  assert.equal(occurrence.occurrenceRoll.face, 18)
  assert.deepEqual(occurrence.proposal.faces, [12, 8])
  assert.equal(occurrence.proposal.label, 'Urchin')

  const checkpoint = await call('get_game_state')
  const sessionId = `w29-scribing-gambling-urban-${process.pid}`
  t.after(() => deleteSession(sessionId))
  await saveSession(sessionId, { gameState: checkpoint, history: [],
    adventureId: checkpoint.adventureId, characterId: checkpoint.characterId })
  const resumed = await engine(t, { ...options, dice: '19' })
  ok(await resumed('replace_game_state', { gameState: (await loadSession(sessionId)).gameState }))
  const restored = await resumed('get_game_state')
  assert.equal(ok(await resumed('start_xge_gambling', start)).replayed, true)
  assert.equal(ok(await resumed('work_xge_gambling', work)).replayed, true)
  assert.deepEqual(ok(await resumed('check_urban_encounter', night)), { ...occurrence, replayed: true })
  assert.deepEqual(await resumed('get_game_state'), restored)
  assert.equal(ok(await resumed('roll_dice', { notation: '1d20' })).total, 19)
})

