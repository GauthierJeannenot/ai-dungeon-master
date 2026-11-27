const assert = require('node:assert/strict')
const test = require('node:test')
Object.assign(process.env, {
  MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
})
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { prepareHerbalismCourse, prepareBrewAtCurrentSite } = require('./helpers/xge-brewing-fixture.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
test.after(() => pg.restore())
const get = call => call('get_game_state')
const work = (id, index) => ({ eventId: id + '-work-' + index, projectId: id,
  activitySource: 'Huit heures réellement consacrées à la même potion avec la trousse maîtrisée au site original.' })
async function unchanged(call, name, input, code) {
  const before = await get(call), answer = await call(name, input)
  assert.equal(answer.code, code, JSON.stringify(answer))
  assert.deepEqual(await get(call), before)
}
async function advanceDates(call, dates = 1) {
  const state = await get(call)
  ok(await call('advance_time', { seconds: dates * 86400 - state.worldTimeSeconds % 86400 }))
}
async function prepared(t, id, { firstEffort = true, overdue = true } = {}) {
  const call = await engine(t, { characterId: 'wizard', dice: '19' })
  const course = await prepareHerbalismCourse(call, id + '-course')
  await course.completeInstruction()
  ok(await call('complete_xge_training', course.completion))
  await course.nextDay()
  const input = await prepareBrewAtCurrentSite(call, course.input.practiceToolItemId, {
    eventId: id, potionItemId: id + '-potion', paid: { gp: 100 },
  })
  ok(await call('start_xge_greater_healing_potion', input))
  if (firstEffort) ok(await call('work_xge_greater_healing_potion', work(id, 0)))
  if (firstEffort && overdue) await advanceDates(call, 10)
  return { call, input, course }
}
async function judgment(call, id, eventId, { paid = {}, newDeadlineDay } = {}) {
  const state = await get(call), day = Math.floor(state.worldTimeSeconds / 86400)
  const decision = ok(await call('record_scene_fact', { cell: state.player.position,
    description: 'Le MJ choisit explicitement de prolonger ce projet en retard jusqu’à une échéance finie, avec la dépense réelle distinctement choisie.' })).worldFact
  const complication = ok(await call('record_scene_fact', { cell: state.player.position,
    description: 'Le représentant déjà présent a publiquement critiqué la lenteur de cette préparation. Cette complication a réellement été introduite et ne laisse aucun effet mécanique à résoudre.' })).worldFact
  return { eventId, projectId: id, decisionFactId: decision.id, extraComplicationFactId: complication.id,
    newDeadlineDay: newDeadlineDay ?? day + 3, paid, actualDiscretionaryDecisionConfirmed: true,
    actualIntroducedComplicationConfirmed: true, noUnresolvedMechanicalConsequenceConfirmed: true }
}
async function restored(t, call, suffix) {
  const state = await get(call), id = 'w31-delay-' + suffix + '-' + process.pid
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  const fresh = await engine(t, { characterId: 'wizard', dice: '19' })
  ok(await fresh('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await get(fresh), state)
  return fresh
}

test('a real delayed greater potion resumes after an explicit zero-cost MJ POST and completes only its five actual dates through SQL', async t => {
  let { call, input } = await prepared(t, 'w31-zero-extra')
  await unchanged(call, 'work_xge_greater_healing_potion', work(input.eventId, 1), 'XGE_BREW_DELAY_ADJUDICATION_REQUIRED')
  const choice = { name: 'adjudicate_xge_greater_healing_delay', input: await judgment(call, input.eventId, 'w31-zero-judgment') }
  const before = await get(call)
  const turn = await play(t, call, [choice, params => {
    const answer = ok(lastResult(params))
    assert.equal(answer.paidCp, 0)
    assert.equal(answer.totalCostCp, 10000)
    assert.equal(answer.seconds, 0)
    assert.equal(answer.actionSpent, false)
    assert.equal(answer.automaticConsequenceApplied, false)
    assert.equal(answer.event.source.startLine, 1989)
    assert.equal(answer.event.source.complicationsStartLine, 1991)
    assert.equal(answer.event.source.complicationsEndLine, 1995)
    return 'Le MJ retient cette prolongation et la complication déjà introduite, sans supplément.'
  }], 'Je demande au MJ d’arbitrer ce retard sans supplément, puis je reprendrai le travail explicitement.')
  assert.deepEqual(turn.seen, [choice])
  assert.deepEqual(turn.selected, [choice])
  const adjudicated = await get(call)
  assert.equal(adjudicated.worldTimeSeconds, before.worldTimeSeconds)
  assert.deepEqual(adjudicated.dmTools.wallet, before.dmTools.wallet)
  assert.deepEqual(adjudicated.hero.effects, before.hero.effects)
  assert.equal(adjudicated.dmTools.xgeBrewing.projects[0].segments.length, 1)
  assert.equal(adjudicated.droppedItems?.[input.potionItemId], undefined)
  call = await restored(t, call, 'zero-before-resumption')
  const resumedBefore = await get(call)
  assert.equal(ok(await call(choice.name, choice.input)).replayed, true)
  assert.deepEqual(await get(call), resumedBefore)
  for (let day = 1; day < 5; day++) {
    if (day > 1) await advanceDates(call)
    const answer = ok(await call('work_xge_greater_healing_potion', work(input.eventId, day)))
    assert.equal(answer.completedDays, day + 1)
    assert.equal(answer.completed, day === 4)
  }
  const completed = await get(call), project = completed.dmTools.xgeBrewing.projects[0]
  assert.equal(project.segments.length, 5)
  assert.equal(project.segments.reduce((sum, segment) => sum + segment.to - segment.from, 0), 144000)
  assert.equal(project.segments[4].day, choice.input.newDeadlineDay)
  assert.equal(completed.droppedItems[input.potionItemId].item.equipmentId, 'potion_of_greater_healing')
  call = await restored(t, call, 'zero-completed')
  const beforeReplay = await get(call)
  assert.equal(ok(await call(choice.name, choice.input)).replayed, true)
  assert.equal(ok(await call('work_xge_greater_healing_potion', work(input.eventId, 4))).replayed, true)
  assert.deepEqual(await get(call), beforeReplay)
  const another = await judgment(call, input.eventId, 'w31-completed-delay')
  await unchanged(call, choice.name, another, 'XGE_BREW_DELAY_DECISION_REQUIRED')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('repeated real delays retain exact supplementary payments under one global 100 gp cap, including after SQL and abandonment', async t => {
  let { call, input } = await prepared(t, 'w31-paid-extra')
  const first = await judgment(call, input.eventId, 'w31-first-delay', { paid: { gp: 40 } })
  const currentDay = Math.floor((await get(call)).worldTimeSeconds / 86400)
  first.newDeadlineDay = currentDay
  await unchanged(call, 'adjudicate_xge_greater_healing_delay', { ...first, newDeadlineDay: currentDay - 1 }, 'XGE_BREW_DELAY_DEADLINE_REQUIRED')
  const firstDay = (await get(call)).dmTools.xgeBrewing.projects[0].segments[0].day
  await unchanged(call, 'adjudicate_xge_greater_healing_delay', { ...first, newDeadlineDay: firstDay + 366 }, 'XGE_BREW_DELAY_DEADLINE_REQUIRED')
  await unchanged(call, 'adjudicate_xge_greater_healing_delay', { ...first, extraComplicationFactId: first.decisionFactId }, 'XGE_BREW_DELAY_DISTINCT_FACTS_REQUIRED')
  await unchanged(call, 'adjudicate_xge_greater_healing_delay', { ...first, extraComplicationFactId: 'missing-actual-complication' }, 'XGE_BREW_DELAY_FACT_REQUIRED')
  await unchanged(call, 'adjudicate_xge_greater_healing_delay', { ...first, paid: { cp: 4000 } }, 'XGE_BREW_FUNDS_REQUIRED')
  const before = await get(call), paid1 = ok(await call('adjudicate_xge_greater_healing_delay', first))
  assert.equal(paid1.extraPaidCp, 4000)
  assert.equal(paid1.totalCostCp, 14000)
  assert.equal(copperValue(before.dmTools.wallet) - copperValue((await get(call)).dmTools.wallet), 4000)
  assert.equal((await get(call)).worldTimeSeconds, before.worldTimeSeconds)
  await advanceDates(call)
  await unchanged(call, 'work_xge_greater_healing_potion', work(input.eventId, 1), 'XGE_BREW_DELAY_ADJUDICATION_REQUIRED')
  const second = await judgment(call, input.eventId, 'w31-second-delay', { paid: { gp: 60 } })
  second.newDeadlineDay = Math.floor((await get(call)).worldTimeSeconds / 86400)
  const beforeSecond = await get(call), paid2 = ok(await call('adjudicate_xge_greater_healing_delay', second))
  assert.equal(paid2.extraPaidCp, 10000)
  assert.equal(paid2.totalCostCp, 20000)
  assert.equal(copperValue(beforeSecond.dmTools.wallet) - copperValue((await get(call)).dmTools.wallet), 6000)
  call = await restored(t, call, 'paid-two-decisions')
  const saved = await get(call)
  assert.equal(ok(await call('adjudicate_xge_greater_healing_delay', first)).replayed, true)
  assert.equal(ok(await call('adjudicate_xge_greater_healing_delay', second)).replayed, true)
  assert.deepEqual(await get(call), saved)
  const wrong = structuredClone(saved)
  wrong.dmTools.xgeBrewing.projects[0].adjudications[1].source.startLine++
  await unchanged(call, 'replace_game_state', { gameState: wrong }, 'XGE_BREWING_STATE_MISMATCH')
  const erased = structuredClone(saved)
  erased.dmTools.xgeBrewing.projects[0].adjudications.shift()
  await unchanged(call, 'replace_game_state', { gameState: erased }, 'XGE_BREWING_STATE_MISMATCH')
  await advanceDates(call)
  const third = await judgment(call, input.eventId, 'w31-third-delay', { paid: { gp: 1 } })
  await unchanged(call, 'adjudicate_xge_greater_healing_delay', third, 'XGE_BREW_DELAY_COST_CAP')
  third.paid = {}
  const zero = ok(await call('adjudicate_xge_greater_healing_delay', third))
  assert.equal(zero.paidCp, 0)
  assert.equal(zero.totalCostCp, 20000)
  const after = await get(call)
  assert.equal(after.dmTools.xgeBrewing.projects[0].segments.length, 1)
  assert.equal(after.dmTools.xgeBrewing.projects[0].adjudications.length, 3)
  assert.equal(after.droppedItems?.[input.potionItemId], undefined)
  ok(await call('abandon_xge_greater_healing_potion', { eventId: 'w31-abandon-paid-project', projectId: input.eventId,
    forfeitSuppliesConfirmed: true, reason: 'Abandon explicite des fournitures, suppléments et efforts déjà consacrés.' }))
  assert.deepEqual((await get(call)).dmTools.wallet, after.dmTools.wallet)
  const closed = await judgment(call, input.eventId, 'w31-abandoned-delay')
  await unchanged(call, 'adjudicate_xge_greater_healing_delay', closed, 'XGE_BREW_DELAY_DECISION_REQUIRED')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('no first effort or currently elapsed deadline means no delay arbitration, no cost or created work', async t => {
  const { call, input } = await prepared(t, 'w31-not-delayed', { firstEffort: false })
  const beforeWork = await judgment(call, input.eventId, 'w31-no-first-work')
  await unchanged(call, 'adjudicate_xge_greater_healing_delay', beforeWork, 'XGE_BREW_DELAY_DECISION_REQUIRED')
  ok(await call('work_xge_greater_healing_potion', work(input.eventId, 0)))
  const early = await judgment(call, input.eventId, 'w31-too-early')
  await unchanged(call, 'adjudicate_xge_greater_healing_delay', early, 'XGE_BREW_DELAY_DECISION_REQUIRED')
  const state = await get(call)
  assert.equal(state.dmTools.xgeBrewing.projects[0].adjudications, undefined)
  assert.equal(state.dmTools.xgeBrewing.projects[0].segments.length, 1)
  const tools = (await call.client.listTools()).tools
  assert.ok(tools.some(tool => tool.name === 'adjudicate_xge_greater_healing_delay'))
  assert.ok(ok(await call('get_rules_support', { domain: 'xge_brewing' })).implemented.includes('explicit_delayed_project_adjudication_and_retained_deadline'))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
