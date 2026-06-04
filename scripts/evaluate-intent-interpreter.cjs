#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
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

function option(name, fallback) {
  const prefix = `${name}=`
  const inline = process.argv.find(arg => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = process.argv.indexOf(name)
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1]
  }

  return fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function readInputFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
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
      inventory: [{ id: 'potion-1', name: 'Potion de soin', type: 'potion' }],
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

function fixtureGameState(name) {
  const state = baseGameState()
  if (!name || name === 'base') return state
  if (name === 'bakery-entrance') {
    state.currentRoomId = '4'
    state.roomsVisited = ['1', '4']
    state.player.position = { x: 10, y: 10 }
    return state
  }
  if (name === 'orchard') {
    state.currentRoomId = '2'
    state.roomsVisited = ['1', '2']
    state.player.position = { x: 9, y: 2 }
    return state
  }
  if (name === 'grukk-combat') {
    state.phase = 'combat'
    state.currentTurn = 'player'
    state.currentRoomId = '9'
    state.roomsVisited = ['1', '4', '8', '9']
    state.player.position = { x: 12, y: 5 }
    state.monsters = {
      grukk: {
        id: 'grukk',
        name: 'Grukk',
        hp: { current: 24, max: 24 },
        ac: 13,
        stats: { str: 14, dex: 12, con: 12, int: 8, wis: 10, cha: 8 },
        position: { x: 13, y: 5 },
        speed: 30,
        isAlive: true,
        conditions: [],
      },
    }
    state.initiativeOrder = ['player', 'grukk']
    return state
  }
  return state
}

function turnsFromInput(input) {
  if (Array.isArray(input)) return input
  if (Array.isArray(input.turns)) return input.turns.map(turn => ({ initialGameState: input.initialGameState, ...turn }))
  if (Array.isArray(input.scenarios)) {
    return input.scenarios.flatMap(scenario =>
      (scenario.turns ?? []).map(turn => ({
        initialGameState: turn.initialGameState ?? scenario.initialGameState,
        scenario: scenario.name,
        ...turn,
      }))
    )
  }
  throw new Error('Fixture must be an array, { turns }, or { scenarios }.')
}

function canonicalKind(output) {
  const action = output && typeof output === 'object' ? output.canonicalAction : null
  return action && typeof action === 'object' && typeof action.kind === 'string'
    ? action.kind
    : null
}

function evaluateTurn(turn, interpreter) {
  const state = fixtureGameState(turn.initialGameState)
  const output = turn.intentInterpreterOutput && typeof turn.intentInterpreterOutput === 'object'
    ? turn.intentInterpreterOutput
    : interpreter.interpretPlayerIntentMock({
        message: turn.message,
        gameState: state,
        recentHistory: turn.recentHistory ?? [],
      })

  const checks = []
  if (turn.expectIntentKind) {
    checks.push({
      name: 'intentKind',
      expected: turn.expectIntentKind,
      actual: output.intentKind,
      ok: output.intentKind === turn.expectIntentKind,
    })
  }
  if (turn.expectCanonicalKind) {
    checks.push({
      name: 'canonicalAction.kind',
      expected: turn.expectCanonicalKind,
      actual: canonicalKind(output),
      ok: canonicalKind(output) === turn.expectCanonicalKind,
    })
  }
  if (turn.expectImprovisationType) {
    checks.push({
      name: 'improvisation.type',
      expected: turn.expectImprovisationType,
      actual: output.improvisation?.type ?? null,
      ok: output.improvisation?.type === turn.expectImprovisationType,
    })
  }
  if (typeof turn.expectClarification === 'boolean') {
    checks.push({
      name: 'requiresClarification',
      expected: turn.expectClarification,
      actual: output.requiresClarification,
      ok: output.requiresClarification === turn.expectClarification,
    })
  }

  return {
    scenario: turn.scenario,
    message: turn.message,
    initialGameState: turn.initialGameState ?? 'base',
    output,
    checks,
    ok: checks.every(check => check.ok),
  }
}

function evaluateFixture(input) {
  const interpreter = loadTsModule('lib/intent-interpreter.ts')
  const turns = turnsFromInput(input)
  const results = turns.map(turn => evaluateTurn(turn, interpreter))
  const passed = results.filter(result => result.ok).length
  const totalChecks = results.reduce((sum, result) => sum + result.checks.length, 0)
  const passedChecks = results.reduce((sum, result) => sum + result.checks.filter(check => check.ok).length, 0)
  return {
    totalTurns: results.length,
    passedTurns: passed,
    failedTurns: results.length - passed,
    totalChecks,
    passedChecks,
    failedChecks: totalChecks - passedChecks,
    score: totalChecks > 0 ? passedChecks / totalChecks : 1,
    results,
  }
}

function main() {
  const inputPath = option('--input', path.join('tests', 'fixtures', 'intent-interpreter-eval.json'))
  const input = readInputFile(path.resolve(inputPath))
  const report = evaluateFixture(input)
  const compact = {
    totalTurns: report.totalTurns,
    passedTurns: report.passedTurns,
    failedTurns: report.failedTurns,
    totalChecks: report.totalChecks,
    passedChecks: report.passedChecks,
    failedChecks: report.failedChecks,
    score: Number(report.score.toFixed(4)),
    failures: report.results
      .filter(result => !result.ok)
      .map(result => ({
        scenario: result.scenario,
        message: result.message,
        checks: result.checks.filter(check => !check.ok),
        output: {
          intentKind: result.output.intentKind,
          canonicalKind: canonicalKind(result.output),
          improvisationType: result.output.improvisation?.type ?? null,
          requiresClarification: result.output.requiresClarification,
        },
      })),
  }
  console.log(JSON.stringify(hasFlag('--verbose') ? report : compact, null, 2))
  if (hasFlag('--strict') && report.failedChecks > 0) process.exitCode = 1
}

if (require.main === module) {
  main()
}

module.exports = {
  evaluateFixture,
  evaluateTurn,
  fixtureGameState,
  turnsFromInput,
}
