const assert = require('node:assert/strict')
const test = require('node:test')
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
    roomsVisited: ['4'],
    currentRoomId: '4',
    ...overrides,
  }
}

const actions = loadTsModule('lib/game-actions.ts')

test('game action language classifies compact combat continuations as attacks', () => {
  const gameState = baseGameState({
    phase: 'combat',
    currentTurn: 'player',
    monsters: {
      goblin_1: {
        id: 'goblin_1',
        name: 'Gobelin charpentier',
        type: 'goblin',
        hp: { current: 4, max: 7 },
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

  const intent = actions.classifyPlayerAction('vas-y encore', gameState)
  assert.equal(intent.kind, 'attack')
  assert.equal(intent.primitive, 'resolve_attack')
  assert.equal(intent.reason, 'player-combat-attack-intent')
  assert.deepEqual(intent.suggestedTools, ['resolve_player_attack', 'move_token'])
})

test('game action language does not turn status questions into attacks', () => {
  const gameState = baseGameState({
    phase: 'combat',
    currentTurn: 'player',
    monsters: {
      grukk: {
        id: 'grukk',
        name: 'Chef Grukk',
        type: 'hobgoblin',
        hp: { current: 11, max: 11 },
        ac: 18,
        stats: { str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9 },
        position: { x: 5, y: 13 },
        conditions: [],
        xpValue: 100,
        attackBonus: 3,
        damageDice: '1d8+1',
        speed: 30,
        isAlive: true,
      },
    },
    initiativeOrder: ['player', 'grukk'],
  })

  const intent = actions.classifyPlayerAction('je suis mort ou je continue?', gameState)
  assert.notEqual(intent.kind, 'attack')
  assert.equal(intent.requiresEngine, false)
})

test('game action language routes local objects to canonical world actions', () => {
  const intent = actions.classifyPlayerAction("j'ouvre le tiroir du bureau", baseGameState({ currentRoomId: '5' }))
  assert.equal(intent.kind, 'open')
  assert.equal(intent.primitive, 'world_action')
  assert.deepEqual(intent.suggestedTools, ['resolve_player_action'])
})

test('game action language routes conversational NPC asks to canonical ask', () => {
  const intent = actions.classifyPlayerAction('je parle gentiment a Mac pour lui demander ce qu il sait', baseGameState())
  assert.equal(intent.kind, 'ask')
  assert.equal(intent.primitive, 'world_action')
  assert.deepEqual(intent.suggestedTools, ['resolve_player_action'])
})

test('game action language routes natural world verbs and anaphora to canonical actions', () => {
  const state = baseGameState({ currentRoomId: '5' })
  const cases = [
    ['je regarde', 'examine'],
    ['je lis le papier', 'read'],
    ["je l'ouvre", 'open'],
    ['je le prends', 'take'],
    ['je crochette', 'unlock'],
    ['je crochette le tiroir', 'unlock'],
    ['je crochette la serrure', 'unlock'],
    ['je desamorce le piege', 'disarm'],
    ['je montre la recette a Mac', 'show_item'],
    ['je donne la note a Grukk', 'give_item'],
    ['je persuade la dryade de nous aider', 'persuade'],
    ['je lui demande ou est la recette', 'ask'],
    ['j assemble les deux fragments de recette', 'combine_recipe'],
  ]

  for (const [message, expectedKind] of cases) {
    const intent = actions.classifyPlayerAction(message, state)
    assert.equal(intent.kind, expectedKind, message)
    assert.equal(intent.primitive, 'world_action', message)
    assert.deepEqual(intent.suggestedTools, ['resolve_player_action'], message)
  }
})

test('game action language routes coordinate phrases with vais as movement', () => {
  const intent = actions.classifyPlayerAction('je vais en (11,13)', baseGameState())
  assert.equal(intent.kind, 'move')
  assert.equal(intent.primitive, 'move')
  assert.equal(intent.requiresEngine, true)
})

test('game action language routes dying player acceptance to death save', () => {
  const intent = actions.classifyPlayerAction('ok je tente', baseGameState({
    phase: 'combat',
    currentTurn: 'player',
    player: {
      ...baseGameState().player,
      hp: { current: 0, max: 20 },
      conditions: ['unconscious'],
      deathSaves: { successes: 1, failures: 1 },
    },
  }))

  assert.equal(intent.kind, 'death_save')
  assert.deepEqual(intent.suggestedTools, ['roll_death_save'])
})
