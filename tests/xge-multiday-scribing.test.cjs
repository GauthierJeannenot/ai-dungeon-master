const test = require('node:test'), assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { engine, ok, adjacent, grid, spawn } = require('./helpers/mcp-toolkit.cjs')
const { prepareMultiDayScroll, fundMultiDayScribing, nextMultiDayScribingDate } = require('./helpers/xge-multiday-scribing-fixture.cjs')
const { prepareScribingAtCurrentSite } = require('./helpers/xge-scribing-fixture.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
const { playerSeesCell } = require('../mcp-server/dist/lib/scene-perception.js')
test.after(() => pg.restore())
async function unchanged(call, name, input, code) {
  const before = await call('get_game_state'), r = await call(name, input)
  assert.equal(r.code, code, JSON.stringify(r)); assert.deepEqual(await call('get_game_state'), before)
}
async function setup(t, id = 'actual-three-date-scroll', coins = { gp: 250 }) {
  const call = await engine(t, { characterId: 'wizard', dice: '19' })
  ok(await call('prepare_spells', { spellIds: ['misty-step', 'magic-missile'] }))
  await fundMultiDayScribing(call, { treasureId: id + '-actual-funds', coins })
  return { call, prepared: await prepareMultiDayScroll(call, { projectId: id }) }
}
async function sql(t, call, dice = '19') {
  const state = await call('get_game_state'), id = 'w34-scribing-' + process.pid + '-' + Math.random()
  t.after(() => deleteSession(id)); await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  const next = await engine(t, { adventureId: state.adventureId, characterId: state.characterId, dice })
  ok(await next('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await next('get_game_state'), state); return next
}
async function complete(call, prepared, first = 0) {
  for (let index = first; index < 3; index++) { if (index) await nextMultiDayScribingDate(call); ok(await call('work_xge_spell_scroll_project', prepared.work(index))) }
}

test('actual POST starts a paid source scroll, three real dates and SQL retain one physical Misty Step which really teleports and consumes without a slot or die', async t => {
  let { call, prepared } = await setup(t)
  const command = { name: 'start_xge_spell_scroll_project', input: prepared.input }
  const played = await play(t, call, [command, params => {
    const r = ok(lastResult(params)); assert.equal(r.completedDays, 0); assert.equal(r.paidCp, 25000)
    return 'Le papier et l’encre de ce parchemin sont achetés ; aucune journée n’a été travaillée.'
  }], 'Je commence ce parchemin de Pas brumeux avec mes fournitures réelles.')
  assert.deepEqual(played.selected, [command]); assert.deepEqual(played.seen, [command])
  const before = played.before, started = await call('get_game_state')
  assert.equal(started.worldTimeSeconds, before.worldTimeSeconds)
  assert.equal(copperValue(before.dmTools.wallet) - copperValue(started.dmTools.wallet), 25000)
  assert.equal(started.droppedItems?.[prepared.input.scrollItemId], undefined)
  ok(await call('work_xge_spell_scroll_project', prepared.work(0)))
  await unchanged(call, 'work_xge_spell_scroll_project', prepared.work(1), 'XGE_SCRIBE_DAY_BOUNDARY')
  call = await sql(t, call); const frozen = await call('get_game_state')
  assert.equal(ok(await call('start_xge_spell_scroll_project', prepared.input)).replayed, true)
  assert.equal(ok(await call('work_xge_spell_scroll_project', prepared.work(0))).replayed, true)
  assert.deepEqual(await call('get_game_state'), frozen)
  await complete(call, prepared, 1)
  const done = await call('get_game_state'), p = done.dmTools.xgeScrollScribing.projects[0]
  assert.equal(p.segments.length, 3); assert.equal(new Set(p.segments.map(e => e.day)).size, 3)
  assert.ok(p.segments.every(e => e.to - e.from === 28800)); assert.equal(p.completion.at, p.segments[2].to)
  assert.equal(done.droppedItems[prepared.input.scrollItemId].item.quantity, 1)
  assert.deepEqual(done.player.spellSlots, before.player.spellSlots)
  call = await sql(t, call, '20,1,19'); ok(await call('pick_up_item', { itemId: prepared.input.scrollItemId }))
  const foe = await spawn(call, 'goblin')
  ok(await call('enter_combat', { combatants: ['player', foe.id] }))
  const held = await call('get_game_state'), destination = adjacent(held).find(c => grid(held).free(c) && playerSeesCell(held, c))
  assert.ok(destination)
  const used = ok(await call('use_spell_scroll', { itemId: prepared.input.scrollItemId, toCell: destination }))
  assert.equal(used.spellScrollUse.consumed, true); assert.equal(used.spellSlotSpent, false)
  const after = await call('get_game_state'); assert.deepEqual(after.player.position, destination)
  assert.equal(after.currentTurn, 'player'); assert.equal(after.bonusActionUsed.player, true)
  assert.equal(after.actionUsed.player ?? false, false); assert.equal(after.hero.actionCredits, 1)
  assert.deepEqual(after.player.spellSlots, before.player.spellSlots); assert.equal(after.dmTools.spellScrolls[prepared.input.scrollItemId].status, 'consumed')
  call = await sql(t, call)
  await unchanged(call, 'use_spell_scroll', { itemId: prepared.input.scrollItemId, toCell: held.player.position }, 'SPELL_SCROLL_CONSUMED')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('source cost/funds and real reserved identities refuse before mutation, supply reuse and restoration tampering cannot manufacture early output, abandonment retains paid history', async t => {
  let { call, prepared } = await setup(t, 'actual-reserved-scroll', { gp: 300 })
  await unchanged(call, 'start_xge_spell_scroll_project', { ...prepared.input, paid: { gp: 249 } }, 'XGE_SCRIBE_EXACT_COST_REQUIRED')
  await unchanged(call, 'start_xge_spell_scroll_project', { ...prepared.input, paid: { cp: 25000 } }, 'XGE_SCRIBE_FUNDS_REQUIRED')
  await unchanged(call, 'start_xge_spell_scroll_project', { ...prepared.input, suppliesFactId: 'unrepresented-supplies' }, 'XGE_SCRIBE_SITE_FACT_REQUIRED')
  ok(await call('start_xge_spell_scroll_project', prepared.input))
  const state = await call('get_game_state')
  await unchanged(call, 'create_scene_object', { objectId: prepared.input.scrollItemId, name: 'Coffre réel', description: 'Un coffre réel constaté ici.',
    cell: state.player.position, kind: 'container', material: 'wood', size: 'small', resilience: 'resilient' }, 'XGE_SCRIBE_OUTPUT_ID_RESERVED')
  await unchanged(call, 'create_treasure', { treasureId: prepared.input.scrollItemId, name: 'Vraies pièces constatées', description: 'Un trésor de pièces réellement constaté ici.',
    cell: state.player.position, mode: 'individual', challengeBand: '0-4' }, 'XGE_SCRIBE_OUTPUT_ID_RESERVED')
  await unchanged(call, 'create_magic_item', { itemId: prepared.input.scrollItemId, templateId: 'potion_of_healing', name: 'Potion réellement constatée',
    description: 'Une potion réelle constatée ici.', cell: state.player.position }, 'XGE_SCRIBE_OUTPUT_ID_RESERVED')
  await unchanged(call, 'create_ammunition', { itemId: prepared.input.scrollItemId, ammunitionType: 'arrow', quantity: 1,
    name: 'Flèche réellement constatée', description: 'Une vraie flèche constatée ici.', cell: state.player.position }, 'XGE_SCRIBE_OUTPUT_ID_RESERVED')
  const beforePickup = await call('get_game_state'), refusedPickup = await call('pick_up_item', { itemId: prepared.input.scrollItemId })
  assert.ok(refusedPickup.error); assert.deepEqual(await call('get_game_state'), beforePickup)
  const early = structuredClone(state); early.player.inventory.push({ id: prepared.input.scrollItemId, name: 'Fausse sortie anticipée', type: 'misc' })
  await unchanged(call, 'replace_game_state', { gameState: early }, 'XGE_SCRIBING_STATE_MISMATCH')
  const legacy = await prepareScribingAtCurrentSite(call, { eventId: 'separate-one-day', scrollItemId: 'separate-one-day-scroll' })
  await unchanged(call, 'scribe_xge_spell_scroll', { ...legacy, suppliesFactId: prepared.input.suppliesFactId }, 'XGE_SCRIBE_SUPPLIES_ALREADY_USED')
  ok(await call('work_xge_spell_scroll_project', prepared.work(0)))
  const stock = index => ({ itemId: 'actual-capacity-stock-' + index, spellId: 'magic-missile', name: 'Parchemin réel ' + index,
    description: 'Le MJ constate ce vrai parchemin de Projectile magique à cette case.', cell: state.player.position })
  for (let index = 0; index < 63; index++) ok(await call('create_spell_scroll', stock(index)))
  assert.equal(Object.keys((await call('get_game_state')).dmTools.spellScrolls).length, 63)
  call = await sql(t, call) //63 real instances + one retained promised slot.
  await unchanged(call, 'create_spell_scroll', stock(63), 'SPELL_SCROLL_LIMIT')
  assert.equal(ok(await call('create_spell_scroll', stock(0))).alreadyCreated, true)
  const anotherLegacy = await prepareScribingAtCurrentSite(call, { eventId: 'capacity-one-date', scrollItemId: 'capacity-one-date-scroll' })
  await unchanged(call, 'scribe_xge_spell_scroll', anotherLegacy, 'SPELL_SCROLL_LIMIT')
  const before = await call('get_game_state'), input = { eventId: 'actual-abandon-scroll', projectId: prepared.input.projectId, reason: 'Le personnage abandonne réellement ce parchemin inachevé.' }
  assert.equal(ok(await call('abandon_xge_spell_scroll_project', input)).refundedCp, 0)
  assert.deepEqual((await call('get_game_state')).dmTools.wallet, before.dmTools.wallet)
  const next = await sql(t, call), frozen = await next('get_game_state')
  assert.equal(ok(await next('abandon_xge_spell_scroll_project', input)).replayed, true); assert.deepEqual(await next('get_game_state'), frozen)
  await unchanged(next, 'work_xge_spell_scroll_project', prepared.work(1), 'XGE_SCRIBE_EFFORT_COMPLETE')
  const replacement = await prepareMultiDayScroll(next, { projectId: 'subsequent-real-capacity-project' })
  ok(await next('start_xge_spell_scroll_project', replacement.input))
  await nextMultiDayScribingDate(next)
  await complete(next, replacement)
  assert.equal(Object.keys((await next('get_game_state')).dmTools.spellScrolls).length, 64)
  assert.equal((await next('get_game_state')).droppedItems[replacement.input.scrollItemId].item.quantity, 1)
  await unchanged(next, 'create_spell_scroll', stock(63), 'SPELL_SCROLL_LIMIT')
  await sql(t, next) //Abandonment released only its unproduced slot, not its ID/history.
  await unchanged(next, 'create_treasure', { treasureId: prepared.input.scrollItemId, name: 'Pièces réelles', description: 'Une réserve réelle de pièces à cette case.',
    cell: state.player.position, mode: 'authored', coins: { gp: 1 } }, 'XGE_SCRIBE_OUTPUT_ID_RESERVED')
  assert.equal(ok(await next('roll_dice', { notation: '1d20' })).total, 19)
})

test('actual repeated overdue decisions retain finite deadlines and globally cap real extra denominations at250gp without a second doubling or free effort', async t => {
  let { call, prepared } = await setup(t, 'actual-delayed-scroll', { gp: 501 })
  const startingCp = copperValue((await call('get_game_state')).dmTools.wallet)
  ok(await call('start_xge_spell_scroll_project', prepared.input)); ok(await call('work_xge_spell_scroll_project', prepared.work(0)))
  const initial = await call('get_game_state'), firstDay = initial.dmTools.xgeScrollScribing.projects[0].segments[0].day
  ok(await call('advance_time', { seconds: (firstDay + 6) * 86400 - initial.worldTimeSeconds }))
  await unchanged(call, 'work_xge_spell_scroll_project', prepared.work(1), 'XGE_SCRIBE_DELAY_ADJUDICATION_REQUIRED')
  async function decision(eventId, paid, deadline) {
    const state = await call('get_game_state'), ids = []
    for (const description of ['Le MJ constate une décision discrétionnaire réelle de poursuivre ce parchemin retardé.', 'Le MJ a réellement introduit une complication locale : une livraison de papier a été retardée ; sa conséquence mécanique est déjà résolue séparément.'])
      ids.push(ok(await call('record_scene_fact', { description, cell: state.player.position })).worldFact.id)
    return { eventId, projectId: prepared.input.projectId, decisionFactId: ids[0], extraComplicationFactId: ids[1], newDeadlineDay: deadline, paid,
      actualDiscretionaryDecisionConfirmed: true, actualIntroducedComplicationConfirmed: true, noUnresolvedMechanicalConsequenceConfirmed: true }
  }
  const first = await decision('real-delay-one', { gp: 200 }, firstDay + 6), a = ok(await call('adjudicate_xge_spell_scroll_delay', first))
  assert.equal(a.extraPaidCp, 20000); assert.equal(a.totalCostCp, 45000)
  const time = (await call('get_game_state')).worldTimeSeconds
  ok(await call('advance_time', { seconds: 86400 }))
  const tooMuch = await decision('real-delay-two', { gp: 51 }, firstDay + 9)
  await unchanged(call, 'adjudicate_xge_spell_scroll_delay', tooMuch, 'XGE_SCRIBE_DELAY_COST_CAP')
  const second = { ...tooMuch, paid: { gp: 50 } }; assert.equal(ok(await call('adjudicate_xge_spell_scroll_delay', second)).totalCostCp, 50000)
  assert.equal((await call('get_game_state')).worldTimeSeconds, time + 86400)
  ok(await call('advance_time', { seconds: (firstDay + 10) * 86400 - (await call('get_game_state')).worldTimeSeconds }))
  const third = await decision('real-delay-three', { gp: 1 }, firstDay + 12)
  await unchanged(call, 'adjudicate_xge_spell_scroll_delay', third, 'XGE_SCRIBE_DELAY_COST_CAP')
  const zero = { ...third, paid: {} }; assert.equal(ok(await call('adjudicate_xge_spell_scroll_delay', zero)).totalCostCp, 50000)
  call = await sql(t, call); const frozen = await call('get_game_state')
  assert.equal(ok(await call('adjudicate_xge_spell_scroll_delay', second)).replayed, true); assert.deepEqual(await call('get_game_state'), frozen)
  ok(await call('work_xge_spell_scroll_project', prepared.work(1))); await nextMultiDayScribingDate(call); ok(await call('work_xge_spell_scroll_project', prepared.work(2)))
  const done = await call('get_game_state'); assert.equal(done.dmTools.xgeScrollScribing.projects[0].segments.length, 3)
  assert.equal(startingCp - copperValue(done.dmTools.wallet), 50000); assert.ok(done.droppedItems[prepared.input.scrollItemId])
  assert.notEqual(done.phase, 'combat')
  ok(await call('pick_up_item', { itemId: prepared.input.scrollItemId }))
  const held = await call('get_game_state'), destination = adjacent(held).find(c => grid(held).free(c) && playerSeesCell(held, c))
  assert.ok(destination)
  const used = ok(await call('use_spell_scroll', { itemId: prepared.input.scrollItemId, toCell: destination }))
  assert.equal(used.spellScrollUse.consumed, true); assert.equal(used.spellSlotSpent, false)
  const moved = await call('get_game_state'); assert.deepEqual(moved.player.position, destination); assert.deepEqual(moved.player.spellSlots, held.player.spellSlots)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('an actual unchanged W33 one-day receipt survives real SQL in the new engine without adding projects, and its spent supply lot cannot start a second scroll', async t => {
  const path = require('node:path'), fs = require('node:fs'), crypto = require('node:crypto')
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js'), { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
  const publishedWorkspace = path.resolve(__dirname, '../output/w33-integrated')
  const oldDir = fs.existsSync(path.join(publishedWorkspace, 'w33-manifest.json')) ? publishedWorkspace : path.resolve(__dirname, '../../w33-integrated')
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(oldDir, 'w33-manifest.json'))).digest('hex'), '8c449be42661ec1176007258a61a18651a64f3857420964695a7a5aa3f734b03')
  const client = new Client({ name: 'actual-legacy-scribing', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: [path.join(oldDir, 'mcp-server/dist/mcp-server/index.js')], cwd: oldDir,
    env: { ...process.env, ADVENTURE_ID: 'sarah-of-yellowcrest-manor', CHARACTER_ID: 'wizard', AI_DM_TEST_DICE_SEQUENCE: '19' } }))
  t.after(() => client.close())
  const old = async (name, input = {}) => JSON.parse((await client.callTool({ name, arguments: input })).content.find(c => c.type === 'text').text)
  ok(await old('prepare_spells', { spellIds: ['misty-step', 'magic-missile'] }))
  await fundMultiDayScribing(old, { treasureId: 'actual-old-scribing-funds', coins: { gp: 300 } })
  const input = await prepareScribingAtCurrentSite(old, { eventId: 'actual-w33-one-date', scrollItemId: 'actual-w33-legacy-scroll' })
  const made = ok(await old('scribe_xge_spell_scroll', input)), state = await old('get_game_state')
  assert.equal(made.seconds, 28800); assert.equal(made.paidCp, 2500)
  assert.equal(Object.hasOwn(state.dmTools.xgeScrollScribing, 'projects'), false)
  const fresh = await sql(t, old), restored = await fresh('get_game_state')
  assert.deepEqual(restored, state); assert.equal(Object.hasOwn(restored.dmTools.xgeScrollScribing, 'projects'), false)
  const receipt = JSON.stringify(restored.dmTools.xgeScrollScribing.receipts)
  assert.equal(ok(await fresh('scribe_xge_spell_scroll', input)).replayed, true)
  assert.equal(JSON.stringify((await fresh('get_game_state')).dmTools.xgeScrollScribing.receipts), receipt)
  const prepared = await prepareMultiDayScroll(fresh, { projectId: 'real-new-project-after-legacy' })
  await unchanged(fresh, 'start_xge_spell_scroll_project', { ...prepared.input, suppliesFactId: input.suppliesFactId }, 'XGE_SCRIBE_SUPPLIES_ALREADY_USED')
  ok(await fresh('start_xge_spell_scroll_project', prepared.input))
  assert.equal(JSON.stringify((await fresh('get_game_state')).dmTools.xgeScrollScribing.receipts), receipt)
  assert.equal(ok(await fresh('roll_dice', { notation: '1d20' })).total, 19)
})
