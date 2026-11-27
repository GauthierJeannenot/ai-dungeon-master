const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn}=require('./helpers/mcp-toolkit.cjs')
async function hydrate(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,input){const before=await call('get_game_state');assert.ok((await call(name,input)).error);assert.deepEqual(await call('get_game_state'),before)}
const hurt=(call,id,amount)=>call('update_hp',{entityId:id,delta:-amount,damageType:'force',damageOrigin:'environment',reason:'Blessure réelle distincte du poison.'})
async function target(call,npc,max=6){
 const id=npc?(await spawn(call,'commoner')).id:'player'
 await replace(call,state=>{const actor=npc?state.monsters[id]:state.player;actor.hp={current:max,max}})
 if(npc)ok(await call('configure_npc_death_saves',{entityId:id,eventId:'pre-injury-policy',reason:'Exception PNJ explicitement décidée avant toute blessure.'}))
 return id
}
async function poison(call,id){
 const state=await call('get_game_state'),actor=id==='player'?state.player:state.monsters[id]
 ok(await call('create_affliction_source',{sourceId:'tincture',templateId:'pale_tincture',name:'Teinture pâle réellement ingérée',cell:actor.position,doses:1}))
 const result=ok(await call('expose_affliction',{sourceId:'tincture',eventId:'exposure',targetId:id,delivery:'ingested'}))
 assert.equal(result.damageResolution.damageDealt,6)
}
async function save(call,id){
 const state=await call('get_game_state'),next=id==='player'?state.dmTools.playerLife.episode.nextSaveAt:actor(state,id).npcLife.episode.nextSaveAt
 if(next>state.worldTimeSeconds)ok(await call('advance_time',{seconds:next-state.worldTimeSeconds}))
 const ready=await call('get_game_state'),eventId=id==='player'?(await call('inspect_player_life')).event.eventId:actor(ready,id).npcLife.episode.timeEventId
 return{eventId,result:ok(await call('roll_death_save',{entityId:id,eventId}))}
}
function actor(state,id){return id==='player'?state.player:state.monsters[id]??state.sceneMemory.retiredMonsters[id]}
async function cleric(call){
 await replace(call,state=>{if(!state.player.knownSpells.includes('protection-from-poison'))state.player.knownSpells.push('protection-from-poison')})
 const state=await call('get_game_state'),main=state.dmTools?.loadout?.mainHandId??state.player.inventory.find(item=>item.type==='weapon').id
 ok(await call('equip_item',{itemId:main,operation:'unequip',slot:'main_hand'}))
}
async function cureNpc(call,id){return ok(await call('cast_spell',{spellId:'protection-from-poison',targetId:id,slotLevel:2,afflictionId:'tincture:exposure'}))}
async function stone(call,id){
 await replace(call,state=>state.hero.effects.push({id:'real-stone',kind:'established-petrification',sourceId:'player',targetIds:[id],expiresAt:state.worldTimeSeconds+100,concentration:false,data:{condition:'petrified'}}))
 ok(await call('apply_condition',{entityId:id,condition:'petrified'}))
}

for(const npc of [false,true])test(`${npc?'NPC':'player'} natural20 respects an active zero healing ceiling, counts one success and three successes stabilize without an action`,async t=>{
 const call=await engine(t,{dice:'1,6,20,10,10,2,19'}),id=await target(call,npc);await poison(call,id)
 await refused(call,'roll_death_save',{entityId:id,eventId:'not-an-actual-due-event'})
 const first=await save(call,id);assert.equal(first.result.hpAfter,0);assert.equal(first.result.successes,1);assert.equal(first.result.afflictionHealingBlocked,true);assert.equal(first.result.criticalSuccess,true);assert.equal(first.result.actionSpent,false)
 let state=await hydrate(call),before=structuredClone(state);ok(await call('roll_death_save',{entityId:id,eventId:first.eventId}));assert.deepEqual(await call('get_game_state'),before)
 await save(call,id);const third=await save(call,id);assert.equal(third.result.stable,true);assert.equal(third.result.hpAfter,0)
 state=await hydrate(call);assert.equal(state.dmTools.afflictions.records['tincture:exposure'].status,'active')
 assert.equal(npc?actor(state,id).npcLife.episode.recovery.hours:state.dmTools.playerRecovery.episode.hours,2)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

for(const npc of [false,true])test(`${npc?'NPC':'player'} natural20 restores the one legal HP when Pale Tincture has not blocked the whole maximum`,async t=>{
 const call=await engine(t,{dice:'1,6,20,19'}),id=await target(call,npc,7);await poison(call,id);ok(await hurt(call,id,1))
 const saved=await save(call,id);assert.equal(saved.result.hpAfter,1);assert.equal(saved.result.afflictionHealingBlocked,false);assert.equal(saved.result.actionSpent,false)
 const state=await hydrate(call);assert.equal(actor(state,id).hp.current,1);assert.equal(state.dmTools.afflictions.records['tincture:exposure'].unhealableDamage,6)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('curing an NPC after an prevented natural20 stores no deferred HP; only a new real natural20 heals',async t=>{
 const call=await engine(t,{characterId:'cleric',dice:'1,6,20,10,20,19'});await cleric(call);const id=await target(call,true);await poison(call,id)
 const first=await save(call,id);assert.equal(first.result.hpAfter,0);await cureNpc(call,id)
 let state=await hydrate(call);assert.equal(state.dmTools.afflictions.records['tincture:exposure'].status,'cured');assert.equal(actor(state,id).hp.current,0)
 ok(await call('roll_death_save',{entityId:id,eventId:first.eventId}));assert.deepEqual(await call('get_game_state'),state)
 assert.equal((await save(call,id)).result.hpAfter,0);assert.equal((await save(call,id)).result.hpAfter,1)
 state=await hydrate(call);assert.equal(actor(state,id).npcLife.episode,undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an NPC natural wake blocked by the poison retains its exact die/deadline, hydrates, then resumes once at the real cure',async t=>{
 const call=await engine(t,{characterId:'cleric',dice:'1,6,20,10,10,1,19'});await cleric(call);const id=await target(call,true);await poison(call,id)
 let third;for(let i=0;i<3;i++)third=await save(call,id)
 let state=await hydrate(call),recovery=actor(state,id).npcLife.episode.recovery;assert.equal(recovery.hours,1)
 ok(await call('advance_time',{seconds:recovery.wakeAt-state.worldTimeSeconds}));state=await hydrate(call)
 const held=actor(state,id).npcLife.episode.recovery;assert.equal(actor(state,id).hp.current,0);assert.equal(held.wakeAt,recovery.wakeAt);assert.equal(held.healingHold.blockedAt,recovery.wakeAt)
 ok(await call('advance_time',{seconds:5}))
 const corrupt=await call('get_game_state');corrupt.monsters[id].npcLife.episode.recovery.healingHold.sources[0].damage=0
 await refused(call,'replace_game_state',{gameState:corrupt})
 const falseRelease=await call('get_game_state');falseRelease.monsters[id].npcLife.episode.recovery.healingHold.availableAt=falseRelease.worldTimeSeconds
 await refused(call,'replace_game_state',{gameState:falseRelease})
 await cureNpc(call,id);state=await hydrate(call);assert.equal(actor(state,id).hp.current,1);assert.equal(actor(state,id).npcLife.episode,undefined)
 ok(await call('roll_death_save',{entityId:id,eventId:third.eventId}));assert.deepEqual(await call('get_game_state'),state)
 const wake=state.combatLog.find(entry=>entry.mechanicalDetail?.includes('"recoveredAt"')&&entry.mechanicalDetail.includes(id));assert.ok(wake);const detail=JSON.parse(wake.mechanicalDetail);assert.equal(detail.wakeAt,recovery.wakeAt);assert.equal(detail.recoveredAt,recovery.wakeAt+5)
 ok(await call('advance_time',{seconds:1}));assert.equal(actor(await call('get_game_state'),id).hp.current,1)
 ok(await hurt(call,id,7));assert.equal(actor(await call('get_game_state'),id).isAlive,false)
 ok(await call('advance_time',{seconds:1}));assert.equal(actor(await call('get_game_state'),id).isAlive,false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

for(const npc of [false,true])test(`${npc?'NPC':'player'} a real suspension temporarily releases the existing ceiling without ending its poison`,async t=>{
 const call=await engine(t,{dice:npc?'1,6,20,19':'1,6,20,20,19'}),id=await target(call,npc,npc?6:7);await poison(call,id)
 if(!npc)ok(await call('add_exhaustion',{eventId:'real-exhaustion-source',targetId:id,levels:4,reason:'Le MJ établit une source réelle de quatre niveaux avant la pétrification.'}))
 await stone(call,id)
 if(!npc)ok(await hurt(call,id,2)) // Real stone resistance halves this to the remaining one HP.
 const saved=await save(call,id);assert.equal(saved.result.hpAfter,1);assert.equal(saved.result.afflictionHealingBlocked,false)
 let state=await hydrate(call);assert.ok(actor(state,id).conditions.includes('petrified'));assert.ok(state.dmTools.afflictions.records['tincture:exposure'].petrificationPause)
 ok(await call('advance_time',{seconds:94}));state=await hydrate(call);assert.equal(state.dmTools.afflictions.records['tincture:exposure'].petrificationPause,undefined);assert.equal(actor(state,id).hp.current,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a held NPC natural wake resumes on a real suspension while keeping petrification and the original poison',async t=>{
 const call=await engine(t,{dice:'1,6,20,10,10,1,19'}),id=await target(call,true);await poison(call,id)
 for(let i=0;i<3;i++)await save(call,id)
 let state=await call('get_game_state'),wakeAt=actor(state,id).npcLife.episode.recovery.wakeAt
 ok(await call('advance_time',{seconds:wakeAt-state.worldTimeSeconds}));await hydrate(call);await stone(call,id)
 state=await hydrate(call);assert.equal(actor(state,id).hp.current,1);assert.ok(actor(state,id).conditions.includes('petrified'));assert.equal(actor(state,id).npcLife.episode,undefined)
 assert.equal(state.dmTools.afflictions.records['tincture:exposure'].status,'active');assert.ok(state.dmTools.afflictions.records['tincture:exposure'].petrificationPause)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actual archived NPC save uses its own healing ceiling without activating its token',async t=>{
 const call=await engine(t,{dice:'1,6,20,19'}),id=await target(call,true);await poison(call,id)
 await replace(call,state=>{state.sceneMemory.retiredMonsters??={};state.sceneMemory.retiredMonsters[id]=state.monsters[id];delete state.monsters[id]})
 const saved=await save(call,id);assert.equal(saved.result.hpAfter,0);assert.equal(saved.result.archived,true);assert.equal(saved.result.afflictionHealingBlocked,true)
 const state=await hydrate(call);assert.equal(state.monsters[id],undefined);assert.equal(actor(state,id).npcLife.episode.successes,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a genuine maximum-HP increase can release an observed NPC natural wake without changing the poison or rolling again',async t=>{
 const call=await engine(t,{dice:'1,6,20,20,10,10,10,10,1,19'}),id=await target(call,true,12);await poison(call,id)
 ok(await call('add_exhaustion',{eventId:'prior-exhaustion',targetId:id,levels:4,reason:'Source réelle d’épuisement avant la chute.'}));ok(await hurt(call,id,6))
 for(let i=0;i<3;i++)await save(call,id)
 let state=await hydrate(call),wakeAt=actor(state,id).npcLife.episode.recovery.wakeAt
 ok(await call('advance_time',{seconds:wakeAt-state.worldTimeSeconds}));state=await hydrate(call);assert.ok(actor(state,id).npcLife.episode.recovery.healingHold)
 const input={eventId:'real-exhaustion-relief',targetId:id,levels:1,reason:'Une source effective enlève exactement un niveau ; aucun soin direct.'}
 ok(await call('remove_exhaustion',input));state=await hydrate(call);assert.equal(actor(state,id).hp.current,1);assert.equal(actor(state,id).hp.max,12);assert.equal(actor(state,id).npcLife.episode,undefined)
 assert.equal(state.dmTools.afflictions.records['tincture:exposure'].status,'active')
 ok(await call('remove_exhaustion',input));assert.deepEqual(await call('get_game_state'),state)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('nonfatal exhaustion changes preserve a true dying NPC episode; level six records actual death and later relief cannot resurrect it',async t=>{
 const call=await engine(t,{dice:'10,19'}),id=await target(call,true,12);ok(await hurt(call,id,12));await save(call,id)
 let state=await hydrate(call),episode=structuredClone(actor(state,id).npcLife.episode)
 const reason='Événement réel d’épuisement, sans dégât ni soin.'
 ok(await call('add_exhaustion',{eventId:'one-real-level',targetId:id,levels:1,reason}));state=await hydrate(call)
 assert.equal(actor(state,id).isAlive,true);assert.deepEqual(actor(state,id).npcLife.episode,episode);assert.equal(state.hero.corpseTimes[id],undefined)
 ok(await call('remove_exhaustion',{eventId:'one-real-relief',targetId:id,levels:1,reason}));state=await hydrate(call)
 assert.deepEqual(actor(state,id).npcLife.episode,episode);assert.equal(actor(state,id).hp.current,0)
 ok(await call('add_exhaustion',{eventId:'actual-fatal-exhaustion',targetId:id,levels:6,reason}));state=await hydrate(call)
 assert.equal(actor(state,id).isAlive,false);assert.equal(actor(state,id).npcLife.episode.status,'dead');assert.equal(state.hero.corpseTimes[id],6)
 ok(await call('remove_exhaustion',{eventId:'corpse-exhaustion-bookkeeping',targetId:id,levels:1,reason}));state=await hydrate(call)
 assert.equal(actor(state,id).isAlive,false);assert.equal(actor(state,id).hp.current,0);assert.equal(actor(state,id).npcLife.episode.status,'dead')
 await refused(call,'roll_death_save',{entityId:id,eventId:episode.timeEventId})
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
