const test = require('node:test')
const assert = require('node:assert/strict')
const { engine, ok, replace, spawn, battle, grid } = require('./helpers/mcp-toolkit.cjs')
const { getMapSpec, inferRoomIdOnMap } = require('../mcp-server/dist/lib/adventure-map.js')
const { getMonsterRecord } = require('../mcp-server/dist/lib/srd/monsters.js')

const same = (a, b) => a.x === b.x && a.y === b.y
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
async function fixture(t, { targetType = 'goblin', characterId = 'fighter', dice = '20,1,19',
  forward = false, observer = false, friendlyObserver = false, obstacle, inspireObserver = false } = {}) {
  const call = await engine(t, { characterId, dice }), initial = await call('get_game_state')
  const nav = grid(initial), map = getMapSpec(initial.currentMapId, initial)
  let corner
  for (let y = 0; y <= map.grid.rows - 5 && !corner; y++) for (let x = 0; x <= map.grid.cols - 7 && !corner; x++) {
    const patch = Array.from({ length: 5 }, (_, dy) => Array.from({ length: 7 }, (_, dx) => ({ x: x + dx, y: y + dy }))).flat()
    if (patch.every(cell => nav.free(cell) && inferRoomIdOnMap(cell, initial.currentMapId, initial) === initial.currentRoomId)) corner = { x, y }
  }
  assert.ok(corner, 'fixture needs a real clear 7×5 patch in the active room')
  const cell = (x, y) => ({ x: corner.x + x, y: corner.y + y })
  const weaponId = initial.dmTools?.loadout?.mainHandId ?? initial.player.inventory.find(item => item.type === 'weapon')?.id
  assert.ok(weaponId)
  ok(await call('equip_item', { itemId: weaponId, slot: 'main_hand', operation: 'unequip' }))
  const target = await spawn(call, targetType)
  const witness = observer || friendlyObserver ? await spawn(call) : undefined
  await replace(call, state => {
    state.player.position = cell(2, 2)
    state.monsters[target.id].position = forward ? cell(3, 2) : cell(2, 3)
    if (witness) {
      state.monsters[witness.id].position = friendlyObserver ? cell(2, 4) : cell(1, 2)
      if (friendlyObserver) state.monsters[witness.id].hostile = false
    }
  })
  if (obstacle) ok(await call('create_scene_object', { objectId: 'transport-wall', name: 'Obstacle de pierre',
    description: 'Obstacle physique explicitement établi pour vérifier les deux trajectoires.', kind: 'obstacle',
    cell: cell(...obstacle), material: 'stone', size: 'small', resilience: 'resilient' }))
  await battle(call, [target.id, ...(witness ? [witness.id] : [])])
  if (inspireObserver) ok(await call('use_subclass_feature', { featureId: 'bardic_inspiration', targetId: witness.id }))
  let grapple = ok(await call('combat_action', { action: 'grapple', actorId: 'player', targetId: target.id, defenseSkill: 'acrobatics' }))
  // A bard may decline Cutting Words on the defender's actual contest roll.
  // This is an explicit test choice; no server invents a decline or new roll.
  while (grapple.pendingReaction) grapple = ok(await call('resolve_reaction', { pendingId: grapple.pendingReaction.id, choice: 'decline' }))
  assert.equal(grapple.success, true)
  const state = await call('get_game_state')
  const effect = state.hero.effects.find(item => item.kind === 'grapple' && item.sourceId === 'player' && item.targetIds.includes(target.id))
  assert.ok(effect, 'fixture creates the hold with the real combat resolver')
  assert.ok(state.monsters[target.id].conditions.includes('grappled'))
  return { call, target, witness, cell, effectId: effect.id }
}
const input = (target, toCell, targetToCell, extra = {}) => ({ actorId: 'player', targetId: target.id, toCell, targetToCell, ...extra })
const preview = async (call, command) => ok(await call('preview_grapple_transport', command))

test('a real grapple previews purely, persists and moves both bodies at the source half speed without another action', async t => {
  const { call, target, cell, effectId } = await fixture(t)
  const command = input(target, cell(4, 2), cell(4, 3)), before = await call('get_game_state')
  const plan = await preview(call, command)
  assert.equal(plan.transport.speedDivisor, 2)
  assert.equal(plan.transport.actorSize, 'Medium'); assert.equal(plan.transport.targetSize, 'Small')
  assert.equal(plan.transport.speed, Math.floor(before.player.speed / 2))
  assert.equal(plan.costCells, 2)
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('replace_game_state', { gameState: before }))
  assert.deepEqual(await call('get_game_state'), before)
  const moved = ok(await call('move_grappled_creature', command)), after = await call('get_game_state')
  assert.equal(moved.goalReached, true)
  assert.deepEqual(after.player.position, command.toCell)
  assert.deepEqual(after.monsters[target.id].position, command.targetToCell)
  assert.equal(after.movementUsed.player, 2)
  assert.equal(after.movementUsed[target.id] ?? 0, 0)
  assert.deepEqual(after.actionUsed, before.actionUsed)
  assert.deepEqual(after.bonusActionUsed, before.bonusActionUsed)
  assert.deepEqual(after.hero.attackAction, before.hero.attackAction)
  assert.ok(after.hero.effects.some(effect => effect.id === effectId))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('forward translation commits both positions before reconciling the real hold', async t => {
  const { call, target, cell, effectId } = await fixture(t, { forward: true })
  const moved = ok(await call('move_grappled_creature', input(target, cell(3, 2), cell(4, 2))))
  assert.equal(moved.costCells, 1)
  const after = await call('get_game_state')
  assert.deepEqual(after.player.position, cell(3, 2)); assert.deepEqual(after.monsters[target.id].position, cell(4, 2))
  assert.ok(after.hero.effects.some(effect => effect.id === effectId), 'The victim cannot transiently move out of reach during an atomic pair step')
  assert.ok(after.monsters[target.id].conditions.includes('grappled'))
})

test('the Tiny Sprite source grants the two-sizes-smaller exception without invented sizes or speed', async t => {
  const { call, target, cell } = await fixture(t, { targetType: 'sprite' })
  const before = await call('get_game_state'), source = getMonsterRecord(before.monsters[target.id].type)
  assert.equal(source.source.size, 'Tiny')
  const plan = await preview(call, input(target, cell(4, 2), cell(4, 3)))
  assert.equal(plan.transport.actorSize, 'Medium'); assert.equal(plan.transport.targetSize, source.source.size)
  assert.equal(plan.transport.speedDivisor, 1)
  assert.equal(plan.transport.speed, before.player.speed)
  ok(await call('move_grappled_creature', input(target, cell(4, 2), cell(4, 3))))
  assert.equal((await call('get_game_state')).movementUsed.player, 2)
})

test('ordinary movement cannot silently drag a held creature, and refusal changes neither state nor dice', async t => {
  const { call, target, cell } = await fixture(t), before = await call('get_game_state')
  assert.equal((await call('move_token', { tokenId: 'player', toCell: cell(3, 2) })).code, 'GRAPPLE_TRANSPORT_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
  assert.deepEqual(before.monsters[target.id].position, cell(2, 3))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('both explicit destinations and victim geometry validate before mutation or dice', async t => {
  const { call, target, cell } = await fixture(t, { obstacle: [5, 3] }), before = await call('get_game_state')
  for (const command of [input(target, cell(3, 2), cell(3, 2)), input(target, cell(3, 2), cell(6, 4))]) {
    assert.equal((await call('move_grappled_creature', command)).code, 'GRAPPLE_TRANSPORT_DESTINATION')
    assert.deepEqual(await call('get_game_state'), before)
  }
  assert.equal((await call('move_grappled_creature', input(target, cell(5, 2), cell(5, 3)))).code, 'GRAPPLE_TRANSPORT_BLOCKED')
  assert.deepEqual(await call('get_game_state'), before, 'An open grappler destination never licenses dragging the victim into a wall')
  const missing = input(target, cell(3, 2), cell(3, 3)); delete missing.targetToCell
  assert.ok((await call('move_grappled_creature', missing)).error)
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('halved movement refuses an over-budget pair atomically, and partial movement keeps both bodies on its exact prefix', async t => {
  const { call, target, cell } = await fixture(t), command = input(target, cell(6, 2), cell(6, 3))
  const before = await call('get_game_state')
  assert.equal((await call('move_grappled_creature', command)).code, 'MOVEMENT_EXCEEDED')
  assert.deepEqual(await call('get_game_state'), before)
  const plan = await preview(call, { ...command, allowPartial: true })
  assert.equal(plan.goalReached, false); assert.equal(plan.stopReason, 'movement_budget')
  assert.equal(plan.costCells, Math.floor(before.player.speed / 2 / 5))
  const moved = ok(await call('move_grappled_creature', { ...command, allowPartial: true })), after = await call('get_game_state')
  assert.deepEqual(after.player.position, plan.finalPosition)
  assert.deepEqual(after.monsters[target.id].position, plan.transport.targetFinalPosition)
  assert.equal(distance(after.player.position, after.monsters[target.id].position), 1)
  assert.equal(moved.costCells, plan.costCells); assert.equal(after.movementUsed.player, plan.costCells)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('joint pathfinding bends the victim path around a real wall instead of copying the grappler offset through it', async t => {
  const { call, target, cell } = await fixture(t, { obstacle: [3, 3] })
  const command = input(target, cell(4, 1), cell(4, 2)), before = await call('get_game_state')
  const plan = await preview(call, command)
  assert.ok(plan.goalReached)
  assert.ok(plan.transport.targetPath.every(point => !same(point, cell(3, 3))))
  const directions = plan.transport.targetPath.slice(1).map((point, index) => {
    const previous = plan.transport.targetPath[index]
    return `${point.x - previous.x},${point.y - previous.y}`
  })
  assert.ok(new Set(directions).size > 1, 'The held body really changes direction around the obstacle')
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('move_grappled_creature', command))
  const after = await call('get_game_state')
  assert.deepEqual(after.player.position, command.toCell); assert.deepEqual(after.monsters[target.id].position, command.targetToCell)
})

test('release or an orphaned grapple marker never creates a new transport hold', async t => {
  const { call, target, cell, effectId } = await fixture(t)
  ok(await call('combat_action', { action: 'release_grapple', effectId }))
  const command = input(target, cell(4, 2), cell(4, 3)), released = await call('get_game_state')
  assert.equal((await call('move_grappled_creature', command)).code, 'GRAPPLE_EFFECT_REQUIRED')
  assert.deepEqual(await call('get_game_state'), released)
  await replace(call, state => state.monsters[target.id].conditions.push('grappled'))
  const orphaned = await call('get_game_state')
  assert.equal((await call('preview_grapple_transport', command)).code, 'GRAPPLE_EFFECT_REQUIRED')
  assert.deepEqual(await call('get_game_state'), orphaned)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('forced victim movement never provokes an opportunity attack from an enemy adjacent only to that victim', async t => {
  const { call, target, witness, cell } = await fixture(t, { friendlyObserver: true })
  const moved = ok(await call('move_grappled_creature', input(target, cell(4, 2), cell(4, 3))))
  assert.equal(moved.pendingReaction, undefined)
  const after = await call('get_game_state')
  assert.equal(after.hero.pending, undefined)
  assert.equal(after.hero.reactionsUsed[witness.id] ?? false, false)
  assert.deepEqual(after.monsters[target.id].position, cell(4, 3))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('an explicit OA choice and Bardic held attack persist the exact paired continuation without rerolling or paying movement twice', async t => {
  const { call, target, witness, cell } = await fixture(t, { characterId: 'bard', observer: true,
    inspireObserver: true, dice: '20,1,5,1,19' })
  const command = input(target, cell(4, 2), cell(4, 3)), before = await call('get_game_state')
  const moving = ok(await call('move_grappled_creature', command))
  assert.equal(moving.stopReason, 'reaction_decision')
  assert.equal(moving.pendingReaction.sourceId, witness.id)
  assert.deepEqual(moving.pendingReaction.command.transport, { targetId: target.id, targetToCell: command.targetToCell })
  const paused = await call('get_game_state')
  assert.deepEqual(paused.player.position, before.player.position)
  assert.deepEqual(paused.monsters[target.id].position, before.monsters[target.id].position)
  ok(await call('replace_game_state', { gameState: paused }))
  assert.deepEqual(await call('get_game_state'), paused)
  assert.equal((await call('move_grappled_creature', command)).code, 'REACTION_PENDING')
  assert.deepEqual(await call('get_game_state'), paused)
  const attack = ok(await call('resolve_reaction', { pendingId: moving.pendingReaction.id, choice: 'opportunity_attack', weaponOrSpell: 'Scimitar' }))
  assert.ok(attack.pendingReaction.options.includes('bardic_inspiration'))
  assert.equal(attack.pendingReaction.roll.rolls[0], 5)
  assert.deepEqual(attack.pendingReaction.continuation.transport, { targetId: target.id, targetToCell: command.targetToCell })
  const held = await call('get_game_state')
  ok(await call('replace_game_state', { gameState: held }))
  assert.deepEqual(await call('get_game_state'), held)
  const resumed = ok(await call('resolve_reaction', { pendingId: attack.pendingReaction.id, choice: 'bardic_inspiration' }))
  assert.equal(resumed.attack.attackRoll.rolls[0], 5, 'The original opportunity d20 is held, never rerolled')
  assert.equal(resumed.attack.attackRoll.total, 10, 'Goblin Scimitar +4 and exactly one Bardic +1')
  const after = await call('get_game_state')
  assert.deepEqual(after.player.position, command.toCell); assert.deepEqual(after.monsters[target.id].position, command.targetToCell)
  assert.equal(after.hero.pending, undefined)
  assert.equal(after.hero.reactionsUsed[witness.id], true)
  assert.equal(after.hero.inspiration.some(die => die.targetId === witness.id), false)
  assert.equal(after.movementUsed.player, 2)
  assert.deepEqual(after.actionUsed, before.actionUsed)
  assert.deepEqual(after.bonusActionUsed, before.bonusActionUsed)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

async function frogBite(t) {
  // Reuse the reviewed clear-room setup, then release its genuine player hold.
  // The following opposite hold comes exclusively from the sourced Bite action.
  const setup = await fixture(t, { targetType: 'giant_frog', dice: '20,1,19,1,17' })
  const { call, target: frog, effectId } = setup
  ok(await call('combat_action', { action: 'release_grapple', effectId }))
  await battle(call, [frog.id], frog.id)
  const source = getMonsterRecord('giant_frog').source
  assert.ok(source.special_abilities.some(trait => trait.name === 'Amphibious'))
  assert.ok(source.actions.find(action => action.name === 'Bite').desc.includes('grappled'))
  ok(await call('resolve_monster_action', { monsterId: frog.id, actionName: 'Bite', targetId: 'player' }))
  const after = await call('get_game_state')
  const grapple = after.monsterEffects.find(effect => effect.kind === 'grapple' && effect.sourceId === frog.id && effect.targetId === 'player')
  assert.ok(grapple, 'The actual Giant Frog Bite must create the source monster hold')
  assert.ok(after.player.conditions.includes('grappled')); assert.ok(after.player.conditions.includes('restrained'))
  return { ...setup, frog, monsterEffectId: grapple.id }
}

test('a real Giant Frog Bite retains and transports its unconscious but living player victim, including state roundtrip', async t => {
  const { call, frog, cell, monsterEffectId } = await frogBite(t)
  const bitten = await call('get_game_state')
  ok(await call('update_hp', { entityId: 'player', delta: -bitten.player.hp.current,
    reason: 'Événement environnemental explicitement établi : perte des PV restants, sans dommage excédentaire.',
    damageType: 'bludgeoning', damageOrigin: 'environment' }))
  const unconscious = await call('get_game_state')
  assert.equal(unconscious.player.hp.current, 0)
  assert.equal(Boolean(unconscious.player.deathSaves?.dead), false)
  assert.ok(unconscious.player.conditions.includes('unconscious'))
  assert.ok(unconscious.player.conditions.includes('grappled'))
  assert.ok(unconscious.monsterEffects.some(effect => effect.id === monsterEffectId), 'Victim unconsciousness must not release a conscious frog source')
  assert.equal((await call('travel_to_map', { toMapId: 'waterdeep' })).code, 'GRAPPLE_MAP_TRAVEL_UNSUPPORTED')
  assert.deepEqual(await call('get_game_state'), unconscious)
  const command = { actorId: frog.id, targetId: 'player', toCell: cell(4, 3), targetToCell: cell(4, 2), allowPartial: false }
  const plan = await preview(call, command)
  assert.equal(plan.transport.actorSize, 'Medium'); assert.equal(plan.transport.targetSize, 'Medium')
  assert.equal(plan.transport.speedDivisor, 2)
  ok(await call('move_grappled_creature', command))
  const carried = await call('get_game_state')
  assert.deepEqual(carried.monsters[frog.id].position, command.toCell)
  assert.deepEqual(carried.player.position, command.targetToCell)
  assert.equal(carried.player.hp.current, 0)
  assert.equal(Boolean(carried.player.deathSaves?.dead), false)
  assert.ok(carried.monsterEffects.some(effect => effect.id === monsterEffectId))
  assert.equal(carried.movementUsed[frog.id], 2)
  assert.equal(carried.movementUsed.player ?? 0, 0)
  ok(await call('replace_game_state', { gameState: carried }))
  assert.deepEqual(await call('get_game_state'), carried)
  assert.equal((await call('combat_action', { actorId: 'player', action: 'release_grapple', effectId: monsterEffectId })).code, 'GRAPPLE_EFFECT_REQUIRED')
  assert.deepEqual(await call('get_game_state'), carried, 'An actor who does not hold this source effect cannot release it or mutate the victim')
  const released = ok(await call('combat_action', { actorId: frog.id, action: 'release_grapple', effectId: monsterEffectId }))
  assert.equal(released.actorId, frog.id)
  assert.equal(released.effectId, monsterEffectId)
  const free = await call('get_game_state')
  assert.ok(!free.monsterEffects.some(effect => effect.id === monsterEffectId))
  assert.ok(!free.player.conditions.includes('grappled'))
  assert.ok(!free.player.conditions.includes('restrained'))
  assert.ok(free.player.conditions.includes('unconscious'))
  assert.deepEqual(free.player.hp, carried.player.hp, 'Voluntary release never heals a zero-HP victim')
  assert.deepEqual(free.player.deathSaves, carried.player.deathSaves)
  assert.equal(Boolean(free.player.deathSaves?.dead), false)
  assert.deepEqual(free.player.position, carried.player.position)
  assert.deepEqual(free.monsters[frog.id].position, carried.monsters[frog.id].position)
  for (const field of ['actionUsed', 'bonusActionUsed', 'movementUsed', 'diagonalMovementUsed', 'worldTimeSeconds', 'round', 'currentTurn'])
    assert.deepEqual(free[field], carried[field], `Release must not change ${field}`)
  assert.equal(free.hero.actionCredits, carried.hero.actionCredits)
  ok(await call('replace_game_state', { gameState: free }))
  assert.deepEqual(await call('get_game_state'), free)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('map travel refuses a real player hold, and a restored expired monster hold never permits transport or consumes dice', async t => {
  const held = await fixture(t), beforeTravel = await held.call('get_game_state')
  assert.equal((await held.call('travel_to_map', { toMapId: 'waterdeep' })).code, 'GRAPPLE_MAP_TRAVEL_UNSUPPORTED')
  assert.deepEqual(await held.call('get_game_state'), beforeTravel)
  assert.equal(ok(await held.call('roll_dice', { notation: '1d20' })).total, 19)

  const { call, frog, cell, monsterEffectId } = await frogBite(t)
  await replace(call, state => {
    state.worldTimeSeconds = 60
    state.monsterEffects.find(effect => effect.id === monsterEffectId).expiresAt = 59
  })
  const expired = await call('get_game_state')
  assert.ok(expired.monsterEffects.some(effect => effect.id === monsterEffectId && effect.expiresAt < expired.worldTimeSeconds))
  const command = { actorId: frog.id, targetId: 'player', toCell: cell(4, 3), targetToCell: cell(4, 2), allowPartial: false }
  for (const tool of ['preview_grapple_transport', 'move_grappled_creature']) {
    assert.equal((await call(tool, command)).code, 'GRAPPLE_EFFECT_REQUIRED')
    assert.deepEqual(await call('get_game_state'), expired, 'An expired record and lingering condition marker are never upgraded into a fresh hold')
  }
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})
