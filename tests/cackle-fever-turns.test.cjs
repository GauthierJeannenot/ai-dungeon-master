const test = require('node:test'), assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { ok } = require('./helpers/mcp-toolkit.cjs')
const { setupCackle, persistCackle, cackleRefused } = require('./helpers/cackle-fever-fixture.cjs')
const { cackleCarrierImmune } = require('../mcp-server/dist/lib/cackle-fever-state.js')
test.after(() => pg.restore())

const get = call => call('get_game_state')
const decline = afflictionId => ({ afflictionId, endTurn: true, attemptSave: false })
const attempt = afflictionId => ({ afflictionId, endTurn: true, attemptSave: true })
async function skip(call, actorId) {
  return ok(await call('next_turn', { actorId, skipAction: true,
    reason: 'Le participant termine explicitement son vrai tour sans action supplémentaire.' }))
}

test('a real crisis turn may decline without dice, then failed and successful optional repeats keep their captured DC through SQL', async t => {
  const f = await setupCackle(t)
  let call = f.call
  await skip(call, 'player')
  const before = await get(call), crisis = before.dmTools.afflictions.records[f.seed.affliction.id].cackleFever.crisis
  assert.equal(before.currentTurn, f.npcId)
  const declined = ok(await call('resolve_cackle_fever_turn', decline(f.seed.affliction.id)))
  assert.equal(declined.saveDeclined, true); assert.equal(declined.diceRolled, false)
  const after = await get(call)
  assert.equal(after.actionUsed[f.npcId], true)
  assert.equal(after.worldTimeSeconds, before.worldTimeSeconds)
  assert.ok(after.monsters[f.npcId].conditions.includes('incapacitated'))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19, 'declining rolls no optional CON die')
  call = await persistCackle(t, call, '1,20,17')
  const restored = await get(call)
  assert.equal(ok(await call('resolve_cackle_fever_turn', decline(f.seed.affliction.id))).replayed, true)
  assert.deepEqual(await get(call), restored)
  await cackleRefused(call, 'resolve_cackle_fever_turn', attempt(f.seed.affliction.id), 'CACKLE_EVENT_ARGUMENT_CONFLICT')
  await skip(call, f.npcId); await skip(call, 'player')
  const failed = ok(await call('resolve_cackle_fever_turn', attempt(f.seed.affliction.id)))
  assert.equal(failed.save.success, false); assert.equal(failed.save.dc, crisis.dc)
  assert.deepEqual(failed.save.roll.rolls, [1])
  assert.ok((await get(call)).monsters[f.npcId].conditions.includes('incapacitated'))
  call = await persistCackle(t, call, '20,17')
  const failedState = await get(call)
  const replay = ok(await call('resolve_cackle_fever_turn', attempt(f.seed.affliction.id)))
  assert.equal(replay.replayed, true); assert.deepEqual(replay.save, failed.save)
  assert.deepEqual(await get(call), failedState)
  await skip(call, f.npcId); await skip(call, 'player')
  const ended = ok(await call('resolve_cackle_fever_turn', attempt(f.seed.affliction.id)))
  assert.equal(ended.save.success, true); assert.equal(ended.save.dc, crisis.dc)
  assert.deepEqual(ended.save.roll.rolls, [20]); assert.equal(ended.crisisEnded, true)
  const final = await get(call)
  assert.ok(!final.monsters[f.npcId].conditions.includes('incapacitated'))
  assert.equal(final.actionUsed[f.npcId], true)
  assert.equal(final.dmTools.afflictions.records[f.seed.affliction.id].status, 'active', 'ending laughter does not cure the disease')
  assert.equal(final.dmTools.exhaustion.creatures[f.npcId].level, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('ten real committed round ticks expire a one-minute crisis while declined optional saves spend no dice or invented turn time', async t => {
  const f = await setupCackle(t), call = f.call
  const initial = await get(call), crisis = initial.dmTools.afflictions.records[f.seed.affliction.id].cackleFever.crisis
  await skip(call, 'player')
  let last, rounds = 0
  while ((await get(call)).worldTimeSeconds < crisis.endsAt) {
    assert.equal((await get(call)).currentTurn, f.npcId)
    last = ok(await call('resolve_cackle_fever_turn', decline(f.seed.affliction.id)))
    assert.equal(last.diceRolled, false)
    await skip(call, f.npcId); rounds++
    if ((await get(call)).worldTimeSeconds < crisis.endsAt) await skip(call, 'player')
    assert.ok(rounds <= 10, 'the actual source crisis lasts only60seconds')
  }
  const final = await get(call)
  assert.equal(rounds, 10)
  assert.equal(final.worldTimeSeconds, crisis.endsAt)
  assert.equal(final.worldTimeSeconds - initial.worldTimeSeconds, 60)
  assert.ok(!final.monsters[f.npcId].conditions.includes('incapacitated'))
  const fresh = await persistCackle(t, call, '19'), saved = await get(fresh)
  assert.equal(ok(await fresh('resolve_cackle_fever_event', {
    eventId: last.eventId, endTurn: true, attemptSave: false,
  })).replayed, true)
  assert.deepEqual(await get(fresh), saved)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  assert.equal(ok(await fresh('roll_dice', { notation: '1d20' })).total, 19)
})

test('only an actual successful contagion CON save grants the source carrier24hours; a real gnome event grants no timed immunity', async t => {
  const f = await setupCackle(t, { dice: '1,1,2,20,1,1,20,20,19' }), call = f.call
  assert.equal(f.infection.save.success, true)
  assert.equal(f.infection.immuneUntil, f.exposure.at + 86400)
  assert.equal(cackleCarrierImmune(await get(call), 'player', f.npcId), true)
  await skip(call, 'player')
  ok(await call('resolve_cackle_fever_turn', decline(f.seed.affliction.id)))
  await skip(call, f.npcId)
  const next = await get(call)
  assert.equal(next.currentTurn, 'player')
  assert.equal(Object.values(next.dmTools.cackleFever.events).filter(event => event.kind === 'contagion' && event.targetId === 'player').length, 1,
    'the next genuine player turn inside ten feet does not repeat the saved carrier exposure')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  ok(await call('end_combat', { force: true, reason: 'Le MJ établit la vraie fin de la confrontation avant la période mesurée hors combat.' }))
  let fresh = await persistCackle(t, call, '1,2,20,1,1,20,20,17')
  const before = await get(fresh)
  ok(await fresh('advance_time', { seconds: f.infection.immuneUntil - before.worldTimeSeconds }))
  const expired = await get(fresh)
  assert.equal(expired.worldTimeSeconds, f.infection.immuneUntil)
  assert.equal(cackleCarrierImmune(expired, 'player', f.npcId), false)
  const carrier = expired.npcs[f.npcId] ?? expired.monsters[f.npcId]
  const fact = ok(await fresh('record_scene_fact', { cell: carrier.position,
    description: 'Après les vingt-quatre heures réellement écoulées, un nouveau grand stress extérieur atteint ce porteur toujours infecté.' })).worldFact
  const stress = ok(await fresh('record_cackle_fever_stress', { eventId: 'new-carrier-stress-after-24h', creatureId: f.npcId,
    factId: fact.id, actualGreatStressConfirmed: true, reason: 'Nouvel événement extérieur réel, distinct de la précédente crise.' }))
  ok(await fresh('resolve_cackle_fever_event', { eventId: stress.event.id }))
  ok(await fresh('enter_combat', { combatants: ['player', f.npcId] }))
  const events = ok(await fresh('inspect_cackle_fever')).events
  const exposure = Object.values(events).find(event => event.kind === 'contagion' && event.targetId === 'player' && !event.result)
  assert.ok(exposure, 'a new real start of turn at the exact24h boundary requires a new contagion save')
  assert.equal(ok(await fresh('resolve_cackle_fever_event', { eventId: exposure.id })).save.success, true)
  for (const event of Object.values(ok(await fresh('inspect_cackle_fever')).events).filter(event => event.kind === 'stress' && !event.result))
    ok(await fresh('resolve_cackle_fever_event', { eventId: event.id }))
  assert.equal(ok(await fresh('roll_dice', { notation: '1d20' })).total, 17)

  const gnome = await setupCackle(t, { gnome: true, dice: '1,1,2,20,1,1,20,19' })
  assert.equal(gnome.infection.immune, 'gnome'); assert.equal(gnome.infection.diceRolled, false)
  assert.equal(gnome.infection.immuneUntil, undefined)
  const gnomeState = await get(gnome.call)
  assert.equal(cackleCarrierImmune(gnomeState, 'player', gnome.npcId), false)
  assert.ok(!Object.values(gnomeState.dmTools.afflictions.records).some(record => record.targetId === 'player'))
  assert.equal(ok(await gnome.call('roll_dice', { notation: '1d20' })).total, 19)
})
