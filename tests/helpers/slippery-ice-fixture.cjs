const assert = require('node:assert/strict')
const { engine, grid, ok } = require('./mcp-toolkit.cjs')
const { inferRoomIdOnMap } = require('../../mcp-server/dist/lib/adventure-map.js')

async function prepareIce(call, { publish = true, elevationFeet = 0 } = {}) {
  const state = await call('get_game_state'), start = state.player.position, nav = grid(state)
  const candidates = [[0, -1], [1, 0], [0, 1], [-1, 0]]
  const pair = candidates.map(([dx, dy]) => [
    { x: start.x + dx, y: start.y + dy }, { x: start.x + 2 * dx, y: start.y + 2 * dy },
  ]).find(([one, two]) => nav.step(start, one) && nav.step(one, two)
    && [one, two].every(cell => inferRoomIdOnMap(cell, state.currentMapId, state) === state.currentRoomId))
  assert.ok(pair, 'The real starting room has two consecutive accessible cells on one straight line.')
  const [one, two] = pair
  const source = 'Le MJ a constaté une vraie plaque de glace glissante sur ces deux cases mesurées.'
  const fact = ok(await call('record_scene_fact', { cell: one, description: source })).worldFact
  const surfaceId = 'actual-two-cell-ice-support'
  ok(await call('record_vertical_surface', { eventId: surfaceId + '-measure', surfaceId, mapId: state.currentMapId,
    roomId: state.currentRoomId, cells: [one, two], kind: 'support', elevationFeet, actualGeometryConfirmed: true, source }))
  const qualification = { zoneId: 'actual-ice-zone', surfaceId, cells: [one, two], factId: fact.id, actualSlipperyIceConfirmed: true }
  if (publish) ok(await call('record_slippery_ice', qualification))
  return { start, one, two, qualification, approach: { combatants: ['player'],
    hazardPreparation: { kind: 'slippery_ice', hazardId: qualification.zoneId } } }
}

async function refused(call, name, input, code) {
  const before = await call('get_game_state')
  const answer = await call(name, input)
  assert.equal(answer.code, code, JSON.stringify(answer))
  assert.deepEqual(await call('get_game_state'), before)
}

async function restoreIce(t, state, dice) {
  const { saveSession, loadSession, deleteSession } = require('../../lib/session-store.ts')
  const id = `actual-ice-${process.pid}-${Math.random()}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  const call = await engine(t, { adventureId: state.adventureId, characterId: state.characterId, dice })
  ok(await call('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await call('get_game_state'), state)
  return call
}

const move = (call, toCell, tokenId = 'player') => call('move_token', { tokenId, toCell })
const resolve = (call, contactId) => call('resolve_slippery_ice_entry', { contactId })
const rollMarker = async call => ok(await call('roll_dice', { notation: '1d20' })).total
const receipt = result => result.groundGearContact ?? result
module.exports = { prepareIce, refused, restoreIce, move, resolve, rollMarker, receipt }
