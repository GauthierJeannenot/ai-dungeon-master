const test = require('node:test'), assert = require('node:assert/strict')
const { engine, ok, replace, spawn, battle } = require('./helpers/mcp-toolkit.cjs')

async function setup(t, { dice = '17,4,2,19', hp = 1, type = 'goblin', repeat = false } = {}) {
  const call = await engine(t, { characterId: 'cleric', dice }), initial = await call('get_game_state')
  const main = initial.dmTools?.loadout?.mainHandId ?? initial.player.inventory.find(item => item.type === 'weapon')?.id
  if (main) ok(await call('equip_item', { itemId: main, slot: 'main_hand', operation: 'unequip' }))
  const target = await spawn(call, type)
  await replace(call, state => { state.monsters[target.id].hp.current = hp })
  let effect
  if (repeat) {
    ok(await call('cast_spell', { spellId: 'spiritual-weapon', slotLevel: 2, toCell: initial.player.position }))
    effect = (await call('get_game_state')).hero.effects.find(entry => entry.kind === 'spiritual-weapon')
    assert.ok(effect, 'fixture creates its actual sourced weapon before combat')
  }
  await battle(call, [target.id])
  return { call, target, effect }
}
const cast = (call, target, extra = {}) => call('cast_spell', {
  spellId: 'spiritual-weapon', slotLevel: 2, toCell: target.position, targetId: target.id, nonlethal: true, ...extra,
})
const strike = (call, effect, target, extra = {}) => call('use_subclass_feature', {
  featureId: 'spiritual_weapon', effectId: effect.id, targetId: target.id, toCell: target.position, nonlethal: true, ...extra,
})
async function refusal(call, name, input, code) {
  const before = await call('get_game_state')
  assert.equal((await call(name, input)).code, code)
  assert.deepEqual(await call('get_game_state'), before)
}
function assertKnockout(before, after, target) {
  const body = after.monsters[target.id]
  assert.equal(body.hp.current, 0); assert.equal(body.isAlive, true)
  assert.equal(body.knockout.stable, true); assert.equal(body.knockout.sourceId, 'player')
  assert.equal(body.knockout.at, before.worldTimeSeconds)
  assert.deepEqual(body.knockout.recovery, { hours: 2, wakeAt: before.worldTimeSeconds + 7200 })
  assert.ok(body.knockout.attackEventId); assert.ok(body.conditions.includes('unconscious')); assert.ok(body.conditions.includes('prone'))
  assert.equal(after.hero.corpseTimes[target.id], undefined)
  assert.equal(after.hero.actionCredits, before.hero.actionCredits)
  assert.equal(after.hero.attackAction, undefined)
  assert.equal(after.bonusActionUsed.player, true)
}

test('an initial real Spiritual Weapon attack can knock out, pays one slot and bonus, and persists without a stored default intent', async t => {
  const { call, target } = await setup(t), before = await call('get_game_state')
  const answer = ok(await cast(call, target)), after = await call('get_game_state')
  assert.ok(answer.results.some(entry => entry.hit === true))
  assertKnockout(before, after, target)
  assert.equal(after.player.spellSlots.level2.current, before.player.spellSlots.level2.current - 1)
  assert.deepEqual(after.player.inventory, before.player.inventory)
  const effect = after.hero.effects.find(entry => entry.kind === 'spiritual-weapon')
  assert.ok(effect); assert.deepEqual(effect.data.cell, target.position)
  assert.equal(effect.data.nonlethal, undefined, 'each later attack must choose its own intent')
  ok(await call('replace_game_state', { gameState: after })); assert.deepEqual(await call('get_game_state'), after)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a repeated real Spiritual Weapon attack moves once, knocks out and spends only its bonus with no second slot', async t => {
  const { call, target, effect } = await setup(t, { repeat: true }), before = await call('get_game_state')
  assert.notDeepEqual(effect.data.cell, target.position)
  const answer = ok(await strike(call, effect, target)), after = await call('get_game_state')
  assert.equal(answer.hit, true); assertKnockout(before, after, target)
  assert.deepEqual(after.player.spellSlots, before.player.spellSlots)
  assert.deepEqual(after.hero.effects.find(entry => entry.id === effect.id).data.cell, target.position)
  assert.equal(after.hero.effects.find(entry => entry.id === effect.id).expiresAt, effect.expiresAt)
  ok(await call('replace_game_state', { gameState: after })); assert.deepEqual(await call('get_game_state'), after)
  const unchanged = await call('get_game_state')
  assert.ok((await strike(call, effect, target)).error)
  assert.deepEqual(await call('get_game_state'), unchanged)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('declaring knockout grants neither early unconsciousness nor a recovery die when positive HP remain', async t => {
  for (const repeat of [false, true]) await t.test(repeat ? 'repeat' : 'initial', async t => {
    const { call, target, effect } = await setup(t, { repeat, hp: 200, dice: '17,4,19' })
    ok(await (repeat ? strike(call, effect, target) : cast(call, target)))
    const body = (await call('get_game_state')).monsters[target.id]
    assert.ok(body.hp.current > 0 && body.hp.current < 200)
    assert.equal(body.knockout, undefined); assert.ok(!body.conditions.includes('unconscious'))
    assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  })
})

test('omitted or false choices keep the ordinary lethal initial and repeated spell attacks', async t => {
  for (const repeat of [false, true]) for (const choice of ['omitted', false]) await t.test(`${repeat ? 'repeat' : 'initial'} ${choice}`, async t => {
    const { call, target, effect } = await setup(t, { repeat, dice: '17,4,19' })
    const input = repeat ? { featureId: 'spiritual_weapon', effectId: effect.id, targetId: target.id, toCell: target.position }
      : { spellId: 'spiritual-weapon', slotLevel: 2, targetId: target.id, toCell: target.position }
    if (choice !== 'omitted') input.nonlethal = choice
    ok(await call(repeat ? 'use_subclass_feature' : 'cast_spell', input))
    const body = (await call('get_game_state')).monsters[target.id]
    assert.equal(body.isAlive, false); assert.equal(body.knockout, undefined)
    assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  })
})

test('a source immune to unconsciousness refuses initial or repeated knockout before slot, bonus, movement or die', async t => {
  for (const repeat of [false, true]) await t.test(repeat ? 'repeat' : 'initial', async t => {
    const { call, target, effect } = await setup(t, { repeat, type: 'will_o_wisp', dice: '19' })
    const input = repeat ? { featureId: 'spiritual_weapon', effectId: effect.id, targetId: target.id, toCell: target.position, nonlethal: true }
      : { spellId: 'spiritual-weapon', slotLevel: 2, targetId: target.id, toCell: target.position, nonlethal: true }
    await refusal(call, repeat ? 'use_subclass_feature' : 'cast_spell', input, 'NONLETHAL_CONDITION_IMMUNE')
    assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  })
})

test('another real feature refuses the field even when false without healing or spending its resource', async t => {
  const call = await engine(t, { characterId: 'fighter', dice: '19' }), target = await spawn(call)
  await battle(call, [target.id])
  await replace(call, state => { state.player.hp.current = 1 })
  for (const nonlethal of [true, false]) await refusal(call, 'use_subclass_feature', { featureId: 'second_wind', nonlethal }, 'NONLETHAL_FEATURE_MISMATCH')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a movement-only weapon command refuses any nonlethal field before moving or spending its bonus', async t => {
  const { call, target, effect } = await setup(t, { repeat: true, dice: '19' })
  for (const nonlethal of [true, false]) await refusal(call, 'use_subclass_feature', {
    featureId: 'spiritual_weapon', effectId: effect.id, toCell: target.position, nonlethal,
  }, 'NONLETHAL_SPELL_TARGET_REQUIRED')
  const before = await call('get_game_state')
  ok(await call('use_subclass_feature', { featureId: 'spiritual_weapon', effectId: effect.id, toCell: target.position }))
  const after = await call('get_game_state')
  assert.deepEqual(after.hero.effects.find(entry => entry.id === effect.id).data.cell, target.position)
  assert.equal(after.bonusActionUsed.player, true); assert.deepEqual(after.player.spellSlots, before.player.spellSlots)
  assert.equal(after.monsters[target.id].hp.current, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('an absent target cannot relocate the real weapon or spend the bonus before refusing', async t => {
  const { call, target, effect } = await setup(t, { repeat: true, dice: '19' })
  await refusal(call, 'use_subclass_feature', { featureId: 'spiritual_weapon', effectId: effect.id,
    targetId: 'absent-spell-target', toCell: target.position, nonlethal: true }, 'ENTITY_NOT_FOUND')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('an already stable living zero-HP body cannot receive a new knockout or recovery timer', async t => {
  const { call, target, effect } = await setup(t, { repeat: true, dice: '17,2,19' })
  ok(await call('resolve_player_attack', { targetId: target.id, weaponOrSpell: 'unarmed', nonlethal: true }))
  const body = (await call('get_game_state')).monsters[target.id]
  assert.equal(body.hp.current, 0); assert.ok(body.knockout)
  await refusal(call, 'use_subclass_feature', { featureId: 'spiritual_weapon', effectId: effect.id,
    targetId: target.id, toCell: target.position, nonlethal: true }, 'NONLETHAL_LIVING_TARGET_REQUIRED')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a missing effect refuses before an attack or bonus is consumed', async t => {
  const { call, target } = await setup(t, { dice: '19' })
  await refusal(call, 'use_subclass_feature', { featureId: 'spiritual_weapon', effectId: 'not-a-sourced-weapon',
    targetId: target.id, toCell: target.position, nonlethal: true }, 'SPELL_EFFECT_NOT_FOUND')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
