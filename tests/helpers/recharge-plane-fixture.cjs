const { ok } = require('./mcp-toolkit.cjs')

async function approachManorStairs(call, { beforeTower } = {}) {
  const choose = async (name, input) => ok(await call(name, input))
  const help = npcId => choose('reveal_npc', { npcId, disposition: 'helpful' })
  const move = roomId => choose('move_token', { tokenId: 'player', roomId })
  const travel = transitionId => choose('travel_to_map', { transitionId })
  await help('sarah')
  await choose('pick_up_item', { itemId: 'sarah_diary_copy' })
  await move('3'); await travel('sail_to_waterdeep')
  await move('7'); await help('cobbler')
  await choose('reveal_clue', { clueId: 'greenfast_lead', npcId: 'cobbler' })
  await move('6')
  await choose('move_token', { tokenId: 'player', doorId: 'vecken_home', doorMode: 'approach' })
  await choose('interact_door', { doorId: 'vecken_home', action: 'open' })
  await move('6'); await help('vecken')
  await move('9'); await travel('road_to_greenfast')
  await move('11'); await help('kara')
  await move('12'); await help('old_fargo')
  if (beforeTower) await beforeTower()
  await move('16'); await travel('walk_to_tower')
  await move('18'); await move('20')
  await choose('move_token', { tokenId: 'player', toCell: { x: 38, y: 22 } })
}

async function prepareRechargePlaneMap(call, originMapId = 'temple') {
  const state = await call('get_game_state')
  const fact = ok(await call('record_scene_fact', { cell: state.player.position,
    description: 'Le MJ qualifie explicitement cette carte et la carte d’origine comme deux lieux du même plan sans aube.' })).worldFact
  return { input: { eventId: 'same-plane-binding', originMapId, mapId: state.currentMapId,
    planeId: 'actual-dawnless-plane', planeName: 'Plan sans aube qualifié', factId: fact.id,
    actualSameDawnlessPlaneConfirmed: true }, fact }
}
module.exports = { approachManorStairs, prepareRechargePlaneMap }
