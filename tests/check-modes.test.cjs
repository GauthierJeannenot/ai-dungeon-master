const test = require('node:test'), assert = require('node:assert/strict')
const { engine, ok, replace, spawn, battle } = require('./helpers/mcp-toolkit.cjs')
const { CheckModeStateSchema } = require('../mcp-server/dist/lib/check-mode-state.js')
const passive = (call, extra = {}) => call('resolve_passive_check', { entityId: 'player', ability: 'wis', skill: 'survival', ...extra })
const group = (eventId, ids, extra = {}) => ({ eventId, participants: ['player', ...ids], ability: 'wis', skill: 'survival', dc: 12, reason: 'Traverser ensemble un passage dont les dangers sont établis.', ...extra })
const help = (helperId, extra = {}) => ({ eventId: 'help-one', helperId, beneficiaryId: 'player', ability: 'wis', skill: 'survival',
  taskCanBeAttemptedAlone: true, collaborationIsProductive: true, reason: 'Le compagnon examine avec le joueur les repères établis.', ...extra })
async function companion(call) {
  const creature = await spawn(call, 'goblin')
  await replace(call, s => {
    s.monsters[creature.id].hostile = false
    s.npcs ??= {}
    s.npcs[creature.id] = { id: creature.id, name: 'Compagnon', kind: 'goblin', position: s.monsters[creature.id].position,
      roomId: s.currentRoomId, mapId: s.currentMapId, disposition: 'helpful', visible: true }
  })
  return creature.id
}

test('passive score derives expertise and never mutates state, rolls dice or consumes prepared inspiration', async t => {
  const call = await engine(t, { dice: '19,3' })
  await replace(call, s => { s.player.stats.wis = 16; s.player.skillProficiencies = ['survival']; s.player.expertise = ['survival'] })
  ok(await call('grant_inspiration', { eventId: 'inspire', reason: 'Décision courageuse établie.' }))
  ok(await call('spend_inspiration', { spendId: 'spend', rollKind: 'check' }))
  const before = await call('get_game_state'), result = ok(await passive(call, { dc: 17 }))
  assert.equal(result.score, 13 + 2 * before.player.proficiencyBonus); assert.equal(result.success, true)
  assert.equal(result.advantage, false); assert.deepEqual(await call('get_game_state'), before)
  const rolled = ok(await call('roll_ability_check', { entityId: 'player', ability: 'wis', skill: 'survival', dc: 10 }))
  assert.equal(rolled.roll.rolls[0], 19)
})

test('passive advantage/disadvantage uses plus/minus five and cancels all sources', async t => {
  const call = await engine(t), base = ok(await passive(call)).score
  assert.equal(ok(await passive(call, { advantage: true, advantageReason: 'Repères clairement établis.' })).score, base + 5)
  await replace(call, s => s.player.conditions.push('poisoned'))
  assert.equal(ok(await passive(call)).score, base - 5)
  assert.equal(ok(await passive(call, { advantage: true, advantageReason: 'Repères clairement établis.' })).score, base)
  assert.equal((await passive(call, { advantage: true })).code, 'ADVANTAGE_REASON_REQUIRED')
})

test('passive refuses unknown skills, optional ability variants and unresolved legacy exhaustion', async t => {
  const call = await engine(t), before = await call('get_game_state')
  assert.equal((await passive(call, { skill: 'invented' })).code, 'CHECK_SKILL_UNKNOWN')
  assert.equal((await passive(call, { ability: 'str' })).code, 'CHECK_ABILITY_MISMATCH')
  assert.equal((await passive(call, { ability: 'cha', skill: 'persuasion' })).code, 'CHECK_SOCIAL_TARGET_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
  await replace(call, s => s.player.conditions.push('exhaustion'))
  assert.equal((await passive(call)).code, 'EXHAUSTION_LEVEL_REQUIRED')
})

test('visual passive checks require an exact cell and automatically fail blindness without RNG', async t => {
  const call = await engine(t), s = await call('get_game_state')
  assert.equal((await passive(call, { sightBased: true })).code, 'CHECK_VISUAL_CELL_REQUIRED')
  await replace(call, s => s.player.conditions.push('blinded'))
  const before = await call('get_game_state'), result = ok(await passive(call, { sightBased: true, targetCell: s.player.position, dc: 1 }))
  assert.equal(result.score, null); assert.equal(result.success, false)
  assert.deepEqual(await call('get_game_state'), before)
})

test('working together supplies only the next matching attempt, passive inspection never consumes it, receipt never refreshes it', async t => {
  const call = await engine(t, { dice: '2,18,6' }), id = await companion(call), input = help(id)
  const base = ok(await passive(call)).score
  ok(await call('provide_check_help', input))
  assert.equal(ok(await passive(call)).score, base + 5)
  const before = await call('get_game_state'); ok(await passive(call)); assert.deepEqual(await call('get_game_state'), before)
  const other = ok(await call('roll_ability_check', { entityId: 'player', ability: 'str' }))
  assert.equal(other.advantage, false)
  const checked = ok(await call('roll_ability_check', { entityId: 'player', ability: 'wis', skill: 'survival' }))
  assert.equal(checked.advantage, true); assert.equal(checked.roll.rolls[0], 18); assert.match(checked.roll.detail, /^ADV:/)
  assert.equal(ok(await call('provide_check_help', input)).active, false)
  assert.equal(ok(await passive(call)).score, base)
  assert.equal((await call('provide_check_help', { ...input, reason: 'Autre raison.' })).code, 'CHECK_EVENT_CONFLICT')
})

test('working together rejects self-help, narrative NPCs, uncooperative actors and unsupported real tool prerequisites', async t => {
  const call = await engine(t), id = await companion(call), before = await call('get_game_state')
  assert.equal((await call('provide_check_help', help('player'))).code, 'CHECK_HELP_SELF')
  assert.equal((await call('provide_check_help', help('narrative-only'))).code, 'CHECK_ACTOR_NOT_MODELED')
  assert.equal((await call('provide_check_help', help(id, { requiredToolId: 'thieves_tools' }))).code, 'CHECK_HELP_TOOL_PROFICIENCY_UNMODELED')
  assert.deepEqual(await call('get_game_state'), before)
  await replace(call, s => { s.npcs[id].disposition = 'neutral' })
  assert.equal((await call('provide_check_help', help(id))).code, 'CHECK_COOPERATION_NOT_MODELED')
})

test('group requires at least half successes, retains exact d20 receipts and replays without reroll', async t => {
  const call = await engine(t, { dice: '20,1' }), id = await companion(call), input = group('group-one', [id], { dc: 15 })
  const result = ok(await call('resolve_group_check', input))
  assert.equal(result.complete, true); assert.equal(result.successes, 1); assert.equal(result.requiredSuccesses, 1); assert.equal(result.success, true)
  const before = await call('get_game_state')
  assert.equal(ok(await call('resolve_group_check', input)).replayed, true)
  assert.deepEqual(await call('get_game_state'), before)
  ok(await call('replace_game_state', { gameState: before }))
  assert.equal(ok(await call('resolve_group_check', input)).replayed, true)
  assert.equal((await call('resolve_group_check', { ...input, dc: 16 })).code, 'CHECK_EVENT_CONFLICT')
})

test('three participants need two successes, natural 20 is not an automatic ability-check success', async t => {
  const call = await engine(t, { dice: '20,20,20' }), a = await companion(call), b = await companion(call)
  const result = ok(await call('resolve_group_check', group('hard-group', [a, b], { dc: 100 })))
  assert.equal(result.requiredSuccesses, 2); assert.equal(result.successes, 0); assert.equal(result.success, false)
})

test('all group actors are validated before any dice, receipt or prepared inspiration consumption', async t => {
  const call = await engine(t, { dice: '17,3' }), id = await companion(call)
  ok(await call('grant_inspiration', { eventId: 'group-inspire', reason: 'Acte établi.' }))
  ok(await call('spend_inspiration', { spendId: 'group-spend', rollKind: 'check' }))
  const before = await call('get_game_state')
  assert.equal((await call('resolve_group_check', group('invalid', [id, 'absent']))).code, 'CHECK_ACTOR_NOT_MODELED')
  assert.deepEqual(await call('get_game_state'), before)
  const good = ok(await call('resolve_group_check', group('valid-after', [id])))
  assert.equal(good.receipt.results[0].roll.rolls[0], 17)
  assert.equal(good.receipt.results[0].roll.rolls[0], 17); assert.match(good.receipt.results[0].roll.detail, /^ADV:/)
})

test('Bardic group continuation preserves already rolled d20 across repeat and restoration then finishes remaining actor once', async t => {
  const call = await engine(t, { dice: '4,6,19' }), id = await companion(call), input = group('held-group', [id])
  await replace(call, s => s.hero.inspiration.push({ targetId: 'player', expiresAt: 600, die: 6 }))
  const held = ok(await call('resolve_group_check', input))
  assert.ok(held.pendingReaction); assert.equal(held.pendingReaction.roll.rolls[0], 4)
  const state = await call('get_game_state'); ok(await call('replace_game_state', { gameState: state }))
  const repeat = ok(await call('resolve_group_check', input)); assert.equal(repeat.pendingReaction.id, held.pendingReaction.id)
  const finished = ok(await call('resolve_reaction', { pendingId: held.pendingReaction.id, choice: 'bardic_inspiration' }))
  assert.equal(finished.complete, true); assert.equal(finished.receipt.results.length, 2)
  assert.equal(finished.receipt.results[0].roll.rolls[0], 4); assert.equal(finished.receipt.results[1].roll.rolls[0], 19)
  assert.equal(ok(await call('resolve_group_check', input)).replayed, true)
})

test('group rejects duplicates, reactive NPCs and combat before mutation', async t => {
  const call = await engine(t), id = await companion(call), before = await call('get_game_state')
  assert.equal((await call('resolve_group_check', group('duplicate', [id, id]))).code, 'CHECK_GROUP_DUPLICATE')
  assert.deepEqual(await call('get_game_state'), before)
  await replace(call, s => { s.monsters[id].controller = 'reactive_npc' })
  assert.equal((await call('resolve_group_check', group('reactive', [id]))).code, 'CHECK_COOPERATION_NOT_MODELED')
  await battle(call, [id])
  assert.equal((await passive(call)).code, 'CHECK_MODE_OUTSIDE_COMBAT')
})

test('persisted group schema rejects duplicate/shifted actors and fabricated completion', () => {
  const input = group('receipt', ['ally']), empty = { input, results: [], complete: false }
  assert.equal(CheckModeStateSchema.safeParse({ groups: { receipt: empty }, help: {} }).success, true)
  assert.equal(CheckModeStateSchema.safeParse({ groups: { receipt: { ...empty, complete: true } }, help: {} }).success, false)
  assert.equal(CheckModeStateSchema.safeParse({ groups: { receipt: { ...empty, input: { ...input, participants: ['player', 'player'] } } }, help: {} }).success, false)
})

test('generic working-together help matches its exact ability rather than every check without a skill', async t => {
  const call = await engine(t, { dice: '7,2,19,6' }), id = await companion(call)
  ok(await call('provide_check_help', help(id, { skill: undefined })))
  const unrelated = ok(await call('roll_ability_check', { entityId: 'player', ability: 'str' }))
  assert.equal(unrelated.advantage, false); assert.deepEqual(unrelated.roll.rolls, [7])
  const matching = ok(await call('roll_ability_check', { entityId: 'player', ability: 'wis' }))
  assert.equal(matching.advantage, true); assert.deepEqual(matching.roll.rolls, [19]); assert.match(matching.roll.detail, /^ADV:/)
  const consumed = ok(await call('roll_ability_check', { entityId: 'player', ability: 'wis' }))
  assert.equal(consumed.advantage, false); assert.deepEqual(consumed.roll.rolls, [6])
})

test('help from a departed scene attempt never grants or consumes advantage on a later matching roll', async t => {
  const call = await engine(t, { dice: '11' }), id = await companion(call)
  ok(await call('provide_check_help', help(id)))
  await replace(call, state => { state.worldTimeSeconds = (state.worldTimeSeconds ?? 0) + 1 })
  const before = await call('get_game_state'), checked = ok(await call('roll_ability_check', { entityId: 'player', ability: 'wis', skill: 'survival' }))
  assert.equal(checked.advantage, false); assert.deepEqual(checked.roll.rolls, [11])
  const after = await call('get_game_state')
  assert.deepEqual(after.hero.effects.filter(effect => effect.data.checkMode === true), before.hero.effects.filter(effect => effect.data.checkMode === true))
})
