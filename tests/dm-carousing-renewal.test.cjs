const assert = require('node:assert/strict'), test = require('node:test')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { engine, ok, adjacent } = require('./helpers/mcp-toolkit.cjs')
const { refused } = require('./helpers/xge-training-fixture.cjs')
const { prepareNamedAlly, prepareNextNamedWeek, completeCarousingWeek, prepareRenewalInput } = require('./helpers/xge-carousing-renewal-fixture.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
test.after(() => pg.restore())

test('a real renewal POST forwards the exact chosen old/new identities with no time, fee or attitude effect, while actual combat never offers the new exploration tool', async t => {
  const call = await engine(t, { dice: '11,99,11,99,20,1,19' }), old = await prepareNamedAlly(call)
  const next = await prepareNextNamedWeek(call, old); ok(await call('start_xge_carousing', next.startInput))
  const completed = await completeCarousingWeek(call, next), gain = completed.week.resolution.outcome.contactIds[0]
  const input = await prepareRenewalInput(call, old, gain), before = await call('get_game_state')
  const chosen = { name: 'renew_xge_carousing_contact', input }
  const played = await play(t, call, [chosen, params => {
    const result = ok(lastResult(params))
    assert.equal(result.seconds, 0); assert.equal(result.paidCp, 0); assert.equal(result.grantedBenefit, false)
    return 'Le nouveau gain est lié à une seule promesse ; les anciennes aides restent dans l’historique.'
  }], 'Je consacre ce nouveau gain à renouer avec cette personne déjà rencontrée.')
  assert.deepEqual(played.selected, [chosen]); assert.deepEqual(played.seen, [chosen])
  const after = played.result.newGameState
  for (const key of ['player', 'npcs', 'monsters', 'worldFacts', 'worldTimeSeconds']) assert.deepEqual(after[key], before[key])
  assert.deepEqual(after.dmTools.wallet, before.dmTools.wallet)
  assert.equal(after.dmTools.xgeCarousing.renewals.length, 1)
  assert.deepEqual(after.dmTools.xgeCarousing.consumptions, before.dmTools.xgeCarousing.consumptions)
  assert.equal(ok(await call('renew_xge_carousing_contact', input)).replayed, true)

  const s = await call('get_game_state'), cell = adjacent(s).find(c => ![...Object.values(s.npcs ?? {}), ...Object.values(s.monsters)]
    .some(a => a.position.x === c.x && a.position.y === c.y))
  assert.ok(cell)
  const foe = ok(await call('spawn_monster', { monsterType: 'goblin', cell }))
  ok(await call('enter_combat', { combatants: ['player', foe.id] }))
  const combat = await call('get_game_state'); assert.equal(combat.phase, 'combat')
  await refused(call, 'renew_xge_carousing_contact', { ...input, eventId: 'not-in-initiative' }, 'XGE_CAROUSING_DOWNTIME_REQUIRED')
  const observed = await play(t, call, [params => {
    assert.ok(!params.tools.some(tool => tool.name === chosen.name))
    return 'Le personnage observe les choix de son vrai tour de combat.'
  }], 'Quels choix sont proposés pendant ce combat ?')
  assert.deepEqual(observed.selected, []); assert.deepEqual(observed.seen, [])
  assert.deepEqual(observed.result.newGameState.dmTools.xgeCarousing, combat.dmTools.xgeCarousing)
  assert.deepEqual(observed.result.newGameState.dmTools.wallet, combat.dmTools.wallet)
  assert.equal(observed.result.newGameState.worldTimeSeconds, combat.worldTimeSeconds)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19, 'Renewal, replay and refusals consumed no die.')
})
