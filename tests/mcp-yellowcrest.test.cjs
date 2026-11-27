const test = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
const { getAdventureMap, inferRoomIdOnMap } = require('../mcp-server/dist/lib/adventure-map.js')
const { findNavigationPath, navigationGrid, explorationMovementRooms } = require('../mcp-server/dist/lib/navigation.js')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
test.after(restore)
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { loadContextFiles, parseAdventureModule } = require('../lib/context-loader.ts')
const ID = 'sarah-of-yellowcrest-manor'
const map = getAdventureMap(ID)

async function engine(t) {
  const client = new Client({ name: 'yellowcrest-playthrough', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, ADVENTURE_ID: ID, CHARACTER_ID: 'fighter' } }))
  t.after(() => client.close())
  return async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args })
    return JSON.parse(response.content.find(c => c.type === 'text').text)
  }
}
const ok = result => { assert.ok(!result.error, JSON.stringify(result)); return result }
const move = async (call, roomId) => ok(await call('move_token', { tokenId: 'player', roomId }))
const helpful = async (call, npcId) => ok(await call('reveal_npc', { npcId, disposition: 'helpful' }))
async function open(call, doorId) {
  ok(await call('move_token', { tokenId: 'player', doorId, doorMode: 'approach' }))
  return ok(await call('interact_door', { doorId, action: 'open' }))
}
async function enter(call, doorId, roomId) { await move(call, roomId); await open(call, doorId); await move(call, roomId) }
async function travel(call, transitionId) { return ok(await call('travel_to_map', { transitionId })) }
async function toWaterdeep(call) {
  await helpful(call, 'sarah')
  ok(await call('pick_up_item', { itemId: 'sarah_diary_copy' }))
  await move(call, '3'); await travel(call, 'sail_to_waterdeep')
}
async function toTemple(call) {
  await toWaterdeep(call)
  await move(call, '7'); await helpful(call, 'cobbler')
  ok(await call('reveal_clue', { clueId: 'greenfast_lead', npcId: 'cobbler' }))
  await enter(call, 'vecken_home', '6'); await helpful(call, 'vecken')
  await move(call, '9'); await travel(call, 'road_to_greenfast')
  await move(call, '11'); await helpful(call, 'kara')
  await move(call, '12'); await helpful(call, 'old_fargo')
  await move(call, '16'); await travel(call, 'walk_to_tower')
}

test('barn encounter uses clear placements, survives hydration and rejects cart spawns atomically', async t => {
  const call = await engine(t)
  const state = buildInitialGameState(ID,'fighter')
  state.currentMapId='greenfast';state.currentRoomId='15';state.player.position={x:15,y:14};state.roomsVisited.push('15')
  ok(await call('replace_game_state',{gameState:state}))
  const before = await call('get_game_state')
  const refused = await call('start_encounter',{monsters:[{monsterType:'cultist',cell:{x:18,y:14}}]})
  assert.equal(refused.code,'DESTINATION_BLOCKED')
  assert.deepEqual(await call('get_game_state'),before)
  const encounter = ok(await call('start_encounter',{encounterId:'barn_watch'}))
  assert.equal(encounter.spawnedMonsters.length,2)
  let active = await call('get_game_state')
  assert.equal(active.phase,'combat');assert.equal(active.currentMapId,'greenfast');assert.equal(active.currentRoomId,'15')
  assert.deepEqual(active.player.position,{x:15,y:14})
  const grid = navigationGrid(active,'player')
  assert.ok(encounter.spawnedMonsters.every(m=>grid.free(m.position,false)))
  assert.equal(grid.free({x:13,y:16},false),false,'occupied animal stalls block movement')
  ok(await call('replace_game_state',{gameState:active}))
  assert.deepEqual(await call('get_game_state'),active,'combat board state is retained on resume')
})

test('exploration overviews allow noncontiguous destinations in one request while doors and tactical maps still apply', async t => {
  const call = await engine(t)
  await toWaterdeep(call)
  await move(call, '7')
  let state = await call('get_game_state')
  assert.ok(explorationMovementRooms(state).some(room => room.id === '6'), 'distant city address is selectable')
  const stopped = await move(call, '6')
  assert.equal(stopped.goalReached, false)
  assert.equal(stopped.stopReason, 'closed_door', 'choosing a distant address does not open its door')
  await open(call, 'vecken_home')
  await move(call, '7')
  assert.equal((await move(call, '6')).goalReached, true, 'one city request includes the route through the streets')
  await move(call, '7'); await helpful(call, 'cobbler')
  ok(await call('reveal_clue', { clueId: 'greenfast_lead', npcId: 'cobbler' }))
  await move(call, '9'); await travel(call, 'road_to_greenfast')
  await move(call, '11')
  state = await call('get_game_state')
  assert.deepEqual(explorationMovementRooms(state).map(room => room.id), ['10', '12', '13', '14', '15', '16'])
  const preview = ok(await call('preview_navigation', { tokenId: 'player', roomId: '16' }))
  assert.equal((await call('get_game_state')).currentRoomId, '11', 'preview never moves the player')
  const moved = await move(call, '16')
  assert.equal(moved.goalReached, true)
  assert.deepEqual(moved.path, preview.path)
  assert.equal((await call('get_game_state')).currentRoomId, '16', 'no intermediate player request required')
  assert.equal((await call('move_token', { tokenId: 'player', roomId: '17' })).code, 'ROOM_NOT_ON_MAP')
  state.currentMapId = 'temple'; state.currentRoomId = '17'; state.player.position = map.entryCells['17']
  assert.deepEqual(explorationMovementRooms(state).map(room => room.id), ['18'], 'manor retains its local tactical connections')
  state.currentMapId = 'greenfast'; state.currentRoomId = '11'; state.player.position = map.entryCells['11']
  state.phase = 'combat'
  assert.deepEqual(explorationMovementRooms(state), [], 'overview selection never applies during combat')
})

test('Greenfast needs the revealed residence, not meeting or befriending the cobbler; a wary witness suffices', async t => {
  const call = await engine(t)
  await toWaterdeep(call)
  const clue = { clueId: 'greenfast_lead', npcId: 'cobbler' }
  assert.equal((await call('reveal_clue', clue)).code, 'CLUE_WITNESS_UNAVAILABLE')
  await move(call, '7')
  assert.equal((await call('reveal_clue', clue)).code, 'CLUE_WITNESS_UNAVAILABLE', 'hidden witness cannot reveal information')
  await helpful(call, 'cobbler')
  assert.equal((await call('travel_to_map', { transitionId: 'road_to_greenfast' })).code, 'MAP_QUEST_INCOMPLETE', 'helpful alone does not establish the lead')
  ok(await call('record_scene_fact', { description: 'Le héros suppose que Viallis habite à Greenfast.', cell: { x: 8, y: 14 } }))
  assert.equal((await call('travel_to_map', { transitionId: 'road_to_greenfast' })).code, 'MAP_QUEST_INCOMPLETE', 'free narrative text does not reveal an authored clue')
  ok(await call('reveal_npc', { npcId: 'cobbler', disposition: 'wary' }))
  const revealed = ok(await call('reveal_clue', clue))
  assert.equal(revealed.worldFact.clueId, 'greenfast_lead')
  assert.equal((await call('reveal_clue', { ...clue, clueId: 'unknown' })).code, 'CLUE_SOURCE_INVALID')
  assert.equal((await call('reveal_clue', { ...clue, npcId: 'arnulf' })).code, 'CLUE_SOURCE_INVALID')
  ok(await call('reveal_clue', clue))
  const before = await call('get_game_state')
  assert.equal(before.npcs.cobbler.disposition, 'wary')
  assert.equal(before.worldFacts.filter(fact => fact.clueId === clue.clueId).length, 1, 'reveal is idempotent')
  const hydrated = ok(await call('replace_game_state', { gameState: before }))
  assert.deepEqual(hydrated.worldFacts, before.worldFacts, 'clue survives schema validation and hydration')
  await move(call, '9')
  const trip = await travel(call, 'road_to_greenfast')
  assert.ok(trip.outcome.objectivesDone.includes('greenfast_lead'))
  const after = await call('get_game_state')
  assert.equal(after.currentMapId, 'greenfast')
  assert.equal(after.npcs.cobbler.disposition, 'wary')
  assert.ok(after.worldFacts.some(fact => fact.clueId === clue.clueId), 'durable clue survives travel')
})

test('Faerl can reveal Greenfast without ever meeting the cobbler', async t => {
  const call = await engine(t)
  await toWaterdeep(call)
  await move(call, '8')
  ok(await call('reveal_npc', { npcId: 'faerl_city', disposition: 'hostile' }))
  ok(await call('reveal_clue', { clueId: 'greenfast_lead', npcId: 'faerl_city' }))
  await move(call, '9')
  await travel(call, 'road_to_greenfast')
  const state = await call('get_game_state')
  assert.equal(state.currentMapId, 'greenfast')
  assert.equal(state.npcs.cobbler.visible, false)
  assert.equal(state.roomsVisited.includes('7'), false)
})

test('all five acts load their own context; every room and threshold is reachable without walking through walls', () => {
  const files = loadContextFiles(ID, 'wizard'), parsed = parseAdventureModule(files.adventureModule)
  assert.equal(Object.keys(parsed.rooms).length, 35)
  assert.deepEqual(Object.keys(parsed.mapIntros), map.maps.map(m => m.id))
  assert.match(files.playerRules, /journal original appartient à Candlekeep/)
  assert.match(files.bestiary, /Lord Viallis/)
  const state = buildInitialGameState(ID)
  state.sceneMemory = { doorStates: Object.fromEntries(map.doors.map(d => [d.id, 'open'])) }
  for (const spec of map.maps) {
    state.currentMapId = spec.id
    const first = map.rooms.find(r => r.mapId === spec.id)
    state.player.position = { ...map.entryCells[first.id] }; state.currentRoomId = first.id
    for (const room of map.rooms.filter(r => r.mapId === spec.id)) {
      const route = findNavigationPath(state, 'player', { kind: 'room', roomId: room.id })
      assert.deepEqual(route.at(-1), map.entryCells[room.id])
      assert.ok(route.every(cell => inferRoomIdOnMap(cell, spec.id, ID)), 'no path through unassigned rock')
    }
    for (const door of map.doors.filter(d => map.rooms.find(r => r.id === d.sides[0].roomId).mapId === spec.id)) {
      const grid = navigationGrid(state, 'player')
      assert.ok(grid.step(door.sides[0].cell, door.sides[1].cell, false, false), `${door.id} not traversable`)
    }
  }
  state.currentMapId = 'temple'
  const grid = navigationGrid(state, 'player')
  assert.equal(grid.step({ x: 15, y: 15 }, { x: 15, y: 14 }, false, false), true)
  assert.equal(grid.step({ x: 15, y: 14 }, { x: 15, y: 13 }, false, false), false, 'B6 cannot cross into B4 through an undeclared wall')
  assert.equal(grid.step({ x: 9, y: 11 }, { x: 10, y: 11 }, false, false), false, 'B2 cannot cut into B4')
})

test('authored objects seed identically in client and engine, stay out of reach on other maps, and never respawn on hydration', async t => {
  const call = await engine(t), initial = await call('get_game_state')
  assert.deepEqual(initial.droppedItems, buildInitialGameState(ID).droppedItems)
  assert.equal(initial.player.level, 7)
  assert.equal(initial.npcs.sarah.visible, false, 'the ghost appears only after the agent reveals her')
  assert.equal((await call('travel_to_map', { toMapId: 'waterdeep' })).code, 'MAP_QUEST_INCOMPLETE')
  assert.equal((await call('pick_up_item', { itemId: 'yellowcrest_urn' })).code, 'ITEM_OUT_OF_REACH')
  ok(await call('pick_up_item', { itemId: 'sarah_diary_copy' }))
  const collected = await call('get_game_state')
  assert.equal(collected.player.inventory.filter(i => i.id === 'sarah_diary_copy').length, 1)
  assert.equal(collected.droppedItems.sarah_diary_copy, undefined)
  ok(await call('replace_game_state', { gameState: collected }))
  assert.equal((await call('pick_up_item', { itemId: 'sarah_diary_copy' })).code, 'ITEM_NOT_DROPPED')
  const after = await call('get_game_state')
  assert.deepEqual(after.droppedItems, collected.droppedItems)
  assert.equal(after.player.inventory.filter(i => i.id === 'sarah_diary_copy').length, 1)
  assert.equal((await call('travel_to_map', { toMapId: 'waterdeep' })).code, 'MAP_QUEST_INCOMPLETE', 'taking the copy does not invent Sarah consent')
})

test('campaign can reach its last rest through actual travel, reversible dungeon paths, inventory and rescued companions', async t => {
  const call = await engine(t)
  await toTemple(call)
  const arrival = await call('get_game_state')
  assert.equal(arrival.currentMapId, 'temple')
  assert.equal(arrival.npcs.sarah.mapId, 'candlekeep', 'Sarah stays with the original diary')
  assert.equal(arrival.npcs.vecken.mapId, 'waterdeep', 'city Vecken is not a transferred second companion')
  assert.ok(arrival.mapOutcomes.waterdeep.objectivesDone.includes('vecken_warned'))
  assert.equal((await call('travel_to_map', { toMapId: 'rest' })).code, 'MAP_QUEST_INCOMPLETE')
  await move(call, '18')
  await move(call, '20')
  assert.equal((await call('travel_to_map', { transitionId: 'descend_manor' })).code, 'PASSAGE_OUT_OF_REACH')
  ok(await call('move_token', { tokenId: 'player', toCell: { x: 38, y: 22 } }))
  const beforeStairs = await call('get_game_state')
  await travel(call, 'descend_manor')
  const basement = await call('get_game_state')
  assert.equal(basement.currentMapId, 'cellar')
  assert.deepEqual(basement.mapOutcomes, beforeStairs.mapOutcomes)
  assert.deepEqual(basement.player.hp, beforeStairs.player.hp)
  assert.ok(beforeStairs.hero.movementTrail.length > 0, 'the real approach belongs to the departing map')
  assert.equal(beforeStairs.dmTools.jumping.footwork.mapId, 'temple')
  assert.deepEqual(basement.hero, { ...beforeStairs.hero, movementTrail: [] })
  assert.equal(basement.dmTools.jumping.footwork, undefined, 'stairs cannot carry a running start onto another map')
  assert.equal(basement.worldTimeSeconds, beforeStairs.worldTimeSeconds)
  await move(call, '27')
  assert.equal((await call('reveal_npc', { npcId: 'yaeda', disposition: 'helpful' })).code, 'NPC_NOT_FOUND')
  const stopped = await move(call, '30')
  assert.equal(stopped.stopReason, 'closed_door')
  assert.equal(stopped.currentRoomId, '27')
  await enter(call, 'south_cell', '30')
  await helpful(call, 'yaeda'); await helpful(call, 'vecken_rescued')
  for(const npcId of ['yaeda','vecken_rescued']){
    const s=await call('get_game_state'),g=navigationGrid(s,'player'),n=s.npcs[npcId],cell=g.neighbors(n.position).find(c=>g.free(c));assert.ok(cell)
    ok(await call('move_token',{tokenId:'player',toCell:cell}))
    const fact=ok(await call('record_scene_fact',{cell:n.position,description:'Le MJ constate ici l’accord volontaire de ce vrai captif pour une escorte civile.'})).worldFact
    ok(await call('declare_npc_party_role',{eventId:'chapter-party-'+npcId,npcId,role:'civilian',releaseDoorId:'south_cell',agreementFactId:fact.id,actualAgreementConfirmed:true}))
  }
  await move(call, '27'); await move(call, '31')
  // Talking the novice out of the cult is a valid noncombat route.
  await helpful(call, 'young_fargo')
  {
    const s=await call('get_game_state'),g=navigationGrid(s,'player'),n=s.npcs.young_fargo,cell=g.neighbors(n.position).find(c=>g.free(c));assert.ok(cell)
    ok(await call('move_token',{tokenId:'player',toCell:cell}))
    const fact=ok(await call('record_scene_fact',{cell:n.position,description:'Le novice réel renonce au culte et accepte explicitement cette escorte civile.'})).worldFact
    ok(await call('declare_npc_party_role',{eventId:'chapter-party-young_fargo',npcId:'young_fargo',role:'civilian',agreementFactId:fact.id,actualAgreementConfirmed:true}))
  }
  await move(call, '27')
  ok(await call('move_token', { tokenId: 'player', toCell: { x: 38, y: 2 } }))
  const savedBasement = await call('get_game_state')
  ok(await call('replace_game_state', { gameState: savedBasement }))
  const partyIds=['yaeda','vecken_rescued','young_fargo'],departureCells=[{x:39,y:2},{x:38,y:1},{x:39,y:1}],arrivalCells=[{x:39,y:22},{x:38,y:21},{x:39,y:21}]
  for(const[i,npcId]of partyIds.entries())ok(await call('move_party_npc',{eventId:'real-cellar-stair-'+npcId,npcId,toCell:departureCells[i]}))
  ok(await call('travel_to_map',{transitionId:'ascend_manor',partyCompanions:partyIds.map((npcId,i)=>({npcId,arrivalCell:arrivalCells[i]}))}))
  // Clear the narrow landing by chosen NPC movement before the hero follows.
  const safeCells=[{x:3,y:3},{x:4,y:2},{x:5,y:3}]
  for(const i of [1,2,0])ok(await call('move_party_npc',{eventId:'real-stair-vestibule-'+partyIds[i],npcId:partyIds[i],toCell:safeCells[i]}))
  await move(call,'17')
  for(const npcId of partyIds){const n=(await call('get_game_state')).npcs[npcId],fact=ok(await call('record_scene_fact',{cell:n.position,description:'Le MJ constate ce vrai compagnon arrivé après le trajet dans le vestibule sûr avec le héros.'})).worldFact;ok(await call('attest_party_arrival',{eventId:'real-safe-arrival-'+npcId,npcId,safetyFactId:fact.id,actualSafetyConfirmed:true}))}
  assert.equal((await call('get_game_state')).roomsVisited.includes('30'), true, 'discovery survives floor travel and hydration')
  await move(call, '20'); await move(call, '18')
  assert.equal((await call('get_game_state')).currentMapId, 'temple', 'floor changes do not consume an act')
  await enter(call, 'arcane_study', '19')
  ok(await call('move_token', { tokenId: 'player', toCell: { x: 3, y: 9 } }))
  ok(await call('pick_up_item', { itemId: 'retribution_tome' }))
  await enter(call, 'study_workshop', '22'); await move(call, '21'); await move(call, '24')
  ok(await call('start_encounter', { encounterId: 'viallis_ritual' }))
  assert.equal((await call('travel_to_map', { toMapId: 'rest' })).code, 'TRAVEL_DURING_COMBAT')
  // A negotiated surrender is supported without fabricated combat rolls.
  const closed=ok(await call('end_combat', { force: true, reason: 'Viallis se rend ; ses aveux et les preuves seront remis aux autorités.' }))
  ok(await call('record_campaign_outcome',{eventId:'yellowcrest-explicit-surrender',closureId:closed.campaignClosures[0].closureId,result:'surrender',reason:'Le MJ choisit explicitement la reddition négociée de ces adversaires réellement présents à la clôture.'}))
  const incomplete = await call('travel_to_map', { toMapId: 'rest' })
  assert.equal(incomplete.code, 'MAP_QUEST_INCOMPLETE')
  assert.deepEqual(incomplete.detail.missingObjectives.map(o => o.id), ['family_ashes'])
  await enter(call, 'chapel_library', '26')
  assert.equal((await call('travel_to_map', { toMapId: 'rest' })).code, 'MAP_QUEST_INCOMPLETE', 'visiting the urn is not collecting it')
  assert.equal((await call('pick_up_item', { itemId: 'yellowcrest_urn' })).code, 'ITEM_OUT_OF_REACH')
  ok(await call('move_token', { tokenId: 'player', toCell: { x: 34, y: 21 } }))
  ok(await call('pick_up_item', { itemId: 'yellowcrest_urn' }))
  ok(await call('drop_item', { itemId: 'yellowcrest_urn', description: 'Urne posée provisoirement sur la table.' }))
  assert.equal((await call('travel_to_map', { toMapId: 'rest' })).code, 'MAP_QUEST_INCOMPLETE', 'leaving the urn behind blocks burial travel')
  ok(await call('pick_up_item', { itemId: 'yellowcrest_urn' }))
  const before = await call('get_game_state')
  ok(await call('replace_game_state', { gameState: before }))
  const actualDeparture=[{x:33,y:21},{x:35,y:21},{x:34,y:20}]
  for(const[i,npcId]of partyIds.entries())ok(await call('move_party_npc',{eventId:'real-return-departure-'+npcId,npcId,toCell:actualDeparture[i]}))
  const current=await call('get_game_state'),restArrival=map.entryCells['33'],destination={...current,currentMapId:'rest',monsters:{},player:{...current.player,position:restArrival}},free=navigationGrid(destination,'player').neighbors(restArrival).filter(c=>navigationGrid(destination,'player').free(c));assert.ok(free.length>=3)
  const trip = ok(await call('travel_to_map',{transitionId:'return_for_burial',partyCompanions:partyIds.map((npcId,i)=>({npcId,arrivalCell:free[i]}))}))
  assert.deepEqual(trip.companionsMoved.sort(), ['vecken_rescued', 'yaeda', 'young_fargo'].sort())
  assert.equal(trip.outcome.completion, 'total')
  const rest = await call('get_game_state')
  assert.equal(rest.currentMapId, 'rest')
  assert.deepEqual(rest.mapOutcomes.cellar, rest.mapOutcomes.temple, 'leaving the act closes both floors')
  assert.equal(Object.keys(rest.mapOutcomes).length, 5)
  assert.equal(new Set([rest.player, ...trip.companionsMoved.map(id => rest.npcs[id])].map(e => `${e.position.x},${e.position.y}`)).size, 4)
  assert.equal((await call('travel_to_map', { toMapId: 'temple' })).code, 'NO_MAP_TRANSITION')
  await move(call, '34')
  await move(call, '33'); await enter(call, 'mausoleum', '35')
  ok(await call('move_token', { tokenId: 'player', toCell: { x: 14, y: 4 } }))
  ok(await call('drop_item', { itemId: 'yellowcrest_urn', toCell: { x: 14, y: 3 }, description: 'Les cendres de Maria et de ses enfants sont inhumées dans le tombeau consacré.' }))
  await helpful(call, 'sarah_at_rest')
  const final = await call('get_game_state')
  assert.ok(!final.player.inventory.some(i => i.id === 'yellowcrest_urn'))
  assert.equal(final.droppedItems.yellowcrest_urn.mapId, 'rest')
  assert.equal(final.droppedItems.yellowcrest_urn.roomId, '35')
  assert.equal(final.npcs.sarah_at_rest.disposition, 'helpful')
  assert.equal(final.monsters && Object.keys(final.monsters).length, 0)
  const hydrated = ok(await call('replace_game_state', { gameState: final }))
  assert.deepEqual(hydrated.droppedItems, final.droppedItems)
})

test('stairs revalidate room, mobility, arrival occupancy and combat before any floor mutation', async t => {
  const call = await engine(t)
  const state = await call('get_game_state')
  Object.assign(state, { currentMapId: 'temple', currentRoomId: '20', roomsVisited: ['20'] })
  state.player.position = { x: 38, y: 22 }
  state.player.conditions = ['grappled']
  ok(await call('replace_game_state', { gameState: state }))
  const legacyMarker = await call('get_game_state')
  assert.ok(!legacyMarker.hero.effects.some(effect => effect.kind === 'grapple'
    && (effect.sourceId === 'player' || effect.targetIds.includes('player'))))
  assert.ok(!legacyMarker.monsterEffects.some(effect => effect.kind === 'grapple' && effect.targetId === 'player'))
  assert.equal((await call('travel_to_map', { transitionId: 'descend_manor' })).code, 'ACTOR_IMMOBILE')
  assert.deepEqual(await call('get_game_state'), legacyMarker, 'An untracked legacy marker remains a mobility refusal; no hold, elapsed time or floor mutation is invented')
  state.player.conditions = []
  state.phase = 'combat'; state.currentTurn = 'player'; state.initiativeOrder = ['player']; state.round = 1
  ok(await call('replace_game_state', { gameState: state }))
  const combatBefore = await call('get_game_state')
  assert.equal((await call('travel_to_map', { transitionId: 'descend_manor' })).code, 'TRAVEL_DURING_COMBAT')
  assert.deepEqual(await call('get_game_state'), combatBefore, 'A combat travel refusal changes neither the actor nor the map state')
  state.phase = 'exploration'; state.currentTurn = null; state.initiativeOrder = []
  state.npcs.yaeda.position = { x: 38, y: 2 }; state.npcs.yaeda.mapId = 'cellar'; state.npcs.yaeda.roomId = '27'
  ok(await call('replace_game_state', { gameState: state }))
  assert.equal((await call('travel_to_map', { transitionId: 'descend_manor' })).code, 'PASSAGE_ARRIVAL_BLOCKED')
  const refused = await call('get_game_state')
  assert.equal(refused.currentMapId, 'temple')
  assert.deepEqual(refused.player.position, state.player.position)
  assert.deepEqual(refused.mapOutcomes, state.mapOutcomes)
  state.npcs.yaeda.position = { x: 21, y: 13 }; state.npcs.yaeda.roomId = '30'
  ok(await call('replace_game_state', { gameState: state }))
  await travel(call, 'descend_manor')
  assert.equal((await call('pick_up_item', { itemId: 'yellowcrest_urn' })).code, 'ITEM_OUT_OF_REACH')
  await travel(call, 'ascend_manor')
  assert.equal((await call('get_game_state')).currentMapId, 'temple')
})

test('legacy lower-floor sessions hydrate directly onto the new basement without losing discoveries', async t => {
  const call = await engine(t)
  const old = await call('get_game_state')
  delete old.sceneMemory
  old.currentMapId = 'temple'; old.currentRoomId = '30'
  old.player.position = { x: 19, y: 29 }; old.roomsVisited = ['17', '18', '20', '27', '30']
  old.npcs.yaeda.mapId = 'temple'; old.npcs.yaeda.position = { x: 21, y: 33 }
  const hydrated = ok(await call('replace_game_state', { gameState: old }))
  assert.equal(hydrated.currentMapId, 'cellar')
  assert.deepEqual(hydrated.player.position, { x: 19, y: 9 })
  assert.deepEqual(hydrated.roomsVisited, old.roomsVisited)
  assert.equal(hydrated.npcs.yaeda.mapId, 'cellar')
  const again = ok(await call('replace_game_state', { gameState: hydrated }))
  assert.deepEqual(again.player.position, hydrated.player.position)
})

test('empty openings override old closed states and cannot be closed or forced or spend an action', async t => {
  const call = await engine(t)
  const state = await call('get_game_state')
  state.currentMapId = 'temple'; state.currentRoomId = '18'; state.player.position = { x: 10, y: 7 }
  state.roomsVisited = ['18']; state.sceneMemory.doorStates = { arcane_study: 'closed' }
  ok(await call('replace_game_state', { gameState: state }))
  const before = await call('get_game_state')
  for (const action of ['close', 'force']) {
    assert.equal((await call('interact_door', { doorId: 'arcane_study', action })).code, 'NO_DOOR_PANEL')
    assert.deepEqual(await call('get_game_state'), before, 'refusal changes no state, dice or action budget')
  }
  const unchanged = ok(await call('interact_door', { doorId: 'arcane_study', action: 'open' }))
  assert.equal(unchanged.unchanged, true)
  assert.deepEqual(await call('get_game_state'), before)
  const crossing = ok(await call('move_token', { tokenId: 'player', doorId: 'arcane_study', doorMode: 'cross' }))
  assert.equal(crossing.currentRoomId, '19')
  assert.equal((await call('get_game_state')).roomsVisited.includes('19'), true)
})
