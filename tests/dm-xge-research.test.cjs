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
const { prepareResearch } = require('./helpers/xge-research-fixture.cjs')
test.after(() => pg.restore())

test('POST passes explicit Research commands and persists the actual first paid interval without inventing a result', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '19' })
  const f = await prepareResearch(call, { adopt: false, start: false })
  const commands = [
    { name: 'adopt_xge_research', input: f.adoption },
    { name: 'start_xge_research', input: f.input },
    { name: 'inspect_xge_research', input: {} },
    { name: 'work_xge_research', input: f.effort('actual-api-study', 3600, { paid: { gp: 50 } }) },
    { name: 'roll_ability_check', input: { entityId: 'player', ability: 'wis', dc: 10 } },
  ]
  const { result, seen, selected, before } = await play(t, call, [...commands, p => {
    assert.equal(lastResult(p).code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
    return 'Tu étudies une heure sur place et paies les dépenses choisies. La recherche continue.'
  }], 'Adoptons la recherche optionnelle. Je passe une heure à consulter les sources convenues.')
  assert.deepEqual(seen, selected.slice(0, -1))
  assert.equal(result.newGameState.worldTimeSeconds, before.worldTimeSeconds + 3600)
  assert.equal(result.newGameState.dmTools.wallet.gp, before.dmTools.wallet.gp - 50)
  assert.deepEqual(result.newGameState.player.inventory, before.player.inventory)
  assert.deepEqual(result.newGameState.dmTools.xgeResearch.events.map(e => e.operation), ['start', 'work'])
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
