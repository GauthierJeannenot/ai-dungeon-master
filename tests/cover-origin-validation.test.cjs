const test = require('node:test')
const assert = require('node:assert/strict')
const { engine, ok, spawn } = require('./helpers/mcp-toolkit.cjs')
const { getMapSpec } = require('../mcp-server/dist/lib/adventure-map.js')

async function unchangedRefusal(call, source, code) {
  const before = await call('get_game_state')
  const result = await call('resolve_saving_throw', { entityId: 'player', ability: 'dex', dc: 30, ...source })
  assert.equal(result.code, code, JSON.stringify(result))
  assert.deepEqual(await call('get_game_state'), before)
}
const cover = (call, enemy, degree = 'half', point = false) => call('configure_cover', {
  coverId: 'actual-parapet', operation: 'set',
  ...(point ? { originCell: enemy.position } : { originId: enemy.id }), targetId: 'player',
  obstacleCell: enemy.targetCell, degree,
  reason: 'Le parapet déjà établi occupe la cellule de la cible et la protège de cette source précise.',
})

test('explicit unknown and off-map DEX origins refuse before dice even without a cover declaration', async t => {
  const call = await engine(t, { dice: '19' }), state = await call('get_game_state')
  const map = getMapSpec(state.currentMapId, state)
  await unchangedRefusal(call, { originId: 'nonexistent-save-source' }, 'ENTITY_NOT_FOUND')
  await unchangedRefusal(call, { originCell: { x: map.grid.cols, y: 0 } }, 'INVALID_GRID_CELL')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('invalid explicit sources cannot evade active directional cover; valid actor and point sources stay distinct', async t => {
  const call = await engine(t, { dice: '10,10,10,19' }), enemy = await spawn(call)
  const initial = await call('get_game_state'), map = getMapSpec(initial.currentMapId, initial)
  const base = ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'dex', dc: 30 }))
  const origin = { id: enemy.id, position: initial.monsters[enemy.id].position, targetCell: initial.player.position }
  ok(await cover(call, origin))
  await unchangedRefusal(call, {}, 'COVER_ORIGIN_REQUIRED')
  await unchangedRefusal(call, { originId: 'nonexistent-save-source' }, 'ENTITY_NOT_FOUND')
  await unchangedRefusal(call, { originCell: { x: map.grid.cols, y: 0 } }, 'INVALID_GRID_CELL')
  const actor = ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'dex', dc: 30, originId: enemy.id }))
  const point = ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'dex', dc: 30, originCell: origin.position }))
  assert.equal(actor.roll.total, base.roll.total + 2)
  assert.equal(point.roll.total, base.roll.total, 'A point does not inherit the actor declaration at the same coordinates.')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('real point origins still receive their own declared Dexterity cover bonus', async t => {
  const call = await engine(t, { dice: '10,10,19' }), enemy = await spawn(call)
  const state = await call('get_game_state')
  const origin = { id: enemy.id, position: state.monsters[enemy.id].position, targetCell: state.player.position }
  const base = ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'dex', dc: 30, originCell: origin.position }))
  ok(await cover(call, origin, 'three_quarters', true))
  const covered = ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'dex', dc: 30, originCell: origin.position }))
  assert.equal(covered.roll.total, base.roll.total + 5)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
