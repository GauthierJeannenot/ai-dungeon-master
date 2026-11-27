const test = require('node:test')
const assert = require('node:assert/strict')
const { inspectSpellComponents } = require('../mcp-server/dist/mcp-server/spell-components.js')
const { SpellComponentStateSchema } = require('../mcp-server/dist/lib/spell-component-state.js')
const { engine, ok, replace, spawn, battle } = require('./helpers/mcp-toolkit.cjs')

const item = (id, equipmentId = id, type = 'misc') => ({ id, equipmentId, name: id, type })
function fixture({ characterId = 'wizard', inventory = [], mainHandId, offHandId, shieldId, constraints = {} } = {}) {
  return { player: { id: 'player', characterId, level: 7, inventory }, monsters: {}, worldTimeSeconds: 0,
    hero: { effects: [] }, dmTools: { loadout: { mainHandId, offHandId, shieldId, unarmoredAC: 10 }, spellComponents: { constraints } } }
}
const hasCode = (result, code) => result.issues.some(issue => issue.code === code)

test('V/S/M reads actual owned exact pouch and hands without mutating state or granting a source', () => {
  const state = fixture({ inventory: [item('actual-pouch', 'component_pouch')] }), before = structuredClone(state)
  assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'light' }), 'SPELL_COMPONENT_SOURCE_REQUIRED'), true)
  assert.equal(inspectSpellComponents(state, { spellId: 'light', focusItemId: 'actual-pouch' }).valid, true)
  assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'light', focusItemId: 'component_pouch' }), 'SPELL_COMPONENT_SOURCE_REQUIRED'), true)
  assert.deepEqual(state, before)
})

test('only this spell’s M focus hand shares S; an S-only reaction still needs a free hand', () => {
  const state = fixture({ characterId: 'bard', inventory: [item('rapier', 'rapier', 'weapon'), item('real-lute', 'lute')],
    mainHandId: 'rapier', offHandId: 'real-lute' })
  assert.equal(inspectSpellComponents(state, { spellId: 'minor-illusion', focusItemId: 'real-lute' }).valid, true)
  assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'counterspell' }), 'SPELL_SOMATIC_HAND_REQUIRED'), true)
  assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'counterspell', focusItemId: 'real-lute' }), 'SPELL_COMPONENT_SOURCE_MISMATCH'), true)
  delete state.dmTools.loadout.mainHandId
  assert.equal(inspectSpellComponents(state, { spellId: 'counterspell' }).valid, true)
})

test('focus class, actual holding and real ownership are independent requirements', () => {
  const wizard = fixture({ inventory: [item('lute'), item('real-focus', 'arcane_focus')], offHandId: 'lute' })
  assert.equal(hasCode(inspectSpellComponents(wizard, { spellId: 'light', focusItemId: 'lute' }), 'SPELL_FOCUS_CLASS_INVALID'), true)
  assert.equal(hasCode(inspectSpellComponents(wizard, { spellId: 'light', focusItemId: 'real-focus' }), 'SPELL_MATERIAL_HAND_REQUIRED'), true)
  wizard.dmTools.loadout.offHandId = 'real-focus'
  assert.equal(inspectSpellComponents(wizard, { spellId: 'light', focusItemId: 'real-focus' }).valid, true)
  const cleric = fixture({ characterId: 'cleric', inventory: [item('shield', 'shield', 'armor'), item('symbol', 'holy_symbol')],
    shieldId: 'shield', mainHandId: 'symbol' })
  assert.equal(inspectSpellComponents(cleric, { spellId: 'bless', focusItemId: 'symbol' }).valid, true)
  assert.equal(hasCode(inspectSpellComponents(cleric, { spellId: 'cure-wounds' }), 'SPELL_SOMATIC_HAND_REQUIRED'), true)
})

test('pouch access, established hand binding, grapples, shield and two-handed loadout use real capacity', () => {
  const state = fixture({ inventory: [item('staff', 'quarterstaff', 'weapon'), item('dagger', 'dagger', 'weapon'), item('pouch', 'component_pouch')],
    mainHandId: 'staff', offHandId: 'dagger' })
  assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'light', focusItemId: 'pouch' }), 'SPELL_MATERIAL_HAND_REQUIRED'), true)
  delete state.dmTools.loadout.offHandId
  state.hero.effects.push({ kind: 'grapple', sourceId: 'player', targetIds: ['target'], expiresAt: 20 })
  assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'counterspell' }), 'SPELL_SOMATIC_HAND_REQUIRED'), true)
  state.worldTimeSeconds = 20
  assert.equal(inspectSpellComponents(state, { spellId: 'counterspell' }).valid, true)
  state.dmTools.spellComponents.constraints.bound = { id: 'bound', targetId: 'player', kind: 'hands-bound', source: 'Both hands bound by the established scene restraint.' }
  assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'counterspell' }), 'SPELL_SOMATIC_HAND_REQUIRED'), true)
})

test('gag/silence blocks V alone; deafness does not invent silence and S-only Counterspell is unaffected', () => {
  const state = fixture()
  state.player.conditions = ['deafened']
  assert.equal(inspectSpellComponents(state, { spellId: 'magic-missile' }).valid, true)
  for (const kind of ['gagged', 'silenced']) {
    state.dmTools.spellComponents.constraints = { fact: { id: 'fact', targetId: 'player', kind, source: 'Established scene fact.' } }
    assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'magic-missile' }), 'SPELL_VERBAL_BLOCKED'), true)
    assert.equal(inspectSpellComponents(state, { spellId: 'counterspell' }).valid, true)
  }
})

test('priced/consumed materials cannot be replaced by focuses; Identify remains nonconsumed and specifically registered', () => {
  const state = fixture({ inventory: [item('pouch', 'component_pouch'), { ...item('pearl'), name: 'Perle d’identification' }] })
  assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'identify', materialItemId: 'pearl' }), 'SPELL_MATERIAL_REQUIRED'), true)
  state.player.inventory[1].equipmentId = 'identification_pearl'
  const before = structuredClone(state)
  assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'identify', materialItemId: 'pearl' }), 'SPELL_COMPONENT_SOURCE_REQUIRED'), true)
  assert.equal(inspectSpellComponents(state, { spellId: 'identify', materialItemId: 'pearl', focusItemId: 'pouch' }).valid, true)
  assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'revivify', focusItemId: 'pouch' }), 'SPELL_MATERIAL_REQUIRED'), true)
  assert.deepEqual(state, before)
})

test('MM native Spellcasting certifies only listed spells and supplies no transferable player inventory', () => {
  const state = fixture(); state.monsters.mage = { id: 'mage', type: 'mage' }
  assert.equal(inspectSpellComponents(state, { spellId: 'misty-step', casterId: 'mage' }).valid, true)
  assert.equal(inspectSpellComponents(state, { spellId: 'fireball', casterId: 'mage' }).valid, true)
  assert.equal(inspectSpellComponents(state, { spellId: 'greater-invisibility', casterId: 'mage' }).valid, true)
  assert.equal(inspectSpellComponents(state, { spellId: 'fireball', casterId: 'mage' }).nativeSpellcasting.materialsAssumed, true)
  assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'revivify', casterId: 'mage' }), 'SPELL_COMPONENT_ACTOR_UNSUPPORTED'), true)
  state.dmTools.spellComponents.constraints.bound = { id: 'bound', targetId: 'mage', kind: 'hands-bound', source: 'The established restraint binds both hands.' }
  assert.equal(hasCode(inspectSpellComponents(state, { spellId: 'fireball', casterId: 'mage' }), 'SPELL_SOMATIC_HAND_REQUIRED'), true)
  assert.equal(inspectSpellComponents(state, { spellId: 'misty-step', casterId: 'mage' }).valid, true)
  assert.equal(inspectSpellComponents(state, { spellId: 'fireball', componentExemption: 'validated-spell-scroll' }).valid, true)
})

test('component scene schema refuses unknown rule bypass flags and incomplete source facts', () => {
  assert.equal(SpellComponentStateSchema.safeParse({ constraints: {}, ignoreSomatic: true }).success, false)
  assert.equal(SpellComponentStateSchema.safeParse({ constraints: { gag: { id: 'gag', targetId: 'player', kind: 'gagged', source: '' } } }).success, false)
  assert.equal(SpellComponentStateSchema.safeParse({ constraints: { wrongKey: { id: 'gag', targetId: 'player', kind: 'gagged', source: 'Scene gag.' } } }).success, false)
})

test('MCP established verbal constraints round-trip and refuse casting without slots, action, time or RNG costs', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '17,18,19' })
  const fact = { id: 'scene-gag', targetId: 'player', kind: 'gagged', source: 'An established scene gag, removed explicitly.', operation: 'apply' }
  ok(await call('set_spell_component_constraint', fact))
  assert.equal(ok(await call('set_spell_component_constraint', fact)).repeated, true)
  await replace(call, () => {})
  const before = await call('get_game_state')
  assert.equal((await call('cast_spell', { spellId: 'magic-missile', targetId: 'player' })).code, 'SPELL_VERBAL_BLOCKED')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal((await call('inspect_spell_components', { spellId: 'magic-missile' })).valid, false)
  ok(await call('set_spell_component_constraint', { ...fact, operation: 'remove' }))
  assert.equal(ok(await call('roll_ability_check', { ability: 'int', dc: 10 })).roll.rolls[0], 17)
})

test('MCP exact actual pouch enables M and full hands refuse S before casting costs', async t => {
  const call = await engine(t, { characterId: 'wizard' })
  const source = await call('inspect_spell_components', { spellId: 'comprehend-languages', focusItemId: 'component_pouch' })
  assert.equal(source.valid, true)
  ok(await call('equip_item', { itemId: 'dagger', operation: 'equip', slot: 'off_hand' }))
  const before = await call('get_game_state')
  assert.equal((await call('cast_spell', { spellId: 'burning-hands', direction: { x: 1, y: 0 } })).code, 'SPELL_SOMATIC_HAND_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('equip_item', { itemId: 'dagger', operation: 'unequip', slot: 'off_hand' }))
  ok(await call('cast_spell', { spellId: 'comprehend-languages', focusItemId: 'component_pouch' }))
})

test('an offered Shield reaction with full hands preserves its pending spell and every casting cost on refusal', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '1,2,3,17' })
  await replace(call, state => { if (!state.player.knownSpells.includes('shield')) state.player.knownSpells.push('shield') })
  ok(await call('equip_item', { itemId: 'dagger', operation: 'equip', slot: 'off_hand' }))
  const mage = await spawn(call, 'mage')
  await battle(call, [mage.id], mage.id)
  const pending = ok(await call('cast_creature_spell', { casterId: mage.id, spellId: 'magic-missile', targetId: 'player' })).pendingReaction
  assert.ok(pending.options.includes('shield'))
  const before = await call('get_game_state')
  assert.equal((await call('resolve_reaction', { pendingId: pending.id, choice: 'shield' })).code, 'SPELL_SOMATIC_HAND_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('resolve_reaction', { pendingId: pending.id, choice: 'decline' }))
})

test('Mage Armor ignores a carried spare when the actual armor slot is empty', async t => {
  const call = await engine(t, { characterId: 'wizard' })
  ok(await call('equip_item', { itemId: 'quarterstaff', operation: 'unequip', slot: 'main_hand' }))
  await replace(call, state => {
    if (!state.player.knownSpells.includes('mage-armor')) state.player.knownSpells.push('mage-armor')
    state.player.inventory.push({ id: 'carried-spare', equipmentId: 'leather', name: 'Carried leather armor', type: 'armor' })
  })
  ok(await call('cast_spell', { spellId: 'mage-armor', targetId: 'player', focusItemId: 'component_pouch' }))
  assert.ok((await call('get_game_state')).hero.effects.some(effect => effect.kind === 'mage-armor'))
})
