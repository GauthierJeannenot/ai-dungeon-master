const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle,addSupply}=require('./helpers/mcp-toolkit.cjs')
const source='Conditions physiques et histoire réellement établies par le MJ depuis sa source, sans inférence du message joueur.'
async function context(call,extra={}){const state=await call('get_game_state');return ok(await call('configure_weather',{eventId:'physical-weather',roomId:state.currentRoomId,temperatureF:0,strongWind:false,precipitation:'none',sandstorm:false,fog:'none',source,...extra}))}
const profile=(extra={})=>({eventId:'actual-exposure',entityId:'player',operation:'begin',exposed:true,breathes:true,altitudeFeet:0,historyKnown:true,knownColdPartialSeconds:0,knownHeatPartialSeconds:0,priorResolvedHeatHours:0,knownAcclimationSeconds:0,source,...extra})
async function exposure(call,extra={}){return ok(await call('record_weather_exposure',profile(extra)))}
async function hydrate(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,args,code){const before=await call('get_game_state'),response=await call(name,args);assert.equal(response.code,code,JSON.stringify(response));assert.deepEqual(await call('get_game_state'),before)}
async function fact(call,id){await replace(call,state=>{state.worldFacts??=[];state.worldFacts.push({id,text:source,source:'Observation physique MJ',mapId:state.currentMapId,expires:'never'})})}

test('weather inspection is read only and exposure history is required before the actual cold clock',async t=>{
 const call=await engine(t,{dice:'19'}),before=await call('get_game_state');const read=ok(await call('inspect_weather'));assert.equal(read.tracked,false);assert.deepEqual(await call('get_game_state'),before)
 await context(call);await refused(call,'advance_time',{seconds:1},'WEATHER_EXPOSURE_HISTORY_REQUIRED')
 await exposure(call);await refused(call,'advance_time',{seconds:3601},'WEATHER_TIME_BOUNDARY');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('cold zero Fahrenheit creates one true DC10 event at its exact hour, explicit failure adds exhaustion once and survives hydration',async t=>{
 const call=await engine(t,{dice:'1,19'});await context(call);await exposure(call)
 ok(await call('advance_time',{seconds:3599}));assert.equal(ok(await call('inspect_weather')).events.length,0)
 ok(await call('advance_time',{seconds:1}));const inspected=ok(await call('inspect_weather')),event=inspected.events[0];assert.equal(event.dc,10);assert.equal(event.at,3600)
 await hydrate(call);await refused(call,'advance_time',{seconds:1},'WEATHER_EVENT_DUE')
 const checked=ok(await call('resolve_weather_event',{eventId:event.eventId}));assert.equal(checked.save.success,false);assert.equal(checked.exhaustionAfter,1)
 assert.equal(ok(await call('resolve_weather_event',{eventId:event.eventId})).replayed,true);await hydrate(call);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('real source adaptation succeeds automatically without consuming a die and updates cannot reset a partial hour',async t=>{
 const call=await engine(t,{dice:'19'});await context(call);await fact(call,'actual-native-cold');await exposure(call,{nativeColdFactId:'actual-native-cold',knownColdPartialSeconds:3599})
 const before=await call('get_game_state');const invalid=await call('record_weather_exposure',{...profile({eventId:'new-initial'}),knownColdPartialSeconds:0});assert.ok(invalid.error);assert.deepEqual(await call('get_game_state'),before)
 ok(await call('advance_time',{seconds:1}));const event=ok(await call('inspect_weather')).events[0],resolved=ok(await call('resolve_weather_event',{eventId:event.eventId}));assert.equal(resolved.automaticSuccess,true);assert.equal(resolved.notRolled,true);assert.equal(resolved.exhaustionAfter,0);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('heat hourly DC advances within the same real episode; weather revision is not a reset, actual cooling is',async t=>{
 const call=await engine(t,{dice:'20,20,20,20,20,20,19'});await context(call,{temperatureF:100});await fact(call,'actual-no-water');await exposure(call,{noOtherWaterAccessFactId:'actual-no-water'})
 for(let hour=1;hour<=2;hour++){ok(await call('advance_time',{seconds:3600}));const event=ok(await call('inspect_weather')).events[0];assert.equal(event.dc,4+hour);ok(await call('resolve_weather_event',{eventId:event.eventId}));if(hour===1)await context(call,{eventId:'same-hot-physical-episode',temperatureF:101})}
 await context(call,{eventId:'real-cooling',temperatureF:65});await context(call,{eventId:'real-hot-again',temperatureF:100});ok(await call('advance_time',{seconds:3600}));const event=ok(await call('inspect_weather')).events[0];assert.equal(event.dc,5);ok(await call('resolve_weather_event',{eventId:event.eventId}));await hydrate(call);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual stable zero-HP living player receives a real CON save, not automatic unconscious failure',async t=>{
 const call=await engine(t,{dice:'20,19'});await replace(call,state=>{state.player.hp.current=0;state.player.conditions.push('unconscious');state.player.deathSaves={successes:3,failures:0,stable:true,dead:false}})
 await context(call);await exposure(call,{knownColdPartialSeconds:3599});ok(await call('advance_time',{seconds:1}));const event=ok(await call('inspect_weather')).events[0]
 const resolved=ok(await call('resolve_weather_event',{eventId:event.eventId}));assert.equal(resolved.save.success,true);assert.equal(resolved.save.roll.rolls[0],20);assert.equal(resolved.cancelledForActualDeath,false);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('an actual NPC stabilized at zero HP receives its real CON save while remaining a living body',async t=>{
 const call=await engine(t,{dice:'20,1,20,19'}),actor=await spawn(call,'commoner');ok(await call('configure_npc_death_saves',{entityId:actor.id,eventId:'actual-npc-exception',reason:source}))
 const before=await call('get_game_state');ok(await call('update_hp',{entityId:actor.id,delta:-before.monsters[actor.id].hp.current,damageType:'force',damageOrigin:'environment',reason:source}));await battle(call,[actor.id]);ok(await call('combat_action',{action:'stabilize',actorId:'player',targetId:actor.id}));ok(await call('end_combat'))
 await context(call);await exposure(call,{exposed:false});await exposure(call,{eventId:'actual-stable-npc-exposure',entityId:actor.id,knownColdPartialSeconds:3599});ok(await call('advance_time',{seconds:1}));const event=ok(await call('inspect_weather')).events[0],resolved=ok(await call('resolve_weather_event',{eventId:event.eventId}))
 assert.equal(resolved.entityId,actor.id);assert.equal(resolved.save.success,true);assert.equal(resolved.save.roll.rolls[0],20);const state=await hydrate(call);assert.equal(state.monsters[actor.id].isAlive,true);assert.equal(state.monsters[actor.id].hp.current,0);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('one already requested round clips at thermal hour, pauses with budgets paid once and resumes remaining five seconds with fixed initiative',async t=>{
 const call=await engine(t,{dice:'20,19'}),npc=await spawn(call);await context(call);await exposure(call,{knownColdPartialSeconds:3599});await exposure(call,{eventId:'actual-npc-exposure',entityId:npc.id,exposed:false})
 await battle(call,[npc.id],npc.id);const before=await call('get_game_state');ok(await call('next_turn',{actorId:npc.id,skipAction:true}));let state=await hydrate(call)
 assert.equal(state.worldTimeSeconds,1);assert.equal(state.currentTurn,null);assert.equal(state.round,2);assert.equal(state.turnCounter,(before.turnCounter??0)+1);assert.equal(state.dmTools.weather.pendingCombatRound.tickEndsAt,6)
 const transplanted=structuredClone(state);transplanted.dmTools.weather.pendingCombatRound.generation++;assert.ok((await call('replace_game_state',{gameState:transplanted})).error);assert.deepEqual(await call('get_game_state'),state)
 const event=ok(await call('inspect_weather')).events[0];const resolved=ok(await call('resolve_weather_event',{eventId:event.eventId}));assert.equal(resolved.resumedCombatTurn,'player');state=await hydrate(call)
 assert.equal(state.worldTimeSeconds,6);assert.equal(state.currentTurn,'player');assert.deepEqual(state.initiativeOrder,before.initiativeOrder);assert.equal(state.dmTools.weather.pendingCombatRound,undefined);assert.equal(state.turnCounter,(before.turnCounter??0)+1);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('only an actually owned worn cold garment exempts; deposit and pickup never silently re-wear it',async t=>{
 const call=await engine(t,{dice:'1,19'});await replace(call,state=>{state.player.inventory.push({id:'actual-cold-coat',name:'Vêtement physique',type:'misc'});state.worldFacts??=[];state.worldFacts.push({id:'actual-garment-fact',subjectItemId:'actual-cold-coat',text:source,source:'Observation physique MJ',mapId:state.currentMapId,expires:'never'})})
 await context(call);ok(await call('wear_weather_clothing',{eventId:'actual-wear',itemId:'actual-cold-coat',operation:'wear',coldWeatherGear:true,heavyClothing:false,physicalGarmentConfirmed:true,factId:'actual-garment-fact',source}));await exposure(call)
 ok(await call('advance_time',{seconds:3600}));let event=ok(await call('inspect_weather')).events[0];assert.equal(ok(await call('resolve_weather_event',{eventId:event.eventId})).automaticSuccess,true)
 ok(await call('drop_item',{itemId:'actual-cold-coat'}));ok(await call('pick_up_item',{itemId:'actual-cold-coat'}));assert.equal((await call('get_game_state')).dmTools.weather.clothing['actual-cold-coat'].worn,false)
 ok(await call('advance_time',{seconds:3600}));event=ok(await call('inspect_weather')).events[0];const result=ok(await call('resolve_weather_event',{eventId:event.eventId}));assert.equal(result.automaticSuccess,false);assert.equal(result.exhaustionAfter,1);await hydrate(call);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual measured drinkable water ends unsafe heat without consumption or invented supplies, its later real emptying starts the next physical episode',async t=>{
 const call=await engine(t,{dice:'20,20,20,20,19'});ok(await call('begin_nutrition_tracking',{eventId:'actual-nutrition',operation:'begin',standardNeedsConfirmed:true,hotWeather:false,foodDebtHalfDays:0,priorDeprivation:'none',source}));await addSupply(call,'waterskin','real-water-skin')
 await context(call,{temperatureF:100});await fact(call,'actual-no-water');await exposure(call,{noOtherWaterAccessFactId:'actual-no-water',knownHeatPartialSeconds:3599})
 ok(await call('advance_time',{seconds:1}));let event=ok(await call('inspect_weather')).events[0];ok(await call('resolve_weather_event',{eventId:event.eventId}))
 ok(await call('register_water_container',{eventId:'real-existing-measured-water',itemId:'real-water-skin',containerType:'waterskin',actualContainerConfirmed:true,contentsQuarterPints:4,dryWeightLb:1,waterWeightLbPerPint:1,source,hazardFactIds:[]}))
 assert.equal(ok(await call('inspect_weather',{entityId:'player'})).waterAccess,'available');assert.equal(ok(await call('inspect_weather',{entityId:'player'})).profile.heatEpisodeHours,0);ok(await call('advance_time',{seconds:3600}));assert.equal(ok(await call('inspect_weather')).events.length,0)
 ok(await call('consume_provisions',{eventId:'actual-drinking',itemId:'real-water-skin',units:1}));ok(await call('advance_time',{seconds:3600}));event=ok(await call('inspect_weather')).events[0];assert.equal(event.dc,5);ok(await call('resolve_weather_event',{eventId:event.eventId}));await hydrate(call);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('thermal held Constitution event persists its original d20 and resumes the exact event after real Bardic inspiration',async t=>{
 const call=await engine(t,{dice:'1,6,19'});await context(call);await exposure(call,{knownColdPartialSeconds:3599});await replace(call,state=>state.hero.inspiration.push({targetId:'player',expiresAt:90000,die:6}));ok(await call('advance_time',{seconds:1}))
 const event=ok(await call('inspect_weather')).events[0],input={eventId:event.eventId},held=ok(await call('resolve_weather_event',input));assert.ok(held.pendingReaction);await hydrate(call);assert.equal(ok(await call('resolve_weather_event',input)).pendingReaction.id,held.pendingReaction.id)
 await refused(call,'advance_time',{seconds:1},'REACTION_PENDING');ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));const resolved=ok(await call('resolve_weather_event',input));assert.equal(resolved.replayed,true);assert.equal(resolved.save.success,true);assert.equal(resolved.exhaustionAfter,0);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a truly fatal thermal hour inside the requested tick precedes a later real stable-body awakening',async t=>{
 const call=await engine(t,{dice:'1,1,1,19'}),helper=await spawn(call,'commoner');await addSupply(call,'healers_kit','actual-healer-kit');const initial=await call('get_game_state')
 ok(await call('update_hp',{entityId:'player',delta:-initial.player.hp.current,damageType:'force',damageOrigin:'environment',reason:source}));ok(await call('use_item',{itemId:'actual-healer-kit',actorId:helper.id,targetId:'player'}));assert.equal(ok(await call('inspect_player_recovery')).recovery.wakeAt,3600)
 ok(await call('add_exhaustion',{eventId:'actual-prior-exhaustion',targetId:'player',levels:5,reason:source}));ok(await call('advance_time',{seconds:3597}));await context(call);await exposure(call,{knownColdPartialSeconds:3599});await exposure(call,{eventId:'helper-sheltered',entityId:helper.id,exposed:false});await battle(call,[helper.id],helper.id)
 ok(await call('next_turn',{actorId:helper.id,skipAction:true}));assert.equal((await call('get_game_state')).worldTimeSeconds,3598);const event=ok(await call('inspect_weather')).events[0];const fatal=ok(await call('resolve_weather_event',{eventId:event.eventId}));assert.equal(fatal.exhaustionAfter,6)
 const state=await hydrate(call);assert.equal(state.worldTimeSeconds,3603);assert.equal(state.player.deathSaves.dead,true);assert.equal(state.player.hp.current,0);assert.equal(state.dmTools.playerRecovery.episode,undefined);assert.equal(state.dmTools.playerRecovery.lastClosed.reason,'death');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('one real24h day can retain48 effective hours and all40 exact forced saves without an arbitrary12h cap',()=>{
 const {TravelStateSchema}=require('../mcp-server/dist/lib/travel-state.js'),saves={}
 for(let hour=9;hour<=48;hour++)saves[hour]={eventId:`forced-march:0:${hour}`,hour,dc:hour+2,at:hour*1800,result:{},exhaustionBefore:0,exhaustionAfter:0}
 const state={version:1,epochAt:0,establishedAt:0,initialKnownWalkingSeconds:0,source,routes:{},days:{0:{index:0,startsAt:0,walkingSeconds:86400,effectiveWalkingSeconds:172800,saves}},receipts:{}}
 assert.equal(TravelStateSchema.parse(state).days[0].saves[48].dc,50);delete state.days[0].saves[47];assert.equal(TravelStateSchema.safeParse(state).success,false)
})
test('acclimation requires30 actual observed days and never grants adaptation above20000 feet to a nonnative body',async t=>{
 const call=await engine(t,{dice:'19'});await context(call,{temperatureF:65});await exposure(call,{altitudeFeet:10000,exposed:false})
 for(const seconds of [864000,864000,864000-1])ok(await call('advance_time',{seconds}))
 assert.equal(ok(await call('inspect_weather',{entityId:'player'})).acclimated,false);ok(await call('advance_time',{seconds:1}));let read=ok(await call('inspect_weather',{entityId:'player'}));assert.equal(read.acclimated,true);assert.equal(read.profile.acclimationSeconds,30*86400)
 ok(await call('record_weather_exposure',{eventId:'actual-higher-elevation',entityId:'player',operation:'update',exposed:false,breathes:true,altitudeFeet:20001,source}));assert.equal(ok(await call('inspect_weather',{entityId:'player'})).acclimated,false)
 await fact(call,'actual-high-native');ok(await call('record_weather_exposure',{eventId:'actual-native-elevation',entityId:'player',operation:'update',exposed:false,breathes:true,altitudeFeet:20001,nativeHighAltitudeFactId:'actual-high-native',source}));assert.equal(ok(await call('inspect_weather',{entityId:'player'})).acclimated,true);await hydrate(call);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('real high altitude doubles only effective walking, reaches forced march at four and a half actual hours and retains exact progress',async t=>{
 const call=await engine(t,{dice:'20,19'});await context(call,{temperatureF:65});await exposure(call,{altitudeFeet:10000,exposed:false})
 ok(await call('begin_nutrition_tracking',{eventId:'actual-food-history',operation:'begin',standardNeedsConfirmed:true,hotWeather:false,foodDebtHalfDays:0,priorDeprivation:'none',source}))
 ok(await call('begin_travel_tracking',{eventId:'actual-walk-history',dayStartsAt:0,knownWalkingSeconds:0,historyKnown:true,source}))
 ok(await call('create_travel_route',{journeyId:'physical-route',origin:source,destination:source,distanceFeet:528000,terrain:'normal',actualRouteConfirmed:true,source}))
 const step=(eventId,seconds=3600)=>({eventId,journeyId:'physical-route',pace:'normal',scale:'hour',durationSeconds:seconds,activity:'other',rank:'front',openTerrain:true,source})
 for(let i=0;i<4;i++)ok(await call('advance_travel',step(`altitude-hour-${i}`)))
 await refused(call,'advance_travel',step('cross-effective-nine'),'FORCED_MARCH_BOUNDARY');const walked=ok(await call('advance_travel',step('actual-half-hour',1800)))
 assert.equal(walked.walkingSecondsThisDay,16200);assert.equal(walked.effectiveWalkingSecondsThisDay,32400);assert.equal(walked.forcedMarchEvent.dc,11);assert.equal(walked.worldTimeSeconds,16200)
 ok(await call('resolve_forced_march',{eventId:walked.forcedMarchEvent.eventId}));await hydrate(call);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
