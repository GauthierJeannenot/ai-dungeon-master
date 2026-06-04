const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const Module = require('node:module')
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

function baseGameState() {
  const { createInitialWorldState } = loadTsModule('lib/adventure-world.ts')
  return {
    phase: 'exploration',
    player: {
      id: 'player',
      name: 'Heros',
      class: 'Fighter',
      level: 1,
      hp: { current: 20, max: 20 },
      ac: 16,
      stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
      proficiencyBonus: 2,
      position: { x: 4, y: 13 },
      conditions: [],
      inventory: [],
      speed: 30,
    },
    monsters: {},
    initiativeOrder: [],
    currentTurn: null,
    round: 1,
    movementUsed: {},
    actionUsed: {},
    combatLog: [],
    roomsVisited: ['1'],
    currentRoomId: '1',
    encountersTriggered: [],
    world: createInitialWorldState(),
  }
}

const turnTrace = loadTsModule('lib/turn-trace.ts')

test('turn trace records narrated facts and unsupported contradictions', () => {
  const state = baseGameState()
  const trace = turnTrace.buildTurnTrace({
    traceId: 'turn-test',
    requestId: 'dm-test',
    startedAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: new Date('2026-01-01T00:00:01Z'),
    playerMessage: 'je regarde',
    inputMode: 'text',
    debug: {
      actionIntent: {
        kind: 'observe',
        primitive: 'narrate',
        reason: 'test',
        confidence: 'high',
        requiresEngine: false,
      },
    },
    actions: [],
    toolsUsed: [],
    gameState: state,
    engineEvents: [],
    affordances: [],
    finalNarration: 'Tu trouves un fragment de recette dans un tiroir.',
    narrator: 'llm',
    llmRoute: 'short',
  })

  assert.equal(trace.schemaVersion, 1)
  assert.equal(trace.input.raw, 'je regarde')
  assert.ok(trace.narrativeFacts.some(fact => fact.kind === 'recipe_acquired'))
  assert.ok(trace.contradictions.some(issue => issue.reason === 'recipe_found_without_engine_state'))
})
