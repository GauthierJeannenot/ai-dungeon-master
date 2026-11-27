const test = require('node:test')
const assert = require('node:assert/strict')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
test.after(restore)

const { getAdventureMap, seedAdventureNpcs } = require('../lib/adventure-map.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { loadAdventureModuleParsed, parseAdventureModule } = require('../lib/context-loader.ts')
const { localCreatureScope, localPendingEncounters } = require('../lib/dm/local-creatures.ts')
const { buildLocalBestiaryContext } = require('../lib/dm/local-bestiary.ts')
const { buildLocalRoomContext, buildNearbyRoomContext } = require('../lib/dm/nearby-rooms.ts')
const { buildDynamicPrompt, buildStaticSystemBlocks, serializeGameState } = require('../lib/dm/prompts.ts')
const { renderSceneMap } = require('../lib/dm/scene-map.ts')
const { narrationEvidence } = require('../lib/dm/narration.ts')

function fixture(t) {
  const state = buildInitialGameState()
  const data = getAdventureMap(), original = structuredClone(data)
  const parsed = loadAdventureModuleParsed(), rooms = parsed.rooms
  t.after(() => { for (const key of Object.keys(data)) delete data[key]; Object.assign(data, original); parsed.rooms = rooms })
  Object.assign(data, {
    maps: [{ id: 'local', name: 'Local', grid: { cols: 9, rows: 3 }, navigationMode: 'tactical', explorationRoomIds: ['1'] },
      { id: 'other', name: 'Other', grid: { cols: 9, rows: 3 } }],
    rooms: [
      { id: '1', name: 'Current', zone: { minX: 0, maxX: 2, minY: 0, maxY: 2 } },
      { id: '2', name: 'Neighbor', zone: { minX: 3, maxX: 5, minY: 0, maxY: 2 } },
      { id: '3', name: 'Remote', zone: { minX: 6, maxX: 8, minY: 0, maxY: 2 } },
      { id: '4', name: 'Other floor', mapId: 'other', zone: { minX: 0, maxX: 8, minY: 0, maxY: 2 } },
    ],
    entryCells: { '1': { x: 1, y: 1 }, '2': { x: 4, y: 1 }, '3': { x: 7, y: 1 }, '4': { x: 1, y: 1 } },
    doors: [{ id: 'gate', name: 'Gate', initialState: 'closed', sides: [
      { roomId: '1', cell: { x: 2, y: 1 }, direction: 'east' },
      { roomId: '2', cell: { x: 3, y: 1 }, direction: 'west' },
    ] }], partitions: [], roomHooks: {}, mapQuests: {}, mapTransitions: [],
    encounters: Object.fromEntries([
      ['here', '1', 'violet_fungus', 1], ['near', '2', 'goblin', 4],
      ['far', '3', 'hobgoblin', 7], ['floor', '4', 'dryad', 1],
    ].map(([id, roomId, monsterType, x]) => [id, { id, roomId, name: id,
      monsters: [{ monsterType, name: `CAST_${id}`, cell: { x, y: 1 } }] }])),
    npcs: [],
  })
  parsed.rooms = { '1': 'CURRENT_DETAIL', '2': 'NEAR_DETAIL', '3': 'REMOTE_DETAIL', '4': 'FLOOR_DETAIL' }
  Object.assign(state, { currentMapId: 'local', currentRoomId: '1', roomsVisited: ['1'], npcs: {}, monsters: {} })
  state.player.position = { x: 1, y: 1 }
  return { state, data }
}

function monster(id, x, isAlive = true) {
  return { id, name: `LIVE_${id}`, type: 'goblin', position: { x, y: 1 }, hp: { current: isAlive ? 7 : 0, max: 7 },
    isAlive, conditions: [], ac: 15, stats: {}, xpValue: 50, attackBonus: 4, damageDice: '1d6', speed: 30 }
}

test('exploration selects only the current zone across bestiary, state, map, narration and refreshed context', t => {
  const { state } = fixture(t)
  state.monsters = { here: monster('here', 1), near: monster('near', 4), far: monster('far', 7), dead: monster('dead', 2, false) }
  state.sceneMemory = { retainedFact: 'KEEP', floorMonsters: { other: { old: monster('OTHER_FLOOR', 1) } },
    encounterAwareness: { far: { mapId: 'local', status: 'alert', positions: [{ x: 7, y: 1 }], reason: 'REMOTE_AWARENESS' } } }
  const before = structuredClone(state)
  const context = buildLocalBestiaryContext(state)
  assert.match(context, /CAST_here/)
  assert.doesNotMatch(context, /CAST_near|CAST_far|CAST_floor|LIVE_near|LIVE_far|"hobgoblin"|"dryad"/)
  for (const text of [buildDynamicPrompt(state), renderSceneMap(state), buildLocalRoomContext(state),
    serializeGameState(state), narrationEvidence(state, state, [{ tool: 'move_token', result: {} }]).join('\n')]) {
    assert.match(text, /LIVE_here/)
    assert.doesNotMatch(text, /LIVE_near|LIVE_far|LIVE_dead|LIVE_OTHER_FLOOR|REMOTE_AWARENESS/)
  }
  assert.equal(JSON.parse(serializeGameState(state)).sceneMemory.retainedFact, 'KEEP')
  assert.deepEqual(state, before, 'prompt filtering must never change authoritative state')
})

test('tactical navigation and combat include closed-door neighbors, exclude remote rooms and other maps', t => {
  const { state, data } = fixture(t)
  const staticBefore = buildStaticSystemBlocks(state)
  for (const phase of ['exploration', 'dialogue', 'combat']) {
    state.phase = phase
    data.maps[0].explorationRoomIds = phase === 'combat' ? ['1'] : []
    const context = buildLocalBestiaryContext(state)
    assert.match(context, /CAST_here/)
    assert.match(context, /CAST_near/)
    assert.doesNotMatch(context, /CAST_far|CAST_floor/)
    assert.deepEqual([...localCreatureScope(state).roomIds], ['1', '2'])
    assert.deepEqual(buildStaticSystemBlocks(state), staticBefore, 'static system is independent of position and phase')
  }
  state.phase = 'exploration'; data.doors = []; data.partitions = [['1', '2']]
  assert.deepEqual([...localCreatureScope(state).roomIds], ['1'])
})

test('investigators are selected individually from their actual positions, including incoming groups from remote rooms', t => {
  const { state, data } = fixture(t)
  data.encounters.far.monsters.push({ monsterType: 'dryad', name: 'STILL_REMOTE', cell: { x: 8, y: 1 } })
  state.sceneMemory = { encounterAwareness: {
    far: { mapId: 'local', status: 'investigating', positions: [{ x: 1, y: 1 }, { x: 8, y: 1 }], revision: 2 },
    here: { mapId: 'local', status: 'investigating', positions: [{ x: 7, y: 1 }], revision: 2 },
  } }
  const pending = localPendingEncounters(state)
  assert.deepEqual(pending.map(encounter => encounter.encounterId), ['far'])
  assert.deepEqual(pending[0].monsters.map(monster => monster.monsterIndex), [0])
  const text = buildLocalBestiaryContext(state)
  assert.match(text, /CAST_far/)
  assert.doesNotMatch(text, /CAST_here|STILL_REMOTE|"dryad"/)
  state.encountersTriggered = ['far']
  assert.doesNotMatch(buildLocalBestiaryContext(state), /CAST_far/)
})

test('a split encounter does not leak remote members through tactical neighbor context', t => {
  const { state, data } = fixture(t)
  data.maps[0].explorationRoomIds = []
  data.encounters.near.monsters.push({ monsterType: 'dryad', name: 'HIDDEN_REMOTE_MEMBER', cell: { x: 8, y: 1 } })
  for (const text of [buildNearbyRoomContext(state), buildLocalBestiaryContext(state), buildLocalRoomContext(state)]) {
    assert.match(text, /CAST_near/)
    assert.doesNotMatch(text, /HIDDEN_REMOTE_MEMBER|"dryad"/)
  }
})

test('hidden local NPC profiles and moved companions are scoped by their current map and position', () => {
  const state = buildInitialGameState('fey-shadow-fair')
  state.currentMapId = 'fair'; state.currentRoomId = '3'; state.npcs = seedAdventureNpcs(state.adventureId)
  state.npcs.barnabe.visible = false
  assert.match(buildLocalBestiaryContext(state), /"awakened_shrub"/)
  state.currentRoomId = '1'
  assert.doesNotMatch(buildLocalBestiaryContext(state), /"awakened_shrub"/)
  state.npcs.barnabe.mapId = 'wood'; state.npcs.barnabe.roomId = '10'
  state.npcs.barnabe.position = getAdventureMap(state.adventureId).entryCells['10']
  state.currentMapId = 'wood'; state.currentRoomId = '10'
  assert.match(buildLocalBestiaryContext(state), /"awakened_shrub"/)
  state.npcs.barnabe.mapId = 'fair'
  assert.doesNotMatch(buildLocalBestiaryContext(state), /"awakened_shrub"/)
})

test('dedicated monster annexes are excluded from static indices, with room descriptions and other annexes preserved', () => {
  const parsed = parseAdventureModule('# Module\n## Bestiaire du module\nGLOBAL_ROSTER\n## Synopsis\nKEEP_INTRO\n## Salle 1\nLOCAL_DETAILS\n## Récapitulatif des monstres de la session\nOTHER_ROSTER\n## Récompenses\nKEEP_REWARD')
  assert.match(parsed.index, /KEEP_INTRO/); assert.match(parsed.index, /KEEP_REWARD/)
  assert.doesNotMatch(parsed.index, /GLOBAL_ROSTER|OTHER_ROSTER/)
  assert.match(parsed.rooms['1'], /LOCAL_DETAILS/)
})


test('local social context provides confidential personalities under the sole D&D2014 procedure without mutating state', () => {
  const state = buildInitialGameState(), before = structuredClone(state)
  const payload = buildLocalBestiaryContext(state).split('\n\n').filter(part => part.startsWith('{')).map(part => JSON.parse(part)).find(part => part.socialActors)
  assert.equal(payload.socialPolicy, 'standard2014')
  assert.ok(payload.socialActors.some(actor => actor.targetId === 'mac'))
  assert.ok(payload.socialActors.every(actor => actor.profile === undefined && actor.goals.length))
  assert.deepEqual(state, before)
})
