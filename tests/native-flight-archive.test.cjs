const test = require('node:test')
const assert = require('node:assert/strict')

Object.assign(process.env, {
  MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  APP_LOG_LEVEL: 'error', APP_LOG_PERSIST_ENABLED: 'false',
})
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, spawn } = require('./helpers/mcp-toolkit.cjs')
const { navigationGrid } = require('../mcp-server/dist/lib/navigation.js')
const { getMapSpec, inferRoomIdOnMap } = require('../mcp-server/dist/lib/adventure-map.js')
const { actualNativeFlightLocation } = require('../mcp-server/dist/lib/native-flight-state.js')
const { validateNativeFlightState, nativeFlightTransitionIssue } = require('../mcp-server/dist/lib/native-flight-geometry.js')

test.after(() => pg.restore())

const source = 'Actual fixture measurement of this native body and standing floor; the selected vertical air route has established whole-body clearance.'

test('completed native flight survives real landing, walking, map archive and SQL/process restoration', async t => {
  const call = await engine(t, { adventureId: 'sarah-of-yellowcrest-manor', characterId: 'fighter', dice: '19' })
  const initial = await call('get_game_state')
  const wyvern = await spawn(call, 'wyvern')
  const state = await call('get_game_state')
  const roomId = inferRoomIdOnMap(wyvern.position, state.currentMapId, state)
  const fact = ok(await call('record_scene_fact', { description: source, cell: wyvern.position })).worldFact
  ok(await call('record_vertical_surface', {
    eventId: 'archive-real-floor', surfaceId: 'archive-floor', mapId: state.currentMapId, roomId,
    cells: [wyvern.position], kind: 'support', elevationFeet: 0, actualGeometryConfirmed: true, source,
  }))
  ok(await call('record_physical_body', {
    eventId: 'archive-real-body', entityId: wyvern.id, heightFeet: 8,
    actualMeasuredBodyConfirmed: true, source,
  }))
  ok(await call('observe_standing_surface', {
    eventId: 'archive-standing', entityId: wyvern.id, surfaceId: 'archive-floor',
    actualCurrentSupportConfirmed: true, source,
  }))
  const flightId = 'completed-before-archive'
  ok(await call('fly_native_path', {
    eventId: flightId, entityId: wyvern.id,
    path: [0, 5, 0].map(zFeet => ({ ...wyvern.position, zFeet })),
    takeoffSurfaceId: 'archive-floor', landingSurfaceId: 'archive-floor',
    factId: fact.id, actualWholeBodyClearanceConfirmed: true, source,
  }))
  const landed = await call('get_game_state')
  assert.equal(landed.phase, 'exploration')
  assert.equal(landed.dmTools.nativeFlight.moves[flightId].status, 'completed')
  assert.equal(actualNativeFlightLocation(landed, wyvern.id).airborne, false)

  // A real source walk changes the actual body position. The completed flight
  // remains history and must not force its final point onto the moving body.
  const grid = navigationGrid(landed, wyvern.id, getMapSpec(landed.currentMapId, landed).geometry)
  const destination = grid.neighbors(wyvern.position).find(cell => grid.step(wyvern.position, cell)
    && inferRoomIdOnMap(cell, landed.currentMapId, landed) === roomId)
  assert.ok(destination, 'the fixture needs an actual free same-room walking destination')
  ok(await call('move_token', { tokenId: wyvern.id, toCell: destination }))
  const walked = await call('get_game_state')
  assert.notDeepEqual(walked.monsters[wyvern.id].position, wyvern.position)
  assert.equal(actualNativeFlightLocation(walked, wyvern.id), undefined)
  assert.deepEqual(validateNativeFlightState(walked), [])
  assert.equal(nativeFlightTransitionIssue(walked), null)
  const history = structuredClone(walked.dmTools.nativeFlight)

  // Install and use real reciprocal passages. No phase, map or actor field is
  // edited to manufacture the archive or bypass a transition requirement.
  const layout = ok(await call('generate_dungeon', {
    seed: 'native-flight-completed-sql', width: 3, height: 3, count: 5,
  })).layout
  const installed = ok(await call('install_dungeon', {
    dungeonId: 'native-flight-archive-passage', layout, entranceCell: initial.player.position,
    questLink: {
      goal: 'Poursuivre la quete deja etablie.',
      lead: 'Une piste concrete retourne au temoin deja recherche.',
      delivery: 'clue', discoveryDc: 10,
    },
  }))
  ok(await call('travel_to_map', { transitionId: installed.entryTransitionId }))
  const archived = await call('get_game_state')
  assert.equal(archived.currentMapId, installed.mapId)
  assert.equal(archived.monsters[wyvern.id], undefined)
  assert.deepEqual(archived.sceneMemory.floorMonsters[initial.currentMapId][wyvern.id].position, destination)
  assert.deepEqual(archived.dmTools.nativeFlight, history)
  assert.deepEqual(validateNativeFlightState(archived), [])

  const id = `native-flight-archive-${process.pid}-${Date.now()}`
  t.after(() => deleteSession(id))
  await saveSession(id, {
    gameState: archived, history: [], adventureId: archived.adventureId, characterId: archived.characterId,
  })
  const loaded = (await loadSession(id)).gameState
  assert.deepEqual(loaded, archived)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  await call.client.close()

  // A fresh process receives only the actual SQL snapshot, including its
  // installed map and archived source. No second flight or actor is created.
  const restarted = await engine(t, {
    adventureId: archived.adventureId, characterId: archived.characterId, dice: '19',
  })
  ok(await restarted('replace_game_state', { gameState: loaded }))
  const hydrated = await restarted('get_game_state')
  assert.equal(hydrated.monsters[wyvern.id], undefined)
  assert.equal(actualNativeFlightLocation(hydrated, wyvern.id), undefined)
  assert.deepEqual(hydrated.dmTools.nativeFlight, history)
  assert.deepEqual(validateNativeFlightState(hydrated), [])

  ok(await restarted('travel_to_map', { transitionId: installed.exitTransitionId }))
  const returned = await restarted('get_game_state')
  assert.equal(returned.currentMapId, initial.currentMapId)
  assert.deepEqual(returned.monsters[wyvern.id].position, destination)
  assert.deepEqual(returned.dmTools.nativeFlight, history)
  assert.deepEqual(validateNativeFlightState(returned), [])
  assert.equal(ok(await restarted('roll_dice', { notation: '1d20' })).total, 19)
})
