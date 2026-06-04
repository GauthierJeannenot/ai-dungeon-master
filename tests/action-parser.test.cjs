const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
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

const restoreTsRequire = installTsRequireWithAliases()
const parser = require(path.join(process.cwd(), 'lib/action-parser.ts'))
const gameActions = require(path.join(process.cwd(), 'lib/game-actions.ts'))

test.after(() => {
  restoreTsRequire()
})

function baseGameState(overrides = {}) {
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
    roomsVisited: ['4'],
    currentRoomId: '4',
    ...overrides,
  }
}

test('action parser exposes a report_player_intents tool with the valid kind enum', () => {
  assert.equal(parser.ACTION_PARSER_TOOL.name, parser.ACTION_PARSER_TOOL_NAME)
  const enumValues = parser.ACTION_PARSER_TOOL.input_schema.properties.intents.items.properties.kind.enum
  assert.deepEqual(enumValues, gameActions.GAME_ACTION_KINDS)
})

test('mock classifier splits "je vais parler aux dryades" into move then social', () => {
  const specs = parser.mockReportedIntents('je vais parler aux dryades', baseGameState())
  assert.deepEqual(specs.map(spec => spec.kind), ['move', 'social'])
})

test('mock classifier keeps a single intent for a plain movement', () => {
  const specs = parser.mockReportedIntents('je vais en (11,13)', baseGameState())
  assert.deepEqual(specs.map(spec => spec.kind), ['move'])
})

test('intentsFromParserMessage maps tool kinds to full game-action intents', () => {
  const gameState = baseGameState()
  const response = {
    content: [
      {
        type: 'tool_use',
        id: 'toolu_test',
        name: parser.ACTION_PARSER_TOOL_NAME,
        input: { intents: [{ kind: 'move', target: 'dryades' }, { kind: 'social', target: 'dryades' }] },
      },
    ],
  }

  const intents = parser.intentsFromParserMessage(response, gameState, 'je vais parler aux dryades')
  assert.equal(intents.length, 2)
  assert.equal(intents[0].kind, 'move')
  assert.equal(intents[0].primitive, 'move')
  assert.equal(intents[0].requiresEngine, true)
  assert.ok(intents[0].suggestedTools.includes('move_token'))
  assert.equal(intents[1].kind, 'social')
  assert.equal(intents[1].primitive, 'check')
  assert.deepEqual(intents[1].suggestedTools, ['roll_ability_check'])
})

test('intentsFromParserMessage returns empty when no tool block is present', () => {
  const response = { content: [{ type: 'text', text: 'oops' }] }
  assert.deepEqual(parser.intentsFromParserMessage(response, baseGameState(), 'salut'), [])
})

test('intentsFromParserMessage drops unknown and duplicate kinds', () => {
  const response = {
    content: [
      {
        type: 'tool_use',
        id: 'toolu_test',
        name: parser.ACTION_PARSER_TOOL_NAME,
        input: { intents: [{ kind: 'move' }, { kind: 'move' }, { kind: 'bogus' }, { kind: 'social' }] },
      },
    ],
  }
  const intents = parser.intentsFromParserMessage(response, baseGameState(), 'texte')
  assert.deepEqual(intents.map(intent => intent.kind), ['move', 'social'])
})
