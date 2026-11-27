const test = require('node:test')
const assert = require('node:assert/strict')
const { armorPenalties, armorRollDisadvantage, armorSpellcastingBlocked, armorAdjustedSpeed,
  proficientArmorCategories } = require('../mcp-server/dist/lib/armor-penalties.js')
const { engine, ok, replace, spawn, battle } = require('./helpers/mcp-toolkit.cjs')
const { navigationActor } = require('../mcp-server/dist/lib/navigation.js')

const armor = (equipmentId, id = equipmentId) => ({ id, equipmentId, name: equipmentId, type: 'armor' })
function fixture({ characterId = 'wizard', subclassId, str = 8, equipmentId = 'chain_mail', explicit = true } = {}) {
  return { player: { characterId, subclassId, stats: { str }, inventory: [armor(equipmentId)] },
    ...(explicit ? { dmTools: { loadout: { [equipmentId === 'shield' ? 'shieldId' : 'armorId']: equipmentId } } } : {}) }
}

test('only actually worn registered armor and wielded shields impose penalties, without mutating state', () => {
  const state = fixture(), before = structuredClone(state)
  assert.equal(armorPenalties(state).spellcastingBlocked, true)
  assert.deepEqual(state, before)
  delete state.dmTools.loadout.armorId
  assert.equal(armorPenalties(state).spellcastingBlocked, false)
  assert.equal(armorPenalties(state).strengthSpeedPenaltyFeet, 0)
  assert.equal(armorPenalties(fixture({ explicit: false })).spellcastingBlocked, true)
  assert.deepEqual(armorPenalties(fixture({ equipmentId: 'unknown_armor' })).worn, [])
  assert.equal(armorPenalties(fixture({ equipmentId: 'shield' })).spellcastingBlocked, true)
})

test('fixed catalog class proficiencies include the Life domain bonus and preserve legacy fighter', () => {
  assert.deepEqual(proficientArmorCategories({ characterId: 'fighter' }), ['light', 'medium', 'heavy', 'shield'])
  assert.deepEqual(proficientArmorCategories({}), ['light', 'medium', 'heavy', 'shield'])
  assert.deepEqual(proficientArmorCategories({ characterId: 'bard' }), ['light'])
  assert.deepEqual(proficientArmorCategories({ characterId: 'wizard' }), [])
  assert.deepEqual(proficientArmorCategories({ characterId: 'cleric' }), ['light', 'medium', 'shield'])
  assert.equal(armorPenalties(fixture({ characterId: 'cleric', subclassId: 'life' })).spellcastingBlocked, false)
  assert.equal(armorPenalties(fixture({ characterId: 'cleric' })).spellcastingBlocked, true)
})

test('nonproficiency disadvantages only actual STR/DEX rolls; no CON, mental, death or monster penalty', () => {
  const state = fixture({ equipmentId: 'shield' })
  for (const ability of ['str', 'dex']) assert.equal(armorRollDisadvantage(state, 'player', ability), true)
  for (const ability of ['con', 'int', 'wis', 'cha', undefined]) assert.equal(armorRollDisadvantage(state, 'player', ability), false)
  assert.equal(armorRollDisadvantage(state, 'monster', 'str'), false)
  assert.equal(armorSpellcastingBlocked(state), true)
  assert.equal(armorSpellcastingBlocked(state, 'monster'), false)
})

test('heavy armor Strength thresholds reduce speed once, independently of proficiency, with no persistent base change', () => {
  for (const [equipmentId, required] of [['chain_mail', 13], ['splint', 15], ['plate', 15]]) {
    const state = fixture({ equipmentId, str: required - 1, characterId: 'fighter' })
    assert.equal(armorPenalties(state).spellcastingBlocked, false)
    assert.equal(armorAdjustedSpeed(state, 'player', 30), 20)
    assert.equal(armorAdjustedSpeed(state, 'player', 5), 0)
    assert.equal(armorAdjustedSpeed(state, 'monster', 30), 30)
    state.player.stats.str = required
    assert.equal(armorAdjustedSpeed(state, 'player', 30), 30)
  }
  for (const equipmentId of ['ring_mail', 'half_plate', 'leather', 'shield']) {
    assert.equal(armorPenalties(fixture({ equipmentId, str: 1 })).strengthSpeedPenaltyFeet, 0)
  }
})

async function addWornArmor(call, equipmentId = 'leather_armor', slot = 'armor') {
  if (!(await call('get_game_state')).dmTools?.loadout)
    ok(await call('equip_item', { itemId: 'quarterstaff', operation: 'unequip', slot: 'main_hand' }))
  await replace(call, state => state.player.inventory.push(armor(equipmentId, 'borrowed-armor')))
  return ok(await call('equip_item', { itemId: 'borrowed-armor', operation: 'equip', slot }))
}

test('actual equip accepts wizard nonproficiency, retains armor AC, and does not confuse a carried spare with armor worn', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '19,18,2,17,16' })
  // Establish the explicit empty loadout before adding a spare (legacy ownership
  // infers initial armor on first equip, so a never-established loadout cannot
  // prove that newly inserted test inventory is stowed).
  ok(await call('equip_item', { itemId: 'quarterstaff', operation: 'unequip', slot: 'main_hand' }))
  await replace(call, state => state.player.inventory.push(armor('leather_armor', 'borrowed-armor')))
  const stowed = ok(await call('roll_ability_check', { ability: 'dex', dc: 10 }))
  assert.doesNotMatch(stowed.roll.detail, /DIS/)
  const equipped = ok(await call('equip_item', { itemId: 'borrowed-armor', operation: 'equip', slot: 'armor' }))
  assert.equal(equipped.baselineAC, 13)
  const check = ok(await call('roll_ability_check', { ability: 'dex', dc: 10 }))
  assert.match(check.roll.detail, /DIS/); assert.equal(check.roll.rolls[0], 2)
  const mental = ok(await call('roll_ability_check', { ability: 'int', dc: 10 }))
  assert.doesNotMatch(mental.roll.detail, /DIS/); assert.equal(mental.roll.rolls[0], 17)
  const con = ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'con', dc: 10 }))
  assert.doesNotMatch(con.roll.detail, /DIS/); assert.equal(con.roll.rolls[0], 16)
})

test('actual shield nonproficiency blocks spellcasting transactionally and doffing removes every derived penalty', async t => {
  const call = await engine(t, { characterId: 'wizard' })
  await addWornArmor(call, 'shield', 'shield')
  const before = await call('get_game_state')
  const cast = await call('cast_spell', { spellId: 'magic-missile', targetIds: ['player'] })
  assert.ok(cast.error, JSON.stringify(cast))
  assert.match(cast.error, /armor|armure|proficien|maîtr/i)
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('equip_item', { itemId: 'borrowed-armor', operation: 'unequip', slot: 'shield' }))
  assert.equal(armorSpellcastingBlocked(await call('get_game_state')), false)
})

test('actual STR attacks and DEX saves are disadvantaged by wizard armor, while ordinary advantage cancels', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '17,19,2,18,3' })
  ok(await call('equip_item', { itemId: 'quarterstaff', operation: 'unequip', slot: 'main_hand' }))
  await addWornArmor(call)
  const canceled = ok(await call('roll_ability_check', { ability: 'str', dc: 10, advantage: true,
    advantageReason: 'Une aide concrète et établie soutient le personnage.' }))
  assert.doesNotMatch(canceled.roll.detail, /DIS:|ADV:/); assert.equal(canceled.roll.rolls[0], 17)
  const enemy = await spawn(call)
  await battle(call, [enemy.id])
  const attack = ok(await call('resolve_player_attack', { targetId: enemy.id, weaponOrSpell: 'unarmed' }))
  assert.match(attack.attackRoll.detail, /DIS/); assert.equal(attack.attackRoll.rolls[0], 2)
  const save = ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'dex', dc: 10 }))
  assert.match(save.roll.detail, /DIS/); assert.equal(save.roll.rolls[0], 3)

})

test('actual low-Strength fighter may wear heavy armor and its penalty survives hydration until doffing', async t => {
  const call = await engine(t)
  ok(await call('equip_item', { itemId: 'chain_mail', operation: 'unequip', slot: 'armor' }))
  await replace(call, state => { state.player.stats.str = 12 })
  ok(await call('equip_item', { itemId: 'chain_mail', operation: 'equip', slot: 'armor' }))
  const state = await call('get_game_state')
  assert.equal(state.player.speed, 30)
  assert.equal(armorAdjustedSpeed(state, 'player', state.player.speed), 20)
  assert.equal(navigationActor(state, 'player').speed, 20)
  assert.equal(armorPenalties(state).spellcastingBlocked, false)
  ok(await call('replace_game_state', { gameState: state }))
  assert.deepEqual(armorPenalties(await call('get_game_state')), armorPenalties(state))
  ok(await call('equip_item', { itemId: 'chain_mail', operation: 'unequip', slot: 'armor' }))
  const doffed = await call('get_game_state')
  assert.equal(armorAdjustedSpeed(doffed, 'player', 30), 30)
  assert.equal(navigationActor(doffed, 'player').speed, 30)
})

test('actual initiative receives the Dexterity-check disadvantage from nonproficient armor', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '19,2,11' })
  await addWornArmor(call)
  const enemy = await spawn(call)
  const combat = ok(await call('enter_combat', { combatants: ['player', enemy.id] }))
  assert.match(combat.initiatives.find(actor => actor.id === 'player').roll, /DIS/)
})

test('heavy armor speed reduction precedes exhaustion halving and Dash without changing base speed', async t => {
  const call = await engine(t)
  await replace(call, state => {
    state.player.stats.str = 12
    state.player.conditions.push('exhaustion')
    state.dmTools ??= { version: 1, objects: {}, traps: {}, npcs: {}, itemUses: {} }
    state.dmTools.exhaustion = { creatures: { player: { level: 2 } }, receipts: {} }
  })
  let state = await call('get_game_state')
  assert.equal(state.player.speed, 30)
  assert.equal(navigationActor(state, 'player').speed, 10)
  await replace(call, value => value.hero.effects.push({ id: 'test-dash', kind: 'dash', sourceId: 'player', targetIds: ['player'], expiresAt: 600, concentration: false, data: {} }))
  state = await call('get_game_state')
  assert.equal(navigationActor(state, 'player').speed, 20)
  assert.equal(state.player.speed, 30)
})
