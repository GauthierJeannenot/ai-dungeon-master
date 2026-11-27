const test = require('node:test'), assert = require('node:assert/strict')
const { RestSessionSchema, appendRestActivity, inspectRestPeriod } = require('../mcp-server/dist/lib/rest-state.js')
const session = (kind = 'long', hpAtStart = 1) => RestSessionSchema.parse({
  restId: 'rest', kind, startedAt: 300, hpAtStart, creditedUntil: 300, segments: [] })
const append = (rest, eventId, seconds, activity) => appendRestActivity(rest, {
  eventId, from: rest.creditedUntil, to: rest.creditedUntil + seconds, activity,
  reason: 'Activité explicite pendant la période réellement observée.' })

test('a partial long rest remains ineligible and never grants HP, dice or resource benefits', () => {
  const rest = session(), result = append(rest, 'sleep-six', 21600, 'sleep')
  assert.equal(result.eligible, false); assert.equal(result.durationMissingSeconds, 7200)
  assert.equal(result.sleepMissingSeconds, 0); assert.equal(result.benefitsGranted, false)
})
test('six hours of sleep and two of light activity qualify without inventing sleep during a watch', () => {
  const rest = session()
  append(rest, 'watch', 7200, 'light')
  const result = append(rest, 'sleep', 21600, 'sleep')
  assert.equal(result.eligible, true)
  assert.deepEqual(result.activitySeconds, { sleep: 21600, light: 7200, strenuous: 0 })
})
test('eight hours of light activity cannot substitute for the actual six hours of sleep', () => {
  const result = append(session(), 'watch', 28800, 'light')
  assert.equal(result.eligible, false); assert.equal(result.sleepMissingSeconds, 21600)
})
test('a real one-hour strenuous interruption invalidates a long-rest period despite sufficient sleep', () => {
  const rest = session()
  append(rest, 'sleep', 28800, 'sleep')
  assert.equal(append(rest, 'interruption', 3600, 'strenuous').interrupted, true)
  assert.equal(inspectRestPeriod(rest).eligible, false)
})
test('separate recorded strenuous intervals accumulate under the documented interpretation', () => {
  const rest = session()
  append(rest, 'walking', 1800, 'strenuous'); append(rest, 'sleep', 28800, 'sleep')
  assert.equal(append(rest, 'adventuring', 1800, 'strenuous').eligible, false)
})
test('a short rest requires an hour without a strenuous interruption', () => {
  const rest = session('short')
  assert.equal(append(rest, 'reading', 3599, 'light').eligible, false)
  assert.equal(append(rest, 'last-second', 1, 'light').eligible, true)
  assert.equal(append(rest, 'fight', 1, 'strenuous').eligible, false)
})
test('only a long rest requires at least one actual HP at the selected start', () => {
  const rest = session('long', 0)
  assert.equal(append(rest, 'sleep', 28800, 'sleep').startHpRequired, true)
  assert.equal(inspectRestPeriod(rest).eligible, false)
})
test('record retries cannot add time, while conflicting IDs and fabricated clock gaps leave the period intact', () => {
  const rest = session(), input = { eventId: 'sleep', from: 300, to: 3900,
    activity: 'sleep', reason: 'Sommeil établi dans cet intervalle réel.' }
  appendRestActivity(rest, input)
  const before = structuredClone(rest)
  assert.equal(appendRestActivity(rest, input).replayed, true)
  assert.throws(() => appendRestActivity(rest, { ...input, to: 3901 }), /REST_ACTIVITY_EVENT_CONFLICT/)
  assert.throws(() => appendRestActivity(rest, { ...input, eventId: 'gap', from: 3901, to: 4000 }))
  assert.deepEqual(rest, before)
})
