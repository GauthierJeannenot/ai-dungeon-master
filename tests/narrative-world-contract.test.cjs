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

const { createInitialWorldState } = loadTsModule('lib/adventure-world.ts')
const {
  detectUnsupportedNarratedWorldFacts,
  extractNarratedWorldFacts,
} = loadTsModule('lib/narrative-world-contract.ts')

function baseGameState(world = createInitialWorldState()) {
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
      speed: 30,
      inventory: [],
    },
    monsters: {},
    initiativeOrder: [],
    currentTurn: null,
    round: 0,
    movementUsed: {},
    actionUsed: {},
    combatLog: [],
    roomsVisited: ['1'],
    currentRoomId: '1',
    world,
  }
}

test('narrative fact extractor identifies risky world facts', () => {
  const facts = extractNarratedWorldFacts('Tu trouves un fragment de recette, la porte s ouvre, et Grukk accepte de cooperer.')
  const kinds = facts.map(fact => fact.kind)

  assert.ok(kinds.includes('recipe_acquired'))
  assert.ok(kinds.includes('object_opened'))
  assert.ok(kinds.includes('npc_convinced'))
})

test('narrative contract blocks recipe completion and death without engine state', () => {
  const state = baseGameState()
  const problems = detectUnsupportedNarratedWorldFacts(
    'La recette est complete. Tu es mort.',
    state,
    [],
    []
  )
  const reasons = problems.map(problem => problem.reason)

  assert.ok(reasons.includes('recipe_completed_without_engine_state'))
  assert.ok(reasons.includes('player_dead_without_engine_state'))
})

test('narrative contract allows opened and disarmed facts when supported by events', () => {
  const world = createInitialWorldState()
  world.objects.office_drawer.opened = true
  world.objects.animated_knife_rack.disarmed = true
  const state = baseGameState(world)
  const recentEvents = [
    {
      id: 'open-drawer',
      type: 'object.opened',
      summary: 'Tiroir ouvert.',
      targetId: 'office_drawer',
      visibleToPlayer: true,
    },
    {
      id: 'disarm-knives',
      type: 'trap.disarmed',
      summary: 'Couteaux desamorces.',
      targetId: 'animated_knife_rack',
      visibleToPlayer: true,
    },
  ]

  const problems = detectUnsupportedNarratedWorldFacts(
    'Le tiroir est ouvert. Le piege de couteaux est desamorce.',
    state,
    recentEvents,
    ['resolve_player_action']
  )

  assert.deepEqual(problems, [])
})

test('narrative contract blocks calm narration while an alarm remains raised', () => {
  const world = createInitialWorldState()
  world.alarms.bakery_alert.raised = true
  world.alarms.bakery_alert.level = 2
  world.alarms.bakery_alert.reason = 'bruit'
  world.alarms.bakery_alert.clock.value = 2
  const state = baseGameState(world)

  const problems = detectUnsupportedNarratedWorldFacts(
    'Tout est calme, personne ne reagit.',
    state,
    [],
    []
  )

  assert.equal(problems[0]?.reason, 'alarm_ignored_by_narration')
})
