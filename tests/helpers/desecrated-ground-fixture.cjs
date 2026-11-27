const { ok } = require('./mcp-toolkit.cjs')

async function prepareDesecratedGround(call, options = {}) {
  const state = await call('get_game_state')
  const start = state.player.position, origin = options.origin ?? { x: start.x, y: start.y - 1 }
  const cells = options.cells ?? [origin, { x: origin.x + 1, y: origin.y }, { x: origin.x, y: origin.y + 1 },
    { x: origin.x + 1, y: origin.y + 1 }, { x: origin.x + 2, y: origin.y }]
  const surfaceId = options.surfaceId ?? 'actual-desecrated-support'
  const source = 'The MJ establishes an actual measured terrain surface with present magical desecration.'
  const fact = ok(await call('record_scene_fact', { cell: cells[0], description: source })).worldFact
  ok(await call('record_vertical_surface', { eventId: surfaceId + '-measure', surfaceId, mapId: state.currentMapId,
    roomId: state.currentRoomId, cells, kind: 'support', elevationFeet: options.elevationFeet ?? 0, actualGeometryConfirmed: true, source }))
  const classification = { zoneId: surfaceId + '-zone', surfaceId, cells, factId: fact.id, actualMagicalDesecrationConfirmed: true }
  ok(await call('record_desecrated_ground', classification))
  return { start, cells, origin, surfaceId, classification, source }
}

async function acquireHolyWater(call, cell, objectId = 'actual-holy-water-chest') {
  ok(await call('create_scene_object', {
    objectId, name: 'Coffre de provisions', description: 'La fiole réelle est dans ce coffre de provisions.',
    cell, kind: 'container', material: 'wood', size: 'small', resilience: 'resilient', contents: ['holy_water_flask'],
  }))
  const opened = ok(await call('interact_object', { objectId, action: 'open' }))
  const item = opened.releasedItems.find(value => value.equipmentId === 'holy_water_flask')
  ok(await call('pick_up_item', { itemId: item.id }))
  return item
}

const freeClericHand = async call => ok(await call('equip_item', { itemId: 'mace', operation: 'unequip', slot: 'main_hand' }))

module.exports = { prepareDesecratedGround, acquireHolyWater, freeClericHand }
