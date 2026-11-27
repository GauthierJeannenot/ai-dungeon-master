const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
const {isSurprised}=require('../mcp-server/dist/lib/surprise-state.js')

async function setup(t,{hours=1,dice=`17,${hours},19`,hp=1}={}){
 const call=await engine(t,{dice}),target=await spawn(call)
 await battle(call,[target.id]);await replace(call,state=>{state.monsters[target.id].hp.current=hp})
 return {call,target}
}
const knock=(call,id)=>call('resolve_player_attack',{targetId:id,weaponOrSpell:'unarmed',nonlethal:true})
async function ko(t,options={}){const fixture=await setup(t,options);fixture.attack=ok(await knock(fixture.call,fixture.target.id));return fixture}
async function ended(call){ok(await call('end_combat'))}
async function roundtrip(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,args,code){const before=await call('get_game_state');assert.equal((await call(name,args)).code,code);assert.deepEqual(await call('get_game_state'),before)}

test('each real 1d4 result is persisted once at stabilization and recovers exactly one HP at its actual hour',async t=>{
 for(const hours of [1,2,3,4])await t.test(String(hours),async t=>{
  const{call,target,attack}=await ko(t,{hours});let state=await roundtrip(call)
  assert.deepEqual(state.monsters[target.id].knockout.recovery,{hours,wakeAt:hours*3600})
  assert.deepEqual(attack.damageResolution.knockout,state.monsters[target.id].knockout)
  await ended(call);const before=await call('get_game_state')
  assert.equal(ok(await call('advance_time',{seconds:hours*3600-1})).naturalRecoveries.length,0)
  state=await roundtrip(call);assert.equal(state.monsters[target.id].hp.current,0);assert.ok(state.monsters[target.id].knockout)
  const resolved=ok(await call('advance_time',{seconds:1}));assert.equal(resolved.naturalRecoveries.length,1)
  const event=resolved.naturalRecoveries[0]
  assert.equal(event.entityId,target.id);assert.equal(event.hours,hours);assert.equal(event.wakeAt,hours*3600)
  assert.equal(event.hpBefore,0);assert.equal(event.hpAfter,1);assert.equal(event.unconsciousRetained,false)
  state=await roundtrip(call);assert.equal(state.monsters[target.id].hp.current,1);assert.equal(state.monsters[target.id].knockout,undefined)
  assert.ok(!state.monsters[target.id].conditions.includes('unconscious'));assert.ok(state.monsters[target.id].conditions.includes('prone'))
  assert.deepEqual(state.monsters[target.id].position,before.monsters[target.id].position)
  assert.deepEqual(state.player.inventory,before.player.inventory);assert.deepEqual(state.droppedItems,before.droppedItems)
  assert.equal(ok(await call('advance_time',{seconds:3600})).naturalRecoveries.length,0)
  assert.equal((await call('get_game_state')).monsters[target.id].hp.current,1)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19,'load, inspection and expiry never reroll the recovery die')
 })
})

test('misses, surviving hits and successful Undead Fortitude do not roll a recovery die',async t=>{
 for(const kind of ['miss','survivor','fortitude'])await t.test(kind,async t=>{
  const call=await engine(t,{dice:kind==='fortitude'?'17,19,4,18':kind==='miss'?'1,4,18':'17,4,18'})
  const target=await spawn(call,kind==='fortitude'?'zombie':'goblin')
  await battle(call,[target.id]);await replace(call,state=>{state.monsters[target.id].hp.current=kind==='survivor'?200:1})
  const answer=ok(await knock(call,target.id)),state=await call('get_game_state')
  assert.equal(state.monsters[target.id].knockout,undefined)
  if(kind==='miss')assert.equal(answer.hit,false)
  if(kind==='fortitude'){assert.equal(answer.damageResolution.fortitude.success,true);assert.equal(state.monsters[target.id].hp.current,1)}
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,4)
 })
})

test('real healing cancels the pending timer without granting another HP when its old deadline passes',async t=>{
 const{call,target}=await ko(t,{hours:2});await ended(call)
 ok(await call('update_hp',{entityId:target.id,delta:1,reason:'Soin réel avant récupération naturelle.'}))
 const result=ok(await call('advance_time',{seconds:20000}));assert.equal(result.naturalRecoveries.length,0)
 const state=await call('get_game_state');assert.equal(state.monsters[target.id].hp.current,1);assert.equal(state.monsters[target.id].knockout,undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('short rest, long rest and explicit game-time jumps expose source recovery events without healing the NPC to full',async t=>{
 for(const kind of ['short','long','game'])await t.test(kind,async t=>{
  const hours=kind==='short'?1:kind==='long'?4:3,{call,target}=await ko(t,{hours});await ended(call)
  const result=ok(await call(kind==='game'?'advance_game_time':'take_rest',kind==='game'?{seconds:20000}:{kind,hitDice:0}))
  assert.equal(result.naturalRecoveries.length,1);assert.equal(result.naturalRecoveries[0].wakeAt,hours*3600)
  assert.equal((await call('get_game_state')).monsters[target.id].hp.current,1)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
 })
})

test('a large jump reports consciousness at the real recovery instant and retains another then-active sleep until its own expiration',async t=>{
 const{call,target}=await setup(t,{dice:'17,16,1,19'})
 await replace(call,state=>{
  state.monsters[target.id].conditions=['unconscious','prone']
  state.hero.effects.push({id:'independent-sleep',kind:'established-sleep',sourceId:'player',targetIds:[target.id],expiresAt:5400,concentration:false,data:{condition:'unconscious'}})
 })
 ok(await knock(call,target.id));await ended(call)
 const result=ok(await call('advance_time',{seconds:7200})),event=result.naturalRecoveries[0]
 assert.equal(event.wakeAt,3600);assert.equal(event.hpAfter,1);assert.equal(event.unconsciousRetained,true)
 const state=await call('get_game_state');assert.equal(state.worldTimeSeconds,7200);assert.equal(state.monsters[target.id].hp.current,1)
 assert.ok(!state.monsters[target.id].conditions.includes('unconscious'))
 assert.ok(!state.hero.effects.some(effect=>effect.id==='independent-sleep'))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an independently established unconscious condition without an expiry is preserved instead of cured by KO recovery',async t=>{
 const{call,target}=await setup(t,{dice:'17,16,1,19'})
 ok(await call('apply_condition',{entityId:target.id,condition:'unconscious'}))
 ok(await knock(call,target.id));assert.equal((await call('get_game_state')).monsters[target.id].knockout.independentUnconscious,true)
 await ended(call);const result=ok(await call('advance_time',{seconds:3600}))
 assert.equal(result.naturalRecoveries[0].unconsciousRetained,true)
 const state=await roundtrip(call);assert.equal(state.monsters[target.id].hp.current,1);assert.ok(state.monsters[target.id].conditions.includes('unconscious'))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('stable recovery updates archived floors and retired bodies without activating tokens or inventing initiative',async t=>{
 for(const kind of ['floor','retired'])await t.test(kind,async t=>{
  const{call,target}=await ko(t);await ended(call)
  const before=await call('get_game_state'),fromMapId=before.currentMapId
  await replace(call,state=>{
   const body=state.monsters[target.id];delete state.monsters[target.id]
   if(kind==='floor'){
    state.sceneMemory={...state.sceneMemory,floorMonsters:{[fromMapId]:{[target.id]:body}}}
    state.currentMapId='waterdeep';state.currentRoomId='4';state.player.position={x:0,y:10}
   }else state.sceneMemory={...state.sceneMemory,retiredMonsters:{[target.id]:body}}
  })
  const result=ok(await call('advance_time',{seconds:4000})),event=result.naturalRecoveries[0]
  assert.equal(event.archived,true);assert.equal(event.wakeAt,3600)
  const after=await roundtrip(call),body=kind==='floor'?after.sceneMemory.floorMonsters[fromMapId][target.id]:after.sceneMemory.retiredMonsters[target.id]
  assert.equal(body.hp.current,1);assert.equal(body.knockout,undefined);assert.ok(body.conditions.includes('prone'))
  assert.equal(after.monsters[target.id],undefined);assert.deepEqual(after.initiativeOrder,[]);assert.equal(after.currentTurn,null)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
 })
})

test('corrupt or already-due timers refuse hydration without rerolls or implicit healing',async t=>{
 const{call,target}=await ko(t,{hours:2});await ended(call);const saved=await roundtrip(call)
 for(const mutate of [
  state=>{state.monsters[target.id].knockout.recovery.wakeAt++},
  state=>{state.monsters[target.id].knockout.recovery.hours=5},
  state=>{state.worldTimeSeconds=7200},
  state=>{state.monsters[target.id].knockout.at=5;state.monsters[target.id].knockout.recovery.wakeAt=7205},
 ]){
  const corrupt=structuredClone(saved);mutate(corrupt)
  assert.ok((await call('replace_game_state',{gameState:corrupt})).error)
  assert.deepEqual(await call('get_game_state'),saved)
 }
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a new encounter missing the old body refuses its recovery crossing before turn effects, time or dice',async t=>{
 const{call,target}=await ko(t);await ended(call)
 const other=await spawn(call,'commoner');await battle(call,[other.id])
 await replace(call,state=>{state.worldTimeSeconds=3599})
 await refused(call,'next_turn',{actorId:'player',skipAction:true},'KNOCKOUT_INITIATIVE_NOT_REGISTERED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
 ok(await call('end_combat',{force:true,reason:'Le témoin se retire explicitement.'}))
 const result=ok(await call('advance_time',{seconds:1}));assert.equal(result.naturalRecoveries[0].wakeAt,3600)
 assert.equal((await call('get_game_state')).monsters[target.id].hp.current,1)
})

test('a real round boundary recovers the KO in its assigned roster and preserves completed first-turn surprise',async t=>{
 const call=await engine(t,{dice:'20,1,10,17,1,19'}),target=await spawn(call),other=await spawn(call,'commoner')
 await replace(call,state=>{state.monsters[target.id].hp.current=1})
 ok(await call('enter_combat',{combatants:['player',target.id,other.id],surprise:{surprisedIds:[target.id],reason:'Le garde n’avait pas remarqué la menace.'}}))
 ok(await knock(call,target.id));ok(await call('next_turn',{actorId:'player'}))
 await replace(call,state=>{state.worldTimeSeconds=3594})
 const next=ok(await call('next_turn',{actorId:other.id,skipAction:true})),state=await roundtrip(call)
 assert.equal(next.round,2);assert.equal(state.worldTimeSeconds,3600);assert.equal(state.currentTurn,'player')
 assert.equal(state.monsters[target.id].hp.current,1);assert.equal(state.monsters[target.id].knockout,undefined)
 assert.ok(state.initiativeOrder.includes(target.id));assert.equal(isSurprised(state,target.id),false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a resumed sprite sleep is present at KO recovery even when both its resumed expiry and recovery lie inside the same jump',async t=>{
 for(const provider of ['hero','monster'])await t.test(provider,async t=>{
  const call=await engine(t,{dice:'20,20,1,17,16,1,19'}),target=await spawn(call),sprite=await spawn(call,'sprite')
  await battle(call,[sprite.id,target.id],sprite.id)
  ok(await call('resolve_monster_action',{monsterId:sprite.id,actionName:'Shortbow',targetId:target.id}))
  let state=await call('get_game_state');assert.ok(state.monsters[target.id].conditions.includes('unconscious'))
  await replace(call,state=>{
   state.monsters[target.id].hp.current=1
   if(provider==='hero')state.hero.effects.push({id:'actual-stone',kind:'established-petrification',sourceId:'player',targetIds:[target.id],expiresAt:3590,concentration:false,data:{condition:'petrified'}})
   else {state.monsterEffects??=[];state.monsterEffects.push({id:'actual-stone',kind:'established-petrification',sourceId:'player',targetId:target.id,conditions:['petrified'],expiresAt:3590})}
  })
  ok(await call('apply_condition',{entityId:target.id,condition:'petrified'}))
  await battle(call,[target.id,sprite.id]);ok(await knock(call,target.id))
  // Kill the source with an explicit established event; its timed poison
  // remains a real effect and the knocked-out victim can end the encounter.
  ok(await call('update_hp',{entityId:sprite.id,delta:-200,reason:'Le tireur est réellement tué par cet événement établi.'}))
  await ended(call);state=await roundtrip(call)
  assert.ok(state.monsterEffects.filter(effect=>['sprite-poison','sprite-sleep'].includes(effect.kind)).every(effect=>effect.petrificationPause))
  const result=ok(await call('advance_time',{seconds:4000})),event=result.naturalRecoveries[0]
  assert.equal(event.wakeAt,3600);assert.equal(event.hpAfter,1);assert.equal(event.unconsciousRetained,true)
  state=await roundtrip(call);assert.equal(state.worldTimeSeconds,4000);assert.equal(state.monsters[target.id].hp.current,1)
  assert.ok(!state.monsters[target.id].conditions.includes('unconscious'));assert.ok(!state.monsters[target.id].conditions.includes('petrified'))
  assert.ok(!state.monsterEffects.some(effect=>['sprite-poison','sprite-sleep'].includes(effect.kind)))
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
 })
})
