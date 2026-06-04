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

const sceneSurface = loadTsModule('lib/scene-surface.ts')
const locationIndex = loadTsModule('lib/location-index.ts')

test('scene surface exposes the narrated front door from the initial room', () => {
  const state = baseGameState()
  const surface = sceneSurface.buildSceneSurface(state)

  const frontDoor = surface.objects.find(object => object.id === 'front_double_door')
  assert.ok(frontDoor)
  assert.equal(frontDoor.distance, 'boundary')
  assert.deepEqual(frontDoor.portal.roomIds, ['1', '4'])
  assert.deepEqual(frontDoor.portal.otherRoomIds, ['4'])
  assert.ok(surface.npcs.some(npc => npc.id === 'mac'))
  assert.ok(surface.exits.some(exit => exit.roomId === '4' && exit.viaObjectId === 'front_double_door'))
  assert.equal(surface.affordances.find(action => action.id === 'world-open-front_double_door')?.enabled, true)
  assert.equal(surface.affordances.find(action => action.id === 'world-force-front_double_door')?.enabled, true)

  const openDoor = surface.affordances.find(action => action.id === 'world-open-front_double_door')
  assert.equal(openDoor.target.id, 'front_double_door')
  assert.equal(openDoor.target.type, 'object')
  assert.deepEqual(openDoor.canonicalAction, {
    kind: 'open',
    targetId: 'front_double_door',
    targetName: 'double porte de la boulangerie',
  })
  assert.ok(openDoor.aliases.includes('pousser'))
  assert.ok(openDoor.preconditions.length > 0)
})

test('location index exposes adjacent npc destinations as movement targets', () => {
  const state = baseGameState()
  const resolution = locationIndex.resolveLocationDestination('je me dirige vers les dryades', state)
  const surface = sceneSurface.buildSceneSurface(state)

  assert.equal(resolution.status, 'resolved')
  assert.equal(resolution.target.roomId, '2')
  assert.deepEqual(resolution.canonicalAction, { kind: 'move', tokenId: 'player', toCell: { x: 9, y: 2 } })
  assert.ok(surface.targets.some(target =>
    target.type === 'npc' &&
    target.kinds.includes('move') &&
    target.aliases.includes('dryades')
  ))
})

test('scene surface exposes present npcs even before they were known', () => {
  const state = baseGameState({
    currentRoomId: '2',
    roomsVisited: ['1', '2'],
    player: {
      ...baseGameState().player,
      position: { x: 9, y: 2 },
    },
  })
  const surface = sceneSurface.buildSceneSurface(state)

  const dryad = surface.npcs.find(npc => npc.id === 'dryad_orchard')
  assert.ok(dryad)
  assert.equal(dryad.known, true)
  assert.equal(dryad.disposition, 'neutral')
  assert.ok(surface.affordances.some(action =>
    action.id === 'world-talk-dryad_orchard' &&
    action.kind === 'talk' &&
    action.enabled
  ))
})

test('initial narrative cannot mention a door without a matching scene affordance', () => {
  const state = baseGameState()
  const narrative = sceneSurface.buildInitialSceneNarrative(state)
  const surface = sceneSurface.buildSceneSurface(state)
  const mentionsDoor = /\bporte\b/i.test(narrative)

  assert.equal(mentionsDoor, true)
  assert.ok(surface.affordances.some(action =>
    action.id === 'world-open-front_double_door' &&
    action.kind === 'open' &&
    action.enabled
  ))
  assert.ok(surface.affordances.some(action =>
    action.id === 'world-force-front_double_door' &&
    action.kind === 'force' &&
    action.enabled
  ))
})

test('scene surface exposes active fiction facts as soft affordances', () => {
  const state = baseGameState({ currentRoomId: '4', roomsVisited: ['1', '4'] })
  state.world.fictionFacts['fact-r4-water-under-door'] = {
    id: 'fact-r4-water-under-door',
    text: "De l'eau magique s'etale sous la porte.",
    roomId: '4',
    status: 'active',
    source: "sort creation d'eau",
    tags: ['water', 'wet_surface'],
  }

  const surface = sceneSurface.buildSceneSurface(state)
  const fact = surface.facts.find(entry => entry.id === 'fact-r4-water-under-door')
  const affordance = surface.affordances.find(action =>
    action.target?.type === 'fiction_fact' &&
    action.target.id === 'fact-r4-water-under-door'
  )

  assert.ok(fact)
  assert.ok(fact.softAffordances.some(action => action.kind === 'improvise'))
  assert.ok(affordance)
  assert.equal(affordance.kind, 'improvise')
  assert.equal(affordance.enabled, true)
  assert.deepEqual(affordance.canonicalAction.usesFactIds, ['fact-r4-water-under-door'])
  assert.ok(surface.targets.some(target =>
    target.type === 'fiction_fact' &&
    target.id === 'fact-r4-water-under-door' &&
    target.kinds.includes('improvise')
  ))
})
