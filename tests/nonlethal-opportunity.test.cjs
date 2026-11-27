const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle,grid}=require('./helpers/mcp-toolkit.cjs')
const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))
async function fixture(t,{dice='17,4,2,19',type='goblin',hp=1,unarmed=false,unequip=false,inspired=false}={}){
 const call=await engine(t,{dice}),initial=await call('get_game_state')
 const weapon=initial.dmTools?.loadout?.mainHandId??initial.player.inventory.find(item=>item.type==='weapon')?.id
 assert.ok(weapon,'fixture uses an actual owned melee weapon')
 if(unequip)ok(await call('equip_item',{itemId:weapon,slot:'main_hand',operation:'unequip'}))
 const target=await spawn(call,type)
 await replace(call,state=>{
  state.monsters[target.id].hp.current=hp
  if(inspired)state.hero.inspiration.push({targetId:'player',die:8,expiresAt:state.worldTimeSeconds+600})
 })
 await battle(call,[target.id],target.id)
 const state=await call('get_game_state'),from=state.monsters[target.id].position,nav=grid(state,target.id)
 const toCell=nav.neighbors(from).find(cell=>(cell.x===from.x||cell.y===from.y)&&distance(cell,state.player.position)>1&&nav.step(from,cell))
 assert.ok(toCell,'fixture needs a real free step leaving the player melee reach')
 const paused=ok(await call('move_token',{tokenId:target.id,toCell,...(type==='will_o_wisp'?{movementMode:'fly'}:{})}))
 const pending=(await call('get_game_state')).hero.pending
 assert.equal(paused.stopReason,'reaction_decision');assert.equal(paused.distanceMoved,0)
 assert.equal(pending.kind,'movement');assert.equal(pending.sourceId,'player');assert.equal(pending.targetId,target.id)
 return {call,target,from,toCell,pending,weapon:unarmed?'unarmed':weapon}
}
const opportunity=f=>({pendingId:f.pending.id,choice:'opportunity_attack',weaponOrSpell:f.weapon,nonlethal:true})
async function refused(call,input,code){const before=await call('get_game_state');assert.equal((await call('resolve_reaction',input)).code,code);assert.deepEqual(await call('get_game_state'),before)}
async function roundtrip(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}

test('an explicit real player opportunity knockout stops the same movement before leaving reach and spends only its reaction',async t=>{
 const f=await fixture(t),before=await roundtrip(f.call),answer=ok(await f.call('resolve_reaction',opportunity(f)))
 assert.equal(answer.attack.hit,true);assert.equal(answer.attack.nonlethal,true);assert.equal(answer.attack.targetKnockedOut,true);assert.equal(answer.attack.targetDied,false)
 assert.equal(answer.actorDown,true);assert.equal(answer.movement,undefined)
 const after=await roundtrip(f.call),body=after.monsters[f.target.id]
 assert.equal(body.hp.current,0);assert.equal(body.isAlive,true);assert.equal(body.knockout.stable,true)
 assert.equal(body.knockout.sourceId,'player');assert.ok(body.knockout.attackEventId);assert.deepEqual(body.knockout.recovery,{hours:2,wakeAt:7200})
 assert.ok(body.conditions.includes('unconscious'));assert.ok(body.conditions.includes('prone'));assert.deepEqual(body.position,f.from)
 assert.equal(after.hero.corpseTimes[f.target.id],undefined);assert.equal(after.hero.pending,undefined)
 assert.equal(after.hero.reactionsUsed.player,true);assert.equal(after.hero.actionCredits,before.hero.actionCredits)
 assert.deepEqual(after.actionUsed,before.actionUsed);assert.deepEqual(after.bonusActionUsed,before.bonusActionUsed)
 assert.deepEqual(after.hero.attackAction,before.hero.attackAction);assert.deepEqual(after.dmTools.loadout,before.dmTools.loadout)
 assert.equal(after.movementUsed[f.target.id]??0,0)
 await refused(f.call,opportunity(f),'REACTION_TRIGGER_INVALID')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('omitted or explicit false opportunity choice preserves ordinary lethal damage and consumes no recovery die',async t=>{
 for(const explicitFalse of [false,true])await t.test(explicitFalse?'explicit false':'omitted',async t=>{
  const f=await fixture(t,{dice:'17,4,19'}),input=opportunity(f)
  if(explicitFalse)input.nonlethal=false;else delete input.nonlethal
  const answer=ok(await f.call('resolve_reaction',input)),state=await roundtrip(f.call)
  assert.equal(answer.attack.nonlethal,false);assert.equal(answer.attack.targetDied,true);assert.equal(answer.attack.targetKnockedOut,false)
  assert.equal(state.monsters[f.target.id].isAlive,false);assert.equal(state.monsters[f.target.id].knockout,undefined)
  assert.equal(state.hero.corpseTimes[f.target.id],0);assert.deepEqual(state.monsters[f.target.id].position,f.from)
  assert.equal(state.hero.reactionsUsed.player,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
 })
})

test('misses and nonterminal unarmed opportunity hits resume only the originally selected movement without a recovery die',async t=>{
 for(const miss of [true,false])await t.test(miss?'miss':'nonterminal',async t=>{
  const f=await fixture(t,{dice:miss?'1,19':'17,19',hp:200,unarmed:true}),before=await f.call('get_game_state')
  const answer=ok(await f.call('resolve_reaction',opportunity(f))),after=await roundtrip(f.call)
  assert.equal(answer.attack.hit,!miss);assert.equal(answer.attack.nonlethal,true);assert.equal(answer.attack.targetKnockedOut,false)
  assert.equal(answer.actorDown,false);assert.deepEqual(answer.movement.finalPosition,f.toCell);assert.deepEqual(after.monsters[f.target.id].position,f.toCell)
  assert.equal(before.player.stats.str,18);assert.equal(after.monsters[f.target.id].hp.current,miss?200:195);assert.equal(after.monsters[f.target.id].knockout,undefined)
  assert.equal(after.hero.reactionsUsed.player,true);assert.equal(after.hero.actionCredits,before.hero.actionCredits)
  assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
 })
})

test('nonlethal on decline is refused even false before changing the actual pending movement or spending a die',async t=>{
 const f=await fixture(t,{dice:'17,2,19',unarmed:true})
 for(const nonlethal of [true,false])await refused(f.call,{pendingId:f.pending.id,choice:'decline',nonlethal},'NONLETHAL_REACTION_CHOICE_INVALID')
 const answer=ok(await f.call('resolve_reaction',opportunity(f)));assert.equal(answer.attack.targetKnockedOut,true)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('ranged unknown or unheld weapons and an out-of-reach target refuse before dice reaction or movement',async t=>{
 const f=await fixture(t,{dice:'17,2,19',unarmed:true,unequip:true})
 for(const weaponOrSpell of [f.weapon==='unarmed'?'shortbow':f.weapon,'no-such-weapon'])
  await refused(f.call,{...opportunity(f),weaponOrSpell},'OPPORTUNITY_REQUIRES_MELEE')
 const state=await f.call('get_game_state'),carried=state.player.inventory.find(item=>item.type==='weapon')
 assert.ok(carried);await refused(f.call,{...opportunity(f),weaponOrSpell:carried.id},'OPPORTUNITY_REQUIRES_MELEE')
 await replace(f.call,state=>{state.monsters[f.target.id].position={...f.toCell}})
 await refused(f.call,opportunity(f),'OPPORTUNITY_REQUIRES_MELEE')
 ok(await f.call('replace_game_state',{gameState:state}))
 const answer=ok(await f.call('resolve_reaction',opportunity(f)));assert.equal(answer.attack.targetKnockedOut,true)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a native unconsciousness immunity rejects the actual offered player opportunity before consuming any die',async t=>{
 const f=await fixture(t,{type:'will_o_wisp',dice:'19',unarmed:true})
 await refused(f.call,opportunity(f),'NONLETHAL_CONDITION_IMMUNE')
 const declined=ok(await f.call('resolve_reaction',{pendingId:f.pending.id,choice:'decline'}))
 assert.equal(declined.movement.movementMode,'fly');assert.deepEqual(declined.movement.finalPosition,f.toCell)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a genuine NPC opportunity cannot acquire a player-only knockout argument and its default reaction still works',async t=>{
 const call=await engine(t,{dice:'1,19'}),target=await spawn(call)
 await battle(call,[target.id])
 const state=await call('get_game_state'),nav=grid(state),from=state.player.position
 const toCell=nav.neighbors(from).find(cell=>(cell.x===from.x||cell.y===from.y)&&distance(cell,state.monsters[target.id].position)>1&&nav.step(from,cell))
 assert.ok(toCell);ok(await call('move_token',{tokenId:'player',toCell}))
 const pending=(await call('get_game_state')).hero.pending;assert.equal(pending.sourceId,target.id)
 for(const nonlethal of [true,false])await refused(call,{pendingId:pending.id,choice:'opportunity_attack',weaponOrSpell:'Scimitar',nonlethal},'NONLETHAL_PLAYER_ATTACK_REQUIRED')
 const answer=ok(await call('resolve_reaction',{pendingId:pending.id,choice:'opportunity_attack',weaponOrSpell:'Scimitar'}))
 assert.equal(answer.attack.hit,false);assert.deepEqual(answer.movement.finalPosition,toCell)
 assert.equal((await call('get_game_state')).hero.reactionsUsed[target.id],true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a held opportunity d20 survives hydration with its exact knockout choice and movement continuation, refusing any after-roll rewrite',async t=>{
 const f=await fixture(t,{dice:'15,2,2,19',unarmed:true,inspired:true})
 const held=ok(await f.call('resolve_reaction',opportunity(f))),pending=held.pendingReaction
 assert.ok(pending);assert.equal(pending.kind,'attack');assert.equal(pending.command.nonlethal,true)
 assert.equal(pending.command.reaction,true);assert.equal(pending.command.weaponOrSpell,'unarmed');assert.equal(pending.roll.rolls[0],15)
 assert.equal(pending.continuation.type,'movement');assert.deepEqual(pending.continuation.goal.cell,f.toCell)
 const before=await roundtrip(f.call);assert.equal(before.hero.reactionsUsed.player??false,false)
 for(const nonlethal of [true,false])await refused(f.call,{pendingId:pending.id,choice:'bardic_inspiration',nonlethal},'NONLETHAL_REACTION_CHOICE_INVALID')
 const answer=ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration'}))
 assert.equal(before.player.stats.str,18);assert.equal(answer.attack.attackRoll.rolls[0],15);assert.equal(answer.attack.attackRoll.total,24)
 assert.equal(answer.attack.nonlethal,true);assert.equal(answer.attack.targetKnockedOut,true);assert.equal(answer.actorDown,true)
 const after=await roundtrip(f.call);assert.deepEqual(after.monsters[f.target.id].position,f.from)
 assert.equal(after.hero.reactionsUsed.player,true);assert.equal(after.hero.inspiration.length,0);assert.equal(after.hero.pending,undefined)
 assert.deepEqual(after.monsters[f.target.id].knockout.recovery,{hours:2,wakeAt:7200})
 await refused(f.call,{pendingId:pending.id,choice:'decline'},'REACTION_TRIGGER_INVALID')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
