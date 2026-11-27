const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {entityVerticalContext}=require('../mcp-server/dist/lib/jumping-state.js')
const {nativeFlightFallIssue}=require('../mcp-server/dist/lib/native-flight-geometry.js')
const {registerNativeFlightTools}=require('../mcp-server/dist/mcp-server/tools/native-flight-tools.js')
const {registerVerticalBarrierTools}=require('../mcp-server/dist/mcp-server/tools/vertical-barrier-tools.js')
const {registerVerticalTools}=require('../mcp-server/dist/mcp-server/tools/vertical-tools.js')
const source='Actual measured body, standing support and complete selected physical air clearance, established by the MJ.'
async function flight(t,{combat=false,dice='17,3,4,19',near=false}={}){
 const f=await fixture(t,{weapon:'longsword',quantity:null,dice,startBattle:false}),record=getMonsterRecord('wyvern')
 f.state.player.position=near?{x:2,y:1}:{x:10,y:4};f.state.currentRoomId=near?'firing-room':'other-room'
 f.state.monsters.wyvern={...structuredClone(record.engine),id:'wyvern',name:'Actual native flyer',type:'wyvern',srd:{index:'wyvern',ruleset:'2014',url:record.sourceUrl},position:{x:1,y:1},hp:{current:110,max:110},conditions:[],isAlive:true,hostile:true}
 const callbacks={},server={tool(name,_description,schema,callback){callbacks[name]=input=>callback(require('zod').z.object(schema).parse(input))},registerTool(name,config,callback){callbacks[name]=input=>callback((typeof config.inputSchema.parse==='function'?config.inputSchema:require('zod').z.object(config.inputSchema)).parse(input))}};registerNativeFlightTools(server);registerVerticalTools(server);registerVerticalBarrierTools(server);require('../mcp-server/dist/mcp-server/tools/weather-tools.js').registerWeatherTools(server)
 const original=f.call;f.call=async(name,input={})=>callbacks[name]?JSON.parse((await callbacks[name](input)).content[0].text):original(name,input)
 f.state.worldFacts.push({id:'actual-clearance',text:source,source,mapId:f.state.currentMapId,expires:'never'})
 ok(await f.call('record_vertical_surface',{eventId:'actual-floor',surfaceId:'floor',mapId:f.state.currentMapId,roomId:'firing-room',cells:[{x:1,y:1},{x:2,y:1},{x:3,y:1},{x:4,y:1}],kind:'support',elevationFeet:0,actualGeometryConfirmed:true,source}))
 for(const [entityId,heightFeet]of [['wyvern',8],['player',6],['target',4]])ok(await f.call('record_physical_body',{eventId:'body-'+entityId,entityId,heightFeet,actualMeasuredBodyConfirmed:true,source}))
 ok(await f.call('observe_standing_surface',{eventId:'actual-standing',entityId:'wyvern',surfaceId:'floor',actualCurrentSupportConfirmed:true,source}))
 gs.replaceState(structuredClone(f.state));f.state=gs.getState();f.target=f.state.monsters.target
 if(combat)Object.assign(f.state,{phase:'combat',currentTurn:'wyvern',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target'],actionUsed:{},movementUsed:{}})
 f.input=(extra={})=>({eventId:'actual-flight',entityId:'wyvern',path:[{x:1,y:1,zFeet:0},{x:1,y:1,zFeet:5}],takeoffSurfaceId:'floor',factId:'actual-clearance',actualWholeBodyClearanceConfirmed:true,source,...extra})
 f.qualify=(extra={})=>f.call('record_spatial_attack_geometry',{eventId:'actual-air-attack',actorId:'wyvern',targetId:'player',weaponReference:'Bite',originZFeet:5,targetZFeet:5,factId:'actual-clearance',actualAttackPointsConfirmed:true,source,...extra})
 return f
}
test('native non-hover flight uses its actual sourceXYZ and shared movement budget without an action, time, trait or free landing',async t=>{
 const f=await flight(t,{combat:true}),before=structuredClone(f.state),result=ok(await f.call('fly_native_path',f.input()))
 assert.equal(result.costFeet,5);assert.equal(f.state.movementUsed.wyvern,1);assert.deepEqual(f.state.monsters.wyvern.position,{x:1,y:1});assert.equal(entityVerticalContext(f.state,'wyvern').zFeet,5);assert.equal(entityVerticalContext(f.state,'wyvern').airborne,true);assert.equal(f.state.worldTimeSeconds,before.worldTimeSeconds);assert.deepEqual(f.state.actionUsed,before.actionUsed)
 const saved=structuredClone(f.state);gs.replaceState(saved);assert.deepEqual(gs.getState().dmTools.nativeFlight,saved.dmTools.nativeFlight);assert.equal(ok(await f.call('fly_native_path',f.input())).replayed,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('chosen actual3D diagonal uses Euclidean feet while prior ground movement still reduces the same source allowance',async t=>{
 const f=await flight(t,{combat:true});f.state.movementUsed.wyvern=3
 const a=ok(await f.call('fly_native_path',f.input({path:[{x:1,y:1,zFeet:0},{x:2,y:1,zFeet:5}]})))
 assert.ok(Math.abs(a.costFeet-Math.sqrt(50))<1e-8);assert.ok(Math.abs(f.state.movementUsed.wyvern-(3+Math.sqrt(2)))<1e-8)
})
test('non-native source and an over-budget whole route refuse before movement, action, time or dice',async t=>{
 const f=await flight(t,{combat:true})
 await refused(f,'fly_native_path',f.input({entityId:'target'}),'NATIVE_FLIGHT_SOURCE_REQUIRED')
 f.state.movementUsed.wyvern=16;await refused(f,'fly_native_path',f.input(),'MOVEMENT_EXCEEDED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('unknown decisive nearby3D opportunity geometry is refused before taking off or silently skipping an enemy',async t=>{
 const f=await flight(t,{combat:true,near:true});await refused(f,'fly_native_path',f.input(),'NATIVE_FLIGHT_OPPORTUNITY_CONTEXT_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('actual landing requires its measured existing support and does not give a new walking budget or action',async t=>{
 const f=await flight(t,{combat:true});ok(await f.call('fly_native_path',f.input()))
 await refused(f,'fly_native_path',f.input({eventId:'no-floor',path:[{x:1,y:1,zFeet:5},{x:2,y:1,zFeet:0}],takeoffSurfaceId:undefined}),'NATIVE_FLIGHT_PATH_REQUIRED')
 const a=ok(await f.call('fly_native_path',f.input({eventId:'actual-landing',path:[{x:1,y:1,zFeet:5},{x:2,y:1,zFeet:0}],takeoffSurfaceId:undefined,landingSurfaceId:'floor'})))
 assert.equal(entityVerticalContext(f.state,'wyvern').airborne,false);assert.equal(entityVerticalContext(f.state,'wyvern').zFeet,0);assert.ok(Math.abs(a.costFeet-Math.sqrt(50))<1e-8);assert.equal(f.state.actionUsed.wyvern,undefined)
})
test('an actual airborne Bite uses the exact measured source/target points and printed10foot reach',async t=>{
 const f=await flight(t,{near:true});ok(await f.call('fly_native_path',f.input()));ok(await f.qualify())
 Object.assign(f.state,{phase:'combat',currentTurn:'wyvern',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target']})
 const a=ok(await f.call('resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Bite'}));const attack=a.attacks?.[0]??a
 assert.equal(attack.spatialContext.distanceFeet,5);assert.equal(attack.hit,true);assert.equal(attack.damageRoll.notation,'2d6+4');assert.equal(f.state.actionUsed.wyvern,true)
})
test('an actual airborne Claws uses its own5foot reach with no invented anatomy or automatic claw choice',async t=>{
 const f=await flight(t,{near:true});ok(await f.call('fly_native_path',f.input()));ok(await f.qualify({weaponReference:'Claws'}));Object.assign(f.state,{phase:'combat',currentTurn:'wyvern',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target']})
 const a=ok(await f.call('resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Claws'})),attack=a.attacks?.[0]??a;assert.equal(attack.spatialContext.distanceFeet,5);assert.equal(attack.damageRoll.notation,'2d8+4')
})
test('unknown exact attack geometry and an actual over-range Claws both refuse before their first die/action',async t=>{
 const f=await flight(t,{near:true});ok(await f.call('fly_native_path',f.input()));Object.assign(f.state,{phase:'combat',currentTurn:'wyvern',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target']})
 await refused(f,'resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Claws'},'SPATIAL_ATTACK_GEOMETRY_REQUIRED')
 ok(await f.qualify({weaponReference:'Claws',originZFeet:10,targetZFeet:0}));await refused(f,'resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Claws'},'TARGET_OUT_OF_RANGE');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('a prone actual non-hover source has a real fall due; exact lower support and one retained descent finish it without a new action',async t=>{
 const f=await flight(t,{dice:'3,19'});ok(await f.call('fly_native_path',f.input({path:[{x:1,y:1,zFeet:0},{x:1,y:1,zFeet:5},{x:1,y:1,zFeet:10}]})))
 f.state.monsters.wyvern.conditions.push('prone');assert.equal(nativeFlightFallIssue(f.state).code,'NATIVE_FLIGHT_FALL_DUE');ok(await f.call('record_physical_body',{eventId:'actual-prone-body',entityId:'wyvern',heightFeet:3,actualMeasuredBodyConfirmed:true,source}))
 const hp=f.state.monsters.wyvern.hp.current,result=ok(await f.call('complete_native_flight_fall',{eventId:'actual-fall',entityId:'wyvern',landingSurfaceId:'floor',reason:source}));assert.equal(result.distanceFeet,10);assert.equal(f.state.monsters.wyvern.hp.current,hp-3);assert.equal(entityVerticalContext(f.state,'wyvern').airborne,false);assert.equal(nativeFlightFallIssue(f.state),null)
 const saved=structuredClone(f.state);assert.equal(ok(await f.call('complete_native_flight_fall',{eventId:'actual-fall',entityId:'wyvern',landingSurfaceId:'floor',reason:source})).replayed,true);assert.deepEqual(f.state,saved);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the original spatial Bite and d20 survive hydration through the actual held Inspiration resolution',async t=>{
 const f=await flight(t,{near:true,dice:'8,4,2,3,19'});ok(await f.call('fly_native_path',f.input()));ok(await f.qualify());Object.assign(f.state,{phase:'combat',currentTurn:'wyvern',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target']});f.state.hero.inspiration.push({targetId:'wyvern',die:8,expiresAt:600})
 ok(await f.call('resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Bite'}));const pending=f.state.hero.pending;assert.ok(pending);assert.equal(pending.command.spatialContext.distanceFeet,5)
 gs.replaceState(structuredClone(f.state));const a=ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration'})),attack=a.attacks?.[0]??a;assert.equal(attack.spatialContext.distanceFeet,5);assert.equal(attack.attackRoll.rolls[0],8);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an altered held spatial target is rejected before the actual Inspiration bonus die or action is spent',async t=>{
 const f=await flight(t,{near:true,dice:'8,4,19'});ok(await f.call('fly_native_path',f.input()));ok(await f.qualify());Object.assign(f.state,{phase:'combat',currentTurn:'wyvern',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target']});f.state.hero.inspiration.push({targetId:'wyvern',die:8,expiresAt:600})
 ok(await f.call('resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Bite'}));const pending=f.state.hero.pending;pending.command.spatialContext.targetId='target'
 await refused(f,'resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration'},'SPATIAL_ATTACK_HELD_CONTEXT_INVALID');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,4)
})
test('actual spatial darkvision uses real3D distance rather than borrowing a near XY projection',async t=>{
 const f=await flight(t,{near:true}),path=Array.from({length:14},(_,i)=>({x:1,y:1,zFeet:i*5}));ok(await f.call('fly_native_path',f.input({path})));ok(await f.qualify({originZFeet:65,targetZFeet:5}));f.state.dmTools.lighting={ambient:{[f.state.currentMapId]:{'firing-room':'darkness'}},sources:{}}
 const {captureSpatialWeaponContext}=require('../mcp-server/dist/mcp-server/spatial-weapon.js'),{withSpatialWeaponResolution}=require('../mcp-server/dist/lib/spatial-weapon-resolution.js'),{creaturePerception}=require('../mcp-server/dist/mcp-server/senses.js'),context=captureSpatialWeaponContext('wyvern','player','Bite')
 const sight=withSpatialWeaponResolution(f.state,context,()=>creaturePerception(f.state.monsters.wyvern,f.state.player));assert.ok(sight.distanceFeet>60);assert.equal(sight.canSee,false);assert.equal(sight.perceivedIllumination,'darkness')
})
test('a real non-hover fall blocks another actor check before its die and does not grant free breath, recovery or time',async t=>{
 const f=await flight(t,{dice:'19'});ok(await f.call('fly_native_path',f.input()));f.state.monsters.wyvern.conditions.push('prone')
 await refused(f,'roll_ability_check',{entityId:'player',ability:'wis',dc:10},'NATIVE_FLIGHT_FALL_DUE');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real corpse falls to its actual support without creature fall dice, healing, revival or a second position',async t=>{
 const f=await flight(t,{dice:'19'});ok(await f.call('fly_native_path',f.input()));Object.assign(f.state.monsters.wyvern,{hp:{current:0,max:110},isAlive:false});const before=structuredClone(f.state.monsters.wyvern)
 const a=ok(await f.call('complete_native_flight_fall',{eventId:'actual-corpse-fall',entityId:'wyvern',landingSurfaceId:'floor',reason:source}));assert.equal(a.corpse,true);assert.equal(a.diceRolled,false);assert.deepEqual(f.state.monsters.wyvern,before);assert.equal(entityVerticalContext(f.state,'wyvern').airborne,false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an exact attack origin outside the measured real source body is refused without acquiring a target ray or attack',async t=>{
 const f=await flight(t,{near:true});ok(await f.call('fly_native_path',f.input()));const before=structuredClone(f.state),answer=await f.qualify({originZFeet:20});assert.equal(answer.code,'SPATIAL_ATTACK_BODY_POINTS_REQUIRED');assert.deepEqual(f.state,before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})

async function physicalObstacle(f,height){
 ok(await f.call('create_scene_object',{objectId:'actual-obstacle',name:'Actual obstacle',description:'An actual finite obstacle whose measured vertical bounds are separate.',cell:{x:2,y:1},kind:'obstacle',material:'wood',size:'small',resilience:'resilient'}))
 if(height!==undefined)ok(await f.call('declare_vertical_barrier',{eventId:'actual-obstacle-measure',barrierId:'actual-obstacle-height',mapId:f.state.currentMapId,reference:{kind:'object',objectId:'actual-obstacle',footprint:{minXFeet:7.5,maxXFeet:12.5,minYFeet:2.5,maxYFeet:7.5}},bottomZFeet:0,topZFeet:height,actualMeasuredBarrierConfirmed:true,blocksSight:true,source}))
}
test('an unmeasured real obstacle refuses a whole native route before its otherwise clear first step',async t=>{
 const f=await flight(t);await physicalObstacle(f)
 await refused(f,'fly_native_path',f.input({path:[{x:1,y:1,zFeet:0},{x:1,y:1,zFeet:5},{x:2,y:1,zFeet:5}]}),'NATIVE_FLIGHT_BARRIER_CONTEXT_REQUIRED');assert.equal(entityVerticalContext(gs.getState(),'wyvern').zFeet,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('a whole measured native body can fly over a genuinely lower measured obstacle without treating its XY cell as an infinite wall',async t=>{
 const f=await flight(t);await physicalObstacle(f,4)
 const a=ok(await f.call('fly_native_path',f.input({path:[{x:1,y:1,zFeet:0},{x:1,y:1,zFeet:5},{x:2,y:1,zFeet:5}]})));assert.equal(a.costFeet,10);assert.equal(entityVerticalContext(f.state,'wyvern').zFeet,5);assert.deepEqual(f.state.monsters.wyvern.position,{x:2,y:1})
})
test('a real low obstacle does not block a qualified actual aerial Bite ray above it or impose invented2D unseen penalties',async t=>{
 const f=await flight(t,{near:true});f.state.player.position={x:3,y:1};await physicalObstacle(f,4);ok(await f.call('fly_native_path',f.input()));ok(await f.qualify());Object.assign(f.state,{phase:'combat',currentTurn:'wyvern',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target']})
 const a=ok(await f.call('resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Bite'})),attack=a.attacks?.[0]??a;assert.equal(attack.spatialContext.distanceFeet,10);assert.equal(attack.hit,true);assert.doesNotMatch(attack.attackRoll.detail,/DIS/)
})
test('a real measured barrier intersecting the actual aerial Bite ray refuses before its die and action',async t=>{
 const f=await flight(t,{near:true});f.state.player.position={x:3,y:1};await physicalObstacle(f,8);ok(await f.call('fly_native_path',f.input()));ok(await f.qualify());Object.assign(f.state,{phase:'combat',currentTurn:'wyvern',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target']})
 await refused(f,'resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Bite'},'SPATIAL_ATTACK_BLOCKED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('an altered held geometric distance cannot shorten source reach or consume an Inspiration die',async t=>{
 const f=await flight(t,{near:true,dice:'8,4,19'});ok(await f.call('fly_native_path',f.input()));ok(await f.qualify());Object.assign(f.state,{phase:'combat',currentTurn:'wyvern',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target']});f.state.hero.inspiration.push({targetId:'wyvern',die:8,expiresAt:600})
 ok(await f.call('resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Bite'}));const pending=f.state.hero.pending;pending.command.spatialContext.distanceFeet=0
 await refused(f,'resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration'},'SPATIAL_ATTACK_HELD_CONTEXT_INVALID');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,4)
})
test('a forged smaller native route cost is rejected at authoritative state restoration',async t=>{
 const f=await flight(t,{combat:true});ok(await f.call('fly_native_path',f.input()));const before=structuredClone(f.state),forged=structuredClone(f.state);forged.dmTools.nativeFlight.moves['actual-flight'].stepFeet[0]=0.1
 assert.throws(()=>gs.replaceState(forged),e=>e.code==='JUMP_STATE_INVALID');assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})


test('ordinary ground walking remains available far from an actual native airborne enemy without projecting its height into a false OA',async t=>{
 const f=await flight(t);ok(await f.call('fly_native_path',f.input()));Object.assign(f.state,{phase:'combat',currentTurn:'player',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target']});const a=ok(await f.call('move_token',{tokenId:'player',toCell:{x:9,y:4}}));assert.equal(a.costCells,1);assert.deepEqual(f.state.player.position,{x:9,y:4});assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})

test('a whole ground route potentially crossing actual airborne reach refuses before the first otherwise safe paid step',async t=>{
 const f=await flight(t);ok(await f.call('fly_native_path',f.input()));Object.assign(f.state,{phase:'combat',currentTurn:'player',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target']});f.state.player.position={x:5,y:1};f.state.currentRoomId='firing-room';await refused(f,'move_token',{tokenId:'player',toCell:{x:2,y:1}},'NATIVE_FLIGHT_OPPORTUNITY_CONTEXT_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})

test('an actual hidden body and airborne observer require supported discovery before any ground movement or post-step scan',async t=>{
 const f=await flight(t);ok(await f.call('fly_native_path',f.input()));f.state.hero.effects.push({id:'real-hidden',kind:'hidden',sourceId:'player',targetIds:['player'],createdAt:0,expiresAt:100,data:{}});await refused(f,'move_token',{tokenId:'player',toCell:{x:9,y:4}},'NATIVE_FLIGHT_VISIBILITY_CONTEXT_REQUIRED')
})

test('a healthy actual airborne source cannot fabricate a forced fall to avoid paid movement',async t=>{
 const f=await flight(t);ok(await f.call('fly_native_path',f.input()));await refused(f,'complete_native_flight_fall',{eventId:'invented-fall',entityId:'wyvern',landingSurfaceId:'floor',reason:source},'NATIVE_FLIGHT_FALL_REQUIRED')
})


test('a reactive NPC cannot bypass its authored explicit activation through the native flight tool',async t=>{const f=await flight(t);f.state.monsters.wyvern.controller='reactive_npc';await refused(f,'fly_native_path',f.input(),'NPC_ACTIVATION_REQUIRED')})

test('a real native airborne source cannot lose its altitude through an old XY forced displacement',async t=>{const f=await flight(t);ok(await f.call('fly_native_path',f.input()));const before=structuredClone(f.state);assert.throws(()=>gs.commitPhysicalDisplacements([{id:'wyvern',cell:{x:2,y:1},kind:'forced'}]),e=>e.code==='NATIVE_FLIGHT_PHYSICAL_DISPLACEMENT_REQUIRED');assert.deepEqual(f.state,before)})

test('strong wind keeps the actual native flyer turn open until its real paid landing or completed measured fall',async t=>{const f=await flight(t,{combat:true,dice:'3,3,19'});ok(await f.call('fly_native_path',f.input({path:Array.from({length:5},(_,i)=>({x:1,y:1,zFeet:i*5}))})));ok(await f.call('configure_weather',{eventId:'actual-wind',roomId:'firing-room',temperatureF:60,strongWind:true,precipitation:'none',sandstorm:false,fog:'none',source}));await refused(f,'next_turn',{actorId:'wyvern',skipAction:true},'WEATHER_FLIGHT_LANDING_REQUIRED');const a=ok(await f.call('complete_native_flight_fall',{eventId:'wind-fall',entityId:'wyvern',landingSurfaceId:'floor',reason:source}));assert.equal(a.distanceFeet,20);assert.equal(a.damageResolution.damageDealt,6);assert.equal(entityVerticalContext(f.state,'wyvern').airborne,false);assert.equal(f.state.movementUsed.wyvern,4);ok(await f.call('next_turn',{actorId:'wyvern',skipAction:true}));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)})
