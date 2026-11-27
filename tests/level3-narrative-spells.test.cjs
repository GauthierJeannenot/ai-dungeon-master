const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
test.after(restore)
const { engine, ok, replace, spawn, battle, adjacent } = require('./helpers/mcp-toolkit.cjs')
const { completeCasting } = require('./helpers/casting.cjs')
const { alarmCubeInput } = require('./helpers/alarm-fixture.cjs')
const { listCharacters, getCharacterTemplate } = require('../lib/character-registry.ts')
const { getSpell } = require('../lib/srd/spells.ts')
const { spellRules } = require('../lib/srd/hero-spells.ts')
const { NARRATIVE_SPELLS } = require('../lib/srd/narrative-spells.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { loadContextFiles } = require('../lib/context-loader.ts')
const { characterSheetFromTemplate, characterSheetFromPlayerState } = require('../lib/character-sheet-view.ts')
const adventureId = 'fey-shadow-fair'

for (const characterId of ['fighter', 'bard', 'wizard', 'cleric']) test(`${characterId}: level-three spawn, preview, prompt and persisted state agree`, async t => {
  const call = await engine(t, { adventureId, characterId })
  const state = await call('get_game_state'), player = state.player
  assert.deepEqual(player, buildInitialGameState(adventureId, characterId).player)
  assert.equal(player.level, 3)
  assert.equal(player.proficiencyBonus, 2)
  assert.equal(state.hero.hitDice.max, 3)
  assert.equal(state.hero.hitDice.current, 3)
  assert.equal(state.dmTools?.wallet?.gp ?? 0, 0)
  assert.equal(player.hp.max, { fighter: 36, bard: 28, wizard: 22, cleric: 32 }[characterId])
  assert.match(loadContextFiles(adventureId, characterId).playerCharacter, /niveau 3/)
  const preview = characterSheetFromTemplate(getCharacterTemplate(characterId), 3)
  assert.equal(preview.hp.max, player.hp.max)
  if (player.knownSpells) {
    assert.deepEqual(player.spellSlots, { level1: { current: 4, max: 4 }, level2: { current: 2, max: 2 } })
    assert.deepEqual(preview.spellcasting.levels.map(g => g.slots.max), [4, 2])
    assert.ok(player.knownSpells.every(id => getSpell(id).level <= 2))
    assert.ok(player.knownSpells.filter(id => getSpell(id).level > 0).length > 6)
    for (const id of player.knownSpells) assert.ok(spellRules(id).classes.some(c => c.index === characterId), `${characterId}: ${id}`)
  }
  if (characterId === 'bard') {
    assert.equal(player.resources.bardic_inspiration.max, 3)
    assert.ok(characterSheetFromPlayerState(player).features.includes('Inspiration bardique (d6)'))
    assert.ok(!player.features.includes('font_of_inspiration'))
  }
  if (characterId === 'cleric') assert.equal(player.resources.channel_divinity.max, 1)
  if (characterId === 'fighter') assert.ok(!player.features.includes('extra_attack'))
  ok(await call('replace_game_state', { gameState: state }))
  assert.deepEqual((await call('get_game_state')).player, player)
  // Historical profiles and already hydrated games do not acquire new powers.
  const historical = buildInitialGameState('tide-crypt', characterId).player
  historical.level = 3
  await replace(call, s => { s.player = historical; delete s.hero })
  assert.deepEqual((await call('get_game_state')).player.knownSpells, historical.knownSpells)
  assert.equal((await call('get_game_state')).player.ruleset, undefined)
})

test('all narrative sources are pinned 2014 responses and every advertised spell is registered', () => {
  const sources = require('../lib/srd/narrative-spell-sources.json')
  assert.equal(NARRATIVE_SPELLS.length, 20)
  for (const [id, record] of Object.entries(sources.records)) {
    assert.equal(record.sha256, crypto.createHash('sha256').update(JSON.stringify(record.source)).digest('hex'), id)
    assert.equal(getSpell(record.source.index).level, record.source.level)
  }
  for (const profile of listCharacters(3)) {
    const sheet = fs.readFileSync(`characters/${profile.id}/character-sheet-level3.md`, 'utf8')
    for (const id of [...profile.spellcasting?.cantrips ?? [], ...profile.spellcasting?.knownSpells ?? []]) assert.ok(sheet.includes(id), id)
    assert.equal(getCharacterTemplate(profile.id, 1), getCharacterTemplate(profile.id, 2))
    assert.equal(getCharacterTemplate(profile.id, 7).proficiencyBonus, 3)
  }
})

for (const spell of NARRATIVE_SPELLS) test(`${spell.id}: cast through real MCP, bounded result, costs and round-trip`, async t => {
  const characterId = ['detect-evil-and-good', 'detect-poison-and-disease', 'purify-food-and-drink', 'augury'].includes(spell.id) ? 'cleric'
    : spell.id === 'animal-messenger' ? 'bard' : 'wizard'
  const call = await engine(t, { adventureId, characterId })
  const input = { spellId: spell.id }
  const components = spellRules(spell.id).components
  if (characterId === 'cleric' && (components.includes('S') || components.includes('M'))) {
    // This source kit starts with mace and shield: free a real hand explicitly.
    ok(await call('equip_item', { itemId: 'mace', slot: 'main_hand', operation: 'unequip' }))
    if (components.includes('M') && !spell.materialName) {
      ok(await call('equip_item', { itemId: 'holy_symbol', slot: 'main_hand', operation: 'equip' }))
      input.focusItemId = 'holy_symbol'
    }
  } else if (components.includes('M') && !spell.materialName) {
    if (characterId === 'bard') {
      ok(await call('equip_item', { itemId: 'lute', slot: 'off_hand', operation: 'equip' }))
      input.focusItemId = 'lute'
    } else input.focusItemId = 'component_pouch'
  }
  if (spell.id === 'alarm') Object.assign(input, alarmCubeInput((await call('get_game_state')).player.position))
  else {
    if (spell.narrativeTarget) input.narrative = 'Effet choisi pour examiner et décrire les éléments déjà établis de la scène.'
    if (spell.narrativeTarget === 'point') input.toCell = (await call('get_game_state')).player.position
  }
  if (spell.id === 'prestidigitation') input.effectDurationSeconds = 3600
  if (spell.narrativeTarget === 'creature') input.targetId = (await spawn(call, spell.id === 'animal-messenger' ? 'rat' : 'goblin')).id
  if (spell.id === 'invisibility') input.targetId = 'player'
  let before = await call('get_game_state')
  if (spell.materialName) input.materialItemId = before.player.inventory.find(i => i.name === spell.materialName).id
  if (spell.narrativeTarget) {
    const invalid = { ...input }
    if (spell.id === 'alarm') delete invalid.alarmWard
    else delete invalid.narrative
    assert.equal((await call('cast_spell', invalid)).code, spell.id === 'alarm' ? 'ALARM_WARD_SELECTION_REQUIRED' : 'SPELL_DESCRIPTION_REQUIRED')
    assert.deepEqual(await call('get_game_state'), before)
  }
  const result = await completeCasting(call,ok(await call('cast_spell', input))), after = await call('get_game_state')
  assert.equal(result.spell, spell.id)
  if (spell.level) assert.equal(after.player.spellSlots[`level${spell.level}`].current, before.player.spellSlots[`level${spell.level}`].current - 1)
  else assert.deepEqual(after.player.spellSlots, before.player.spellSlots)
  if (spell.effect.kind === 'utility') assert.equal(result.srdNote, spell.effect.srdNote)
  if (spell.materialName) assert.equal(after.player.inventory.some(i => i.id === input.materialItemId), spell.materialConsumed === false)
  if (spellRules(spell.id).concentration) assert.ok(after.hero.concentrationId)
  if (spell.id === 'invisibility') assert.ok(after.player.conditions.includes('invisible'))
  ok(await call('replace_game_state', { gameState: after }))
  assert.deepEqual((await call('get_game_state')).hero, after.hero)
})

test('invalid selections fail atomically while a valid long combat casting begins without time compression', async t => {
  const call = await engine(t, { adventureId, characterId: 'wizard' })
  const baseline = await call('get_game_state')
  for (const [input, code] of [
    [{ spellId: 'silent-image', focusItemId: 'component_pouch', narrative: 'Un coffre illusoire' }, 'SPELL_DESTINATION_REQUIRED'],
    [{ spellId: 'silent-image', focusItemId: 'component_pouch', narrative: 'Un coffre illusoire', toCell: { x: 99, y: 99 } }, 'INVALID_GRID_CELL'],
    [{ spellId: 'message', focusItemId: 'component_pouch', narrative: 'Bonjour' }, 'TARGET_REQUIRED'],
    [{ spellId: 'invisibility', focusItemId: 'component_pouch' }, 'TARGET_REQUIRED'],
    [{ spellId: 'continual-flame', narrative: 'Flamme sur le bâton', toCell: baseline.player.position }, 'SPELL_MATERIAL_REQUIRED'],
    [{ spellId: 'locate-object', focusItemId: 'component_pouch', narrative: 'Mon grimoire', targetId: (await spawn(call)).id }, 'SPELL_TARGET_CONFLICT'],
    [{ spellId: 'sending' }, 'SPELL_NOT_KNOWN'],
  ]) {
    const before = await call('get_game_state')
    assert.equal((await call('cast_spell', input)).code, code)
    assert.deepEqual(await call('get_game_state'), before)
  }
  const enemy = Object.values((await call('get_game_state')).monsters)[0]
  await battle(call, [enemy.id])
  const before = await call('get_game_state')
  const begun=ok(await call('cast_spell', alarmCubeInput(before.player.position)))
  assert.equal(begun.status,'active');assert.equal(begun.activeSeconds,6)
  const after=await call('get_game_state');assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.deepEqual(after.player.spellSlots,before.player.spellSlots)
  assert.equal(after.hero.actionCredits,0)
})

test('rituals preserve slots, require real work and use genuine actions in combat for the bard', async t => {
  const call = await engine(t, { adventureId, characterId: 'bard' })
  const before = await call('get_game_state')
  await completeCasting(call,ok(await call('cast_spell', { spellId: 'speak-with-animals', ritual: true })))
  let state = await call('get_game_state')
  assert.deepEqual(state.player.spellSlots, before.player.spellSlots)
  assert.equal(state.worldTimeSeconds, 606)
  assert.equal((await call('cast_spell', { spellId: 'healing-word', targetId: 'player', ritual: true })).code, 'SPELL_NOT_RITUAL')
  assert.equal((await call('cast_spell', { spellId: 'alarm', ritual: true })).code, 'SPELL_NOT_KNOWN')
  const target = await spawn(call)
  await battle(call, [target.id])
  state = await call('get_game_state')
  const begun=ok(await call('cast_spell', { spellId: 'speak-with-animals', ritual: true }))
  assert.equal(begun.status,'active');assert.equal(begun.activeSeconds,6)
  const after=await call('get_game_state');assert.equal(after.worldTimeSeconds,state.worldTimeSeconds);assert.deepEqual(after.player.spellSlots,state.player.spellSlots)
})

test('concentration replacement, expiry and explicit control enforce one effect and command budgets', async t => {
  const call = await engine(t, { adventureId, characterId: 'wizard' })
  const cell = (await call('get_game_state')).player.position
  const image = ok(await call('cast_spell', { spellId: 'silent-image', focusItemId: 'component_pouch', toCell: cell, narrative: 'Un coffret bleu illusoire.' }))
  const lights = ok(await call('cast_spell', { spellId: 'dancing-lights', focusItemId: 'component_pouch', toCell: cell, narrative: 'Quatre petites lumières.' }))
  let state = await call('get_game_state')
  assert.ok(!state.hero.effects.some(e => e.id === image.id))
  const before = structuredClone(state)
  assert.equal((await call('use_narrative_spell_effect', { effectId: image.id, toCell: cell, narrative: 'Déplacer le coffret' })).code, 'SPELL_EFFECT_UNAVAILABLE')
  assert.deepEqual(await call('get_game_state'), before)
  const enemy = await spawn(call)
  await battle(call, [enemy.id])
  state = await call('get_game_state')
  ok(await call('use_narrative_spell_effect', { effectId: lights.id, toCell: cell, narrative: 'Les lumières tournent autour du lanceur.' }))
  const used = await call('get_game_state')
  assert.equal(used.bonusActionUsed.player, true)
  assert.deepEqual(used.player.spellSlots, state.player.spellSlots)
  assert.equal((await call('use_narrative_spell_effect', { effectId: lights.id, toCell: cell, narrative: 'Encore' })).code, 'BONUS_ACTION_ALREADY_USED')
  await replace(call, s => { s.phase = 'exploration'; s.currentTurn = null })
  ok(await call('advance_time', { seconds: 60 }))
  assert.ok(!(await call('get_game_state')).hero.effects.some(e => e.id === lights.id))
})

test('invisibility ends on casting or attacking and on concentration expiry, without concealing the token', async t => {
  const call = await engine(t, { adventureId, characterId: 'wizard', dice: '1,1,1,1,1' })
  ok(await call('cast_spell', { spellId: 'invisibility', focusItemId: 'component_pouch', targetId: 'player' }))
  const lightObject=await require('./helpers/light-spell-fixture.cjs').prepareLightObject(call)
  ok(await call('cast_spell', { spellId: 'light', lightObject:lightObject.selection, focusItemId: 'component_pouch' }))
  assert.ok(!(await call('get_game_state')).player.conditions.includes('invisible'))
  ok(await call('cast_spell', { spellId: 'invisibility', focusItemId: 'component_pouch', targetId: 'player' }))
  const target = await spawn(call)
  await battle(call, [target.id])
  ok(await call('resolve_player_attack', { targetId: target.id, weaponOrSpell: 'dagger' }))
  assert.ok(!(await call('get_game_state')).player.conditions.includes('invisible'))
})

test('seeing invisibility changes actual visibility and expires without changing the target condition', async t => {
  const call = await engine(t, { adventureId, characterId: 'wizard' })
  const target = await spawn(call)
  ok(await call('cast_spell', { spellId: 'invisibility', focusItemId: 'component_pouch', targetId: target.id }))
  const gs = require('../mcp-server/dist/mcp-server/game-state.js')
  const { canSee } = require('../mcp-server/dist/mcp-server/monster-perception.js')
  gs.replaceState(await call('get_game_state'))
  assert.equal(canSee(gs.getPlayer(), gs.getMonster(target.id)), false)
  ok(await call('cast_spell', { spellId: 'see-invisibility', focusItemId: 'component_pouch', narrative: 'Observer les créatures invisibles dans la scène.' }))
  let state = await call('get_game_state')
  gs.replaceState(state)
  assert.equal(canSee(gs.getPlayer(), gs.getMonster(target.id)), true)
  assert.ok(state.monsters[target.id].conditions.includes('invisible'))
  ok(await call('end_concentration', {}))
  assert.ok(!(await call('get_game_state')).monsters[target.id].conditions.includes('invisible'))
  ok(await call('advance_time', { seconds: 3600 }))
  state = await call('get_game_state')
  assert.ok(!state.hero.effects.some(e => e.kind === 'see-invisibility'))
})

test('Augury retains its tokens, records unreliable repeats and resets only after a long rest', async t => {
  const call = await engine(t, { adventureId, characterId: 'cleric', dice: '1,1' })
  ok(await call('equip_item', { itemId: 'mace', slot: 'main_hand', operation: 'unequip' }))
  const input = { spellId: 'augury', materialItemId: 'augury_tokens', narrative: 'Présage pour ouvrir cette porte dans les trente prochaines minutes.', ritual: true }
  assert.equal((await completeCasting(call,ok(await call('cast_spell', input)))).oracleReliable, true)
  assert.equal((await completeCasting(call,ok(await call('cast_spell', input)))).oracleReliable, false)
  let state = await call('get_game_state')
  assert.ok(state.player.inventory.some(i => i.id === 'augury_tokens'))
  assert.equal(state.sceneMemory['augury-since-rest'], 2)
  ok(await call('take_rest', { kind: 'short' }))
  assert.equal((await call('get_game_state')).sceneMemory['augury-since-rest'], 2)
  ok(await call('take_rest', { kind: 'long' }))
  assert.equal((await completeCasting(call,ok(await call('cast_spell', input)))).oracleReliable, true)
})

test('Prestidigitation duration, three-effect cap and chosen dismissal preserve unrelated effects', async t => {
  const call = await engine(t, { adventureId, characterId: 'wizard' })
  const input = { spellId: 'prestidigitation', narrative: 'Une marque bleue sur le bâton.', toCell: (await call('get_game_state')).player.position }
  assert.equal((await call('cast_spell', input)).code, 'SPELL_DURATION_REQUIRED')
  const first = ok(await call('cast_spell', { ...input, effectDurationSeconds: 3600 }))
  ok(await call('cast_spell', { ...input, effectDurationSeconds: 3600 }))
  ok(await call('cast_spell', { ...input, effectDurationSeconds: 3600 }))
  const before = await call('get_game_state')
  assert.equal((await call('cast_spell', { ...input, effectDurationSeconds: 3600 })).code, 'SPELL_EFFECT_LIMIT')
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('cast_spell', { ...input, effectDurationSeconds: 0 }))
  ok(await call('dismiss_prestidigitation', { effectId: first.id }))
  assert.equal((await call('get_game_state')).hero.effects.filter(e => e.kind === 'prestidigitation').length, 2)
})

test('level-three recovery and preparation never borrow level-seven limits', async t => {
  const call = await engine(t, { adventureId, characterId: 'wizard' })
  await replace(call, s => { s.player.spellSlots.level1.current = 0; s.hero.hitDice.current = 0 })
  let before = await call('get_game_state')
  assert.equal((await call('take_rest', { kind: 'short', arcaneRecovery: [1, 1, 1] })).code, 'ARCANE_RECOVERY_BUDGET')
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('take_rest', { kind: 'short', arcaneRecovery: [1, 1] }))
  assert.equal((await call('get_game_state')).player.spellSlots.level1.current, 2)
  ok(await call('take_rest', { kind: 'long' }))
  assert.equal((await call('get_game_state')).hero.hitDice.current, 1)
  before = await call('get_game_state')
  assert.equal((await call('prepare_spells', { spellIds: ['fireball'] })).code, 'SPELL_CANNOT_PREPARE')
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('prepare_spells', { spellIds: getCharacterTemplate('wizard', 3).spellcasting.knownSpells }))
})
