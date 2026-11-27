#!/usr/bin/env node
'use strict'

// Offline supervised demonstrations. This script alone substitutes authored
// responses for the LLM; production code and player interpretation are untouched.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const { AjvJsonSchemaValidator } = require('@modelcontextprotocol/sdk/validation/ajv')
const schemaValidator = new AjvJsonSchemaValidator()
const compiledSchemas = new Map()

const clone = value => JSON.parse(JSON.stringify(value))
function at(value, selector) {
  return selector.split('.').reduce((current, key) => current?.[key], value)
}
function resolveReferences(value, scope) {
  if (Array.isArray(value)) return value.map(item => resolveReferences(item, scope))
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value.$ref === 'string') {
      const found = at(scope, value.$ref)
      assert.notEqual(found, undefined, `Missing explicit fixture reference: ${value.$ref}`)
      return clone(found)
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveReferences(item, scope)]))
  }
  return value
}
function toolResults(messages) {
  const names = new Map(), results = []
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    for (const block of message.content) {
      if (block.type === 'tool_use') names.set(block.id, block.name)
      if (block.type === 'tool_result') {
        assert.equal(typeof block.content, 'string', 'The fixture expects the real textual MCP result')
        results.push({ name: names.get(block.tool_use_id), id: block.tool_use_id,
          isError: block.is_error === true, value: JSON.parse(block.content) })
      }
    }
  }
  return results
}
function verifyConditions(scope, conditions = []) {
  for (const condition of conditions) {
    const value = at(scope, condition.path)
    if (Object.hasOwn(condition, 'equals')) assert.deepEqual(value, condition.equals, condition.path)
    if (Object.hasOwn(condition, 'includes')) {
      assert.equal(typeof value, 'string', condition.path)
      assert.ok(value.replace(/\s+/gu, ' ').includes(condition.includes), `${condition.path} must contain ${condition.includes}`)
    }
    if (Object.hasOwn(condition, 'exists')) assert.equal(value !== undefined, condition.exists, condition.path)
  }
}
function historyFor(scenario) {
  if (!scenario.historyTemplate) return clone(scenario.history || [])
  const { pairs, repetitions, player, dm } = scenario.historyTemplate
  assert.ok(Number.isInteger(pairs) && pairs > 0 && Number.isInteger(repetitions) && repetitions > 0)
  return Array.from({ length: pairs }, () => [
    { role: 'player', content: (player + ' ').repeat(repetitions).trim() },
    { role: 'dm', content: (dm + ' ').repeat(repetitions).trim() },
  ]).flat()
}
function validateFixtures(fixture) {
  assert.equal(fixture.schemaVersion, 1)
  assert.ok(Array.isArray(fixture.scenarios) && fixture.scenarios.length > 0)
  const seen = new Set()
  const groupSplits = new Map()
  for (const scenario of fixture.scenarios) {
    assert.match(scenario.id, /^[a-z0-9_-]+$/)
    assert.ok(!seen.has(scenario.id), `Duplicate scenario: ${scenario.id}`)
    seen.add(scenario.id)
    assert.ok(['train', 'validation'].includes(scenario.split))
    if (scenario.group !== undefined) {
      assert.match(scenario.group, /^[a-z0-9_-]+$/)
      if (groupSplits.has(scenario.group)) assert.equal(groupSplits.get(scenario.group), scenario.split, 'A scenario family must stay in one split')
      groupSplits.set(scenario.group, scenario.split)
    }
    if (scenario.ruleLookupInitiative !== undefined) assert.ok(['agent', 'none', 'player'].includes(scenario.ruleLookupInitiative))
    assert.equal(typeof scenario.message, 'string')
    assert.ok(scenario.message.trim())
    assert.ok(scenario.adventureId && scenario.characterId)
    assert.ok(Array.isArray(scenario.steps) && scenario.steps.length >= 1)
    for (const step of scenario.steps) {
      assert.ok(['dm.turn', 'dm.npc', 'history.compress', 'dm.final_narration', 'dm.repair_narration'].includes(step.operation))
      assert.equal(Boolean(step.tool), step.text === undefined, 'Choose one explicit tool or textual target per step')
      if (step.tool) assert.ok(step.tool.name && step.tool.input && typeof step.tool.input === 'object')
      else assert.ok(typeof step.text === 'string' && step.text.trim())
    }
  }
}
function hashFile(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex') }
function validateToolCall(params, call) {
  const declared = params.tools?.find(tool => tool.name === call.name)
  assert.ok(declared, `Tool not exposed: ${call.name}`)
  const key = JSON.stringify(declared.input_schema)
  if (!compiledSchemas.has(key)) compiledSchemas.set(key, schemaValidator.getValidator(declared.input_schema))
  const result = compiledSchemas.get(key)(call.input)
  assert.ok(result.valid, `${call.name}: invalid authored arguments: ${result.errorMessage}`)
}

function selectExamples(examples, role) {
  assert.ok(['all', 'mcp'].includes(role), 'Role must be all or mcp')
  const selected = [], excluded = []
  for (const example of examples) {
    const isMcp = ['dm.turn', 'dm.npc'].includes(example.operation)
      && example.target.role === 'assistant' && example.target.content.length > 0
      && example.target.content.every(block => block.type === 'tool_use')
    if (role === 'all' || isMcp) selected.push(example)
    else excluded.push({ id: example.id, scenarioId: example.scenarioId, operation: example.operation,
      reason: 'not-an-agent-tool-call' })
  }
  return { selected, excluded }
}

async function generate({ fixturePath, outputDir, provider = 'openai', role = 'all' }) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  validateFixtures(fixture)
  assert.equal(provider, 'openai', 'Provider must be openai')
  assert.ok(['all', 'mcp'].includes(role), 'Role must be all or mcp')
  if (fs.existsSync(outputDir)) assert.equal(fs.readdirSync(outputDir).length, 0, 'Output directory must be empty')
  fs.mkdirSync(outputDir, { recursive: true })
  const runId = randomUUID()
  // Dedicated CLI process, isolated SQL store and hard network prohibition.
  Object.assign(process.env, {
    LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: provider,
    MONETIZATION_ENABLED: 'false', RUNPOD_AUTO_MANAGE: 'false',
    DM_RATE_LIMIT_PER_MINUTE: '0', DM_DAILY_GLOBAL_MESSAGE_LIMIT: '0',
    LLM_TRAINING_FILE_ENABLED: 'true', LLM_TRAINING_DIR: path.join(outputDir, 'traces'),
    APP_LOG_BUFFER_ENABLED: 'false', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
  })
  const { installPgMem } = require('../tests/helpers/pg-mem.cjs')
  const pg = installPgMem()
  const recorder = require('../lib/training-recorder.ts')
  const llm = require('../lib/dm/llm.ts')
  const { logLlmUsage } = require('../lib/llm-usage.ts')
  const { buildInitialGameState } = require('../lib/initial-game-state.ts')
  const { buildVllmRequest } = require('../lib/dm/vllm.ts')
  const { saveSession, loadSession } = require('../lib/session-store.ts')
  const { closeMCPClient } = require('../lib/mcp-client.ts')
  const { dbQuery } = require('../lib/db.ts')
  const originalFetch = globalThis.fetch, originalLlm = llm.createLlmMessage, originalStart = recorder.startRecording
  let active, nextStep = 0, emittedCalls = 0, attemptedNetworkCalls = 0
  const automaticDiscoveryIds = new Set()
  const problems = [], examples = [], scenarios = [], sources = new Map()
  const manifest = { schemaVersion: 1, runId, source: 'synthetic-authored', status: 'generating',
    reviewStatus: 'needs-review', provider, trainingRole: role, createdAt: new Date().toISOString(),
    fixture: { path: path.relative(process.cwd(), fixturePath), sha256: hashFile(fixturePath) },
    networkCalls: 0, tokenBudgetValidation: 'not-run-offline',
    configuration: { model: llm.MODEL, compressModel: llm.COMPRESS_MODEL,
      historyKeepRecent: process.env.LLM_HISTORY_KEEP_RECENT || '10',
      historyCompressThresholdChars: process.env.LLM_HISTORY_COMPRESS_THRESHOLD_CHARS || '4000' },
    sourceHashes: Object.fromEntries(['scripts/generate-training-dataset.cjs', 'app/api/dm/route.ts', 'lib/dm/prompts.ts', 'lib/dm/history.ts',
      'lib/dm/scene-map.ts', 'lib/dm/openai.ts', 'lib/dm/vllm.ts', 'lib/dm/tool-catalog.ts', 'lib/dm/rule-guides.json',
      'mcp-server/dist/mcp-server/index.js'].map(file => [file, hashFile(file)])),
  }
  globalThis.fetch = async () => { attemptedNetworkCalls++; throw new Error('Network forbidden during offline dataset generation') }
  recorder.startRecording = (sessionId, metadata) => originalStart(sessionId, { ...metadata,
    source: 'synthetic-authored', scenarioId: active.id, datasetRunId: runId })
  llm.createLlmMessage = async (params, context) => {
    try {
      const authored = active.steps[nextStep]
      assert.ok(authored, `No authored response for ${active.id}/${context.operation}`)
      assert.equal(context.operation, authored.operation, `${active.id}: unexpected LLM operation`)
      // Synthetic agent only: the fixture explicitly chooses the exact tool name.
      // Record its schema lookup before use, never an invisible-schema target.
      const needsSchema = authored.tool && !params.tools?.some(tool => tool.name === authored.tool.name)
      if (needsSchema) assert.ok(context.availableTools?.some(tool => tool.name === authored.tool.name),
        `Fixture tool currently unavailable: ${authored.tool.name}`)
      const step = needsSchema ? { operation: authored.operation,
        tool: { name: 'discover_tools', input: { names: [authored.tool.name] } } } : authored
      if (!needsSchema) nextStep++
      emittedCalls++
      if (needsSchema) automaticDiscoveryIds.add(`synthetic-${active.id}-${emittedCalls}`)
      const results = toolResults(params.messages).filter(result => !automaticDiscoveryIds.has(result.id))
      const last = results.at(-1)
      const scope = { params, gameState: context.gameState, lastTool: last, lastToolResult: last?.value }
      verifyConditions(scope, step.checks)
      const content = step.tool ? [{ type: 'tool_use', id: `synthetic-${active.id}-${emittedCalls}`,
        name: step.tool.name, input: resolveReferences(step.tool.input, scope) }]
        : [{ type: 'text', text: step.text }]
      if (step.tool) validateToolCall(params, content[0])
      if (params.tool_choice?.type === 'tool') assert.equal(step.tool?.name, params.tool_choice.name, 'Forced tool must be honored')
      if (params.tool_choice?.type === 'any') assert.ok(step.tool, 'An authored tool is required here')
      const response = { id: `synthetic-${active.id}-${emittedCalls}`, type: 'message', role: 'assistant',
        model: params.model, content, stop_reason: step.tool ? 'tool_use' : 'end_turn', stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 } }
      // Snapshot the exact request, including schemas actually exposed at this step.
      const request = clone(params)
      await recorder.captureExchange('llm', { params, operation: context.operation, provider,
        mode: 'mock', source: 'synthetic-authored', scenarioId: active.id }, async () => response)
      context.usageLog.push(logLlmUsage({ requestId: context.requestId, sessionId: context.sessionId,
        inputMode: context.inputMode, operation: context.operation, model: params.model, provider,
        usage: response.usage, stopReason: response.stop_reason, metadata: { source: 'synthetic-authored' } }))
      const target = { role: 'assistant', content: clone(response.content) }
      const chat = buildVllmRequest({ ...request, messages: [...request.messages, target] })
      examples.push({ schemaVersion: 1, id: `${active.id}/${emittedCalls}`, runId, scenarioId: active.id,
        split: active.split, source: 'synthetic-authored', reviewStatus: 'needs-review',
        group: active.group, ruleLookupInitiative: active.ruleLookupInitiative,
        operation: context.operation, request, target, chat: { messages: chat.messages, tools: chat.tools || [],
          targetMessageIndex: chat.messages.length - 1, chatTemplateKwargs: chat.chat_template_kwargs },
        validation: { conditions: step.checks || [], ...(needsSchema ? { schemaDiscovery: 'explicit-fixture-tool-name' } : {}), ...(step.tool ? { toolSchema: 'passed' } : {}) } })
      return response
    } catch (error) { problems.push(error.message); throw error }
  }
  const { POST } = require('../app/api/dm/route.ts')
  try {
    for (const scenario of fixture.scenarios) {
      active = scenario; nextStep = 0; emittedCalls = 0; automaticDiscoveryIds.clear()
      process.env.AI_DM_TEST_DICE_SEQUENCE = scenario.diceSequence || '17,12,8,16'
      const sessionId = `synthetic-${runId}-${scenario.id}`
      const initial = buildInitialGameState(scenario.adventureId, scenario.characterId)
      const history = historyFor(scenario)
      const startIndex = examples.length
      try {
        await saveSession(sessionId, { gameState: initial, history, summaryContext: scenario.summaryContext,
          adventureId: scenario.adventureId, characterId: scenario.characterId })
        const response = await POST(new Request('http://offline.local/api/dm', { method: 'POST',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId,
            adventureId: scenario.adventureId, characterId: scenario.characterId, message: scenario.message }) }))
        const body = await response.json()
        assert.equal(response.status, 200, `${scenario.id}: ${body.error}`)
        assert.deepEqual(problems, [], 'An authored step failed')
        assert.equal(nextStep, scenario.steps.length, `${scenario.id}: some authored steps were never used`)
        const stored = await loadSession(sessionId)
        assert.deepEqual(body.newGameState, stored.gameState)
        for (const selector of scenario.unchanged || []) assert.deepEqual(at(body.newGameState, selector), at(initial, selector), selector)
        verifyConditions({ state: body.newGameState, body }, scenario.checks)
        assert.deepEqual(body.toolsUsed, [...new Set(examples.slice(startIndex).flatMap(example => example.target.content.filter(block => block.type === 'tool_use').map(block => block.name)))])
        assert.equal(attemptedNetworkCalls, 0)
        const turn = (await dbQuery('SELECT * FROM training_turns WHERE session_id=$1', [sessionId])).rows[0]
        const events = (await dbQuery('SELECT sequence,kind,payload FROM training_events WHERE turn_id=$1 ORDER BY sequence', [turn.id])).rows
        const requests = events.filter(event => event.kind === 'llm.request')
        const outputs = events.filter(event => event.kind === 'llm.response')
        const generated = examples.slice(startIndex)
        if (scenario.ruleLookupInitiative === 'agent') {
          const first = generated.find(example => example.operation === 'dm.turn')
          assert.equal(first?.target.content[0]?.name, 'consult_rules', 'The agent must choose its initial rules lookup')
          assert.notEqual(first.request.tool_choice?.type, 'tool', 'A named forced tool is not an autonomous lookup choice')
          assert.ok(first.request.tools.length > 1, 'The agent must have alternative tools available')
        }
        if (scenario.ruleLookupInitiative === 'none') assert.ok(generated.every(example =>
          example.target.content.every(block => block.type !== 'tool_use' || block.name !== 'consult_rules')), 'Direct-action contrast must not consult rules')
        assert.equal(generated.length, requests.length)
        assert.equal(requests.length, outputs.length)
        for (let i = 0; i < generated.length; i++) {
          assert.deepEqual(generated[i].request, requests[i].payload.params)
          assert.deepEqual(generated[i].target.content, outputs[i].payload.content)
          generated[i].validation.status = 'passed'
          generated[i].traceTurnId = turn.id
        }
        for (const event of events.filter(event => event.kind === 'mcp.response')) {
          for (const block of event.payload.content || []) {
            if (block.type !== 'text') continue
            const result = JSON.parse(block.text)
            const refs = [result, ...(result.results || [])]
            for (const ref of refs) if (ref.source?.sha256) sources.set(ref.source.sha256, ref.source)
          }
        }
        assert.deepEqual(turn.outcome.body, body)
        scenarios.push({ id: scenario.id, split: scenario.split, sessionId, initialGameState: initial,
          group: scenario.group, ruleLookupInitiative: scenario.ruleLookupInitiative,
          history, summaryContext: scenario.summaryContext || null, message: scenario.message,
          finalGameState: body.newGameState, narrative: body.narrative, exampleIds: generated.map(e => e.id),
          validation: 'passed' })
        console.log(`Validated ${scenario.id}: ${generated.length} exact request/target pairs`)
      } finally { await closeMCPClient(sessionId) }
    }
    assert.equal(attemptedNetworkCalls, 0)
    const { selected, excluded } = selectExamples(examples, role)
    assert.ok(selected.length > 0, 'No training targets match the requested role')
    for (const scenario of scenarios) {
      scenario.sourceExampleIds = scenario.exampleIds
      scenario.exampleIds = selected.filter(example => example.scenarioId === scenario.id).map(example => example.id)
    }
    fs.writeFileSync(path.join(outputDir, 'examples.jsonl'), selected.map(example => JSON.stringify(example)).join('\n') + '\n')
    fs.writeFileSync(path.join(outputDir, 'scenarios.json'), JSON.stringify(scenarios, null, 2) + '\n')
    fs.copyFileSync(fixturePath, path.join(outputDir, 'fixture.json'))
    Object.assign(manifest, { status: 'validated', scenarios: scenarios.length, examples: selected.length,
      sourceExamples: examples.length, excludedExamples: excluded.length,
      splits: Object.fromEntries(['train', 'validation'].map(split => [split, selected.filter(e => e.split === split).length])),
      supervision: role === 'mcp' ? 'assistant-tool-use-only' : 'all-authored-targets',
      controlTargetsIncluded: role === 'mcp' ? false : null,
      ruleLookupScenarios: scenarios.filter(s => s.ruleLookupInitiative === 'agent').length,
      toolTargets: selected.reduce((counts, example) => {
        for (const block of example.target.content) if (block.type === 'tool_use') counts[block.name] = (counts[block.name] || 0) + 1
        return counts
      }, {}),
      networkCalls: attemptedNetworkCalls, documentarySources: [...sources.values()],
      files: { examples: { file: 'examples.jsonl', sha256: hashFile(path.join(outputDir, 'examples.jsonl')) },
        scenarios: { file: 'scenarios.json', sha256: hashFile(path.join(outputDir, 'scenarios.json')) } } })
    if (role === 'mcp') {
      for (const split of ['train', 'validation']) {
        const file = `${split}.jsonl`, entries = selected.filter(example => example.split === split)
        fs.writeFileSync(path.join(outputDir, file), entries.length ? entries.map(example => JSON.stringify(example)).join('\n') + '\n' : '')
        manifest.files[split] = { file, sha256: hashFile(path.join(outputDir, file)) }
      }
      fs.writeFileSync(path.join(outputDir, 'selection.json'), JSON.stringify({ role, excluded }, null, 2) + '\n')
      manifest.files.selection = { file: 'selection.json', sha256: hashFile(path.join(outputDir, 'selection.json')) }
    }
    return manifest
  } catch (error) {
    Object.assign(manifest, { status: 'failed', error: error.message, networkCalls: attemptedNetworkCalls })
    throw error
  } finally {
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    globalThis.fetch = originalFetch; llm.createLlmMessage = originalLlm; recorder.startRecording = originalStart
    pg.restore()
  }
}

function option(args, flag, fallback) {
  const index = args.indexOf(flag)
  if (index < 0) return fallback
  assert.ok(args[index + 1] && !args[index + 1].startsWith('--'), `Missing value for ${flag}`)
  return args[index + 1]
}
if (require.main === module) {
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i += 2) assert.ok(['--fixture', '--out', '--provider', '--role'].includes(args[i]), `Unknown option: ${args[i]}`)
  const outputDir = path.resolve(option(args, '--out', path.join('llm_training', 'synthetic', new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8))))
  generate({ fixturePath: path.resolve(option(args, '--fixture', 'scripts/training/pilot.json')), outputDir,
    provider: option(args, '--provider', 'openai'), role: option(args, '--role', 'all') }).then(manifest => {
      console.log(JSON.stringify({ outputDir, scenarios: manifest.scenarios, examples: manifest.examples, networkCalls: manifest.networkCalls }))
    }).catch(error => { console.error(error.message); process.exitCode = 1 })
}
module.exports = { generate, resolveReferences, toolResults, verifyConditions, validateFixtures, validateToolCall, selectExamples }
