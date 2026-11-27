const assert = require('node:assert/strict')
const test = require('node:test')
const { normalizeTurn, validateTurn } = require('../scripts/playtest-contract.cjs')

function fixture() {
  const before = { player: { position: { x: 4, y: 13 } }, combatLog: [], round: 0 }
  const state = { ...before, player: { position: { x: 5, y: 13 } } }
  return { turn: normalizeTurn({ message: 'je vais en (5,13)', expectTools: ['move_token'],
    expectState: { 'player.position': { x: 5, y: 13 } } }), before, status: 200,
    data: { narrative: 'Tu avances.', toolsUsed: ['move_token'], newGameState: state,
      usage: { narrator: 'llm', llm: { calls: 3 } } }, persisted: { gameState: structuredClone(state) } }
}

test('playtest accepts the current response without requiring removed debug, intent or events', () => {
  assert.deepEqual(validateTurn(fixture()), [])
})

test('playtest rejects legacy fixture expectations instead of silently dropping them', () => {
  for (const key of ['expectEvents', 'expectAffordances', 'expectIntentInterpreter', 'expectIntentKind', 'expectNoLlm']) {
    assert.throws(() => normalizeTurn({ message: 'je regarde', [key]: true }), /Unsupported playtest expectation/)
  }
})

test('playtest detects missing mechanics, unchanged destinations, unsaved effects and incomplete combat', () => {
  const input = fixture()
  input.data.toolsUsed = []
  input.data.newGameState = input.before
  input.pending = 'player action spent'
  const checks = validateTurn(input).map(failure => failure.check)
  for (const check of ['tools', 'state', 'persistence', 'combat']) assert.ok(checks.includes(check), check)
})

test('playtest detects 429 errors, absent usage and narration, and forbidden attacks', () => {
  const input = fixture()
  input.status = 429
  input.data.narrative = ''
  delete input.data.usage
  input.turn.forbidTools = ['resolve_attack']
  input.data.toolsUsed.push('resolve_attack')
  const checks = validateTurn(input).map(failure => failure.check)
  for (const check of ['response', 'narration', 'usage', 'tools']) assert.ok(checks.includes(check), check)
})

test('session-log conversion produces a compatible current fixture without old trace expectations', () => {
  const { buildFixture } = require('../scripts/replay-session-log.cjs')
  const value = buildFixture({ turnTraces: [{ input: { raw: 'je fouille le bureau' },
    toolsUsed: ['roll_ability_check'], engineEvents: [{ type: 'old.event' }], traceId: 'old-trace' }] }, 'session.json')
  const turn = normalizeTurn(JSON.parse(JSON.stringify(value.turns[0])))
  assert.deepEqual(turn.expectTools, ['roll_ability_check'])
  assert.equal(turn.expectEvents, undefined)
  assert.equal(turn.expectTargetResolution, undefined)
})

test('removed modes and options fail before opening an engine or making an LLM call', () => {
  const { spawnSync } = require('node:child_process')
  for (const args of [['--mode', 'replay'], ['--mode', 'mock', '--narration-mode', 'budget']]) {
    const result = spawnSync(process.execPath, ['scripts/playtest.cjs', ...args], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Supported playtest modes|Removed playtest option/)
    assert.doesNotMatch(result.stderr, /MCP Game Engine/)
  }
})
