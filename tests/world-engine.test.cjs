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
    encountersTriggered: [],
    ...overrides,
  }
}

function makeGoblin() {
  return {
    id: 'goblin_1',
    name: 'Gobelin',
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
  }
}

const worldEngine = loadTsModule('lib/world-engine.ts')

test('world engine exposes death save as the only active downed combat affordance', () => {
  const state = baseGameState({
    phase: 'combat',
    currentTurn: 'player',
    player: {
      ...baseGameState().player,
      hp: { current: 0, max: 20 },
      conditions: ['unconscious'],
      deathSaves: { successes: 0, failures: 2 },
    },
    monsters: { goblin_1: makeGoblin() },
    initiativeOrder: ['player', 'goblin_1'],
  })

  const affordances = worldEngine.derivePlayerAffordances(state)

  assert.equal(affordances.find(action => action.kind === 'death_save')?.enabled, true)
  assert.equal(affordances.find(action => action.id === 'no-attack-while-unconscious')?.enabled, false)
  assert.equal(affordances.find(action => action.id === 'no-move-while-unconscious')?.enabled, false)
})

test('world engine exposes canonical combat actions for conscious player turns', () => {
  const state = baseGameState({
    phase: 'combat',
    currentTurn: 'player',
    monsters: { goblin_1: makeGoblin() },
    initiativeOrder: ['player', 'goblin_1'],
  })

  const affordances = worldEngine.derivePlayerAffordances(state)

  assert.equal(affordances.find(action => action.kind === 'attack')?.toolName, 'resolve_player_action')
  assert.equal(affordances.find(action => action.kind === 'social')?.toolName, 'resolve_player_action')
  assert.equal(affordances.find(action => action.kind === 'move')?.enabled, true)
  assert.equal(affordances.find(action => action.kind === 'wait')?.toolName, 'resolve_player_action')
  assert.equal(affordances.find(action => action.kind === 'use_item')?.enabled, true)
})

test('world engine converts mechanical logs into canonical events', () => {
  const entries = [
    {
      id: 'log-attack',
      round: 1,
      turn: 'player',
      action: 'Heros attaque Gobelin avec longsword',
      mechanicalDetail: '1d20+5 = 18 vs AC 13 -> HIT | Dmg: 1d8+3 = 7',
      timestamp: 1,
    },
    {
      id: 'log-death-save',
      round: 2,
      turn: 'player',
      action: 'Jet de sauvegarde contre la mort',
      mechanicalDetail: 'Jet de mort: 1d20: [8] = 8 -> ECHEC | 0 succes / 1 echecs',
      timestamp: 2,
    },
  ]

  const events = worldEngine.deriveEngineEventsFromCombatLogEntries(entries)

  assert.equal(events[0].type, 'combat.attack')
  assert.equal(events[0].outcome, 'hit')
  assert.equal(events[1].type, 'combat.death_save')
  assert.equal(events[1].outcome, 'failure')
  assert.equal(events.every(event => event.visibleToPlayer), true)
})

test('world engine derives object and NPC affordances from explicit world state', () => {
  const state = baseGameState({
    currentRoomId: '5',
    roomsVisited: ['5'],
    world: {
      objects: {
        office_drawer: {
          id: 'office_drawer',
          roomId: '5',
          name: 'tiroir du bureau',
          kind: 'container',
          visible: true,
          discovered: true,
          opened: false,
          locked: true,
          contains: ['recipe_half_office'],
          tags: ['drawer', 'recipe_cache'],
          dc: { unlock: 12, force: 13 },
        },
        recipe_half_office: {
          id: 'recipe_half_office',
          roomId: '5',
          name: 'moitie de recette',
          kind: 'clue',
          visible: false,
          discovered: false,
          taken: false,
          tags: ['recipe_half'],
        },
      },
      npcs: {},
      quests: {},
      alarms: {},
      flags: {},
      eventLog: [],
    },
  })

  const affordances = worldEngine.derivePlayerAffordances(state)

  assert.equal(affordances.find(action => action.kind === 'search')?.enabled, true)
  assert.equal(affordances.find(action => action.id === 'world-open-office_drawer')?.enabled, false)
  assert.equal(affordances.find(action => action.id === 'world-unlock-office_drawer')?.enabled, true)
  assert.equal(affordances.find(action => action.id === 'world-force-office_drawer')?.enabled, true)
  assert.equal(affordances.some(action => action.kind === 'take' && action.enabled), false)
})

test('world engine exposes readable inventory, trap, social, and recipe affordances', () => {
  const state = baseGameState({
    currentRoomId: '8',
    roomsVisited: ['8'],
    player: {
      ...baseGameState().player,
      inventory: [
        ...baseGameState().player.inventory,
        { id: 'recipe_half_office', name: 'Moitie de recette brulee', type: 'misc' },
        { id: 'recipe_half_apartment', name: 'Moitie de recette graisseuse', type: 'misc' },
      ],
    },
    world: {
      rooms: {
        '8': { id: '8', name: 'Sol de boulangerie', exits: ['5', '9'] },
      },
      objects: {
        recipe_half_office: {
          id: 'recipe_half_office',
          roomId: '5',
          name: 'moitie de recette brulee',
          kind: 'clue',
          visible: false,
          discovered: true,
          taken: true,
          tags: ['recipe_half', 'readable'],
          readableText: 'Premiere moitie.',
        },
        animated_knife_rack: {
          id: 'animated_knife_rack',
          roomId: '8',
          name: 'ratelier de couteaux animes',
          kind: 'trap',
          visible: true,
          discovered: true,
          used: false,
          disarmed: false,
          tags: ['trap'],
        },
      },
      npcs: {
        mac: {
          id: 'mac',
          name: 'Mac',
          roomId: '8',
          disposition: 'neutral',
          known: true,
        },
      },
      quests: {
        grammy_recipe: {
          id: 'grammy_recipe',
          name: 'Recette de Grammy',
          progress: 2,
          goal: 2,
          completed: false,
          flags: {},
        },
      },
      alarms: {},
      flags: {},
      eventLog: [],
    },
  })

  const affordances = worldEngine.derivePlayerAffordances(state)

  assert.equal(affordances.find(action => action.id === 'world-read-recipe_half_office')?.enabled, true)
  assert.equal(affordances.find(action => action.id === 'world-disarm-animated_knife_rack')?.enabled, true)
  assert.equal(affordances.find(action => action.id === 'world-ask-mac')?.enabled, true)
  assert.equal(affordances.find(action => action.id === 'world-persuade-mac')?.enabled, true)
  assert.equal(affordances.find(action => action.id === 'world-show-item-mac')?.enabled, true)
  assert.equal(affordances.find(action => action.id === 'world-give-item-mac')?.enabled, true)
  assert.equal(affordances.find(action => action.id === 'world-combine-recipe')?.enabled, true)
})

test('world engine includes canonical world events in resolution views', () => {
  const worldEvent = {
    id: 'world-test',
    type: 'door.opened',
    summary: 'La porte est ouverte.',
    actorId: 'player',
    targetId: 'front_double_door',
    outcome: 'success',
    visibleToPlayer: true,
  }
  const state = baseGameState({
    world: {
      objects: {},
      npcs: {},
      quests: {},
      alarms: {},
      flags: {},
      eventLog: [worldEvent],
    },
  })

  const view = worldEngine.buildEngineResolutionView(state, [], [worldEvent])

  assert.equal(view.events[0].type, 'door.opened')
  assert.equal(view.events[0].targetId, 'front_double_door')
  assert.ok(view.affordances.some(action => action.kind === 'search' && action.enabled))
})
