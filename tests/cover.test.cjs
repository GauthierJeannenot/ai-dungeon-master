const test = require('node:test')
const assert = require('node:assert/strict')
const { engine, ok, replace, spawn, battle, grid } = require('./helpers/mcp-toolkit.cjs')
const { getMapSpec, inferRoomIdOnMap } = require('../mcp-server/dist/lib/adventure-map.js')

async function fixture(t, options = {}) {
  const call = await engine(t, options), initial = await call('get_game_state')
  const nav = grid(initial), map = getMapSpec(initial.currentMapId, initial)
  let cells
  for (let y = 0; y < map.grid.rows && !cells; y++) for (let x = 0; x < map.grid.cols - 4 && !cells; x++) {
    const line = Array.from({ length: 5 }, (_, offset) => ({ x: x + offset, y }))
    if (line.every(cell => nav.free(cell, false) && inferRoomIdOnMap(cell, initial.currentMapId, initial) === initial.currentRoomId)) cells = line
  }
  assert.ok(cells, 'fixture needs five clear cells in the actual current room')
  const enemy = await spawn(call)
  await replace(call, state => {
    state.player.position = cells[0]
    state.monsters[enemy.id].position = cells[4]
  })
  return { call, enemy, cells }
}
const setCover = (call, coverId, origin, targetId, obstacleCell, degree = 'half') => call('configure_cover', {
  coverId, operation: 'set', ...(typeof origin === 'string' ? { originId: origin } : { originCell: origin }),
  targetId, obstacleCell, degree, reason: 'Le MJ a établi cet obstacle physique entre cette origine précise et cette cible.',
})

test('directional source declarations persist, inspect purely, select highest degree and never stack', async t => {
  const { call, enemy, cells } = await fixture(t, { dice: '19' })
  ok(await setCover(call, 'low-wall', enemy.id, 'player', cells[2]))
  ok(await setCover(call, 'thick-trunk', enemy.id, 'player', cells[1], 'three_quarters'))
  const before = await call('get_game_state')
  const inspected = ok(await call('inspect_cover', { originId: enemy.id, targetId: 'player' }))
  assert.equal(inspected.degree, 'three_quarters')
  assert.equal(inspected.acBonus, 5); assert.equal(inspected.dexSaveBonus, 5)
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('replace_game_state', { gameState: before }))
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('inspect_cover', { originId: 'player', targetId: enemy.id })).degree, 'none')
  assert.equal(ok(await call('inspect_cover', { originCell: cells[4], targetId: 'player' })).degree, 'none',
    'A point origin never borrows a declaration bound to an actor ID')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('moving an anchor removes its bonus; invalid source direction and ambiguous selectors refuse without mutation', async t => {
  const { call, enemy, cells } = await fixture(t)
  ok(await setCover(call, 'anchored', enemy.id, 'player', cells[2]))
  await replace(call, state => { state.monsters[enemy.id].position = cells[3] })
  assert.equal(ok(await call('inspect_cover', { originId: enemy.id, targetId: 'player' })).degree, 'none')
  const before = await call('get_game_state')
  assert.equal((await setCover(call, 'wrong-side', cells[3], enemy.id, cells[1])).code, 'COVER_OBSTACLE_NOT_BETWEEN')
  assert.equal((await call('inspect_cover', { originId: enemy.id, originCell: cells[3], targetId: 'player' })).code, 'COVER_SELECTION_INVALID')
  assert.deepEqual(await call('get_game_state'), before)
})

test('actual monster weapon attacks compare against directional covered AC', async t => {
  const { call, enemy, cells } = await fixture(t, { dice: '15,19' })
  ok(await setCover(call, 'weapon-wall', enemy.id, 'player', cells[2]))
  await battle(call, [enemy.id], enemy.id)
  const before = await call('get_game_state')
  assert.equal(before.player.ac, 18)
  const attack = ok(await call('resolve_attack', { attackerId: enemy.id, targetId: 'player', weaponOrSpell: 'Shortbow' }))
  assert.equal(attack.attackRoll.total, 19, 'Goblin Shortbow +4 with a natural 15')
  assert.equal(attack.hit, false, '19 beats base AC18 but misses half-cover AC20')
  assert.equal((await call('get_game_state')).player.hp.current, before.player.hp.current)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('actual spell attacks use covered AC and do not roll damage on a cover-induced miss', async t => {
  const { call, enemy, cells } = await fixture(t, { characterId: 'wizard', dice: '9,19' })
  ok(await setCover(call, 'spell-wall', 'player', enemy.id, cells[2]))
  await battle(call, [enemy.id])
  const attack = ok(await call('cast_spell', { spellId: 'ray-of-frost', targetId: enemy.id }))
  assert.equal(attack.roll.total, 16)
  assert.equal(attack.hit, false, '16 beats goblin AC15 but misses half-cover AC17')
  assert.equal(attack.damageDealt, 0)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('real saves gain only +2/+5 DEX, never STR/CON or an unrelated source; origin is required only for relevant cover', async t => {
  const { call, enemy, cells } = await fixture(t, { dice: '10,10,10,10,10,10,10,19' })
  const plain = ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'dex', dc: 30 }))
  ok(await setCover(call, 'save-half', enemy.id, 'player', cells[2]))
  const half = ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'dex', dc: 30, originId: enemy.id }))
  assert.equal(half.roll.total - plain.roll.total, 2)
  ok(await setCover(call, 'save-three', enemy.id, 'player', cells[1], 'three_quarters'))
  const three = ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'dex', dc: 30, originId: enemy.id }))
  assert.equal(three.roll.total - plain.roll.total, 5, 'Cover sources select the maximum, not 2+5')
  const other = ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'dex', dc: 30, originCell: cells[3] }))
  assert.equal(other.roll.total, plain.roll.total)
  const before = await call('get_game_state')
  assert.equal((await call('resolve_saving_throw', { entityId: 'player', ability: 'dex', dc: 30 })).code, 'COVER_ORIGIN_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
  for (const ability of ['str', 'con']) {
    const save = ok(await call('resolve_saving_throw', { entityId: 'player', ability, dc: 30, originId: enemy.id }))
    const native = Math.floor((before.player.stats[ability] - 10) / 2) + before.player.proficiencyBonus
    assert.equal(save.roll.total, 10 + native)
  }
  assert.equal(ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'str', dc: 30 })).roll.rolls[0], 10)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('total cover refuses direct weapon and spell targeting before actions, slots, reactions or dice', async t => {
  const { call, enemy, cells } = await fixture(t, { characterId: 'wizard', dice: '19' })
  ok(await setCover(call, 'total-player', enemy.id, 'player', cells[2], 'total'))
  ok(await setCover(call, 'total-enemy', 'player', enemy.id, cells[2], 'total'))
  await battle(call, [enemy.id], enemy.id)
  const beforeAttack = await call('get_game_state')
  assert.equal((await call('resolve_attack', { attackerId: enemy.id, targetId: 'player', weaponOrSpell: 'Shortbow' })).code, 'COVER_TOTAL')
  assert.deepEqual(await call('get_game_state'), beforeAttack)
  await battle(call, [enemy.id])
  const beforeSpell = await call('get_game_state')
  assert.equal((await call('cast_spell', { spellId: 'magic-missile', targetId: enemy.id, slotLevel: 1 })).code, 'COVER_TOTAL')
  assert.deepEqual(await call('get_game_state'), beforeSpell)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('Sacred Flame uses its explicit source exception for numerical cover bonuses', async t => {
  const { call, enemy, cells } = await fixture(t, { characterId: 'cleric', dice: '4,4,10' })
  ok(await call('equip_item', { itemId: 'mace', operation: 'unequip', slot: 'main_hand' }))
  ok(await setCover(call, 'flame-cover', 'player', enemy.id, cells[2], 'three_quarters'))
  await battle(call, [enemy.id])
  const cast = ok(await call('cast_spell', { spellId: 'sacred-flame', targetId: enemy.id }))
  assert.equal(cast.roll.total, 12, 'Goblin DEX +2; Sacred Flame denies the +5 cover save benefit')
})

test('spheres use their actual point origin and exclude a body behind declared total cover', async t => {
  const { call, enemy, cells } = await fixture(t, { characterId: 'wizard', dice: '1,1,1,20,19' })
  // Shatter originates two cells from the target, rather than at the caster.
  ok(await setCover(call, 'area-total', cells[2], enemy.id, cells[3], 'total'))
  await battle(call, [enemy.id])
  const before = await call('get_game_state')
  const cast=ok(await call('cast_spell', { spellId: 'shatter', focusItemId: 'component_pouch', toCell: cells[2], slotLevel: 2 }))
  assert.equal(cast.targets.includes(enemy.id),false)
  const after=await call('get_game_state');assert.equal(after.monsters[enemy.id].hp.current,before.monsters[enemy.id].hp.current)
  assert.equal(after.player.spellSlots.level2.current,before.player.spellSlots.level2.current-1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('an actual Fireball DEX save uses its declared center, without borrowing caster-side cover', async t => {
  const { call, enemy, cells } = await fixture(t, { characterId: 'wizard', dice: '1,1,1,1,1,1,1,1,1,11' })
  ok(await setCover(call, 'caster-side', 'player', enemy.id, cells[1], 'three_quarters'))
  ok(await setCover(call, 'blast-side', cells[2], enemy.id, cells[3], 'half'))
  await battle(call, [enemy.id])
  const cast = ok(await call('cast_spell', { spellId: 'fireball', focusItemId: 'component_pouch', toCell: cells[2], slotLevel: 3 }))
  const target = cast.results.find(item => item.targetId === enemy.id)
  assert.equal(target.roll.total, 15, 'Natural 11 + goblin DEX2 + center-specific cover2, not caster-side cover5')
  assert.equal(target.saved, true)
  assert.equal(target.damageDealt, 4)
})

test('spiritual weapon targets from its own cell and refuses before movement or bonus-action cost', async t => {
  const { call, enemy, cells } = await fixture(t, { characterId: 'cleric', dice: '19' })
  ok(await call('equip_item', { itemId: 'mace', operation: 'unequip', slot: 'main_hand' }))
  const cast = ok(await call('cast_spell', { spellId: 'spiritual-weapon', toCell: cells[1], slotLevel: 2 }))
  const effect = cast.results.find(item => item.kind === 'spiritual-weapon')
  assert.ok(effect)
  ok(await setCover(call, 'weapon-total', cells[3], enemy.id, cells[4], 'total'))
  await battle(call, [enemy.id])
  const before = await call('get_game_state')
  assert.equal((await call('use_subclass_feature', { featureId: 'spiritual_weapon', effectId: effect.id, toCell: cells[3], targetId: enemy.id })).code, 'COVER_TOTAL')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
