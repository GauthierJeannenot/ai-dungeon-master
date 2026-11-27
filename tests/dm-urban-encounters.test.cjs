const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, {
  LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
})
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { prepareUrbanEncounter, urbanReroll } = require('./helpers/urban-encounter-fixture.cjs')
const llm = require('../lib/dm/llm.ts')
const mcp = require('../lib/mcp-client.ts')
const { POST } = require('../app/api/dm/route.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
test.after(() => pg.restore())

test('the real POST persists only urban reference receipts and leaves the actual player action available', async t => {
  const call = await engine(t, { dice: '12,8,1,1,18,19' })
  const { input } = await prepareUrbanEncounter(call)
  const original = { name: 'check_urban_encounter', input }
  const reroll = { name: 'reroll_urban_encounter', input: urbanReroll(input.eventId) }
  const inspect = { name: 'inspect_urban_encounters', input: { checkId: input.eventId } }
  const action = { name: 'roll_ability_check', input: { entityId: 'player', ability: 'wis', dc: 10 } }
  const { result, seen, before } = await play(t, call, [
    original,
    params => {
      assert.equal(lastResult(params).proposal.label, 'Urchin')
      return reroll
    },
    params => {
      assert.equal(lastResult(params).proposal.label, 'Animals on the loose')
      return inspect
    },
    params => {
      assert.equal(lastResult(params).total, 2)
      return action
    },
    params => {
      assert.equal(lastResult(params).success, true)
      return 'Tu observes le quartier.'
    },
  ], 'J’observe le quartier pendant que le MJ effectue le contrôle de référence.')
  assert.deepEqual(seen, [original, reroll, inspect, action])
  assert.equal(result.newGameState.dmTools.urbanEncounters.checks.length, 1)
  assert.equal(result.newGameState.dmTools.urbanEncounters.rerolls.length, 1)
  for (const key of ['monsters', 'npcs', 'worldFacts', 'encountersTriggered', 'worldTimeSeconds', 'phase'])
    assert.deepEqual(result.newGameState[key], before[key])
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a failed narration retains the actual urban draw in SQL and a new process replays it without dice',
  t => resumeAfterFailedNarration(t, 'draw'))
test('POST failure checkpoints the occurrence d20 and content, then retries the same ID and resolves a real action',
  t => resumeAfterFailedNarration(t, 'd20'))

async function resumeAfterFailedNarration(t, decision) {
  const occurrence = decision === 'd20' ? { notation: '1d20', face: 18 } : undefined
  const original = await engine(t, { dice: occurrence ? '18,12,8,19' : '12,8,19' })
  const { input: prepared } = await prepareUrbanEncounter(original)
  const input = { ...prepared, decision }
  const before = await original('get_game_state')
  const { adventureId, characterId } = before
  const sessionId = `urban-narration-failure-${process.pid}`
  const clientRequestId = 'same-urban-player-request'
  await saveSession(sessionId, { gameState: before, history: [], adventureId, characterId })
  t.after(() => deleteSession(sessionId))
  const { tools } = await original.client.listTools()
  t.mock.method(mcp, 'listMCPTools', async () => tools)
  let active = original
  const gameplay = []
  t.mock.method(mcp, 'callMCPTool', async (name, args = {}) => {
    if (!['get_game_state', 'replace_game_state'].includes(name)) gameplay.push({ name, args })
    return active(name, args)
  })
  let iteration = 0
  const proposal = { faces: [12, 8], total: 20, label: 'Urchin' }
  const check = { name: 'check_urban_encounter', input }
  const action = { name: 'roll_ability_check', input: { entityId: 'player', ability: 'wis', dc: 10 } }
  const tool = ({ name, input: args }) => ({ stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: `urban-call-${iteration}`, name, input: args }] })
  const narrative = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Tu observes le quartier.' }] }
  t.mock.method(llm, 'createLlmMessage', async params => {
    iteration++
    if (iteration === 1 || iteration === 3 || iteration === 6) return tool(check)
    const result = lastResult(params)
    if (iteration === 5) {
      assert.equal(result.success, true)
      return narrative
    }
    assert.deepEqual(result.proposal, proposal)
    assert.deepEqual(result.occurrenceRoll, occurrence)
    if (iteration === 2) {
      assert.equal(result.replayed, false)
      throw new Error('forced failure after actual urban draw')
    }
    assert.equal(result.replayed, true)
    if (iteration === 4) return tool(action)
    assert.equal(iteration, 7)
    return narrative
  })
  const post = (id = clientRequestId) => POST(new Request('http://localhost/api/dm', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, adventureId, characterId, clientRequestId: id,
      message: 'J’observe le quartier pendant le contrôle du MJ.' }),
  }))
  const failed = await post(), error = await failed.json()
  assert.equal(failed.status, 500)
  assert.match(error.error, /forced failure after actual urban draw/)
  const checkpoint = (await loadSession(sessionId)).gameState
  assert.deepEqual(checkpoint.dmTools.urbanEncounters, error.newGameState.dmTools.urbanEncounters)
  assert.deepEqual(checkpoint.dmTools.urbanEncounters.checks[0].proposal, proposal)
  assert.deepEqual(checkpoint.dmTools.urbanEncounters.checks[0].occurrenceRoll, occurrence)
  assert.equal(checkpoint.worldTimeSeconds, before.worldTimeSeconds)
  assert.ok(!checkpoint.handledRequestIds.includes(clientRequestId))
  assert.equal(ok(await original('roll_dice', { notation: '1d20' })).total, 19)

  active = await engine(t, { dice: '18,17' })
  const retry = await post(), resumed = await retry.json()
  assert.equal(retry.status, 200, JSON.stringify(resumed))
  assert.deepEqual(resumed.newGameState.dmTools.urbanEncounters, checkpoint.dmTools.urbanEncounters)
  assert.ok(resumed.newGameState.handledRequestIds.includes(clientRequestId))
  const duplicate = await post()
  assert.equal(duplicate.status, 409)
  assert.equal((await duplicate.json()).code, 'REQUEST_ALREADY_RESOLVED')

  const referenceOnlyId = 'urban-reference-only-success'
  const referenceOnly = await post(referenceOnlyId), reference = await referenceOnly.json()
  assert.equal(referenceOnly.status, 200, JSON.stringify(reference))
  assert.ok(reference.newGameState.handledRequestIds.includes(referenceOnlyId))
  assert.equal((await post(referenceOnlyId)).status, 409)
  assert.equal(iteration, 7)
  assert.deepEqual(gameplay, [
    { name: check.name, args: input }, { name: check.name, args: input },
    { name: action.name, args: action.input }, { name: check.name, args: input },
  ])
  assert.equal(ok(await active('roll_dice', { notation: '1d20' })).total, 17)
}
