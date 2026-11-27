const assert = require('node:assert/strict')
const { engine, grid, ok } = require('./mcp-toolkit.cjs')
const { inferRoomIdOnMap } = require('../../mcp-server/dist/lib/adventure-map.js')

async function prepareRazorvine(call, { publish = true, observedBlocksSight = false, standPlayer = true, distanceCells = 1, measureRay = true } = {}) {
  const state = await call('get_game_state'), start = state.player.position, nav = grid(state)
  const local = cell => inferRoomIdOnMap(cell, state.currentMapId, state) === state.currentRoomId
  const chosen = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => {
    const face = { x: start.x + distanceCells * dx, y: start.y + distanceCells * dy }, anchor = { x: start.x + (distanceCells + 1) * dx, y: start.y + (distanceCells + 1) * dy }
    const rayCells = Array.from({ length: distanceCells + 1 }, (_, i) => ({ x: start.x + i * dx, y: start.y + i * dy }))
    if (![...rayCells, anchor].every(local) || rayCells.slice(1).some((cell, i) => !nav.step(rayCells[i], cell)) || !nav.step(face, anchor)) return undefined
    const neighbor = [-1, 1].map(side => ({ x: face.x + dy * side, y: face.y + dx * side }))
      .find(cell => local(cell) && nav.step(face, cell) && (distanceCells > 1 || nav.step(start, cell)))
    return neighbor ? { start, face, anchor, neighbor, rayCells } : undefined
  }).find(Boolean)
  assert.ok(chosen, 'The real published room has a clear 10-by-5-foot hedge and actual standing sides.')
  const { anchor, face, neighbor } = chosen
  const source = 'Une vraie haie de lames enracinée pousse sur les deux cases mesurées au même niveau.'
  const fact = ok(await call('record_scene_fact', { cell: anchor, description: source })).worldFact
  const surfaceId = 'actual-razorvine-terrain'
  ok(await call('record_vertical_surface', { eventId: 'actual-razorvine-support', surfaceId,
    mapId: state.currentMapId, roomId: state.currentRoomId, cells: [...new Map([start, face, anchor, neighbor, ...(measureRay ? chosen.rayCells : [])].map(cell => [JSON.stringify(cell), cell])).values()],
    kind: 'support', elevationFeet: 0, actualGeometryConfirmed: true, source }))
  const stand = async entityId => ok(await call('observe_standing_surface', { eventId: 'actual-razorvine-footing-' + entityId,
    entityId, surfaceId, actualCurrentSupportConfirmed: true, source }))
  if (standPlayer) await stand('player')
  const hedgeId = 'actual-rooted-razorvine'
  const qualification = { hedgeId, baseSurfaceId: surfaceId, firstCell: anchor, secondCell: face,
    factId: fact.id, actualRootedRazorvineConfirmed: true, observedBlocksSight }
  if (publish) ok(await call('record_razorvine', qualification))
  return { ...chosen, hedgeId, stand, qualification, approach: { combatants: ['player'],
    hazardPreparation: { kind: 'razorvine', hazardId: hedgeId } } }
}

function touch(f, eventId, creatureId = 'player') {
  return { eventId, hedgeId: f.hedgeId, creatureId, faceCell: f.face, actualDirectContactConfirmed: true,
    reason: 'Le MJ confirme le vrai contact de cette créature avec les épines de cette face précise.' }
}

async function refused(call, name, args, code) {
  const before = await call('get_game_state'), result = await call(name, args)
  assert.equal(result.code, code, JSON.stringify(result))
  assert.deepEqual(await call('get_game_state'), before)
}

async function restoreRazorvine(t, state, dice) {
  const { saveSession, loadSession, deleteSession } = require('../../lib/session-store.ts')
  const id = `actual-razorvine-${process.pid}-${Math.random()}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  const call = await engine(t, { adventureId: state.adventureId, characterId: state.characterId, dice })
  ok(await call('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await call('get_game_state'), state)
  return call
}
const marker = async call => ok(await call('roll_dice', { notation: '1d20' })).total
module.exports = { prepareRazorvine, touch, refused, restoreRazorvine, marker }
