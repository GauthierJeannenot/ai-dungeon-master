const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const test = require('node:test')
const ts = require('typescript')

function installTsRequire() {
  const previous = Module._extensions['.ts']
  Module._extensions['.ts'] = function loadTs(mod, filename) {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText
    mod._compile(output, filename)
  }

  return () => {
    if (previous) Module._extensions['.ts'] = previous
    else delete Module._extensions['.ts']
  }
}

function loadTsModule(relativePath) {
  const restore = installTsRequire()
  try {
    return require(path.join(process.cwd(), relativePath))
  } finally {
    restore()
  }
}

function gameState(overrides = {}) {
  return {
    phase: 'exploration',
    currentTurn: null,
    player: { hp: { current: 20, max: 20 }, conditions: [], inventory: [] },
    monsters: {},
    ...overrides,
  }
}

const pipeline = loadTsModule('lib/turn-pipeline.ts')

test('turn pipeline exposes mutation tools for unknown natural language', () => {
  const tools = [
    { name: 'resolve_player_action' },
    { name: 'get_entity_stats' },
    { name: 'start_encounter' },
  ]
  const selected = pipeline.selectToolsForLlm(tools, gameState(), {
    kind: 'unknown',
    primitive: 'narrate',
    reason: 'test',
    confidence: 'low',
    requiresEngine: false,
    suggestedTools: [],
  }).map(tool => tool.name)

  assert.deepEqual(selected, ['resolve_player_action', 'get_entity_stats'])
})

test('turn pipeline prefers rich narration for world and social intents', () => {
  assert.equal(pipeline.selectIterationLlmRoute({
    kind: 'improvise',
    primitive: 'world_action',
    reason: 'test',
    confidence: 'high',
    requiresEngine: true,
    suggestedTools: ['resolve_player_action'],
  }, false), 'rich')

  assert.equal(pipeline.selectFinalNarrationLlmRoute({
    kind: 'social',
    primitive: 'check',
    reason: 'test',
    confidence: 'high',
    requiresEngine: true,
    suggestedTools: ['resolve_player_action'],
  }, ['resolve_player_action'], false), 'rich')
})

test('turn pipeline reports blocked when budget policy blocks the call', () => {
  assert.equal(pipeline.selectIterationLlmRoute({
    kind: 'unknown',
    primitive: 'narrate',
    reason: 'test',
    confidence: 'low',
    requiresEngine: false,
    suggestedTools: [],
  }, true), 'blocked')
})
