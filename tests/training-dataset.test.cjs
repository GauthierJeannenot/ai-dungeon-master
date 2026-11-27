const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { resolveReferences, toolResults, validateFixtures, validateToolCall, selectExamples } = require('../scripts/generate-training-dataset.cjs')

test('offline fixtures resolve only explicit references and refuse missing or ambiguous authored targets', () => {
  assert.deepEqual(resolveReferences({ sectionId: { $ref: 'lastToolResult.results.0.sectionId' } },
    { lastToolResult: { results: [{ sectionId: 'srd-5.1-2014:94' }] } }), { sectionId: 'srd-5.1-2014:94' })
  assert.throws(() => resolveReferences({ $ref: 'missing.target' }, {}), /Missing explicit fixture reference/)
  const fixture = JSON.parse(fs.readFileSync('scripts/training/pilot.json', 'utf8'))
  validateFixtures(fixture)
  fixture.scenarios[0].steps[0].text = 'ambiguous'
  assert.throws(() => validateFixtures(fixture), /Choose one explicit tool or textual target/)
  assert.throws(() => validateToolCall({ tools: [{ name: 'inspect_cover', input_schema: {
    type: 'object', properties: { confidence: { enum: ['low', 'medium', 'high'] } }, required: ['confidence'],
  } }] }, { name: 'inspect_cover', input: { confidence: 'invented' } }), /invalid authored arguments/)
})

test('MCP selection keeps only exact agent tool targets and never promotes narration, legacy classifier records or summaries to labels', () => {
  const call = { role: 'assistant', content: [{ type: 'tool_use', name: 'consult_rules', input: { query: 'Wisdom checks' } }] }
  const text = { role: 'assistant', content: [{ type: 'text', text: 'Tu avances.' }] }
  const input = { system: 'exact', messages: [{ role: 'assistant', content: 'An earlier narration stays input, not a target.' }] }
  const examples = [
    { id: 'call', operation: 'dm.turn', target: call, request: input },
    { id: 'narration', operation: 'dm.turn', target: text },
    { id: 'planner', operation: 'dm.plan', target: call },
    { id: 'summary', operation: 'history.compress', target: text },
    { id: 'mixed', operation: 'dm.turn', target: { role: 'assistant', content: [...call.content, ...text.content] } },
  ]
  const { selected, excluded } = selectExamples(examples, 'mcp')
  assert.deepEqual(selected.map(e => e.id), ['call'])
  assert.equal(selected[0], examples[0], 'Selection cannot reconstruct or alter the prompt/target')
  assert.equal(selected[0].request, input)
  assert.equal(excluded.length, 4)
  assert.equal(selectExamples(examples, 'all').selected.length, 5)
  assert.throws(() => selectExamples(examples, 'unknown'), /Role must be/)
  const fixture = JSON.parse(fs.readFileSync('scripts/training/pilot.json', 'utf8'))
  fixture.scenarios[0].group = 'same-family'
  fixture.scenarios[1].group = 'same-family'
  assert.throws(() => validateFixtures(fixture), /family must stay in one split/)
})

function run(args) {
  return spawnSync(process.execPath, ['scripts/generate-training-dataset.cjs', ...args], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 300000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: 'postgres://must-never-be-used.invalid/production',
      RUNPOD_AUTO_MANAGE: 'true', ALLOW_PAID_LLM: 'true', LLM_MODE: 'live',
      LLM_HISTORY_KEEP_RECENT: '10', LLM_HISTORY_COMPRESS_THRESHOLD_CHARS: '4000' },
  })
}

test('offline pilot uses the real route and MCP, preserves dynamic context chronology and exports verified pairs without network', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-dm-dataset-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const output = path.join(root, 'pilot')
  const result = run(['--out', output])
  assert.equal(result.status, 0, result.stdout + result.stderr + result.error)
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'))
  assert.equal(manifest.status, 'validated')
  assert.equal(manifest.reviewStatus, 'needs-review')
  assert.equal(manifest.networkCalls, 0)
  assert.equal(manifest.scenarios, 8)
  assert.equal(manifest.examples, 17)
  assert.deepEqual(manifest.splits, { train: 13, validation: 4 })
  const bytes = fs.readFileSync(path.join(output, 'examples.jsonl'))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files.examples.sha256)
  const examples = bytes.toString('utf8').trim().split('\n').map(JSON.parse)
  assert.equal(new Set(examples.map(e => e.id)).size, 17)
  assert.ok(examples.every(e => e.source === 'synthetic-authored' && e.reviewStatus === 'needs-review' && e.validation.status === 'passed'))
  assert.ok(examples.every(e => e.chat.targetMessageIndex === e.chat.messages.length - 1))
  const dash = examples.filter(e => e.scenarioId === 'rules-dash' && e.operation === 'dm.turn')
  assert.equal(toolResults(dash[0].request.messages).length, 0, 'Future rules cannot leak into the initial input')
  const search = toolResults(dash[1].request.messages).at(-1).value
  assert.equal(search.kind, 'search')
  assert.equal(dash[1].target.content[0].input.sectionId, search.results[0].sectionId)
  const passage = toolResults(dash[2].request.messages).at(-1).value
  assert.equal(passage.kind, 'passage')
  assert.equal(passage.source.license, 'CC-BY-4.0')
  assert.ok(passage.text.length > 4000, 'The actual requested rules passage must remain complete')
  assert.ok(dash[0].request.system[0].text.length > 800)
  assert.deepEqual(dash[0].request.system, dash[2].request.system, 'Rules stay in tool results, not in a rebuilt system')
  const movement = examples.filter(e => e.scenarioId === 'movement-local-refresh' && e.operation === 'dm.turn')
  assert.deepEqual(movement[0].request.system, movement[1].request.system)
  assert.deepEqual(movement[0].request.messages[0], movement[1].request.messages[0], 'Initial turn context remains frozen')
  assert.ok(toolResults(movement[1].request.messages).at(-1).value.sceneContext)
  const summary = examples.find(e => e.operation === 'history.compress')
  const afterSummary = examples.find(e => e.scenarioId === 'history-compression' && e.operation === 'dm.turn')
  assert.ok(afterSummary.request.messages[0].content.includes(summary.target.content[0].text))
  const traces = fs.readdirSync(path.join(output, 'traces')).map(file =>
    fs.readFileSync(path.join(output, 'traces', file), 'utf8').trim().split('\n').map(JSON.parse))
  assert.equal(traces.length, 8)
  assert.ok(traces.every(records => records[0].metadata.source === 'synthetic-authored' && records.at(-1).outcome.status === 200))
  for (const example of examples) {
    const trace = traces.find(records => records[0].turnId === example.traceTurnId)
    assert.ok(trace)
    const requests = trace.filter(record => record.kind === 'llm.request')
    const responses = trace.filter(record => record.kind === 'llm.response')
    const index = Number(example.id.split('/').at(-1)) - 1
    assert.deepEqual(requests[index].payload.params, example.request)
    assert.deepEqual(responses[index].payload.content, example.target.content)
  }
})

test('a false expected engine result fails generation and never exports a successful dataset', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-dm-dataset-invalid-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const fixture = JSON.parse(fs.readFileSync('scripts/training/pilot.json', 'utf8'))
  fixture.scenarios = [fixture.scenarios.find(s => s.id === 'movement-local-refresh')]
  fixture.scenarios[0].steps.at(-1).checks.find(check => check.path === 'lastToolResult.success').equals = false
  const fixturePath = path.join(root, 'bad.json'), output = path.join(root, 'output')
  fs.writeFileSync(fixturePath, JSON.stringify(fixture))
  const result = run(['--fixture', fixturePath, '--out', output])
  assert.equal(result.status, 1)
  assert.equal(fs.existsSync(path.join(output, 'examples.jsonl')), false)
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8')).status, 'failed')
  const second = run(['--out', output])
  assert.equal(second.status, 1, 'An existing nonempty output is never overwritten')
})

test('MCP rules-research corpus executes optional lookups, pagination and direct contrasts with only tool-call supervision', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-dm-mcp-research-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const output = path.join(root, 'output')
  const result = run(['--fixture', 'scripts/training/mcp-rule-research-v1.json', '--role', 'mcp', '--out', output])
  assert.equal(result.status, 0, result.stdout + result.stderr + result.error)
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'))
  assert.equal(manifest.trainingRole, 'mcp')
  assert.equal(manifest.supervision, 'assistant-tool-use-only')
  assert.equal(manifest.networkCalls, 0)
  assert.equal(manifest.scenarios, 16)
  assert.equal(manifest.ruleLookupScenarios, 13)
  assert.equal(manifest.sourceExamples, 61)
  assert.equal(manifest.examples, 45)
  assert.equal(manifest.excludedExamples, 16)
  assert.deepEqual(manifest.splits, { train: 31, validation: 14 })
  const read = name => fs.readFileSync(path.join(output, name), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
  const examples = read('examples.jsonl')
  assert.ok(examples.every(e => e.operation === 'dm.turn' && e.target.content.length && e.target.content.every(b => b.type === 'tool_use')))
  assert.ok(examples.every(e => e.chat.messages[e.chat.targetMessageIndex].content === null
    && e.chat.messages[e.chat.targetMessageIndex].tool_calls.length === 1))
  const files = [...read('train.jsonl'), ...read('validation.jsonl')]
  assert.equal(files.length, examples.length)
  assert.deepEqual(new Set(files.map(e => e.id)), new Set(examples.map(e => e.id)))
  const groups = new Map()
  for (const example of examples) {
    if (groups.has(example.group)) assert.equal(groups.get(example.group), example.split)
    groups.set(example.group, example.split)
  }
  const fixture = JSON.parse(fs.readFileSync('scripts/training/mcp-rule-research-v1.json', 'utf8'))
  for (const scenario of fixture.scenarios.filter(s => s.ruleLookupInitiative === 'agent')) {
    assert.ok(!scenario.message.includes('consult_rules') && !scenario.message.includes('règle'))
    const first = examples.find(e => e.scenarioId === scenario.id)
    assert.equal(first.target.content[0].name, 'consult_rules')
    assert.notEqual(first.request.tool_choice?.type, 'tool')
    assert.ok(first.request.tools.some(tool => tool.name !== 'consult_rules'))
    assert.equal(toolResults(first.request.messages).length, 0, 'A rules passage cannot be present before its lookup')
  }
  const religion = examples.filter(e => e.scenarioId === 'agent-research-religion-success')
  assert.deepEqual(religion.map(e => e.target.content[0].name), ['consult_rules', 'consult_rules', 'consult_rules', 'roll_ability_check'])
  const prior = toolResults(religion[2].request.messages).at(-1).value
  assert.equal(religion[2].target.content[0].input.offset, prior.nextOffset)
  assert.equal(religion[2].target.content[0].input.sectionId, prior.sectionId)
  assert.ok(toolResults(religion[3].request.messages).at(-1).value.text.replace(/\s+/gu, ' ').includes('Religion.'))
  const recovered = examples.filter(e => e.scenarioId === 'agent-research-query-recovery')
  assert.equal(toolResults(recovered[1].request.messages).at(-1).value.results.length, 0)
  assert.equal(recovered[1].target.content[0].input.query, 'Dexterity checks')
  const direct = examples.filter(e => e.ruleLookupInitiative === 'none')
  assert.equal(direct.length, 3)
  assert.ok(direct.every(e => e.target.content[0].name !== 'consult_rules'))
  for (const file of Object.values(manifest.files)) assert.equal(
    createHash('sha256').update(fs.readFileSync(path.join(output, file.file))).digest('hex'), file.sha256)
  const selection = JSON.parse(fs.readFileSync(path.join(output, 'selection.json'), 'utf8'))
  assert.equal(selection.excluded.filter(e => e.reason === 'planner').length, 0)
  assert.ok(selection.excluded.every(e => e.operation !== 'dm.plan'))
  assert.equal(selection.excluded.filter(e => e.reason === 'not-an-agent-tool-call').length, 16)
})


test('offline specialist targets explicitly discover their schema before use, with no network or fabricated MCP action', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-dm-dataset-discovery-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const fixturePath = path.join(root, 'discovery.json'), output = path.join(root, 'result')
  const scenario = {
    id: 'specialist-inspection', split: 'train', adventureId: 'sarah-of-yellowcrest-manor', characterId: 'fighter',
    message: 'Je consulte mes besoins sans rien consommer.',
    unchanged: ['player.hp','player.inventory','player.position'],
    steps: [{ operation: 'dm.turn', tool: { name: 'inspect_survival', input: {} } },
      { operation: 'dm.turn', checks: [{ path: 'lastTool.name', equals: 'inspect_survival' }], text: 'Tu consultes les besoins suivis sans consommer de provision.' }],
  }
  const explicit = { ...scenario, id: 'authored-lookup', steps: [
    { operation: 'dm.turn', tool: { name: 'discover_tools', input: { names: ['inspect_survival'] } } },
    { ...scenario.steps[0], checks: [{ path: 'lastTool.name', equals: 'discover_tools' }] },
    scenario.steps[1],
  ] }
  fs.writeFileSync(fixturePath, JSON.stringify({ schemaVersion: 1, scenarios: [scenario, explicit] }))
  const result = run(['--fixture', fixturePath, '--out', output])
  assert.equal(result.status, 0, result.stdout + result.stderr + result.error)
  const examples = fs.readFileSync(path.join(output, 'examples.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(examples.length, 6)
  assert.equal(examples[0].target.content[0].name, 'discover_tools')
  assert.deepEqual(examples[0].target.content[0].input, { names: ['inspect_survival'] })
  assert.ok(!examples[0].request.tools.some(tool => tool.name === 'inspect_survival'))
  assert.equal(examples[1].target.content[0].name, 'inspect_survival')
  assert.ok(examples[1].request.tools.some(tool => tool.name === 'inspect_survival'))
  assert.equal(toolResults(examples[1].request.messages).at(-1).name, 'discover_tools')
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'))
  assert.equal(manifest.networkCalls, 0)
})
