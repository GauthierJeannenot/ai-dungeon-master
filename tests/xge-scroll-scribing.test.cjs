const assert = require('node:assert/strict')
const test = require('node:test')
Object.assign(process.env, {
  MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
})
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, grid, spawn } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { copyWork } = require('./helpers/spell-copy-supplies.cjs')
const { fundScribing, prepareScribingAtCurrentSite } = require('./helpers/xge-scribing-fixture.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
const { getMapSpec, inferRoomIdOnMap } = require('../mcp-server/dist/lib/adventure-map.js')
const { playerSeesCell } = require('../mcp-server/dist/lib/scene-perception.js')
test.after(() => pg.restore())

const get = call => call('get_game_state')
const wizard = { adventureId: 'sarah-of-yellowcrest-manor', characterId: 'wizard' }

async function unchanged(call, tool, input, code) {
  const before = await get(call)
  const answer = await call(tool, input)
  assert.equal(answer.code, code, JSON.stringify(answer))
  assert.deepEqual(await get(call), before)
}

async function targetAtRange(call) {
  const state = await get(call), nav = grid(state), map = getMapSpec(state.currentMapId, state)
  const origin = state.player.position
  for (let y = 0; y < map.grid.rows; y++) for (let x = 0; x < map.grid.cols; x++) {
    const cell = { x, y }, distance = Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y))
    if (distance >= 3 && distance <= 12 && inferRoomIdOnMap(cell, state.currentMapId, state) === state.currentRoomId
      && nav.free(cell) && playerSeesCell(state, cell))
      return spawn(call, 'goblin', cell)
  }
  assert.fail('The actual room needs one visible empty cell within Ray of Frost range, outside melee.')
}

async function newProcessFromSql(t, state, dice, suffix) {
  const id = 'w28-scribing-' + suffix + '-' + process.pid
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  const resumed = await engine(t, { ...wizard, dice })
  ok(await resumed('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  return resumed
}

test('one real DM POST scribes prepared Mage Armor from real ordinary materials and the existing scroll use survives SQL', async t => {
  const call = await engine(t, { ...wizard, dice: '19' })
  await fundScribing(call)
  const initial = await get(call)
  assert.ok(initial.player.skillProficiencies.includes('arcana'))
  assert.ok(initial.player.spellbook.includes('mage-armor'))
  assert.equal(initial.player.knownSpells.includes('mage-armor'), false)
  const armor = await prepareScribingAtCurrentSite(call, { spellId: 'mage-armor', componentPouchItemId: 'component_pouch' })
  await unchanged(call, 'scribe_xge_spell_scroll', armor, 'XGE_SCRIBE_SPELL_REQUIRED')
  const unsupported = { ...armor, spellId: 'identify' }
  await unchanged(call, 'scribe_xge_spell_scroll', unsupported, 'XGE_SCRIBE_UNSUPPORTED_SPELL')
  ok(await call('prepare_spells', { spellIds: ['mage-armor', 'magic-missile'] }))
  const { componentPouchItemId, ...withoutPouch } = armor
  await unchanged(call, 'scribe_xge_spell_scroll', withoutPouch, 'XGE_SCRIBE_COMPONENT_POUCH_REQUIRED')
  await unchanged(call, 'scribe_xge_spell_scroll', { ...armor, componentPouchItemId: 'arcane_focus' },
    'XGE_SCRIBE_COMPONENT_POUCH_REQUIRED')
  await unchanged(call, 'scribe_xge_spell_scroll', { ...armor, spellId: 'magic-missile' }, 'XGE_SCRIBE_COMPONENT_MISMATCH')
  await unchanged(call, 'scribe_xge_spell_scroll', { ...armor, paid: { gp: 24 } }, 'XGE_SCRIBE_EXACT_COST_REQUIRED')
  await unchanged(call, 'scribe_xge_spell_scroll', { ...armor, paid: { cp: 2500 } }, 'XGE_SCRIBE_FUNDS_REQUIRED')
  await unchanged(call, 'scribe_xge_spell_scroll', { ...armor, suppliesFactId: 'not-actual-paper-ink' },
    'XGE_SCRIBE_SUPPLIES_SITE_REQUIRED')

  const choice = { name: 'scribe_xge_spell_scroll', input: armor }
  const { before, result, selected, seen } = await play(t, call, [
    choice,
    params => {
      const made = ok(lastResult(params))
      assert.equal(made.scrollItemId, armor.scrollItemId)
      assert.equal(made.paidCp, 2500)
      assert.equal(made.seconds, 28800)
      assert.equal(made.receipt.source.foundationLine, 1987)
      assert.equal(made.receipt.source.startLine, 2402)
      assert.equal(made.receipt.componentPouch.id, componentPouchItemId)
      return 'Le parchemin d’Armure du mage est posé au lieu de travail.'
    },
  ], 'Je transcris Armure du mage sur le parchemin avec ma sacoche et les fournitures préparées.')
  assert.deepEqual(selected, [choice])
  assert.deepEqual(seen, [choice])
  const scribed = result.newGameState
  assert.equal(scribed.worldTimeSeconds - before.worldTimeSeconds, 28800)
  assert.equal(copperValue(before.dmTools.wallet) - copperValue(scribed.dmTools.wallet), 2500)
  assert.deepEqual(scribed.player.spellSlots, before.player.spellSlots)
  assert.deepEqual(scribed.player.inventory, before.player.inventory)
  assert.deepEqual(scribed.hero.effects, before.hero.effects)
  const placed = scribed.droppedItems[armor.scrollItemId]
  assert.equal(placed.item.quantity, 1)
  assert.equal(placed.item.equipmentId, 'spell_scroll')
  assert.deepEqual(placed.position, before.player.position)
  const second = await prepareScribingAtCurrentSite(call, { eventId: 'new-scribe-on-same-date', scrollItemId: 'second-scroll' })
  await unchanged(call, 'scribe_xge_spell_scroll', second, 'DOWNTIME_SHARED_DAY_REQUIRED')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)

  const resumed = await newProcessFromSql(t, scribed, '19', 'armor')
  const restored = await get(resumed)
  assert.equal(ok(await resumed('scribe_xge_spell_scroll', armor)).replayed, true)
  assert.deepEqual(await get(resumed), restored)
  const reusedSupply = { ...armor, eventId: 'other-craft', scrollItemId: 'different-scroll' }
  await unchanged(resumed, 'scribe_xge_spell_scroll', reusedSupply, 'XGE_SCRIBE_SUPPLIES_ALREADY_USED')
  ok(await resumed('pick_up_item', { itemId: armor.scrollItemId }))
  const used = ok(await resumed('use_spell_scroll', { itemId: armor.scrollItemId, targetId: 'player' }))
  assert.equal(used.spellScrollUse.consumed, true)
  assert.equal(used.spellSlotSpent, false)
  const after = await get(resumed)
  assert.equal(after.dmTools.spellScrolls[armor.scrollItemId].status, 'consumed')
  assert.ok(after.hero.effects.some(effect => effect.kind === 'mage-armor'))
  assert.deepEqual(after.player.spellSlots, before.player.spellSlots)
  assert.ok(after.player.inventory.some(item => item.id === 'component_pouch'))
  const spent = await newProcessFromSql(t, after, '19', 'spent-armor')
  await unchanged(spent, 'use_spell_scroll', { itemId: armor.scrollItemId, targetId: 'player' }, 'SPELL_SCROLL_CONSUMED')
  assert.equal(ok(await spent('scribe_xge_spell_scroll', armor)).replayed, true)
  assert.equal(ok(await spent('roll_dice', { notation: '1d20' })).total, 19)
})

test('a true level-seven wizard reads and casts the scribed Ray of Frost at caster level one, and cannot copy it', async t => {
  const seed = await engine(t, { ...wizard, dice: '19' })
  await fundScribing(seed)
  const before = await get(seed)
  assert.equal(before.player.level, 7)
  assert.ok(before.player.knownSpells.includes('ray-of-frost'))
  await unchanged(seed, 'create_spell_scroll', {
    itemId: 'generic-ray', spellId: 'ray-of-frost', name: 'Parchemin de rayon',
    description: 'Le catalogue générique est conservé.', cell: before.player.position,
  }, 'SPELL_SCROLL_UNSUPPORTED')
  const ray = await prepareScribingAtCurrentSite(seed, { spellId: 'ray-of-frost' })
  const made = ok(await seed('scribe_xge_spell_scroll', ray))
  assert.equal(made.paidCp, 1500)
  assert.equal(made.seconds, 28800)
  const crafted = await get(seed)
  assert.equal(crafted.dmTools.spellScrolls[ray.scrollItemId].scribedCantripCasterLevel, 1)
  assert.equal(copperValue(before.dmTools.wallet) - copperValue(crafted.dmTools.wallet), 1500)
  assert.equal(ok(await seed('roll_dice', { notation: '1d20' })).total, 19)

  const call = await newProcessFromSql(t, crafted, '18,1,15,6,19', 'ray')
  const broken = structuredClone(await get(call))
  delete broken.dmTools.spellScrolls[ray.scrollItemId].scribedCantripCasterLevel
  await unchanged(call, 'replace_game_state', { gameState: broken }, 'XGE_SCRIBING_STATE_MISMATCH')
  ok(await call('pick_up_item', { itemId: ray.scrollItemId }))
  const read = ok(await call('read_spell_scroll', { itemId: ray.scrollItemId }))
  assert.equal(read.item.level, 0)
  assert.equal(read.item.cantripCasterLevel, 1)
  assert.equal(read.item.dc, 13)
  assert.equal(read.item.attackBonus, 5)
  await unchanged(call, 'copy_spell_scroll', copyWork({ itemId: ray.scrollItemId, paid: { gp: 25 } }), 'SPELL_COPY_INVALID')
  const enemy = await targetAtRange(call)
  ok(await call('enter_combat', { combatants: ['player', enemy.id], tieOrder: ['player', enemy.id] }))
  assert.equal((await get(call)).currentTurn, 'player')
  const hit = ok(await call('use_spell_scroll', { itemId: ray.scrollItemId, targetId: enemy.id }))
  assert.equal(hit.roll.modifier, 5)
  assert.equal(hit.roll.rolls[0], 15)
  assert.equal(hit.damageRoll.notation, '1d8')
  assert.deepEqual(hit.damageRoll.rolls, [6])
  assert.equal(hit.damageDealt, 6)
  assert.equal(hit.spellSlotSpent, false)
  const after = await get(call)
  assert.equal(after.dmTools.spellScrolls[ray.scrollItemId].status, 'consumed')
  assert.deepEqual(after.player.spellSlots, before.player.spellSlots)
  assert.ok(after.hero.effects.some(effect => effect.kind === 'ray-of-frost' && effect.targetIds.includes(enemy.id)))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('Arcana proficiency is a real prerequisite and recipe inspection is read only', async t => {
  const call = await engine(t, { dice: '19' })
  await fundScribing(call)
  const input = await prepareScribingAtCurrentSite(call)
  await unchanged(call, 'scribe_xge_spell_scroll', input, 'XGE_SCRIBE_ARCANA_REQUIRED')
  const before = await get(call)
  const source = ok(await call('get_rules_support', { domain: 'xge_scroll_scribing' }))
  assert.ok(source.tools.includes('inspect_xge_scroll_scribing'))
  const view = ok(await call('inspect_xge_scroll_scribing'))
  assert.deepEqual(view.receipts, [])
  assert.deepEqual(view.recipes.map(recipe => recipe.costCp), [1500, 2500, 2500])
  assert.deepEqual(await get(call), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('Magic Missile scribing needs no material component and the actual scroll preserves the base-level three darts', async t => {
  const call = await engine(t, { ...wizard, dice: '1,2,3,19' })
  await fundScribing(call)
  const input = await prepareScribingAtCurrentSite(call)
  const before = await get(call)
  const made = ok(await call('scribe_xge_spell_scroll', input))
  assert.equal(made.paidCp, 2500)
  assert.equal(made.receipt.componentPouch, undefined)
  ok(await call('pick_up_item', { itemId: input.scrollItemId }))
  const target = await targetAtRange(call)
  const missile = ok(await call('use_spell_scroll', { itemId: input.scrollItemId, targetId: target.id }))
  assert.equal(missile.damageDealt, 9)
  assert.equal(missile.slotLevel, 1)
  assert.equal(missile.spellSlotSpent, false)
  assert.deepEqual((await get(call)).player.spellSlots, before.player.spellSlots)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
