const test = require('node:test'), assert = require('node:assert/strict')
require('./helpers/ts-require.cjs').installTsRequireWithAliases()
const { spatialOpportunityExit } = require('../lib/spatial-opportunity-geometry.ts')
const point = (x, y, zFeet) => ({ x, y, zFeet })

test('the exact vertical exit retains its real irrational height and segment fraction', () => {
  const result = spatialOpportunityExit(point(0, 0, 0), point(1, 0, 5), point(1, 0, 10), 0, 10)
  assert.equal(result.issue, undefined)
  assert.ok(Math.abs(result.exit.point.zFeet - Math.sqrt(75)) < 1e-10)
  assert.ok(Math.abs(result.exit.fraction - (Math.sqrt(75) - 5) / 5) < 1e-10)
  assert.equal(result.exit.point.x, 1)
  assert.ok(Math.abs(result.exit.distanceFeet - 10) < 1e-10)
})

test('a later nonrepresentable XY exit is explicit instead of an invented start-of-step opportunity', () => {
  const result = spatialOpportunityExit(point(0, 0, 0), point(1, 1, 0), point(2, 2, 0), 0, 10)
  assert.equal(result.issue.code, 'SPATIAL_OPPORTUNITY_BOUNDARY_UNREPRESENTABLE')
  assert.equal(result.exit, undefined)
})

test('five and ten foot reaches remain separate and touching an endpoint does not leave reach', () => {
  const from = point(1, 0, 0), to = point(2, 0, 0), origin = point(0, 0, 0)
  assert.equal(spatialOpportunityExit(origin, from, to, 0, 5).exit.fraction, 0)
  assert.deepEqual(spatialOpportunityExit(origin, from, to, 0, 10), {})
})

test('a motion wholly outside the actual selected reach has no fabricated boundary', () => {
  assert.deepEqual(spatialOpportunityExit(point(0, 0, 0), point(2, 2, 10), point(2, 2, 15), 0, 5), {})
})
