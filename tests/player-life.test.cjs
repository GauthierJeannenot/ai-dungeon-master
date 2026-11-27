const test=require('node:test'),assert=require('node:assert/strict')
const{engine,ok,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
const inspect=async call=>ok(await call('inspect_player_life'))
async function hydrate(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)}
const hurt=(call,delta)=>call('update_hp',{entityId:'player',delta,damageType:'force',damageOrigin:'environment',reason:'Dégât réel explicitement établi.'})
async function fall(call){const state=await call('get_game_state');ok(await hurt(call,-state.player.hp.current));return state}
async function saveDue(call){let life=await inspect(call);if(life.episode.nextSaveAt>life.at)ok(await call('advance_time',{seconds:life.episode.nextSaveAt-life.at}));life=await inspect(call);return{event:life.event,result:ok(await call('roll_death_save',{entityId:'player',eventId:life.event.eventId}))}}
const checkpoint=(eventId='observed-now',reason='Le MJ observe ce véritable corps mourant maintenant, sans reconstruire sa chute passée.')=>({eventId,reason})

test('ordinary damage outside combat creates exact six-second saves, cannot skip them and old retries never heal a later state',async t=>{
 const call=await engine(t,{dice:'10,20,19'});await fall(call)
 let life=await inspect(call);assert.equal(life.episode.source,'damage_fall');assert.equal(life.episode.startedAt,0);assert.equal(life.episode.nextSaveAt,6);assert.equal(life.event,null)
 await refused(call,'roll_death_save',{eventId:'__proto__'},'PLAYER_DEATH_SAVE_EVENT_REQUIRED')
 await refused(call,'advance_time',{seconds:7},'PLAYER_DEATH_SAVE_PENDING')
 const first=await saveDue(call);assert.equal(first.result.successes,1);assert.equal(first.result.actionSpent,false)
 const firstState=await hydrate(call),replay=ok(await call('roll_death_save',{eventId:first.event.eventId}));assert.equal(replay.replayed,true);assert.deepEqual(await call('get_game_state'),firstState)
 const rewound=structuredClone(firstState);rewound.dmTools.playerLife.episode.sequence=1
 await refused(call,'replace_game_state',{gameState:rewound},'PLAYER_LIFE_STATE_MISMATCH')
 const prototype=structuredClone(firstState);prototype.dmTools.playerLife.lastSaveEventId='__proto__'
 await refused(call,'replace_game_state',{gameState:prototype},'PLAYER_LIFE_STATE_MISMATCH')
 const second=await saveDue(call);assert.equal(second.result.hpAfter,1);assert.equal(second.result.criticalSuccess,true)
 const healed=await hydrate(call);assert.equal((await inspect(call)).episode,null);assert.equal(healed.dmTools.playerLife.lastClosed.reason,'healed')
 assert.equal(ok(await call('roll_death_save',{eventId:first.event.eventId})).replayed,true);assert.deepEqual(await call('get_game_state'),healed)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('three real ordinary death-save successes stabilize at the true source time and retain the W11 one-die natural recovery',async t=>{
 const call=await engine(t,{dice:'10,10,10,2,19'});await fall(call)
 for(let index=0;index<3;index++)await saveDue(call)
 let state=await hydrate(call);assert.equal(state.worldTimeSeconds,18);assert.equal(state.player.deathSaves.stable,true)
 assert.equal(state.dmTools.playerLife.episode,undefined);assert.equal(state.dmTools.playerRecovery.episode.hours,2);assert.equal(state.dmTools.playerRecovery.episode.wakeAt,7218)
 ok(await call('advance_time',{seconds:7200}));state=await hydrate(call);assert.equal(state.player.hp.current,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('received damage at zero and new checkpoint nonces retain the existing actual episode and original pending deadline',async t=>{
 const call=await engine(t,{dice:'10,19'});await fall(call);const original=(await inspect(call)).episode
 ok(await call('grant_temporary_hp',{eventId:'zero-buffer',targetId:'player',sourceId:'real-zero-buffer',sourceDescription:'Source temporaire explicitement établie.',amount:8,duration:{kind:'until_long_rest'}}))
 ok(await hurt(call,-2));ok(await call('advance_time',{seconds:3}))
 const check=ok(await call('checkpoint_player_dying',checkpoint('same-life-observed')));assert.equal(check.alreadyTracked,true);assert.equal(check.nextSaveAt,6)
 let state=await hydrate(call);assert.equal(state.player.deathSaves.failures,1);assert.equal(state.dmTools.playerLife.episode.id,original.id)
 assert.equal(ok(await call('inspect_temporary_hp',{targetId:'player'})).temporaryHp,6)
 const saved=await saveDue(call);assert.equal(saved.result.successes,1);assert.equal(saved.result.failures,1)
 state=await hydrate(call);assert.equal(state.dmTools.playerLife.episode.sequence,2);assert.equal(state.dmTools.playerLife.episode.nextSaveAt,12)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a legacy unknown dying body needs an explicit present checkpoint, preserves its counters and cannot gain time by replay',async t=>{
 const call=await engine(t,{dice:'10,19'})
 await replace(call,state=>{state.player.hp.current=0;state.player.deathSaves={successes:1,failures:1};state.player.conditions=['unconscious','prone']})
 assert.equal((await inspect(call)).legacyUnresolved,true)
 await refused(call,'advance_time',{seconds:1},'PLAYER_LIFE_CHECKPOINT_REQUIRED')
 const input=checkpoint(),first=ok(await call('checkpoint_player_dying',input));assert.equal(first.observedAt,0);assert.equal(first.nextSaveAt,6)
 const before=await hydrate(call);assert.deepEqual(before.player.deathSaves,{successes:1,failures:1})
 assert.equal(ok(await call('checkpoint_player_dying',input)).replayed,true);assert.deepEqual(await call('get_game_state'),before)
 await refused(call,'checkpoint_player_dying',{...input,reason:'Autre fait avec le même identifiant.'},'PLAYER_LIFE_CHECKPOINT_CONFLICT')
 const result=await saveDue(call);assert.equal(result.result.successes,2);assert.equal(result.result.failures,1)
 const after=await hydrate(call);assert.equal(ok(await call('checkpoint_player_dying',input)).replayed,true);assert.deepEqual(await call('get_game_state'),after)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('explicit combat entry includes a living zero-HP player; its mandatory start save spends no action and natural twenty leaves the normal action',async t=>{
 const call=await engine(t,{dice:'20,1,20,19'}),other=await spawn(call,'commoner');await fall(call)
 ok(await call('enter_combat',{combatants:['player',other.id]}));let state=await hydrate(call)
 assert.equal(state.currentTurn,'player');assert.equal((await inspect(call)).event.scope,'turn')
 await refused(call,'combat_action',{action:'dodge'},'ENTITY_DEAD')
 await refused(call,'next_turn',{actorId:'player',skipAction:true},'PLAYER_DEATH_SAVE_PENDING')
 await refused(call,'end_combat',{force:true,reason:'Une fin forcée ne saute pas une sauvegarde réellement due.'},'PLAYER_DEATH_SAVE_PENDING')
 const saved=ok(await call('roll_death_save'));assert.equal(saved.hpAfter,1);assert.equal(saved.actionSpent,false)
 state=await hydrate(call);assert.equal(Boolean(state.actionUsed.player),false);assert.equal(state.hero.actionCredits,1)
 assert.equal(ok(await call('roll_death_save')).replayed,true);assert.deepEqual(await call('get_game_state'),state)
 ok(await call('combat_action',{action:'dodge'}));state=await call('get_game_state');assert.equal(state.actionUsed.player,true)
 ok(await call('next_turn',{actorId:'player'}));assert.equal((await call('get_game_state')).currentTurn,other.id)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an ordinary fall during the player own turn has no retroactive save, then the next true start resolves once without action cost',async t=>{
 const call=await engine(t,{dice:'20,1,10,19'}),other=await spawn(call,'commoner')
 ok(await call('enter_combat',{combatants:['player',other.id]}));ok(await call('combat_action',{action:'dodge'}));await fall(call)
 await refused(call,'roll_death_save',{},'PLAYER_DEATH_SAVE_COLLAPSE_TURN')
 ok(await call('next_turn',{actorId:'player'}));ok(await call('next_turn',{actorId:other.id,skipAction:true}))
 const saved=ok(await call('roll_death_save'));assert.equal(saved.successes,1);assert.equal(saved.actionSpent,false)
 let state=await hydrate(call);assert.equal(state.worldTimeSeconds,6);assert.equal(Boolean(state.actionUsed.player),false)
 assert.equal(ok(await call('roll_death_save')).replayed,true);assert.deepEqual(await call('get_game_state'),state)
 ok(await call('next_turn',{actorId:'player'}));assert.equal((await call('get_game_state')).currentTurn,other.id)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('ordinary dying then actual suffocation keeps one source clock and the exact third-success witness until real air',async t=>{
 const call=await engine(t,{dice:'20,10,10,2,19'});await fall(call);const original=(await inspect(call)).episode.id
 await replace(call,state=>{state.player.stats.con=10})
 ok(await call('set_breathing_context',{entityId:'player',eventId:'actual-choke-after-damage',mode:'choking',reason:'Le vrai corps mourant manque maintenant d’air.'}))
 for(let index=0;index<3;index++)await saveDue(call)
 let state=await hydrate(call);assert.equal(state.player.hp.current,0);assert.equal(state.player.deathSaves.successes,3)
 assert.equal(state.dmTools.playerLife.episode.id,original);assert.equal(state.dmTools.breathing.creatures.player.playerDying,undefined)
 assert.equal(state.dmTools.breathing.creatures.player.episode.blockedStabilization.lifeEpisodeId,original)
 ok(await call('set_breathing_context',{entityId:'player',eventId:'actual-air-after-three',mode:'air',reason:'Un véritable retour à l’air est établi.'}))
 state=await hydrate(call);assert.equal(state.player.hp.current,0);assert.equal(state.player.deathSaves.stable,true)
 assert.equal(state.dmTools.playerLife.episode,undefined);assert.equal(state.dmTools.playerRecovery.episode.hours,2)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the genuine suffocation lifecycle stays readable through the adapter and a duplicate general clock refuses hydration',async t=>{
 const call=await engine(t,{dice:'10,19'})
 await replace(call,state=>{state.player.stats.con=10})
 ok(await call('set_breathing_context',{entityId:'player',eventId:'initial-real-choking',mode:'choking',reason:'Absence réelle d’air établie.'}));ok(await call('advance_time',{seconds:6}))
 let life=await inspect(call);assert.equal(life.episode.storage,'suffocation');assert.equal(life.episode.startedAt,6)
 await saveDue(call);const actual=await hydrate(call);assert.ok(actual.dmTools.breathing.creatures.player.playerDying);assert.equal(actual.dmTools.playerLife.episode,undefined)
 const corrupt=structuredClone(actual);corrupt.dmTools.playerLife.episode={id:'another-real-clock-is-not-allowed',source:'checkpoint',sourceEventId:'duplicate',reason:'Ce second cycle est incohérent.',startedAt:6,nextSaveAt:18,sequence:1}
 await refused(call,'replace_game_state',{gameState:corrupt},'PLAYER_LIFE_STATE_MISMATCH')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a legacy mid-turn zero-HP snapshot cannot invent a start save; its explicit checkpoint only admits a future actual turn',async t=>{
 const call=await engine(t,{dice:'10,19'}),other=await spawn(call,'commoner')
 await battle(call,[other.id]);await replace(call,state=>{state.player.hp.current=0;state.player.conditions=['unconscious','prone']})
 await refused(call,'roll_death_save',{},'PLAYER_LIFE_CHECKPOINT_REQUIRED')
 ok(await call('checkpoint_player_dying',checkpoint('mid-turn-observation')))
 await refused(call,'roll_death_save',{},'PLAYER_DEATH_SAVE_COLLAPSE_TURN')
 ok(await call('next_turn',{actorId:'player',skipAction:true}));ok(await call('next_turn',{actorId:other.id,skipAction:true}))
 const saved=ok(await call('roll_death_save'));assert.equal(saved.successes,1);assert.equal(saved.at,6);assert.equal(saved.actionSpent,false)
 await hydrate(call);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
