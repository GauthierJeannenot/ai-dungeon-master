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
const { assertWorldStateValid, validateWorldState } = loadTsModule('lib/world-validation.ts')

test('world validation accepts the initial adventure world', () => {
  const world = createInitialWorldState()
  const result = validateWorldState(world)

  assert.equal(result.ok, true)
  assert.deepEqual(result.issues, [])
  assert.doesNotThrow(() => assertWorldStateValid(world))
})

test('world validation catches broken room, containment, and recipe invariants', () => {
  const world = createInitialWorldState()
  world.rooms['5'].exits = ['missing-room']
  world.objects.office_drawer.contains = ['missing-object']
  world.objects.recipe_half_office.roomId = 'missing-room'
  world.quests.grammy_recipe.goal = 3

  const result = validateWorldState(world)
  const codes = result.issues.map(issue => issue.code)

  assert.equal(result.ok, false)
  assert.ok(codes.includes('ROOM_EXIT_UNKNOWN'))
  assert.ok(codes.includes('OBJECT_CONTAINS_UNKNOWN'))
  assert.ok(codes.includes('OBJECT_ROOM_UNKNOWN'))
  assert.ok(codes.includes('QUEST_RECIPE_FRAGMENT_COUNT_LOW'))
  assert.throws(() => assertWorldStateValid(world), /Initial|WorldState|validation failed/)
})

test('world validation catches malformed flags, alarms, and event targets', () => {
  const world = createInitialWorldState()
  world.flags = { impossible: 'yes' }
  world.alarms.bakery_alert = { level: 2, raised: false }
  world.eventLog.push({
    id: 'bad-event',
    type: 'object.opened',
    summary: 'Bad target.',
    targetId: 'missing-object',
    visibleToPlayer: true,
  })

  const result = validateWorldState(world)
  const codes = result.issues.map(issue => issue.code)

  assert.equal(result.ok, false)
  assert.ok(codes.includes('WORLD_FLAG_INVALID'))
  assert.ok(codes.includes('ALARM_LEVEL_WITHOUT_RAISED'))
  assert.ok(codes.includes('EVENT_TARGET_OBJECT_UNKNOWN'))
})

test('world validation catches malformed npc goals and alarm clocks', () => {
  const world = createInitialWorldState()
  world.npcs.mac.faction = ''
  world.npcs.mac.goals = ['']
  world.alarms.bakery_alert = {
    level: 2,
    raised: true,
    clock: {
      id: '',
      name: '',
      value: 1,
      thresholds: { bad: -1 },
    },
  }

  const result = validateWorldState(world)
  const codes = result.issues.map(issue => issue.code)

  assert.equal(result.ok, false)
  assert.ok(codes.includes('NPC_FACTION_EMPTY'))
  assert.ok(codes.includes('NPC_GOAL_EMPTY'))
  assert.ok(codes.includes('ALARM_CLOCK_ID_MISSING'))
  assert.ok(codes.includes('ALARM_CLOCK_NAME_MISSING'))
  assert.ok(codes.includes('ALARM_CLOCK_BELOW_LEVEL'))
  assert.ok(codes.includes('ALARM_CLOCK_THRESHOLD_INVALID'))
})
