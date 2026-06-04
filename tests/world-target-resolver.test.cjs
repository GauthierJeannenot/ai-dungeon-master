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
      position: { x: 8, y: 6 },
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
    roomsVisited: ['8'],
    currentRoomId: '8',
    encountersTriggered: [],
    world: createInitialWorldState(),
    ...overrides,
  }
}

const targetResolver = loadTsModule('lib/world-target-resolver.ts')

test('target resolver maps explicit natural object aliases to canonical input', () => {
  const state = baseGameState()
  const input = targetResolver.buildWorldActionInput("j'ouvre les sacs de farine", state, 'open')
  const resolution = targetResolver.resolveWorldActionTargets("j'ouvre les sacs de farine", state, 'open')

  assert.deepEqual(input, { kind: 'open', targetName: 'sacs de farine effondres' })
  assert.equal(resolution.targetName, 'sacs de farine effondres')
  assert.equal(resolution.targetSource, 'explicit')
})

test('target resolver maps the initial narrated door through the scene surface', () => {
  const state = baseGameState({
    currentRoomId: '1',
    roomsVisited: ['1'],
    player: {
      ...baseGameState().player,
      position: { x: 4, y: 13 },
    },
  })

  const input = targetResolver.buildWorldActionInput('JE CASSE LA PORTE', state, 'force')
  const composite = targetResolver.buildWorldActionInput('je detruis la porte et je rentre dans le batiment', state, 'force')
  const resolution = targetResolver.resolveWorldActionTargets('JE CASSE LA PORTE', state, 'force')

  assert.deepEqual(input, { kind: 'force', targetName: 'double porte de la boulangerie' })
  assert.deepEqual(composite, { kind: 'force', targetName: 'double porte de la boulangerie', traverse: true })
  assert.equal(resolution.targetName, 'double porte de la boulangerie')
  assert.equal(resolution.targetSource, 'explicit')
})

test('target resolver refuses to invent a door side when several scene portals match', () => {
  const state = baseGameState({
    currentRoomId: '4',
    roomsVisited: ['1', '4'],
    player: {
      ...baseGameState().player,
      position: { x: 12, y: 11 },
    },
  })

  const resolution = targetResolver.resolveWorldActionTargets('je casse la porte', state, 'force')

  assert.equal(resolution.targetName, undefined)
  assert.equal(resolution.targetSource, 'none')
  assert.deepEqual(resolution.ambiguous, [{
    type: 'object',
    candidates: ['double porte de la boulangerie', 'porte de la reserve'],
  }])
})

test('target resolver resolves object anaphora from recent engine events', () => {
  const state = baseGameState({
    currentRoomId: '5',
    roomsVisited: ['5'],
  })
  state.world.eventLog.push({
    id: 'world-open',
    type: 'room.object_discovered',
    summary: 'Le tiroir est decouvert.',
    targetId: 'office_drawer',
    visibleToPlayer: true,
  })
  state.world.objects.office_drawer.visible = true
  state.world.objects.office_drawer.discovered = true

  const input = targetResolver.buildWorldActionInput("je l'ouvre", state, 'open')
  const resolution = targetResolver.resolveWorldActionTargets("je l'ouvre", state, 'open')

  assert.deepEqual(input, { kind: 'open', targetName: 'tiroir du bureau' })
  assert.equal(resolution.targetSource, 'recent_event')
})

test('target resolver reports ambiguous npc anaphora instead of inventing a target', () => {
  const state = baseGameState({
    currentRoomId: '1',
    roomsVisited: ['1'],
  })
  state.world.npcs.dryad_orchard.roomId = '1'
  state.world.npcs.dryad_orchard.known = true

  const resolution = targetResolver.resolveWorldActionTargets('je lui parle', state, 'talk')

  assert.equal(resolution.npcTargetName, undefined)
  assert.equal(resolution.npcTargetSource, 'none')
  assert.deepEqual(resolution.ambiguous, [{
    type: 'npc',
    candidates: ['druidesse du verger', 'Mac'],
  }])
})
