const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const test = require('node:test')
const ts = require('typescript')

function installTsRequireWithAliases() {
  const previousTs = Module._extensions['.ts']
  const previousResolve = Module._resolveFilename

  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      const mapped = path.join(process.cwd(), request.slice(2))
      return previousResolve.call(this, mapped, parent, isMain, options)
    }

    return previousResolve.call(this, request, parent, isMain, options)
  }

  Module._extensions['.ts'] = function loadTs(mod, filename) {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    mod._compile(output, filename)
  }

  return () => {
    Module._resolveFilename = previousResolve
    if (previousTs) Module._extensions['.ts'] = previousTs
    else delete Module._extensions['.ts']
  }
}

function loadTsModule(relativePath) {
  const restore = installTsRequireWithAliases()
  try {
    return require(path.join(process.cwd(), relativePath))
  } finally {
    restore()
  }
}

function baseGameState(overrides = {}) {
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
    ...overrides,
  }
}

const { buildTurnDebugStage } = loadTsModule('lib/turn-debug-stage.ts')

test('turn debug stage exposes resolved natural movement targets', () => {
  const debug = buildTurnDebugStage('je vais vers les dryades', baseGameState(), {
    kind: 'move',
    primitive: 'move',
    reason: 'test',
    confidence: 'high',
    requiresEngine: true,
    suggestedTools: ['resolve_player_action'],
    normalizedText: 'je vais vers les dryades',
  })

  assert.deepEqual(debug.parsedAction, { kind: 'move', tokenId: 'player', toCell: { x: 9, y: 2 } })
  assert.equal(debug.targetResolution.status, 'resolved')
  assert.equal(debug.targetResolution.target.id, 'npc:dryad_orchard')
  assert.equal(debug.sceneSurface.currentRoomId, '1')
})

test('turn debug stage records interpreter output and selected canonical action', () => {
  const intentInterpreter = {
    used: true,
    model: 'mock-intent',
    inputSummary: { currentRoomId: '1', availableAffordances: ['talk:mac'] },
    output: {
      schemaVersion: 1,
      intentKind: 'improvise',
      confidence: 0.9,
      requiresClarification: false,
      canonicalAction: { kind: 'improvise', intent: 'je pisse sur l arbre', targetId: 'mac' },
      improvisation: { type: 'social_transgression', summary: 'transgression contre Mac' },
      targetHints: { npc: 'mac' },
      reasoningSummary: 'creative social action',
      source: 'mock',
    },
    fallbackReason: null,
  }

  const debug = buildTurnDebugStage('je pisse sur l arbre', baseGameState(), {
    kind: 'improvise',
    primitive: 'world_action',
    reason: 'intent-interpreter-improvise',
    confidence: 'high',
    requiresEngine: true,
    suggestedTools: ['resolve_player_action'],
    normalizedText: 'je pisse sur l arbre',
  }, intentInterpreter)

  assert.deepEqual(debug.parsedAction, { kind: 'improvise', intent: 'je pisse sur l arbre', targetId: 'mac' })
  assert.equal(debug.intentInterpreterUsed, true)
  assert.equal(debug.intentInterpreterModel, 'mock-intent')
  assert.equal(debug.intentInterpreterOutput.intentKind, 'improvise')
  assert.equal(debug.actionPlan.steps[0].toolName, 'resolve_player_action')
})
