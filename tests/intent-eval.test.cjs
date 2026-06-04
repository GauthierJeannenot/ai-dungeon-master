const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const evaluator = require(path.join(process.cwd(), 'scripts/evaluate-intent-interpreter.cjs'))

test('intent interpreter evaluation fixture stays green', () => {
  const input = require(path.join(process.cwd(), 'tests/fixtures/intent-interpreter-eval.json'))
  const report = evaluator.evaluateFixture(input)

  assert.equal(report.failedChecks, 0)
  assert.equal(report.failedTurns, 0)
  assert.equal(report.score, 1)
})
