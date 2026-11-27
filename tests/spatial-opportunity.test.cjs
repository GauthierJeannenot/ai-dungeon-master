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
async function flight(t,{combat=false,dice='17,3,4,19',near=false,hp=110}={}){
 const f=await fixture(t,{weapon:'whip',quantity:null,dice,startBattle:false}),record=getMonsterRecord('wyvern')
 f.state.player.position=near?{x:2,y:1}:{x:10,y:4};f.state.currentRoomId=near?'firing-room':'other-room'
 f.state.monsters.wyvern={...structuredClone(record.engine),id:'wyvern',name:'Actual native flyer',type:'wyvern',srd:{index:'wyvern',ruleset:'2014',url:record.sourceUrl},position:{x:1,y:1},hp:{current:hp,max:hp},conditions:[],isAlive:true,hostile:true}
 const callbacks={},server={tool(name,_description,schema,callback){callbacks[name]=input=>callback(require('zod').z.object(schema).parse(input))},registerTool(name,config,callback){callbacks[name]=input=>callback((typeof config.inputSchema.parse==='function'?config.inputSchema:require('zod').z.object(config.inputSchema)).parse(input))}};registerNativeFlightTools(server);require('../mcp-server/dist/mcp-server/tools/spatial-opportunity-tools.js').registerSpatialOpportunityTools(server);registerVerticalTools(server);registerVerticalBarrierTools(server);require('../mcp-server/dist/mcp-server/tools/weather-tools.js').registerWeatherTools(server)
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

async function qualifyOpportunities(f){
 for(const weaponReference of ['unarmed','whip'])ok(await f.call('record_spatial_opportunity_geometry',{
  eventId:'actual-opportunity-'+weaponReference,sourceId:'player',movingId:'wyvern',weaponReference,
  sourcePointZFeet:0,movingPointOffsetZFeet:0,factId:'actual-clearance',actualRetainedBodyPointsConfirmed:true,source}))
}
async function exactPause(f){
 await qualifyOpportunities(f)
 const input=f.input({path:[{x:1,y:1,zFeet:0},{x:1,y:1,zFeet:5},{x:1,y:1,zFeet:10}]})
 const first=ok(await f.call('fly_native_path',input));assert.equal(first.status,'opportunity');assert.equal(first.costFeet,0)
 assert.deepEqual(first.pendingReaction.command.opportunityBoundary.choices.map(c=>c.weaponOrSpell),['unarmed'])
 const paused=ok(await f.call('resolve_reaction',{pendingId:first.pendingReaction.id,choice:'decline'}))
 assert.equal(paused.status,'opportunity');assert.ok(Math.abs(paused.costFeet-Math.sqrt(75))<1e-7)
 assert.ok(Math.abs(entityVerticalContext(f.state,'wyvern').zFeet-Math.sqrt(75))<1e-7)
 assert.deepEqual(paused.pendingReaction.command.opportunityBoundary.choices.map(c=>c.weaponOrSpell),['whip'])
 return{input,paused}
}

test('the actual public flight pauses at its exact representable10foot boundary after a distinct5foot decline, then resolves the explicitly selected melee reaction once',async t=>{
 const f=await flight(t,{combat:true,near:true,dice:'17,3,19'}),{input,paused}=await exactPause(f)
 const move=f.state.dmTools.nativeFlight.moves[input.eventId];assert.equal(move.cursor,1);assert.ok(move.partial);assert.deepEqual(move.input.path,input.path);assert.ok(Math.abs(f.state.movementUsed.wyvern-Math.sqrt(75)/5)<1e-7)
 gs.replaceState(structuredClone(f.state));f.state=gs.getState()
 const before=structuredClone(f.state);assert.equal(ok(await f.call('fly_native_path',input)).replayed,true);assert.deepEqual(f.state,before)
 await refused(f,'resolve_reaction',{pendingId:paused.pendingReaction.id,choice:'opportunity_attack',weaponOrSpell:'unarmed'},'OPPORTUNITY_REACH_NOT_LEFT')
 const a=ok(await f.call('resolve_reaction',{pendingId:paused.pendingReaction.id,choice:'opportunity_attack',weaponOrSpell:'whip',weaponAbility:'str'}))
 assert.equal(a.success,true);assert.equal(a.costFeet,10);assert.equal(entityVerticalContext(f.state,'wyvern').zFeet,10);assert.equal(f.state.movementUsed.wyvern,2)
 assert.equal(a.attack.spatialContext.distanceFeet,10);assert.equal(f.state.hero.reactionsUsed.player,true);assert.equal(f.state.actionUsed.player,undefined)
 assert.deepEqual(f.state.dmTools.nativeFlight.moves[input.eventId].input.path,input.path);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a later actual opportunity boundary at fractionalXY refuses the entire public route before its first otherwise legal partial move, reaction or die',async t=>{
 const f=await flight(t,{combat:true,near:true,dice:'19'});await qualifyOpportunities(f)
 await refused(f,'fly_native_path',f.input({path:[{x:1,y:1,zFeet:0},{x:1,y:1,zFeet:5},{x:2,y:2,zFeet:10}]}),'SPATIAL_OPPORTUNITY_BOUNDARY_UNREPRESENTABLE')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actual opportunity reducing the flyer to zero stops at the exact paid partial point and SQL-shaped hydration cannot replay the original route past its due fall',async t=>{
 const f=await flight(t,{combat:true,near:true,hp:1,dice:'17,3,19'}),{input,paused}=await exactPause(f)
 const a=ok(await f.call('resolve_reaction',{pendingId:paused.pendingReaction.id,choice:'opportunity_attack',weaponOrSpell:'whip',weaponAbility:'str'}))
 assert.equal(a.movementStopped,true);assert.equal(a.stopReason,'ACTOR_DOWN');assert.equal(f.state.monsters.wyvern.hp.current,0)
 assert.ok(Math.abs(a.costFeet-Math.sqrt(75))<1e-7);assert.ok(Math.abs(entityVerticalContext(f.state,'wyvern').zFeet-Math.sqrt(75))<1e-7)
 assert.equal(f.state.dmTools.nativeFlight.moves[input.eventId].cursor,1);assert.equal(f.state.dmTools.nativeFlight.moves[input.eventId].status,'stopped')
 assert.equal(nativeFlightFallIssue(f.state).code,'NATIVE_FLIGHT_FALL_DUE');gs.replaceState(structuredClone(f.state));f.state=gs.getState()
 await refused(f,'roll_ability_check',{entityId:'player',ability:'wis',dc:10},'NATIVE_FLIGHT_FALL_DUE')
 const before=structuredClone(f.state);assert.equal(ok(await f.call('fly_native_path',input)).replayed,true);assert.deepEqual(f.state,before)
 const {bodyPhysicalHeight}=require('../mcp-server/dist/lib/jumping-state.js')
 if(bodyPhysicalHeight(f.state,'wyvern')===null)ok(await f.call('record_physical_body',{eventId:'actual-corpse-measurement',entityId:'wyvern',heightFeet:3,actualMeasuredBodyConfirmed:true,source:'The actual collapsed fixture corpse was measured at3feet in its new physical posture.'}))
 const fall=ok(await f.call('complete_native_flight_fall',{eventId:'actual-interrupted-fall',entityId:'wyvern',landingSurfaceId:'floor',reason:source}));assert.equal(fall.corpse,true);assert.equal(entityVerticalContext(f.state,'wyvern').airborne,false)
 gs.replaceState(structuredClone(f.state));f.state=gs.getState();const landed=structuredClone(f.state)
 assert.equal(ok(await f.call('fly_native_path',input)).replayed,true);assert.deepEqual(f.state,landed);assert.equal(entityVerticalContext(f.state,'wyvern').zFeet,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the original actual opportunity d20 survives Inspiration and hydration while the same exact partial native segment waits',async t=>{
 const f=await flight(t,{combat:true,near:true,dice:'8,4,3,19'}),{input,paused}=await exactPause(f)
 f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const a=ok(await f.call('resolve_reaction',{pendingId:paused.pendingReaction.id,choice:'opportunity_attack',weaponOrSpell:'whip',weaponAbility:'str'}));assert.ok(a.pendingReaction)
 assert.equal(f.state.hero.pending.roll.rolls[0],8);assert.equal(f.state.hero.pending.continuation.nativeFlightId,input.eventId)
 assert.ok(Math.abs(entityVerticalContext(f.state,'wyvern').zFeet-Math.sqrt(75))<1e-7)
 gs.replaceState(structuredClone(f.state));f.state=gs.getState()
 const b=ok(await f.call('resolve_reaction',{pendingId:f.state.hero.pending.id,choice:'bardic_inspiration'}));assert.equal(b.success,true);assert.equal(b.attack.attackRoll.rolls[0],8);assert.equal(b.attack.spatialContext.distanceFeet,10)
 assert.equal(f.state.hero.reactionsUsed.player,true);assert.equal(f.state.movementUsed.wyvern,2);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an altered held opportunity distance refuses before its Inspiration die, movement remainder or reaction debit',async t=>{
 const f=await flight(t,{combat:true,near:true,dice:'8,4,19'}),{paused}=await exactPause(f);f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 ok(await f.call('resolve_reaction',{pendingId:paused.pendingReaction.id,choice:'opportunity_attack',weaponOrSpell:'whip',weaponAbility:'str'}));f.state.hero.pending.command.spatialContext.distanceFeet=1
 await refused(f,'resolve_reaction',{pendingId:f.state.hero.pending.id,choice:'bardic_inspiration'},'SPATIAL_ATTACK_HELD_CONTEXT_INVALID');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,4)
})

async function groundAgainstFlyer(t,{dice='17,2,3,1,1,1,1,1,1,1,1,1,19'}={}){
 const f=await flight(t,{near:true,dice});ok(await f.call('fly_native_path',f.input()));Object.assign(f.state,{phase:'combat',currentTurn:'player',round:1,combatGeneration:1,initiativeOrder:['player','wyvern','target'],actionUsed:{},movementUsed:{}});f.state.player.hp={current:300,max:300}
 for(const weaponReference of ['Bite','Claws','Stinger'])ok(await f.call('record_spatial_opportunity_geometry',{eventId:'actual-air-reactor-'+weaponReference,sourceId:'wyvern',movingId:'player',weaponReference,sourcePointZFeet:5,movingPointOffsetZFeet:5,factId:'actual-clearance',actualRetainedBodyPointsConfirmed:true,source}))
 return f
}

test('a real ground departure keeps its walking costs and exact offered5/10foot source choices around a genuine native flyer; held CON and source venom survive the same movement continuation',async t=>{
 const f=await groundAgainstFlyer(t),first=ok(await f.call('move_token',{tokenId:'player',toCell:{x:4,y:1}}));assert.equal(first.stopReason,'reaction_decision');assert.equal(first.costCells,0)
 assert.deepEqual(f.state.hero.pending.command.opportunityBoundary.choices.map(c=>c.weaponOrSpell),['Claws'])
 const second=ok(await f.call('resolve_reaction',{pendingId:f.state.hero.pending.id,choice:'decline'}));assert.equal(second.movement.costCells,1);assert.deepEqual(f.state.player.position,{x:3,y:1})
 assert.deepEqual(f.state.hero.pending.command.opportunityBoundary.choices.map(c=>c.weaponOrSpell),['Bite','Stinger']);f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const hit=ok(await f.call('resolve_reaction',{pendingId:f.state.hero.pending.id,choice:'opportunity_attack',weaponOrSpell:'Stinger'}));assert.ok(hit.pendingReaction);assert.equal(f.state.player.hp.current,291);assert.equal(f.state.movementUsed.player,1)
 gs.replaceState(structuredClone(f.state));f.state=gs.getState()
 const done=ok(await f.call('resolve_reaction',{pendingId:f.state.hero.pending.id,choice:'bardic_inspiration'}));assert.deepEqual(f.state.player.position,{x:4,y:1});assert.equal(f.state.movementUsed.player,2);assert.equal(f.state.player.hp.current,284);assert.equal(f.state.hero.reactionsUsed.wyvern,true);assert.equal(f.state.actionUsed.wyvern,undefined)
 assert.equal(done.attack.playerPoison.save.dc,15);assert.equal(done.attack.spatialContext.distanceFeet,10);assert.equal(Object.keys(f.state.dmTools.nativePoison.hits).length,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

for(const condition of ['spent','blinded'])test(`a real ${condition} source or movement excludes its spatial opportunity without inventing a reaction or die`,async t=>{
 const f=await flight(t,{combat:true,near:true,dice:'19'})
 if(condition==='spent')f.state.hero.reactionsUsed.player=true
 if(condition==='blinded')f.state.player.conditions.push('blinded')
 const result=ok(await f.call('fly_native_path',f.input({path:[{x:1,y:1,zFeet:0},{x:1,y:1,zFeet:5},{x:1,y:1,zFeet:10}]})))
 assert.equal(result.costFeet,10);assert.equal(f.state.hero.pending,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('restoration rejects incomplete or altered exact partial flight and opportunity proofs atomically, then accepts the original snapshot',async t=>{
 const f=await flight(t,{combat:true,near:true,dice:'19'}),{input}=await exactPause(f),before=structuredClone(f.state)
 for(const corrupt of [s=>delete s.hero.pending,s=>s.dmTools.nativeFlight.moves[input.eventId].partial.fraction=.1,
  s=>s.hero.pending.command.opportunityBoundary.spatial.choices[0].context.distanceFeet=1,
  s=>s.dmTools.nativeFlight.moves[input.eventId].opportunityBoundary.point.zFeet=7,
  s=>s.dmTools.nativeFlight.moves[input.eventId].input.path.at(-1).zFeet=11,
  s=>s.hero.pending.command.ignored.push('forged-future-boundary'),
  s=>s.dmTools.nativeFlight.moves[input.eventId].opportunityDecisions.push('forged-future-boundary'),
  s=>delete s.dmTools.nativeFlight.moves[input.eventId].opportunityResolutions]){
  const changed=structuredClone(before);corrupt(changed);assert.throws(()=>gs.replaceState(changed));assert.deepEqual(gs.getState(),before)
 }
 gs.replaceState(structuredClone(before));f.state=gs.getState();assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actual player Disengage excludes the genuine aerial source during ground movement with unchanged walking costs',async t=>{
 const f=await groundAgainstFlyer(t,{dice:'19'});ok(await f.call('combat_action',{actorId:'player',action:'disengage'}))
 ok(await f.call('move_token',{tokenId:'player',toCell:{x:4,y:1}}));assert.equal(f.state.hero.pending,undefined);assert.equal(f.state.movementUsed.player,2)
 assert.equal(f.state.hero.reactionsUsed.wyvern,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('simultaneous real reactors require explicit priorities before cost and preserve separate source decisions at the exact same point',async t=>{
 const f=await flight(t,{combat:true,near:true,dice:'19'}),record=getMonsterRecord('goblin')
 f.state.monsters['actual-ally']={...structuredClone(record.engine),id:'actual-ally',name:'Actual allied guard',type:'goblin',srd:{index:'goblin',ruleset:'2014',url:record.sourceUrl},position:{x:0,y:1},hp:{current:30,max:30},conditions:[],isAlive:true,hostile:false}
 f.state.initiativeOrder.push('actual-ally');ok(await f.call('record_physical_body',{eventId:'body-actual-ally',entityId:'actual-ally',heightFeet:6,actualMeasuredBodyConfirmed:true,source}))
 await qualifyOpportunities(f)
 const observe=(eventId,priority)=>({eventId,sourceId:'actual-ally',movingId:'wyvern',weaponReference:'Scimitar',sourcePointZFeet:0,movingPointOffsetZFeet:0,factId:'actual-clearance',actualRetainedBodyPointsConfirmed:true,source,...priority===undefined?{}:{priority}})
 ok(await f.call('record_spatial_opportunity_geometry',observe('actual-simultaneous-guard')))
 const input=f.input({path:[{x:1,y:1,zFeet:0},{x:1,y:1,zFeet:5},{x:1,y:1,zFeet:10}]})
 await refused(f,'fly_native_path',input,'SPATIAL_OPPORTUNITY_ORDER_REQUIRED')
 for(const weaponReference of ['unarmed','whip'])ok(await f.call('record_spatial_opportunity_geometry',{eventId:'actual-priority-'+weaponReference,sourceId:'player',movingId:'wyvern',weaponReference,sourcePointZFeet:0,movingPointOffsetZFeet:0,factId:'actual-clearance',actualRetainedBodyPointsConfirmed:true,source,priority:1}))
 ok(await f.call('record_spatial_opportunity_geometry',observe('actual-priority-guard',2)))
 const a=ok(await f.call('fly_native_path',input));assert.equal(a.pendingReaction.sourceId,'player');assert.equal(a.costFeet,0)
 const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'decline'}));assert.equal(b.pendingReaction.sourceId,'actual-ally');assert.equal(b.costFeet,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

for(const measured of [false,true])test(`a real ${measured?'measured opaque':'unmeasured'} wall never grants an exterior spatial opportunity through its projection`,async t=>{
 const f=await flight(t,{combat:true,near:true,dice:'19'});await qualifyOpportunities(f)
 require('../mcp-server/dist/lib/adventure-map.js').getAdventureMap().maps[0].geometry.edges.push({from:{x:1,y:1},to:{x:2,y:1},kind:'wall'})
 if(measured)ok(await f.call('declare_vertical_barrier',{eventId:'actual-oa-wall-height',barrierId:'actual-oa-wall',mapId:f.state.currentMapId,reference:{kind:'edge',from:{x:1,y:1},to:{x:2,y:1}},bottomZFeet:0,topZFeet:20,actualMeasuredBarrierConfirmed:true,blocksSight:true,source}))
 const input=f.input({path:[{x:1,y:1,zFeet:0},{x:1,y:1,zFeet:5},{x:1,y:1,zFeet:10}]})
 if(measured){assert.equal(ok(await f.call('fly_native_path',input)).costFeet,10);assert.equal(f.state.hero.pending,undefined)}
 else await refused(f,'fly_native_path',input,'SPATIAL_OPPORTUNITY_RAY_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
