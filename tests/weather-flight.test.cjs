const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
const {getMapSpec,inferRoomIdOnMap}=require('../mcp-server/dist/lib/adventure-map.js')
const {navigationGrid}=require('../mcp-server/dist/lib/navigation.js')
const source='Hauteur réelle au-dessus du sol et surface portante constatées explicitement par le MJ ; aucune déduction du texte joueur.'
async function wind(call,extra={}){const state=await call('get_game_state');return ok(await call('configure_weather',{eventId:'actual-wind',roomId:state.currentRoomId,temperatureF:65,strongWind:true,precipitation:'none',sandstorm:false,fog:'none',source,...extra}))}
async function fact(call,id){await replace(call,state=>{state.worldFacts??=[];state.worldFacts.push({id,text:source,source:'Observation MJ',mapId:state.currentMapId,expires:'never'})})}
function destination(state,id){const grid=navigationGrid(state,id,getMapSpec(state.currentMapId,state).geometry,{movementMode:'fly'}),from=state.monsters[id].position;const cell=grid.neighbors(from).find(cell=>grid.step(from,cell)&&inferRoomIdOnMap(cell,state.currentMapId,state)===state.currentRoomId);assert.ok(cell);return cell}
async function refused(call,name,args,code){const before=await call('get_game_state'),response=await call(name,args);assert.equal(response.code,code,JSON.stringify(response));assert.deepEqual(await call('get_game_state'),before)}
async function hydrate(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state)}

test('a native fly stat alone does not invent actual flight or a wind fall',async t=>{
 const call=await engine(t,{dice:'19'}),actor=await spawn(call,'ghost');await wind(call);await battle(call,[actor.id],actor.id)
 ok(await call('next_turn',{actorId:actor.id,skipAction:true}));const state=await call('get_game_state');assert.equal(state.currentTurn,'player');assert.equal(state.dmTools.weather.flights[actor.id],undefined);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a committed fly movement records actual unknown height; wind then retains the turn budget until a real measured and paid landing',async t=>{
 const call=await engine(t,{dice:'19'}),actor=await spawn(call,'ghost');await replace(call,state=>state.monsters[actor.id].hostile=false);await battle(call,[actor.id],actor.id)
 const before=await call('get_game_state');ok(await call('move_token',{tokenId:actor.id,toCell:destination(before,actor.id),movementMode:'fly'}));let state=await call('get_game_state')
 assert.equal(state.dmTools.weather.flights[actor.id].airborne,true);assert.equal(state.dmTools.weather.flights[actor.id].heightFeet,null);await wind(call);await hydrate(call)
 await refused(call,'next_turn',{actorId:actor.id,skipAction:true},'WEATHER_FLIGHT_LANDING_REQUIRED');await refused(call,'move_token',{tokenId:actor.id,toCell:destination(state,actor.id),movementMode:'fly'},'WEATHER_FLIGHT_HEIGHT_REQUIRED')
 await fact(call,'real-height');await fact(call,'real-surface');ok(await call('record_flight_height',{eventId:'height-observation',entityId:actor.id,heightFeet:20,factId:'real-height',source}))
 await refused(call,'record_flight_height',{eventId:'fake-height-reset',entityId:actor.id,heightFeet:1,factId:'real-height',source},'WEATHER_FLIGHT_OBSERVATION_CONFLICT')
 const beforeLanding=await call('get_game_state'),movementBefore=beforeLanding.movementUsed[actor.id],landed=ok(await call('move_vertical_flight',{eventId:'actual-land',entityId:actor.id,toHeightFeet:0,surfaceFactId:'real-surface',source}));assert.equal(landed.costFeet,20);assert.equal(landed.costCells,4)
 state=await call('get_game_state');assert.equal(state.movementUsed[actor.id],movementBefore+4);assert.equal(state.dmTools.weather.flights[actor.id].airborne,false);assert.deepEqual(state.monsters[actor.id].position,beforeLanding.monsters[actor.id].position)
 assert.equal(ok(await call('move_vertical_flight',{eventId:'actual-land',entityId:actor.id,toHeightFeet:0,surfaceFactId:'real-surface',source})).replayed,true);await hydrate(call);ok(await call('next_turn',{actorId:actor.id,skipAction:true}));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('landing cannot borrow next-turn movement and an explicit true fall alone clears its real flight without spending movement',async t=>{
 const call=await engine(t,{dice:'5,5,19'}),actor=await spawn(call,'ghost');await replace(call,state=>state.monsters[actor.id].hostile=false);await fact(call,'real-height');await fact(call,'real-surface')
 ok(await call('record_flight_height',{eventId:'actual-high-flight',entityId:actor.id,heightFeet:20,factId:'real-height',source}));await wind(call);await battle(call,[actor.id],actor.id);await replace(call,state=>state.movementUsed[actor.id]=8)
 await refused(call,'move_vertical_flight',{eventId:'no-free-land',entityId:actor.id,toHeightFeet:0,surfaceFactId:'real-surface',source},'MOVEMENT_EXCEEDED');await refused(call,'resolve_fall',{eventId:'false-short-fall',entityId:actor.id,distanceFeet:5,reason:source},'WEATHER_FALL_HEIGHT_MISMATCH')
 const fallen=ok(await call('resolve_fall',{eventId:'actual-fall',entityId:actor.id,distanceFeet:20,reason:source}));assert.equal(fallen.diceCount,2);const state=await call('get_game_state');assert.equal(state.dmTools.weather.flights[actor.id].heightFeet,0);assert.equal(state.movementUsed[actor.id],8);await hydrate(call);ok(await call('next_turn',{actorId:actor.id,skipAction:true}));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
