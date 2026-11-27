const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0' })
const pg = installPgMem()
const { POST } = require('../app/api/dm/route.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
const { officeGameState, combatGameState } = require('../scripts/playtest.cjs')
test.after(() => pg.restore())

async function play(t, state, message, dice) {
  const id = `mock-action-${process.pid}-${Date.now()}-${Math.random()}`
  const previousDice = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = dice
  t.after(async () => {
    await closeMCPClient(id); await deleteSession(id)
    if (previousDice === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE
    else process.env.AI_DM_TEST_DICE_SEQUENCE = previousDice
  })
  await saveSession(id, { gameState: state, history: [] })
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: id, message }) }))
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  assert.deepEqual(JSON.parse(JSON.stringify((await loadSession(id)).gameState)), data.newGameState)
  assert.doesNotMatch(data.narrative, /incomplète|scène progresse/i)
  return data
}

for (const [dice, outcome] of [['17', 'SUCCES'], ['1', 'ECHEC']]) {
  test(`mock search resolves one actual check and narrates ${outcome}`, async t => {
    const state = officeGameState()
    const data = await play(t, state, 'je fouille le bureau', dice)
    assert.deepEqual(data.toolsUsed, ['roll_ability_check'])
    assert.equal(data.newGameState.combatLog.length, 1)
    assert.match(data.newGameState.combatLog[0].mechanicalDetail, new RegExp(outcome))
    assert.match(data.narrative, new RegExp(outcome))
    assert.deepEqual(data.newGameState.player.inventory, state.player.inventory)
    assert.deepEqual(data.newGameState.worldFacts, [])
    assert.ok(data.usage.llm.calls <= 3, 'The same search must not be replayed')
  })
}

test('mock peace request uses Persuasion and ends combat only after a successful roll', async t => {
  const data = await play(t, combatGameState(), "ok ok, arretez de m'attaquer on fait la paix", '20')
  assert.deepEqual(data.toolsUsed, ['begin_social_interaction','record_social_conversation','resolve_social_request','end_combat'])
  assert.equal(Object.keys(data.newGameState.dmTools.socialInteractions.records).length, 1, 'ending combat cannot start another dialogue')
  assert.equal(data.usage.llm.calls, 5, 'one request, its combat conclusion and narration need no further interaction')
  assert.equal(data.newGameState.phase, 'exploration')
  assert.equal(data.newGameState.player.hp.current, 18)
  assert.match(data.narrative, /combat cesse/)
})

test('mock standard dialogue persists the actual conversation using D&D2014', async t => {
  const { buildInitialGameState } = require('../lib/initial-game-state.ts')
  const data = await play(t, buildInitialGameState(), 'je parle à mac du soin des arbres', '12')
  assert.deepEqual(data.toolsUsed, ['begin_social_interaction','record_social_conversation'])
  assert.equal(Object.values(data.newGameState.dmTools.socialInteractions.records)[0].conversations.length, 1)
  assert.ok(data.newGameState.socialProfileSeed)
  assert.equal(Object.keys(data.newGameState.socialPersonalities).length, 5)
  assert.match(data.narrative, /Vous échangez/)
})

test('mock failed peace request rolls once, never attacks as the player, and completes the monster response', async t => {
  const data = await play(t, combatGameState(), "ok ok, arretez de m'attaquer on fait la paix", '1,1,20,1')
  assert.deepEqual(data.toolsUsed, ['begin_social_interaction','record_social_conversation','resolve_social_request','next_turn','run_monster_turns'])
  assert.equal(data.newGameState.monsters.goblin_a.hp.current, 60)
  assert.equal(data.newGameState.currentTurn, 'player')
  assert.equal(data.newGameState.round, 2)
  assert.equal(data.newGameState.combatLog.filter(entry => entry.action === 'Interaction sociale').length, 1)
  assert.match(data.narrative, /ECHEC/)
})

