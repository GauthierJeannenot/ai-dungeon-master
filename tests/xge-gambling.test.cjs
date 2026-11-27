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
const { prepareCourse, refused } = require('./helpers/xge-training-fixture.cjs')
const { prepareGambling, nextGamblingDate } = require('./helpers/xge-gambling-fixture.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
test.after(() => pg.restore())

const get = call => call('get_game_state')
const marker = async call => ok(await call('roll_dice', { notation: '1d20' })).total
const money = state => copperValue(state.dmTools.wallet)
const latest = state => state.dmTools.xgeGambling.weeks.at(-1)

async function continueWeek(call, fixture, { start = 0, skipDate = false } = {}) {
  for (let i = start; i < 5; i++) {
    if (i > 0) await nextGamblingDate(call, skipDate && i === 2 ? 2 : 1)
    const result = ok(await call('work_xge_gambling', fixture.work(i)))
    assert.equal(result.seconds, 28800)
  }
}
async function fromSql(t, state, dice, suffix) {
  const session = 'actual-gambling-' + suffix + '-' + process.pid
  const { adventureId, characterId } = state
  t.after(() => deleteSession(session))
  await saveSession(session, { gameState: state, history: [], adventureId, characterId })
  const resumed = await engine(t, { adventureId, characterId, dice })
  ok(await resumed('replace_game_state', { gameState: (await loadSession(session)).gameState }))
  return resumed
}

test('actual POST starts and works a week, then three separate skill DCs retain a complication and gross return through SQL', async t => {
  const call = await engine(t, { dice: '1,1,2,2,10,10,20,20,1,10,2,19' })
  const f = await prepareGambling(call)
  await refused(call, 'start_xge_gambling', { ...f.input, paid: { gp: 10, cp: 1 } }, 'XGE_GAMBLING_STAKE_REQUIRED')
  const initial = await get(call)
  const start = { name: 'start_xge_gambling', input: f.input }
  const first = { name: 'work_xge_gambling', input: f.work(0) }
  const { result, seen } = await play(t, call, [
    start,
    params => {
      assert.equal(ok(lastResult(params)).weekId, f.input.eventId)
      return first
    },
    params => {
      assert.equal(ok(lastResult(params)).seconds, 28800)
      return 'Tu consacres une journée au jeu à cette table.'
    },
  ], 'Je mise dix pièces d’or et joue ici pour cette journée.')
  assert.deepEqual(seen, [start, first])
  assert.equal(money(result.newGameState), money(initial) - 1000)
  assert.equal(result.newGameState.worldTimeSeconds, initial.worldTimeSeconds + 28800)
  await refused(call, 'work_xge_gambling', f.work(1), 'XGE_GAMBLING_WORKDAY_REQUIRED')
  await refused(call, 'resolve_xge_gambling', f.resolve, 'XGE_GAMBLING_RESOLUTION_REQUIRED')
  await continueWeek(call, f, { start: 1, skipDate: true })
  const resolved = ok(await call('resolve_xge_gambling', f.resolve))
  const { dcs, checks, outcome } = resolved.week.resolution
  assert.deepEqual(dcs.map(die => die.total), [7, 9, 25])
  assert.deepEqual(checks.map(check => check.ability), ['wis', 'cha', 'cha'])
  assert.deepEqual(checks.map(check => check.success), [true, true, false])
  assert.equal(outcome.chance.total, 10)
  assert.equal(outcome.example.roll.total, 2)
  assert.match(outcome.example.text, /jail/)
  assert.equal(outcome.returnCp, 1500)
  const closed = await get(call)
  assert.deepEqual(latest(closed).segments.map(segment => segment.day - latest(closed).segments[0].day), [0, 1, 3, 4, 5])
  assert.equal(money(closed), money(initial) - 1000)
  for (const key of ['player', 'npcs', 'monsters', 'phase', 'worldFacts']) assert.deepEqual(closed[key], initial[key])
  assert.equal(await marker(call), 19)
  const resumed = await fromSql(t, closed, '17', 'return')
  const damaged = structuredClone(closed)
  latest(damaged).resolution.checks[0].roll.rolls[0]--
  await refused(resumed, 'replace_game_state', { gameState: damaged }, 'XGE_GAMBLING_STATE_MISMATCH')
  assert.equal(ok(await resumed('resolve_xge_gambling', f.resolve)).replayed, true)
  const settle = { eventId: 'actual-return', weekId: f.input.eventId, received: { gp: 15 }, actualVenuePaymentConfirmed: true }
  await refused(resumed, 'settle_xge_gambling', { ...settle, received: { gp: 25 } }, 'XGE_GAMBLING_EXACT_RETURN_REQUIRED')
  ok(await resumed('settle_xge_gambling', settle))
  assert.equal(money(await get(resumed)), money(initial) + 500)
  assert.equal(ok(await resumed('settle_xge_gambling', settle)).replayed, true)
  assert.equal(money(await get(resumed)), money(initial) + 500)
  assert.equal(await marker(resumed), 17)
})

test('zero successes retain an actual debt and explicit partial coins pay only the original creditor after SQL', async t => {
  const call = await engine(t, { dice: '10,10,10,10,10,10,1,1,1,11,19' })
  const f = await prepareGambling(call, { weekId: 'actual-debt-week' })
  const originalMoney = money(await get(call))
  ok(await call('start_xge_gambling', f.input))
  await continueWeek(call, f)
  const result = ok(await call('resolve_xge_gambling', f.resolve))
  assert.equal(result.debtBalanceCp, 1000)
  assert.equal(result.week.resolution.outcome.example, undefined)
  const debt = { eventId: 'first-actual-payment', weekId: f.input.eventId, creditorId: f.input.creditorId, paid: { gp: 4 } }
  const other = await prepareGambling(call, { weekId: 'different-actual-creditor', gp: 1 })
  const before = await get(call)
  assert.equal(money(before), originalMoney - 1000 + 101)
  await refused(call, 'pay_xge_gambling_debt', { ...debt, creditorId: other.input.creditorId }, 'XGE_GAMBLING_DEBT_PAYMENT_REQUIRED')
  await refused(call, 'pay_xge_gambling_debt', { ...debt, paid: { gp: 11 } }, 'XGE_GAMBLING_DEBT_PAYMENT_REQUIRED')
  assert.equal(ok(await call('pay_xge_gambling_debt', debt)).debtBalanceCp, 600)
  const paid = await get(call)
  assert.equal(paid.dmTools.wallet.gp, before.dmTools.wallet.gp - 4)
  assert.equal(await marker(call), 19)
  const resumed = await fromSql(t, paid, '17', 'debt')
  assert.equal(ok(await resumed('pay_xge_gambling_debt', debt)).replayed, true)
  assert.equal(money(await get(resumed)), money(paid))
  await refused(resumed, 'pay_xge_gambling_debt', { ...debt, eventId: 'actual-overpayment', paid: { gp: 7 } }, 'XGE_GAMBLING_DEBT_PAYMENT_REQUIRED')
  const settled = ok(await resumed('pay_xge_gambling_debt', { ...debt, eventId: 'actual-final-payment', paid: { gp: 6 } }))
  assert.equal(settled.debtBalanceCp, 0)
  assert.equal(money(await get(resumed)), money(paid) - 600)
  assert.equal(await marker(resumed), 17)
})

test('the publicly acquired and trained dragonchess set replaces chosen skills with one proficiency and the same ability', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '1,1,1,1,1,1,20,20,20,11,19' })
  const f = await prepareGambling(call, { weekId: 'actual-set-week', gp: 250 })
  const course = await prepareCourse(call, { kind: 'tool', subjectId: 'dragonchess_set', courseId: 'actual-set-course' })
  await course.completeInstruction()
  ok(await call('complete_xge_training', course.completion))
  await course.nextDay()
  ok(await call('start_xge_gambling', f.input))
  await continueWeek(call, f)
  const trained = await get(call)
  assert.ok(trained.player.toolProficiencies.includes('dragonchess_set'))
  const fact = ok(await call('record_scene_fact', {
    cell: trained.player.position, description: 'Le MJ confirme que la table organise bien une partie d’échecs draconiques.',
  })).worldFact
  const gamingSet = { itemId: course.input.practiceToolItemId, equipmentId: 'dragonchess_set', factId: fact.id,
    replaceSkills: ['insight', 'deception'], actualVenueGameConfirmed: true }
  await refused(call, 'resolve_xge_gambling', { ...f.resolve, gamingSet: { ...gamingSet, equipmentId: 'dice_set' } }, 'XGE_GAMBLING_SET_REQUIRED')
  const result = ok(await call('resolve_xge_gambling', { ...f.resolve, gamingSet }))
  const { checks, outcome } = result.week.resolution
  assert.deepEqual(checks.map(check => check.ability), ['wis', 'cha', 'cha'])
  for (let i = 0; i < 2; i++) {
    const check = checks[i]
    assert.equal(check.proficient, true)
    assert.equal(check.expertise, false)
    assert.deepEqual(check.roll.rolls, [20])
    assert.equal(check.roll.modifier, Math.floor((trained.player.stats[check.ability] - 10) / 2) + trained.player.proficiencyBonus)
  }
  assert.equal(outcome.returnCp, 2000)
  assert.equal(await marker(call), 19)
})


test('abandonment keeps paid effort and a distinct completed week returns exactly half of an even stake', async t => {
  const call = await engine(t, { dice: '1,1,10,10,10,10,20,1,1,11,19' })
  const earlier = await prepareGambling(call, { weekId: 'actual-unfinished-week' })
  ok(await call('start_xge_gambling', earlier.input))
  ok(await call('work_xge_gambling', earlier.work(0)))
  const abandon = { eventId: 'actual-abandon', weekId: earlier.input.eventId, forfeitStakeConfirmed: true }
  const beforeAbandon = await get(call)
  ok(await call('abandon_xge_gambling', abandon))
  assert.equal(ok(await call('abandon_xge_gambling', abandon)).replayed, true)
  const afterAbandon = await get(call)
  assert.equal(money(afterAbandon), money(beforeAbandon))
  assert.equal(afterAbandon.worldTimeSeconds, beforeAbandon.worldTimeSeconds)
  assert.equal(latest(afterAbandon).segments.length, 1)
  const later = await prepareGambling(call, { weekId: 'actual-half-return' })
  ok(await call('start_xge_gambling', later.input))
  await refused(call, 'work_xge_gambling', later.work(0), 'DOWNTIME_SHARED_DAY_REQUIRED')
  await nextGamblingDate(call)
  await continueWeek(call, later)
  const before = await get(call)
  const outcome = ok(await call('resolve_xge_gambling', later.resolve)).week.resolution.outcome
  assert.equal(outcome.successes, 1)
  assert.equal(outcome.returnCp, 500)
  ok(await call('settle_xge_gambling', { eventId: 'actual-half-return-coins', weekId: later.input.eventId,
    received: { gp: 5 }, actualVenuePaymentConfirmed: true }))
  assert.equal(money(await get(call)), money(before) + 500)
  assert.equal(await marker(call), 19)
})

test('the original gambling d20 and all three DDs survive a real SQL restart through the existing Inspiration reaction', async t => {
  const call = await engine(t, { dice: '3,3,2,2,1,1,8,19' })
  const f = await prepareGambling(call, { weekId: 'actual-held-gambling' })
  ok(await call('start_xge_gambling', f.input))
  await continueWeek(call, f)
  // Same controlled setup as Work: restore one already-granted Inspiration die.
  // All work, random DCs, d20s, reaction and payout result come from public engine calls.
  const withInspiration = await get(call)
  withInspiration.hero.inspiration.push({ targetId: 'player', die: 8, expiresAt: withInspiration.worldTimeSeconds + 600 })
  ok(await call('replace_game_state', { gameState: withInspiration }))
  const held = ok(await call('resolve_xge_gambling', f.resolve)).pendingReaction
  assert.deepEqual(held.roll.rolls, [8])
  const pending = await get(call)
  const dcs = latest(pending).resolution.dcs
  assert.deepEqual(dcs.map(roll => roll.total), [11, 9, 7])
  assert.deepEqual(latest(pending).resolution.checks, [])
  assert.equal(latest(pending).resolution.outcome, undefined)
  assert.equal(await marker(call), 19)

  const resumed = await fromSql(t, pending, '4,17,16,99,19', 'held')
  const corrupted = structuredClone(pending)
  corrupted.hero.pending.roll.rolls[0] = 20
  await refused(resumed, 'replace_game_state', { gameState: corrupted }, 'XGE_GAMBLING_STATE_MISMATCH')
  assert.equal(ok(await resumed('resolve_xge_gambling', f.resolve)).pendingReaction.id, held.id)
  const completed = ok(await resumed('resolve_reaction', { pendingId: held.id, choice: 'bardic_inspiration' }))
  const resolution = completed.week.resolution
  assert.deepEqual(resolution.dcs, dcs)
  assert.deepEqual(resolution.checks.map(check => check.roll.rolls), [[8], [17], [16]])
  assert.equal(resolution.checks[0].roll.total, held.roll.total + 4)
  assert.ok(held.roll.total < dcs[0].total)
  assert.equal(resolution.checks[0].success, true)
  assert.match(resolution.checks[0].mechanicalSummary, /Inspiration \+4.*vs DD 11 -> SUCCES/)
  assert.equal(resolution.outcome.chance.total, 99)
  const finished = await get(resumed)
  assert.equal(finished.hero.inspiration.length, 0)
  assert.equal(money(finished), money(pending))
  assert.equal(ok(await resumed('resolve_xge_gambling', f.resolve)).replayed, true)
  assert.equal(await marker(resumed), 19)
})
