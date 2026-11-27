const test = require('node:test'), assert = require('node:assert/strict')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { play } = require('./helpers/dm-scripted-turn.cjs')
const { createRechargeItem } = require('./helpers/recharge-calendar-fixture.cjs')
const { prepareItemRechargeTime } = require('./helpers/item-recharge-time-fixture.cjs')
test.after(() => pg.restore())

test('the actual POST adopts only the model-selected local instances and persists their real alternate-time recharge', async t => {
  const call = await engine(t, { dice: '2,19' })
  const selected = await createRechargeItem(call, 'wand_of_magic_missiles', 'post-selected-time-wand', { initialCharges: 1 })
  const other = await createRechargeItem(call, 'wand_of_magic_missiles', 'post-unselected-time-wand', { initialCharges: 1 })
  const f = await prepareItemRechargeTime(call, [selected], { adopt: false })
  const actions = [
    { name: 'adopt_xge_item_recharge_time', input: f.input },
    { name: 'inspect_xge_recharge_calendar', input: {} },
    { name: 'advance_time', input: { seconds: 60 } },
    { name: 'inspect_xge_recharge_calendar', input: {} },
  ]
  const { result, seen, before } = await play(t, call, [...actions,
    'L’horaire local choisi par le MJ concerne cette seule baguette. Une minute réelle passe jusqu’à la recharge.'],
  'Le MJ choisit cet autre horaire pour cette baguette précise. Je laisse passer une minute.')
  assert.deepEqual(seen, actions)
  assert.equal(result.newGameState.worldTimeSeconds, before.worldTimeSeconds + 60)
  assert.equal(result.newGameState.dmTools.magicItems[selected].charges, 4)
  assert.equal(result.newGameState.dmTools.magicItems[other].charges, 1)
  assert.deepEqual(result.newGameState.dmTools.itemRechargeCalendar.choices[f.input.eventId].input, f.input)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
