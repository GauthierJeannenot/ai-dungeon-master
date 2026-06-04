const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const replay = require(path.join(process.cwd(), 'scripts/replay-session-log.cjs'))

test('session replay fixture builder extracts turns from TurnTrace logs', () => {
  const inputPath = path.join(process.cwd(), 'tests/fixtures/turn-trace-regression-log.json')
  const input = replay.readInputFile(inputPath)
  const fixture = replay.buildFixture(input, inputPath)

  assert.equal(fixture.name, 'session-regression-turn-trace-regression-log')
  assert.equal(fixture.turns.length, 1)
  assert.equal(fixture.turns[0].message, 'je detruis la porte et je rentre')
  assert.deepEqual(fixture.turns[0].expectTools, ['resolve_player_action'])
  assert.deepEqual(fixture.turns[0].expectEvents, ['door.opened', 'entity.moved'])
  assert.equal(fixture.turns[0].traceId, 'turn-test-1')
})
