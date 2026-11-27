const test = require('node:test'), assert = require('node:assert/strict')
const { engine, ok, replace, battle, adjacent } = require('./helpers/mcp-toolkit.cjs')
const { movementStepCostBreakdown, actorMovementStepCost, movementSpeedProfile,
  standingMovementCostCells, assertStandingMovement } = require('../mcp-server/dist/lib/movement-modes.js')

function fixture() {
  return { player: { id: 'player', characterId: 'wizard', speed: 30, stats: { str: 8 }, hp: { current: 10 },
    conditions: ['prone'], inventory: [] }, monsters: {}, movementUsed: {}, worldTimeSeconds: 0,
    dmTools: { loadout: { unarmoredAC: 10 } }, hero: { effects: [] } }
}
const dash = { id: 'dash-source', kind: 'dash', sourceId: 'player', targetIds: ['player'], expiresAt: 100, data: {} }
const exhaust = (state, level) => {
  state.player.conditions.push('exhaustion')
  state.dmTools.exhaustion = { creatures: { player: { level } }, receipts: {} }
}

test('crawl and difficult costs add to each resolved cardinal or 5/10 diagonal distance', () => {
  assert.deepEqual(movementStepCostBreakdown(1, { difficult: true, crawling: true }),
    { distanceCells: 1, difficultExtraCells: 1, crawlingExtraCells: 1, totalCells: 3 })
  assert.equal(movementStepCostBreakdown(2, { difficult: true, crawling: true }).totalCells, 6)
  assert.equal(movementStepCostBreakdown(2, { crawling: true }).totalCells, 4)
  assert.equal(movementStepCostBreakdown(2, { difficult: true }).totalCells, 4)
  assert.equal(movementStepCostBreakdown(2).totalCells, 2)
})

test('forced grapple transport ignores victim posture cost but preserves real difficult terrain', () => {
  const state = fixture(), before = structuredClone(state)
  assert.equal(actorMovementStepCost(state, 'player', 1, true).totalCells, 3)
  assert.equal(actorMovementStepCost(state, 'player', 1, true, { ignoreActorEffects: true }).totalCells, 2)
  assert.deepEqual(state, before)
  assert.throws(() => movementStepCostBreakdown(-1), { code: 'MOVEMENT_DISTANCE_INVALID' })
})

test('standing uses armor and exhaustion adjusted speed before Dash, with unchanged whole-cell policy', () => {
  const state = fixture()
  state.player.inventory.push({ id: 'real-plate', equipmentId: 'plate', type: 'armor' })
  state.dmTools.loadout.armorId = 'real-plate'
  exhaust(state, 2)
  state.hero.effects.push(dash)
  const before = structuredClone(state)
  assert.deepEqual(movementSpeedProfile(state, 'player'), { speedFeet: 10, budgetFeet: 20, dashActive: true })
  assert.equal(assertStandingMovement(state, 'player').costCells, 1)
  assert.equal(standingMovementCostCells(15), 2)
  assert.deepEqual(state, before)
})

test('expiry, trap, grapple and legacy exhaustion do not invent remaining speed', () => {
  const state = fixture()
  state.hero.effects.push({ ...dash, expiresAt: 0 })
  assert.equal(movementSpeedProfile(state, 'player').budgetFeet, 30)
  state.player.conditions.push('grappled')
  assert.throws(() => assertStandingMovement(state, 'player'), { code: 'SPEED_ZERO' })
  state.player.conditions = ['prone']
  state.hero.effects.push({ ...dash, id: 'trap-source', kind: 'tracked-trap', data: { speedZero: true } })
  assert.throws(() => assertStandingMovement(state, 'player'), { code: 'SPEED_ZERO' })
  state.player.conditions.push('exhaustion')
  assert.throws(() => movementSpeedProfile(state, 'player'), { code: 'EXHAUSTION_LEVEL_REQUIRED' })
})

test('actual prone movement debits crawl cost without removing the posture or spending an action', async t => {
  const call = await engine(t), initial = await call('get_game_state')
  const toCell = adjacent(initial).find(cell => cell.x === initial.player.position.x || cell.y === initial.player.position.y)
  assert.ok(toCell, 'fixture requires a free cardinal neighbor')
  await battle(call, [])
  await replace(call, state => state.player.conditions.push('prone'))
  ok(await call('move_token', { tokenId: 'player', toCell }))
  const after = await call('get_game_state')
  assert.deepEqual(after.player.position, toCell)
  assert.equal(after.movementUsed.player, 2)
  assert.ok(after.player.conditions.includes('prone'))
  assert.equal(after.actionUsed.player ?? false, false)
})

test('actual Dash increases the remaining allowance without doubling standing cost', async t => {
  const call = await engine(t)
  await battle(call, [])
  ok(await call('combat_action', { actorId: 'player', action: 'dash' }))
  await replace(call, state => { state.player.conditions.push('prone'); state.movementUsed.player = 7 })
  const result = ok(await call('combat_action', { actorId: 'player', action: 'stand_up' }))
  const after = await call('get_game_state')
  assert.equal(result.costCells, 3)
  assert.equal(after.movementUsed.player, 10)
  assert.equal(after.player.conditions.includes('prone'), false)
  assert.equal(after.actionUsed.player, true, 'only the previously requested Dash used the action')
})

test('actual level-two exhaustion halves standing price with the same coarse grid rounding', async t => {
  const call = await engine(t)
  await battle(call, [])
  await replace(call, state => { state.player.conditions.push('prone'); exhaust(state, 2); state.movementUsed.player = 1 })
  const result = ok(await call('combat_action', { actorId: 'player', action: 'stand_up' }))
  const after = await call('get_game_state')
  assert.equal(result.costCells, 2)
  assert.equal(after.movementUsed.player, 3)
  assert.equal(after.player.conditions.includes('prone'), false)
  assert.equal(after.actionUsed.player ?? false, false)
})

test('insufficient remaining movement refuses standing before movement or posture mutation', async t => {
  const call = await engine(t)
  await battle(call, [])
  await replace(call, state => { state.player.conditions.push('prone'); exhaust(state, 2); state.movementUsed.player = 2 })
  const before = await call('get_game_state')
  assert.equal((await call('combat_action', { actorId: 'player', action: 'stand_up' })).code, 'MOVEMENT_EXCEEDED')
  assert.deepEqual(await call('get_game_state'), before)
})

test('actual level-five exhaustion refuses standing at zero speed without any debit', async t => {
  const call = await engine(t)
  await battle(call, [])
  await replace(call, state => {
    state.player.conditions.push('prone'); exhaust(state, 5)
    const record = state.dmTools.exhaustion.creatures.player
    record.unexhaustedHpMax = state.player.hp.max
    state.player.hp.max = Math.floor(record.unexhaustedHpMax / 2)
    state.player.hp.current = Math.min(state.player.hp.current, state.player.hp.max)
  })
  const before = await call('get_game_state')
  assert.equal((await call('combat_action', { actorId: 'player', action: 'stand_up' })).code, 'SPEED_ZERO')
  assert.deepEqual(await call('get_game_state'), before)
})
