const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace}=require('./helpers/mcp-toolkit.cjs')
const {getAdventureMap,getMapSpec,evaluateMapQuest}=require('../mcp-server/dist/lib/adventure-map.js')
const {dungeonContent}=require('../mcp-server/dist/adventures/generated-dungeon/map.js')
const {navigationGrid}=require('../mcp-server/dist/lib/navigation.js')

async function install(call,id='side-passage',delivery='clue'){
  const state=await call('get_game_state'),layout=ok(await call('generate_dungeon',{seed:'campaign-link',width:3,height:3,count:5})).layout
  const input={dungeonId:id,layout,entranceCell:state.player.position,questLink:{goal:'Retrouver la personne recherchée.',lead:'Une piste mène au témoin déjà recherché dans la quête.',delivery,discoveryDc:15}}
  return {input,result:ok(await call('install_dungeon',input)),origin:state}
}
async function go(call,roomId){
  const s=await call('get_game_state'),events=getAdventureMap(s).rooms.flatMap(r=>r.navigationEvent?[r.navigationEvent.id]:[])
  return ok(await call('move_token',{tokenId:'player',roomId,acknowledgeEventIds:events}))
}

test('installed dungeon adds map, real collision, reciprocal campaign passages and a mandatory quest lead without moving the player',async t=>{
  const call=await engine(t),{input,result,origin}=await install(call)
  let s=await call('get_game_state')
  assert.equal(s.adventureId,origin.adventureId);assert.equal(s.characterId,origin.characterId);assert.equal(s.currentMapId,origin.currentMapId)
  assert.deepEqual(s.player.position,origin.player.position)
  assert.equal(getAdventureMap(origin.adventureId).maps.some(m=>m.id===result.mapId),false,'session overlay never mutates base registry')
  assert.equal(ok(await call('install_dungeon',input)).alreadyInstalled,true)
  assert.equal((await call('install_dungeon',{...input,questLink:{...input.questLink,goal:'Autre objectif.'}})).code,'DUNGEON_ID_CONFLICT')
  ok(await call('travel_to_map',{transitionId:result.entryTransitionId}))
  s=await call('get_game_state');assert.equal(s.currentMapId,result.mapId)
  const map=getMapSpec(s.currentMapId,s),grid=navigationGrid(s,'player',map.geometry)
  assert.equal(map.grid.cols,21);assert.equal(grid.free(map.geometry.blockedCells[0],false),false)
  const before=s
  assert.ok((await call('move_token',{tokenId:'player',toCell:map.geometry.blockedCells[0]})).error)
  assert.deepEqual(await call('get_game_state'),before)
  assert.equal((await call('discover_dungeon_lead',{dungeonId:input.dungeonId,action:'search'})).code,'SCENE_TARGET_OUT_OF_REACH')
  assert.equal(s.worldFacts.some(f=>f.clueId===`dungeon:${input.dungeonId}:lead`),false)
})

test('clue failure discloses no lead; success survives return/reentry/save without completing a parent objective',async t=>{
  const call=await engine(t,{dice:'1,20,19'}),{input,result,origin}=await install(call)
  ok(await call('travel_to_map',{transitionId:result.entryTransitionId}))
  await go(call,result.objectiveRoomId)
  const failed=ok(await call('discover_dungeon_lead',{dungeonId:input.dungeonId,action:'search'}))
  assert.equal(failed.success,false);assert.equal(failed.questLink,undefined)
  let s=await call('get_game_state');assert.equal(s.dmTools.dungeons[input.dungeonId].discovered,false)
  const parentBefore=evaluateMapQuest(origin,origin.currentMapId,origin)
  const found=ok(await call('discover_dungeon_lead',{dungeonId:input.dungeonId,action:'search'}))
  assert.equal(found.worldFact.text,input.questLink.lead)
  s=await call('get_game_state');assert.equal(evaluateMapQuest(s,s.currentMapId,s).allDone,true)
  assert.deepEqual(evaluateMapQuest(s,origin.currentMapId,s),parentBefore)
  const c=dungeonContent(s.dmTools.dungeons[input.dungeonId])
  await go(call,c.rooms[0].id)
  ok(await call('travel_to_map',{transitionId:result.exitTransitionId}))
  s=await call('get_game_state');assert.equal(s.currentMapId,origin.currentMapId);assert.deepEqual(s.player.position,origin.player.position)
  assert.equal(s.adventureId,origin.adventureId);assert.deepEqual(s.player.spellSlots,origin.player.spellSlots)
  ok(await call('replace_game_state',{gameState:s}))
  ok(await call('travel_to_map',{transitionId:result.entryTransitionId}))
  await go(call,result.objectiveRoomId)
  assert.equal(ok(await call('discover_dungeon_lead',{dungeonId:input.dungeonId,action:'search'})).alreadyDiscovered,true)
  assert.equal((await call('get_game_state')).worldFacts.filter(f=>f.clueId===found.worldFact.clueId).length,1)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('guide delivery requires actual local NPC contact and records a quest hint, not a new main quest',async t=>{
  const call=await engine(t),{input,result}=await install(call,'witness-passage','npc')
  ok(await call('travel_to_map',{transitionId:result.entryTransitionId}))
  await go(call,result.objectiveRoomId)
  assert.equal((await call('discover_dungeon_lead',{dungeonId:input.dungeonId,action:'search'})).code,'DUNGEON_DELIVERY_MISMATCH')
  const found=ok(await call('discover_dungeon_lead',{dungeonId:input.dungeonId,action:'talk'}))
  assert.equal(found.worldFact.basis,'ai_interpretation');assert.equal(found.worldFact.text,input.questLink.lead)
})

test('dungeon encounters use dynamic IDs, source statistics and persist across campaign round-trips',async t=>{
  const call=await engine(t,{dice:'20,1'}),{result}=await install(call)
  ok(await call('travel_to_map',{transitionId:result.entryTransitionId}))
  const s=await call('get_game_state'),preset=getAdventureMap(s).encounters[result.encounters[0]]
  assert.ok(preset)
  await go(call,preset.roomId)
  const started=ok(await call('start_encounter',{encounterId:preset.id}))
  const combat=await call('get_game_state');assert.equal(combat.phase,'combat')
  assert.ok(Object.values(combat.monsters).some(m=>m.type===preset.monsters[0].monsterType&&m.srd?.ruleset==='2014'))
  assert.equal((await call('travel_to_map',{transitionId:result.exitTransitionId})).code,'TRAVEL_DURING_COMBAT')
  ok(await call('end_combat',{force:true,reason:'Trêve explicitement établie par le MJ.'}))
  const after=await call('get_game_state'),entry=dungeonContent(Object.values(after.dmTools.dungeons)[0]).rooms[0].id
  await go(call,entry)
  ok(await call('travel_to_map',{transitionId:result.exitTransitionId}))
  const outside=await call('get_game_state');ok(await call('replace_game_state',{gameState:outside}))
  ok(await call('travel_to_map',{transitionId:result.entryTransitionId}))
  assert.deepEqual((await call('get_game_state')).monsters,after.monsters)
})

test('installation rejects missing parent targets, invalid topology and unrelated session changes before mutation',async t=>{
  const call=await engine(t),{input}=await install(call)
  const before=await call('get_game_state')
  assert.equal((await call('install_dungeon',{...input,dungeonId:'bad-quest',questLink:{...input.questLink,targetMapId:'unknown',objectiveId:'fake'}})).code,'DUNGEON_QUEST_TARGET_INVALID')
  const broken=structuredClone(input.layout);broken.tiles[0].exits=0
  assert.ok((await call('install_dungeon',{...input,dungeonId:'bad-map',layout:broken})).error)
  assert.deepEqual(await call('get_game_state'),before)
  const separate=await engine(t);assert.equal((await separate('get_game_state')).dmTools.dungeons,undefined)
})

test('all procedural stencil floors stay connected across varied seeds and dimensions, including the maximum grid',async t=>{
  const call=await engine(t),base=await call('get_game_state')
  const {generate}=require('../public/dungeon-tiles/layout.js'),manifest=require('../public/dungeon-tiles/manifest.json')
  const {findNavigationPath}=require('../mcp-server/dist/lib/navigation.js')
  for(let n=0;n<14;n++){
    const width=n===13?12:3+n%4,height=n===13?12:3+(n*3)%4,count=n===13?144:5+n%10
    const layout=generate(manifest,{seed:`geometry-${n}`,width,height,count:Math.min(count,width*height)})
    const instance={id:'geometry-test',layout,origin:{mapId:base.currentMapId,roomId:base.currentRoomId,cell:base.player.position},
      questLink:{goal:'Retrouver un témoin.',lead:'Une piste établie.',delivery:'clue',discoveryDc:10},discovered:false,creation:'fixture'}
    const c=dungeonContent(instance),s=structuredClone(base)
    s.dmTools.dungeons={[instance.id]:instance};s.currentMapId=c.map.id;s.currentRoomId=c.rooms[0].id;s.player.position=c.startCell
    const path=findNavigationPath(s,'player',{kind:'room',roomId:c.objectiveRoomId},{geometry:c.map.geometry})
    assert.ok(path.length>1)
    assert.deepEqual(path.at(-1),c.goalCell)
  }
})
