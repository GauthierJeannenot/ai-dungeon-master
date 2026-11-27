const test = require('node:test')
const assert = require('node:assert/strict')
const wire = require('./helpers/openai-wire.cjs')
Object.assign(process.env, { LLM_MODE: 'live', LLM_PROVIDER: 'openai', ALLOW_PAID_LLM: 'true',
  MONETIZATION_ENABLED: 'false', RUNPOD_AUTO_MANAGE: 'false', DM_RATE_LIMIT_PER_MINUTE: '0',
  OPENAI_BASE_URL: 'https://discovery.simulated/v1', OPENAI_API_KEY: 'private-discovery-key', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { POST } = require('../app/api/dm/route.ts')
const { createToolCatalog } = require('../lib/dm/tool-catalog.ts')
const { buildStaticPrompt } = require('../lib/dm/prompts.ts')
const { TOOLKIT_DOMAINS } = require('../mcp-server/toolkit-support.ts')
const { guidesForDomain } = require('../lib/rule-guides.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
test.after(() => pg.restore())
const metadata = names => names.map(name => ({ name, description: name, input_schema: { type: 'object' } }))

test('explicit discovery loads schemas without executing actions, and cannot retain phase-restricted tools', () => {
  const catalog = createToolCatalog(), available = metadata(['discover_tools','consult_campaign','consult_rules','move_token','inspect_survival','consume_provisions'])
  assert.deepEqual(catalog.exposed(available).map(tool => tool.name), ['discover_tools','consult_campaign','consult_rules','move_token'])
  assert.deepEqual(catalog.discover({ names: ['inspect_survival'] }, available).loaded, ['inspect_survival'])
  assert.ok(catalog.exposed(available).some(tool => tool.name === 'inspect_survival'))
  assert.deepEqual(catalog.discover({ names: ['inspect_survival'] }, available).loaded, [])
  assert.deepEqual(catalog.exposed(metadata(['move_token'])).map(tool => tool.name), ['move_token'])
  assert.ok(catalog.discover({ names: ['replace_game_state'] }, available).error)
  assert.ok(catalog.discover({ names: ['consume_provisions','missing'] }, available).error)
  assert.ok(!catalog.exposed(available).some(tool => tool.name === 'consume_provisions'), 'a refused batch loads nothing')
  for (const input of [{ query: '' }, { query: 'food', names: ['inspect_survival'] }, { offset: -1 }, { names: [] }, { names: ['move_token','move_token'] }, { hidden: true }]) {
    assert.ok(catalog.discover(input, available).error)
  }
  const search = catalog.discover({ query: 'inspect_survival' }, available)
  assert.equal(search.tools[0].name, 'inspect_survival')
  assert.deepEqual(catalog.discover({ query: 'zzzzzz' }, available).tools, [])
  assert.deepEqual(catalog.discover({ names: ['consult_campaign'] }, available).loaded, [])
  assert.ok(catalog.exposed(available).some(tool => tool.name === 'consult_campaign'))
})

test('specialist procedures remain complete, module-independent and reachable through valid domain memberships', () => {
  const guides = require('../lib/dm/rule-guides.json')
  assert.equal(new Set(guides.map(guide => guide.id)).size, guides.length)
  for (const guide of guides) {
    assert.ok(guide.text && guide.domains.length)
    for (const domain of guide.domains) assert.ok(TOOLKIT_DOMAINS.includes(domain), `${guide.id}: ${domain}`)
    assert.doesNotMatch(guide.text, /\$\{|grammy|dryad|grukk|verger/i)
  }
  assert.ok(guidesForDomain('chases').some(guide => guide.text.includes('resolve_chase_turn')))
  assert.ok(guidesForDomain('combat_actions').some(guide => guide.text.includes('tumblePath')))
  const system = buildStaticPrompt('tide-crypt')
  assert.ok(system.length < 35000, 'the permanent prompt must not accumulate specialist manuals again')
  assert.doesNotMatch(system, /tumblePath|qualify_chase_complication|release_inhaled_poison/)
  assert.match(system, /discover_tools/)
  assert.match(system, /get_rules_support/)
})

test('the OpenAI Responses protocol discovers exact schemas, reads a guide, then calls only the selected MCP inspection', async t => {
  const sessionId = `live-discovery-${process.pid}`
  const state = buildInitialGameState('sarah-of-yellowcrest-manor', 'fighter')
  state.worldTimeSeconds ??= 0
  await saveSession(sessionId, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  t.after(async () => { await closeMCPClient(sessionId); await deleteSession(sessionId) })
  let round = 0, wireFailure
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    try {
    if (url === 'https://discovery.simulated/v1/responses/input_tokens') return Response.json({ input_tokens: 1000 })
    assert.equal(url, 'https://discovery.simulated/v1/responses')
    const body = JSON.parse(options.body), names = body.tools.map(tool => tool.name)
    round++
    assert.ok(!JSON.stringify(body).includes('cache_control'))
    if (round === 1) {
      assert.ok(!names.includes('inspect_survival'))
      return tool('discover_tools', { names: ['inspect_survival'] })
    }
    if (round === 2) {
      assert.ok(names.includes('inspect_survival'))
      assert.ok(!names.includes('consume_provisions'))
      return tool('get_rules_support', { domain: 'nutrition' })
    }
    if (round === 3) {
      assert.ok(names.includes('consume_provisions'))
      const receipt = JSON.parse(body.input.filter(item => item.type === 'function_call_output').at(-1).output)
      assert.equal(receipt.domain, 'nutrition')
      assert.ok(receipt.procedures.some(guide => guide.text.includes('begin_nutrition_tracking')))
      assert.ok(!receipt.procedures.some(guide => guide.text.includes('tumblePath')))
      return tool('inspect_survival', {})
    }
    assert.equal(round, 4)
    return wire.response([wire.text('Tu observes tes provisions sans les consommer.')])
    } catch (error) { wireFailure = error; throw error }
  })
  function tool(name, args) { return wire.response([wire.call(name, args, `discovery-${round}`)]) }
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, message: 'Je veux connaître mes besoins, sans rien consommer.', adventureId: state.adventureId, characterId: state.characterId }) }))
  const data = await response.json()
  assert.ifError(wireFailure)
  assert.equal(response.status, 200, JSON.stringify(data))
  assert.deepEqual(data.toolsUsed, ['discover_tools','get_rules_support','inspect_survival'])
  assert.equal(data.usage.llm.calls, 4)
  assert.equal(data.usage.llm.estimatedCostUsd, 0)
  const after = (await loadSession(sessionId)).gameState
  for (const key of ['player','dmTools','worldTimeSeconds','worldFacts']) assert.deepEqual(after[key], JSON.parse(JSON.stringify(state))[key])
})
