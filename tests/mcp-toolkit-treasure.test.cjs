const test = require('node:test')
const assert = require('node:assert/strict')
const { engine: baseEngine, ok, replace, object, adjacent, spawn, battle } = require('./helpers/mcp-toolkit.cjs')
async function engine(t, options) {
  const call=await baseEngine(t,options)
  await replace(call,state=>{state.dmTools??={version:1,objects:{},traps:{},npcs:{},itemUses:{}};state.dmTools.wallet={cp:0,sp:0,ep:0,gp:0,pp:0}})
  return call
}

async function treasure(call, treasureId = 'test-coins', overrides = {}) {
  const state = await call('get_game_state')
  return ok(await call('create_treasure', { treasureId, name: 'Bourse', description: 'Une bourse de pièces ordinaires.',
    cell: state.player.position, mode: 'authored', coins: { gp: 10 }, ...overrides }))
}

for (const fixture of [
  { band: '0-4', dice: '71,2,3,4,19', coins: { cp: 0, sp: 0, ep: 0, gp: 9, pp: 0 } },
  { band: '5-10', dice: '1,1,2,3,4,5,19', coins: { cp: 1000, sp: 0, ep: 50, gp: 0, pp: 0 } },
  { band: '11-16', dice: '76,1,2,3,4,19', coins: { cp: 0, sp: 0, ep: 0, gp: 300, pp: 70 } },
  { band: '17+', dice: '100,2,3,4,19', coins: { cp: 0, sp: 0, ep: 0, gp: 2000, pp: 700 } },
]) test(`DMG individual treasure ${fixture.band}: exact source coin dice/multipliers, no grant/reroll`, async t => {
  const call = await engine(t, { dice: fixture.dice })
  const input = { treasureId: 'rolled-purse', name: 'Butin', description: 'Des pièces à découvrir.', cell: (await call('get_game_state')).player.position,
    mode: 'individual', challengeBand: fixture.band }
  const created = ok(await call('create_treasure', input))
  assert.deepEqual(created.treasure.coins, fixture.coins)
  assert.equal(created.treasure.source.origin, 'transcription')
  assert.match(created.treasure.source.sha256, /^[a-f0-9]{64}$/)
  assert.deepEqual((await call('get_game_state')).dmTools.wallet, {cp:0,sp:0,ep:0,gp:0,pp:0})
  assert.equal(ok(await call('create_treasure', input)).alreadyCreated, true)
  ok(await call('collect_treasure', { treasureId: input.treasureId }))
  const state = await call('get_game_state')
  ok(await call('replace_game_state', { gameState: state }))
  assert.deepEqual((await call('get_game_state')).dmTools, state.dmTools)
  assert.equal(ok(await call('create_treasure', input)).treasure.collected, true)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('the d100 00 endpoint of the lowest treasure band yields platinum, not copper', async t => {
  const call = await engine(t, { dice: '100,6,19' })
  const answer = await treasure(call, 'endpoint', { mode: 'individual', coins: undefined, challengeBand: '0-4' })
  assert.deepEqual(answer.treasure.coins, { cp: 0, sp: 0, ep: 0, gp: 0, pp: 6 })
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('conflicting treasure definitions, source selection and container placement fail before dice or mutation', async t => {
  const call = await engine(t, { dice: '19' })
  await treasure(call)
  const before = await call('get_game_state')
  const common = { treasureId: 'other', name: 'Butin', description: 'Une bourse.', cell: before.player.position, mode: 'individual' }
  assert.equal((await call('create_treasure', common)).code, 'TREASURE_SELECTION_INVALID')
  assert.equal((await call('create_treasure', { ...common, challengeBand: '0-4', coins: { gp: 1 } })).code, 'TREASURE_SELECTION_INVALID')
  assert.equal((await call('create_treasure', { ...common, mode: 'authored', coins: {} })).code, 'EMPTY_TREASURE')
  assert.equal((await call('create_treasure', { ...common, mode: 'authored', coins: { gp: 1 }, containerId: 'missing' })).code, 'TREASURE_CONTAINER_INVALID')
  assert.equal((await call('create_treasure', { ...common, treasureId: 'test-coins', mode: 'authored', coins: { gp: 20 } })).code, 'TREASURE_ID_CONFLICT')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('closed container and remote/wrong-map treasure cannot be collected; collection stays one-time after hydration', async t => {
  const call = await engine(t)
  await object(call, 'coin-chest')
  await treasure(call, 'chest-coins', { containerId: 'coin-chest' })
  const before = await call('get_game_state')
  assert.equal((await call('collect_treasure', { treasureId: 'chest-coins' })).code, 'TREASURE_CONTAINER_CLOSED')
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('interact_object', { objectId: 'coin-chest', action: 'open' }))
  await replace(call, state => { state.dmTools.treasures['chest-coins'].mapId = 'other-map' })
  assert.equal((await call('collect_treasure', { treasureId: 'chest-coins' })).code, 'SCENE_TARGET_OUT_OF_REACH')
  await replace(call, state => { state.dmTools.treasures['chest-coins'].mapId = state.currentMapId })
  const answer = ok(await call('collect_treasure', { treasureId: 'chest-coins' }))
  assert.equal(answer.wallet.gp, 10)
  assert.equal(answer.coinWeightLb, 0.2)
  const collected = await call('get_game_state')
  ok(await call('replace_game_state', { gameState: collected }))
  assert.equal(ok(await call('collect_treasure', { treasureId: 'chest-coins' })).alreadyCollected, true)
  assert.deepEqual(await call('get_game_state'), collected)
})

test('collection in combat uses first free object interaction then one action; no off-turn collection', async t => {
  const call = await engine(t)
  await treasure(call, 'first')
  await treasure(call, 'second')
  await treasure(call, 'third')
  const enemy = await spawn(call)
  await battle(call, [enemy.id])
  ok(await call('collect_treasure', { treasureId: 'first' }))
  assert.equal((await call('get_game_state')).hero.actionCredits, 1)
  ok(await call('collect_treasure', { treasureId: 'second' }))
  assert.equal((await call('get_game_state')).hero.actionCredits, 0)
  const before = await call('get_game_state')
  assert.equal((await call('collect_treasure', { treasureId: 'third' })).code, 'ACTION_ALREADY_USED')
  assert.deepEqual(await call('get_game_state'), before)
  await replace(call, state => { state.currentTurn = enemy.id })
  assert.equal((await call('collect_treasure', { treasureId: 'third' })).code, 'NOT_CURRENT_TURN')
})

test('wallet uses exact denominations, value-preserving exchanges and persisted unique payment receipts', async t => {
  const call = await engine(t)
  await treasure(call)
  ok(await call('collect_treasure', { treasureId: 'test-coins' }))
  const initial = await call('get_game_state')
  assert.equal((await call('spend_currency', { transactionId: 'cannot-change', paid: { sp: 1 }, reason: 'Une dépense établie.' })).code, 'INSUFFICIENT_COINS')
  assert.equal((await call('exchange_currency', { transactionId: 'bad', paid: { gp: 1 }, received: { sp: 11 }, reason: 'Change établi.' })).code, 'CURRENCY_VALUE_MISMATCH')
  assert.deepEqual(await call('get_game_state'), initial)
  const exchange = { transactionId: 'change', paid: { gp: 2 }, received: { ep: 1, sp: 15 }, reason: 'Change accepté au comptoir.' }
  assert.deepEqual(ok(await call('exchange_currency', exchange)).wallet, { cp: 0, sp: 15, ep: 1, gp: 8, pp: 0 })
  const payment = { transactionId: 'room-fee', paid: { sp: 5 }, reason: 'Paiement de la chambre convenue.' }
  const paid = ok(await call('spend_currency', payment))
  assert.equal(paid.wallet.sp, 10)
  const state = await call('get_game_state')
  ok(await call('replace_game_state', { gameState: state }))
  assert.equal(ok(await call('spend_currency', payment)).alreadyProcessed, true)
  const replay = ok(await call('exchange_currency', exchange))
  assert.equal(replay.alreadyProcessed, true)
  assert.equal(replay.wallet.sp, 10, 'replay reports current wallet, never restores the historical one')
  assert.equal((await call('spend_currency', { ...payment, paid: { gp: 1 } })).code, 'CURRENCY_TRANSACTION_CONFLICT')
  assert.deepEqual(await call('get_game_state'), state)
  assert.deepEqual(state.player.inventory, initial.player.inventory, 'payment creates no purchased item')
})

test('currency cannot overflow wallet or process while incapacitated', async t => {
  const call = await engine(t)
  await treasure(call)
  await replace(call, state => { state.dmTools.wallet = { cp: 0, sp: 0, ep: 0, gp: 1_000_000_000, pp: 0 } })
  const before = await call('get_game_state')
  assert.equal((await call('collect_treasure', { treasureId: 'test-coins' })).code, 'WALLET_LIMIT_REACHED')
  assert.deepEqual(await call('get_game_state'), before)
  await replace(call, state => { state.player.conditions.push('incapacitated') })
  assert.equal((await call('spend_currency', { transactionId: 'blocked', paid: { gp: 1 }, reason: 'Une dépense.' })).code, 'ENTITY_INCAPACITATED')
})

test('the receipt limit rejects a new payment without evicting receipts or charging coins', async t => {
  const call = await engine(t)
  await treasure(call)
  ok(await call('collect_treasure', { treasureId: 'test-coins' }))
  const zero = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  await replace(call, state => { state.dmTools.currencyTransactions = Object.fromEntries(Array.from({ length: 512 }, (_, i) =>
    [`old-${i}`, { kind: 'spend', creation: 'fixture', reason: 'Une dépense déjà réglée.', paid: { ...zero, cp: 1 }, received: zero, walletAfter: zero }])) })
  const before = await call('get_game_state')
  assert.equal((await call('spend_currency', { transactionId: 'one-too-many', paid: { gp: 1 }, reason: 'Une autre dépense.' })).code, 'CURRENCY_TRANSACTION_LIMIT')
  assert.deepEqual(await call('get_game_state'), before)
})

test('coin treasures work in low-level adventures without creating a level-seven hero or implicit starting wealth', async t => {
  const call = await engine(t, { adventureId: 'grammys-country-apple-pie' })
  assert.equal((await call('get_game_state')).hero, undefined)
  await treasure(call, 'legacy', { coins: { cp: 7 } })
  assert.equal(ok(await call('collect_treasure', { treasureId: 'legacy' })).wallet.cp, 7)
  assert.equal((await call('get_game_state')).hero, undefined)
})

test('inspect_scene lists only current-room/map treasure and never credits the wallet', async t => {
  const call = await engine(t)
  await treasure(call)
  await treasure(call, 'elsewhere', { cell: adjacent(await call('get_game_state'))[0] })
  await replace(call, state => { state.dmTools.treasures.elsewhere.mapId = 'other-map' })
  const before = await call('get_game_state')
  const inspected = ok(await call('inspect_scene', { category: 'treasures' }))
  assert.equal(inspected.total, 1)
  assert.equal(inspected.entries[0].creation, undefined)
  assert.equal(inspected.entries[0].id, 'test-coins')
  assert.deepEqual(await call('get_game_state'), before)
})
