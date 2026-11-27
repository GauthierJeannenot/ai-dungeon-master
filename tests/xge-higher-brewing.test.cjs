const assert = require('node:assert/strict')
const test = require('node:test')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { prepareHerbalismCourse } = require('./helpers/xge-brewing-fixture.cjs')
const { higherPotionRecipes, collectHigherBrewingFunds, prepareHigherPotion, higherPotionWork, advanceHigherBrewingDate } = require('./helpers/xge-higher-brewing-fixture.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
test.after(() => pg.restore())
const get = call => call('get_game_state')
async function unchanged(call, name, input, code) {
  const before = await get(call), result = await call(name, input)
  assert.equal(result.code, code, JSON.stringify(result))
  assert.deepEqual(await get(call), before)
}
async function setup(t, potionType, id, fundingMultiplier = 1) {
  const call = await engine(t, { characterId: 'wizard', dice: '19' })
  const course = await prepareHerbalismCourse(call, id + '-course')
  await course.completeInstruction()
  ok(await call('complete_xge_training', course.completion))
  await course.nextDay()
  await collectHigherBrewingFunds(call, higherPotionRecipes[potionType].gp * fundingMultiplier, id + '-real-funds')
  const input = await prepareHigherPotion(call, course.input.practiceToolItemId, { potionType, eventId: id })
  return { call, course, input }
}
async function restore(t, call, suffix, dice = '19') {
  const state = await get(call), id = `w32-higher-${suffix}-${process.pid}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  const fresh = await engine(t, { characterId: 'wizard', dice })
  ok(await fresh('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await get(fresh), state)
  return fresh
}

for (const potionType of ['superior', 'supreme']) test(`real ${potionType} supplies, ${higherPotionRecipes[potionType].days} actual workdates and canonical consumption survive POST and SQL`, async t => {
  let { call, course, input } = await setup(t, potionType, 'actual-' + potionType)
  const recipe = higherPotionRecipes[potionType], costCp = recipe.gp * 100
  await unchanged(call, 'start_xge_healing_potion_project', { ...input, paid: { gp: recipe.gp - 1 } }, 'XGE_BREW_EXACT_COST_REQUIRED')
  await unchanged(call, 'start_xge_healing_potion_project', { ...input, paid: { cp: costCp } }, 'XGE_BREW_FUNDS_REQUIRED')
  await unchanged(call, 'start_xge_healing_potion_project', { ...input, potionItemId: course.input.practiceToolItemId }, 'XGE_BREW_OUTPUT_ID_CONFLICT')
  const before = await get(call), choice = { name: 'start_xge_healing_potion_project', input }
  const turn = await play(t, call, [choice, params => {
    const result = ok(lastResult(params))
    assert.equal(result.paidCp, costCp)
    assert.equal(result.requiredDays, recipe.days)
    assert.equal(result.seconds, 0)
    assert.equal(result.project.start.source.startLine, 2208)
    return 'Les fournitures de cette seule potion sont achetées, le véritable travail reste à accomplir.'
  }], `Je prépare explicitement cette potion ${potionType} avec les fournitures réelles et la trousse maîtrisée.`)
  assert.deepEqual(turn.seen, [choice])
  assert.deepEqual(turn.selected, [choice])
  const started = await get(call)
  assert.equal(started.worldTimeSeconds, before.worldTimeSeconds)
  assert.equal(copperValue(before.dmTools.wallet) - copperValue(started.dmTools.wallet), costCp)
  assert.equal(started.droppedItems?.[input.potionItemId], undefined)
  await unchanged(call, 'work_xge_greater_healing_potion', higherPotionWork(input.eventId, 0), 'XGE_BREW_RECIPE_TOOL_REQUIRED')
  await unchanged(call, 'abandon_xge_greater_healing_potion', { eventId: 'legacy-abandon-' + potionType,
    projectId: input.eventId, forfeitSuppliesConfirmed: true, reason: 'La voie historique ne transforme pas le type de projet.' }, 'XGE_BREW_RECIPE_TOOL_REQUIRED')
  const work0 = higherPotionWork(input.eventId, 0)
  for (let day = 0; day < recipe.days; day++) {
    if (day) await advanceHigherBrewingDate(call, day === 6 ? 2 : 1)
    const result = ok(await call('work_xge_healing_potion_project', higherPotionWork(input.eventId, day)))
    assert.equal(result.completedDays, day + 1)
    assert.equal(result.completed, day === recipe.days - 1)
    const state = await get(call)
    assert.equal(Boolean(state.droppedItems?.[input.potionItemId]), day === recipe.days - 1)
    if (day === 0) {
      await unchanged(call, 'work_xge_healing_potion_project', higherPotionWork(input.eventId, 'same-date'), 'XGE_BREW_WORKDAY_REQUIRED')
    }
    if (day === 4) {
      assert.equal(state.droppedItems?.[input.potionItemId], undefined, 'a stronger recipe cannot finish at the old greater five-day boundary')
      call = await restore(t, call, potionType + '-partial')
      const partial = await get(call)
      assert.equal(ok(await call('start_xge_healing_potion_project', input)).replayed, true)
      assert.equal(ok(await call('work_xge_healing_potion_project', work0)).replayed, true)
      assert.deepEqual(await get(call), partial)
      const altered = structuredClone(partial)
      altered.dmTools.xgeBrewing.projects[0].start.input.potionType = potionType === 'superior' ? 'supreme' : 'superior'
      await unchanged(call, 'replace_game_state', { gameState: altered }, 'XGE_BREWING_STATE_MISMATCH')
    }
  }
  const complete = await get(call), project = complete.dmTools.xgeBrewing.projects[0]
  assert.equal(project.segments.reduce((sum, s) => sum + s.to - s.from, 0), recipe.days * 28800)
  assert.equal(new Set(project.segments.map(s => s.day)).size, recipe.days)
  assert.equal(copperValue(complete.dmTools.wallet), copperValue(started.dmTools.wallet))
  assert.equal(complete.droppedItems[input.potionItemId].item.equipmentId, recipe.templateId)
  assert.equal(complete.droppedItems[input.potionItemId].item.quantity, 1)
  await unchanged(call, 'work_xge_healing_potion_project', higherPotionWork(input.eventId, 'finished'), 'XGE_BREW_EFFORT_COMPLETE')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19, 'no crafting or complication die was invented during three or four actual workweeks')
  call = await restore(t, call, potionType + '-completed', [...Array(recipe.dice).fill(1), 19].join(','))
  ok(await call('pick_up_item', { itemId: input.potionItemId }))
  ok(await call('update_hp', { entityId: 'player', delta: -30, reason: 'Vraie blessure avant de boire la potion achevée.' }))
  const use = ok(await call('use_magic_item', { itemId: input.potionItemId, targetId: 'player' }))
  assert.equal(use.roll.notation, `${recipe.dice}d4+${recipe.modifier}`)
  assert.equal(use.roll.total, recipe.dice + recipe.modifier)
  assert.equal(use.healing, recipe.dice + recipe.modifier)
  assert.equal(use.consumedItemId, input.potionItemId)
  const consumed = await get(call)
  assert.equal(consumed.dmTools.magicItems[input.potionItemId].status, 'consumed')
  assert.equal(ok(await call('start_xge_healing_potion_project', input)).replayed, true)
  assert.equal(ok(await call('work_xge_healing_potion_project', higherPotionWork(input.eventId, recipe.days - 1))).replayed, true)
  assert.deepEqual(await get(call), consumed)
  call = await restore(t, call, potionType + '-consumed')
  await unchanged(call, 'use_magic_item', { itemId: input.potionItemId, targetId: 'player' }, 'MAGIC_ITEM_INACTIVE')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('superior and supreme retain source-scaled calendar windows and one global original-cost delay cap over repeated real payments', async t => {
  for (const potionType of ['superior', 'supreme']) {
    let { call, input } = await setup(t, potionType, 'late-' + potionType, 2)
    const recipe = higherPotionRecipes[potionType]
    ok(await call('start_xge_healing_potion_project', input))
    ok(await call('work_xge_healing_potion_project', higherPotionWork(input.eventId, 0)))
    const firstDay = Math.floor((await get(call)).worldTimeSeconds / 86400)
    await advanceHigherBrewingDate(call, recipe.days * 2)
    await unchanged(call, 'work_xge_healing_potion_project', higherPotionWork(input.eventId, 1), 'XGE_BREW_DELAY_ADJUDICATION_REQUIRED')
    async function judgment(suffix, gp) {
      const state = await get(call), day = Math.floor(state.worldTimeSeconds / 86400)
      const fact = async description => ok(await call('record_scene_fact', { cell: state.player.position, description })).worldFact
      const decision = await fact('Le MJ arbitre ce retard réel avec une échéance finie et le supplément discrétionnaire choisi en vraies pièces.')
      const complication = await fact('Le représentant déjà présent a publiquement critiqué ce nouveau retard réel, sans conséquence mécanique encore à résoudre.')
      return { eventId: input.eventId + '-judgment-' + suffix, projectId: input.eventId,
        decisionFactId: decision.id, extraComplicationFactId: complication.id, newDeadlineDay: day,
        paid: gp % 10 === 0 ? { pp: gp / 10 } : { gp }, actualDiscretionaryDecisionConfirmed: true, actualIntroducedComplicationConfirmed: true,
        noUnresolvedMechanicalConsequenceConfirmed: true }
    }
    const first = await judgment('one', recipe.gp * 0.4)
    const a = ok(await call('adjudicate_xge_healing_potion_delay', first))
    assert.equal(a.event.previousDeadlineDay, firstDay + recipe.days * 2 - 1)
    assert.equal(a.extraPaidCp, recipe.gp * 40)
    await advanceHigherBrewingDate(call)
    const second = await judgment('two', recipe.gp * 0.6)
    const b = ok(await call('adjudicate_xge_healing_potion_delay', second))
    assert.equal(b.extraPaidCp, recipe.gp * 100)
    assert.equal(b.totalCostCp, recipe.gp * 200)
    call = await restore(t, call, potionType + '-paid-delays')
    const restored = await get(call)
    assert.equal(ok(await call('adjudicate_xge_healing_potion_delay', first)).replayed, true)
    assert.deepEqual(await get(call), restored)
    await advanceHigherBrewingDate(call)
    const third = await judgment('three', 1)
    await unchanged(call, 'adjudicate_xge_healing_potion_delay', third, 'XGE_BREW_DELAY_COST_CAP')
    const beforeAbandon = await get(call)
    ok(await call('abandon_xge_healing_potion_project', { eventId: input.eventId + '-abandon', projectId: input.eventId,
      forfeitSuppliesConfirmed: true, reason: 'Abandon explicite sans remboursement des fournitures et suppléments déjà payés.' }))
    const abandoned = await get(call)
    assert.deepEqual(abandoned.dmTools.wallet, beforeAbandon.dmTools.wallet)
    assert.equal(abandoned.dmTools.xgeBrewing.projects[0].segments.length, 1)
    assert.equal(abandoned.droppedItems?.[input.potionItemId], undefined)
    assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  }
})
