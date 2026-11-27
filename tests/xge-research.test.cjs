const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, adjacent } = require('./helpers/mcp-toolkit.cjs')
const { prepareCourse, refused } = require('./helpers/xge-training-fixture.cjs')
const { prepareResearch } = require('./helpers/xge-research-fixture.cjs')
test.after(() => pg.restore())

async function sql(t, call, state, label) {
  const id = 'research-' + label + '-' + process.pid
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  return call('replace_game_state', { gameState: (await loadSession(id)).gameState })
}

test('five real study dates, original expense and qualified advantage earn exact source lore only after an explicit complication decision', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '4,15,1,6,19' })
  const f = await prepareResearch(call, { exceptional: true })
  assert.equal((await call('get_game_state')).worldTimeSeconds, f.initial.worldTimeSeconds)
  assert.equal((await call('inspect_xge_research')).projects[0].eligibleLoreIds.length, 0)
  await refused(call, 'resolve_xge_research', f.resolve, 'XGE_RESEARCH_FIVE_DAYS_REQUIRED')
  await f.week({ gp: 150 })
  const studied = await call('get_game_state')
  assert.equal(studied.dmTools.wallet.gp, f.initial.dmTools.wallet.gp - 150)
  assert.equal(studied.worldTimeSeconds, 4 * 86400 + 28800)
  assert.doesNotMatch(JSON.stringify(studied.dmTools.xgeResearch), /published creature type|published walk speed/)
  const result = ok(await call('resolve_xge_research', f.resolve))
  assert.equal(result.check.ability, 'int')
  assert.equal(result.check.proficient, false)
  assert.deepEqual(result.check.roll.rolls, [15])
  assert.match(result.check.roll.detail, /ADV:.*\[4\].*\[15\]/)
  assert.equal(result.bonus, 2)
  assert.equal(result.total, 21)
  assert.equal(result.loreCount, 3)
  assert.equal(result.chance.total, 1)
  assert.equal(result.row, 6)
  assert.deepEqual(result.learned, [])
  const before = await call('get_game_state')
  const view = ok(await call('inspect_xge_research')).projects[0]
  assert.deepEqual(await call('get_game_state'), before)
  assert.doesNotMatch(JSON.stringify(view), /published creature type|published walk speed/)
  assert.ok(view.eligibleLoreIds.every(id => /^lore-\d+$/.test(id)))
  const input = { ...f.settle, loreIds: view.eligibleLoreIds.slice(0, 3) }
  await refused(call, 'settle_xge_research', input, 'XGE_RESEARCH_COMPLICATION_DECISION_REQUIRED')
  const consequence = await f.fact('The MJ records the actual line 6 request and its accepted obligation, without a created quest, actor or automatic execution.')
  const decision = { complicationFactId: consequence.id, actualComplicationAdjudicated: true }
  await refused(call, 'settle_xge_research', { ...input, ...decision, loreIds: [...input.loreIds.slice(0, 2), 'greenfast_lead'] }, 'XGE_RESEARCH_LORE_SELECTION_INVALID')
  const settled = ok(await call('settle_xge_research', { ...input, ...decision }))
  assert.deepEqual(settled.lore.map(x => x.id), input.loreIds)
  assert.ok(settled.lore.every(x => x.text.startsWith('Goblin — published ')))
  assert.equal(settled.questUnlocked, false)
  assert.equal(settled.itemsGranted, 0)
  const state = await call('get_game_state')
  assert.deepEqual(state.player.inventory, f.initial.player.inventory)
  assert.deepEqual(state.worldFacts.filter(x => x.clueId), (f.initial.worldFacts ?? []).filter(x => x.clueId))
  const fresh = await engine(t, { characterId: 'wizard', dice: '19' })
  ok(await sql(t, fresh, state, 'settled'))
  const replay = ok(await fresh('settle_xge_research', { ...input, ...decision }))
  assert.deepEqual(replay.lore, settled.lore)
  assert.equal(replay.replayed, true)
  assert.equal(ok(await fresh('roll_dice', { notation: '1d20' })).total, 19)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('inadequate denominations, unknown profile and overlong actual pause preserve clock, funds, original effort and die', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '19' })
  const f = await prepareResearch(call, { adopt: false, start: false })
  await refused(call, 'start_xge_research', f.input, 'XGE_RESEARCH_NOT_ADOPTED')
  ok(await call('adopt_xge_research', f.adoption))
  await refused(call, 'start_xge_research', { ...f.input, profileId: 'unregistered-quest-monster' }, 'XGE_RESEARCH_PROFILE_UNAVAILABLE')
  ok(await call('start_xge_research', f.input))
  await refused(call, 'work_xge_research', f.effort('short-expense', 3600, { paid: { gp: 49 } }), 'XGE_RESEARCH_EXPENSE_REQUIRED')
  await refused(call, 'work_xge_research', f.effort('not-held-denominations', 3600, { paid: { pp: 5 } }), 'XGE_RESEARCH_FUNDS_REQUIRED')
  const effort = f.effort('real-partial', 3600, { paid: { gp: 50 } })
  ok(await call('work_xge_research', effort))
  const paid = await call('get_game_state')
  assert.equal(ok(await call('work_xge_research', effort)).replayed, true)
  assert.deepEqual(await call('get_game_state'), paid)
  await refused(call, 'work_xge_research', { ...effort, seconds: 3599 }, 'XGE_RESEARCH_EVENT_CONFLICT')
  ok(await call('advance_time', { seconds: 864000 }))
  await refused(call, 'work_xge_research', f.effort('outside-source-window', 3600), 'XGE_RESEARCH_DELAY_REVIEW_REQUIRED')
  const state = await call('get_game_state')
  assert.equal(state.dmTools.wallet.gp, f.initial.dmTools.wallet.gp - 50)
  const view = ok(await call('inspect_xge_research')).projects[0]
  assert.equal(view.status, 'awaiting_delay_review')
  assert.deepEqual(view.days, [])
  ok(await sql(t, call, state, 'delay'))
  const forged = structuredClone(state)
  forged.dmTools.xgeResearch.events.find(e => e.operation === 'work').payload.paidCp += 5000
  assert.equal((await sql(t, call, forged, 'forged-expense')).code, 'XGE_RESEARCH_STATE_MISMATCH')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('Research and XGE Training share the actual eight-hour date in both directions', async t => {
  for (const researchFirst of [true, false]) {
    const call = await engine(t, { characterId: 'wizard', dice: '19' })
    const f = await prepareResearch(call)
    const training = await prepareCourse(call, { subjectId: 'orc' })
    if (researchFirst) {
      ok(await call('work_xge_research', f.effort('real-study-day', 28800, { paid: { gp: 50 } })))
      await refused(call, 'work_xge_training', await training.lesson('not-a-second-day', 1), 'DOWNTIME_SHARED_DAY_REQUIRED')
    } else {
      ok(await call('work_xge_training', await training.lesson('real-training-day')))
      await refused(call, 'work_xge_research', f.effort('not-a-second-study-day', 1, { paid: { gp: 50 } }), 'DOWNTIME_SHARED_DAY_REQUIRED')
    }
    const state = await call('get_game_state')
    ok(await sql(t, call, state, 'shared-' + researchFirst))
    assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  }
})

test('controlled preexisting supported Inspiration window retains the original INT die through SQL and one later bonus', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '10,19' })
  const f = await prepareResearch(call)
  await f.week()
  const before = await call('get_game_state')
  // Controlled previously acquired supported effect for the continuation test.
  // This does not claim a public NPC Bardic Inspiration producer.
  before.hero.inspiration.push({ targetId: 'player', expiresAt: before.worldTimeSeconds + 600, die: 6 })
  ok(await call('replace_game_state', { gameState: before }))
  const held = ok(await call('resolve_xge_research', f.resolve)).pendingReaction
  assert.equal(held.command.result.roll.total, 14)
  assert.ok(held.options.includes('bardic_inspiration'))
  const saved = await call('get_game_state')
  const replay = ok(await call('resolve_xge_research', f.resolve))
  assert.equal(replay.replayed, true)
  assert.deepEqual(replay.pendingReaction, held)
  assert.deepEqual(await call('get_game_state'), saved)
  const fresh = await engine(t, { characterId: 'wizard', dice: '6,99,19' })
  ok(await sql(t, fresh, saved, 'held'))
  const forged = structuredClone(saved)
  forged.hero.pending.command.result.roll.total += 1
  assert.equal((await sql(t, fresh, forged, 'forged-held')).code, 'XGE_RESEARCH_STATE_MISMATCH')
  const final = ok(await fresh('resolve_reaction', { pendingId: held.id, choice: 'bardic_inspiration' }))
  assert.equal(final.total, 20)
  assert.equal(final.chance.total, 99)
  assert.equal(final.loreCount, 2)
  assert.equal((await fresh('get_game_state')).hero.inspiration.length, 0)
  assert.equal(ok(await fresh('roll_dice', { notation: '1d20' })).total, 19)
})

test('actual local sage access and an explicit complication choice never earn lore or extra charges from a failed check', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '1,1,19' })
  const f = await prepareResearch(call, { start: false })
  const cell = adjacent(await call('get_game_state'))[0]
  await refused(call, 'start_xge_research', {
    ...f.input, siteKind: 'sage', sageId: 'absent-sage',
  }, 'XGE_RESEARCH_SAGE_REQUIRED')
  ok(await call('create_npc', {
    npcId: 'actual-sage', name: 'The Sage', statBlock: 'goblin', cell, disposition: 'neutral', visible: true,
    description: 'An existing person willing to share access to their reference collection.',
  }))
  const access = ok(await call('record_scene_fact', { cell, description: 'The present sage actually agrees to research access at this position.' })).worldFact
  ok(await call('start_xge_research', { ...f.input, siteKind: 'sage', sageId: 'actual-sage', accessFactId: access.id }))
  await f.week()
  const choice = await f.fact('The MJ chooses the printed gift-request complication if the independent occurrence actually happens.')
  const result = ok(await call('resolve_xge_research', { ...f.resolve, selection: 'choose', chosenRow: 2, selectionFactId: choice.id }))
  assert.equal(result.total, 5)
  assert.equal(result.loreCount, 0)
  assert.equal(result.row, 2)
  assert.equal(result.tableRoll, undefined)
  assert.deepEqual(ok(await call('inspect_xge_research')).projects[0].eligibleLoreIds, [])
  const fact = await f.fact('The actual sage requests a gift. The request is recorded without an automatic payment or attitude change.')
  const input = { ...f.settle, complicationFactId: fact.id, actualComplicationAdjudicated: true }
  await refused(call, 'settle_xge_research', { ...input, loreIds: ['lore-1'] }, 'XGE_RESEARCH_LORE_SELECTION_INVALID')
  const before = await call('get_game_state')
  assert.deepEqual(ok(await call('settle_xge_research', { ...input, loreIds: [] })).lore, [])
  const after = await call('get_game_state')
  assert.deepEqual(after.dmTools.wallet, before.dmTools.wallet)
  assert.deepEqual(after.npcs, before.npcs)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
