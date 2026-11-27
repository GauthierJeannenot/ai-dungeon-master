const assert = require('node:assert/strict')
const test = require('node:test')
Object.assign(process.env, {
  MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
})
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { prepareHerbalismCourse, prepareBrewAtCurrentSite } = require('./helpers/xge-brewing-fixture.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
test.after(() => pg.restore())

const get = call => call('get_game_state')

async function unchanged(call, tool, input, code) {
  const before = await get(call)
  const answer = await call(tool, input)
  assert.equal(answer.code, code, JSON.stringify(answer))
  assert.deepEqual(await get(call), before)
}

test('real paid Training enables one XGE potion at a real worksite, and its receipt and later consumption survive SQL', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '19' })
  const course = await prepareHerbalismCourse(call)
  const kitId = course.input.practiceToolItemId
  const reusedChest = 'ordinary-chest-after-brewing'
  const input = await prepareBrewAtCurrentSite(call, kitId, { potionItemId: reusedChest + ':content:0' })
  await unchanged(call, 'brew_xge_healing_potion', input, 'XGE_BREW_KIT_PROFICIENCY_REQUIRED')
  await course.completeInstruction()
  ok(await call('complete_xge_training', course.completion))
  assert.ok((await get(call)).player.toolProficiencies.includes('herbalism_kit'))
  await unchanged(call, 'brew_xge_healing_potion', input, 'DOWNTIME_SHARED_DAY_REQUIRED')
  await course.nextDay()

  await unchanged(call, 'brew_xge_healing_potion', { ...input, toolItemId: 'nonexistent-kit' },
    'XGE_BREW_KIT_PROFICIENCY_REQUIRED')
  await unchanged(call, 'brew_xge_healing_potion', { ...input, potionItemId: kitId }, 'XGE_BREW_OUTPUT_ID_CONFLICT')
  await unchanged(call, 'brew_xge_healing_potion', { ...input, suppliesFactId: 'no-actual-supplies' },
    'XGE_BREW_SUPPLIES_SITE_REQUIRED')
  await unchanged(call, 'brew_xge_healing_potion', { ...input, paid: { gp: 24 } }, 'XGE_BREW_EXACT_COST_REQUIRED')
  await unchanged(call, 'brew_xge_healing_potion', { ...input, paid: { cp: 2500 } }, 'XGE_BREW_FUNDS_REQUIRED')
  ok(await call('begin_rest', { restId: 'actual-other-rest', kind: 'short' }))
  await unchanged(call, 'brew_xge_healing_potion', input, 'XGE_BREW_REST_ACTIVE')
  ok(await call('abandon_rest', { restId: 'actual-other-rest', reason: 'Le PJ choisit de travailler au lieu de terminer ce repos.' }))

  const choice = { name: 'brew_xge_healing_potion', input }
  const { before, result, selected, seen } = await play(t, call, [
    choice,
    params => {
      const made = ok(lastResult(params))
      assert.equal(made.paidCp, 2500)
      assert.equal(made.seconds, 28800)
      assert.equal(made.potionItemId, input.potionItemId)
      assert.equal(made.receipt.source.startLine, 2208)
      assert.equal(made.receipt.source.foundationLine, 1987)
      return 'Une potion de soins normale repose sur le plan de travail.'
    },
  ], 'Je prépare cette potion normale avec ma trousse et les fournitures établies pour cette dose.')
  assert.deepEqual(seen, [choice])
  assert.deepEqual(selected, [choice])
  const brewed = result.newGameState
  assert.equal(brewed.worldTimeSeconds - before.worldTimeSeconds, 28800)
  assert.equal(copperValue(before.dmTools.wallet) - copperValue(brewed.dmTools.wallet), 2500)
  assert.deepEqual(brewed.player.inventory, before.player.inventory)
  assert.deepEqual(brewed.player.hp, before.player.hp)
  assert.equal(brewed.dmTools.xgeBrewing.receipts.length, 1)
  const potion = brewed.droppedItems[input.potionItemId]
  assert.equal(potion.item.equipmentId, 'potion_of_healing')
  assert.deepEqual(potion.position, brewed.player.position)
  assert.equal(potion.item.quantity, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)

  ok(await call('advance_time', { seconds: 86400 }))
  const afterNextDate = await get(call)
  assert.deepEqual(afterNextDate.droppedItems[input.potionItemId], potion)
  assert.equal(afterNextDate.dmTools.magicItems[input.potionItemId].lastRechargeDay,
    brewed.dmTools.magicItems[input.potionItemId].lastRechargeDay + 1)
  const id = 'w27-brew-sql-' + process.pid
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: afterNextDate, history: [], adventureId: brewed.adventureId, characterId: brewed.characterId })
  const restored = await engine(t, { characterId: 'wizard', dice: '3,4,19' })
  ok(await restored('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  const hydrated = await get(restored)
  const broken = structuredClone(hydrated)
  delete broken.droppedItems[input.potionItemId]
  await unchanged(restored, 'replace_game_state', { gameState: broken }, 'XGE_BREWING_STATE_MISMATCH')
  assert.equal(ok(await restored('brew_xge_healing_potion', input)).replayed, true)
  assert.deepEqual(await get(restored), hydrated)
  await unchanged(restored, 'brew_xge_healing_potion', { ...input, eventId: 'another-dose', potionItemId: 'new-potion' },
    'XGE_BREW_SUPPLIES_ALREADY_USED')
  ok(await restored('pick_up_item', { itemId: input.potionItemId }))
  await unchanged(restored, 'use_healing_potion', { potionId: input.potionItemId }, 'DEDICATED_TOOL_REQUIRED')
  ok(await restored('update_hp', { entityId: 'player', delta: -10, reason: 'Vraie blessure avant de boire la potion.' }))
  const used = ok(await restored('use_magic_item', { itemId: input.potionItemId, targetId: 'player' }))
  assert.equal(used.roll.total, 9)
  assert.equal(used.healing, 9)
  assert.equal(used.consumedItemId, input.potionItemId)
  const consumed = await get(restored)
  assert.equal(consumed.dmTools.magicItems[input.potionItemId].status, 'consumed')
  assert.equal(consumed.player.inventory.some(item => item.id === input.potionItemId), false)
  assert.equal(ok(await restored('brew_xge_healing_potion', input)).replayed, true)
  assert.deepEqual(await get(restored), consumed)
  await saveSession(id, { gameState: consumed, history: [], adventureId: consumed.adventureId, characterId: consumed.characterId })
  ok(await restored('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await get(restored), consumed)

  const cell = consumed.player.position
  await unchanged(restored, 'create_magic_item', {
    templateId: 'potion_of_healing', itemId: input.potionItemId, name: 'Autre potion',
    description: 'Tentative de remplacer l’instance consommée.', cell,
  }, 'MAGIC_ITEM_ID_CONFLICT')
  ok(await restored('create_scene_object', {
    objectId: reusedChest, name: 'Coffre d’objets ordinaires', description: 'Le coffre contient une fiole ordinaire vide.',
    cell, kind: 'container', material: 'wood', size: 'small', resilience: 'resilient', contents: ['vial'],
  }))
  const released = ok(await restored('interact_object', { objectId: reusedChest, action: 'open' })).releasedItems
  assert.equal(released.length, 1)
  assert.equal(released[0].id, input.potionItemId)
  assert.equal(released[0].equipmentId, 'vial')
  ok(await restored('pick_up_item', { itemId: input.potionItemId }))
  const reused = await get(restored)
  await saveSession(id, { gameState: reused, history: [], adventureId: reused.adventureId, characterId: reused.characterId })
  ok(await restored('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await get(restored), reused)
  assert.equal(reused.dmTools.magicItems[input.potionItemId].status, 'consumed')
  await unchanged(restored, 'use_magic_item', { itemId: input.potionItemId, targetId: 'player' }, 'MAGIC_ITEM_INACTIVE')
  const forged = structuredClone(reused)
  const vial = forged.player.inventory.find(item => item.id === input.potionItemId)
  Object.assign(vial, { type: 'potion', equipmentId: 'potion_of_healing', magical: true, quantity: 1 })
  await unchanged(restored, 'replace_game_state', { gameState: forged }, 'XGE_BREWING_STATE_MISMATCH')
  assert.equal(ok(await restored('roll_dice', { notation: '1d20' })).total, 19)
})

test('the supported normal-potion brewing recipe and unused ledger are exposed read-only', async t => {
  const call = await engine(t)
  const before = await get(call)
  const inventory = await call.client.listTools()
  for (const name of ['brew_xge_healing_potion', 'inspect_xge_brewing'])
    assert.ok(inventory.tools.some(tool => tool.name === name))
  const support = ok(await call('get_rules_support', { domain: 'xge_brewing' }))
  assert.ok(support.implemented.includes('canonical_physical_potion_at_worksite'))
  assert.deepEqual(ok(await call('inspect_xge_brewing')).receipts, [])
  assert.deepEqual(await get(call), before)
})
