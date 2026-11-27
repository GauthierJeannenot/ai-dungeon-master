const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { prepareIce, resolve, restoreIce, rollMarker } = require('./helpers/slippery-ice-fixture.cjs')
test.after(() => pg.restore())

test('actual POST can qualify real ice, enter its explicit initiative, move and resolve without a synthesized call', async t => {
  const call = await engine(t, { dice: '20,1' }), f = await prepareIce(call, { publish: false })
  let contactId
  const { seen, selected, result } = await play(t, call, [
    { name: 'record_slippery_ice', input: f.qualification },
    { name: 'enter_combat', input: f.approach },
    { name: 'move_token', input: { tokenId: 'player', toCell: f.two } },
    params => {
      const partial = lastResult(params)
      assert.equal(partial.costCells, 2)
      assert.deepEqual(partial.finalPosition, f.one)
      contactId = partial.slipperyIceContactId
      assert.ok(contactId)
      return { name: 'inspect_slippery_ice', input: {} }
    },
    'Le pas est payé, mais une entrée non résolue ne peut pas encore être certifiée.',
    params => {
      assert.equal(lastResult(params).pendingEntries[0].id, contactId)
      assert.ok(params.messages.some(message => typeof message.content === 'string'
        && message.content.includes('pendingSlipperyIceContactId') && message.content.includes(contactId)))
      return { name: 'resolve_slippery_ice_entry', input: { contactId } }
    },
    params => {
      assert.equal(lastResult(params).groundGearContact.contactResults[0].check.success, false)
      return { name: 'end_combat', input: {} }
    },
    'Le premier pas a été payé. Le personnage a glissé et reste à terre sur la case atteinte.',
  ], 'Je choisis la vraie plaque mesurée, son initiative puis ce déplacement. Résous le test indiqué.')
  assert.deepEqual(seen, selected)
  assert.deepEqual(result.newGameState.player.position, f.one)
  assert.ok(result.newGameState.player.conditions.includes('prone'))
  assert.equal(result.newGameState.actionUsed.player ?? false, false)
  const fresh = await restoreIce(t, result.newGameState, '17')
  assert.equal(ok(await resolve(fresh, contactId)).replayed, true)
  assert.equal(await rollMarker(fresh), 17)
})
