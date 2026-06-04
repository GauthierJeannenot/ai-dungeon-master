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
  world.objects.front_double_door.portal = { roomIds: ['1', 'missing-room'] }
  world.quests.grammy_recipe.goal = 3
  world.schemaVersion = 999

  const result = validateWorldState(world)
  const codes = result.issues.map(issue => issue.code)

  assert.equal(result.ok, false)
  assert.ok(codes.includes('WORLD_SCHEMA_VERSION_INVALID'))
  assert.ok(codes.includes('ROOM_EXIT_UNKNOWN'))
  assert.ok(codes.includes('OBJECT_CONTAINS_UNKNOWN'))
  assert.ok(codes.includes('OBJECT_ROOM_UNKNOWN'))
  assert.ok(codes.includes('OBJECT_PORTAL_ROOM_UNKNOWN'))
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

test('world validation accepts and validates fiction facts', () => {
  const world = createInitialWorldState()
  world.fictionFacts['fact-r4-water-under-door'] = {
    id: 'fact-r4-water-under-door',
    text: "De l'eau magique s'etale sous la porte.",
    roomId: '4',
    status: 'active',
    source: "sort creation d'eau",
    tags: ['water', 'wet_surface'],
    softAffordances: [{
      kind: 'improvise',
      label: 'Exploiter la surface mouillee',
      aliases: ['utiliser l eau'],
      canonicalAction: {
        kind: 'improvise',
        usesFactIds: ['fact-r4-water-under-door'],
      },
    }],
  }
  world.eventLog.push({
    id: 'fiction-created',
    type: 'fiction.fact_created',
    summary: "De l'eau magique s'etale sous la porte.",
    targetId: 'fact-r4-water-under-door',
    visibleToPlayer: true,
  })

  const result = validateWorldState(world)

  assert.equal(result.ok, true)
  assert.deepEqual(result.issues, [])
})

test('world validation catches malformed fiction facts and event targets', () => {
  const world = createInitialWorldState()
  world.fictionFacts['bad-fact'] = {
    id: 'bad-fact',
    text: '',
    roomId: 'missing-room',
    status: 'floating',
    tags: [''],
    softAffordances: [{
      kind: 'not_a_real_action',
      label: '',
      aliases: [''],
      canonicalAction: [],
    }],
    metadata: { nested: { no: true } },
  }
  world.eventLog.push({
    id: 'missing-fact-event',
    type: 'fiction.fact_used',
    summary: 'Missing fact used.',
    targetId: 'missing-fact',
    visibleToPlayer: true,
  })

  const result = validateWorldState(world)
  const codes = result.issues.map(issue => issue.code)

  assert.equal(result.ok, false)
  assert.ok(codes.includes('FICTION_FACT_TEXT_MISSING'))
  assert.ok(codes.includes('FICTION_FACT_STATUS_INVALID'))
  assert.ok(codes.includes('FICTION_FACT_ROOM_UNKNOWN'))
  assert.ok(codes.includes('FICTION_FACT_TAG_EMPTY'))
  assert.ok(codes.includes('FICTION_FACT_AFFORDANCE_KIND_INVALID'))
  assert.ok(codes.includes('FICTION_FACT_AFFORDANCE_LABEL_MISSING'))
  assert.ok(codes.includes('FICTION_FACT_AFFORDANCE_ALIAS_EMPTY'))
  assert.ok(codes.includes('FICTION_FACT_AFFORDANCE_ACTION_INVALID'))
  assert.ok(codes.includes('FICTION_FACT_METADATA_INVALID'))
  assert.ok(codes.includes('EVENT_TARGET_FICTION_FACT_UNKNOWN'))
})
