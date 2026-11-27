const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',APP_LOG_PERSIST_ENABLED:'false'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{engine,ok}=require('./helpers/mcp-toolkit.cjs'),{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const file=path.join(__dirname,'fixtures/w38-held-pit-w37-r5.json'),fixture=JSON.parse(fs.readFileSync(file,'utf8'))
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),'07150fad5286590019fe6cb8815b956d02ec68109c2a168e3ca02cc9af60e607')
const combatFile=path.join(__dirname,'fixtures/w38-held-pit-w37-combat-r6.json'),combatFixture=JSON.parse(fs.readFileSync(combatFile,'utf8'))
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(combatFile)).digest('hex'),'a719daf71dae5c2dc7e00cbc5e31fc51294545750c5859ffdb8f1d37f5812278')
assert.equal(fixture.provenance.controlledLegacyFixture,true);assert.deepEqual(fixture.provenance.syntheticFields,[])
test.after(()=>pg.restore())
const get=call=>call('get_game_state')
async function refused(call,name,input,code){const before=await get(call),a=await call(name,input);assert.equal(a.code,code,JSON.stringify(a));assert.deepEqual(await get(call),before)}
async function sql(t,call,dice){const state=await get(call),id='held-pit-migration-'+process.pid+'-'+Math.random();t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});const fresh=await engine(t,{characterId:state.characterId,dice});ok(await fresh('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.deepEqual(await get(fresh),state);return fresh}
async function legacy(t,archive=fixture){const call=await engine(t,{characterId:'bard',dice:'19'});ok(await call('replace_game_state',{gameState:archive.gameState}));assert.deepEqual(await get(call),archive.gameState);return call}
// These two positives restore the COMPLETE immutable actual-W37 public/SQL
// archive. No field is edited; they are controlled legacy, not public grants.
test('controlled actual-W37 archive: migration retains original save/costs, then real Bardic bonus chooses the one safe outcome across SQL',async t=>{
 let call=await legacy(t,combatFixture);const before=await get(call),input=combatFixture.migration,id=combatFixture.targetId
 assert.equal(before.phase,'combat');assert.equal(before.bonusActionUsed.player,true)
 await refused(call,'record_vertical_surface',input.observations.surfaces[0],'REACTION_PENDING')
 await refused(call,'migrate_held_pit_save',{...input,pendingId:'not-the-original-save'},'PIT_LEGACY_SAVE_REQUIRED')
 ok(await call('migrate_held_pit_save',input));let state=await get(call),pending=structuredClone(state.hero.pending)
 assert.equal(pending.id,before.hero.pending.id);assert.deepEqual(pending.roll,before.hero.pending.roll);assert.equal(pending.roll.rolls[0],8)
 delete pending.command.toolkitResolution.command.pitDefinition;assert.deepEqual(pending,before.hero.pending)
 assert.deepEqual(state.player.resources,before.player.resources);assert.deepEqual(state.hero.inspiration,before.hero.inspiration);assert.equal(state.worldTimeSeconds,before.worldTimeSeconds)
 assert.deepEqual(state.monsters[id],before.monsters[id]);assert.equal(state.dmTools.traps[input.qualification.trapId].creation,before.dmTools.traps[input.qualification.trapId].creation)
 const bad=structuredClone(state);delete bad.dmTools.traps[input.qualification.trapId].pitGeometry.migration;await refused(call,'replace_game_state',{gameState:bad},'PIT_STATE_MISMATCH')
 const tampered=structuredClone(state);tampered.dmTools.traps[input.qualification.trapId].pitGeometry.migration.originalPending.roll.rolls[0]=20;await refused(call,'replace_game_state',{gameState:tampered},'PIT_STATE_MISMATCH')
 call=await sql(t,call,'1,19');const answer=ok(await call('resolve_reaction',{pendingId:input.pendingId,choice:'bardic_inspiration'}));assert.equal(answer.save.roll.rolls[0],8);assert.equal(answer.save.roll.total,10);assert.equal(answer.save.success,true);assert.equal(answer.damageRoll,undefined)
 state=await get(call);assert.deepEqual(state.monsters[id].position,input.successCell);assert.equal(state.monsters[id].hp.current,before.monsters[id].hp.current);assert.deepEqual(state.player.resources,before.player.resources);assert.deepEqual(state.actionUsed,before.actionUsed);assert.deepEqual(state.bonusActionUsed,before.bonusActionUsed);assert.equal(state.hero.actionCredits,before.hero.actionCredits);assert.equal(state.hero.inspiration.some(e=>e.targetId===id),false)
 call=await sql(t,call,'19');const completed=await get(call);assert.equal(ok(await call('migrate_held_pit_save',input)).replayed,true);assert.deepEqual(await get(call),completed)
 await refused(call,'resolve_reaction',{pendingId:input.pendingId,choice:'bardic_inspiration'},'REACTION_TRIGGER_INVALID');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('controlled actual-W37 archive: decline reuses the original total nine, falls once to the measured lower floor and preserves original grant costs',async t=>{
 let call=await legacy(t);const before=await get(call),input=fixture.migration,id=fixture.targetId
 const invalid=structuredClone(input);invalid.observations.surfaces[1].elevationFeet=-15
 await refused(call,'migrate_held_pit_save',invalid,'PIT_MEASURED_SURFACES_REQUIRED')
 ok(await call('migrate_held_pit_save',input));call=await sql(t,call,'1,19');const result=ok(await call('resolve_reaction',{pendingId:input.pendingId,choice:'decline'}));assert.equal(result.save.roll.rolls[0],8);assert.equal(result.save.success,false);assert.equal(result.damageRoll.total,1)
 let after=await get(call);assert.equal(after.monsters[id].hp.current,before.monsters[id].hp.current-1);assert.deepEqual(after.monsters[id].position,before.monsters[id].position);assert.equal(after.dmTools.jumping.supports[id].elevationFeet,-10);assert.deepEqual(after.player.resources,before.player.resources);assert.deepEqual(after.hero.inspiration,before.hero.inspiration)
 call=await sql(t,call,'19');after=await get(call);assert.equal(ok(await call('migrate_held_pit_save',input)).replayed,true);assert.deepEqual(await get(call),after);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('public foreign Shield window admits no pit migration or geometric bypass and retains its real original attack',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'8,19'}),before=await get(call)
 ok(await call('create_trap',{trapId:'foreign-bear',name:'Mâchoires réelles',template:'bear',cell:before.player.position}));const held=ok(await call('interact_trap',{trapId:'foreign-bear',action:'trigger',targetId:'player'}));assert(held.pendingReaction.options.includes('shield'))
 await refused(call,'migrate_held_pit_save',{...fixture.migration,pendingId:held.pendingReaction.id},'PIT_LEGACY_SAVE_REQUIRED')
 await refused(call,'record_vertical_surface',fixture.migration.observations.surfaces[0],'REACTION_PENDING')
 ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'shield',slotLevel:1}));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
