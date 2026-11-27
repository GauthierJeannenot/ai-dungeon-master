const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn}=require('./helpers/mcp-toolkit.cjs')
const reason='Le MJ établit le contexte physique réellement présent.'
const context=(call,eventId,mode)=>call('set_breathing_context',{entityId:'player',eventId,mode,reason})
const inspect=async call=>ok(await call('inspect_breathing',{entityId:'player'}))
const advance=(call,seconds=6)=>call('advance_time',{seconds})
async function refused(call,name,input,code){const before=await call('get_game_state');assert.equal((await call(name,input)).code,code);assert.deepEqual(await call('get_game_state'),before)}
async function hydrate(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state)}
async function collapse(t,dice){
 const call=await engine(t,{dice})
 await replace(call,state=>{state.player.stats.con=10})
 ok(await context(call,'actual-choking','choking'))
 await refused(call,'advance_time',{seconds:13},'SUFFOCATION_TIME_BOUNDARY')
 ok(await advance(call))
 const state=await call('get_game_state');assert.equal(state.worldTimeSeconds,6);assert.equal(state.player.hp.current,0)
 const breathing=await inspect(call);assert.equal(breathing.playerDying.collapsedAt,6);assert.equal(breathing.playerDying.nextSaveAt,12)
 return call
}
async function saveDue(call){
 ok(await advance(call))
 const event=(await inspect(call)).playerDeathSaveEvent
 assert.equal(event.at,(await call('get_game_state')).worldTimeSeconds)
 return {event,result:ok(await call('roll_death_save',{entityId:'player',eventId:event.eventId}))}
}

test('actual outside-combat collapse exposes exact six-second saves, rejects invented events and keeps its life after air',async t=>{
 const call=await collapse(t,'10,20,19')
 await refused(call,'roll_death_save',{},'PLAYER_DEATH_SAVE_EVENT_REQUIRED')
 await refused(call,'roll_death_save',{entityId:'player',eventId:'invented'},'PLAYER_DEATH_SAVE_EVENT_REQUIRED')
 await refused(call,'advance_time',{seconds:7},'SUFFOCATION_PLAYER_DEATH_SAVE_PENDING')
 const first=await saveDue(call)
 assert.equal(first.result.successes,1);assert.equal(first.result.hpAfter,0);assert.equal(first.result.recoveryBlocked,true)
 const beforeReplay=await call('get_game_state'),replay=ok(await call('roll_death_save',{eventId:first.event.eventId}))
 assert.equal(replay.replayed,true);assert.deepEqual(await call('get_game_state'),beforeReplay)
 ok(await context(call,'actual-air','air'));assert.ok((await inspect(call)).playerDying)
 await hydrate(call)
 const second=await saveDue(call)
 assert.equal(second.result.criticalSuccess,true);assert.equal(second.result.hpAfter,1)
 const after=await call('get_game_state');assert.equal(after.worldTimeSeconds,18);assert.equal(after.actionUsed.player,undefined)
 assert.equal((await inspect(call)).playerDying,undefined)
 await hydrate(call)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('three actual successes remain unstabilized without air, later failure keeps the real witness and actual air grants stability without HP',async t=>{
 const call=await collapse(t,'20,10,10,2,3,19')
 for(let success=1;success<=3;success++){
  const {result}=await saveDue(call)
  assert.equal(result.successes,success);assert.equal(result.stable,false);assert.equal(result.hpAfter,0)
  if(success===1){assert.equal(result.criticalSuccess,true);assert.equal(result.roll.rolls[0],20);assert.equal(result.recoveryBlocked,true);assert.match(result.mechanicalSummary,/bloquée/)}
  await hydrate(call)
 }
 const fourth=await saveDue(call)
 assert.equal(fourth.result.success,false);assert.equal(fourth.result.successes,3);assert.equal(fourth.result.failures,1)
 await hydrate(call)
 ok(await context(call,'air-after-three','air'))
 const after=await call('get_game_state');assert.equal(after.player.hp.current,0);assert.equal(after.player.deathSaves.stable,true)
 assert.equal(after.dmTools.playerRecovery.episode.hours,3)
 assert.equal((await inspect(call)).playerDying,undefined)
 await hydrate(call)
 const replay=ok(await call('roll_death_save',{eventId:fourth.event.eventId}));assert.equal(replay.replayed,true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual suffocation death clears its temporal lifecycle and an exact completed event retry never rolls again',async t=>{
 const call=await collapse(t,'1,1,19')
 assert.equal((await saveDue(call)).result.failures,2)
 const final=await saveDue(call)
 assert.equal(final.result.dead,true);assert.equal(final.result.failures,3)
 assert.equal((await inspect(call)).playerDying,undefined)
 await hydrate(call)
 assert.equal(ok(await call('roll_death_save',{eventId:final.event.eventId})).replayed,true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real combat collapse skips only its own collapse turn and each actual start save spends no normal action',async t=>{
 const call=await engine(t,{dice:'20,1,10,19'}),other=await spawn(call,'commoner')
 await replace(call,state=>{state.player.stats.con=10})
 ok(await call('enter_combat',{combatants:['player',other.id]}))
 ok(await context(call,'combat-choking','choking'))
 ok(await call('next_turn',{actorId:'player',skipAction:true}));ok(await call('next_turn',{actorId:other.id,skipAction:true}))
 let state=await call('get_game_state');assert.equal(state.round,2);assert.equal(state.worldTimeSeconds,6);assert.equal(state.player.hp.current,0)
 await refused(call,'roll_death_save',{},'PLAYER_DEATH_SAVE_COLLAPSE_TURN')
 ok(await call('next_turn',{actorId:'player',skipAction:true}));ok(await call('next_turn',{actorId:other.id,skipAction:true}))
 const result=ok(await call('roll_death_save',{}));assert.equal(result.successes,1);assert.equal(result.roll.rolls[0],10)
 state=await call('get_game_state');assert.equal(Boolean(state.actionUsed.player),false);assert.equal(state.worldTimeSeconds,12)
 assert.equal(ok(await call('roll_death_save',{})).replayed,true);assert.deepEqual(await call('get_game_state'),state)
 await hydrate(call)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a legacy zero-HP player without an actual suffocation source cannot fabricate a temporal event',async t=>{
 const call=await engine(t,{dice:'19'})
 await replace(call,state=>{state.player.hp.current=0;state.player.deathSaves={successes:0,failures:0};state.player.conditions.push('unconscious')})
 await refused(call,'roll_death_save',{entityId:'player',eventId:'fabricated'},'PLAYER_DEATH_SAVE_EVENT_REQUIRED')
 assert.equal((await inspect(call)).playerDeathSaveEvent,null)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
