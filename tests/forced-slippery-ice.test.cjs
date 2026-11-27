const test = require('node:test'), assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { setupForcedIce, resolveIce } = require('./helpers/forced-ice-fixture.cjs')
const { persistShoveAside } = require('./helpers/dmg-shove-aside-fixture.cjs')
test.after(() => pg.restore())
const entries = state => Object.values(state.dmTools?.groundGear?.contacts ?? {}).filter(c => c.slipperyIceEntry)
async function unchanged(call, name, input, code) {
  const before = await call('get_game_state'), r = await call(name, input)
  assert.ok(r.error, JSON.stringify(r)); if (code) assert.equal(r.code, code, JSON.stringify(r))
  assert.deepEqual(await call('get_game_state'), before)
  return r
}
async function next(call) {
  const state = await call('get_game_state')
  return ok(await call('next_turn', { actorId: state.currentTurn, skipAction: true, reason: 'Cet acteur tient explicitement son action réelle ; aucun tour inventé.' }))
}

test('two actual Extra Attack side entries of the same body check ice once on the current turn, then a real new turn and generation each check again', async t => {
  const f = await setupForcedIce(t, { bothCells: true, persistentTarget: true,
    dice: '20,1,20,19,1,19,20,19,1,20,19,1,19,20,1,20,19,1,19,17' })
  const before = await f.call('get_game_state'), first = ok(await f.call('combat_action', f.input))
  assert.equal(first.success, true); assert.ok(first.slipperyIceContactId)
  let state = await f.call('get_game_state'), contact = entries(state)[0]
  assert.equal(contact.kind, 'forced'); assert.equal(contact.status, 'waiting'); assert.equal(contact.continuation, undefined)
  assert.equal(contact.stepWitness.shoveAsideId, first.shoveAsideId)
  assert.equal(contact.slipperyIceEntry.shoveAside.resultWitness, state.dmTools.shoveAside.attempts[first.shoveAsideId].resultWitness)
  assert.deepEqual(state.monsters[f.target.id].position, f.toCell); assert.deepEqual(state.movementUsed, before.movementUsed)
  assert.equal(state.hero.attackAction.remaining, 1)
  const receipt = ok(await resolveIce(f.call, first.slipperyIceContactId))
  assert.equal(receipt.contactResults[0].check.success, true); assert.equal(receipt.contactResults[0].check.dc, 10)
  const second = ok(await f.call('combat_action', { ...f.input, toCell: f.targetCell }))
  assert.equal(second.success, true); assert.equal(second.slipperyIceContactId, undefined)
  state = await f.call('get_game_state'); assert.deepEqual(state.monsters[f.target.id].position, f.targetCell)
  assert.equal(state.hero.attackAction.used, 2); assert.equal(state.hero.attackAction.remaining, 0)
  assert.deepEqual(state.movementUsed, before.movementUsed); assert.equal(entries(state).length, 1)
  await next(f.call); await next(f.call)
  const third = ok(await f.call('combat_action', f.input)); assert.ok(third.slipperyIceContactId)
  ok(await resolveIce(f.call, third.slipperyIceContactId))
  const generation = (await f.call('get_game_state')).combatGeneration
  ok(await f.call('end_combat', { force: true, reason: 'Les deux protagonistes cessent réellement cette rencontre.' }))
  ok(await f.enter())
  assert.ok((await f.call('get_game_state')).combatGeneration > generation)
  const fourth = ok(await f.call('combat_action', { ...f.input, toCell: f.targetCell }))
  assert.ok(fourth.slipperyIceContactId); ok(await resolveIce(f.call, fourth.slipperyIceContactId))
  state = await f.call('get_game_state'); assert.equal(entries(state).length, 3)
  assert.equal(new Set(entries(state).map(c => c.turnKey)).size, 3)
  const fresh = await persistShoveAside(t, f.call)
  assert.equal(ok(await resolveIce(fresh, first.slipperyIceContactId)).replayed, true)
  assert.deepEqual(await fresh('get_game_state'), state)
  assert.equal(ok(await f.call('roll_dice', { notation: '1d20' })).total, 17)
})

test('failed and tied source contests on a genuine icy destination retain the original attack cost with no entry, check or repeated source die', async t => {
  for (const [dice, tie] of [['20,1,20,1,20,17', false], ['20,1,4,4,11,17', true]]) {
    const f = await setupForcedIce(t, { dice }), before = await f.call('get_game_state')
    const result = ok(await f.call('combat_action', f.input)); assert.equal(result.success, false)
    if (tie) assert.equal(result.check.roll.total, result.opposition.roll.total)
    const state = await f.call('get_game_state'); assert.deepEqual(state.monsters[f.target.id].position, f.targetCell)
    assert.deepEqual(state.movementUsed, before.movementUsed); assert.equal(state.hero.attackAction.remaining, 1)
    assert.equal(result.slipperyIceContactId, undefined); assert.equal(entries(state).length, 0)
    assert.equal(ok(await f.call('roll_dice', { notation: '1d20' })).total, 17)
  }
})

test('real Bardic contest then ice windows survive distinct SQL continuations with the original paid step, source provenance and exact held check', async t => {
  const f = await setupForcedIce(t, { characterId: 'bard', dice: '20,1,20,19,1,1,17',
    beforeCombat: f => f.call('use_subclass_feature', { featureId: 'bardic_inspiration', targetId: f.target.id }).then(ok) })
  const contest = ok(await f.call('combat_action', f.input)).pendingReaction; assert.ok(contest)
  let fresh = await persistShoveAside(t, f.call, '1,17')
  const made = ok(await fresh('resolve_reaction', { pendingId: contest.id, choice: 'decline' }))
  assert.equal(made.success, true); assert.ok(made.slipperyIceContactId)
  const paid = await fresh('get_game_state'), source = structuredClone(paid.dmTools.shoveAside.attempts[made.shoveAsideId])
  assert.deepEqual(paid.monsters[f.target.id].position, f.toCell); assert.equal(paid.hero.actionCredits, 0)
  const held = ok(await resolveIce(fresh, made.slipperyIceContactId)).pendingReaction
  assert.ok(held?.options.includes('bardic_inspiration')); assert.deepEqual(held.roll.rolls, [1])
  const pending = await fresh('get_game_state'); fresh = await persistShoveAside(t, fresh, '8,17')
  for (const change of [s => s.hero.pending.roll.total++, s => entries(s)[0].stepWitness.fromCell.x++,
    s => { s.currentTurn = f.target.id },
    s => entries(s)[0].slipperyIceEntry.shoveAside.attemptId += '-fake',
    s => { const c = entries(s)[0]; c.kind = 'walk'; c.stepWitness.slipperyIceWalk = true; delete c.stepWitness.slipperyIceShoveAside; delete c.stepWitness.shoveAsideId; delete c.slipperyIceEntry.shoveAside }]) {
    const clone = structuredClone(pending); change(clone)
    await unchanged(fresh, 'replace_game_state', { gameState: clone })
  }
  const repeated = ok(await resolveIce(fresh, made.slipperyIceContactId)); assert.equal(repeated.alreadyPending, true)
  assert.deepEqual(repeated.pendingReaction, held)
  const done = ok(await fresh('resolve_reaction', { pendingId: held.id, choice: 'bardic_inspiration' }))
  assert.deepEqual(done.contactResults[0].check.roll.rolls, [1]); assert.equal(done.contactResults[0].check.roll.total, 10)
  assert.equal(done.contactResults[0].check.success, true)
  const state = await fresh('get_game_state'); assert.deepEqual(state.dmTools.shoveAside.attempts[made.shoveAsideId], source)
  assert.deepEqual(state.monsters[f.target.id].position, f.toCell); assert.deepEqual(state.movementUsed, paid.movementUsed)
  assert.equal(state.hero.actionCredits, 0); assert.equal(state.hero.inspiration.length, 0)
  const replay = ok(await resolveIce(fresh, made.slipperyIceContactId)); assert.equal(replay.replayed, true)
  assert.deepEqual(await fresh('get_game_state'), state)
  assert.equal(ok(await fresh('roll_dice', { notation: '1d20' })).total, 17)
})

test('ordinary forced push still refuses ice and an actual caltrops-plus-ice destination refuses Aside before either contest die or cost', async t => {
  const push = await setupForcedIce(t, { includePush: true, dice: '20,1,17' })
  await unchanged(push.call, 'combat_action', { ...push.input, shove: 'push', toCell: push.pushCell }, 'SLIPPERY_ICE_ENTRY_UNREPRESENTED')
  assert.equal(ok(await push.call('roll_dice', { notation: '1d20' })).total, 17)
  const mixed = await setupForcedIce(t, { caltrops: true, dice: '20,1,17' })
  await unchanged(mixed.call, 'combat_action', mixed.input, 'SLIPPERY_ICE_SIMULTANEOUS_CONTACT_UNREPRESENTED')
  assert.equal((await mixed.call('get_game_state')).dmTools.shoveAside, undefined)
  assert.equal(ok(await mixed.call('roll_dice', { notation: '1d20' })).total, 17)
})
