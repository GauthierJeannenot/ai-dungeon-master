const test = require('node:test'), assert = require('node:assert/strict')
const { engine, ok, replace, spawn, battle } = require('./helpers/mcp-toolkit.cjs')

const heldMain = state => state.dmTools?.loadout?.mainHandId ?? state.player.inventory.find(item => item.type === 'weapon').id
const trigger = 'Lorsque l’adversaire lève réellement son arme.'
async function setup(t, { dice = '17,4,2,19', hp = 1, type = 'goblin', bow = false } = {}) {
  const call = await engine(t, { dice }), initial = await call('get_game_state')
  let weapon = heldMain(initial)
  if (bow) {
    ok(await call('equip_item', { itemId: weapon, slot: 'main_hand', operation: 'unequip' }))
    const shield = (await call('get_game_state')).dmTools?.loadout?.shieldId
    if (shield) ok(await call('equip_item', { itemId: shield, slot: 'shield', operation: 'unequip' }))
    weapon = 'readied-bow'
    await replace(call, state => state.player.inventory.push({ id: weapon, equipmentId: 'shortbow', name: 'Arc court', type: 'weapon' }))
    ok(await call('equip_item', { itemId: weapon, slot: 'main_hand', operation: 'equip' }))
  }
  const target = await spawn(call, type)
  await battle(call, [target.id])
  await replace(call, state => { state.monsters[target.id].hp.current = hp })
  return { call, target, weapon }
}
async function prepare(call, weapon, kind = 'attack') {
  const ready = ok(await call('combat_action', { action: 'ready', readied: { kind, ...(kind === 'attack' ? { weaponId: weapon } : {}), trigger } }))
  ok(await call('next_turn', { actorId: 'player' }))
  return ready
}
const release = (call, ready, target, extra = {}) => call('resolve_readied_action', {
  readyId: ready.readyId, choice: 'execute', targetId: target.id, triggerObserved: trigger, nonlethal: true, ...extra,
})
async function unchangedRefusal(call, input, code) {
  const before = await call('get_game_state')
  assert.equal((await call('resolve_readied_action', input)).code, code)
  assert.deepEqual(await call('get_game_state'), before)
}

test('release-time choice knocks out with one reaction, one real recovery die, no extra action or Extra Attack, and persists', async t => {
  const { call, target, weapon } = await setup(t), original = await call('get_game_state')
  const ready = await prepare(call, weapon), before = await call('get_game_state')
  assert.equal(before.hero.actionCredits, original.hero.actionCredits - 1)
  assert.equal(before.hero.effects.find(effect => effect.id === ready.readyId).data.readied.nonlethal, undefined)
  const answer = ok(await release(call, ready, target)), after = await call('get_game_state'), body = after.monsters[target.id]
  assert.equal(answer.nonlethal, true); assert.equal(answer.targetKnockedOut, true); assert.equal(answer.targetDied, false)
  assert.equal(body.hp.current, 0); assert.equal(body.isAlive, true)
  assert.equal(body.knockout.stable, true); assert.equal(body.knockout.sourceId, 'player')
  assert.equal(body.knockout.at, before.worldTimeSeconds)
  assert.deepEqual(body.knockout.recovery, { hours: 2, wakeAt: before.worldTimeSeconds + 7200 })
  assert.ok(body.conditions.includes('unconscious')); assert.ok(body.conditions.includes('prone'))
  assert.equal(after.hero.corpseTimes[target.id], undefined)
  assert.equal(after.hero.reactionsUsed.player, true); assert.equal(after.hero.actionCredits, before.hero.actionCredits)
  assert.equal(after.hero.attackAction, undefined); assert.equal(after.currentTurn, target.id)
  assert.ok(!after.hero.effects.some(effect => effect.id === ready.readyId))
  ok(await call('replace_game_state', { gameState: after })); assert.deepEqual(await call('get_game_state'), after)
  await unchangedRefusal(call, { readyId: ready.readyId, choice: 'execute', targetId: target.id, triggerObserved: trigger, nonlethal: true }, 'READY_EFFECT_NOT_FOUND')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('held attack keeps the release choice and original roll after Ready is consumed and state rehydrates', async t => {
  const { call, target, weapon } = await setup(t, { dice: '15,2,4,2,19' }), ready = await prepare(call, weapon)
  await replace(call, state => state.hero.inspiration.push({ targetId: 'player', die: 8, expiresAt: state.worldTimeSeconds + 600 }))
  const before = await call('get_game_state'), held = ok(await release(call, ready, target))
  assert.ok(held.pendingReaction); assert.equal(held.pendingReaction.command.nonlethal, true)
  assert.equal(held.pendingReaction.command.readied, true); assert.equal(held.pendingReaction.command.reaction, true)
  assert.deepEqual(held.pendingReaction.roll.rolls, [15])
  const saved = await call('get_game_state')
  assert.ok(!saved.hero.effects.some(effect => effect.id === ready.readyId))
  assert.equal(saved.monsters[target.id].hp.current, 1); assert.notEqual(saved.hero.reactionsUsed.player, true)
  ok(await call('replace_game_state', { gameState: saved }))
  assert.ok((await release(call, ready, target)).error)
  assert.deepEqual(await call('get_game_state'), saved)
  const answer = ok(await call('resolve_reaction', { pendingId: held.pendingReaction.id, choice: 'bardic_inspiration' })), after = await call('get_game_state')
  assert.equal(answer.attackRoll.rolls[0], 15); assert.equal(answer.targetKnockedOut, true)
  assert.equal(after.monsters[target.id].knockout.attackEventId, held.pendingReaction.command.attackEventId)
  assert.equal(after.hero.pending, undefined); assert.equal(after.hero.reactionsUsed.player, true)
  assert.equal(after.hero.actionCredits, before.hero.actionCredits); assert.equal(after.hero.attackAction, undefined)
  await unchangedRefusal(call, { readyId: ready.readyId, choice: 'execute', targetId: target.id, triggerObserved: trigger, nonlethal: true }, 'READY_EFFECT_NOT_FOUND')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a readied knockout choice does not knock out before actual zero HP', async t => {
  const { call, target, weapon } = await setup(t, { hp: 200, dice: '17,4,19' }), ready = await prepare(call, weapon)
  const answer = ok(await release(call, ready, target)), after = await call('get_game_state')
  assert.equal(answer.targetKnockedOut, false); assert.equal(after.monsters[target.id].hp.current, 200 - answer.damageDealt)
  assert.equal(after.monsters[target.id].knockout, undefined)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('omitted or false choice retains ordinary lethal readied attacks', async t => {
  for (const choice of ['omitted', false]) await t.test(String(choice), async t => {
    const { call, target, weapon } = await setup(t, { dice: '17,4,19' }), ready = await prepare(call, weapon)
    const input = { readyId: ready.readyId, choice: 'execute', targetId: target.id, triggerObserved: trigger }
    if (choice !== 'omitted') input.nonlethal = choice
    const answer = ok(await call('resolve_readied_action', input)), after = await call('get_game_state')
    assert.equal(answer.nonlethal, false); assert.equal(answer.targetDied, true); assert.equal(after.monsters[target.id].knockout, undefined)
    assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  })
})

test('ranged knockout and source immunity refuse before the readied effect, reaction or die changes', async t => {
  for (const kind of ['ranged', 'immune']) await t.test(kind, async t => {
    const { call, target, weapon } = await setup(t, { dice: '19', bow: kind === 'ranged', type: kind === 'immune' ? 'will_o_wisp' : 'goblin' })
    const ready = await prepare(call, weapon)
    await unchangedRefusal(call, { readyId: ready.readyId, choice: 'execute', targetId: target.id, triggerObserved: trigger, nonlethal: true }, kind === 'ranged' ? 'NONLETHAL_MELEE_REQUIRED' : 'NONLETHAL_CONDITION_IMMUNE')
    assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  })
})

test('the exact prepared weapon must still be held before a knockout release', async t => {
  const { call, target, weapon } = await setup(t, { dice: '19' })
  const ready = ok(await call('combat_action', { action: 'ready', readied: { kind: 'attack', weaponId: weapon, trigger } }))
  ok(await call('equip_item', { itemId: weapon, slot: 'main_hand', operation: 'unequip' }))
  ok(await call('next_turn', { actorId: 'player' }))
  await unchangedRefusal(call, { readyId: ready.readyId, choice: 'execute', targetId: target.id, triggerObserved: trigger, nonlethal: true }, 'READY_WEAPON_UNAVAILABLE')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('nonlethal is rejected on ignored or movement preparations even when false', async t => {
  for (const kind of ['ignore', 'move']) await t.test(kind, async t => {
    const { call, target, weapon } = await setup(t, { dice: '19' }), ready = await prepare(call, weapon, kind === 'move' ? 'move' : 'attack')
    for (const nonlethal of [true, false]) await unchangedRefusal(call, {
      readyId: ready.readyId, choice: kind === 'ignore' ? 'ignore' : 'execute', triggerObserved: trigger,
      ...(kind === 'move' ? { toCell: (await call('get_game_state')).player.position } : {}), nonlethal,
    }, 'NONLETHAL_READIED_ATTACK_REQUIRED')
    if (kind === 'ignore') {
      const ignored = ok(await call('resolve_readied_action', { readyId: ready.readyId, choice: 'ignore' }))
      assert.equal(ignored.reactionSpent, false)
      assert.ok((await call('get_game_state')).hero.effects.some(effect => effect.id === ready.readyId))
    }
    assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  })
})

test('a prepared spell refuses any knockout field without consuming its release reaction or another slot', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '19' }), target = await spawn(call)
  await battle(call, [target.id])
  const ready = ok(await call('combat_action', { action: 'ready', readied: { kind: 'spell', spellId: 'magic-missile', targetId: target.id, trigger } }))
  ok(await call('next_turn', { actorId: 'player' }))
  for (const nonlethal of [true, false]) await unchangedRefusal(call, { readyId: ready.readyId, choice: 'execute', triggerObserved: trigger, nonlethal }, 'NONLETHAL_READIED_ATTACK_REQUIRED')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a missing observed trigger or spent reaction cannot release a knockout or consume Ready', async t => {
  const { call, target, weapon } = await setup(t, { dice: '19' }), ready = await prepare(call, weapon)
  await unchangedRefusal(call, { readyId: ready.readyId, choice: 'execute', targetId: target.id, nonlethal: true }, 'READY_TRIGGER_REQUIRED')
  await replace(call, state => { state.hero.reactionsUsed.player = true })
  await unchangedRefusal(call, { readyId: ready.readyId, choice: 'execute', targetId: target.id, triggerObserved: trigger, nonlethal: true }, 'REACTION_ALREADY_USED')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('expired Ready cannot knock out and no knockout choice is accepted at preparation time', async t => {
  const { call, target, weapon } = await setup(t, { dice: '19' }), initial = await call('get_game_state')
  assert.ok((await call('combat_action', { action: 'ready', readied: { kind: 'attack', weaponId: weapon, trigger, nonlethal: true } })).error)
  assert.deepEqual(await call('get_game_state'), initial)
  const ready = await prepare(call, weapon)
  ok(await call('next_turn', { actorId: target.id, skipAction: true }))
  await unchangedRefusal(call, { readyId: ready.readyId, choice: 'execute', targetId: target.id, triggerObserved: trigger, nonlethal: true }, 'READY_EFFECT_NOT_FOUND')
})
