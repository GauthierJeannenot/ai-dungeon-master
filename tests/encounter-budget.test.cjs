const test = require('node:test'), assert = require('node:assert/strict')
const { encounterThresholds, encounterMultiplier, calculateSoloEncounterBudget,
  EncounterBudgetInputSchema } = require('../mcp-server/dist/lib/encounter-budget.js')
const { engine, ok, spawn, replace, battle } = require('./helpers/mcp-toolkit.cjs')

const group = (monsterType, count = 1, countsForMultiplier = true) => ({ monsterType, count, countsForMultiplier })
const planned = (...groups) => ({ mode: 'planned', groups })
async function unchanged(call, input, code) {
  const before = await call('get_game_state'), response = await call('assess_encounter_budget', input)
  assert.ok(response.error, JSON.stringify(response))
  if (code) assert.equal(response.code, code)
  assert.deepEqual(await call('get_game_state'), before)
  return response
}

test('DMG thresholds retain the published level-one, solo level-seven and level-twenty values without extrapolation', () => {
  assert.deepEqual(encounterThresholds(1), { easy: 25, medium: 50, hard: 75, deadly: 100 })
  assert.deepEqual(encounterThresholds(7), { easy: 350, medium: 750, hard: 1100, deadly: 1700 })
  assert.deepEqual(encounterThresholds(20), { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 })
  for (const level of [0, 21, 3.5, NaN]) assert.throws(() => encounterThresholds(level), { code: 'ENCOUNTER_LEVEL_UNSUPPORTED' })
})

test('published monster-count and party-size adjustments include explicit solo x5 and large-party x0.5', () => {
  const counts = [1, 2, 3, 7, 11, 15]
  assert.deepEqual(counts.map(n => encounterMultiplier(n, 4).multiplier), [1, 1.5, 2, 2.5, 3, 4])
  assert.deepEqual(counts.map(n => encounterMultiplier(n, 1).multiplier), [1.5, 2, 2.5, 3, 4, 5])
  assert.deepEqual(counts.map(n => encounterMultiplier(n, 6).multiplier), [0.5, 1, 1.5, 2, 2.5, 3])
  assert.throws(() => encounterMultiplier(0, 1), { code: 'ENCOUNTER_CONTRIBUTOR_REQUIRED' })
  assert.throws(() => encounterMultiplier(1, 0), { code: 'ENCOUNTER_PARTY_REQUIRED' })
})

test('solo adjusted XP is separate from awarded XP and daily XP is only a source reference', () => {
  const result = calculateSoloEncounterBudget(7, [{ count: 1, xpEach: 450, countsForMultiplier: true }])
  assert.equal(result.partySize, 1); assert.equal(result.rawXP, 450); assert.equal(result.adjustedXP, 675)
  assert.equal(result.difficulty, 'easy'); assert.equal(result.multiplier, 1.5)
  assert.equal(result.adventuringDayAdjustedXPReference, 5000); assert.equal(result.xpAward, null)
  assert.equal(calculateSoloEncounterBudget(3, [{ count: 3, xpEach: 50, countsForMultiplier: true }]).difficulty, 'hard')
  assert.equal(calculateSoloEncounterBudget(1, [{ count: 1, xpEach: 1, countsForMultiplier: true }]).adjustedXP, 1.5)
})

test('explicitly excluded weak participants remain in source XP but not the number multiplier', () => {
  const rows = [{ count: 1, xpEach: 700, countsForMultiplier: true }, { count: 10, xpEach: 50, countsForMultiplier: false }]
  const result = calculateSoloEncounterBudget(7, rows)
  assert.equal(result.rawXP, 1200); assert.equal(result.totalMonsterCount, 11)
  assert.equal(result.multiplierMonsterCount, 1); assert.equal(result.excludedFromMultiplierCount, 10)
  assert.equal(result.adjustedXP, 1800); assert.equal(result.difficulty, 'deadly')
  assert.throws(() => calculateSoloEncounterBudget(7, [{ count: 1, xpEach: 50, countsForMultiplier: false }]), { code: 'ENCOUNTER_CONTRIBUTOR_REQUIRED' })
})

test('invalid counts, unsafe arithmetic, fabricated public party levels and ambiguous assessment modes are refused', () => {
  assert.throws(() => calculateSoloEncounterBudget(7, []), { code: 'ENCOUNTER_EMPTY' })
  assert.throws(() => calculateSoloEncounterBudget(7, [{ count: -1, xpEach: 50, countsForMultiplier: true }]), { code: 'ENCOUNTER_MONSTER_VALUES_INVALID' })
  assert.throws(() => calculateSoloEncounterBudget(7, [{ count: 2, xpEach: Number.MAX_SAFE_INTEGER, countsForMultiplier: true }]), { code: 'ENCOUNTER_BUDGET_OVERFLOW' })
  assert.equal(EncounterBudgetInputSchema.safeParse({ ...planned(group('goblin')), partySize: 4 }).success, false)
  assert.equal(EncounterBudgetInputSchema.safeParse({ ...planned(group('goblin')), playerLevel: 20 }).success, false)
  assert.equal(EncounterBudgetInputSchema.safeParse({ ...planned(group('goblin')), monsters: [] }).success, false)
  assert.equal(EncounterBudgetInputSchema.safeParse({ mode: 'active', groups: [group('goblin')] }).success, false)
})

test('actual planned assessment uses the sole real player level and preserves complete state and next die', async t => {
  const call = await engine(t, { dice: '17' }), before = await call('get_game_state')
  const result = ok(await call('assess_encounter_budget', planned(group('goblin', 2))))
  assert.equal(result.playerLevel, before.player.level); assert.equal(result.partySize, 1)
  assert.equal(result.groups[0].xpEach, 50); assert.equal(result.rawXP, 100); assert.equal(result.adjustedXP, 200)
  assert.equal(result.multiplier, 2); assert.equal(result.mode, 'planned')
  assert.equal(result.source.book, 'dmg-2014'); assert.match(result.groups[0].source.sha256, /^[a-f0-9]{64}$/)
  assert.ok(result.groups[0].sourceReferenceOnly.includes('Nimble Escape'), 'a sourced but unsupported power is not silently promised')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('active assessment reads source XP despite mutable actor XP and flags actual HP variants', async t => {
  const call = await engine(t), enemy = await spawn(call)
  await replace(call, state => { state.monsters[enemy.id].xpValue = 0 })
  const before = await call('get_game_state')
  const result = ok(await call('assess_encounter_budget', { mode: 'active', monsters: [{ monsterId: enemy.id, countsForMultiplier: true }] }))
  assert.equal(result.rawXP, 50); assert.equal(result.hasHpOverride, true)
  assert.equal(result.groups[0].monsterId, enemy.id); assert.equal(result.totalMonsterCount, 1)
  assert.deepEqual(await call('get_game_state'), before)
})

test('unknown types, duplicate actors/groups and zero contributing opposition are refused without changes', async t => {
  const call = await engine(t, { dice: '19' }), enemy = await spawn(call)
  await unchanged(call, planned(group('unregistered_dragon')), 'ENCOUNTER_MONSTER_UNKNOWN')
  await unchanged(call, planned(group('goblin'), group('goblin')), 'ENCOUNTER_DUPLICATE_GROUP')
  await unchanged(call, planned(group('goblin', 1, false)), 'ENCOUNTER_CONTRIBUTOR_REQUIRED')
  await unchanged(call, { mode: 'active', monsters: [{ monsterId: enemy.id, countsForMultiplier: true }, { monsterId: enemy.id, countsForMultiplier: false }] }, 'ENCOUNTER_DUPLICATE_ACTOR')
  await unchanged(call, { mode: 'active', monsters: [{ monsterId: 'narrative-npc-without-statistics', countsForMultiplier: true }] }, 'ENCOUNTER_ACTOR_UNAVAILABLE')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('active mode refuses nonhostile companions and true corpses rather than inventing NPC player levels', async t => {
  const call = await engine(t), enemy = await spawn(call)
  await replace(call, state => { state.monsters[enemy.id].hostile = false })
  const input = { mode: 'active', monsters: [{ monsterId: enemy.id, countsForMultiplier: true }] }
  await unchanged(call, input, 'ENCOUNTER_NON_HOSTILE_ACTOR')
  await replace(call, state => { state.monsters[enemy.id].hostile = true; state.monsters[enemy.id].hp.current = 0; state.monsters[enemy.id].isAlive = false })
  await unchanged(call, input, 'ENCOUNTER_ACTOR_UNAVAILABLE')
})

test('assessment is a read-only inspection during combat and an actual held Bardic check', async t => {
  const call = await engine(t, { dice: '8,17' }), enemy = await spawn(call)
  await battle(call, [enemy.id])
  await replace(call, state => state.hero.inspiration.push({ targetId: 'player', expiresAt: state.worldTimeSeconds + 600, die: 8 }))
  const held = ok(await call('roll_ability_check', { ability: 'int', dc: 20 }))
  assert.ok(held.pendingReaction)
  const before = await call('get_game_state')
  ok(await call('assess_encounter_budget', planned(group('goblin'))))
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('resolve_reaction', { pendingId: held.pendingReaction.id, choice: 'decline' }))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})
