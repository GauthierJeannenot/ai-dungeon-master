const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{engine,ok,adjacent,grid}=require('./helpers/mcp-toolkit.cjs')
const{setup,prepareLightObject,cover,refused}=require('./helpers/light-spell-fixture.cjs')
const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
test.after(()=>pg.restore())
async function resume(t,call){const s=await call('get_game_state'),id=`actual-object-light-${process.pid}-${Date.now()}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:s,history:[],adventureId:s.adventureId,characterId:s.characterId});const next=await engine(t,{adventureId:s.adventureId,characterId:s.characterId,dice:'19'});ok(await next('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.deepEqual(await next('get_game_state'),s);return next}

test('actual object cover, its cost receipt and original expiry survive SQL/new process without another manipulation or an hour reset',async t=>{
 const f=await setup(t),cast=ok(await f.cast()),operation=await cover(f.call,f.object.objectId,'opaque_full');ok(await f.call('set_light_object_cover',operation));const next=await resume(t,f.call),before=await next('get_game_state');assert.equal(ok(await next('set_light_object_cover',operation)).replayed,true);assert.deepEqual(await next('get_game_state'),before);assert.equal(ok(await next('inspect_lighting',{cell:f.object.cell})).activeLights.some(l=>l.id===cast.effectId),false);ok(await next('set_light_object_cover',await cover(next,f.object.objectId,'uncovered','actual-source-uncover')));assert.equal((await next('get_game_state')).hero.effects.find(e=>e.id===cast.effectId).expiresAt,cast.expiresAt);assert.equal(ok(await next('roll_dice',{notation:'1d20'})).total,19)
})

test('SQL rejects altered measured source, copied effect, extended duration and old cover head without changing the real original Light',async t=>{
 const f=await setup(t),cast=ok(await f.cast());ok(await f.call('set_light_object_cover',await cover(f.call,f.object.objectId,'opaque_full')));const original=await f.call('get_game_state')
 for(const alter of [s=>s.dmTools.lightSpell.objects[f.object.objectId].input.dimensionsFeet.x=0.1,s=>s.dmTools.lightSpell.objects[f.object.objectId].coverEventId=f.object.input.eventId,s=>s.dmTools.lightSpell.casts[cast.castId].casterId='not-actual-player',s=>s.dmTools.lightSpell.casts[cast.castId].generation=9,s=>{s.dmTools.lightSpell.casts[cast.castId].expiresAt+=3600;s.hero.effects.find(e=>e.id===cast.effectId).expiresAt+=3600},s=>s.hero.effects.push({...structuredClone(s.hero.effects.find(e=>e.id===cast.effectId)),id:'fabricated-second-light'})]){const bad=structuredClone(original);alter(bad);await refused(f.call,'replace_game_state',{gameState:bad},'LIGHT_SPELL_STATE_INVALID')}
 const next=await resume(t,f.call);assert.deepEqual(await next('get_game_state'),original);assert.equal(ok(await next('roll_dice',{notation:'1d20'})).total,19)
})

test('Light follows one actually transported scene object through true custody/movement and SQL, never the caster or a duplicate inventory item',async t=>{
 const f=await setup(t),s=await f.call('get_game_state'),object=await prepareLightObject(f.call,{objectId:'actual-mobile-light-object',cell:adjacent(s)[0]}),cast=ok(await f.cast({lightObject:object.selection}))
 ok(await f.call('equip_item',{itemId:'quarterstaff',operation:'unequip',slot:'main_hand'}))
 // The cast is already real. Drop actual source equipment rather than invent
 // unknown ration/waterskin masses merely to make a carrying fixture pass.
 for(const item of (await f.call('get_game_state')).player.inventory)ok(await f.call('drop_item',{itemId:item.id}))
 const source='Actual measured body size and whole empty box payload are explicitly established; no object, contents, mass from prose, movement or source capability is created.'
 ok(await f.call('set_carrying_context',{eventId:'actual-light-carrier-size',entityId:'player',size:'Medium',reason:source,source}));ok(await f.call('declare_physical_weight',{eventId:'actual-light-object-mass',targetKind:'object',targetId:object.objectId,weightLb:10,unit:'lb_total',reason:source,source}));assert.equal(ok(await f.call('inspect_carrying_capacity',{entityId:'player'})).status,'resolved')
 ok(await f.call('begin_handling_load',{loadId:'actual-light-grip',actorId:'player',targetKind:'object',targetId:object.objectId,operation:'carry',control:'inanimate',hands:1,mobilityConfirmed:true,interactionCost:'interaction',objectFootprint:{widthCells:1,heightCells:1,source:'Actual one-cell horizontal footprint of this exact box.'},reason:source,source}));let current=await f.call('get_game_state'),pair;const nav=grid(current),from=current.player.position
 for(const toCell of nav.neighbors(from)){if(!nav.step(from,toCell))continue;const targetToCell={x:object.cell.x+toCell.x-from.x,y:object.cell.y+toCell.y-from.y},input={loadId:'actual-light-grip',actorId:'player',targetId:object.objectId,toCell,targetToCell},preview=await f.call('preview_handled_load',input);if(!preview.error){pair=input;break}}
 assert.ok(pair,'a real legal actual paired path is required');ok(await f.call('move_handled_load',pair));current=await f.call('get_game_state');assert.deepEqual(current.dmTools.objects[object.objectId].cell,pair.targetToCell);assert.equal(current.player.inventory.some(i=>i.id===object.objectId),false);let light=ok(await f.call('inspect_lighting',{cell:pair.targetToCell})).activeLights.find(l=>l.id===cast.effectId);assert.deepEqual(light.cell,pair.targetToCell);assert.notDeepEqual(light.cell,current.player.position)
 const next=await resume(t,f.call);light=ok(await next('inspect_lighting',{cell:pair.targetToCell})).activeLights.find(l=>l.id===cast.effectId);assert.deepEqual(light.cell,pair.targetToCell);assert.equal((await next('get_game_state')).dmTools.objects[object.objectId].id,object.objectId);assert.equal(ok(await next('roll_dice',{notation:'1d20'})).total,19)
})
