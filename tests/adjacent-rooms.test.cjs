const test = require('node:test')
const assert = require('node:assert/strict')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
test.after(restore)
// Node's CJS resolver otherwise chooses monsters.json before monsters.ts;
// Next and tsc correctly resolve the TypeScript module for extensionless imports.
const Module = require('node:module'), resolve = Module._resolveFilename
Module._resolveFilename = function(request, ...args) {
  return resolve.call(this, request.endsWith('/srd/monsters') ? `${request}.ts` : request, ...args)
}
const { getAdventureMap } = require('../lib/adventure-map.ts')
const { loadAdventureModuleParsed } = require('../lib/context-loader.ts')
const { adjacentRoomConnections, nearbyRoomPerception, playerSeesCell } = require('../lib/scene-perception.ts')
const { buildNearbyRoomContext } = require('../lib/dm/nearby-rooms.ts')
const { encounterAwareness, pendingEncounterActors } = require('../lib/encounter-awareness.ts')
const { navigationGrid } = require('../lib/navigation.ts')
const { reactionOpportunities } = require('../lib/npc-reactions.ts')
const gs = require('../mcp-server/game-state.ts')
const { registerAwarenessTools } = require('../mcp-server/tools/awareness-tools.ts')
const { registerPhaseTools, createMonster } = require('../mcp-server/tools/phase-tools.ts')
const { registerPlayerTools } = require('../mcp-server/tools/player-tools.ts')

function fixture(t) {
  const data = getAdventureMap(), original = structuredClone(data)
  const parsed = loadAdventureModuleParsed(), rooms = parsed.rooms
  t.after(() => { for (const key of Object.keys(data)) delete data[key]; Object.assign(data, original); parsed.rooms = rooms; gs.resetState() })
  const cell = (x,y) => ({x,y})
  Object.assign(data, { maps: [{id:'local',name:'Local',grid:{cols:9,rows:5},navigationMode:'tactical'},
    {id:'other',name:'Other',grid:{cols:9,rows:5}}], rooms: [
    {id:'1',name:'Hall',zone:{minX:0,maxX:2,minY:0,maxY:4}},
    {id:'2',name:'Guardroom',zone:{minX:3,maxX:5,minY:0,maxY:4}},
    {id:'3',name:'Remote',zone:{minX:6,maxX:8,minY:0,maxY:4}},
    {id:'4',name:'Other floor',mapId:'other',zone:{minX:0,maxX:2,minY:0,maxY:4}},
  ], startCell:cell(1,2),entryCells:{'1':cell(1,2),'2':cell(5,2),'3':cell(7,2)}, npcs:[],
    encounters:{watch:{id:'watch',name:'Watch',roomId:'2',playerCell:cell(4,2),monsters:[{monsterType:'goblin',cell:cell(5,2)}]},
      remote:{id:'remote',name:'Remote watch',roomId:'3',monsters:[{monsterType:'goblin',cell:cell(8,2)}]}},
    doors:[{id:'gate',name:'Gate',initialState:'closed',sides:[{roomId:'1',cell:cell(2,2),direction:'east'},{roomId:'2',cell:cell(3,2),direction:'west'}]}],
    partitions:[],roomHooks:{'2':'LOCAL_HOOK'} })
  parsed.rooms = {'1':'CURRENT_DETAIL','2':'NEIGHBOR_SECRET_DETAIL','3':'REMOTE_SECRET_DETAIL','4':'OTHER_MAP_SECRET_DETAIL'}
  gs.resetState()
  const state = gs.getState()
  Object.assign(state,{currentMapId:'local',currentRoomId:'1',roomsVisited:['1'],npcs:{},monsters:{},playerActionRevision:1})
  state.player.position = cell(1,2)
  const callbacks = {}, server = {tool(name, description, schema, callback) {
    callbacks[name] = input => callback(require('zod').z.object(schema).parse(input))
  }}
  registerAwarenessTools(server); registerPhaseTools(server); registerPlayerTools(server)
  const call = async (name,input) => JSON.parse((await callbacks[name](input)).content[0].text)
  const react = input => call('react_to_noise',{encounterId:'watch',sourceRoomId:'1',reason:'Resolved impact heard nearby',...input})
  return {state,data,call,react}
}

test('neighbor notes include closed-door rooms, exclude remote rooms/maps, and disclose no automatic discoveries', t => {
  const {state} = fixture(t), before = structuredClone(state)
  assert.deepEqual(adjacentRoomConnections(state).map(c => c.room.id),['2'])
  const context = buildNearbyRoomContext(state)
  assert.match(context,/NEIGHBOR_SECRET_DETAIL/); assert.match(context,/LOCAL_HOOK/)
  assert.doesNotMatch(context,/REMOTE_SECRET_DETAIL|OTHER_MAP_SECRET_DETAIL/)
  assert.match(context,/"visibleCells":\[\]/)
  assert.match(context,/ni visitée ni entièrement visible/)
  assert.deepEqual(state,before)
})

test('open-door line of sight works from a distance, excludes occluded cells and hidden/invisible creatures', t => {
  const {state} = fixture(t)
  state.sceneMemory={doorStates:{gate:'open'}}
  state.npcs.secret={id:'secret',name:'Hidden',kind:'guard',mapId:'local',roomId:'2',position:{x:4,y:2},visible:false,disposition:'neutral'}
  state.monsters.ghost=createMonster('goblin',{x:5,y:2});state.monsters.ghost.id='ghost';state.monsters.ghost.conditions=['invisible']
  assert.equal(playerSeesCell(state,{x:5,y:2}),true)
  assert.equal(playerSeesCell(state,{x:3,y:0}),false,'a ray through the wall beside the threshold is blocked')
  let neighbor=nearbyRoomPerception(state)[0]
  assert.ok(neighbor.visibleCells.some(c=>c.x===5&&c.y===2));assert.deepEqual(neighbor.visibleNpcIds,[]);assert.deepEqual(neighbor.visibleMonsterIds,[])
  assert.deepEqual(state.roomsVisited,['1'])
  state.hero={effects:[{kind:'turned',targetIds:['player'],sourceId:'ghost',expiresAt:10}]}
  assert.equal(playerSeesCell(state,{x:5,y:2}),true,'movement restrictions do not obstruct geometry-only sight')
  delete state.hero
  state.player.conditions=['blinded'];assert.deepEqual(nearbyRoomPerception(state)[0].visibleCells,[])
  state.player.conditions=[];state.sceneMemory.doorStates.gate='closed';assert.equal(playerSeesCell(state,{x:5,y:2}),false)
})

test('solid partitions without a passage are not adjacent context; neighboring reactive NPCs get confidential opportunities', t => {
  const {state,data}=fixture(t)
  data.npcs=[{id:'guard',roomId:'2',name:'Guard',kind:'guard',cell:{x:4,y:1},disposition:'neutral',visibleFromStart:false,
    reactive:{objectives:['Keep watch'],capabilities:['move'],speed:30,triggers:['after_player_action']}}]
  state.npcs.guard={id:'guard',mapId:'local',roomId:'2',name:'Guard',kind:'guard',position:{x:4,y:1},disposition:'neutral',visible:false}
  assert.equal(reactionOpportunities(state)[0].offscreen,true)
  data.doors=[];data.partitions=[['1','2']]
  assert.deepEqual(adjacentRoomConnections(state),[]);assert.deepEqual(reactionOpportunities(state),[])
})

test('noise first alerts, then a later action permits investigation; closed doors stop movement and retries cannot move again', async t => {
  const {state,react,call}=fixture(t)
  const before=structuredClone(state)
  assert.equal((await react({response:'investigate',moves:[{monsterIndex:0,roomId:'1'}]})).code,'PRIOR_ALERT_REQUIRED')
  assert.deepEqual(gs.getState(),before)
  await react({response:'alert'})
  let live=gs.getState()
  assert.equal(encounterAwareness(live).watch.status,'alert');assert.deepEqual(live.monsters,{})
  assert.equal((await react({response:'alert'})).code,'ENCOUNTER_REACTION_ALREADY_USED')
  live=gs.getState();live.playerActionRevision=2
  const moved=await react({response:'investigate',moves:[{monsterIndex:0,targetEntityId:'player',relation:'adjacent'}]})
  assert.ok(moved.results,JSON.stringify(moved))
  assert.equal(moved.results[0].stopReason,'closed_door');assert.deepEqual(moved.awareness.positions,[{x:3,y:2}])
  live=gs.getState();assert.equal(navigationGrid(live,'player').free({x:3,y:2}),false,'investigating creatures occupy real cells')
  assert.deepEqual(live.roomsVisited,['1']);assert.deepEqual(live.encountersTriggered,[])
  const saved=structuredClone(live)
  await call('replace_game_state',{gameState:saved})
  assert.deepEqual(encounterAwareness(gs.getState()),encounterAwareness(saved))
  assert.equal((await react({response:'investigate',moves:[{monsterIndex:0,roomId:'1'}]})).code,'ENCOUNTER_REACTION_ALREADY_USED')
})

test('investigation is atomic on invalid choices/budget and cannot downgrade to remove occupied positions',async t=>{
  const {react}=fixture(t)
  await react({response:'alert'});let state=gs.getState();state.playerActionRevision=2;state.sceneMemory.doorStates={gate:'open'}
  const saved=structuredClone(state)
  assert.equal((await react({response:'investigate',moves:[{monsterIndex:1,roomId:'1'}]})).code,'MONSTER_SELECTION_REQUIRED')
  assert.deepEqual(gs.getState(),saved)
  assert.equal((await react({response:'investigate',moves:[{monsterIndex:0}]})).code,'INVALID_DESTINATION')
  await react({response:'investigate',moves:[{monsterIndex:0,toCell:{x:2,y:2}}]})
  state=gs.getState();state.playerActionRevision=3
  assert.equal((await react({response:'alert'})).code,'ENCOUNTER_ALREADY_INVESTIGATING')
  assert.equal(pendingEncounterActors(gs.getState()).length,1)
})

test('investigating movement enforces creature speed and requires explicit partial progress',async t=>{
  const {react,data}=fixture(t)
  data.encounters.watch.monsters[0].monsterType='awakened_shrub'
  await react({response:'alert'});let state=gs.getState();state.playerActionRevision=2;state.sceneMemory.doorStates={gate:'open'}
  const saved=structuredClone(state)
  const refused=await react({response:'investigate',moves:[{monsterIndex:0,toCell:{x:0,y:4}}]})
  assert.equal(refused.code,'MOVEMENT_EXCEEDED');assert.deepEqual(gs.getState(),saved)
  const partial=await react({response:'investigate',moves:[{monsterIndex:0,toCell:{x:0,y:4},allowPartial:true}]})
  assert.equal(partial.results[0].stopReason,'movement_budget');assert.equal(partial.results[0].costCells,4)
})

test('starting an investigating encounter preserves creature positions and player room/position without respawning the original staging',async t=>{
  const {react,call}=fixture(t)
  await react({response:'alert'});let state=gs.getState();state.playerActionRevision=2;state.sceneMemory.doorStates={gate:'open'}
  await react({response:'investigate',moves:[{monsterIndex:0,toCell:{x:2,y:2}}]})
  const started=await call('start_encounter',{encounterId:'watch'})
  assert.equal(started.spawnedMonsters.length,1);assert.deepEqual(started.spawnedMonsters[0].position,{x:2,y:2})
  assert.equal(started.movedPlayer,null);assert.equal(gs.getState().currentRoomId,'1');assert.deepEqual(gs.getState().player.position,{x:1,y:2})
  assert.deepEqual(pendingEncounterActors(gs.getState()),[])
  assert.equal((await react({response:'alert'})).code,'ENCOUNTER_ALREADY_RESOLVED')
})

test('reinforcements join existing combat explicitly without replacing initiative, current turn or spent resources',async t=>{
  const {react}=fixture(t)
  await react({response:'alert'});let state=gs.getState();state.playerActionRevision=2;state.sceneMemory.doorStates={gate:'open'}
  await react({response:'investigate',moves:[{monsterIndex:0,toCell:{x:3,y:2}}]})
  state=gs.getState();state.playerActionRevision=3;state.phase='combat';state.round=2;state.currentTurn='player';state.initiativeOrder=['player']
  state.actionUsed.player=true;state.movementUsed.player=2
  const result=await react({response:'join_combat'})
  assert.ok(result.results[0].joinedCombat.length===1)
  assert.equal(state.currentTurn,'player');assert.equal(state.initiativeOrder[0],'player');assert.equal(state.initiativeOrder.length,2)
  assert.equal(state.actionUsed.player,true);assert.equal(state.movementUsed.player,2)
  assert.deepEqual(Object.values(state.monsters)[0].position,{x:3,y:2})
})

test('noise reactions reject missing resolved actions, distant sources, other maps and unrequested movement',async t=>{
  const {react,state}=fixture(t)
  state.playerActionRevision=0;assert.equal((await react({response:'alert'})).code,'RESOLVED_ACTION_REQUIRED')
  gs.getState().playerActionRevision=1
  assert.equal((await react({response:'alert',encounterId:'remote'})).code,'NOISE_SOURCE_OUT_OF_SCOPE')
  assert.equal((await react({response:'alert',sourceRoomId:'4'})).code,'NOISE_SOURCE_OUT_OF_SCOPE')
  assert.equal((await react({response:'alert',moves:[{monsterIndex:0,roomId:'1'}]})).code,'EXPLICIT_MOVES_REQUIRED')
  assert.deepEqual(gs.getState().sceneMemory,undefined)
})
