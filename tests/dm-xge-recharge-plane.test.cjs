const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { play } = require('./helpers/dm-scripted-turn.cjs')
const { prepareRechargeCalendar, createRechargeItem } = require('./helpers/recharge-calendar-fixture.cjs')
const { approachManorStairs, prepareRechargePlaneMap } = require('./helpers/recharge-plane-fixture.cjs')
test.after(() => pg.restore())

test('the real POST persists an explicitly selected same-plane binding then real time recharges carried and ground items', async t => {
  const call = await engine(t, { dice: '2,3,19' })
  await approachManorStairs(call)
  const ground = await createRechargeItem(call, 'wand_of_magic_missiles', 'post-origin-wand', { initialCharges: 1, pickup: false })
  const carried = await createRechargeItem(call, 'wand_of_magic_missiles', 'post-bound-wand', { initialCharges: 1 })
  await prepareRechargeCalendar(call, { firstAfterSeconds: 60 })
  ok(await call('travel_to_map', { transitionId: 'descend_manor' }))
  const f = await prepareRechargePlaneMap(call)
  const actions = [
    { name: 'bind_xge_recharge_plane_map', input: f.input },
    { name: 'inspect_xge_recharge_calendar', input: {} },
    { name: 'advance_time', input: { seconds: 60 } },
    { name: 'inspect_xge_recharge_calendar', input: {} },
  ]
  const { result, seen, before } = await play(t, call, [...actions,
    'Le MJ qualifie les deux cartes du même plan sans aube. Une minute réelle passe jusqu’au cycle de recharge.'],
  'Le MJ confirme ce même plan sans aube et son cycle. Je laisse passer une minute.')
  assert.deepEqual(seen, actions)
  assert.equal(result.newGameState.worldTimeSeconds, before.worldTimeSeconds + 60)
  assert.equal(result.newGameState.dmTools.rechargeCalendar.planeMaps.cellar.input.planeId, f.input.planeId)
  assert.equal(result.newGameState.dmTools.magicItems[ground].charges, 4)
  assert.equal(result.newGameState.dmTools.magicItems[carried].charges, 5)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
