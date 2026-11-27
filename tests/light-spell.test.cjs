const test=require('node:test'),assert=require('node:assert/strict')
const{ok,grid}=require('./helpers/mcp-toolkit.cjs')
const{setup,prepareLightObject,cover,refused}=require('./helpers/light-spell-fixture.cjs')
const{getMapSpec}=require('../mcp-server/dist/lib/adventure-map.js')
const{lightingRay}=require('../mcp-server/dist/lib/lighting.js')

test('Light touches the exact measured existing object, keeps optional chosen color, real component source and one-hour source lighting rather than a creature or point',async t=>{
 const f=await setup(t),before=await f.call('get_game_state');ok(await f.call('configure_scene_lighting',{roomId:before.currentRoomId,illumination:'darkness'}))
 assert.equal(ok(await f.call('inspect_lighting',{cell:before.player.position})).canSee,false)
 const cast=ok(await f.cast({lightObject:{objectId:f.object.objectId,color:'amber'}})),after=await f.call('get_game_state'),effect=after.hero.effects.find(e=>e.id===cast.effectId)
 assert.equal(cast.effect,'light-object');assert.equal(cast.objectId,f.object.objectId);assert.equal(cast.color,'amber');assert.deepEqual(effect.targetIds,[]);assert.equal(effect.data.objectId,f.object.objectId);assert.equal(effect.expiresAt,after.worldTimeSeconds+3600)
 assert.deepEqual(after.player.inventory,before.player.inventory);assert.deepEqual(after.player.spellSlots,before.player.spellSlots);assert.equal(after.worldFacts.length,before.worldFacts.length)
 const lit=ok(await f.call('inspect_lighting',{cell:after.player.position}));assert.equal(lit.illumination,'bright');assert.equal(lit.canSee,true);assert.equal(lit.activeLights.find(l=>l.id===cast.effectId).color,'amber')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('missing/creature/point/inventory targets and actual oversized objects refuse before action, dice, slot, effect or observation',async t=>{
 const f=await setup(t)
 await refused(f.call,'cast_spell',{spellId:'light',focusItemId:'component_pouch'},'LIGHT_OBJECT_REQUIRED')
 for(const extra of [{targetId:'player'},{targetIds:['player']},{toCell:f.object.cell},{itemId:'quarterstaff'}])await refused(f.call,'cast_spell',{spellId:'light',lightObject:f.object.selection,focusItemId:'component_pouch',...extra},'LIGHT_OBJECT_TARGET_ONLY')
 await refused(f.call,'cast_spell',{spellId:'light',lightObject:{objectId:'quarterstaff'},focusItemId:'component_pouch'},'LIGHT_REAL_SCENE_OBJECT_REQUIRED')
 const large=await prepareLightObject(f.call,{objectId:'actually-eleven-foot-object',dimensionsFeet:{x:11,y:1,z:1}})
 await refused(f.call,'cast_spell',{spellId:'light',lightObject:large.selection,focusItemId:'component_pouch'},'LIGHT_OBJECT_TOO_LARGE')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual opaque covering suppresses the source seen by real vision and uncovering never resets its duration; exact cost replay is free',async t=>{
 const f=await setup(t),state=await f.call('get_game_state');ok(await f.call('configure_scene_lighting',{roomId:state.currentRoomId,illumination:'darkness'}));const cast=ok(await f.cast()),operation=await cover(f.call,f.object.objectId,'opaque_full')
 const before=await f.call('get_game_state');ok(await f.call('set_light_object_cover',operation));const covered=await f.call('get_game_state');assert.equal(covered.worldTimeSeconds,before.worldTimeSeconds+3);assert.equal(ok(await f.call('inspect_lighting',{cell:state.player.position})).canSee,false);assert.equal(covered.hero.effects.find(e=>e.id===cast.effectId).expiresAt,cast.expiresAt)
 assert.equal(ok(await f.call('set_light_object_cover',operation)).replayed,true);assert.deepEqual(await f.call('get_game_state'),covered)
 ok(await f.call('set_light_object_cover',await cover(f.call,f.object.objectId,'uncovered','actual-uncover',2)));assert.equal(ok(await f.call('inspect_lighting',{cell:state.player.position})).canSee,true);assert.equal((await f.call('get_game_state')).hero.effects.find(e=>e.id===cast.effectId).expiresAt,cast.expiresAt)
 ok(await f.call('advance_time',{seconds:3595}));assert.equal(ok(await f.call('inspect_lighting',{cell:state.player.position})).illumination,'darkness');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('recasting Light ends the previous actual object source and the new source reaches20ft bright plus20ft dim without passing an actual wall',async t=>{
 const f=await setup(t),a=ok(await f.cast({lightObject:{objectId:f.object.objectId,color:'blue'}})),object=await prepareLightObject(f.call,{objectId:'second-actual-object'}),b=ok(await f.cast({lightObject:object.selection})),state=await f.call('get_game_state')
 assert.equal(state.hero.effects.some(e=>e.id===a.effectId),false);assert.equal(state.dmTools.lightSpell.casts[a.castId].endReason,'recast');assert.equal(Object.hasOwn(b,'color'),false)
 const {getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js');for(const r of getAdventureMap(state).rooms.filter(r=>(r.mapId??state.currentMapId)===state.currentMapId))ok(await f.call('configure_scene_lighting',{roomId:r.id,illumination:'darkness'}))
 const current=await f.call('get_game_state'),nav=grid(current),map=getMapSpec(current.currentMapId,current);let dim,blocked
 for(let y=0;y<map.grid.rows;y++)for(let x=0;x<map.grid.cols;x++){const cell={x,y},d=Math.max(Math.abs(x-object.cell.x),Math.abs(y-object.cell.y));if(!nav.free(cell,false))continue;if(d>=5&&d<=8&&lightingRay(current,object.cell,cell,object.objectId))dim??=cell;if(d<=8&&!lightingRay(current,object.cell,cell,object.objectId))blocked??=cell}
 assert.ok(dim,'actual represented clear dim cell');assert.ok(blocked,'actual represented blocked cell');assert.equal(ok(await f.call('inspect_lighting',{cell:dim})).illumination,'dim');assert.equal(ok(await f.call('inspect_lighting',{cell:blocked})).illumination,'darkness');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a cover fact cannot substitute for bound or actually occupied hands and costs remain wholly unspent on refusal',async t=>{
 const f=await setup(t);ok(await f.cast());const operation=await cover(f.call,f.object.objectId,'opaque_full'),constraint={id:'actual-bound-cover-hands',targetId:'player',kind:'hands-bound',source:'The MJ explicitly establishes these actually bound hands now; no grapple, item or inferred condition is created.'}
 ok(await f.call('set_spell_component_constraint',{...constraint,operation:'apply'}));await refused(f.call,'set_light_object_cover',operation,'LIGHT_COVER_HANDS_REQUIRED');ok(await f.call('set_spell_component_constraint',{...constraint,operation:'remove'}));await refused(f.call,'set_light_object_cover',{...operation,handsRequired:2},'LIGHT_COVER_HANDS_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
