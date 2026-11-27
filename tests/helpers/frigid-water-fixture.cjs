const { ok } = require('./mcp-toolkit.cjs')

async function prepareFrigidWater(call, options = {}) {
  const state = await call('get_game_state')
  const dry = state.player.position
  const water = options.water ?? { x: dry.x, y: dry.y - 1 }
  const bank = options.bank ?? { x: dry.x, y: dry.y - 2 }
  const surfaceZFeet = options.surfaceZFeet ?? 2
  const mediumId = options.mediumId ?? 'actual-frigid-pool'
  const source = 'Actual observed ice-cold water and measured access at this site.'
  const fact = ok(await call('record_scene_fact', { cell: water, description: source })).worldFact
  ok(await call('record_movement_medium', {
    eventId: mediumId + '-geometry', mediumId, mapId: state.currentMapId, roomId: state.currentRoomId,
    mode: 'swim', cells: options.cells ?? [water], bottomZFeet: -5, topZFeet: surfaceZFeet, surfaceZFeet, factId: fact.id,
    actualPhysicalMediumConfirmed: true, handsRequired: 0, difficult: false, source,
  }))
  const surfaceId = mediumId + '-bank'
  ok(await call('record_vertical_surface', {
    eventId: surfaceId + '-geometry', surfaceId, mapId: state.currentMapId, roomId: state.currentRoomId,
    cells: [bank], kind: 'support', elevationFeet: 0, actualGeometryConfirmed: true, source,
  }))
  const classification = {
    eventId: mediumId + '-cold', waterMediumId: mediumId, factId: fact.id, actualFrigidWaterConfirmed: true,
  }
  ok(await call('record_frigid_water', classification))
  const swim = (eventId, from, to, extra = {}) => call('move_by_climbing_or_swimming', {
    eventId, entityId: 'player', mediumId, path: [{ ...from, zFeet: 0 }, { ...to, zFeet: 0 }],
    actualClearanceConfirmed: true, surfaceSwimmingConfirmed: true, source, ...extra,
  })
  return {
    dry, water, bank, classification, swim,
    enter: (eventId = mediumId + '-enter') => swim(eventId, dry, water),
    leave: (eventId = mediumId + '-exit') => swim(eventId, water, bank, { landingSurfaceId: surfaceId }),
    reenter: (eventId = mediumId + '-return') => swim(eventId, bank, water),
  }
}

module.exports = { prepareFrigidWater }
