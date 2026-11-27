const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn}=require('./helpers/mcp-toolkit.cjs')
const {isSurprised}=require('../mcp-server/dist/lib/surprise-state.js')
const heal=(call,id)=>call('update_hp',{entityId:id,delta:1,reason:'Soin réel du combattant assommé.'})
const reason='Ces gardes n’ont pas remarqué la menace avant le combat.'
async function setup(t,{dice='20,1,10,17,2,19',both=false}={}){
 // Distinct published blocks preserve the deliberately different initial slots.
 const call=await engine(t,{dice}),target=await spawn(call),other=await spawn(call,'bandit')
 await replace(call,state=>{state.monsters[target.id].hp.current=1;if(both)state.monsters[other.id].hp.current=1})
 ok(await call('enter_combat',{combatants:['player',target.id,other.id],surprise:{surprisedIds:both?[target.id,other.id]:[target.id],reason}}))
 if(both)ok(await call('resolve_player_multiattack',{attacks:[
  {targetId:target.id,weaponOrSpell:'unarmed',nonlethal:true},{targetId:other.id,weaponOrSpell:'unarmed',nonlethal:true}]}))
 else ok(await call('resolve_attack',{attackerId:'player',targetId:target.id,weaponOrSpell:'unarmed',nonlethal:true}))
 const state=await call('get_game_state');assert.ok(state.monsters[target.id].knockout)
 assert.ok(isSurprised(state,target.id));return{call,target,other}
}
async function roundtrip(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,input,code){const before=await call('get_game_state');assert.equal((await call(name,input)).code,code);assert.deepEqual(await call('get_game_state'),before)}

test('healing a surprised KO before its assigned position preserves surprise until its real first turn ends',async t=>{
 const{call,target,other}=await setup(t)
 ok(await call('next_turn',{actorId:'player'}))
 let state=await call('get_game_state');assert.equal(state.currentTurn,other.id)
 assert.ok(isSurprised(state,target.id),'the KO position has not been traversed yet')
 ok(await heal(call,target.id));state=await roundtrip(call)
 assert.equal(state.currentTurn,other.id);assert.ok(isSurprised(state,target.id))
 assert.equal(state.monsters[target.id].knockout,undefined);assert.ok(!state.monsters[target.id].conditions.includes('unconscious'))
 ok(await call('next_turn',{actorId:other.id,skipAction:true}));state=await call('get_game_state')
 assert.equal(state.currentTurn,target.id);assert.ok(isSurprised(state,target.id),'normal start-turn reaction reset must not clear surprise')
 await refused(call,'resolve_monster_action',{monsterId:target.id,actionName:'Scimitar',targetId:'player'},'ACTOR_SURPRISED')
 ok(await call('next_turn',{actorId:target.id}));assert.ok(!isSurprised(await call('get_game_state'),target.id))
})

test('passing the actual KO position completes surprise without starting a turn or granting a retroactive turn on heal',async t=>{
 const{call,target,other}=await setup(t,{dice:'20,10,1,17,2,19'})
 ok(await call('next_turn',{actorId:'player'}));let state=await roundtrip(call)
 assert.equal(state.currentTurn,other.id);assert.equal(state.dmTools.surprise.actors[target.id].firstTurnEnded,true)
 assert.ok(state.monsters[target.id].knockout);assert.equal(state.hero.turnStarted[target.id],undefined)
 const before=structuredClone(state);ok(await heal(call,target.id));state=await call('get_game_state')
 assert.equal(state.currentTurn,other.id);assert.deepEqual(state.initiativeOrder,before.initiativeOrder)
 assert.equal(state.hero.turnStarted[target.id],undefined);assert.ok(!isSurprised(state,target.id))
 assert.equal(state.dmTools.surprise.actors[target.id].firstTurnEnded,true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a KO at the end of the roster completes surprise on wrap and stays completed across several rounds and hydration',async t=>{
 const{call,target,other}=await setup(t,{dice:'20,1,10,17,2,19'})
 ok(await call('next_turn',{actorId:'player'}));assert.ok(isSurprised(await call('get_game_state'),target.id))
 ok(await call('next_turn',{actorId:other.id,skipAction:true}));let state=await roundtrip(call)
 assert.equal(state.round,2);assert.equal(state.currentTurn,'player')
 assert.equal(state.dmTools.surprise.actors[target.id].firstTurnEnded,true)
 ok(await call('next_turn',{actorId:'player',skipAction:true}));ok(await call('next_turn',{actorId:other.id,skipAction:true}))
 state=await roundtrip(call);assert.equal(state.round,3);assert.ok(state.monsters[target.id].knockout)
 assert.equal(state.hero.turnStarted[target.id],undefined);assert.ok(!isSurprised(state,target.id))
 ok(await heal(call,target.id));state=await call('get_game_state')
 assert.equal(state.currentTurn,'player');assert.ok(!isSurprised(state,target.id))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('all KO slots are traversed once when only the player remains active, without rolling initiative or turn effects for the bodies',async t=>{
 const{call,target,other}=await setup(t,{dice:'20,10,1,17,2,17,2,19',both:true})
 ok(await call('next_turn',{actorId:'player'}));const state=await roundtrip(call)
 assert.equal(state.currentTurn,'player');assert.equal(state.round,2)
 for(const id of [target.id,other.id]){
  assert.ok(state.monsters[id].knockout);assert.equal(state.dmTools.surprise.actors[id].firstTurnEnded,true)
  assert.equal(state.hero.turnStarted[id],undefined);assert.ok(!isSurprised(state,id))
 }
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the legacy KO recovery boundary refuses before end-turn effects or skipped surprise positions can be committed',async t=>{
 const{call,target}=await setup(t,{dice:'20,10,1,17,2,19'})
 await replace(call,state=>{delete state.monsters[target.id].knockout.recovery;state.worldTimeSeconds=3594;state.hero.effects.push({id:'actual-end-witness',kind:'actual-end-witness',sourceId:'player',targetIds:['player'],expiresAt:10000,concentration:false,data:{untilEndOf:'player',endTurnCount:1}})})
 await refused(call,'next_turn',{actorId:'player'},'KNOCKOUT_RECOVERY_PENDING')
 const state=await call('get_game_state');assert.ok(isSurprised(state,target.id))
 assert.ok(state.hero.effects.some(effect=>effect.id==='actual-end-witness'))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an old KO outside a newly started combat roster cannot be healed into an invented initiative position',async t=>{
 const{call,target}=await setup(t,{dice:'20,10,1,17,2,20,1,19'})
 ok(await call('end_combat',{force:true,reason:'Les autres gardes abandonnent le combat.'}))
 const newcomer=await spawn(call)
 ok(await call('enter_combat',{combatants:['player',newcomer.id]}))
 await refused(call,'update_hp',{entityId:target.id,delta:1,reason:'Tentative de soin pendant cet autre combat.'},'KNOCKOUT_INITIATIVE_NOT_REGISTERED')
 const state=await call('get_game_state');assert.ok(!state.initiativeOrder.includes(target.id));assert.ok(state.monsters[target.id].knockout)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
