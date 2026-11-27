const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,addSupply,spawn,battle,grid}=require('./helpers/mcp-toolkit.cjs')
const {getAdventureMap,getMapSpec}=require('../mcp-server/dist/lib/adventure-map.js')
const {findWeapon}=require('../mcp-server/dist/lib/srd/weapons.js')
const {LightSourceSchema}=require('../mcp-server/dist/lib/lighting-state.js')
const {physicalLightAt,lightingRay}=require('../mcp-server/dist/lib/lighting.js')

const manage=(call,itemId,operation,options={})=>call('manage_light_source',{itemId,operation,...options})
async function inspect(call,itemId,cell){
  return ok(await call('inspect_lighting',{cell:cell??(await call('get_game_state')).player.position,...(itemId?{itemId}:{})}))
}
async function hold(call,kind,id=kind){
  await addSupply(call,kind,id)
  const state=await call('get_game_state'),main=state.dmTools?.loadout
    ? state.dmTools.loadout.mainHandId
    : state.player.inventory.find(item=>item.type==='weapon'&&findWeapon(item.equipmentId??item.id))?.id
  if(main)ok(await call('equip_item',{itemId:main,slot:'main_hand',operation:'unequip'}))
  ok(await call('equip_item',{itemId:id,slot:'main_hand',operation:'equip'}))
  return id
}
async function fill(call,id,oil='oil-one'){
  await addSupply(call,'oil_flask',oil)
  return ok(await manage(call,id,'refuel',{fuelItemId:oil}))
}
async function darkMap(call){
  const state=await call('get_game_state')
  for(const room of getAdventureMap(state).rooms.filter(r=>(r.mapId??getMapSpec(undefined,state).id)===state.currentMapId))
    ok(await call('configure_scene_lighting',{roomId:room.id,illumination:'darkness'}))
}
async function rejectedUnchanged(call,args,code){
  const before=await call('get_game_state'),result=await call('manage_light_source',args)
  if(code)assert.equal(result.code,code,JSON.stringify(result));else assert.ok(result.error)
  assert.deepEqual(await call('get_game_state'),before)
}

test('a new physical lamp/lantern is empty; packed, wrong-fuel and irrelevant-option refusals create no oil or source',async t=>{
  const call=await engine(t,{dice:'17'})
  await addSupply(call,'lamp','packed-lamp')
  await rejectedUnchanged(call,{itemId:'packed-lamp',operation:'refuel',fuelItemId:'absent'},'LIGHT_MUST_BE_HELD')
  for(const kind of ['lamp','hooded_lantern','bullseye_lantern']){
    const id=await hold(call,kind,`empty-${kind}`)
    await rejectedUnchanged(call,{itemId:id,operation:'light',...(kind==='bullseye_lantern'?{direction:{x:1,y:0}}:{})},'LIGHT_EXHAUSTED')
    await rejectedUnchanged(call,{itemId:id,operation:'refuel'},'LIGHT_FUEL_REQUIRED')
    await rejectedUnchanged(call,{itemId:id,operation:'refuel',fuelItemId:'missing'},'LIGHT_FUEL_NOT_FOUND')
    await rejectedUnchanged(call,{itemId:id,operation:'light',fuelItemId:'missing'},'LIGHT_OPTIONS_INVALID')
  }
  await addSupply(call,'torch','wrong-fuel')
  await rejectedUnchanged(call,{itemId:'empty-bullseye_lantern',operation:'refuel',fuelItemId:'wrong-fuel'},'LIGHT_FUEL_NOT_FOUND')
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('one exact owned pint gives six hours once; extinguish, hydration and relighting preserve the real remainder',async t=>{
  const call=await engine(t),id=await hold(call,'hooded_lantern')
  await darkMap(call)
  await addSupply(call,'oil_flask','oil-spare')
  const filled=await fill(call,id)
  assert.equal(filled.remainingSeconds,21600);assert.equal(filled.consumedFuelItemId,'oil-one');assert.equal(filled.lit,false)
  let state=await call('get_game_state')
  assert.ok(!state.player.inventory.some(i=>i.id==='oil-one'));assert.ok(state.player.inventory.some(i=>i.id==='oil-spare'))
  await rejectedUnchanged(call,{itemId:id,operation:'refuel',fuelItemId:'oil-one',discardRemainingFuel:true},'LIGHT_FUEL_NOT_FOUND')
  ok(await manage(call,id,'light'));assert.equal((await inspect(call,id)).illumination,'bright')
  ok(await call('advance_time',{seconds:600}))
  assert.equal(ok(await manage(call,id,'extinguish')).remainingSeconds,21000)
  state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}))
  ok(await call('advance_time',{seconds:1000}))
  assert.equal(ok(await manage(call,id,'light')).remainingSeconds,21000)
  await rejectedUnchanged(call,{itemId:id,operation:'light'},'LIGHT_ALREADY_LIT')
  ok(await call('advance_time',{seconds:21000}))
  const before=await call('get_game_state'),expired=await inspect(call,id)
  assert.equal(expired.remainingSeconds,0);assert.equal(expired.lit,false);assert.equal(expired.illumination,'darkness')
  assert.deepEqual(await call('get_game_state'),before)
  await rejectedUnchanged(call,{itemId:id,operation:'light'},'LIGHT_EXHAUSTED')
  assert.equal(ok(await manage(call,id,'refuel',{fuelItemId:'oil-spare'})).remainingSeconds,21600)
})

test('a refill cannot stack oil, pour into a burning source or manufacture fractional flasks',async t=>{
  const call=await engine(t),id=await hold(call,'lamp')
  await fill(call,id);await addSupply(call,'oil_flask','replacement')
  ok(await manage(call,id,'light'));ok(await call('advance_time',{seconds:60}))
  await rejectedUnchanged(call,{itemId:id,operation:'refuel',fuelItemId:'replacement',discardRemainingFuel:true},'LIGHT_REFUEL_WHILE_LIT')
  ok(await manage(call,id,'extinguish'))
  await rejectedUnchanged(call,{itemId:id,operation:'refuel',fuelItemId:'replacement'},'LIGHT_FUEL_REPLACEMENT_REQUIRED')
  const replaced=ok(await manage(call,id,'refuel',{fuelItemId:'replacement',discardRemainingFuel:true}))
  assert.equal(replaced.remainingSeconds,21600);assert.equal(replaced.lit,false)
  const state=await call('get_game_state')
  assert.ok(!state.player.inventory.some(i=>i.id==='replacement'))
  assert.equal(state.dmTools.lighting.sources[id].remainingSeconds,21600)
  const torch=await hold(call,'torch','not-refillable');await addSupply(call,'oil_flask','unused-oil')
  await rejectedUnchanged(call,{itemId:torch,operation:'refuel',fuelItemId:'unused-oil'},'LIGHT_NOT_REFILLABLE')
})

test('refill uses an actual object interaction; ignition and lowering the hood spend the combat action without refill loopholes',async t=>{
  const call=await engine(t),id=await hold(call,'hooded_lantern')
  await addSupply(call,'oil_flask','combat-oil')
  const enemy=await spawn(call);await battle(call,[enemy.id])
  ok(await manage(call,id,'refuel',{fuelItemId:'combat-oil'}))
  assert.equal((await call('get_game_state')).hero.actionCredits,1)
  ok(await manage(call,id,'light'))
  assert.equal((await call('get_game_state')).hero.actionCredits,0)
  await rejectedUnchanged(call,{itemId:id,operation:'set_hood',hood:'lowered'})
  await replace(call,s=>{s.phase='exploration';s.currentTurn=null})
  await darkMap(call)
  // Start a clean combat turn, without the earlier turn's object-interaction marker.
  await replace(call,s=>{s.hero.effects=s.hero.effects.filter(e=>e.kind!=='object-interaction')})
  await battle(call,[enemy.id])
  ok(await manage(call,id,'set_hood',{hood:'lowered'}))
  assert.equal((await call('get_game_state')).hero.actionCredits,0)
  const low=await inspect(call,id)
  assert.equal(low.hood,'lowered');assert.equal(low.illumination,'dim')
  await rejectedUnchanged(call,{itemId:id,operation:'set_hood',hood:'lowered'},'LIGHT_HOOD_UNCHANGED')
  ok(await manage(call,id,'set_hood',{hood:'raised'}))
  assert.equal((await inspect(call,id)).illumination,'bright')
  assert.equal((await inspect(call,id)).remainingSeconds,21600)
})

test('hooded light and lamp use their distinct sourced radii, including the five-foot lowered hood',async t=>{
  const call=await engine(t),id=await hold(call,'hooded_lantern')
  await fill(call,id);await darkMap(call);ok(await manage(call,id,'light'))
  const normal=(await inspect(call,id)).activeLights.find(source=>source.id===id)
  assert.equal(normal.brightFeet,30);assert.equal(normal.dimAdditionalFeet,30)
  ok(await manage(call,id,'set_hood',{hood:'lowered'}))
  const source=(await inspect(call,id)).activeLights.find(source=>source.id===id)
  assert.equal(source.brightFeet,0);assert.equal(source.dimAdditionalFeet,5)
  assert.equal(physicalLightAt(source,{x:source.cell.x+1,y:source.cell.y}),'dim')
  assert.equal(physicalLightAt(source,{x:source.cell.x+2,y:source.cell.y}),undefined)
  const lamp=await hold(call,'lamp','distinct-lamp');await fill(call,lamp,'lamp-oil');ok(await manage(call,lamp,'light'))
  const lampSource=(await inspect(call,lamp)).activeLights.find(source=>source.id===lamp)
  assert.equal(lampSource.brightFeet,15);assert.equal(lampSource.dimAdditionalFeet,30)
  assert.equal(physicalLightAt(lampSource,{x:lampSource.cell.x+3,y:lampSource.cell.y}),'bright')
  assert.equal(physicalLightAt(lampSource,{x:lampSource.cell.x+9,y:lampSource.cell.y}),'dim')
  assert.equal(physicalLightAt(lampSource,{x:lampSource.cell.x+10,y:lampSource.cell.y}),undefined)
})

test('a refused second interaction cannot consume oil after the action budget is spent, and incapacitation also blocks refilling',async t=>{
  const call=await engine(t),id=await hold(call,'bullseye_lantern')
  await addSupply(call,'oil_flask','protected-oil')
  const enemy=await spawn(call);await battle(call,[enemy.id])
  ok(await manage(call,id,'aim',{direction:{x:1,y:0}}))
  ok(await call('combat_action',{action:'dodge'}))
  await rejectedUnchanged(call,{itemId:id,operation:'refuel',fuelItemId:'protected-oil'})
  assert.ok((await call('get_game_state')).player.inventory.some(i=>i.id==='protected-oil'))
  await replace(call,s=>{s.phase='exploration';s.currentTurn=null;s.player.conditions.push('incapacitated')})
  await rejectedUnchanged(call,{itemId:id,operation:'refuel',fuelItemId:'protected-oil'})
})

test('bullseye requires an explicit cone, preserves it on hydration/movement, and walls block light inside that cone',async t=>{
  const call=await engine(t),id=await hold(call,'bullseye_lantern')
  await fill(call,id);await darkMap(call)
  await replace(call,s=>{s.player.position={x:3,y:5};s.currentRoomId='1'})
  await rejectedUnchanged(call,{itemId:id,operation:'light'},'LIGHT_DIRECTION_REQUIRED')
  await rejectedUnchanged(call,{itemId:id,operation:'light',direction:{x:0,y:0}})
  ok(await manage(call,id,'light',{direction:{x:1,y:0}}))
  assert.equal((await inspect(call,id,{x:7,y:5})).illumination,'bright')
  assert.equal((await inspect(call,id,{x:4,y:7})).illumination,'darkness')
  assert.equal((await inspect(call,id,{x:2,y:5})).illumination,'darkness')
  assert.equal((await inspect(call,id)).illumination,'darkness') // PHB excludes origin unless chosen.
  let state=await call('get_game_state'),map=getMapSpec(state.currentMapId,state),nav=grid(state),blocked
  const beam=(await inspect(call,id)).activeLights.find(source=>source.id===id)
  for(let y=0;y<map.grid.rows;y++)for(let x=0;x<map.grid.cols;x++){
    const cell={x,y}
    if(nav.free(cell,false)&&physicalLightAt(beam,cell)&&!lightingRay(state,beam.cell,cell))blocked??=cell
  }
  assert.ok(blocked,'fixture must contain an opaque wall inside the explicitly aimed cone')
  assert.equal((await inspect(call,id,blocked)).illumination,'darkness')
  ok(await call('advance_time',{seconds:123}))
  state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}))
  await replace(call,s=>{s.player.position={x:4,y:5}})
  assert.deepEqual((await inspect(call,id)).direction,{x:1,y:0})
  ok(await manage(call,id,'aim',{direction:{x:-1,y:0},includeOrigin:true}))
  const aimed=await inspect(call,id)
  assert.deepEqual(aimed.direction,{x:-1,y:0});assert.equal(aimed.remainingSeconds,21477);assert.equal(aimed.illumination,'bright')
  await rejectedUnchanged(call,{itemId:id,operation:'aim',direction:{x:-1,y:0},includeOrigin:true},'LIGHT_DIRECTION_UNCHANGED')
})

test('PHB cone width equals forward distance, with normalized diagonal length and separate bright/dim limits',()=>{
  const beam={id:'cone',cell:{x:0,y:0},brightFeet:60,dimAdditionalFeet:60,direction:{x:1,y:0}}
  assert.equal(physicalLightAt(beam,{x:12,y:6}),'bright')
  assert.equal(physicalLightAt(beam,{x:12,y:7}),undefined)
  assert.equal(physicalLightAt(beam,{x:13,y:0}),'dim')
  assert.equal(physicalLightAt(beam,{x:24,y:12}),'dim')
  assert.equal(physicalLightAt(beam,{x:25,y:0}),undefined)
  assert.equal(physicalLightAt(beam,{x:-1,y:0}),undefined)
  const diagonal={...beam,direction:{x:1,y:1}}
  assert.equal(physicalLightAt(diagonal,{x:8,y:8}),'bright')
  assert.equal(physicalLightAt(diagonal,{x:9,y:9}),'dim')
  assert.equal(physicalLightAt(diagonal,{x:17,y:17}),undefined)
  assert.equal(physicalLightAt(diagonal,{x:12,y:0}),undefined)
})

test('a ground lantern keeps its position; packing or leaving its map never pauses six-hour fuel',async t=>{
  const call=await engine(t),id=await hold(call,'lamp')
  await fill(call,id);await darkMap(call);ok(await manage(call,id,'light'))
  const original=await call('get_game_state')
  ok(await call('drop_item',{itemId:id}))
  assert.equal((await inspect(call,id)).illumination,'bright')
  await replace(call,s=>{s.currentMapId='waterdeep';s.currentRoomId='4';s.player.position={x:0,y:10}})
  ok(await call('advance_time',{seconds:600}))
  assert.ok(!(await inspect(call,id)).activeLights.some(source=>source.id===id))
  assert.equal((await inspect(call,id)).remainingSeconds,21000)
  const farState=await call('get_game_state')
  await rejectedUnchanged(call,{itemId:id,operation:'extinguish'})
  assert.deepEqual((await call('get_game_state')).droppedItems[id],farState.droppedItems[id])
  await replace(call,s=>{s.currentMapId=original.currentMapId;s.currentRoomId=original.currentRoomId;s.player.position=original.player.position})
  assert.equal((await inspect(call,id)).illumination,'bright')
  ok(await call('pick_up_item',{itemId:id}))
  assert.ok(!(await inspect(call,id)).activeLights.some(source=>source.id===id))
  ok(await call('advance_time',{seconds:21000}))
  const saved=await call('get_game_state');ok(await call('replace_game_state',{gameState:saved}))
  assert.equal((await inspect(call,id)).remainingSeconds,0)
  assert.equal((await inspect(call,id)).lit,false)
})

test('saved finite sources retain legacy candles/torches and reject impossible capacities or invented directional profiles',()=>{
  assert.equal(LightSourceSchema.safeParse({itemId:'legacy',kind:'torch',remainingSeconds:3600,litAt:0}).success,true)
  assert.equal(LightSourceSchema.safeParse({itemId:'legacy-candle',kind:'candle',remainingSeconds:30}).success,true)
  for(const source of [
    {itemId:'overfilled',kind:'torch',remainingSeconds:21600},
    {itemId:'overfilled',kind:'lamp',remainingSeconds:21601},
    {itemId:'un-aimed',kind:'bullseye_lantern',remainingSeconds:21600,litAt:0},
    {itemId:'impossible',kind:'lamp',remainingSeconds:21600,hood:'lowered'},
    {itemId:'impossible',kind:'torch',remainingSeconds:3600,direction:{x:1,y:0}},
  ])assert.equal(LightSourceSchema.safeParse(source).success,false,JSON.stringify(source))
})
