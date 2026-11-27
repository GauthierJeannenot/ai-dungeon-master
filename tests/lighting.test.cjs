const test=require('node:test'),assert=require('node:assert/strict')
const{prepareLightObject}=require('./helpers/light-spell-fixture.cjs')
const {engine,ok,replace,addSupply,spawn,battle,grid}=require('./helpers/mcp-toolkit.cjs')
const {getAdventureMap,getMapSpec}=require('../mcp-server/dist/lib/adventure-map.js')
const {lightingRay}=require('../mcp-server/dist/lib/lighting.js')
const {playerSeesCell}=require('../mcp-server/dist/lib/scene-perception.js')

async function darkMap(call){
  const state=await call('get_game_state')
  for(const room of getAdventureMap(state).rooms.filter(r=>(r.mapId??getMapSpec(undefined,state).id)===state.currentMapId))
    ok(await call('configure_scene_lighting',{roomId:room.id,illumination:'darkness'}))
}
async function held(call,id='light-torch',kind='torch'){
  await addSupply(call,kind,id)
  const state=await call('get_game_state'),weapon=state.dmTools.loadout?.mainHandId??state.player.inventory.find(i=>i.type==='weapon').id
  if(weapon)ok(await call('equip_item',{itemId:weapon,slot:'main_hand',operation:'unequip'}))
  ok(await call('equip_item',{itemId:id,slot:'main_hand',operation:'equip'}))
  return id
}
const inspect=async(call,extra={})=>ok(await call('inspect_lighting',{cell:(await call('get_game_state')).player.position,...extra}))

test('historical rooms remain bright until explicitly configured; an inspection is pure and reveals no discoveries',async t=>{
  const call=await engine(t),before=await call('get_game_state')
  assert.equal((await inspect(call)).illumination,'bright')
  assert.deepEqual(await call('get_game_state'),before)
  ok(await call('configure_scene_lighting',{roomId:before.currentRoomId,illumination:'darkness'}))
  const perception=await inspect(call)
  assert.equal(perception.canSee,false);assert.equal(perception.darkvisionRangeFeet,0)
  assert.equal(playerSeesCell(await call('get_game_state'),before.player.position),false)
})

test('ordinary darkness automatically fails visual Perception without consuming dice, while dim light rolls with disadvantage',async t=>{
  const call=await engine(t,{dice:'19,2,17'}),before=await call('get_game_state')
  ok(await call('configure_scene_lighting',{roomId:before.currentRoomId,illumination:'darkness'}))
  const failed=ok(await call('resolve_visual_perception',{cell:before.player.position,dc:10}))
  assert.equal(failed.automaticFailure,true);assert.equal(failed.success,false)
  ok(await call('configure_scene_lighting',{roomId:before.currentRoomId,illumination:'dim'}))
  const rolled=ok(await call('resolve_visual_perception',{cell:before.player.position,dc:10}))
  assert.equal(rolled.roll.rolls[0],2);assert.match(rolled.roll.detail,/DIS:/)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('darkvision comes from the actual monster source, sees darkness as dim and not as color, and never passes a wall',async t=>{
  const call=await engine(t),goblin=await spawn(call)
  await darkMap(call)
  const seen=await inspect(call,{actorId:goblin.id})
  assert.equal(seen.darkvisionRangeFeet,60);assert.equal(seen.perceivedIllumination,'dim')
  assert.equal(seen.canSee,true);assert.equal(seen.monochrome,true);assert.equal(seen.visualDisadvantage,true)
  const state=await call('get_game_state'),nav=grid(state),map=getMapSpec(state.currentMapId,state)
  let blocked
  for(let y=0;y<map.grid.rows&&!blocked;y++)for(let x=0;x<map.grid.cols&&!blocked;x++)
    if(nav.free({x,y},false)&&!lightingRay(state,goblin.position,{x,y}))blocked={x,y}
  assert.ok(blocked)
  assert.equal((await inspect(call,{actorId:goblin.id,cell:blocked})).canSee,false)
})

test('a torch requires its actual held instance; a source extinguishes and relights without manufacturing fuel, including after hydration',async t=>{
  const call=await engine(t)
  await addSupply(call,'torch','fuel-torch')
  const initial=await call('get_game_state')
  assert.equal((await call('manage_light_source',{itemId:'fuel-torch',operation:'light'})).code,'LIGHT_MUST_BE_HELD')
  assert.deepEqual(await call('get_game_state'),initial)
  await replace(call,s=>{s.player.inventory=s.player.inventory.filter(i=>i.id!=='fuel-torch')})
  await held(call,'fuel-torch');await darkMap(call)
  ok(await call('use_item',{itemId:'fuel-torch'}))
  assert.equal((await inspect(call)).illumination,'bright')
  ok(await call('advance_time',{seconds:600}))
  assert.equal(ok(await call('manage_light_source',{itemId:'fuel-torch',operation:'extinguish'})).remainingSeconds,3000)
  assert.equal((await inspect(call)).canSee,false)
  const saved=await call('get_game_state');ok(await call('replace_game_state',{gameState:saved}))
  ok(await call('advance_time',{seconds:1800}))
  assert.equal(ok(await call('manage_light_source',{itemId:'fuel-torch',operation:'light'})).remainingSeconds,3000)
  ok(await call('advance_time',{seconds:3000}))
  const expired=await inspect(call,{itemId:'fuel-torch'})
  assert.equal(expired.remainingSeconds,0);assert.equal(expired.lit,false);assert.equal(expired.canSee,false)
  assert.equal((await call('use_item',{itemId:'fuel-torch'})).code,'LIGHT_EXHAUSTED')
})

test('dropping a lit candle preserves its physical light; walls block propagation and packing it stops usable light without pausing fuel',async t=>{
  const call=await engine(t)
  await held(call,'floor-candle','candle');await darkMap(call)
  ok(await call('manage_light_source',{itemId:'floor-candle',operation:'light'}))
  ok(await call('drop_item',{itemId:'floor-candle'}))
  assert.equal((await inspect(call)).illumination,'bright')
  ok(await call('pick_up_item',{itemId:'floor-candle'}))
  assert.equal((await inspect(call)).illumination,'darkness')
  ok(await call('advance_time',{seconds:60}))
  assert.equal((await inspect(call,{itemId:'floor-candle'})).remainingSeconds,3540)
})

test('source torch radii are twenty feet bright plus twenty dim, and never leak through a closed wall',async t=>{
  const call=await engine(t);await held(call);await darkMap(call)
  ok(await call('manage_light_source',{itemId:'light-torch',operation:'light'}))
  const state=await call('get_game_state'),nav=grid(state),map=getMapSpec(state.currentMapId,state)
  let dim,blocked
  for(let y=0;y<map.grid.rows;y++)for(let x=0;x<map.grid.cols;x++){
    const cell={x,y},d=Math.max(Math.abs(x-state.player.position.x),Math.abs(y-state.player.position.y))
    if(!nav.free(cell,false))continue
    if(d>=5&&d<=8&&lightingRay(state,state.player.position,cell))dim??=cell
    if(d<=8&&!lightingRay(state,state.player.position,cell))blocked??=cell
  }
  assert.ok(dim);assert.ok(blocked)
  assert.equal((await inspect(call,{cell:dim})).illumination,'dim')
  assert.equal((await inspect(call,{cell:blocked})).illumination,'darkness')
})

test('ignition spends a real combat action and an invalid second ignition cannot replenish it',async t=>{
  const call=await engine(t);await held(call);const enemy=await spawn(call);await battle(call,[enemy.id])
  ok(await call('manage_light_source',{itemId:'light-torch',operation:'light'}))
  const state=await call('get_game_state');assert.equal(state.hero.actionCredits,0)
  assert.ok((await call('manage_light_source',{itemId:'light-torch',operation:'light'})).error)
  assert.deepEqual(await call('get_game_state'),state)
})

test('the actual Light spell illuminates and expires through its tracked engine effect without adding a physical torch',async t=>{
  const call=await engine(t,{characterId:'cleric'});await darkMap(call)
  ok(await call('equip_item',{itemId:'mace',slot:'main_hand',operation:'unequip'}))
  ok(await call('equip_item',{itemId:'holy_symbol',slot:'main_hand',operation:'equip'}))
  const before=await call('get_game_state')
  assert.equal((await inspect(call)).canSee,false)
  const lightObject=await prepareLightObject(call)
  ok(await call('cast_spell',{spellId:'light',lightObject:lightObject.selection,focusItemId:'holy_symbol'}))
  assert.equal((await inspect(call)).illumination,'bright')
  assert.deepEqual((await call('get_game_state')).player.inventory,before.player.inventory)
  ok(await call('advance_time',{seconds:3600}))
  assert.equal((await inspect(call)).illumination,'darkness')
})

test('an unseen attacker receives actual disadvantage against a source-darkvision observer',async t=>{
  const call=await engine(t,{dice:'19,2'}),enemy=await spawn(call)
  await darkMap(call);await battle(call,[enemy.id])
  const result=ok(await call('resolve_player_attack',{targetId:enemy.id,weaponOrSpell:'longsword'}))
  assert.match(result.attackRoll.detail,/DIS:/);assert.equal(result.attackRoll.rolls[0],2)
})
