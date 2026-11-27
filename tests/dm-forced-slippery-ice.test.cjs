const test = require('node:test'), assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { ok } = require('./helpers/mcp-toolkit.cjs')
const { setupForcedIce } = require('./helpers/forced-ice-fixture.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
test.after(() => pg.restore())

test('POST keeps a real forced ice entry incomplete after attempted prose until the agent explicitly resolves its exact contact, retaining paid SQL position', async t => {
  const f = await setupForcedIce(t), aside = { name: 'combat_action', input: f.input }
  let contactId
  const played = await play(t, f.call, [aside, params => {
    const result = ok(lastResult(params)); assert.equal(result.success, true)
    assert.ok(result.slipperyIceContactId); contactId = result.slipperyIceContactId
    return 'La cible occupe la case latérale choisie.'
  }, params => {
    const feedback = params.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : [])
    assert.ok(feedback.some(text => text.includes("La résolution mécanique n'est pas terminée") && text.includes(contactId)))
    return { name: 'resolve_slippery_ice_entry', input: { contactId } }
  }, params => {
    const ice = ok(lastResult(params)); assert.equal(ice.contactId, contactId)
    assert.equal(ice.contactResults[0].check.ability, 'dex'); assert.equal(ice.contactResults[0].check.dc, 10)
    assert.equal(ice.contactResults[0].check.success, false)
    return 'La cible a réellement glissé sur la case atteinte ; elle est à terre et ton attaque a déjà été employée.'
  }], 'Je bouscule cette cible de côté sur cette case précise, puis je résous son vrai équilibre sur la glace.')
  assert.deepEqual(played.selected, [aside, { name: 'resolve_slippery_ice_entry', input: { contactId } }])
  assert.deepEqual(played.seen, played.selected)
  const after = played.result.newGameState
  assert.deepEqual(after.monsters[f.target.id].position, f.toCell)
  assert.ok(after.monsters[f.target.id].conditions.includes('prone'))
  assert.deepEqual(after.movementUsed, played.before.movementUsed)
  assert.equal(after.hero.attackAction.used, 1); assert.equal(after.hero.attackAction.remaining, 1)
  assert.equal(after.worldTimeSeconds, played.before.worldTimeSeconds)
  assert.equal(ok(await f.call('roll_dice', { notation: '1d20' })).total, 17)
})
