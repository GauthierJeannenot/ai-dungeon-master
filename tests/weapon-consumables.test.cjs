const test = require('node:test'), assert = require('node:assert/strict')
const { engine, ok, replace, spawn, battle, addSupply } = require('./helpers/mcp-toolkit.cjs')
const use = (targetId, extra = {}) => ({ useId: 'use-one', itemId: 'owned-vial', targetKind: 'creature', targetId, mode: 'splash', ...extra })
async function fixture(t, { kind = 'acid_vial', type = 'goblin', dice = '18,18,3,4,17', ...options } = {}) {
  const call = await engine(t, { dice, ...options }), enemy = await spawn(call, type)
  await addSupply(call, kind, 'owned-vial'); await battle(call, [enemy.id])
  return { call, enemy }
}

test('acid uses ranged DEX without improvised proficiency, fixed source damage and a full action despite Extra Attack', async t => {
  const { call, enemy } = await fixture(t), before = await call('get_game_state')
  const result = ok(await call('use_weapon_consumable', use(enemy.id)))
  assert.equal(result.proficiencyApplied, false)
  assert.equal(result.attackRoll.modifier, Math.floor((before.player.stats.dex - 10) / 2))
  assert.match(result.attackRoll.detail, /DIS:/, 'splash remains a ranged attack near a hostile creature')
  assert.equal(result.damageRoll.total, 7); assert.equal(result.damageType, 'acid'); assert.equal(result.damageDealt, 7)
  const state = await call('get_game_state')
  assert.equal(state.hero.actionCredits, 0); assert.equal(state.hero.attackAction, undefined)
  assert.ok(!state.player.inventory.some(item => item.id === 'owned-vial'))
  assert.equal(state.monsters[enemy.id].hp.current, before.monsters[enemy.id].hp.current - 7)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('a miss consumes the exact flask and action, with no damage dice', async t => {
  const { call, enemy } = await fixture(t, { dice: '1,1,17' })
  const result = ok(await call('use_weapon_consumable', use(enemy.id)))
  assert.equal(result.hit, false); assert.equal(result.damageDealt, 0); assert.equal(result.damageRoll, undefined)
  const state = await call('get_game_state')
  assert.equal(state.hero.actionCredits, 0); assert.ok(!state.player.inventory.some(item => item.id === 'owned-vial'))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('completed use receipts survive state round-trip and prevent another consumption, action or roll', async t => {
  const { call, enemy } = await fixture(t)
  const input = use(enemy.id), first = ok(await call('use_weapon_consumable', input)), state = await call('get_game_state')
  ok(await call('replace_game_state', { gameState: state }))
  assert.deepEqual(ok(await call('use_weapon_consumable', input)), first)
  assert.deepEqual(await call('get_game_state'), state)
  assert.equal((await call('use_weapon_consumable', { ...input, mode: 'throw' })).code, 'CONSUMABLE_USE_CONFLICT')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('unsupported object, unknown inventory and invalid fire splash refuse before dice, consumption or action', async t => {
  const { call, enemy } = await fixture(t, { kind: 'alchemists_fire_flask', dice: '13' })
  const before = await call('get_game_state')
  assert.equal((await call('use_weapon_consumable', use(enemy.id, { targetKind: 'object' }))).code, 'CONSUMABLE_OBJECT_UNSUPPORTED')
  assert.equal((await call('use_weapon_consumable', use(enemy.id, { itemId: 'acid_vial', mode: 'throw' }))).code, 'WEAPON_CONSUMABLE_NOT_OWNED')
  assert.equal((await call('use_weapon_consumable', use(enemy.id))).code, 'CONSUMABLE_MODE_INVALID')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 13)
})

test('total cover rejects the direct attack before its first die and all costs', async t => {
  const { call, enemy } = await fixture(t, { dice: '13' }), state = await call('get_game_state')
  ok(await call('configure_cover', { coverId: 'acid-cover', operation: 'set', originId: 'player', targetId: enemy.id,
    obstacleCell: state.monsters[enemy.id].position, degree: 'total', reason: 'Un parapet opaque protège exactement cette cible depuis le joueur.' }))
  const before = await call('get_game_state')
  assert.equal((await call('use_weapon_consumable', use(enemy.id))).code, 'COVER_TOTAL')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 13)
})

test('a retained Extra Attack slot cannot pay for the full consumable action', async t => {
  const { call, enemy } = await fixture(t, { dice: '13' })
  await replace(call, state => { state.hero.actionCredits = 0; state.hero.attackAction = { used: 1, remaining: 1 }; state.actionUsed.player = true })
  const before = await call('get_game_state')
  assert.equal((await call('use_weapon_consumable', use(enemy.id))).code, 'ACTION_ALREADY_USED')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 13)
})

test('holy water harms only authoritative undead/fiends; a humanoid still consumes the thrown flask on a hit', async t => {
  const { call, enemy } = await fixture(t, { kind: 'holy_water_flask', dice: '18,18,17' }), before = await call('get_game_state')
  const result = ok(await call('use_weapon_consumable', use(enemy.id)))
  assert.equal(result.hit, true); assert.equal(result.damageDealt, 0); assert.equal(result.damageRoll, undefined)
  assert.equal((await call('get_game_state')).monsters[enemy.id].hp.current, before.monsters[enemy.id].hp.current)
  assert.equal(result.consumed, true); assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('holy water deals radiant source dice to an undead, with doubled immediate dice on a critical', async t => {
  const { call, enemy } = await fixture(t, { kind: 'holy_water_flask', type: 'zombie', dice: '20,20,1,2,3,4,17' })
  const result = ok(await call('use_weapon_consumable', use(enemy.id)))
  assert.equal(result.hit, true); assert.equal(result.criticalHit, true)
  assert.equal(result.damageType, 'radiant'); assert.equal(result.damageRoll.notation, '4d6'); assert.equal(result.damageDealt, 10)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('Bardic Inspiration suspends the same attack without spending inventory/action or rerolling d20', async t => {
  const { call, enemy } = await fixture(t, { dice: '8,8,6,3,4,17' })
  await replace(call, state => state.hero.inspiration.push({ targetId: 'player', die: 6, expiresAt: 600 }))
  const held = ok(await call('use_weapon_consumable', use(enemy.id))), pending = held.pendingReaction
  assert.ok(pending.options.includes('bardic_inspiration'))
  let state = await call('get_game_state')
  assert.equal(state.hero.actionCredits, 1); assert.ok(state.player.inventory.some(item => item.id === 'owned-vial'))
  const resolved = ok(await call('resolve_reaction', { pendingId: pending.id, choice: 'bardic_inspiration' }))
  assert.equal(resolved.attackRoll.rolls[0], 8); assert.match(resolved.attackRoll.detail, /Inspiration/)
  state = await call('get_game_state'); assert.equal(state.hero.actionCredits, 0); assert.equal(state.hero.inspiration.length, 0)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('alchemist fire has no immediate damage, ticks at target turn start and extinguishes with an action DEX check', async t => {
  const { call, enemy } = await fixture(t, { kind: 'alchemists_fire_flask', dice: '18,18,3,12,17' }), before = await call('get_game_state')
  const thrown = ok(await call('use_weapon_consumable', use(enemy.id, { mode: 'throw' })))
  assert.equal(thrown.damageDealt, 0); assert.equal(thrown.damageRoll, undefined); assert.equal(thrown.burning, true)
  assert.equal((await call('get_game_state')).monsters[enemy.id].hp.current, before.monsters[enemy.id].hp.current)
  ok(await call('next_turn'))
  let state = await call('get_game_state')
  assert.equal(state.currentTurn, enemy.id); assert.equal(state.monsters[enemy.id].hp.current, before.monsters[enemy.id].hp.current - 3)
  const extinguished = ok(await call('extinguish_alchemists_fire', { eventId: 'ext-one', actorId: enemy.id }))
  assert.equal(extinguished.extinguished, true); assert.equal(extinguished.check.ability, 'dex'); assert.equal(extinguished.check.dc, 10)
  state = await call('get_game_state'); assert.equal(state.actionUsed[enemy.id], true); assert.equal(state.dmTools.weaponConsumables.burning[enemy.id], undefined)
  assert.deepEqual(ok(await call('extinguish_alchemists_fire', { eventId: 'ext-one', actorId: enemy.id })), extinguished)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('failed extinguishing consumes the creature action and retains fire', async t => {
  const { call, enemy } = await fixture(t, { kind: 'alchemists_fire_flask', dice: '18,18,3,1,17' })
  ok(await call('use_weapon_consumable', use(enemy.id, { mode: 'throw' }))); ok(await call('next_turn'))
  const result = ok(await call('extinguish_alchemists_fire', { eventId: 'ext-fail', actorId: enemy.id }))
  assert.equal(result.extinguished, false)
  const state = await call('get_game_state'); assert.ok(state.dmTools.weaponConsumables.burning[enemy.id]); assert.equal(state.actionUsed[enemy.id], true)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('burning survives persistence and refuses a free end-combat time escape', async t => {
  const { call, enemy } = await fixture(t, { kind: 'alchemists_fire_flask', dice: '18,18,17' })
  ok(await call('use_weapon_consumable', use(enemy.id, { mode: 'throw' })))
  const state = await call('get_game_state'); ok(await call('replace_game_state', { gameState: state }))
  assert.equal((await call('end_combat', { force: true, reason: 'Retraite explicite hors du combat.' })).code, 'ALCHEMIST_FIRE_ACTIVE')
  assert.deepEqual(await call('get_game_state'), state)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})
