const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,addSupply,battle}=require('./helpers/mcp-toolkit.cjs')
async function inspect(call){return ok(await call('inspect_player_recovery'))}
async function hydrate(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,input,code){const before=await call('get_game_state');const answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)}
const hurt=(call,delta)=>call('update_hp',{entityId:'player',delta,damageType:'force',damageOrigin:'environment',reason:'Dégât réel établi pour cette scène.'})
async function stabilize(t,dice='2,19'){
 const call=await engine(t,{dice}),helper=await spawn(call,'commoner');await addSupply(call,'healers_kit','real-kit')
 await replace(call,state=>{state.player.stats.con=10})
 const initial=await call('get_game_state');ok(await hurt(call,-initial.player.hp.current))
 ok(await call('use_item',{itemId:'real-kit',actorId:helper.id,targetId:'player'}))
 return{call,helper,initial}
}
const air=(call,mode,eventId)=>call('set_breathing_context',{entityId:'player',mode,eventId,reason:'Contexte physique réel explicitement établi par le MJ.'})

test('a real healer-kit stabilization observes one d4 and wakes the player at exactly its persisted deadline without healing to full',async t=>{
 const{call,initial}=await stabilize(t),source=(await inspect(call)).recovery
 assert.equal(source.hours,2);assert.equal(source.stabilizedAt,0);assert.equal(source.wakeAt,7200)
 const before=await hydrate(call),read=await inspect(call);assert.deepEqual(read.recovery,source);assert.deepEqual(await call('get_game_state'),before)
 ok(await call('advance_time',{seconds:7199}));assert.equal((await call('get_game_state')).player.hp.current,0)
 const advance=ok(await call('advance_time',{seconds:1}));assert.equal(advance.naturalRecoveries.length,1)
 assert.equal(advance.naturalRecoveries[0].origin,'player_stability');assert.equal(advance.naturalRecoveries[0].wakeAt,7200)
 const after=await hydrate(call);assert.equal(after.player.hp.current,1);assert.ok(after.player.hp.max>1)
 assert.ok(!after.player.conditions.includes('unconscious'));assert.ok(after.player.conditions.includes('prone'))
 assert.equal(after.dmTools.playerRecovery.episode,undefined);assert.equal(after.dmTools.playerRecovery.lastClosed.reason,'recovered')
 const main=initial.dmTools?.loadout?.mainHandId??initial.player.inventory.find(item=>item.type==='weapon')?.id
 assert.ok(after.droppedItems[main])
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('real damage and real healing cancel the prior deadline, and only a new actual stabilization rolls another d4',async t=>{
 const{call,helper}=await stabilize(t,'1,20,3,19'),first=(await inspect(call)).recovery
 ok(await hurt(call,-1));let state=await hydrate(call)
 assert.equal(state.player.deathSaves.stable,false);assert.equal(state.dmTools.playerRecovery.episode,undefined)
 assert.equal(state.dmTools.playerRecovery.lastClosed.reason,'damage')
 ok(await call('advance_time',{seconds:6}));const due=ok(await call('inspect_player_life')).event
 ok(await call('roll_death_save',{entityId:'player',eventId:due.eventId}))
 const passed=ok(await call('advance_time',{seconds:first.wakeAt-6}));assert.equal(passed.naturalRecoveries.length,0)
 ok(await hurt(call,-1));assert.equal((await call('get_game_state')).player.hp.current,0)
 ok(await call('use_item',{itemId:'real-kit',actorId:helper.id,targetId:'player'}))
 const second=(await inspect(call)).recovery;assert.notEqual(second.id,first.id);assert.equal(second.hours,3);assert.equal(second.wakeAt,14400)
 ok(await call('update_hp',{entityId:'player',delta:1,reason:'Soin véritable après la seconde stabilisation.'}));state=await hydrate(call)
 assert.equal(state.dmTools.playerRecovery.episode,undefined);assert.equal(state.dmTools.playerRecovery.lastClosed.reason,'healed')
 ok(await call('advance_time',{seconds:10800}));assert.equal((await call('get_game_state')).player.hp.current,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('three actual successful death saves create their own one-die stabilization at the true final save time',async t=>{
 const call=await engine(t,{dice:'20,1,10,10,10,3,19'}),other=await spawn(call,'commoner'),initial=await call('get_game_state')
 await replace(call,state=>{state.monsters[other.id].hostile=false})
 ok(await hurt(call,-initial.player.hp.current));ok(await call('enter_combat',{combatants:['player',other.id]}))
 for(let index=0;index<3;index++){
  ok(await call('roll_death_save'))
  if(index<2){ok(await call('next_turn',{actorId:'player'}));ok(await call('next_turn',{actorId:other.id,skipAction:true}))}
 }
 const state=await hydrate(call),source=(await inspect(call)).recovery
 assert.equal(state.worldTimeSeconds,12);assert.equal(state.player.deathSaves.stable,true)
 assert.equal(source.stabilizedAt,12);assert.equal(source.hours,3);assert.equal(source.wakeAt,10812)
 ok(await call('end_combat',{force:true,reason:'Le MJ établit la fin réelle de cet affrontement après stabilisation.'}))
 ok(await call('advance_time',{seconds:10800}));assert.equal((await call('get_game_state')).player.hp.current,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a genuine death cancels stable recovery and its old deadline can never resurrect the player',async t=>{
 const{call}=await stabilize(t),old=(await inspect(call)).recovery
 ok(await hurt(call,-999));const dead=await hydrate(call)
 assert.equal(dead.player.deathSaves.dead,true);assert.equal(dead.dmTools.playerRecovery.episode,undefined)
 ok(await call('advance_time',{seconds:old.wakeAt}));const after=await hydrate(call)
 assert.equal(after.player.hp.current,0);assert.equal(after.player.deathSaves.dead,true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a natural recovery reached during choking is held and resolves at actual air, without a new die or a backdated HP',async t=>{
 const{call}=await stabilize(t,'1,19')
 ok(await call('advance_time',{seconds:3599}));ok(await air(call,'choking','lost-air-before-wake'))
 ok(await call('advance_time',{seconds:1}));let state=await hydrate(call)
 assert.equal(state.player.hp.current,0);assert.equal((await inspect(call)).recovery.heldByBreathing.blockedAt,3600)
 ok(await call('advance_time',{seconds:2}));ok(await air(call,'air','real-air-after-wake'))
 state=await hydrate(call);assert.equal(state.worldTimeSeconds,3602);assert.equal(state.player.hp.current,1)
 const closed=state.dmTools.playerRecovery.lastClosed
 assert.equal(closed.episode.wakeAt,3600);assert.equal(closed.episode.heldByBreathing.resumedAt,3602)
 assert.equal(closed.episode.heldByBreathing.airEventId,'real-air-after-wake');assert.equal(closed.at,3602)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real suffocation collapse cancels an already held stable recovery instead of reviving on air',async t=>{
 const{call}=await stabilize(t,'1,19')
 ok(await call('advance_time',{seconds:3599}));ok(await air(call,'choking','lost-air-until-collapse'))
 ok(await call('advance_time',{seconds:6}));let state=await hydrate(call)
 assert.equal(state.worldTimeSeconds,3605);assert.equal(state.player.deathSaves.stable,undefined)
 assert.equal(state.dmTools.playerRecovery.episode,undefined);assert.equal(state.dmTools.playerRecovery.lastClosed.reason,'source_collapse')
 assert.equal(state.dmTools.breathing.creatures.player.playerDying.nextSaveAt,3611)
 ok(await air(call,'air','air-after-real-collapse'));state=await hydrate(call)
 assert.equal(state.player.hp.current,0);assert.equal(state.player.deathSaves.stable,undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an old stable save remains readable but its unknown first possible hour never restarts on hydration',async t=>{
 const call=await engine(t,{dice:'19'})
 await replace(call,state=>{state.player.hp.current=0;state.player.deathSaves={successes:0,failures:0,stable:true};state.player.conditions=['unconscious','prone']})
 const original=await hydrate(call);assert.equal((await inspect(call)).legacyUnresolved,true)
 await refused(call,'advance_time',{seconds:3600},'PLAYER_STABLE_RECOVERY_UNKNOWN')
 ok(await call('advance_time',{seconds:3599}));await hydrate(call)
 await refused(call,'advance_time',{seconds:1},'PLAYER_STABLE_RECOVERY_UNKNOWN')
 assert.equal((await inspect(call)).firstPossibleLegacyBoundary,3600)
 assert.equal((await call('get_game_state')).dmTools.playerRecovery,undefined)
 assert.equal(original.worldTimeSeconds,0);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a stable player keeps the original combat slot and returns to that slot after its real round-boundary recovery',async t=>{
 const call=await engine(t,{dice:'20,1,1,19'}),helper=await spawn(call,'commoner');await addSupply(call,'healers_kit','real-kit')
 ok(await call('enter_combat',{combatants:['player',helper.id]}))
 ok(await call('next_turn',{actorId:'player',skipAction:true}))
 const healthy=await call('get_game_state');ok(await hurt(call,-healthy.player.hp.current))
 ok(await call('use_item',{itemId:'real-kit',actorId:helper.id,targetId:'player'}))
 // Author a quiet interval strictly before the observed deadline; no source
 // event, d4, healing or initiative is reconstructed at the recovery boundary.
 await replace(call,state=>{state.worldTimeSeconds=3594;state.round=600;state.turnCounter=600})
 const initial=await call('get_game_state');assert.equal(initial.currentTurn,helper.id);assert.deepEqual(initial.initiativeOrder,['player',helper.id])
 ok(await call('next_turn',{actorId:helper.id,skipAction:true}));const after=await hydrate(call)
 assert.equal(after.worldTimeSeconds,3600);assert.equal(after.round,601);assert.equal(after.player.hp.current,1);assert.equal(after.currentTurn,'player')
 assert.deepEqual(after.initiativeOrder,initial.initiativeOrder);assert.equal(after.player.initiative,initial.player.initiative)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
