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
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    mod._compile(output, filename)
  }

  return () => {
    if (previous) Module._extensions['.ts'] = previous
    else delete Module._extensions['.ts']
  }
}

const restoreTsRequire = installTsRequire()
const { buildDirectorDecision } = require(path.join(process.cwd(), 'lib/dm-director.ts'))

test.after(() => {
  restoreTsRequire()
})

function baseIntent(overrides = {}) {
  return {
    kind: 'move',
    primitive: 'move',
    reason: 'test',
    requiresEngine: true,
    suggestedTools: [],
    confidence: 'high',
    normalizedText: 'test',
    ...overrides,
  }
}

function baseGameState(overrides = {}) {
  return {
    phase: 'exploration',
    player: {
      id: 'player',
      name: 'Heros',
      class: 'Guerrier',
      level: 1,
      hp: { current: 20, max: 20 },
      ac: 16,
      stats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 },
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
    ...overrides,
  }
}

test('director narrates simple attack results locally', () => {
  const decision = buildDirectorDecision({
    playerMessage: "j'attaque le gobelin",
    actionIntent: baseIntent({ kind: 'attack', primitive: 'resolve_attack' }),
    gameState: baseGameState({
      phase: 'combat',
      currentTurn: 'player',
      monsters: {
        goblin_a: {
          id: 'goblin_a',
          name: 'Gobelin test',
          type: 'goblin',
          hp: { current: 0, max: 7 },
          ac: 13,
          stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
          position: { x: 5, y: 13 },
          conditions: [],
          xpValue: 50,
          attackBonus: 4,
          damageDice: '1d6+2',
          speed: 30,
          isAlive: false,
        },
      },
    }),
    toolsUsed: ['resolve_player_attack'],
    newCombatLogEntries: [{
      id: 'log-1',
      round: 1,
      turn: 'player',
      action: 'Heros attaque Gobelin test avec Epee longue',
      mechanicalDetail: '1d20+5: [20]+5 = 25 vs AC 13 -> CRITIQUE | Degats: 16 | MORT',
      timestamp: Date.now(),
    }],
  })

  assert.equal(decision.shouldUseLlmNarrator, false)
  assert.match(decision.narrative ?? '', /Gobelin test/)
  assert.equal(decision.sceneMemory.madeNoise, true)
  assert.ok((decision.sceneMemory.tension ?? 0) >= 1)
  assert.equal(decision.sceneMemory.alertLevel, 2)
  assert.equal(decision.sceneMemory.goblinMorale, 'shaken')
})

test('director prefers accented player attack over earlier enemy attacks', () => {
  const decision = buildDirectorDecision({
    playerMessage: "j'attaque le gobelin",
    actionIntent: baseIntent({ kind: 'attack', primitive: 'resolve_attack' }),
    gameState: baseGameState({
      phase: 'combat',
      currentTurn: 'player',
      monsters: {
        goblin_a: {
          id: 'goblin_a',
          name: 'Gobelin test',
          type: 'goblin',
          hp: { current: 2, max: 7 },
          ac: 13,
          stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
          position: { x: 5, y: 13 },
          conditions: [],
          xpValue: 50,
          attackBonus: 4,
          damageDice: '1d6+2',
          speed: 30,
          isAlive: true,
        },
      },
    }),
    toolsUsed: ['resolve_attack', 'resolve_player_attack'],
    newCombatLogEntries: [
      {
        id: 'log-1',
        round: 1,
        turn: 'goblin_a',
        action: 'Gobelin test attaque Héros avec scimitar',
        mechanicalDetail: '1d20+4: [16]+4 = 20 vs CA 16 -> TOUCHE | Degats: 5',
        timestamp: Date.now(),
      },
      {
        id: 'log-2',
        round: 1,
        turn: 'player',
        action: 'Héros attaque Gobelin test avec Epee longue',
        mechanicalDetail: '1d20+5: [14]+5 = 19 vs CA 13 -> TOUCHE | Degats: 5',
        timestamp: Date.now(),
      },
    ],
  })

  assert.equal(decision.shouldUseLlmNarrator, false)
  assert.match(decision.narrative ?? '', /Ton attaque accroche Gobelin test/)
})

test('director keeps social scenes eligible for LLM narration', () => {
  const decision = buildDirectorDecision({
    playerMessage: 'je negocie avec le gobelin',
    actionIntent: baseIntent({ kind: 'social', primitive: 'narrate', requiresEngine: false }),
    gameState: baseGameState(),
    toolsUsed: [],
    newCombatLogEntries: [],
  })

  assert.equal(decision.narrative, null)
  assert.equal(decision.shouldUseLlmNarrator, true)
})

test('director records noisy scene memory without a tool mutation', () => {
  const decision = buildDirectorDecision({
    playerMessage: 'je hurle dans le couloir pour les provoquer',
    actionIntent: baseIntent({ kind: 'unknown', primitive: 'narrate', requiresEngine: false }),
    gameState: baseGameState(),
    toolsUsed: [],
    newCombatLogEntries: [],
  })

  assert.equal(decision.sceneMemory.madeNoise, true)
  assert.ok((decision.sceneMemory.tension ?? 0) > 0)
  assert.equal(decision.shouldUseLlmNarrator, true)
})

test('director does not increase alert every turn after old noise', () => {
  const decision = buildDirectorDecision({
    playerMessage: 'je regarde autour de moi',
    actionIntent: baseIntent({ kind: 'observe', primitive: 'narrate', requiresEngine: false }),
    gameState: baseGameState({
      sceneMemory: {
        madeNoise: true,
        alertLevel: 1,
        tension: 1,
      },
    }),
    toolsUsed: [],
    newCombatLogEntries: [],
  })

  assert.equal(decision.sceneMemory.madeNoise, true)
  assert.equal(decision.sceneMemory.alertLevel, 1)
})
