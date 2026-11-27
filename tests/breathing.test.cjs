const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn}=require('./helpers/mcp-toolkit.cjs')
const context=(entityId,mode,eventId=mode)=>({entityId,mode,eventId,reason:'Le MJ établit explicitement ce contexte physique réel.'})
async function roundtrip(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,args,code){const before=await call('get_game_state');const answer=await call(name,args);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)}
async function important(call){const target=await spawn(call);ok(await call('configure_npc_death_saves',{entityId:target.id,eventId:`policy-${target.id}`,reason:'Choix explicite du MJ avant toute blessure.'}));return target}
async function nextSave(call,id){let state=await call('get_game_state'),episode=state.monsters[id].npcLife.episode;if(state.worldTimeSeconds<episode.nextSaveAt)ok(await call('advance_time',{seconds:episode.nextSaveAt-state.worldTimeSeconds}));state=await call('get_game_state');return{entityId:id,eventId:state.monsters[id].npcLife.episode.timeEventId}}

test('a real NPC breath reserve expires once and collapse bypasses temporary HP and Death Ward without damage',async t=>{
 const call=await engine(t,{dice:'19'}),target=await important(call)
 await replace(call,state=>{state.monsters[target.id].stats.con=14;state.hero.effects.push({id:'established-ward',kind:'death-ward',sourceId:'player',targetIds:[target.id],expiresAt:10000,concentration:false,data:{}})})
 ok(await call('grant_temporary_hp',{eventId:'breath-buffer',targetId:target.id,sourceId:'established-buffer',sourceDescription:'Source temporaire réelle établie par le MJ.',amount:17,duration:{kind:'until_long_rest'}}))
 const input=context(target.id,'hold_breath','initial-reserve'),initial=ok(await call('set_breathing_context',input)).episode
 assert.equal(initial.holdSeconds,180);assert.equal(initial.graceRounds,2)
 ok(await call('advance_time',{seconds:120}));ok(await call('set_breathing_context',context(target.id,'hold_breath','new-nonce')))
 assert.equal(ok(await call('inspect_breathing',{entityId:target.id})).episode.breathEndsAt,180)
 ok(await call('advance_time',{seconds:60}));assert.equal((await call('get_game_state')).monsters[target.id].hp.current,200)
 ok(await call('advance_time',{seconds:12}));const state=await roundtrip(call),body=state.monsters[target.id]
 assert.equal(state.worldTimeSeconds,192);assert.equal(body.hp.current,0);assert.equal(body.isAlive,true)
 assert.equal(body.npcLife.episode.status,'dying');assert.equal(body.npcLife.episode.failures,0);assert.equal(body.npcLife.episode.nextSaveAt,198)
 assert.ok(body.conditions.includes('unconscious'));assert.ok(body.conditions.includes('prone'))
 assert.equal(ok(await call('inspect_temporary_hp',{targetId:target.id})).temporaryHp,17)
 assert.ok(state.hero.effects.some(effect=>effect.id==='established-ward'))
 assert.equal(ok(await call('set_breathing_context',input)).alreadyResolved,true)
 assert.deepEqual(await call('get_game_state'),state)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('NPC natural twenty and third success cannot heal or stabilize without actual air; costs and dice remain untouched',async t=>{
 const call=await engine(t,{characterId:'cleric',dice:'20,10,10,2,19'}),target=await important(call)
 ok(await call('set_breathing_context',context(target.id,'choking')))
 await refused(call,'advance_time',{seconds:13},'SUFFOCATION_TIME_BOUNDARY')
 ok(await call('advance_time',{seconds:6}))
 const first=ok(await call('roll_death_save',await nextSave(call,target.id)))
 assert.equal(first.criticalSuccess,true);assert.equal(first.successes,1);assert.equal(first.hpAfter,0)
 ok(await call('roll_death_save',await nextSave(call,target.id)))
 const third=ok(await call('roll_death_save',await nextSave(call,target.id)));assert.equal(third.successes,3);assert.equal(third.stable,false)
 let state=await roundtrip(call);assert.ok(state.monsters[target.id].npcLife.episode.breathingBlockedStabilization)
 ok(await call('update_hp',{entityId:target.id,delta:-1,damageType:'force',damageOrigin:'environment',reason:'Dégât réel après le troisième succès bloqué.'}))
 state=await roundtrip(call);assert.equal(state.monsters[target.id].npcLife.episode.successes,3);assert.equal(state.monsters[target.id].npcLife.episode.failures,1)
 await refused(call,'update_hp',{entityId:target.id,delta:1,reason:'Tentative de soin sans air.'},'SUFFOCATION_RECOVERY_BLOCKED')
 await refused(call,'cast_spell',{spellId:'cure-wounds',targetId:target.id},'SUFFOCATION_RECOVERY_BLOCKED')
 const air=ok(await call('set_breathing_context',context(target.id,'air','actual-air')));assert.equal(air.resumedStability,true)
 state=await roundtrip(call);const life=state.monsters[target.id].npcLife.episode
 assert.equal(life.status,'stable');assert.equal(life.successes,0);assert.equal(life.recovery.hours,2)
 assert.equal(life.recovery.wakeAt,state.worldTimeSeconds+7200);assert.equal(state.monsters[target.id].hp.current,0)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a blocked third-success NPC keeps making real saves, three failures kill, and stale air never revives it',async t=>{
 const call=await engine(t,{dice:'10,10,10,1,2,19'}),target=await important(call)
 ok(await call('set_breathing_context',context(target.id,'choking')));ok(await call('advance_time',{seconds:6}))
 for(let index=0;index<3;index++)ok(await call('roll_death_save',await nextSave(call,target.id)))
 const failed=ok(await call('roll_death_save',await nextSave(call,target.id)))
 assert.equal(failed.successes,3);assert.equal(failed.failures,2);assert.equal(failed.dead,false);await roundtrip(call)
 const death=ok(await call('roll_death_save',await nextSave(call,target.id)))
 assert.equal(death.dead,true);assert.equal(death.failures,3)
 const state=await roundtrip(call);assert.equal(state.monsters[target.id].npcLife.episode.breathingBlockedStabilization,undefined)
 assert.equal(state.dmTools.breathing.creatures[target.id].episode.blockedStabilization,undefined)
 ok(await call('set_breathing_context',context(target.id,'air','after-death')))
 const air=await roundtrip(call);assert.equal(air.monsters[target.id].hp.current,0);assert.equal(air.monsters[target.id].isAlive,false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('natural stable recovery reached during choking waits for real air without another d4 or a backdated heal',async t=>{
 const call=await engine(t,{dice:'10,10,10,1,19'}),target=await important(call)
 ok(await call('update_hp',{entityId:target.id,delta:-200,reason:'Blessure réelle sans dégâts excédentaires.'}))
 for(let index=0;index<3;index++)ok(await call('roll_death_save',await nextSave(call,target.id)))
 let state=await call('get_game_state'),original=state.monsters[target.id].npcLife.episode.recovery
 ok(await call('advance_time',{seconds:original.wakeAt-state.worldTimeSeconds-1}))
 ok(await call('set_breathing_context',context(target.id,'choking','lost-air-before-wake')))
 ok(await call('advance_time',{seconds:1}));state=await roundtrip(call)
 assert.equal(state.monsters[target.id].hp.current,0)
 assert.equal(state.dmTools.breathing.creatures[target.id].blockedRecovery.wakeAt,original.wakeAt)
 ok(await call('advance_time',{seconds:2}));const realAirTime=(await call('get_game_state')).worldTimeSeconds
 ok(await call('set_breathing_context',context(target.id,'air','actual-air-after-wake')))
 state=await roundtrip(call);assert.equal(state.monsters[target.id].hp.current,1)
 assert.equal(state.monsters[target.id].npcLife.episode,undefined)
 assert.equal(state.dmTools.breathing.creatures[target.id].blockedRecovery,undefined)
 const log=state.combatLog.filter(entry=>entry.action==='Récupération naturelle après KO stable').at(-1),event=JSON.parse(log.mechanicalDetail)
 assert.equal(event.wakeAt,original.wakeAt);assert.equal(event.recoveredAt,realAirTime)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an archived suffocating NPC collapses and saves without activation or an invented initiative position',async t=>{
 const call=await engine(t,{dice:'20,19'}),target=await important(call)
 ok(await call('set_breathing_context',context(target.id,'choking')))
 await replace(call,state=>{state.sceneMemory??={};state.sceneMemory.retiredMonsters??={};state.sceneMemory.retiredMonsters[target.id]=state.monsters[target.id];delete state.monsters[target.id]})
 ok(await call('advance_time',{seconds:12}));let state=await roundtrip(call),body=state.sceneMemory.retiredMonsters[target.id]
 assert.equal(state.monsters[target.id],undefined);assert.equal(body.hp.current,0);assert.equal(body.npcLife.episode.nextSaveAt,12)
 assert.equal(ok(await call('inspect_breathing',{entityId:target.id})).active,false)
 const answer=ok(await call('roll_death_save',{entityId:target.id,eventId:body.npcLife.episode.timeEventId}))
 assert.equal(answer.archived,true);assert.equal(answer.hpAfter,0);assert.equal(answer.successes,1)
 state=await roundtrip(call);assert.equal(state.monsters[target.id],undefined);assert.deepEqual(state.initiativeOrder,[])
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a stable NPC retains its assigned combat slot and collapses only at its own actual next-round start',async t=>{
 const call=await engine(t,{dice:'10,10,10,1,20,1,19'}),target=await important(call)
 ok(await call('update_hp',{entityId:target.id,delta:-200,reason:'Blessure réelle.'}))
 for(let index=0;index<3;index++)ok(await call('roll_death_save',await nextSave(call,target.id)))
 ok(await call('set_breathing_context',context(target.id,'choking','body-lost-air')))
 ok(await call('enter_combat',{combatants:['player',target.id]}));let state=await call('get_game_state')
 assert.equal(state.currentTurn,'player');assert.ok(state.initiativeOrder.includes(target.id))
 ok(await call('next_turn',{actorId:'player',skipAction:true}));state=await call('get_game_state')
 assert.equal(state.round,2);assert.equal(state.currentTurn,'player');assert.equal(state.monsters[target.id].npcLife.episode.status,'stable')
 ok(await call('next_turn',{actorId:'player',skipAction:true}));state=await roundtrip(call)
 assert.equal(state.currentTurn,target.id);assert.equal(state.monsters[target.id].npcLife.episode.status,'dying')
 assert.equal(state.monsters[target.id].npcLife.episode.failures,0);assert.equal(state.monsters[target.id].npcLife.episode.turnEventId,undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a future suffocating active body cannot be omitted from a newly selected combat roster',async t=>{
 const call=await engine(t,{dice:'19'}),target=await important(call),other=await spawn(call)
 ok(await call('set_breathing_context',context(target.id,'hold_breath','future-collapse')))
 await refused(call,'enter_combat',{combatants:['player',other.id]},'BREATHING_COMBAT_ROSTER_REQUIRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual air on a real corpse changes no life state and a separate supported Revivify still pays its real diamond and slot',async t=>{
 const call=await engine(t,{characterId:'cleric',dice:'1,2,19'}),target=await important(call)
 ok(await call('equip_item',{itemId:'mace',slot:'main_hand',operation:'unequip'}))
 ok(await call('set_breathing_context',context(target.id,'choking','fatal-context')));ok(await call('advance_time',{seconds:6}))
 ok(await call('roll_death_save',await nextSave(call,target.id)));ok(await call('roll_death_save',await nextSave(call,target.id)))
 const input={spellId:'revivify',targetId:target.id,materialItemId:'revivify_diamonds'}
 await refused(call,'cast_spell',input,'SUFFOCATION_RECOVERY_BLOCKED')
 const dead=await call('get_game_state');ok(await call('set_breathing_context',context(target.id,'air','corpse-actually-out-of-water')))
 const air=await roundtrip(call);assert.deepEqual(air.monsters[target.id],dead.monsters[target.id]);assert.equal(air.monsters[target.id].isAlive,false)
 ok(await call('cast_spell',input));const raised=await roundtrip(call)
 assert.equal(raised.monsters[target.id].isAlive,true);assert.equal(raised.monsters[target.id].hp.current,1)
 assert.equal(raised.monsters[target.id].npcLife.episode,undefined);assert.ok(raised.monsters[target.id].npcLife.policy)
 assert.ok(!raised.player.inventory.some(item=>item.id==='revivify_diamonds'))
 assert.equal(raised.player.spellSlots.level3.current,air.player.spellSlots.level3.current-1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
