const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,addSupply}=require('./helpers/mcp-toolkit.cjs')
async function weather(call,extra={}){const state=await call('get_game_state');call.weatherSequence=(call.weatherSequence??0)+1;return ok(await call('configure_weather',{
 eventId:`physical-weather-${call.weatherSequence}`,roomId:state.currentRoomId,temperatureF:65,strongWind:false,precipitation:'none',sandstorm:false,fog:'none',source:'Vrai vent ou précipitations établis dans cette zone physique.',...extra}))}
async function hydrate(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,args,code){const state=await call('get_game_state'),result=await call(name,args);assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await call('get_game_state'),state)}
async function freeHand(call){const state=await call('get_game_state'),main=state.dmTools?.loadout?.mainHandId??state.player.inventory.find(item=>item.type==='weapon')?.id;if(main)ok(await call('equip_item',{itemId:main,slot:'main_hand',operation:'unequip'}))}
async function held(call,kind,id=kind){await addSupply(call,kind,id);await freeHand(call);ok(await call('equip_item',{itemId:id,slot:'main_hand',operation:'equip'}));return id}
async function fueled(call,kind,id=kind){await held(call,kind,id);if(!['torch','candle'].includes(kind)){await addSupply(call,'oil_flask',`${id}-oil`);ok(await call('manage_light_source',{itemId:id,operation:'refuel',fuelItemId:`${id}-oil`}))}return id}
async function light(call,kind,id=kind){return ok(await call('manage_light_source',{itemId:id,operation:'light',...(kind==='bullseye_lantern'?{direction:{x:1,y:0}}:{})}))}
async function fact(call,description){const state=await call('get_game_state');return ok(await call('record_scene_fact',{description,cell:state.player.position})).worldFact.id}

test('strong wind extinguishes a real exposed torch at the actual clock, preserves fuel and magical Light, and relighting never refills it',async t=>{
 const call=await engine(t,{characterId:'cleric',dice:'19'});await freeHand(call);ok(await call('equip_item',{itemId:'holy_symbol',slot:'main_hand',operation:'equip'}));const lightObject=await require('./helpers/light-spell-fixture.cjs').prepareLightObject(call);ok(await call('cast_spell',{spellId:'light',lightObject:lightObject.selection,focusItemId:'holy_symbol'}))
 const id=await fueled(call,'torch','actual-wind-torch');await light(call,'torch',id);ok(await call('advance_time',{seconds:37}))
 const before=await call('get_game_state'),magic=before.hero.effects.find(effect=>effect.kind==='light');assert.ok(magic)
 const wind=await weather(call,{strongWind:true});assert.ok(wind.extinguished.includes(id))
 let state=await hydrate(call);assert.equal(state.dmTools.lighting.sources[id].litAt,undefined);assert.equal(state.dmTools.lighting.sources[id].remainingSeconds,3563)
 assert.deepEqual(state.hero.effects.find(effect=>effect.id===magic.id),magic)
 const relit=await light(call,'torch',id);assert.equal(relit.lit,false);assert.ok(relit.extinguishedByWeather.includes(id));assert.equal(relit.remainingSeconds,3563)
 state=await hydrate(call);assert.ok(state.hero.effects.some(effect=>effect.id===magic.id));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('heavy snowfall leaves an exposed candle burning; actual heavy rain extinguishes it without changing its identity or remaining fuel history',async t=>{
 const call=await engine(t,{dice:'19'}),id=await fueled(call,'candle','actual-candle');await light(call,'candle',id)
 await weather(call,{precipitation:'heavy_snow'});let state=await hydrate(call);assert.equal(state.dmTools.lighting.sources[id].litAt,0)
 ok(await call('advance_time',{seconds:11}));await weather(call,{precipitation:'heavy_rain'});state=await hydrate(call)
 assert.equal(state.dmTools.lighting.sources[id].litAt,undefined);assert.equal(state.dmTools.lighting.sources[id].remainingSeconds,3589)
 assert.equal(state.player.inventory.some(item=>item.id===id),true);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('actually held closed lanterns survive wind and rain; a narrative item name cannot reclassify canonical protection',async t=>{
 for(const kind of ['hooded_lantern','bullseye_lantern'])await t.test(kind,async t=>{
  const call=await engine(t,{dice:'19'}),id=await fueled(call,kind,`actual-${kind}`);await light(call,kind,id)
  await weather(call,{strongWind:true,precipitation:'heavy_rain'});const state=await hydrate(call)
  assert.equal(state.dmTools.loadout.mainHandId,id);assert.equal(state.dmTools.lighting.sources[id].litAt,0)
  const source=await fact(call,'Le MJ constate un fait de matériel réellement présent, sans modifier son profil canonique.')
  await refused(call,'set_light_weather_protection',{eventId:'no-canonical-rewrite',itemId:id,protection:'open',factId:source,source:'Une assertion ne retire pas les parois de la lanterne.'},'LIGHT_WEATHER_LAMP_REQUIRED')
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
 })
})

test('only an actually burning exposed ambiguous lamp blocks weather before mutation; a real instance fact resolves it and old receipts never re-protect it',async t=>{
 const call=await engine(t,{dice:'19'}),id=await fueled(call,'lamp','actual-ambiguous-lamp');await light(call,'lamp',id)
 const state=await call('get_game_state'),input={eventId:'actual-incoming-wind',roomId:state.currentRoomId,temperatureF:65,strongWind:true,precipitation:'none',sandstorm:false,fog:'none',source:'Vrai vent fort dans cette zone.'}
 await refused(call,'configure_weather',input,'WEATHER_LAMP_PROTECTION_REQUIRED')
 await refused(call,'set_light_weather_protection',{eventId:'invented-cover',itemId:id,protection:'enclosed',factId:'missing-fact',source:'Aucune source réelle n’est fournie.'},'LIGHT_WEATHER_SOURCE_FACT_REQUIRED')
 const closedFact=await fact(call,'Le globe de verre réel de cette lampe est en place et fermé.'),closed={eventId:'actual-closed-globe',itemId:id,protection:'enclosed',factId:closedFact,source:'Globe réel observé, pas un nom d’objet.'}
 ok(await call('set_light_weather_protection',closed));ok(await call('configure_weather',input));let saved=await hydrate(call);assert.equal(saved.dmTools.lighting.sources[id].litAt,0)
 ok(await call('advance_time',{seconds:13}));const openFact=await fact(call,'Le globe réel de cette même lampe a été retiré ; la flamme est maintenant ouverte.')
 const opened=ok(await call('set_light_weather_protection',{eventId:'actual-open-globe',itemId:id,protection:'open',factId:openFact,source:'Retrait physique réellement établi.'}));assert.ok(opened.extinguished.includes(id))
 saved=await hydrate(call);assert.equal(saved.dmTools.lighting.sources[id].litAt,undefined);assert.equal(saved.dmTools.lighting.sources[id].remainingSeconds,21587)
 assert.equal(ok(await call('set_light_weather_protection',closed)).replayed,true);assert.deepEqual(await call('get_game_state'),saved)
 await refused(call,'set_light_weather_protection',{...closed,protection:'open'},'LIGHT_WEATHER_PROTECTION_CONFLICT')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('packed/unlit lamps do not prevent real weather, while a selected attempt to light an ambiguous exposed lamp refuses before combat cost',async t=>{
 const call=await engine(t,{dice:'19'});await addSupply(call,'lamp','unused-packed-lamp');await weather(call,{strongWind:true})
 const id=await fueled(call,'lamp','selected-lamp'),before=await call('get_game_state')
 await refused(call,'manage_light_source',{itemId:id,operation:'light'},'WEATHER_LAMP_PROTECTION_REQUIRED')
 assert.equal((await call('get_game_state')).hero.actionCredits,before.hero.actionCredits)
 assert.equal((await call('get_game_state')).dmTools.lighting.sources[id].remainingSeconds,21600)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a genuinely burning legacy torch is extinguished into one persisted remaining-fuel witness without a fresh hour on retry',async t=>{
 const call=await engine(t,{dice:'19'}),id=await held(call,'torch','legacy-exposed-torch')
 await replace(call,state=>state.hero.effects.push({id:'actual-legacy-torch-effect',kind:'burning-torch',sourceId:'player',targetIds:['player'],expiresAt:3600,concentration:false,data:{itemId:id}}))
 ok(await call('advance_time',{seconds:100}));await weather(call,{strongWind:true})
 let state=await hydrate(call);assert.equal(state.dmTools.lighting.sources[id].remainingSeconds,3500);assert.equal(state.dmTools.lighting.sources[id].litAt,undefined);assert.equal(state.dmTools.itemUses[id],0)
 assert.equal(state.hero.effects.some(effect=>effect.id==='actual-legacy-torch-effect'),false)
 await light(call,'torch',id);state=await hydrate(call);assert.equal(state.dmTools.lighting.sources[id].remainingSeconds,3500);assert.equal(state.dmTools.lighting.sources[id].litAt,undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an attack flame plan freezes actual crossed weather, commits only after a real transfer, and cannot extinguish a new same-time flame on replay',async t=>{
 const call=await engine(t,{dice:'19'}),id=await fueled(call,'torch','actually-thrown-torch');await light(call,'torch',id)
 await weather(call,{roomId:'2',precipitation:'heavy_rain'})
 const gs=require('../mcp-server/dist/mcp-server/game-state.js'),{captureWeatherThrownFlame,commitWeatherThrownFlame}=require('../mcp-server/dist/mcp-server/weather-flames.js')
 const {configureWeather}=require('../mcp-server/dist/mcp-server/weather.js'),{manageLightSource}=require('../mcp-server/dist/mcp-server/lighting.js')
 const initial=await call('get_game_state');initial.player.position={x:9,y:4};initial.currentRoomId='1';gs.replaceState(initial)
 const plan=captureWeatherThrownFlame(id,[{x:9,y:4},{x:10,y:4},{x:11,y:4}],initial.currentMapId,'actual-fixture-attack-event')
 assert.equal(plan.extinguish,true);assert.equal(plan.weather.length,1);assert.equal(gs.getState().dmTools.lighting.sources[id].litAt,0)
 assert.throws(()=>commitWeatherThrownFlame(plan),error=>error.code==='WEATHER_FLAME_TRANSFER_REQUIRED')
 configureWeather({eventId:'weather-after-observed-attack-path',roomId:'2',temperatureF:65,strongWind:false,precipitation:'none',sandstorm:false,fog:'none',source:'État physique ultérieur ; le plan ne relit pas rétroactivement ce contexte.'})
 const transferred=structuredClone(gs.getState()),item=transferred.player.inventory.find(item=>item.id===id);transferred.player.inventory=transferred.player.inventory.filter(item=>item.id!==id);delete transferred.dmTools.loadout.mainHandId
 transferred.droppedItems??={};transferred.droppedItems[id]={item,mapId:initial.currentMapId,roomId:'2',position:{x:11,y:4}};gs.replaceState(transferred)
 const committed=commitWeatherThrownFlame(plan);assert.equal(committed.extinguished,true);assert.equal(gs.getState().dmTools.lighting.sources[id].litAt,undefined)
 const reachable=structuredClone(gs.getState());reachable.player.position={x:10,y:4};reachable.currentRoomId='2';gs.replaceState(reachable)
 manageLightSource(id,'light');assert.equal(gs.getState().dmTools.lighting.sources[id].litAt,0)
 assert.equal(commitWeatherThrownFlame(plan).replayed,true);assert.equal(gs.getState().dmTools.lighting.sources[id].litAt,0)
 const final=structuredClone(gs.getState());gs.replaceState(final);assert.deepEqual(gs.getState().dmTools.lighting.weatherExtinctions,final.dmTools.lighting.weatherExtinctions)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
