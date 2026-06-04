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

const intentAction = loadTsModule('lib/turn-intent-action.ts')

test('turn intent action normalizes interpreter room moves into canonical cells', () => {
  const { centerCellForAdventureRoom } = loadTsModule('lib/adventure-map.ts')
  const output = {
    schemaVersion: 1,
    intentKind: 'move',
    confidence: 0.9,
    requiresClarification: false,
    canonicalAction: { kind: 'move', targetRoomId: '4' },
    improvisation: null,
    targetHints: {},
    reasoningSummary: 'move to entrance',
    source: 'mock',
  }

  const action = intentAction.interpreterCanonicalAction(output)
  const intent = intentAction.intentFromInterpreterOutput('je rentre dans la boulangerie', output)

  assert.deepEqual(action, { kind: 'move', targetRoomId: '4', tokenId: 'player', toCell: centerCellForAdventureRoom('4') })
  assert.equal(intent.kind, 'move')
  assert.equal(intent.primitive, 'move')
})

test('turn intent action keeps meta and movement outputs but rewrites unresolved creative turns to improvise', () => {
  const state = baseGameState()
  const unresolvedCreative = {
    schemaVersion: 1,
    intentKind: 'creative_unknown',
    confidence: 0.4,
    requiresClarification: true,
    canonicalAction: null,
    improvisation: null,
    targetHints: {},
    reasoningSummary: 'unclear creative action',
    source: 'llm',
  }
  const guidance = { ...unresolvedCreative, intentKind: 'guidance' }
  const movement = { ...unresolvedCreative, intentKind: 'move' }

  const flexible = intentAction.ensureFlexibleInterpreterOutput(unresolvedCreative, 'je pisse sur l arbre', state)

  assert.equal(intentAction.ensureFlexibleInterpreterOutput(guidance, 'je peux faire quoi', state), guidance)
  assert.equal(intentAction.ensureFlexibleInterpreterOutput(movement, 'je pars', state), movement)
  assert.equal(flexible.intentKind, 'improvise')
  assert.equal(flexible.canonicalAction.kind, 'improvise')
  assert.equal(flexible.source, 'llm')
})

test('turn intent action does not execute social and search actions directly', () => {
  const state = baseGameState()

  assert.equal(intentAction.shouldExecuteInterpreterActionDirectly({ kind: 'social' }, state), false)
  assert.equal(intentAction.shouldExecuteInterpreterActionDirectly({ kind: 'search' }, state), false)
  assert.equal(intentAction.shouldExecuteInterpreterActionDirectly({ kind: 'improvise', intent: 'je fais diversion' }, state), true)
})
