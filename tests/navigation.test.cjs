const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { getAdventureMap } = require('../mcp-server/dist/lib/adventure-map.js')
const { navigationPathCost, findNavigationPath, navigationGrid, combatMovementCells, explorationMovementRooms } = require('../mcp-server/dist/lib/navigation.js')
const { geometryMetadata } = require('../mcp-server/dist/lib/battlemap-geometry.js')
const gs = require('../mcp-server/dist/mcp-server/game-state.js')
const { planNavigation, executeNavigation } = require('../mcp-server/dist/mcp-server/navigation.js')
const { registerPlayerTools } = require('../mcp-server/dist/mcp-server/tools/player-tools.js')
const { registerNavigationTools } = require('../mcp-server/dist/mcp-server/tools/navigation-tools.js')
const { registerDoorTools } = require('../mcp-server/dist/mcp-server/tools/door-tools.js')
const { registerCombatTools } = require('../mcp-server/dist/mcp-server/tools/combat-tools.js')
const { registerNpcTools } = require('../mcp-server/dist/mcp-server/tools/npc-tools.js')
const { reactionOpportunities } = require('../mcp-server/dist/lib/npc-reactions.js')
const hash = x => crypto.createHash('sha256').update(x).digest('hex')
const c = (x,y) => ({x,y})

function fixture(t, { wall = true, door = false } = {}) {
  const data = getAdventureMap(), original = structuredClone(data)
  t.after(() => { for (const key of Object.keys(data)) delete data[key]; Object.assign(data, original); gs.resetState() })
  Object.assign(data, { maps: [{id:'test',name:'Test',grid:{cols:7,rows:5}}], rooms: [
    {id:'a',name:'Hall',zone:{minX:0,maxX:2,minY:0,maxY:4}},
    {id:'b',name:'Study',zone:{minX:3,maxX:6,minY:0,maxY:4}},
  ], startCell:c(1,2), entryCells:{a:c(1,2),b:c(5,2)}, npcs:[], encounters:{}, doors:door ? [
    {id:'gate',name:'Gate',initialState:'closed',sides:[{roomId:'a',cell:c(2,2),direction:'east'},{roomId:'b',cell:c(3,2),direction:'west'}]},
  ] : [], partitions:[], roomHooks:{} })
  const edges = wall ? [1,2,3].map(y=>({from:c(2,y),to:c(3,y),kind:'wall'})) : []
  if (door) edges.splice(0, edges.length, ...[0,1,2,3,4].map(y=>({from:c(2,y),to:c(3,y),kind:y===2?'door':'wall',...(y===2?{doorId:'gate'}:{})})))
  const geometry = {version:1,mapId:'test',grid:{cols:7,rows:5},source:{image:'/battlemaps/grammys_bakery.png',
    sha256:hash(fs.readFileSync('public/battlemaps/grammys_bakery.png')),metadataSha256:hash(geometryMetadata(data,'test')),model:'test-fixture'},
    review:'approved',blockedCells:[],edges,decorations:[],uncertainties:[],contradictions:[]}
  data.maps[0].geometry = geometry
  gs.resetState()
  const state = gs.getState()
  state.npcs = {}; state.monsters = {}; state.player.position=c(1,2); state.currentRoomId='a'; state.currentMapId='test'
  const callbacks = {}
  const server = { tool(name, description, schema, callback) { callbacks[name] = async input => {
    const {z} = require('zod'); return callback(z.object(schema).parse(input))
  } } }
  registerPlayerTools(server); registerNavigationTools(server); registerDoorTools(server); registerCombatTools(server); registerNpcTools(server)
  const call = async (name,input) => JSON.parse((await callbacks[name](input)).content[0].text)
  const restamp = () => { geometry.source.metadataSha256=hash(geometryMetadata(data,'test')) }
  return {data,state,geometry,call,restamp}
}

test('explicit room selection computes a detour and actual cost; preview is read-only', t => {
  const {state}=fixture(t)
  const before=structuredClone(state), result=planNavigation('player',{kind:'room',roomId:'b'})
  assert.deepEqual(state,before)
  assert.equal(result.costCells,6) // wall detour includes alternating diagonal costs
  assert.deepEqual(result.finalPosition,c(5,2))
  assert.equal(result.goalReached,true)
  const moved=executeNavigation('player',{kind:'room',roomId:'b'})
  assert.deepEqual(moved.path,result.path)
  assert.equal(gs.getState().currentRoomId,'b')
})

test('impossible route and wrong-map room reject without mutation', t => {
  const {state,geometry}=fixture(t)
  geometry.edges.push({from:c(2,0),to:c(3,0),kind:'wall'},{from:c(2,4),to:c(3,4),kind:'wall'})
  const before=structuredClone(state)
  assert.throws(()=>executeNavigation('player',{kind:'room',roomId:'b'}),e=>e.code==='NO_PATH')
  assert.throws(()=>executeNavigation('player',{kind:'room',roomId:'other-map-room'}),e=>e.code==='ROOM_NOT_ON_MAP')
  assert.deepEqual(state,before)
})

test('closed door gates raw coordinates; opening does not cross and explicit crossing revalidates', async t => {
  const {state,call}=fixture(t,{door:true})
  const stopped=await call('move_token',{tokenId:'player',toCell:c(5,2)})
  assert.equal(stopped.stopReason,'closed_door'); assert.equal(stopped.goalReached,false)
  assert.deepEqual(stopped.newPosition,c(2,2)); assert.equal(state.sceneMemory,undefined)
  assert.equal((await call('move_token',{tokenId:'player',doorId:'gate',doorMode:'cross'})).code,'DOOR_CLOSED')
  const opened=await call('interact_door',{actorId:'player',doorId:'gate',action:'open'})
  assert.equal(opened.crossed,false); assert.deepEqual(state.player.position,c(2,2))
  const crossed=await call('move_token',{tokenId:'player',doorId:'gate',doorMode:'cross'})
  assert.equal(crossed.goalReached,true); assert.deepEqual(state.player.position,c(3,2))
})

test('no diagonal corner cutting across a wall, blocked cell, or occupied square', t => {
  const {state,geometry}=fixture(t,{wall:false})
  geometry.edges.push({from:c(1,2),to:c(2,2),kind:'wall'})
  let grid=navigationGrid(state,'player',geometry)
  assert.equal(grid.step(c(1,2),c(2,1)),false)
  geometry.edges=[]; geometry.blockedCells=[c(2,2)]
  assert.equal(navigationGrid(state,'player',geometry).step(c(1,2),c(2,1)),false)
  geometry.blockedCells=[]; state.monsters.blocker=monster('blocker',c(2,2))
  assert.equal(navigationGrid(state,'player',geometry).step(c(1,2),c(2,1)),false)
})

function monster(id,position) { return {id,name:id,type:'goblin',position,hp:{current:10,max:10},ac:12,
  stats:{str:10,dex:10,con:10,int:10,wis:10,cha:10},conditions:[],isAlive:true,speed:30,xpValue:10,attackBonus:0,damageDice:'1d4'} }

test('combat budgets use detour cost, partial progress is opt-in; stale occupancy invalidates preview', t => {
  const {state}=fixture(t)
  state.phase='combat'; state.currentTurn='player'; state.initiativeOrder=['player']; state.round=1; state.player.speed=20
  const before=structuredClone(state)
  assert.throws(()=>executeNavigation('player',{kind:'room',roomId:'b'}),e=>e.code==='MOVEMENT_EXCEEDED'&&e.detail.costCells===6)
  assert.deepEqual(state,before)
  const partial=executeNavigation('player',{kind:'room',roomId:'b'},true)
  assert.equal(partial.costCells,3); assert.equal(partial.remaining,1); assert.equal(partial.goalReached,false)
  assert.equal(partial.stopReason,'movement_budget'); assert.equal(state.movementUsed.player,3)
  assert.equal(planNavigation('player',{kind:'room',roomId:'b'},true).costCells,0,'the next diagonal costs two but only one unit remains')
  state.phase='exploration'; state.player.position=c(1,2)
  assert.equal(planNavigation('player',{kind:'room',roomId:'b'}).goalReached,true)
  state.monsters.blocker=monster('blocker',c(5,2))
  assert.throws(()=>executeNavigation('player',{kind:'room',roomId:'b'}),e=>e.code==='CELL_OCCUPIED')
  assert.deepEqual(state.player.position,c(1,2))
})

test('monsters follow the same detour instead of local greedy steps', async t => {
  const {state,call}=fixture(t)
  state.player.position=c(5,2); state.monsters.guard=monster('guard',c(1,2))
  state.phase='combat'; state.currentTurn='guard'; state.initiativeOrder=['guard','player']; state.round=1
  const result=await call('run_monster_turns',{})
  assert.equal(result.resolvedTurns[0].moved,5)
  assert.equal(result.resolvedTurns[0].action,'attack')
  assert.equal(state.currentTurn,'player')
})

function addNpc(f) {
  f.data.npcs=[{id:'guide',name:'Guide',kind:'guard',roomId:'a',cell:c(2,2),disposition:'neutral',visibleFromStart:true,
    reactive:{objectives:['Guard the study'],capabilities:['move','open_door','close_door','initiate_combat','attack'],speed:30,combatTemplate:'bandit',triggers:['after_player_action','turn_start']}}]
  f.state.npcs.guide={id:'guide',name:'Guide',kind:'guard',roomId:'a',position:c(2,2),mapId:'test',disposition:'neutral',visible:true}
  f.state.playerActionRevision=1; f.restamp()
}

test('NPC explicitly opens and crosses, activates once, and survives replaceState', async t => {
  const f=fixture(t,{door:true}); addNpc(f)
  const opportunity=reactionOpportunities(f.state)[0]
  const input={npcId:'guide',activationKey:opportunity.activationKey,actions:[{kind:'door',doorId:'gate',action:'open'},
    {kind:'move',doorId:'gate',doorMode:'cross'}]}
  const result=await f.call('npc_action',input)
  assert.equal(result.completed,true); assert.deepEqual(f.state.npcs.guide.position,c(3,2)); assert.equal(f.state.npcs.guide.roomId,'b')
  assert.equal(f.state.playerActionRevision,1,'NPC action cannot cascade')
  gs.replaceState(structuredClone(f.state))
  assert.equal(gs.getState().npcActivationLedger.includes(opportunity.activationKey),true)
  assert.deepEqual(gs.getState().npcs.guide.position,c(3,2))
  assert.equal((await f.call('npc_action',input)).code,'NPC_ACTIVATION_UNAVAILABLE')
})

test('NPC capability failure rolls back; explicit combat initiation uses LLM turns, not monster automation', async t => {
  const priorDice=process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE='19,2,18,3' // Initial and next-round initiatives: player, guide.
  t.after(()=>{if(priorDice===undefined)delete process.env.AI_DM_TEST_DICE_SEQUENCE;else process.env.AI_DM_TEST_DICE_SEQUENCE=priorDice})
  const f=fixture(t,{wall:false}); addNpc(f)
  f.data.npcs[0].reactive.capabilities=['move']; f.restamp()
  const opportunity=reactionOpportunities(f.state)[0], before=structuredClone(f.state)
  assert.equal((await f.call('npc_action',{npcId:'guide',activationKey:opportunity.activationKey,actions:[{kind:'initiate_combat',targetId:'player'}]})).code,'NPC_CAPABILITY_MISSING')
  assert.deepEqual(gs.getState(),before)
  f.data.npcs[0].reactive.capabilities.push('initiate_combat'); f.restamp()
  const result=await f.call('npc_action',{npcId:'guide',activationKey:opportunity.activationKey,actions:[{kind:'initiate_combat',targetId:'player'}]})
  assert.equal(result.completed,true)
  const state=gs.getState(); assert.equal(state.monsters.guide.controller,'reactive_npc')
  state.currentTurn='guide'
  const automatic=await f.call('run_monster_turns',{})
  assert.equal(automatic.turnsResolved,0); assert.equal(state.currentTurn,'guide')
  const turn=reactionOpportunities(state)[0]
  await f.call('npc_action',{npcId:'guide',activationKey:turn.activationKey,actions:[{kind:'wait'}]})
  assert.equal(state.currentTurn,'player')
})

test('stale or unreviewed image geometry fails closed; room/cell arguments conflict without mutation', async t => {
  const {state,geometry,call}=fixture(t)
  const before=structuredClone(state)
  assert.equal((await call('move_token',{tokenId:'player',roomId:'b',toCell:c(5,2)})).code,'INVALID_DESTINATION')
  assert.deepEqual(state,before)
  geometry.source.sha256='0'.repeat(64)
  assert.throws(()=>executeNavigation('player',{kind:'room',roomId:'b'}),e=>e.code==='GEOMETRY_STALE')
  geometry.source.sha256=hash(fs.readFileSync('public/battlemaps/grammys_bakery.png')); geometry.review='draft'
  assert.throws(()=>executeNavigation('player',{kind:'room',roomId:'b'}),e=>e.code==='GEOMETRY_UNREVIEWED')
  assert.deepEqual(state.player.position,c(1,2))
})

test('room decision boundaries stop before entry and require explicit acknowledgement, without triggering encounters', t => {
  const {state,data,restamp}=fixture(t,{wall:false})
  data.rooms[1].navigationEvent={id:'watch',label:'Decide how to approach the watchers'};restamp()
  const stopped=executeNavigation('player',{kind:'room',roomId:'b'})
  assert.equal(stopped.stopReason,'event_decision');assert.equal(stopped.goalReached,false)
  assert.equal(stopped.stopEvent.id,'watch');assert.equal(state.roomsVisited.includes('b'),false)
  const entered=executeNavigation('player',{kind:'room',roomId:'b'},false,['watch'])
  assert.equal(entered.goalReached,true);assert.equal(state.currentRoomId,'b')
  assert.equal(state.phase,'exploration');assert.deepEqual(state.encountersTriggered,[])
})

test('closed-door changes between preview and execution are revalidated', async t => {
  const {state,call}=fixture(t,{door:true})
  state.sceneMemory={doorStates:{gate:'open'}}
  assert.equal(planNavigation('player',{kind:'room',roomId:'b'}).goalReached,true)
  state.sceneMemory.doorStates.gate='closed'
  const result=await call('move_token',{tokenId:'player',roomId:'b'})
  assert.equal(result.stopReason,'closed_door');assert.deepEqual(state.player.position,c(2,2))
})

test('exploration offers directly connected rooms, including closed doors, without mutating state', t => {
  const {state,data,geometry} = fixture(t,{door:true})
  data.rooms[1].navigationEvent = {id:'watch',label:'Choose an approach'}
  const before = structuredClone(state)
  assert.deepEqual(explorationMovementRooms(state).map(room => room.id), ['b'])
  assert.deepEqual(state, before)
  geometry.edges.find(edge => edge.kind === 'door').kind = 'wall'
  assert.deepEqual(explorationMovementRooms(state), [], 'touching zones separated by a wall are not connected')
})

test('exploration connections ignore occupation but exclude remote rooms and other maps', t => {
  const {state,data} = fixture(t,{wall:false})
  data.rooms[1].zone.maxX = 4
  data.rooms.push({id:'remote',name:'Remote',zone:{minX:5,maxX:6,minY:0,maxY:4}},
    {id:'other',name:'Other map',mapId:'next',zone:{minX:0,maxX:6,minY:0,maxY:4}})
  data.entryCells.b = c(4,2); data.entryCells.remote = c(5,2); data.entryCells.other = c(1,1)
  state.monsters.blocker = monster('blocker',c(4,2))
  assert.deepEqual(explorationMovementRooms(state).map(room => room.id), ['b'])
  state.currentRoomId = 'b'; state.player.position = c(3,2)
  assert.deepEqual(explorationMovementRooms(state).map(room => room.id), ['a','remote'])
})

test('exploration uses exact room footprints and legacy partitions, never corner contact alone', t => {
  const {state,data} = fixture(t,{wall:false})
  delete data.maps[0].geometry
  data.partitions = [['a','b']]
  assert.deepEqual(explorationMovementRooms(state), [])
  data.partitions = []
  data.rooms[0].zone = {minX:0,maxX:2,minY:0,maxY:2}
  data.rooms[1].zone = {minX:2,maxX:4,minY:2,maxY:4}
  data.rooms[1].areas = [{minX:3,maxX:4,minY:3,maxY:4}]
  assert.deepEqual(explorationMovementRooms(state), [], 'bounding boxes do not create false connections')
  data.rooms[1].areas = [{minX:3,maxX:4,minY:2,maxY:4}]
  assert.deepEqual(explorationMovementRooms(state).map(room => room.id), ['b'])
})

test('exploration zones require exploration, a mobile player, a known current room and approved geometry', t => {
  const {state,geometry} = fixture(t,{wall:false})
  assert.equal(explorationMovementRooms(state).length, 1)
  state.phase = 'combat'; assert.deepEqual(explorationMovementRooms(state), [])
  state.phase = 'exploration'; state.player.hp.current = 0; assert.deepEqual(explorationMovementRooms(state), [])
  state.player.hp.current = 10; state.player.conditions = ['restrained']; assert.deepEqual(explorationMovementRooms(state), [])
  state.player.conditions = []; state.player.speed = 0; assert.deepEqual(explorationMovementRooms(state), [])
  state.player.speed = 30; state.currentRoomId = null; assert.deepEqual(explorationMovementRooms(state), [])
  state.currentRoomId = 'a'; geometry.review = 'draft'; assert.deepEqual(explorationMovementRooms(state), [])
})

function beginPlayerTurn(state, speed = 30) {
  state.phase = 'combat'; state.currentTurn = 'player'; state.initiativeOrder = ['player']; state.round = 1
  state.player.speed = speed; state.movementUsed = {}
}
const containsCell = (cells, cell) => cells.some(entry => entry.cell.x === cell.x && entry.cell.y === cell.y)

test('clickable combat cells use remaining path cost around walls and match engine previews', t => {
  const {state} = fixture(t)
  beginPlayerTurn(state, 30)
  state.movementUsed.player = 2 // Four steps remain; the five-step detour is out of range.
  const before = structuredClone(state), cells = combatMovementCells(state)
  assert.equal(containsCell(cells, c(1,2)), false)
  assert.equal(containsCell(cells, c(5,2)), false)
  assert.equal(containsCell(cells, c(4,0)), true, 'a legal detour remains available')
  for (const {cell, costCells} of cells) {
    const planned = planNavigation('player', {kind:'cell',cell})
    assert.equal(planned.goalReached, true)
    assert.equal(planned.costCells, costCells)
    assert.ok(costCells <= 4)
  }
  // Also check completeness, rather than only validating advertised cells.
  for (let y=0; y<5; y++) for (let x=0; x<7; x++) {
    if (x === 1 && y === 2) continue
    let reachable = false
    try { reachable = planNavigation('player', {kind:'cell',cell:c(x,y)}).goalReached } catch {}
    assert.equal(containsCell(cells,c(x,y)), reachable, `cell ${x},${y}`)
  }
  assert.deepEqual(state, before, 'highlighting never mutates the session')
})

test('clickable combat cells cannot cross closed doors and update when a door opens or closes', t => {
  const {state} = fixture(t,{door:true})
  beginPlayerTurn(state)
  assert.equal(combatMovementCells(state).some(({cell}) => cell.x >= 3), false)
  assert.equal(containsCell(combatMovementCells(state), c(2,2)), true)
  state.sceneMemory = {doorStates:{gate:'open'}}
  assert.equal(containsCell(combatMovementCells(state), c(5,2)), true)
  state.sceneMemory.doorStates.gate = 'closed'
  assert.equal(combatMovementCells(state).some(({cell}) => cell.x >= 3), false)
})

test('one-step highlights exclude diagonal corner cutting, obstacles and occupied cells', t => {
  const {state,geometry} = fixture(t,{wall:false})
  beginPlayerTurn(state, 5)
  geometry.edges = [{from:c(1,2),to:c(2,2),kind:'wall'}]
  assert.equal(containsCell(combatMovementCells(state), c(2,1)), false)
  assert.equal(containsCell(combatMovementCells(state), c(2,2)), false)
  geometry.edges = []; geometry.blockedCells = [c(2,2)]
  assert.equal(containsCell(combatMovementCells(state), c(2,1)), false)
  geometry.blockedCells = []; state.monsters.blocker = monster('blocker',c(2,2))
  assert.equal(containsCell(combatMovementCells(state), c(2,2)), false)
  assert.equal(containsCell(combatMovementCells(state), c(2,1)), false)
  state.monsters.blocker.isAlive = false
  assert.equal(containsCell(combatMovementCells(state), c(2,1)), true)
})

test('movement highlights require a mobile living player on their turn and approved geometry', t => {
  const {state,geometry} = fixture(t,{wall:false})
  assert.deepEqual(combatMovementCells(state), [])
  beginPlayerTurn(state)
  assert.ok(combatMovementCells(state).length > 0)
  state.currentTurn = 'opponent'; assert.deepEqual(combatMovementCells(state), [])
  state.currentTurn = 'player'; state.movementUsed.player = 6; assert.deepEqual(combatMovementCells(state), [])
  state.movementUsed.player = 0; state.player.hp.current = 0; assert.deepEqual(combatMovementCells(state), [])
  state.player.hp.current = 10
  for (const condition of ['grappled','restrained','incapacitated','paralyzed','petrified','stunned','unconscious']) {
    state.player.conditions = [condition]; assert.deepEqual(combatMovementCells(state), [], condition)
  }
  state.player.conditions = []; geometry.review = 'draft'; assert.deepEqual(combatMovementCells(state), [])
})

test('highlights stop at decision boundaries and respect frightened movement restrictions', t => {
  const {state,data,restamp} = fixture(t,{wall:false})
  beginPlayerTurn(state)
  data.rooms[1].navigationEvent = {id:'watch',label:'Choose an approach'}; restamp()
  assert.equal(combatMovementCells(state).some(({cell}) => cell.x >= 3), false)
  state.roomsVisited.push('b')
  assert.equal(containsCell(combatMovementCells(state),c(5,2)), true)
  state.monsters.source = monster('source',c(5,2))
  state.player.conditions = ['frightened']
  state.monsterEffects = [{sourceId:'source',targetId:'player',conditions:['frightened']}]
  const cells = combatMovementCells(state)
  assert.equal(containsCell(cells,c(2,2)), false)
  assert.equal(containsCell(cells,c(0,2)), true)
  for (const {cell,costCells} of cells) {
    const planned = planNavigation('player',{kind:'cell',cell})
    assert.equal(planned.goalReached,true); assert.equal(planned.costCells,costCells)
  }
})

test('highlights use only current-map bounds, geometry and occupants after a map change', t => {
  const {state,data,restamp} = fixture(t,{door:true})
  beginPlayerTurn(state)
  data.maps.push({id:'next',name:'Next',grid:{cols:3,rows:2}})
  data.rooms.push({id:'next-room',mapId:'next',name:'Next room',zone:{minX:0,maxX:2,minY:0,maxY:1}})
  restamp()
  assert.equal(combatMovementCells(state).some(({cell}) => cell.x >= 3),false)
  state.currentMapId = 'next'; state.currentRoomId = 'next-room'; state.player.position = c(0,0)
  state.npcs = {other:{id:'other',position:c(1,0),mapId:'test'}}
  const cells = combatMovementCells(state)
  assert.equal(cells.length,5)
  assert.equal(containsCell(cells,c(1,0)),true,'an NPC on the previous map cannot block this map')
  assert.ok(cells.every(({cell}) => cell.x < 3 && cell.y < 2))
})

test('difficult terrain selects the cheapest route and the UI quotes the engine cost', t => {
  const {state,data} = fixture(t,{wall:false})
  data.maps[0].terrain = [{kind:'difficult',label:'Clutter',cells:[c(2,2),c(3,2),c(4,2)]},
    {kind:'blocked',label:'Cart',cells:[c(6,3)]}]
  beginPlayerTurn(state)
  const plan = planNavigation('player',{kind:'cell',cell:c(5,2)})
  assert.equal(plan.costCells,5,'a clear detour costs less than crossing the clutter')
  assert.ok(plan.path.slice(1).every(cell => cell.y !== 2 || cell.x === 5))
  assert.throws(() => planNavigation('player',{kind:'cell',cell:c(6,3)}), e => e.code === 'DESTINATION_BLOCKED')
  for (const {cell,costCells} of combatMovementCells(state)) {
    const preview = planNavigation('player',{kind:'cell',cell})
    assert.equal(preview.costCells,costCells)
    assert.ok(costCells <= 6)
  }
})

test('entering difficult terrain charges two units, including partial moves, with no overspend', t => {
  const {state,data} = fixture(t,{wall:false})
  data.maps[0].terrain = [{kind:'difficult',label:'Hay',cells:[c(2,2)]},
    {kind:'blocked',label:'Stalls',cells:[c(2,0),c(2,1),c(2,3),c(2,4)]}]
  beginPlayerTurn(state,5)
  const before = structuredClone(state)
  assert.throws(() => executeNavigation('player',{kind:'cell',cell:c(3,2)}), e => e.code === 'MOVEMENT_EXCEEDED')
  assert.deepEqual(state,before)
  assert.equal(containsCell(combatMovementCells(state),c(2,2)),false)
  let result = executeNavigation('player',{kind:'cell',cell:c(3,2)},true)
  assert.deepEqual(result.finalPosition,c(1,2),'one unit cannot pay the next difficult step')
  assert.equal(result.costCells,0)
  assert.equal(result.stopReason,'movement_budget')
  beginPlayerTurn(state,10)
  assert.equal(combatMovementCells(state).find(({cell})=>cell.x===2&&cell.y===2).costCells,2)
  result = executeNavigation('player',{kind:'cell',cell:c(3,2)},true)
  assert.deepEqual(result.finalPosition,c(2,2))
  assert.equal(result.costCells,2)
  assert.equal(result.remaining,0)
  assert.equal(state.movementUsed.player,2)
  assert.equal(result.goalReached,false)
})

test('diagonal costs alternate across calls and straight steps, persist, and reset next turn', t => {
  const {state}=fixture(t,{wall:false})
  state.phase='combat'; state.initiativeOrder=['player']; state.currentTurn='player'
  const move = cell => executeNavigation('player',{kind:'cell',cell})
  assert.equal(move(c(2,1)).costCells,1)
  assert.equal(move(c(3,1)).costCells,1)
  const saved=structuredClone(state)
  gs.replaceState(saved)
  assert.equal(gs.getState().diagonalMovementUsed.player,1)
  const before=structuredClone(gs.getState())
  assert.equal(planNavigation('player',{kind:'cell',cell:c(4,2)}).costCells,2)
  assert.deepEqual(gs.getState(),before)
  assert.equal(move(c(4,2)).costCells,2)
  assert.equal(move(c(5,3)).costCells,1)
  assert.equal(gs.getMovementUsed('player'),5)
  gs.advanceTurn()
  assert.equal(gs.getState().diagonalMovementUsed.player,undefined)
  assert.equal(move(c(4,2)).costCells,1)
})

test('second diagonal cannot exceed budget; previews and partial execution agree', t => {
  const {state}=fixture(t,{wall:false})
  state.phase='combat'; state.initiativeOrder=['player']; state.currentTurn='player'
  state.player.speed=10
  executeNavigation('player',{kind:'cell',cell:c(2,1)})
  const before=structuredClone(state)
  assert.throws(()=>executeNavigation('player',{kind:'cell',cell:c(3,2)}),e=>e.code==='MOVEMENT_EXCEEDED')
  assert.deepEqual(state,before)
  assert.equal(combatMovementCells(state).some(x=>x.cell.x===3&&x.cell.y===2),false)
  const partial=executeNavigation('player',{kind:'cell',cell:c(3,2)},true)
  assert.equal(partial.costCells,0)
  assert.equal(state.diagonalMovementUsed.player,1)
  assert.deepEqual(state.player.position,c(2,1))
})

test('path cost alternates within a route, keeps actor counters independent and supports legacy saves', t => {
  const {state}=fixture(t,{wall:false})
  const path=[c(0,0),c(1,1),c(2,2),c(3,3),c(4,4)]
  assert.equal(navigationPathCost(state,path),6)
  state.phase='combat'; state.diagonalMovementUsed={player:1}
  assert.equal(navigationPathCost(state,path.slice(0,2)),2)
  assert.equal(navigationPathCost(state,path.slice(0,2),'other'),1)
  delete state.diagonalMovementUsed
  gs.replaceState(structuredClone(state))
  assert.equal(navigationPathCost(gs.getState(),path.slice(0,2)),1)
})

test('difficult terrain doubles alternating diagonal cost and separate actors keep their own parity', t => {
  const {state,data}=fixture(t,{wall:false})
  state.phase='combat'; state.initiativeOrder=['player']; state.currentTurn='player'
  state.diagonalMovementUsed={player:1,guard:0}
  data.maps[0].terrain=[{kind:'difficult',label:'Rubble',cells:[c(2,1)]}]
  assert.equal(navigationPathCost(state,[c(1,2),c(2,1)]),4)
  assert.equal(navigationPathCost(state,[c(1,2),c(2,1)],'guard'),2)
  assert.equal(state.diagonalMovementUsed.player,1)
})

test('MCP state replacement preserves diagonal parity', async t => {
  const {state,call}=fixture(t,{wall:false})
  state.round=1
  state.phase='combat'; state.initiativeOrder=['player']; state.currentTurn='player'
  executeNavigation('player',{kind:'cell',cell:c(2,1)})
  const snapshot=structuredClone(state)
  const result=await call('replace_game_state',{gameState:snapshot})
  assert.notEqual(result.success,false)
  assert.equal(gs.getState().diagonalMovementUsed.player,1)
  assert.equal(planNavigation('player',{kind:'cell',cell:c(3,2)}).costCells,2)
})
