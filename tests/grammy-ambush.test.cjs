const test = require('node:test')
const assert = require('node:assert/strict')
const { engine, ok, replace } = require('./helpers/mcp-toolkit.cjs')
const { buildPlayerState } = require('../mcp-server/dist/lib/character-registry.js')
const { initialHeroState } = require('../mcp-server/dist/lib/hero-state.js')

const encounterId = 'grammy_apartment_guards'
const ambush = (suspicious, doorId = 'floor-apartment') => ({ doorId, attackerIndex: 0, weaponOrSpell: 'Scimitar', suspicious })

async function prepare(t, { dice = '', sourceRoomId = '8' } = {}) {
  const call = await engine(t, { adventureId: 'grammys-country-apple-pie', dice })
  const doorId = sourceRoomId === '8' ? 'floor-apartment' : 'entry-apartment'
  await replace(call, state => {
    state.player.position = sourceRoomId === '8' ? { x: 8, y: 7 } : { x: 10, y: 10 }
    state.currentRoomId = sourceRoomId; state.roomsVisited = [sourceRoomId]; state.playerActionRevision = 1
  })
  const moves = sourceRoomId === '8'
    ? [{ monsterIndex: 0, toCell: { x: 9, y: 8 } }, { monsterIndex: 1, toCell: { x: 9, y: 9 } }, { monsterIndex: 2, toCell: { x: 7, y: 9 } }]
    : [{ monsterIndex: 0, toCell: { x: 8, y: 10 } }, { monsterIndex: 1, toCell: { x: 9, y: 11 } }]
  ok(await call('react_to_noise', { encounterId, sourceRoomId, response: 'ambush', doorId, moves, reason: 'Un choc violent effectivement résolu est entendu derrière cette porte.' }))
  return { call, doorId }
}

async function cross(call, doorId) {
  ok(await call('interact_door', { doorId, action: 'open' }))
  const movement = ok(await call('move_token', { tokenId: 'player', doorId, doorMode: 'cross', acknowledgeEventIds: ['apartment-guards'] }))
  assert.equal(movement.stopReason, 'encounter_ambush')
  assert.equal(movement.crossed, true)
  return movement
}

test('Grukk and guards hold their room through repeated noise and cannot investigate or join outside combat', async t => {
  const { call } = await prepare(t)
  let state = await call('get_game_state')
  const saved = structuredClone(state.sceneMemory.encounterAwareness[encounterId])
  assert.equal(saved.status, 'ambushing'); assert.equal(state.phase, 'exploration')
  assert.deepEqual(state.encountersTriggered, []); assert.equal(Object.keys(state.monsters).length, 0)
  await replace(call, state => { state.playerActionRevision++ })
  for (const response of ['investigate', 'join_combat']) {
    const denied = await call('react_to_noise', { encounterId, sourceRoomId: '8', response, reason: 'Le combat continue.',
      ...(response === 'investigate' ? { moves: [{ monsterIndex: 0, roomId: '8' }] } : {}) })
    assert.equal(denied.code, 'ENCOUNTER_HOLDS_ROOM')
  }
  state = await call('get_game_state')
  assert.deepEqual(state.sceneMemory.encounterAwareness[encounterId], saved)
  assert.equal((await call('react_to_noise', { encounterId, sourceRoomId: '8', response: 'alert', reason: 'Encore du bruit.' })).code, 'ENCOUNTER_ALREADY_INVESTIGATING')
})

test('ambush requires the source-facing door, explicit inside moves and a free threshold; refusal is atomic', async t => {
  const { call } = await prepare(t)
  await replace(call, state => { state.playerActionRevision++ })
  const state = await call('get_game_state')
  for (const input of [
    { doorId: 'entry-apartment', moves: [{ monsterIndex: 0, toCell: { x: 8, y: 10 } }] },
    { doorId: 'floor-apartment', moves: [{ monsterIndex: 0, toCell: { x: 8, y: 8 } }] },
    { doorId: 'floor-apartment', moves: [{ monsterIndex: 0, roomId: '8' }] },
  ]) {
    const refused = await call('react_to_noise', { encounterId, sourceRoomId: '8', response: 'ambush', reason: 'Nouveau bruit résolu.', ...input })
    assert.ok(refused.error, JSON.stringify(refused))
    assert.deepEqual(await call('get_game_state'), state)
  }
})

test('opening the door causes no damage; actual entry stops at the threshold and requires explicit ambush choices', async t => {
  const { call, doorId } = await prepare(t)
  const before = await call('get_game_state')
  ok(await call('interact_door', { doorId, action: 'open' }))
  assert.equal((await call('get_game_state')).player.hp.current, before.player.hp.current)
  assert.equal((await call('start_encounter', { encounterId, ambush: ambush(false) })).code, 'AMBUSH_THRESHOLD_REQUIRED')
  await cross(call, doorId)
  const state = await call('get_game_state')
  assert.deepEqual(state.player.position, { x: 8, y: 8 })
  assert.equal((await call('move_token', { tokenId: 'player', toCell: { x: 8, y: 9 } })).code, 'AMBUSH_RESOLUTION_REQUIRED')
  assert.equal((await call('start_encounter', { encounterId })).code, 'AMBUSH_RESOLUTION_REQUIRED')
  assert.equal((await call('start_encounter', { encounterId, ambush: { ...ambush(false), attackerIndex: 9 } })).code, 'MONSTER_SELECTION_REQUIRED')
  assert.equal((await call('start_encounter', { encounterId, ambush: { ...ambush(false), weaponOrSpell: 'Shortbow' } })).code, 'AMBUSH_ATTACK_UNAVAILABLE')
  assert.deepEqual(await call('get_game_state'), state)
})

test('unsuspecting entry receives one attack against AC, with no Perception or saving throw and no replay', async t => {
  const { call, doorId } = await prepare(t, { dice: '10,10,10,19,3' })
  await cross(call, doorId)
  const before = await call('get_game_state')
  const result = ok(await call('start_encounter', { encounterId, ambush: ambush(false) }))
  assert.equal(result.perception, undefined); assert.equal(result.save, undefined)
  assert.equal(result.opportunityAttack.hit, true)
  assert.equal(result.opportunityAttack.damageDealt, 5)
  const after = await call('get_game_state')
  assert.equal(after.player.hp.current, before.player.hp.current - 5)
  assert.equal(after.currentTurn, result.spawnedMonsters[0].id); assert.equal(after.phase, 'combat')
  assert.ok(after.monsters[after.currentTurn].initiative > after.player.initiative, 'the actual group roll outranks this player; no forced first turn')
  assert.equal(after.combatLog.filter(entry => entry.turn === result.attackerId && /attaque/.test(entry.action)).length, 1)
  assert.equal((await call('start_encounter', { encounterId, ambush: ambush(false) })).code, 'ENCOUNTER_ALREADY_RESOLVED')
  assert.deepEqual(await call('get_game_state'), after)
})

test('suspicious entry: successful Perception and DEX save avoid all damage', async t => {
  const { call, doorId } = await prepare(t, { dice: '10,10,10,20,20' })
  await cross(call, doorId)
  const before = await call('get_game_state')
  const result = ok(await call('start_encounter', { encounterId, ambush: ambush(true) }))
  assert.equal(result.perception.success, true); assert.equal(result.perception.ability, 'wis'); assert.equal(result.perception.dc, 13)
  assert.equal(result.save.success, true); assert.equal(result.save.ability, 'dex')
  assert.equal(result.avoided, true); assert.equal(result.damageDealt, 0)
  assert.equal(result.opportunityAttack, undefined)
  assert.equal((await call('get_game_state')).player.hp.current, before.player.hp.current)
})

for (const [label, dice, perceptionSuccess] of [
  ['failed Perception', '10,10,10,1,19,3', false],
  ['failed DEX save', '10,10,10,20,1,19,3', true],
]) test(`suspicious entry with ${label} permits only the normal strike`, async t => {
  const { call, doorId } = await prepare(t, { dice })
  await cross(call, doorId)
  const result = ok(await call('start_encounter', { encounterId, ambush: ambush(true) }))
  assert.equal(result.perception.success, perceptionSuccess)
  if (perceptionSuccess) assert.equal(result.save.success, false)
  else assert.equal(result.save, undefined)
  assert.equal(result.opportunityAttack.hit, true); assert.equal(result.opportunityAttack.damageDealt, 5)
})

test('an unsuspecting player can still be protected by AC when the ambush attack misses', async t => {
  const { call, doorId } = await prepare(t, { dice: '10,10,10,1' })
  await cross(call, doorId)
  const before = await call('get_game_state')
  const result = ok(await call('start_encounter', { encounterId, ambush: ambush(false) }))
  assert.equal(result.opportunityAttack.hit, false)
  assert.equal((await call('get_game_state')).player.hp.current, before.player.hp.current)
})

test('the second doorway also prepares and resolves its own ambush', async t => {
  const { call, doorId } = await prepare(t, { sourceRoomId: '4', dice: '10,10,10,1' })
  await cross(call, doorId)
  const result = ok(await call('start_encounter', { encounterId, ambush: ambush(false, doorId) }))
  assert.equal(result.doorId, 'entry-apartment'); assert.equal(result.opportunityAttack.hit, false)
})

test('entering through the other doorway starts the encounter without triggering the prepared strike', async t => {
  const { call } = await prepare(t)
  await replace(call, state => { state.player.position = { x: 10, y: 10 }; state.currentRoomId = '4' })
  ok(await call('interact_door', { doorId: 'entry-apartment', action: 'open' }))
  const entered = ok(await call('move_token', { tokenId: 'player', doorId: 'entry-apartment', doorMode: 'cross', acknowledgeEventIds: ['apartment-guards'] }))
  assert.equal(entered.goalReached, true)
  const inside = ok(await call('move_token', { tokenId: 'player', toCell: { x: 8, y: 8 } }))
  assert.equal(inside.goalReached, true, 'approaching the prepared door from inside is not an entry through it')
  const before = await call('get_game_state')
  assert.equal((await call('start_encounter', { encounterId, ambush: ambush(false) })).code, 'AMBUSH_THRESHOLD_REQUIRED')
  const result = ok(await call('start_encounter', { encounterId }))
  assert.equal(result.opportunityAttack, undefined)
  assert.equal((await call('get_game_state')).player.hp.current, before.player.hp.current)
})

test('no prepared alert means no free entry strike, even when the player is unsuspecting', async t => {
  const call = await engine(t, { adventureId: 'grammys-country-apple-pie' })
  await replace(call, state => { state.player.position = { x: 8, y: 8 }; state.currentRoomId = '9' })
  const before = await call('get_game_state')
  assert.equal((await call('start_encounter', { encounterId, ambush: ambush(false) })).code, 'AMBUSH_THRESHOLD_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
  const result = ok(await call('start_encounter', { encounterId, playerCell: before.player.position }))
  assert.equal(result.opportunityAttack, undefined)
  assert.equal((await call('get_game_state')).player.hp.current, before.player.hp.current)
})

test('a held Perception check survives hydration and resumes into the DEX save without rerolling', async t => {
  const { call, doorId } = await prepare(t, { dice: '10,10,10,20,20' })
  await cross(call, doorId)
  await replace(call, state => {
    state.player = buildPlayerState({ characterId: 'fighter', level: 7, position: state.player.position })
    state.hero = initialHeroState('fighter')
    state.hero.inspiration.push({ targetId: 'player', expiresAt: 10000, die: 8 })
  })
  const held = ok(await call('start_encounter', { encounterId, ambush: ambush(true) }))
  assert.equal(held.pendingReaction.kind, 'check')
  const perceptionRoll = held.pendingReaction.roll
  await replace(call, () => {})
  let resumed = ok(await call('resolve_reaction', { pendingId: held.pendingReaction.id, choice: 'decline' }))
  assert.equal(resumed.pendingReaction.kind, 'save')
  await replace(call, () => {})
  resumed = ok(await call('resolve_reaction', { pendingId: resumed.pendingReaction.id, choice: 'decline' }))
  assert.deepEqual(resumed.perception.roll, perceptionRoll)
  assert.equal(resumed.save.success, true); assert.equal(resumed.avoided, true)
  assert.equal((await call('get_game_state')).player.hp.current, 67)
})

test('the ambush strike honors a held Shield reaction and spends only the attacker reaction', async t => {
  const { call, doorId } = await prepare(t, { dice: '10,10,10,12' })
  await cross(call, doorId)
  await replace(call, state => {
    state.player = buildPlayerState({ characterId: 'wizard', level: 7, position: state.player.position })
    state.hero = initialHeroState('wizard')
  })
  const held = ok(await call('start_encounter', { encounterId, ambush: ambush(false) }))
  assert.equal(held.pendingReaction.kind, 'attack')
  assert.equal(held.opportunityAttack, undefined)
  assert.match(held.mechanicalSummary, /suspendue/)
  await replace(call, () => {})
  const strike = ok(await call('resolve_reaction', { pendingId: held.pendingReaction.id, choice: 'shield', slotLevel: 1 }))
  assert.equal(strike.hit, false)
  const state = await call('get_game_state')
  assert.equal(state.player.hp.current, 37)
  assert.equal(state.hero.reactionsUsed[held.attackerId], true)
  assert.equal(state.actionUsed[held.attackerId], undefined)
  assert.equal(state.currentTurn, 'player')
})

test('entering the ambush during an existing fight preserves initiative and spent player budgets', async t => {
  const { call, doorId } = await prepare(t, { dice: '10,10,10,1' })
  ok(await call('interact_door', { doorId, action: 'open' }))
  const enemy = ok(await call('spawn_monster', { monsterType: 'goblin', cell: { x: 10, y: 5 } }))
  await replace(call, state => {
    state.phase = 'combat'; state.round = 3; state.currentTurn = 'player'
    state.initiativeOrder = ['player', enemy.id]; state.actionUsed.player = true; state.movementUsed.player = 1
  })
  const movement = ok(await call('move_token', { tokenId: 'player', doorId, doorMode: 'cross', acknowledgeEventIds: ['apartment-guards'] }))
  assert.equal(movement.stopReason, 'encounter_ambush')
  const before = await call('get_game_state')
  const result = ok(await call('start_encounter', { encounterId, ambush: ambush(false) }))
  assert.equal(result.combat.joinedExistingCombat, true)
  assert.equal(result.opportunityAttack.hit, false)
  const after = await call('get_game_state')
  assert.deepEqual(after.initiativeOrder.slice(0, 2), before.initiativeOrder)
  assert.equal(after.initiativeOrder.length, 5)
  assert.equal(after.currentTurn, 'player'); assert.equal(after.round, 3)
  assert.deepEqual(after.actionUsed, before.actionUsed); assert.deepEqual(after.movementUsed, before.movementUsed)
})
