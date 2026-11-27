const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js')
const {createMonster}=require('../mcp-server/dist/mcp-server/tools/phase-tools.js')
const {entityVerticalContext,entityGroundContact}=require('../mcp-server/dist/lib/jumping-state.js')
const {playerHandOccupancy}=require('../mcp-server/dist/lib/hand-occupancy.js')
const source='Actual measured physical medium, support and source-specific MJ adjudication in this scene.'
async function setup(t,options={}){
 const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,dice:'19,1,17',...options}),callbacks={}
 f.target.position={x:11,y:4}
 const server={tool(n,d,s,fn){callbacks[n]=v=>fn(require('zod').z.object(s).parse(v))},registerTool(n,c,fn){callbacks[n]=v=>fn(require('zod').z.object(c.inputSchema).parse(v))}}
 require('../mcp-server/dist/mcp-server/tools/special-movement-tools.js').registerSpecialMovementTools(server)
 require('../mcp-server/dist/mcp-server/tools/vertical-tools.js').registerVerticalTools(server)
 require('../mcp-server/dist/mcp-server/tools/vertical-barrier-tools.js').registerVerticalBarrierTools(server)
 require('../mcp-server/dist/mcp-server/tools/rest-tools.js').registerRestTools(server)
 const old=f.call;f.call=async(n,v={})=>callbacks[n]?JSON.parse((await callbacks[n](v)).content[0].text):old(n,v)
 return f
}
const cells=[{x:1,y:2},{x:2,y:2},{x:3,y:2},{x:4,y:2}]
async function water(f,extra={}){
 const fact=ok(await f.call('record_scene_fact',{description:source,cell:cells[0]})).worldFact
 const args={eventId:'real-water-fact',mediumId:'actual-water',mapId:gs.getState().currentMapId,roomId:'firing-room',mode:'swim',cells,bottomZFeet:-5,topZFeet:2,surfaceZFeet:2,factId:fact.id,actualPhysicalMediumConfirmed:true,handsRequired:0,difficult:false,source,...extra}
 ok(await f.call('record_movement_medium',args));return args
}
async function surface(f,id,z=0,cell={x:1,y:2}){return ok(await f.call('record_vertical_surface',{eventId:'measure-'+id,surfaceId:id,mapId:gs.getState().currentMapId,roomId:'firing-room',cells:[cell],kind:'support',elevationFeet:z,actualGeometryConfirmed:true,source}))}
async function climb(f,extra={}){
 getAdventureMap().maps[0].geometry.edges.push({from:{x:1,y:2},to:{x:2,y:2},kind:'wall'})
 ok(await f.call('declare_vertical_barrier',{eventId:'real-face-measurement',barrierId:'actual-face',mapId:gs.getState().currentMapId,reference:{kind:'edge',from:{x:1,y:2},to:{x:2,y:2}},bottomZFeet:0,topZFeet:20,actualMeasuredBarrierConfirmed:true,source}))
 const fact=ok(await f.call('record_scene_fact',{description:source,cell:cells[0]})).worldFact
 ok(await f.call('record_movement_medium',{eventId:'real-climb-fact',mediumId:'actual-climb',mapId:gs.getState().currentMapId,roomId:'firing-room',mode:'climb',cells:[cells[0]],bottomZFeet:0,topZFeet:20,barrierId:'actual-face',factId:fact.id,actualPhysicalMediumConfirmed:true,handsRequired:1,difficult:false,source,...extra}))
}
const swim=(extra={})=>({eventId:'actual-swim',entityId:'player',mediumId:'actual-water',path:[{x:1,y:2,zFeet:0},{x:2,y:2,zFeet:0},{x:3,y:2,zFeet:0}],actualClearanceConfirmed:true,surfaceSwimmingConfirmed:true,source,...extra})
const climbMove=(extra={})=>({eventId:'actual-climb-move',entityId:'player',mediumId:'actual-climb',path:[{x:1,y:2,zFeet:0},{x:1,y:2,zFeet:5},{x:1,y:2,zFeet:10}],actualClearanceConfirmed:true,source,...extra})
async function combat(f,ids=['player','target']){ok(await f.call('enter_combat',{combatants:ids}))}
function hydrate(){gs.replaceState(structuredClone(gs.getState()))}

test('ordinary surface swimming spends two actual feet per foot, not an action, time or a second grounded position',async t=>{
 const f=await setup(t);await water(f);await combat(f);const at=gs.getState().worldTimeSeconds,a=ok(await f.call('move_by_climbing_or_swimming',swim()))
 assert.equal(a.costFeet,20);assert.equal(a.goalReached,true);assert.equal(a.nativeModeSpeed,false);assert.equal(gs.getState().movementUsed.player,4);assert.equal(gs.getState().actionUsed.player??false,false);assert.equal(gs.getState().worldTimeSeconds,at)
 assert.equal(entityVerticalContext(gs.getState(),'player').zFeet,0);assert.equal(entityGroundContact(gs.getState(),'player',{x:3,y:2},0).contact,false);assert.equal(gs.getState().dmTools.jumping.supports.player,undefined);hydrate()
 const before=structuredClone(gs.getState());assert.equal(ok(await f.call('move_by_climbing_or_swimming',swim())).replayed,true);assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('difficult surface water uses the standard additive three feet per foot without a native speed',async t=>{const f=await setup(t);await water(f,{difficult:true});await combat(f);const a=ok(await f.call('move_by_climbing_or_swimming',swim()));assert.equal(a.costFeet,30);assert.equal(gs.getState().movementUsed.player,6)})
test('the actual Giant Frog swimming speed ignores only the swimming surcharge and keeps difficult terrain plus all prior movement',async t=>{
 const f=await setup(t,{dice:'1,19,1,17'});await water(f,{difficult:true,cells:[...cells,{x:1,y:3},{x:2,y:3}]});const frog={...createMonster('giant_frog',{x:1,y:3}),id:'real-swimmer',hostile:false};gs.getState().monsters[frog.id]=frog
 await combat(f,['player',frog.id,'target']);assert.equal(gs.getState().currentTurn,frog.id);gs.addMovementUsed(frog.id,1)
 const a=ok(await f.call('move_by_climbing_or_swimming',swim({entityId:frog.id,path:[{x:1,y:3,zFeet:0},{x:2,y:3,zFeet:0}]})));assert.equal(a.nativeModeSpeed,true);assert.equal(a.costFeet,10);assert.equal(gs.getState().movementUsed[frog.id],3)
})
test('a real vertical climb pays height and shares its remaining budget; the body reaches only its selected actual ledge',async t=>{
 const f=await setup(t);await climb(f);await surface(f,'actual-floor');ok(await f.call('observe_standing_surface',{eventId:'actual-floor-support',entityId:'player',surfaceId:'actual-floor',actualCurrentSupportConfirmed:true,source}));await surface(f,'actual-ledge',10);await combat(f);const a=ok(await f.call('move_by_climbing_or_swimming',climbMove({landingSurfaceId:'actual-ledge'})))
 assert.equal(a.costFeet,20);assert.equal(a.goalReached,true);assert.equal(entityVerticalContext(gs.getState(),'player').zFeet,10);assert.equal(entityGroundContact(gs.getState(),'player',{x:1,y:2},10).contact,true);assert.equal(gs.getState().dmTools.jumping.locomotion.locations.player,undefined);hydrate();assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('an explicitly partial real climb retains its paid suspended height and actual reserved hand instead of inventing a ledge',async t=>{
 const f=await setup(t);await climb(f);await combat(f);gs.addMovementUsed('player',4)
 const a=ok(await f.call('move_by_climbing_or_swimming',climbMove({allowPartial:true})));assert.equal(a.costFeet,10);assert.equal(a.goalReached,false);assert.equal(entityVerticalContext(gs.getState(),'player').zFeet,5);assert.equal(entityGroundContact(gs.getState(),'player',{x:1,y:2},5).contact,false);assert.equal(playerHandOccupancy(gs.getState()).free,0);hydrate()
})
test('whole-route budget and actual occupied hands refuse before optional Athletics or any movement die',async t=>{
 const f=await setup(t,{dice:'19,1,17'});await climb(f,{handsRequired:2,athletics:{reason:'slippery_surface',dc:18,source}});await combat(f)
 await refused(f,'move_by_climbing_or_swimming',climbMove(),'LOCOMOTION_HANDS_OCCUPIED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('the optional rough-water Athletics check can hold its one true d20 and Inspiration through hydration before any swimming cost',async t=>{
 const f=await setup(t,{dice:'19,1,8,8,17'});await water(f,{athletics:{reason:'rough_water',dc:18,source}});await combat(f);gs.getState().hero.inspiration.push({targetId:'player',die:8,expiresAt:gs.getState().worldTimeSeconds+600})
 const a=ok(await f.call('move_by_climbing_or_swimming',swim()));assert.equal(a.pendingReaction?.command.type,'check');assert.deepEqual(gs.getPlayer().position,{x:1,y:2});assert.equal(gs.getMovementUsed('player'),0);hydrate()
 const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(b.costFeet,20);assert.equal(gs.getMovementUsed('player'),4);assert.equal(gs.getState().hero.inspiration.length,0);hydrate();assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('failed optional Athletics grants no distance or invented fall, and an event nonce cannot reroll the same physical attempt',async t=>{
 const f=await setup(t,{dice:'19,1,1,17'});await water(f,{athletics:{reason:'rough_water',dc:18,source}});await combat(f)
 const a=ok(await f.call('move_by_climbing_or_swimming',swim()));assert.equal(a.costFeet,0);assert.equal(a.goalReached,false);assert.equal(a.fallInvented,false);const b=ok(await f.call('move_by_climbing_or_swimming',swim({eventId:'nonce-not-a-new-physical-attempt'})));assert.equal(b.samePhysicalAttempt,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('an actual swimmer exits onto its selected bank and may then use normal walking with the same already-used movement',async t=>{
 const f=await setup(t);await water(f,{cells:[{x:2,y:2}]});await surface(f,'actual-bank',0,{x:3,y:2});await combat(f)
 const a=ok(await f.call('move_by_climbing_or_swimming',swim({landingSurfaceId:'actual-bank'})));assert.equal(a.costFeet,20);assert.equal(entityGroundContact(gs.getState(),'player',{x:3,y:2},0).contact,true)
 const b=ok(await f.call('move_token',{tokenId:'player',toCell:{x:4,y:2}}));assert.equal(b.costCells,1);assert.equal(gs.getMovementUsed('player'),5);hydrate()
})
test('suspended or swimming bodies cannot acquire a free floor by ordinary walk, a standing observation or a new jump event',async t=>{
 const f=await setup(t);await water(f);await surface(f,'unreached-bank',0,{x:3,y:2});await combat(f);ok(await f.call('move_by_climbing_or_swimming',swim()))
 await refused(f,'move_token',{tokenId:'player',toCell:{x:4,y:2}},'LOCOMOTION_PATH_REQUIRED')
 await refused(f,'observe_standing_surface',{eventId:'fake-bank-arrival',entityId:'player',surfaceId:'unreached-bank',actualCurrentSupportConfirmed:true,source},'VERTICAL_REAL_MOVEMENT_REQUIRED')
 await refused(f,'jump',{eventId:'fake-floating-takeoff',kind:'long',toCell:{x:4,y:2}},'LOCOMOTION_JUMP_TAKEOFF_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('ordinary ground movement cannot invent a floor through the observed water before any Stealth die',async t=>{
 const f=await setup(t,{dice:'17'});await water(f,{cells:[{x:2,y:2}]});gs.replaceState(structuredClone(gs.getState()),{prepareSocial:true})
 await refused(f,'move_token',{tokenId:'player',toCell:{x:2,y:2},stealth:true},'SWIMMING_MEDIUM_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('a true completed fall from the paid climbing height reaches only its selected existing floor and clears the reserved grip once',async t=>{
 const f=await setup(t,{dice:'19,1,4,17'});await climb(f);await surface(f,'real-fall-floor');ok(await f.call('observe_standing_surface',{eventId:'real-fall-floor-standing',entityId:'player',surfaceId:'real-fall-floor',actualCurrentSupportConfirmed:true,source}));await combat(f)
 ok(await f.call('move_by_climbing_or_swimming',climbMove()));assert.equal(entityVerticalContext(gs.getState(),'player').zFeet,10);assert.equal(playerHandOccupancy(gs.getState()).free,0)
 const beforeHp=gs.getPlayer().hp.current,args={eventId:'one-real-climbing-fall',entityId:'player',landingSurfaceId:'real-fall-floor',reason:source},a=ok(await f.call('complete_locomotion_fall',args))
 assert.equal(a.distanceFeet,10);assert.equal(a.roll.total,4);assert.equal(gs.getPlayer().hp.current,beforeHp-a.damageResolution.damageDealt);assert.equal(entityVerticalContext(gs.getState(),'player').zFeet,0);assert.equal(entityGroundContact(gs.getState(),'player',{x:1,y:2},0).contact,true);assert.equal(playerHandOccupancy(gs.getState()).free,1);hydrate()
 const before=structuredClone(gs.getState());assert.equal(ok(await f.call('complete_locomotion_fall',args)).replayed,true);assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('surface-swimming opportunity pauses and resumes only the same paid water route without rerolling an attack or a movement check',async t=>{
 const f=await setup(t);await water(f);f.target.position={x:2,y:1};await combat(f)
 const args=swim({path:[{x:1,y:2,zFeet:0},{x:2,y:2,zFeet:0},{x:3,y:2,zFeet:0},{x:4,y:2,zFeet:0}]}),a=ok(await f.call('move_by_climbing_or_swimming',args));assert.equal(a.pendingReaction.command.specialMovementId,args.eventId);assert.equal(gs.getMovementUsed('player'),4);assert.deepEqual(gs.getPlayer().position,{x:3,y:2});hydrate()
 const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'decline'}));assert.equal(b.eventId,args.eventId);assert.equal(b.costFeet,30);assert.equal(gs.getMovementUsed('player'),6);assert.deepEqual(gs.getPlayer().position,{x:4,y:2});hydrate();assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('a real swimming bank arrival stops on its true bearing contact and completes once after that explicitly resolved save',async t=>{
 const f=await setup(t,{dice:'20,17'});f.state.player.inventory.push({id:'actual-bank-bearings',equipmentId:'ball_bearings',name:'Real bearings',type:'misc'})
 const fact=ok(await f.call('record_scene_fact',{description:source,cell:{x:1,y:2}})).worldFact
 ok(await f.call('place_ground_gear',{placementId:'actual-bank-hazard',itemId:'actual-bank-bearings',originCell:{x:1,y:2},surfaceZFeet:0,surfaceFactId:fact.id,levelSurfaceConfirmed:true}))
 ok(await f.call('set_ground_gear_pace',{eventId:'actual-safe-departure',entityId:'player',pace:'careful'}));ok(await f.call('move_token',{tokenId:'player',toCell:{x:0,y:2}}));ok(await f.call('set_ground_gear_pace',{eventId:'actual-normal-pace',entityId:'player',pace:'normal'}))
 await water(f,{cells:[{x:1,y:2}]});await surface(f,'bearing-bank',0,{x:2,y:2})
 const args=swim({path:[{x:0,y:2,zFeet:0},{x:1,y:2,zFeet:0},{x:2,y:2,zFeet:0}],landingSurfaceId:'bearing-bank'}),a=ok(await f.call('move_by_climbing_or_swimming',args));assert.equal(a.groundGearContactIds.length,1);assert.equal(a.costFeet,20);hydrate()
 const b=ok(await f.call('resolve_ground_gear_contact',{contactId:a.groundGearContactIds[0],orderedPlacementIds:['actual-bank-hazard']}));assert.equal(b.eventId,args.eventId);assert.equal(b.costFeet,20);assert.equal(b.goalReached,true);assert.equal(Object.keys(gs.getState().dmTools.groundGear.contacts).length,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('actual native walking and swimming speeds subtract the same prior movement instead of granting a new allowance on each switch',async t=>{
 const f=await setup(t,{dice:'1,19,1,1,17'});await water(f,{cells:[{x:3,y:4},{x:4,y:4}]});await surface(f,'frog-bank',0,{x:5,y:4})
 f.state.player.inventory.push({id:'real-injuring-caltrops',equipmentId:'caltrops',name:'Actual injury source',type:'misc'})
 const fact=ok(await f.call('record_scene_fact',{description:source,cell:{x:2,y:3}})).worldFact
 ok(await f.call('place_ground_gear',{placementId:'actual-walking-injury',itemId:'real-injuring-caltrops',originCell:{x:2,y:3},surfaceZFeet:0,surfaceFactId:fact.id}))
 const frog={...createMonster('giant_frog',{x:1,y:3}),id:'real-two-speed-body',hostile:false};gs.getState().monsters[frog.id]=frog;await combat(f,['player',frog.id,'target']);assert.equal(gs.getState().currentTurn,frog.id)
 const hit=ok(await f.call('move_token',{tokenId:frog.id,toCell:{x:2,y:3}}));ok(await f.call('resolve_ground_gear_contact',{contactId:hit.groundGearContactIds[0],orderedPlacementIds:['actual-walking-injury']}))
 assert.equal(gs.getState().dmTools.groundGear.walkingInjuries[frog.id].penaltyFeet,10)
 ok(await f.call('next_turn',{actorId:frog.id,skipAction:true}));ok(await f.call('next_turn',{actorId:'player',skipAction:true}));ok(await f.call('next_turn',{actorId:'target',skipAction:true}));assert.equal(gs.getState().currentTurn,frog.id)
 ok(await f.call('move_token',{tokenId:frog.id,toCell:{x:2,y:4}}));assert.equal(gs.getMovementUsed(frog.id),1)
 const a=ok(await f.call('move_by_climbing_or_swimming',swim({entityId:frog.id,path:[{x:2,y:4,zFeet:0},{x:3,y:4,zFeet:0},{x:4,y:4,zFeet:0},{x:5,y:4,zFeet:0}],landingSurfaceId:'frog-bank'})));assert.equal(a.nativeModeSpeed,true);assert.equal(a.costFeet,15);assert.equal(gs.getMovementUsed(frog.id),4)
 await refused(f,'move_token',{tokenId:frog.id,toCell:{x:6,y:4}},'MOVEMENT_EXCEEDED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('the actual Grick climbing speed removes only the climbing extra, without a free level or invented creature profile',async t=>{
 const f=await setup(t,{dice:'1,19,1,17'});f.state.player.position={x:0,y:2};await climb(f,{handsRequired:0})
 const grick={...createMonster('grick',{x:1,y:2}),id:'real-native-climber',hostile:false};gs.getState().monsters[grick.id]=grick;await combat(f,['player',grick.id,'target'])
 const a=ok(await f.call('move_by_climbing_or_swimming',climbMove({entityId:grick.id})));assert.equal(a.costFeet,10);assert.equal(a.nativeModeSpeed,true);assert.equal(entityVerticalContext(gs.getState(),grick.id).zFeet,10);assert.equal(entityGroundContact(gs.getState(),grick.id,{x:1,y:2},10).contact,false);hydrate();assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('insufficient whole-route movement rejects before the optional rough-water skill die even with real free hands',async t=>{
 const f=await setup(t);await water(f,{athletics:{reason:'rough_water',dc:18,source}});await combat(f);gs.addMovementUsed('player',5)
 await refused(f,'move_by_climbing_or_swimming',swim(),'MOVEMENT_EXCEEDED');assert.equal(gs.getState().hero.pending,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('an actual nearby source enemy on a different measured level refuses before the original Athletics die, without a global altitude ban',async t=>{
 const f=await setup(t);f.target.position={x:2,y:1};await water(f,{athletics:{reason:'rough_water',dc:18,source}});await surface(f,'enemy-real-level',3,{x:2,y:1});ok(await f.call('observe_standing_surface',{eventId:'enemy-level-observation',entityId:'target',surfaceId:'enemy-real-level',actualCurrentSupportConfirmed:true,source}));await combat(f)
 await refused(f,'move_by_climbing_or_swimming',swim(),'LOCOMOTION_VERTICAL_OPPORTUNITY_CONTEXT_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('a lost capable climbing grip retains the real physical outcome before another turn, and its one explicit measured fall is still resolvable',async t=>{
 const f=await setup(t,{dice:'19,1,4,17'});await climb(f);await surface(f,'incap-fall-floor');ok(await f.call('observe_standing_surface',{eventId:'incap-floor-standing',entityId:'player',surfaceId:'incap-fall-floor',actualCurrentSupportConfirmed:true,source}));await combat(f);ok(await f.call('move_by_climbing_or_swimming',climbMove()))
 ok(await f.call('apply_condition',{entityId:'player',condition:'unconscious'}));const {locomotionPhysicalIssue}=require('../mcp-server/dist/lib/locomotion-geometry.js');assert.equal(locomotionPhysicalIssue(gs.getState()).entityId,'player')
 await refused(f,'next_turn',{actorId:'player',skipAction:true},'LOCOMOTION_PHYSICAL_OUTCOME_REQUIRED');hydrate()
 const a=ok(await f.call('complete_locomotion_fall',{eventId:'true-incapacitated-fall',entityId:'player',landingSurfaceId:'incap-fall-floor',reason:source}));assert.equal(a.distanceFeet,10);assert.equal(a.roll.total,4);assert.equal(locomotionPhysicalIssue(gs.getState()),null);assert.equal(entityVerticalContext(gs.getState(),'player').zFeet,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('a genuinely removed measured wall does not leave a free platform or consume a damage die before the explicit completed fall',async t=>{
 const f=await setup(t,{dice:'19,1,4,17'});await climb(f);await surface(f,'wall-fall-floor');ok(await f.call('observe_standing_surface',{eventId:'wall-floor-standing',entityId:'player',surfaceId:'wall-fall-floor',actualCurrentSupportConfirmed:true,source}));await combat(f);ok(await f.call('move_by_climbing_or_swimming',climbMove()));getAdventureMap().maps[0].geometry.edges=[]
 await refused(f,'combat_action',{actorId:'player',action:'dash'},'LOCOMOTION_PHYSICAL_OUTCOME_REQUIRED');const a=ok(await f.call('complete_locomotion_fall',{eventId:'true-lost-wall-fall',entityId:'player',landingSurfaceId:'wall-fall-floor',reason:source}));assert.equal(a.roll.total,4);assert.equal(entityVerticalContext(gs.getState(),'player').zFeet,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('hydration refuses an invented body height or lost physical movement receipt without changing the actual state or consuming a die',async t=>{
 const f=await setup(t);await water(f);await combat(f);ok(await f.call('move_by_climbing_or_swimming',swim()));const before=structuredClone(gs.getState()),bad=structuredClone(before)
 bad.dmTools.jumping.locomotion.locations.player.cell.zFeet=50
 assert.throws(()=>gs.replaceState(bad),error=>error.code==='JUMP_STATE_INVALID');assert.deepEqual(gs.getState(),before)
 const missing=structuredClone(before);delete missing.dmTools.jumping.locomotion.receipts['actual-swim'];assert.throws(()=>gs.replaceState(missing),error=>error.code==='JUMP_STATE_INVALID');assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('an actual same-XY climb is witnessed as instantaneous strenuous activity in the existing rest without inventing elapsed seconds',async t=>{
 const f=await setup(t,{dice:'17'});await climb(f);ok(await f.call('begin_rest',{restId:'actual-ground-short-rest',kind:'short'}));const at=gs.getState().worldTimeSeconds
 const a=ok(await f.call('move_by_climbing_or_swimming',climbMove({path:[{x:1,y:2,zFeet:0},{x:1,y:2,zFeet:5}]})));assert.equal(a.costFeet,10);assert.equal(gs.getState().worldTimeSeconds,at)
 const segments=gs.getState().dmTools.rests.active.segments;assert.equal(segments.length,1);assert.equal(segments[0].activity,'strenuous');assert.equal(segments[0].from,at);assert.equal(segments[0].to,at);assert.notEqual(segments[0].observation.before,segments[0].observation.after);hydrate();assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('a genuinely changed object reference can be remeasured without moving the climber or replacing its earlier real route receipts',async t=>{
 const f=await setup(t,{dice:'17'});const object=ok(await f.call('create_scene_object',{objectId:'real-climbing-object',name:'Real observed face',description:source,cell:{x:2,y:2},kind:'obstacle',material:'wood',size:'small',resilience:'resilient'})).object
 const barrier={eventId:'object-face-first',barrierId:'object-face',mapId:gs.getState().currentMapId,reference:{kind:'object',objectId:object.id,footprint:{minXFeet:7.5,maxXFeet:12.5,minYFeet:7.5,maxYFeet:12.5}},bottomZFeet:0,topZFeet:20,actualMeasuredBarrierConfirmed:true,source};ok(await f.call('declare_vertical_barrier',barrier))
 const fact=ok(await f.call('record_scene_fact',{description:source,cell:{x:1,y:2}})).worldFact
 const medium={eventId:'object-face-medium-first',mediumId:'actual-climb',mapId:gs.getState().currentMapId,roomId:'firing-room',mode:'climb',cells:[{x:1,y:2}],bottomZFeet:0,topZFeet:20,barrierId:'object-face',factId:fact.id,actualPhysicalMediumConfirmed:true,handsRequired:1,difficult:false,source};ok(await f.call('record_movement_medium',medium))
 ok(await f.call('move_by_climbing_or_swimming',climbMove({path:[{x:1,y:2,zFeet:0},{x:1,y:2,zFeet:5}]})));const earlier=structuredClone(gs.getState().dmTools.jumping.locomotion.receipts['actual-climb-move'])
 // Unit fixture: the already prepared real scene object has suffered one HP
 // of physical damage. Its old reference witness must now be stale.
 gs.getState().dmTools.objects[object.id].hp.current-=1
 assert.equal(require('../mcp-server/dist/lib/locomotion-geometry.js').locomotionPhysicalIssue(gs.getState()).entityId,'player')
 ok(await f.call('declare_vertical_barrier',{...barrier,eventId:'object-face-remeasurement'}));ok(await f.call('record_movement_medium',{...medium,eventId:'object-face-medium-refreshed',reobserveChangedPhysicalReferenceConfirmed:true}))
 assert.equal(entityVerticalContext(gs.getState(),'player').zFeet,5);assert.deepEqual(gs.getState().dmTools.jumping.locomotion.receipts['actual-climb-move'],earlier);hydrate()
 const a=ok(await f.call('move_by_climbing_or_swimming',climbMove({eventId:'same-true-climber-next-segment',path:[{x:1,y:2,zFeet:5},{x:1,y:2,zFeet:10}]})));assert.equal(a.costFeet,10);assert.equal(entityVerticalContext(gs.getState(),'player').zFeet,10);hydrate();assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
