const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,adjacent,grid}=require('./helpers/mcp-toolkit.cjs')
const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))
const main=state=>state.dmTools?.loadout?.mainHandId??state.player.inventory.find(item=>item.type==='weapon').id
async function spawn(call){const state=await call('get_game_state');return ok(await call('spawn_monster',{monsterType:'goblin',cell:adjacent(state)[0]}))}
async function roundtrip(call){const before=await call('get_game_state');ok(await call('replace_game_state',{gameState:JSON.parse(JSON.stringify(before))}));assert.deepEqual(await call('get_game_state'),before);return before}
async function refused(call,name,input){const before=await call('get_game_state'),answer=await call(name,input);assert.ok(answer.error,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before,'refusal preserves costs, effects, position and archive');return answer}
async function provokingMove(call,target){
 const state=await call('get_game_state'),nav=grid(state,target.id),from=state.monsters[target.id].position
 const toCell=nav.neighbors(from).find(cell=>nav.step(from,cell)&&distance(cell,state.player.position)>1)
 assert.ok(toCell,'native adjacent actor has a real legal step out of player reach')
 const answer=ok(await call('move_token',{tokenId:target.id,toCell}))
 assert.equal(answer.stopReason,'reaction_decision')
 const held=await call('get_game_state');assert.equal(held.hero.pending.sourceId,'player');assert.equal(held.hero.pending.targetId,target.id)
 return{from:{...from},toCell,pendingId:held.hero.pending.id,held}
}
const trigger='Lorsque l’adversaire fait un geste hostile perceptible devant moi.'
const observed='L’adversaire lève réellement son arme devant moi.'

test('a genuine saved opportunity window creates a persistent KO before the provoking step, without spending a player action',async t=>{
 const call=await engine(t,{dice:'1,20,17,4,2,19'}),target=await spawn(call)
 assert.equal(target.hp.max,7,'native goblin profile, no fabricated HP or policy')
 ok(await call('enter_combat',{combatants:['player',target.id]}));assert.equal((await call('get_game_state')).currentTurn,target.id)
 const move=await provokingMove(call,target),before=await roundtrip(call)
 const answer=ok(await call('resolve_reaction',{pendingId:move.pendingId,choice:'opportunity_attack',weaponOrSpell:main(before),nonlethal:true}))
 assert.equal(answer.attack.targetKnockedOut,true);assert.equal(answer.attack.targetDied,false);assert.equal(answer.actorDown,true)
 assert.equal(answer.movement,undefined)
 const state=await roundtrip(call),body=state.monsters[target.id]
 assert.equal(state.hero.pending,undefined);assert.deepEqual(body.position,move.from)
 assert.equal(state.movementUsed[target.id]??0,before.movementUsed[target.id]??0,'the interrupted outward step never spends movement')
 assert.equal(body.hp.current,0);assert.equal(body.isAlive,true);assert.equal(body.npcLife.episode.status,'stable')
 assert.equal(body.knockout.recovery.hours,2)
 assert.equal(typeof body.knockout.attackEventId,'string');assert.ok(body.knockout.attackEventId.length)
 assert.equal(body.knockout.attackEventId,body.npcLife.episode.knockoutAttackEventId,'the W7 episode retains the exact actual reaction attack witness')
 assert.equal(answer.attack.primaryAttackId,undefined,'an opportunity reaction is not a primary Attack action')
 assert.equal(body.npcLife.policy,undefined);assert.equal(state.hero.corpseTimes[target.id],undefined)
 assert.equal(state.hero.reactionsUsed.player,true);assert.equal(state.hero.actionCredits,before.hero.actionCredits)
 assert.equal(Boolean(state.actionUsed.player),Boolean(before.actionUsed.player))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a stored Ready and a genuine opportunity share one reaction, and a refused second attack retains its exact Ready effect',async t=>{
 const call=await engine(t,{dice:'20,10,17,4,2,19'}),target=await spawn(call),other=await spawn(call)
 ok(await call('enter_combat',{combatants:['player',target.id,other.id]}));assert.equal((await call('get_game_state')).currentTurn,'player')
 const initial=await call('get_game_state'),ready=ok(await call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:main(initial),trigger}}))
 const paid=await roundtrip(call);assert.equal(paid.hero.actionCredits,initial.hero.actionCredits-1)
 ok(await call('next_turn',{actorId:'player'}));assert.equal((await call('get_game_state')).currentTurn,target.id)
 const move=await provokingMove(call,target)
 ok(await call('resolve_reaction',{pendingId:move.pendingId,choice:'opportunity_attack',weaponOrSpell:main(paid),nonlethal:true}))
 const stopped=await roundtrip(call)
 assert.ok(stopped.hero.effects.some(effect=>effect.id===ready.readyId))
 assert.equal(stopped.hero.reactionsUsed.player,true);assert.equal(stopped.hero.actionCredits,paid.hero.actionCredits)
 const answer=await refused(call,'resolve_readied_action',{readyId:ready.readyId,choice:'execute',triggerObserved:observed,targetId:other.id,nonlethal:true})
 assert.equal(answer.code,'REACTION_ALREADY_USED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actually released nonlethal Ready joins the W7 damage and explicit-save lifecycle without a permanent policy or stale KO timer',async t=>{
 const call=await engine(t,{dice:'20,1,17,4,2,17,19'}),target=await spawn(call)
 ok(await call('enter_combat',{combatants:['player',target.id]}))
 const initial=await call('get_game_state'),ready=ok(await call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:main(initial),trigger}}))
 ok(await call('next_turn',{actorId:'player'}));const paid=await roundtrip(call)
 const answer=ok(await call('resolve_readied_action',{readyId:ready.readyId,choice:'execute',triggerObserved:observed,targetId:target.id,nonlethal:true}))
 assert.equal(answer.targetKnockedOut,true);assert.equal(answer.targetDied,false)
 const stable=await roundtrip(call),body=stable.monsters[target.id],oldWake=body.knockout.recovery.wakeAt
 assert.equal(body.npcLife.episode.status,'stable');assert.equal(body.npcLife.policy,undefined)
 assert.equal(stable.hero.actionCredits,paid.hero.actionCredits);assert.equal(stable.hero.reactionsUsed.player,true)
 assert.equal(stable.hero.effects.some(effect=>effect.id===ready.readyId),false)
 assert.equal(stable.hero.attackAction,undefined,'Ready never grants the fighter another Extra Attack')
 ok(await call('update_hp',{entityId:target.id,delta:-1,damageType:'force',damageOrigin:'environment',reason:'Dégât distinct réellement établi après la stabilisation du blessé.'}))
 let state=await roundtrip(call)
 assert.equal(state.monsters[target.id].npcLife.episode.status,'dying');assert.equal(state.monsters[target.id].npcLife.episode.failures,1)
 assert.equal(state.monsters[target.id].knockout,undefined);assert.equal(state.monsters[target.id].npcLife.episode.recovery,undefined)
 ok(await call('end_combat',{force:true,reason:'Le MJ établit explicitement une trêve après cette blessure.'}))
 state=await call('get_game_state');const due=state.monsters[target.id].npcLife.episode.nextSaveAt
 assert.ok(due<oldWake);ok(await call('advance_time',{seconds:due-state.worldTimeSeconds}))
 state=await call('get_game_state')
 const saved=ok(await call('roll_death_save',{entityId:target.id,eventId:state.monsters[target.id].npcLife.episode.timeEventId}))
 assert.equal(saved.roll.total,17);assert.equal(saved.successes,1);assert.equal(saved.failures,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real other-floor actor is not a readied attack target and refusal preserves the paid Ready, reaction and die',async t=>{
 const call=await engine(t,{dice:'20,1,19'}),initial=await call('get_game_state')
 const layout=ok(await call('generate_dungeon',{seed:'ready-ko-archive',width:3,height:3,count:5})).layout
 const installed=ok(await call('install_dungeon',{dungeonId:'ready-ko-side',layout,entranceCell:initial.player.position,
  questLink:{goal:'Retrouver la personne recherchée.',lead:'Un indice réel dans ce passage poursuit la même recherche.',delivery:'clue',discoveryDc:15}}))
 const archived=await spawn(call);ok(await call('travel_to_map',{transitionId:installed.entryTransitionId}))
 let state=await call('get_game_state');assert.equal(state.monsters[archived.id],undefined)
 assert.ok(state.sceneMemory.floorMonsters[initial.currentMapId][archived.id])
 const local=await spawn(call);ok(await call('enter_combat',{combatants:['player',local.id]}))
 state=await call('get_game_state')
 const ready=ok(await call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:main(state),trigger}}))
 ok(await call('next_turn',{actorId:'player'}));await roundtrip(call)
 await refused(call,'resolve_readied_action',{readyId:ready.readyId,choice:'execute',triggerObserved:observed,targetId:archived.id,nonlethal:true})
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
