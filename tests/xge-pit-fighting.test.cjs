const assert = require('node:assert/strict')
const test = require('node:test')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { refused } = require('./helpers/xge-training-fixture.cjs')
const { preparePit, nextPitDate, completePitWork } = require('./helpers/xge-pit-fighting-fixture.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
test.after(() => pg.restore())
const get = call => call('get_game_state')
const money = state => copperValue(state.dmTools.wallet)
const latest = state => state.dmTools.xgePitFighting.weeks.at(-1)
const marker = async call => ok(await call('roll_dice', { notation: '1d20' })).total
async function fromSql(t, state, dice, suffix) {
  const session = 'actual-pit-' + suffix + '-' + process.pid
  const { adventureId, characterId } = state
  t.after(() => deleteSession(session))
  await saveSession(session, { gameState: state, history: [], adventureId, characterId })
  const resumed = await engine(t, { adventureId, characterId, dice })
  ok(await resumed('replace_game_state', { gameState: (await loadSession(session)).gameState }))
  return resumed
}
test('actual POST pit work and three checks retain real HD bonus and documentary near-fatal example through SQL and exact payment', async t => {
  const call = await engine(t, { dice: '1,1,2,2,10,10,4,20,20,1,10,6,19' })
  const f = await preparePit(call)
  const metadata = (await call.client.listTools()).tools
  for (const verb of ['start', 'work', 'resolve', 'settle', 'abandon', 'inspect']) assert.ok(metadata.some(tool => tool.name === verb + '_xge_pit_fighting'))
  const support = ok(await call('get_rules_support', { domain: 'xge_pit_fighting' }))
  assert.ok(JSON.stringify(support).includes('largest'))
  const source = ok(await call('inspect_xge_pit_fighting')).source
  assert.equal(source.sha256, '519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf')
  assert.equal(source.startLine, 2292); assert.equal(source.foundationLine, 1987); assert.equal(source.endLine, 2321)
  await refused(call, 'start_xge_pit_fighting', { ...f.input, opponentIds: ['nonexistent-foe'] }, 'XGE_PIT_PARTICIPANT_REQUIRED')
  const initial = await get(call)
  const start = { name: 'start_xge_pit_fighting', input: f.input }, work = { name: 'work_xge_pit_fighting', input: f.work(0) }
  const { result, seen } = await play(t, call, [start, params => {
    assert.equal(ok(lastResult(params)).paidCp, 0); return work
  }, params => { assert.equal(ok(lastResult(params)).seconds, 28800); return 'Tu consacres une journée aux rencontres non létales organisées.' }], 'Je participe à cette journée de combats de fosse non létaux.')
  assert.deepEqual(seen, [start, work])
  assert.equal(result.newGameState.worldTimeSeconds, initial.worldTimeSeconds + 28800)
  assert.equal(money(result.newGameState), money(initial))
  await refused(call, 'work_xge_pit_fighting', f.work(1), 'XGE_PIT_WORKDAY_REQUIRED')
  await refused(call, 'resolve_xge_pit_fighting', f.resolve, 'XGE_PIT_RESOLUTION_REQUIRED')
  await completePitWork(call, f, { start: 1, gap: true })
  const resolved = ok(await call('resolve_xge_pit_fighting', f.resolve))
  const r = resolved.week.resolution
  assert.deepEqual(r.dcs.map(die => die.total), [7, 9, 25])
  assert.deepEqual(r.checks.map(check => check.ability), ['str', 'dex', 'con'])
  assert.deepEqual(r.checks.map(check => check.success), [true, true, false])
  assert.equal(r.hitDie.die, 10); assert.equal(r.hitDie.classId, 'fighter'); assert.equal(r.conBonus.total, 4)
  assert.match(r.checks[2].roll.detail, /plus grand dé de vie \+4/)
  assert.equal(r.outcome.prizeCp, 10000); assert.equal(r.outcome.chance.total, 10)
  assert.equal(r.outcome.example.roll.total, 6); assert.match(r.outcome.example.text, /near-fatal/)
  const closed = await get(call)
  assert.deepEqual(latest(closed).segments.map(s => s.day - latest(closed).segments[0].day), [0, 1, 3, 4, 5])
  for (const key of ['player', 'npcs', 'monsters', 'phase', 'worldFacts']) assert.deepEqual(closed[key], initial[key])
  assert.deepEqual(closed.hero.hitDice, initial.hero.hitDice)
  assert.equal(money(closed), money(initial)); assert.equal(await marker(call), 19)
  const resumed = await fromSql(t, closed, '17', 'payment')
  const corrupted = structuredClone(closed); latest(corrupted).resolution.conBonus.total++
  await refused(resumed, 'replace_game_state', { gameState: corrupted }, 'XGE_PIT_STATE_MISMATCH')
  for (const [name, input] of [['start_xge_pit_fighting', f.input], ['work_xge_pit_fighting', f.work(0)], ['resolve_xge_pit_fighting', f.resolve]])
    assert.equal(ok(await resumed(name, input)).replayed, true)
  const settle = { eventId: 'actual-prize', weekId: f.input.eventId, received: { gp: 100 }, actualPromoterPaymentConfirmed: true }
  await refused(resumed, 'settle_xge_pit_fighting', { ...settle, received: { gp: 200 } }, 'XGE_PIT_EXACT_PRIZE_REQUIRED')
  ok(await resumed('settle_xge_pit_fighting', settle))
  assert.equal(money(await get(resumed)), money(initial) + 10000)
  assert.equal(ok(await resumed('settle_xge_pit_fighting', settle)).replayed, true)
  await refused(resumed, 'abandon_xge_pit_fighting', { eventId: 'no-erasing-result', weekId: f.input.eventId, abandonUnfinishedWeekConfirmed: true }, 'XGE_PIT_ABANDONMENT_UNAVAILABLE')
  assert.equal(money(await get(resumed)), money(initial) + 10000); assert.equal(await marker(resumed), 17)
})
for (const successes of [0, 1, 3]) test(`actual pit work earns exactly ${[0, 50, 100, 200][successes]} gp with ${successes} successes and no entry fee or physical combat`, async t => {
  const dcFaces = Array.from({ length: 3 }, (_, i) => i < successes ? '1,1' : '10,10').join(',')
  const call = await engine(t, { dice: dcFaces + ',1,10,10,10,99,19' })
  const f = await preparePit(call), before = await get(call)
  ok(await call('start_xge_pit_fighting', f.input)); await completePitWork(call, f)
  const r = ok(await call('resolve_xge_pit_fighting', f.resolve)).week.resolution
  const prize = [0, 5000, 10000, 20000][successes]
  assert.equal(r.outcome.successes, successes); assert.equal(r.outcome.prizeCp, prize); assert.equal(r.outcome.example, undefined)
  assert.equal(money(await get(call)), money(before))
  const payment = { eventId: 'exact-source-prize', weekId: f.input.eventId, received: { gp: prize / 100 }, actualPromoterPaymentConfirmed: true }
  if (prize) { ok(await call('settle_xge_pit_fighting', payment)); assert.equal(money(await get(call)), money(before) + prize) }
  else await refused(call, 'settle_xge_pit_fighting', payment, 'XGE_PIT_EXACT_PRIZE_REQUIRED')
  const after = await get(call)
  assert.equal(after.phase, before.phase); assert.deepEqual(after.player, before.player); assert.deepEqual(after.hero.hitDice, before.hero.hitDice)
  assert.equal(await marker(call), 19)
})
test('actual pit work rejects delayed and duplicate effort atomically, retains history through SQL and explicitly abandons without refunds', async t => {
  const call = await engine(t, { dice: '19' }), f = await preparePit(call)
  ok(await call('start_xge_pit_fighting', f.input)); ok(await call('work_xge_pit_fighting', f.work(0)))
  await refused(call, 'work_xge_pit_fighting', f.work(1), 'XGE_PIT_WORKDAY_REQUIRED')
  await nextPitDate(call, 10)
  await refused(call, 'work_xge_pit_fighting', f.work(1), 'XGE_PIT_DELAY_ADJUDICATION_REQUIRED')
  const delayed = await get(call), resumed = await fromSql(t, delayed, '17', 'delay')
  const abandon = { eventId: 'actual-abandonment', weekId: f.input.eventId, abandonUnfinishedWeekConfirmed: true }
  const result = ok(await resumed('abandon_xge_pit_fighting', abandon))
  assert.equal(result.refundedCp, 0); assert.deepEqual(result.week.segments, latest(delayed).segments)
  assert.equal(ok(await resumed('abandon_xge_pit_fighting', abandon)).replayed, true)
  assert.equal((await get(resumed)).worldTimeSeconds, delayed.worldTimeSeconds)
  assert.equal(money(await get(resumed)), money(delayed)); assert.equal(await marker(resumed), 17); assert.equal(await marker(call), 19)
})
test('the original pit d20, three DCs and largest-HD die survive a held Inspiration reaction and true SQL restart without reroll', async t => {
  const call = await engine(t, { dice: '3,3,2,2,1,1,5,1,19' }), f = await preparePit(call)
  ok(await call('start_xge_pit_fighting', f.input)); await completePitWork(call, f)
  // Controlled complement: restore one already-granted Bardic die, as the existing Work/Gambling fixtures do.
  // No activity state, pending roll, proficiency or physical participant is injected.
  const withInspiration = await get(call)
  withInspiration.hero.inspiration.push({ targetId: 'player', die: 8, expiresAt: withInspiration.worldTimeSeconds + 600 })
  ok(await call('replace_game_state', { gameState: withInspiration }))
  const held = ok(await call('resolve_xge_pit_fighting', f.resolve)).pendingReaction
  assert.deepEqual(held.roll.rolls, [1])
  const pending = await get(call), original = latest(pending).resolution
  assert.deepEqual(original.dcs.map(d => d.total), [11, 9, 7]); assert.equal(original.conBonus.total, 5)
  assert.equal(await marker(call), 19)
  const resumed = await fromSql(t, pending, '4,10,10,99,19', 'held')
  const corrupted = structuredClone(pending); corrupted.hero.pending.roll.rolls[0] = 20
  await refused(resumed, 'replace_game_state', { gameState: corrupted }, 'XGE_PIT_STATE_MISMATCH')
  assert.equal(ok(await resumed('resolve_xge_pit_fighting', f.resolve)).pendingReaction.id, held.id)
  const resolution = ok(await resumed('resolve_reaction', { pendingId: held.id, choice: 'bardic_inspiration' })).week.resolution
  assert.deepEqual(resolution.dcs, original.dcs); assert.deepEqual(resolution.conBonus, original.conBonus)
  assert.deepEqual(resolution.checks.map(c => c.roll.rolls), [[1], [10], [10]])
  assert.equal(resolution.checks[0].roll.total, held.roll.total + 4)
  assert.equal(resolution.checks[0].success, true); assert.equal(resolution.outcome.prizeCp, 20000)
  assert.deepEqual((await get(resumed)).hero.hitDice, pending.hero.hitDice)
  assert.equal(ok(await resumed('resolve_xge_pit_fighting', f.resolve)).replayed, true); assert.equal(await marker(resumed), 19)
})
test('chosen real weapon natural 1 fails without physical attack, cost or damage and invalid weapon refuses before any source die', async t => {
  const call = await engine(t, { dice: '1,1,10,10,10,10,1,1,1,1,99,19' }), f = await preparePit(call)
  ok(await call('start_xge_pit_fighting', f.input)); await completePitWork(call, f)
  await refused(call, 'resolve_xge_pit_fighting', { ...f.resolve, weaponCheck: { replaceSkill: 'athletics', weaponId: 'missing-weapon' } }, 'XGE_PIT_WEAPON_REQUIRED')
  const before = await get(call), weapon = before.player.inventory.find(i => i.id === 'longsword')
  assert.ok(weapon)
  const input = { ...f.resolve, weaponCheck: { replaceSkill: 'athletics', weaponId: weapon.id, weaponHands: 1 } }
  const r = ok(await call('resolve_xge_pit_fighting', input)).week.resolution
  assert.equal(r.checks[0].kind, 'attack'); assert.equal(r.checks[0].roll.rolls[0], 1)
  assert.ok(r.checks[0].roll.total >= r.checks[0].dc); assert.equal(r.checks[0].success, false)
  assert.equal(r.outcome.prizeCp, 0)
  const after = await get(call)
  for (const key of ['player', 'npcs', 'monsters', 'phase', 'worldFacts']) assert.deepEqual(after[key], before[key])
  assert.deepEqual(after.hero.hitDice, before.hero.hitDice)
  assert.equal(await marker(call), 19)
  const resumed = await fromSql(t, after, '17', 'weapon-failure')
  assert.equal(ok(await resumed('resolve_xge_pit_fighting', input)).replayed, true); assert.equal(await marker(resumed), 17)
})
test('chosen real finesse weapon may use explicit Strength and natural 20 succeeds against a higher DC without damage or ammunition expense', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '10,10,10,10,10,10,1,20,1,1,99,19' }), f = await preparePit(call)
  ok(await call('start_xge_pit_fighting', f.input)); await completePitWork(call, f)
  const state = await get(call), dagger = state.player.inventory.find(i => i.id === 'dagger')
  assert.ok(dagger)
  const held = state.dmTools.loadout?.mainHandId ?? state.player.inventory.find(i => i.type === 'weapon')?.id
  if (held) ok(await call('equip_item', { itemId: held, operation: 'unequip', slot: 'main_hand' }))
  ok(await call('equip_item', { itemId: dagger.id, operation: 'equip', slot: 'main_hand' }))
  const before = await get(call), input = { ...f.resolve, weaponCheck: { replaceSkill: 'athletics', weaponId: dagger.id, weaponAbility: 'str', weaponHands: 1 } }
  const r = ok(await call('resolve_xge_pit_fighting', input)).week.resolution
  assert.equal(r.checks[0].ability, 'str'); assert.equal(r.checks[0].roll.rolls[0], 20)
  assert.ok(r.checks[0].roll.total < r.checks[0].dc); assert.equal(r.checks[0].success, true)
  assert.equal(r.outcome.prizeCp, 5000); assert.equal(r.hitDie.die, 6)
  assert.deepEqual((await get(call)).player, before.player); assert.deepEqual((await get(call)).hero.hitDice, before.hero.hitDice)
  assert.equal(await marker(call), 19)
})
test('held pit weapon natural 1 remains a failure after a real Bardic bonus and SQL resume without rerolling DC or HD', async t => {
  const call = await engine(t, { dice: '1,1,10,10,10,10,1,1,19' }), f = await preparePit(call)
  ok(await call('start_xge_pit_fighting', f.input)); await completePitWork(call, f)
  // Controlled already-granted reserve only, as in the skill-reaction complement above.
  const withInspiration = await get(call)
  withInspiration.hero.inspiration.push({ targetId: 'player', die: 8, expiresAt: withInspiration.worldTimeSeconds + 600 })
  ok(await call('replace_game_state', { gameState: withInspiration }))
  const input = { ...f.resolve, weaponCheck: { replaceSkill: 'athletics', weaponId: 'longsword', weaponHands: 1 } }
  const held = ok(await call('resolve_xge_pit_fighting', input)).pendingReaction
  assert.equal(held.kind, 'attack'); assert.equal(held.roll.rolls[0], 1)
  const pending = await get(call), original = latest(pending).resolution
  assert.equal(await marker(call), 19)
  const resumed = await fromSql(t, pending, '8,1,1,99,19', 'held-weapon')
  const completed = ok(await resumed('resolve_reaction', { pendingId: held.id, choice: 'bardic_inspiration' })).week.resolution
  assert.deepEqual(completed.dcs, original.dcs); assert.deepEqual(completed.conBonus, original.conBonus)
  assert.equal(completed.checks[0].roll.rolls[0], 1); assert.equal(completed.checks[0].roll.total, held.roll.total + 8)
  assert.equal(completed.checks[0].success, false); assert.equal(completed.outcome.prizeCp, 0)
  assert.deepEqual((await get(resumed)).player, pending.player); assert.deepEqual((await get(resumed)).hero.hitDice, pending.hero.hitDice)
  assert.equal(ok(await resumed('resolve_xge_pit_fighting', input)).replayed, true); assert.equal(await marker(resumed), 19)
})
