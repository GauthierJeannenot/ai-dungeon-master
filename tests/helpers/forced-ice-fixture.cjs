const assert = require('node:assert/strict')
const { engine, ok, grid, adjacent } = require('./mcp-toolkit.cjs')
const { inferRoomIdOnMap } = require('../../mcp-server/dist/lib/adventure-map.js')

/** Actual bodies, map cells, terrain and source facts only; no state injection. */
async function prepareForcedIce(call, { bothCells = false, includePush = false, caltrops = false, persistentTarget = false, id = 'actual-forced-ice' } = {}) {
  const state = await call('get_game_state'), origin = state.player.position, nav = grid(state)
  const layout = adjacent(state).flatMap(targetCell => nav.neighbors(targetCell).map(toCell => ({ targetCell, toCell,
    pushCell: { x: targetCell.x + Math.sign(targetCell.x - origin.x), y: targetCell.y + Math.sign(targetCell.y - origin.y) } })))
    .find(({ targetCell, toCell, pushCell }) => Math.abs(targetCell.x - toCell.x) + Math.abs(targetCell.y - toCell.y) === 1
      && Math.max(Math.abs(toCell.x - origin.x), Math.abs(toCell.y - origin.y)) === 1
      && nav.step(targetCell, toCell) && nav.step(origin, toCell)
      && [toCell, ...(includePush ? [pushCell] : [])].every(cell => nav.free(cell)
        && inferRoomIdOnMap(cell, state.currentMapId, state) === state.currentRoomId)
      && (!includePush || nav.step(targetCell, pushCell)))
  assert.ok(layout, 'The actual room must represent this cardinal five-foot side destination and optional away cell.')
  const target = persistentTarget
    ? ok(await call('create_npc', { npcId: id + '-target', name: 'Adversaire persistant', statBlock: 'bandit',
      cell: layout.targetCell, disposition: 'hostile', visible: true,
      description: 'Ce vrai PNJ conserve son corps et sa position lorsque les protagonistes suspendent leur rencontre.' })).npc
    : ok(await call('spawn_monster', { monsterType: 'bandit', cell: layout.targetCell }))
  const cells = [layout.toCell, ...(bothCells ? [layout.targetCell] : []), ...(includePush ? [layout.pushCell] : [])]
  const source = 'Le MJ constate ce vrai sol horizontal et sec portant une glace glissante sur les cases mesurées, sans inventer un déplacement.'
  const fact = ok(await call('record_scene_fact', { cell: layout.toCell, description: source })).worldFact
  const surfaceId = id + '-support'
  ok(await call('record_vertical_surface', { eventId: id + '-measure', surfaceId, mapId: state.currentMapId,
    roomId: state.currentRoomId, cells, kind: 'support', elevationFeet: 0, actualGeometryConfirmed: true, source }))
  ok(await call('record_slippery_ice', { zoneId: id + '-zone', surfaceId, cells, factId: fact.id, actualSlipperyIceConfirmed: true }))
  if (caltrops) {
    // A real authored canonical bag is released, picked up and placed once.
    for (const weapon of (await call('get_game_state')).player.inventory.filter(item => item.type === 'weapon'))
      ok(await call('drop_item', { itemId: weapon.id }))
    const cache = id + '-gear-cache', itemId = cache + ':content:0'
    ok(await call('create_scene_object', { objectId: cache, name: 'Réserve réelle', description: 'Ce coffre contient un vrai sac de chausse-trappes préparé par le MJ.',
      cell: origin, kind: 'container', material: 'wood', size: 'small', resilience: 'resilient', contents: ['caltrops'] }))
    ok(await call('interact_object', { objectId: cache, action: 'open' }))
    assert.equal((await call('get_game_state')).droppedItems[itemId].item.equipmentId, 'caltrops')
    ok(await call('pick_up_item', { itemId }))
    ok(await call('place_ground_gear', { placementId: id + '-real-caltrops', itemId, originCell: layout.toCell,
      surfaceZFeet: 0, surfaceFactId: fact.id, supportSurfaceId: surfaceId }))
  }
  return { call, target, ...layout, cells, fact, surfaceId,
    input: { action: 'shove', shove: 'aside', targetId: target.id, defenseSkill: 'athletics', toCell: layout.toCell },
    enter: () => call('enter_combat', { combatants: ['player', target.id], tieOrder: ['player', target.id] }) }
}
async function setupForcedIce(t, { dice = '20,1,20,19,1,1,17', characterId = 'fighter', beforeCombat, ...options } = {}) {
  const call = await engine(t, { characterId, dice }), f = await prepareForcedIce(call, options)
  if (beforeCombat) await beforeCombat(f)
  ok(await f.enter())
  return f
}
const resolveIce = (call, contactId) => call('resolve_slippery_ice_entry', { contactId })
module.exports = { prepareForcedIce, setupForcedIce, resolveIce }
