const test = require('node:test')
const assert = require('node:assert/strict')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
test.after(restore)
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { discoveredMapRooms, isMapCellDiscovered } = require('../lib/map-discovery.ts')
const { roomDoorActions } = require('../lib/door-navigation.ts')
const { migrateMapLayout } = require('../lib/map-layout-migration.ts')
const { getAdventureMap } = require('../lib/adventure-map.ts')
const { explorationDestinationRooms } = require('../lib/exploration-navigation.ts')
const gs = require('../mcp-server/game-state.ts')
const { executeNavigation, planNavigation } = require('../mcp-server/navigation.ts')
const { interactDoor } = require('../mcp-server/tools/door-tools.ts')
const ID = 'sarah-of-yellowcrest-manor'
function manor() {
  const state = buildInitialGameState(ID)
  Object.assign(state, { currentMapId: 'temple', currentRoomId: '18', roomsVisited: ['17', '18'] })
  state.player.position = { x: 12, y: 3 }
  return state
}

test('bakery fog reveals outdoor ground and hides every interior until a nearby open door is visible', () => {
  const state = buildInitialGameState()
  assert.deepEqual(discoveredMapRooms(state).map(room => room.id), ['1', '2', '3'])
  assert.equal(isMapCellDiscovered(state, {x:15,y:9}), true, 'open outdoor ground stays visible between zones')
  state.sceneMemory = {doorStates:{front:'open'}}
  assert.equal(isMapCellDiscovered(state, {x:11,y:12}), false, 'a distant open door reveals no room')
  state.player.position = {x:11,y:13}
  const before = structuredClone(state)
  assert.deepEqual(discoveredMapRooms(state).map(room => room.id), ['1', '2', '3', '4'])
  assert.equal(isMapCellDiscovered(state, {x:11,y:8}), false, 'visibility never propagates through a second open door')
  assert.deepEqual(state, before, 'UI projection is read-only')
  state.player.conditions = ['blinded']
  assert.equal(isMapCellDiscovered(state, {x:11,y:12}), false)
})

test('actual approach and door opening remember sight without visiting, including after closure and hydration', t => {
  gs.resetState(); t.after(() => gs.resetState())
  let state = gs.getState()
  state.sceneMemory = {doorStates:{front:'open'}}
  const before = structuredClone(state)
  planNavigation('player', {kind:'door',doorId:'front',mode:'approach'})
  assert.deepEqual(state, before, 'route previews never save discoveries')
  executeNavigation('player', {kind:'door',doorId:'front',mode:'approach'})
  assert.ok(state.sceneMemory.discoveredRoomIds.includes('4'))
  assert.equal(state.roomsVisited.includes('4'), false)
  executeNavigation('player', {kind:'room',roomId:'8'})
  executeNavigation('player', {kind:'door',doorId:'floor-office',mode:'approach'})
  assert.equal(isMapCellDiscovered(state, {x:6,y:8}), false)
  interactDoor('floor-office', 'open')
  assert.equal(isMapCellDiscovered(state, {x:6,y:8}), true)
  assert.equal(state.roomsVisited.includes('5'), false)
  assert.ok(roomDoorActions(state).find(action => action.id === 'floor-office').label.includes('Le Bureau'))
  interactDoor('floor-office', 'close')
  state = gs.replaceState(JSON.parse(JSON.stringify(state)))
  assert.equal(isMapCellDiscovered(state, {x:6,y:8}), true, 'already seen interiors remain discovered')
  assert.equal(state.roomsVisited.includes('5'), false)
  assert.equal(state.sceneMemory.doorStates['floor-office'], 'closed')
  assert.equal(isMapCellDiscovered(state, {x:8,y:9}), false, 'closed apartment remains hidden')
})

test('shared exploration destinations respect room fog, movement state and current-map boundaries', () => {
  const state = buildInitialGameState()
  assert.deepEqual(explorationDestinationRooms(state).map(room => room.id), ['2', '3'])
  state.player.position = {x:11,y:13}; state.sceneMemory = {doorStates:{front:'open'}}
  assert.ok(explorationDestinationRooms(state).some(room => room.id === '4'))
  state.player.conditions = ['restrained']
  assert.deepEqual(explorationDestinationRooms(state, true), [])
  state.player.conditions = []; state.phase = 'combat'
  assert.deepEqual(explorationDestinationRooms(state, true), [])
  const city = buildInitialGameState(ID)
  city.currentMapId = 'greenfast'; city.currentRoomId = '11'
  assert.deepEqual(explorationDestinationRooms(city, true).map(room => room.id), ['10','11','12','13','14','15','16'])
  city.currentMapId = 'temple'; city.currentRoomId = '17'; city.player.position = {x:4,y:3}; city.roomsVisited = ['17']
  assert.deepEqual(explorationDestinationRooms(city).map(room => room.id), [], 'unseen adjacent manor room has no location button')
})

test('room fog reveals only exact visited footprints on the current floor, including after resume', () => {
  const state = manor()
  state.roomsVisited.push('20', '30')
  for (const current of [state, JSON.parse(JSON.stringify(state))]) {
    assert.deepEqual(discoveredMapRooms(current).map(r => r.id), ['17', '18', '20'])
    assert.equal(isMapCellDiscovered(current, { x: 38, y: 22 }), true, 'L-shaped gallery is discovered')
    assert.equal(isMapCellDiscovered(current, { x: 30, y: 20 }), false, 'gallery bounding box must not reveal chapel')
    assert.equal(isMapCellDiscovered(current, { x: 5, y: 22 }), false, 'unassigned void stays masked')
    current.currentMapId = 'cellar'; current.currentRoomId = '27'; current.player.position = { x: 38, y: 2 }
    assert.deepEqual(discoveredMapRooms(current).map(r => r.id), ['27', '30'])
    assert.equal(isMapCellDiscovered(current, { x: 11, y: 10 }), false, 'other cells remain unknown')
  }
})

test('opening preview is local, hides unknown room names and requests crossing without opening a door', () => {
  const state = manor()
  let actions = roomDoorActions(state)
  assert.equal(actions.length, 4)
  assert.ok(actions.every(a => !a.reachable))
  assert.ok(actions.every(a => /Approcher/.test(a.label)))
  assert.doesNotMatch(actions.map(a => a.label).join(' '), /arcanique|registres|descente/)
  state.player.position = { x: 10, y: 7 }
  const atDoor = roomDoorActions(state).find(a => a.id === 'arcane_study')
  assert.equal(atDoor.reachable, true)
  assert.match(atDoor.message, /traverser le passage vide/)
  assert.match(atDoor.label, /Passage 2/)
  assert.doesNotMatch(atDoor.message, /ouvrir|forcer/)
  assert.equal(state.roomsVisited.includes('19'), false, 'preview/open request never discovers the other room')
  state.sceneMemory.doorStates = { arcane_study: 'closed' }
  assert.doesNotMatch(roomDoorActions(state).find(a => a.id === 'arcane_study').message, /ouvrir puis/)
  state.phase = 'combat'; state.currentTurn = 'enemy'
  assert.deepEqual(roomDoorActions(state), [])
})

test('fog can be enabled on another campaign using map data only; nonrectangular areas do not leak', t => {
  const state = buildInitialGameState('tide-crypt')
  const map = getAdventureMap(state.adventureId).maps[0]
  const previous = map.fogOfWar
  t.after(() => { map.fogOfWar = previous })
  assert.equal(isMapCellDiscovered(state, { x: 100, y: 100 }), true, 'default is unchanged')
  map.fogOfWar = true
  assert.equal(isMapCellDiscovered(state, { x: 100, y: 100 }), false)
  assert.equal(isMapCellDiscovered(state, state.player.position), true)
  assert.equal(discoveredMapRooms(state).length, 1)
})

test('both cell grilles keep their closed state while the other manor passages stay empty', () => {
  const state = manor()
  state.currentMapId = 'cellar'; state.currentRoomId = '27'; state.player.position = { x: 11, y: 6 }
  const data = getAdventureMap(ID)
  for (const id of ['north_cell', 'south_cell']) {
    const gate = data.doors.find(d => d.id === id)
    assert.equal(gate.opening, undefined)
    assert.equal(gate.initialState, 'closed')
  }
  const actions = roomDoorActions(state)
  assert.match(actions.find(a => a.id === 'north_cell').label, /Ouvrir et traverser/)
  assert.match(actions.find(a => a.id === 'ossuary').label, /Passage/)
  state.sceneMemory.doorStates = { north_cell: 'open' }
  assert.doesNotMatch(roomDoorActions(state).find(a => a.id === 'north_cell').message, /ouvrir puis/)
})

test('old floor saves migrate once, preserving discovery, combat, inventory, NPCs and dropped objects', () => {
  const old = manor()
  delete old.sceneMemory
  old.player.position = { x: 19, y: 29 }; old.currentRoomId = '30'
  old.roomsVisited.push('27', '30')
  old.npcs.yaeda.mapId = 'temple'; old.npcs.yaeda.position.y = 33
  old.npcs.yaeda.disposition = 'helpful'; old.npcs.yaeda.visible = true
  old.droppedItems.test = { item: { id: 'test', name: 'Lettre', type: 'misc' }, mapId: 'temple', roomId: '30', position: { x: 20, y: 30 } }
  const migrated = migrateMapLayout(old)
  assert.equal(old.currentMapId, 'temple', 'input snapshot is immutable')
  assert.equal(migrated.currentMapId, 'cellar')
  assert.equal(migrated.currentRoomId, '30')
  assert.deepEqual(migrated.player.position, { x: 19, y: 9 })
  assert.equal(migrated.npcs.yaeda.position.y, 13)
  assert.equal(migrated.npcs.yaeda.disposition, 'helpful')
  assert.equal(migrated.droppedItems.test.mapId, 'cellar')
  assert.equal(migrated.droppedItems.test.position.y, 10)
  assert.deepEqual(migrated.roomsVisited, old.roomsVisited)
  assert.deepEqual(migrated.player.inventory, old.player.inventory)
  assert.deepEqual(migrateMapLayout(migrated), migrated)
  assert.deepEqual(migrateMapLayout(buildInitialGameState(ID)), buildInitialGameState(ID))
})
