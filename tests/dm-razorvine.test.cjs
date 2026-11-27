const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { prepareRazorvine, touch, restoreRazorvine, marker } = require('./helpers/razorvine-fixture.cjs')
test.after(() => pg.restore())

test('actual POST qualifies the measured hedge and resolves only an explicitly selected touch, with a SQL receipt', async t => {
  const call = await engine(t, { dice: '20,1,6' }), f = await prepareRazorvine(call, { publish: false })
  const input = touch(f, 'api-actual-razorvine-touch')
  const { before, result, seen, selected } = await play(t, call, [
    { name: 'record_razorvine', input: f.qualification },
    { name: 'enter_combat', input: f.approach },
    { name: 'inspect_razorvine', input: { hedgeId: f.hedgeId } },
    params => {
      assert.deepEqual(lastResult(params).contacts, [])
      return { name: 'resolve_razorvine_contact', input }
    },
    params => {
      const resolved = lastResult(params)
      assert.equal(resolved.save.success, false)
      assert.equal(resolved.damageDealt, 6)
      return { name: 'end_combat', input: {} }
    },
    'Le contact expressément constaté avec cette face a blessé le personnage.',
  ], 'Qualifie la vraie haie et son initiative, puis résous le contact constaté avec cette face.')
  assert.deepEqual(seen, selected)
  assert.deepEqual(result.newGameState.player.position, before.player.position)
  assert.equal(result.newGameState.player.hp.current, before.player.hp.current - 6)
  assert.equal(result.newGameState.actionUsed.player ?? false, false)
  const fresh = await restoreRazorvine(t, result.newGameState, '17')
  assert.equal(ok(await fresh('resolve_razorvine_contact', input)).replayed, true)
  assert.equal(await marker(fresh), 17)
})
