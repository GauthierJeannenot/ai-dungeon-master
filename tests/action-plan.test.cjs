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

const actionPlan = loadTsModule('lib/action-plan.ts')

test('action plan splits force-and-enter into force then canonical move', () => {
  const plan = actionPlan.buildActionPlan(
    'je detruis la porte et je rentre dans le batiment',
    baseGameState(),
    'force'
  )

  assert.equal(plan?.source, 'portal_traversal')
  assert.equal(plan.steps.length, 2)
  assert.deepEqual(plan.steps[0].action, {
    kind: 'force',
    targetName: 'double porte de la boulangerie',
  })
  assert.deepEqual(plan.steps[1].action, {
    kind: 'move',
    tokenId: 'player',
    toCell: { x: 12, y: 11 },
  })
  assert.equal(plan.steps[1].dependsOnPreviousSuccess, true)
})

test('action plan keeps plain door breaking as a single world action', () => {
  const plan = actionPlan.buildActionPlan('JE CASSE LA PORTE', baseGameState(), 'force')

  assert.equal(plan?.source, 'world_action')
  assert.equal(plan.steps.length, 1)
  assert.deepEqual(plan.steps[0].action, {
    kind: 'force',
    targetName: 'double porte de la boulangerie',
  })
})

test('action plan maps natural push-entry to open then move', () => {
  const plan = actionPlan.buildActionPlan('je pousse la porte', baseGameState(), 'move')

  assert.equal(plan?.source, 'portal_traversal')
  assert.equal(plan.steps.length, 2)
  assert.deepEqual(plan.steps[0].action, {
    kind: 'open',
    targetName: 'double porte de la boulangerie',
  })
  assert.deepEqual(plan.steps[1].action, {
    kind: 'move',
    tokenId: 'player',
    toCell: { x: 12, y: 11 },
  })
})

test('action plan refuses to invent an interior door destination', () => {
  const state = baseGameState({
    currentRoomId: '4',
    roomsVisited: ['1', '4'],
    player: {
      ...baseGameState().player,
      position: { x: 12, y: 11 },
    },
  })
  const plan = actionPlan.buildActionPlan('je pousse la porte', state, 'move')

  assert.equal(plan?.source, 'portal_traversal')
  assert.equal(plan.steps.length, 1)
  assert.deepEqual(plan.steps[0].action, { kind: 'open' })
  assert.equal(plan.blocked?.code, 'ACTION_PLAN_TARGET_AMBIGUOUS')
  assert.deepEqual(plan.blocked?.candidates, [
    'double porte de la boulangerie',
    'porte de la reserve',
  ])
})

test('action plan crosses an already-open portal as a move only', () => {
  const state = baseGameState()
  state.world.objects.front_double_door.opened = true
  const plan = actionPlan.buildActionPlan('je rentre', state, 'move')

  assert.equal(plan?.id, 'move-through-open-portal')
  assert.equal(plan.steps.length, 1)
  assert.deepEqual(plan.steps[0].action, {
    kind: 'move',
    tokenId: 'player',
    toCell: { x: 12, y: 11 },
  })
  assert.equal(plan.steps[0].dependsOnPreviousSuccess, undefined)
})
