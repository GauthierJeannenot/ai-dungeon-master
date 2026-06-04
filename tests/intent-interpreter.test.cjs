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

const { interpretPlayerIntentMock, validateIntentInterpreterOutput } = loadTsModule('lib/intent-interpreter.ts')
const { createInitialWorldState } = loadTsModule('lib/adventure-world.ts')

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
    roomsVisited: ['1'],
    currentRoomId: '1',
    encountersTriggered: [],
    world: createInitialWorldState(),
    ...overrides,
  }
}

function combatGameState() {
  return baseGameState({
    phase: 'combat',
    currentTurn: 'player',
    monsters: {
      goblin_1: {
        id: 'goblin_1',
        name: 'Gobelin charpentier',
        type: 'goblin',
        hp: { current: 7, max: 7 },
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
    initiativeOrder: ['player', 'goblin_1'],
  })
}

function interpret(message, gameState = baseGameState()) {
  return interpretPlayerIntentMock({ message, gameState })
}

test('intent interpreter validates strict JSON shape', () => {
  const output = validateIntentInterpreterOutput({
    schemaVersion: 1,
    intentKind: 'improvise',
    confidence: 0.8,
    requiresClarification: false,
    canonicalAction: { kind: 'improvise', intent: 'je fais diversion' },
    improvisation: { type: 'distraction_noise' },
    targetHints: {},
    reasoningSummary: 'test',
  }, 'llm')

  assert.equal(output.source, 'llm')
  assert.equal(output.canonicalAction.kind, 'improvise')
})

test('intent interpreter routes prod-like social and question intents without false combat', () => {
  const peace = interpret("arretez de m'attaquer on fait la paix", combatGameState())
  assert.equal(peace.intentKind, 'social_deescalation')
  assert.equal(peace.canonicalAction.kind, 'social')

  const noNpcRoom = baseGameState({
    currentRoomId: '4',
    roomsVisited: ['1', '4'],
    player: { ...baseGameState().player, position: { x: 12, y: 11 } },
  })
  const locationQuestion = interpret('ou sont les gobelins', noNpcRoom)
  assert.equal(locationQuestion.intentKind, 'query_state')
  assert.equal(locationQuestion.canonicalAction, null)
})

test('intent interpreter handles typo attacks and natural NPC speech', () => {
  const attack = interpret("j'attque le gobelin 1", combatGameState())
  assert.equal(attack.intentKind, 'attack')
  assert.equal(attack.canonicalAction.kind, 'attack')

  const orchard = baseGameState({
    currentRoomId: '2',
    roomsVisited: ['1', '2'],
    player: { ...baseGameState().player, position: { x: 9, y: 2 } },
  })
  const ask = interpret('salut je suis la pour recuperer la recette de Grammy', orchard)
  assert.equal(ask.intentKind, 'ask')
  assert.equal(ask.canonicalAction.kind, 'ask')
  assert.equal(ask.targetHints.targetName, 'druidesse du verger')
})

test('intent interpreter makes absurd and creative actions first-class improvisations', () => {
  const examples = [
    ['je pisse sur l arbre', 'social_transgression'],
    ["je cree de l'eau sous la porte", 'environmental_change'],
    ['je lui fais un croche-patte', 'environmental_change'],
    ['je prends un tabouret pour bloquer la porte', 'improvised_tool_object'],
    ['je fais diversion', 'distraction_noise'],
  ]

  for (const [message, type] of examples) {
    const result = interpret(message)
    assert.equal(result.intentKind, 'improvise', message)
    assert.equal(result.canonicalAction.kind, 'improvise', message)
    assert.equal(result.improvisation.type, type, message)
  }
})
