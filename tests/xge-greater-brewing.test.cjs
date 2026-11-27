const assert = require('node:assert/strict')
const test = require('node:test')
Object.assign(process.env, {
  MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
})
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, adjacent } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { prepareHerbalismCourse, prepareBrewAtCurrentSite } = require('./helpers/xge-brewing-fixture.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
test.after(() => pg.restore())
const get = call => call('get_game_state')
async function unchanged(call, name, input, code) {
  const before = await get(call), answer = await call(name, input)
  assert.equal(answer.code, code, JSON.stringify(answer))
  assert.deepEqual(await get(call), before)
}
async function qualified(call, suffix) {
  const course = await prepareHerbalismCourse(call, suffix)
  await course.completeInstruction()
  ok(await call('complete_xge_training', course.completion))
  await course.nextDay()
  return course
}
const work = (projectId, index) => ({ eventId: projectId + '-effort-' + index, projectId,
  activitySource: 'Huit heures réellement consacrées à la potion majeure au lieu de travail avec la trousse maîtrisée.' })
async function nextDate(call, days = 1) {
  const state = await get(call), remainder = state.worldTimeSeconds % 86400
  ok(await call('advance_time', { seconds: days * 86400 - remainder }))
}
async function sqlRestore(t, call, suffix, dice = '19') {
  const state = await get(call), id = 'w30-greater-' + suffix + '-' + process.pid
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  const resumed = await engine(t, { characterId: 'wizard', dice })
  ok(await resumed('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await get(resumed), state)
  return resumed
}

test('100 gp supplies, five true workdays and canonical greater-potion consumption persist through real POST and SQL', async t => {
  let call = await engine(t, { characterId: 'wizard', dice: '19' })
  const course = await qualified(call, 'greater-real-course')
  const input = await prepareBrewAtCurrentSite(call, course.input.practiceToolItemId, {
    eventId: 'greater-project', potionItemId: 'greater-box:content:0', paid: { gp: 100 },
  })
  await unchanged(call, 'start_xge_greater_healing_potion', { ...input, paid: { gp: 99 } }, 'XGE_BREW_EXACT_COST_REQUIRED')
  const before = await get(call)
  const choice = { name: 'start_xge_greater_healing_potion', input }
  const turn = await play(t, call, [choice, params => {
    const started = ok(lastResult(params))
    assert.equal(started.paidCp, 10000)
    assert.equal(started.seconds, 0)
    assert.equal(started.completed, false)
    assert.equal(started.project.start.source.startLine, 2208)
    return 'Les fournitures sont achetées et réservées pour cette seule potion majeure.'
  }], 'J’achète ces fournitures pour préparer cette potion majeure de Xanathar.')
  assert.deepEqual(turn.selected, [choice])
  assert.deepEqual(turn.seen, [choice])
  const started = await get(call)
  assert.equal(started.worldTimeSeconds, before.worldTimeSeconds)
  assert.equal(copperValue(before.dmTools.wallet) - copperValue(started.dmTools.wallet), 10000)
  assert.equal(started.droppedItems?.[input.potionItemId], undefined)
  assert.equal(started.dmTools.magicItems?.[input.potionItemId], undefined)
  await unchanged(call, 'create_magic_item', { itemId: input.potionItemId, templateId: 'potion_of_greater_healing',
    name: 'Dose anticipée', description: 'Tentative de remplacer la dose promise.', cell: started.player.position }, 'XGE_BREW_OUTPUT_ID_RESERVED')
  await unchanged(call, 'create_spell_scroll', { itemId: input.potionItemId, spellId: 'magic-missile',
    name: 'Parchemin concurrent', description: 'Tentative de prendre la même identité physique.', cell: started.player.position }, 'XGE_BREW_OUTPUT_ID_RESERVED')
  await unchanged(call, 'create_ammunition', { itemId: input.potionItemId, ammunitionType: 'arrow', quantity: 20,
    name: 'Flèches concurrentes', description: 'Vrai lot qui demande une autre identité.', cell: started.player.position }, 'XGE_BREW_OUTPUT_ID_RESERVED')
  const box = { objectId: input.potionItemId, name: 'Coffre concurrent', description: 'Le coffre réel doit conserver une autre identité.',
    cell: started.player.position, kind: 'container', material: 'wood', size: 'small', resilience: 'resilient', contents: ['vial'] }
  await unchanged(call, 'create_scene_object', box, 'XGE_BREW_OUTPUT_ID_RESERVED')
  await unchanged(call, 'create_scene_object', { ...box, objectId: 'greater-box' }, 'XGE_BREW_OUTPUT_ID_RESERVED')
  const merchantFact = ok(await call('record_scene_fact', { cell: course.cell,
    description: 'Le représentant présent dispose réellement des articles ordinaires pour les offres qualifiées choisies.' })).worldFact
  const stock = { eventId: 'collision-source-stock', itemId: input.potionItemId, merchantId: course.input.instructorId,
    name: 'Article source concurrent', physicalFactId: merchantFact.id, actualInitialStockConfirmed: true }
  await unchanged(call, 'prepare_phb_rope_stock', { ...stock, ropeId: 'hempen_rope_50_feet' }, 'XGE_BREW_OUTPUT_ID_RESERVED')
  await unchanged(call, 'prepare_phb_launcher_stock', { ...stock, weaponId: 'shortbow' }, 'XGE_BREW_OUTPUT_ID_RESERVED')
  const { actualInitialStockConfirmed: _, ...adamantine } = stock
  await unchanged(call, 'prepare_adamantine_stock', { ...adamantine, kind: 'melee_weapon', weaponId: 'dagger',
    form: 'made', actualInitialAdamantineStockConfirmed: true }, 'XGE_BREW_OUTPUT_ID_RESERVED')
  await unchanged(call, 'brew_xge_healing_potion', { ...input, eventId: 'normal-reusing-reserved-supplies', potionItemId: 'other-normal', paid: { gp: 25 } }, 'XGE_BREW_SUPPLIES_ALREADY_USED')
  const day0 = work(input.eventId, 0)
  const first = ok(await call('work_xge_greater_healing_potion', day0))
  assert.equal(first.completedDays, 1)
  assert.equal(first.seconds, 28800)
  await unchanged(call, 'work_xge_greater_healing_potion', work(input.eventId, 1), 'XGE_BREW_WORKDAY_REQUIRED')
  call = await sqlRestore(t, call, 'partial')
  const partial = await get(call)
  assert.equal(ok(await call('start_xge_greater_healing_potion', input)).replayed, true)
  assert.equal(ok(await call('work_xge_greater_healing_potion', day0)).replayed, true)
  assert.deepEqual(await get(call), partial)
  const forged = structuredClone(partial)
  forged.dmTools.xgeBrewing.projects[0].segments[0].command += '-modified'
  await unchanged(call, 'replace_game_state', { gameState: forged }, 'XGE_BREWING_STATE_MISMATCH')
  const premature = structuredClone(partial)
  premature.player.inventory.push({ id: input.potionItemId, name: 'Objet anticipé', type: 'misc', equipmentId: 'vial' })
  await unchanged(call, 'replace_game_state', { gameState: premature }, 'XGE_BREWING_STATE_MISMATCH')
  for (let i = 1; i < 5; i++) {
    await nextDate(call, i === 2 ? 2 : 1)
    const answer = ok(await call('work_xge_greater_healing_potion', work(input.eventId, i)))
    assert.equal(answer.completedDays, i + 1)
    assert.equal(answer.completed, i === 4)
    if (i < 4) assert.equal((await get(call)).droppedItems?.[input.potionItemId], undefined)
  }
  const completed = await get(call)
  assert.equal(copperValue(completed.dmTools.wallet), copperValue(started.dmTools.wallet))
  assert.equal(completed.dmTools.xgeBrewing.projects[0].segments.reduce((n, s) => n + s.to - s.from, 0), 144000)
  assert.equal(completed.droppedItems[input.potionItemId].item.equipmentId, 'potion_of_greater_healing')
  assert.equal(completed.droppedItems[input.potionItemId].item.quantity, 1)
  assert.deepEqual(completed.droppedItems[input.potionItemId].position, completed.player.position)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  await unchanged(call, 'abandon_xge_greater_healing_potion', { eventId: 'erase-finished', projectId: input.eventId,
    forfeitSuppliesConfirmed: true, reason: 'Essai d’effacer une dose achevée.' }, 'XGE_BREW_EFFORT_COMPLETE')
  call = await sqlRestore(t, call, 'completed', '1,2,3,4,19')
  ok(await call('pick_up_item', { itemId: input.potionItemId }))
  ok(await call('update_hp', { entityId: 'player', delta: -30, reason: 'Blessure réelle avant de boire la potion majeure.' }))
  const healed = ok(await call('use_magic_item', { itemId: input.potionItemId, targetId: 'player' }))
  assert.equal(healed.roll.notation, '4d4+4')
  assert.equal(healed.roll.total, 14)
  assert.equal(healed.healing, 14)
  assert.equal(healed.consumedItemId, input.potionItemId)
  const consumed = await get(call)
  assert.equal(consumed.dmTools.magicItems[input.potionItemId].status, 'consumed')
  assert.equal(ok(await call('work_xge_greater_healing_potion', work(input.eventId, 4))).replayed, true)
  assert.deepEqual(await get(call), consumed)
  call = await sqlRestore(t, call, 'consumed')
  await unchanged(call, 'use_magic_item', { itemId: input.potionItemId, targetId: 'player' }, 'MAGIC_ITEM_INACTIVE')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('greater brewing retains a delayed project and explicit forfeiture without refund or reuse of supply and effort', async t => {
  let call = await engine(t, { characterId: 'wizard', dice: '19' })
  const course = await qualified(call, 'greater-delayed-course')
  const input = await prepareBrewAtCurrentSite(call, course.input.practiceToolItemId, {
    eventId: 'delayed-greater', potionItemId: 'delayed-potion', paid: { gp: 100 },
  })
  ok(await call('start_xge_greater_healing_potion', input))
  ok(await call('work_xge_greater_healing_potion', work(input.eventId, 0)))
  await nextDate(call, 10)
  await unchanged(call, 'work_xge_greater_healing_potion', work(input.eventId, 1), 'XGE_BREW_DELAY_ADJUDICATION_REQUIRED')
  const laterInput = await prepareBrewAtCurrentSite(call, course.input.practiceToolItemId, {
    eventId: 'new-before-abandon', potionItemId: 'new-dose', paid: { gp: 100 },
  })
  await unchanged(call, 'start_xge_greater_healing_potion', laterInput, 'XGE_BREW_OPEN_PROJECT')
  call = await sqlRestore(t, call, 'delay')
  const before = await get(call)
  const abandon = { eventId: 'abandon-delayed', projectId: input.eventId, forfeitSuppliesConfirmed: true,
    reason: 'Le PJ abandonne explicitement ce projet, sans remboursement automatique des fournitures.' }
  const answer = ok(await call('abandon_xge_greater_healing_potion', abandon))
  assert.equal(answer.refundedCp, 0)
  const after = await get(call)
  assert.deepEqual(after.dmTools.wallet, before.dmTools.wallet)
  assert.equal(after.worldTimeSeconds, before.worldTimeSeconds)
  assert.equal(after.dmTools.xgeBrewing.projects[0].segments.length, 1)
  assert.equal(after.droppedItems?.[input.potionItemId], undefined)
  assert.equal(ok(await call('abandon_xge_greater_healing_potion', abandon)).replayed, true)
  assert.deepEqual(await get(call), after)
  await unchanged(call, 'start_xge_greater_healing_potion', { ...input, eventId: 'reuse-abandoned', potionItemId: 'other-id' }, 'XGE_BREW_SUPPLIES_ALREADY_USED')
  await unchanged(call, 'work_xge_greater_healing_potion', work(input.eventId, 2), 'XGE_BREW_EFFORT_COMPLETE')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('greater brewing metadata stays explicit and read-only inspection grants no work or potion', async t => {
  const call = await engine(t, { characterId: 'wizard' }), before = await get(call)
  const tools = (await call.client.listTools()).tools
  for (const name of ['start_xge_greater_healing_potion', 'work_xge_greater_healing_potion', 'abandon_xge_greater_healing_potion'])
    assert.ok(tools.some(tool => tool.name === name))
  assert.deepEqual(ok(await call('inspect_xge_brewing')).projects, [])
  assert.ok(ok(await call('get_rules_support', { domain: 'xge_brewing' })).implemented.includes('greater_potion_five_real_workdays_and_100gp_supplies'))
  const input = await prepareBrewAtCurrentSite(call, 'not-owned-kit', { paid: { gp: 100 } })
  await unchanged(call, 'start_xge_greater_healing_potion', input, 'XGE_BREW_KIT_PROFICIENCY_REQUIRED')
  const inspected = await get(call)
  assert.equal(inspected.worldTimeSeconds, before.worldTimeSeconds)
  assert.equal(inspected.dmTools.xgeBrewing, undefined)
})

test('real postbattle ammunition recovery refuses a reserved greater-potion identity before its search minute', async t => {
  let call = await engine(t, { characterId: 'wizard', dice: '19' })
  const course = await qualified(call, 'greater-recovery-course')
  const input = await prepareBrewAtCurrentSite(call, course.input.practiceToolItemId, {
    eventId: 'greater-recovery-project', potionItemId: 'ammo-recovered:future-recovery', paid: { gp: 100 },
  })
  ok(await call('start_xge_greater_healing_potion', input))
  const agreement = ok(await call('record_scene_fact', { cell: course.cell,
    description: 'Le représentant présent vend réellement cet arc court ordinaire déjà fabriqué pour 25 po.' })).worldFact
  ok(await call('prepare_phb_launcher_stock', { eventId: 'recovery-source-bow', itemId: 'recovery-real-bow',
    merchantId: course.input.instructorId, weaponId: 'shortbow', name: 'Arc court réel', physicalFactId: agreement.id,
    actualInitialStockConfirmed: true }))
  ok(await call('create_trade_offer', { offerId: 'recovery-real-offer', merchantId: course.input.instructorId,
    itemIds: ['recovery-real-bow'], priceCp: 2500, agreementFactId: agreement.id, actualAgreementConfirmed: true }))
  ok(await call('purchase_trade_offer', { eventId: 'recovery-real-purchase', offerId: 'recovery-real-offer',
    paid: { gp: 25 }, workSeconds: 6, activitySource: 'Échange réellement exécuté de l’arc court contre les pièces détenues.' }))
  const state = await get(call)
  ok(await call('create_ammunition', { itemId: 'recovery-real-arrows', ammunitionType: 'arrow', quantity: 2,
    name: 'Deux flèches réelles', description: 'Ces deux projectiles existent dans la scène.', cell: state.player.position }))
  ok(await call('pick_up_item', { itemId: 'recovery-real-arrows' }))
  ok(await call('equip_item', { itemId: 'recovery-real-bow', operation: 'equip', slot: 'main_hand' }))
  call = await sqlRestore(t, call, 'before-real-recovery', '20,1,1,1,1,1,19')
  const beforeFight = await get(call)
  const enemyCell = adjacent(beforeFight).find(cell => cell.x !== course.cell.x || cell.y !== course.cell.y)
  assert.ok(enemyCell)
  const spawned = ok(await call('spawn_monster', { monsterType: 'goblin', cell: enemyCell, hpOverride: 200 }))
  const enemyId = spawned.monster?.id ?? spawned.id
  assert.ok(enemyId, JSON.stringify(spawned))
  ok(await call('enter_combat', { combatants: ['player', enemyId] }))
  assert.equal((await get(call)).currentTurn, 'player')
  const shot = { targetId: enemyId, weaponOrSpell: 'recovery-real-bow', ammunitionItemId: 'recovery-real-arrows' }
  assert.equal(ok(await call('resolve_player_attack', shot)).hit, false)
  ok(await call('next_turn', { actorId: 'player' }))
  ok(await call('next_turn', { actorId: enemyId, skipAction: true, reason: 'L’adversaire garde réellement sa position.' }))
  assert.equal(ok(await call('resolve_player_attack', shot)).hit, false)
  ok(await call('end_combat', { force: true, reason: 'L’adversaire abandonne réellement cette rencontre.' }))
  const afterFight = await get(call)
  assert.equal(Object.keys(afterFight.dmTools.ammunition.expenditures).length, 2)
  await unchanged(call, 'recover_ammunition', { recoveryId: 'future-recovery',
    combatGeneration: afterFight.combatGeneration, ammunitionType: 'arrow' }, 'XGE_BREW_OUTPUT_ID_RESERVED')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  const recovered = ok(await call('recover_ammunition', { recoveryId: 'different-real-recovery',
    combatGeneration: afterFight.combatGeneration, ammunitionType: 'arrow' }))
  assert.ok(recovered)
  const afterRecovery = await get(call)
  assert.equal(afterRecovery.worldTimeSeconds - afterFight.worldTimeSeconds, 60)
  assert.equal(afterRecovery.player.inventory.find(item => item.id === 'ammo-recovered:different-real-recovery').quantity, 1)
  assert.equal(afterRecovery.dmTools.xgeBrewing.projects[0].segments.length, 0)
  assert.equal(afterRecovery.droppedItems?.[input.potionItemId], undefined)
})
