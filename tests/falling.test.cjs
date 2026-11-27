const test = require('node:test')
const assert = require('node:assert/strict')
const { engine, ok, replace, spawn, battle } = require('./helpers/mcp-toolkit.cjs')
const fall = (call, eventId, distanceFeet, entityId = 'player') => call('resolve_fall', {
  eventId, entityId, distanceFeet, reason: 'Le MJ établit cette chute terminée et sa distance réelle.' })

test('falls shorter than ten feet have no damage die, prone, time, movement or action cost', async t => {
  const call = await engine(t, { dice: '19' }), before = await call('get_game_state')
  const result = ok(await fall(call, 'short', 9.9)), after = await call('get_game_state')
  assert.equal(result.diceCount, 0); assert.equal(result.landedProne, false)
  for (const key of ['player', 'hero', 'worldTimeSeconds', 'actionUsed', 'movementUsed']) assert.deepEqual(after[key], before[key])
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('full ten-foot increments deal real bludgeoning damage and knock the landing creature prone', async t => {
  const call = await engine(t, { dice: '2,5,19' }), before = await call('get_game_state')
  const result = ok(await fall(call, 'twenty-seven', 27))
  assert.equal(result.diceCount, 2); assert.equal(result.roll.total, 7)
  assert.equal(result.damageResolution.damageType, 'bludgeoning')
  assert.equal(result.damageResolution.hpAfter, before.player.hp.current - 7)
  assert.equal(result.proneApplied, true)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a fall exceeding two hundred feet is capped at twenty damage dice', async t => {
  const call = await engine(t, { dice: [...Array(20).fill(1), 19].join(',') })
  const result = ok(await fall(call, 'cap', 1000))
  assert.equal(result.diceCount, 20); assert.equal(result.roll.total, 20)
  assert.equal(result.roll.rolls.length, 20)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('exact persisted fall receipts never repeat damage and conflicting replay refuses before dice or mutation', async t => {
  const call = await engine(t, { dice: '5,19' })
  const first = ok(await fall(call, 'receipt', 10))
  const before = await call('get_game_state')
  ok(await call('replace_game_state', { gameState: before }))
  assert.deepEqual(ok(await fall(call, 'receipt', 10)), { ...first, alreadyApplied: true })
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal((await fall(call, 'receipt', 20)).code, 'FALL_EVENT_CONFLICT')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('temporary HP absorb a real fall but do not prevent the damage-based prone landing', async t => {
  const call = await engine(t, { dice: '6' })
  ok(await call('grant_temporary_hp', { eventId: 'buffer', targetId: 'player', sourceId: 'established-buffer',
    sourceDescription: 'Source temporaire établie.', amount: 10, duration: { kind: 'until_long_rest' } }))
  const before = await call('get_game_state'), result = ok(await fall(call, 'buffered', 10))
  assert.equal(result.damageResolution.hpLost, 0)
  assert.equal(result.damageResolution.temporaryHp.absorbed, 6)
  assert.equal(result.proneApplied, true)
  assert.equal((await call('get_game_state')).player.hp.current, before.player.hp.current)
})

test('resistance rounds a one-point fall to zero, preventing a new prone condition', async t => {
  const call = await engine(t, { dice: '1,19' })
  ok(await call('apply_condition', { entityId: 'player', condition: 'petrified' }))
  const result = ok(await fall(call, 'resisted', 10))
  assert.equal(result.damageResolution.damageDealt, 0)
  assert.equal(result.proneApplied, false)
  assert.equal(result.landedProne, false)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('source prone immunity is respected without suppressing genuine fall damage', async t => {
  const call = await engine(t, { dice: '6,19' }), target = await spawn(call, 'will_o_wisp')
  const result = ok(await fall(call, 'immune-prone', 10, target.id))
  assert.equal(result.damageResolution.damageDealt, 6, 'resistance to weapon attacks does not resist a fall')
  assert.equal(result.proneApplied, false); assert.equal(result.landedProne, false)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('an environmental fall can strike a different combat actor without spending either action', async t => {
  const call = await engine(t, { dice: '3' }), target = await spawn(call)
  await battle(call, [target.id])
  const before = await call('get_game_state')
  ok(await fall(call, 'environmental', 10, target.id))
  const after = await call('get_game_state')
  for (const key of ['currentTurn', 'hero', 'actionUsed', 'bonusActionUsed', 'movementUsed', 'worldTimeSeconds']) assert.deepEqual(after[key], before[key])
  assert.deepEqual(after.monsters[target.id].position, before.monsters[target.id].position)
})

test('real falling damage at zero applies a death-save failure, never a critical or nonlethal choice', async t => {
  const call = await engine(t, { dice: '4' }), target = await spawn(call)
  ok(await call('configure_npc_death_saves', { entityId: target.id, eventId: 'important', reason: 'PNJ important choisi avant la blessure.' }))
  await replace(call, state => { state.monsters[target.id].hp.current = 1 })
  ok(await call('update_hp', { entityId: target.id, delta: -1, reason: 'Blessure établie.' }))
  ok(await fall(call, 'body', 10, target.id))
  const body = (await call('get_game_state')).monsters[target.id]
  assert.equal(body.npcLife.episode.status, 'dying')
  assert.equal(body.npcLife.episode.failures, 1); assert.equal(body.isAlive, true)
})

test('unknown targets and a pending reaction refuse without consuming damage dice', async t => {
  const call = await engine(t, { dice: '19' }), before = await call('get_game_state')
  assert.equal((await fall(call, 'absent', 10, 'absent')).code, 'ENTITY_NOT_FOUND')
  assert.deepEqual(await call('get_game_state'), before)
  await replace(call, state => { state.hero.pending = { id: 'real-window', kind: 'attack', sourceId: 'player', options: ['decline'], command: {} } })
  const pending = await call('get_game_state')
  assert.equal((await fall(call, 'pending', 10)).code, 'REACTION_PENDING')
  assert.deepEqual(await call('get_game_state'), pending)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
