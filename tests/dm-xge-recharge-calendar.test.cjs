const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, {
  LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
})
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { prepareRechargeCalendar, expendPearl } = require('./helpers/recharge-calendar-fixture.cjs')
test.after(() => pg.restore())

test('the actual POST adopts the selected reference and real time recharges one physically spent pearl', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '19' })
  const id = await expendPearl(call)
  const f = await prepareRechargeCalendar(call, { firstAfterSeconds: 60, adopt: false })
  const actions = [
    { name: 'adopt_xge_recharge_calendar', input: f.input },
    { name: 'inspect_xge_recharge_calendar', input: {} },
    { name: 'advance_time', input: { seconds: 60 } },
    { name: 'inspect_xge_recharge_calendar', input: {} },
  ]
  const { result, seen, before } = await play(t, call, [...actions, params => {
    assert.equal(lastResult(params).nextAt, (lastResult(params).firstAt + 86400))
    return 'Une minute passe dans ce lieu et la perle retrouve son utilisation.'
  }], 'Le MJ adopte l’heure de recharge convenue. Je laisse passer une minute.')
  assert.deepEqual(seen, actions)
  assert.equal(before.dmTools.magicItems[id].charges, 0)
  assert.equal(result.newGameState.dmTools.magicItems[id].charges, 1)
  assert.equal(result.newGameState.worldTimeSeconds, before.worldTimeSeconds + 60)
  assert.deepEqual(result.newGameState.player.spellSlots, before.player.spellSlots)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
