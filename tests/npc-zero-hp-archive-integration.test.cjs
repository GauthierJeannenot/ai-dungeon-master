const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,adjacent}=require('./helpers/mcp-toolkit.cjs')
const {AFFLICTIONS}=require('../mcp-server/dist/lib/srd/afflictions.js')

async function spawn(call,monsterType='goblin'){
 const state=await call('get_game_state')
 return ok(await call('spawn_monster',{monsterType,cell:adjacent(state)[0]}))
}
const body=(state,id,mapId)=>state.monsters[id]??state.sceneMemory?.floorMonsters?.[mapId]?.[id]
const episode=(state,id,mapId)=>body(state,id,mapId).npcLife?.episode
const spriteEffects=(state,id)=>state.monsterEffects.filter(effect=>effect.targetId===id&&['sprite-poison','sprite-sleep'].includes(effect.kind))
const hurt=(call,id,amount)=>call('update_hp',{entityId:id,delta:-amount,damageType:'force',damageOrigin:'environment',reason:'Dégât réel choisi pour ce cas d’intégration.'})
async function roundtrip(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.ok(answer.error,JSON.stringify(answer));if(code)assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)}
async function configure(call,id){return ok(await call('configure_npc_death_saves',{entityId:id,eventId:`important:${id}`,reason:'Décision explicite du MJ sur ce vrai PNJ avant toute blessure.'}))}

async function fixture(t,dice){
 const call=await engine(t,{characterId:'cleric',dice}),initial=await call('get_game_state')
 const layout=ok(await call('generate_dungeon',{seed:'npc-zero-hp-archives',width:3,height:3,count:5})).layout
 const installed=ok(await call('install_dungeon',{dungeonId:'npc-zero-side',layout,entranceCell:initial.player.position,
  questLink:{goal:'Retrouver la personne recherchée.',lead:'Ce passage contient une piste concrète liée à la recherche.',delivery:'clue',discoveryDc:15}}))
 return{call,initial,installed,mapId:initial.currentMapId}
}

async function stone(call,id,seconds){
 // Explicit fixture authoring of a timed source only. The actual condition
 // entry below must create every pause; no pause/history/counter is forged.
 const providerId=`fixture-stone:${id}`
 await replace(call,state=>state.hero.effects.push({id:providerId,kind:'fixture-established-petrification',sourceId:'player',targetIds:[id],
  expiresAt:state.worldTimeSeconds+seconds,concentration:false,data:{condition:'petrified'}}))
 ok(await call('apply_condition',{entityId:id,condition:'petrified'}))
 return providerId
}
async function archive(f,id){
 const before=await f.call('get_game_state'),position=structuredClone(before.monsters[id].position)
 ok(await f.call('travel_to_map',{transitionId:f.installed.entryTransitionId}))
 const after=await roundtrip(f.call)
 assert.equal(after.monsters[id],undefined);assert.deepEqual(body(after,id,f.mapId).position,position)
 assert.deepEqual(after.initiativeOrder,[]);assert.equal(after.currentTurn,null)
 return after
}
async function returnToBody(f,id){
 ok(await f.call('travel_to_map',{transitionId:f.installed.exitTransitionId}))
 const after=await roundtrip(f.call);assert.ok(after.monsters[id]);assert.equal(after.currentMapId,f.mapId)
 return after
}
async function saveDue(f,id){
 let state=await f.call('get_game_state'),due=episode(state,id,f.mapId)
 assert.equal(due.status,'dying');assert.ok(due.timeEventId)
 if(due.nextSaveAt>state.worldTimeSeconds)ok(await f.call('advance_time',{seconds:due.nextSaveAt-state.worldTimeSeconds}))
 state=await f.call('get_game_state');due=episode(state,id,f.mapId)
 const input=Object.freeze({entityId:id,eventId:due.timeEventId})
 const result=ok(await f.call('roll_death_save',input))
 return{input,result,state:await roundtrip(f.call)}
}
async function policyZero(t,{dice='20,19',stoneSeconds=6}={}){
 const f=await fixture(t,dice),target=await spawn(f.call)
 await configure(f.call,target.id)
 if(stoneSeconds)await stone(f.call,target.id,stoneSeconds)
 ok(await hurt(f.call,target.id,target.hp.current*(stoneSeconds?2:1)))
 const state=await roundtrip(f.call)
 assert.equal(body(state,target.id,f.mapId).hp.current,0);assert.equal(episode(state,target.id,f.mapId).status,'dying')
 return{...f,target}
}
async function stableStoneKo(t,{seconds=100,dice='20,1,17,16,1,20,19'}={}){
 const f=await fixture(t,dice),target=await spawn(f.call)
 await configure(f.call,target.id)
 ok(await hurt(f.call,target.id,target.hp.current-1));await stone(f.call,target.id,seconds)
 ok(await f.call('enter_combat',{combatants:['player',target.id]}))
 const attack=ok(await f.call('resolve_player_attack',{targetId:target.id,weaponOrSpell:'unarmed',nonlethal:true}))
 assert.equal(attack.targetKnockedOut,true)
 ok(await f.call('end_combat'))
 return{...f,target,attack}
}

for(const [offset,retained]of [[-10,true],[0,true],[10,false]])test('archived sprite pause and stable KO use actual stone expiry '+offset+' seconds from the recovery boundary',async t=>{
 const f=await fixture(t,'10,1,20,17,17,1,17,16,1,19'),target=await spawn(f.call),sprite=await spawn(f.call,'sprite')
 ok(await f.call('enter_combat',{combatants:['player',target.id,sprite.id]}))
 assert.equal((await f.call('get_game_state')).currentTurn,sprite.id)
 ok(await f.call('resolve_attack',{attackerId:sprite.id,targetId:target.id,weaponOrSpell:'Shortbow'}))
 const poisoned=await f.call('get_game_state'),effects=spriteEffects(poisoned,target.id)
 assert.equal(effects.length,2,'the actual sprite hit produced both linked sources')
 const providerId=await stone(f.call,target.id,3600+offset)
 const paused=await f.call('get_game_state');assert.ok(spriteEffects(paused,target.id).every(effect=>effect.petrificationPause))
 ok(await hurt(f.call,target.id,(paused.monsters[target.id].hp.current-1)*2))
 ok(await f.call('next_turn',{actorId:sprite.id}))
 ok(await f.call('resolve_player_attack',{targetId:target.id,weaponOrSpell:'unarmed',nonlethal:true}))
 ok(await f.call('end_combat',{force:true,reason:'Le MJ établit une trêve après ce KO réel.'}))
 const ko=await f.call('get_game_state'),wakeAt=ko.monsters[target.id].knockout.recovery.wakeAt
 assert.equal(wakeAt,3600)
 await archive(f,target.id)
 const resolved=ok(await f.call('advance_time',{seconds:3600})),event=resolved.naturalRecoveries.find(event=>event.entityId===target.id)
 assert.ok(event);assert.equal(event.archived,true);assert.equal(event.unconsciousRetained,retained)
 let state=await roundtrip(f.call),record=body(state,target.id,f.mapId)
 assert.equal(record.hp.current,1);assert.equal(record.isAlive,true);assert.ok(record.conditions.includes('prone'))
 assert.equal(record.conditions.includes('petrified'),offset>0)
 if(offset>0)ok(await f.call('advance_time',{seconds:offset}))
 state=await roundtrip(f.call)
 assert.equal(body(state,target.id,f.mapId).conditions.includes('unconscious'),true,'the actually resumed sleep still applies at its own boundary')
 assert.ok(!state.hero.effects.some(effect=>effect.id===providerId))
 const resumed=spriteEffects(state,target.id)
 assert.deepEqual(resumed.map(effect=>effect.id).sort(),effects.map(effect=>effect.id).sort())
 for(const effect of resumed){assert.equal(effect.petrificationPause,undefined);assert.equal(effect.expiresAt,3660+offset)}
 ok(await f.call('advance_time',{seconds:100}));state=await returnToBody(f,target.id)
 assert.equal(spriteEffects(state,target.id).length,0);assert.equal(state.monsters[target.id].hp.current,1)
 assert.ok(!state.monsters[target.id].conditions.includes('unconscious'));assert.ok(!state.monsters[target.id].conditions.includes('petrified'))
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('zero adjusted damage retains stable KO, but positive received damage absorbed by temporary HP opens only the real dying episode',async t=>{
 const f=await stableStoneKo(t),id=f.target.id,stable=await f.call('get_game_state'),oldWake=stable.monsters[id].knockout.recovery.wakeAt
 await refused(f.call,'enter_combat',{combatants:['player',id]})
 const zero=ok(await hurt(f.call,id,1));assert.equal(zero.damageResolution.damageReceived,0)
 assert.deepEqual((await f.call('get_game_state')).monsters[id],stable.monsters[id])
 ok(await f.call('grant_temporary_hp',{eventId:'body-buffer',targetId:id,sourceId:'established-body-buffer',sourceDescription:'Protection temporaire réellement établie sur ce corps.',amount:2,duration:{kind:'until_long_rest'}}))
 const damage=ok(await hurt(f.call,id,2));assert.equal(damage.damageResolution.damageReceived,1);assert.equal(damage.damageResolution.hpLost,0)
 assert.equal(damage.damageResolution.temporaryHp.absorbed,1)
 let state=await roundtrip(f.call)
 assert.equal(state.monsters[id].knockout,undefined);assert.equal(episode(state,id,f.mapId).status,'dying');assert.equal(episode(state,id,f.mapId).failures,1)
 assert.equal(episode(state,id,f.mapId).recovery,undefined)
 await archive(f,id);state=(await saveDue(f,id)).state
 assert.equal(body(state,id,f.mapId).hp.current,1);assert.equal(episode(state,id,f.mapId),undefined)
 const later=ok(await f.call('advance_time',{seconds:oldWake+100-state.worldTimeSeconds}))
 assert.equal(later.naturalRecoveries.filter(event=>event.entityId===id).length,0,'the cancelled old stable timer never fires')
 state=await returnToBody(f,id);assert.equal(state.monsters[id].hp.current,1);assert.ok(state.monsters[id].npcLife.policy)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('last stone expiry at an archived NPC save boundary leaves HP0 unconscious and counters untouched until the explicit GM save',async t=>{
 const f=await policyZero(t),id=f.target.id;await archive(f,id)
 await refused(f.call,'advance_time',{seconds:7},'NPC_DEATH_SAVE_EVENT_REQUIRED')
 ok(await f.call('advance_time',{seconds:6}));let state=await roundtrip(f.call),record=body(state,id,f.mapId)
 assert.equal(record.hp.current,0);assert.equal(record.isAlive,true);assert.ok(record.conditions.includes('unconscious'))
 assert.ok(!record.conditions.includes('petrified'));assert.equal(record.npcLife.episode.successes,0);assert.equal(record.npcLife.episode.failures,0)
 state=(await saveDue(f,id)).state;record=body(state,id,f.mapId)
 assert.equal(record.hp.current,1);assert.equal(record.isAlive,true);assert.ok(record.conditions.includes('prone'));assert.equal(record.npcLife.episode,undefined)
 assert.equal(state.monsters[id],undefined);assert.deepEqual(state.initiativeOrder,[]);assert.equal(state.currentTurn,null)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual archived death saves can cause real death at the second source boundary without spawning or losing the corpse time',async t=>{
 const f=await policyZero(t,{dice:'1,9,19',stoneSeconds:12}),id=f.target.id;await archive(f,id)
 let saved=await saveDue(f,id),record=body(saved.state,id,f.mapId)
 assert.equal(record.npcLife.episode.failures,2);assert.equal(record.isAlive,true);assert.ok(record.conditions.includes('petrified'))
 saved=await saveDue(f,id);record=body(saved.state,id,f.mapId)
 assert.equal(record.isAlive,false);assert.equal(record.hp.current,0);assert.equal(record.npcLife.episode.status,'dead')
 assert.equal(record.npcLife.episode.failures,3);assert.equal(record.npcLife.episode.deathReason,'failed_saves')
 assert.equal(saved.state.hero.corpseTimes[id],12);assert.equal(saved.state.monsters[id],undefined)
 const before=await f.call('get_game_state');ok(await f.call('roll_death_save',saved.input));assert.deepEqual(await f.call('get_game_state'),before)
 const returned=await returnToBody(f,id);assert.equal(returned.monsters[id].isAlive,false);assert.equal(returned.hero.corpseTimes[id],12)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('restabilization after real damage rolls a new generic timer and never revives on the cancelled pre-stone KO deadline',async t=>{
 const f=await stableStoneKo(t,{seconds:10,dice:'20,1,17,16,1,17,18,19,2,20'}),id=f.target.id
 const oldWake=(await f.call('get_game_state')).monsters[id].knockout.recovery.wakeAt
 ok(await hurt(f.call,id,2));await archive(f,id)
 for(let i=0;i<3;i++)await saveDue(f,id)
 let state=await roundtrip(f.call),stable=episode(state,id,f.mapId)
 assert.equal(stable.status,'stable');assert.equal(stable.successes,0);assert.equal(stable.failures,0)
 assert.deepEqual(stable.recovery,{hours:2,wakeAt:stable.stableAt+7200})
 assert.equal(body(state,id,f.mapId).knockout,undefined,'generic stabilization never invents a player attack witness')
 ok(await f.call('advance_time',{seconds:oldWake-state.worldTimeSeconds}));state=await roundtrip(f.call)
 assert.equal(body(state,id,f.mapId).hp.current,0);assert.ok(body(state,id,f.mapId).conditions.includes('unconscious'))
 const recovered=ok(await f.call('advance_time',{seconds:stable.recovery.wakeAt-state.worldTimeSeconds}))
 assert.equal(recovered.naturalRecoveries.filter(event=>event.entityId===id).length,1)
 state=await returnToBody(f,id);assert.equal(state.monsters[id].hp.current,1);assert.ok(state.monsters[id].conditions.includes('prone'))
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,20)
})

test('an archived living zero-HP body never becomes a new damage, healing, condition, exposure or medicine target',async t=>{
 const f=await policyZero(t,{dice:'20,1,19',stoneSeconds:100}),id=f.target.id;await archive(f,id)
 const state=await f.call('get_game_state'),main=state.dmTools?.loadout?.mainHandId??state.player.inventory.find(item=>item.type==='weapon')?.id
 if(main)ok(await f.call('equip_item',{itemId:main,slot:'main_hand',operation:'unequip'}))
 ok(await f.call('create_affliction_source',{sourceId:'fresh-current-source',templateId:'malice',name:'Source actuelle réellement créée pour le refus distant.',cell:state.player.position,doses:1}))
 const helper=await spawn(f.call);ok(await f.call('enter_combat',{combatants:['player',helper.id]}))
 for(const [name,input]of [
  ['update_hp',{entityId:id,delta:1,reason:'Soin nouveau hors carte.'}],
  ['update_hp',{entityId:id,delta:-2,damageType:'force',damageOrigin:'environment',reason:'Dégât nouveau hors carte.'}],
  ['apply_condition',{entityId:id,condition:'poisoned'}],
  ['expose_affliction',{sourceId:'fresh-current-source',eventId:'new-remote-exposure',targetId:id,delivery:AFFLICTIONS.malice.delivery}],
  ['cast_spell',{spellId:'cure-wounds',targetId:id}],
  ['combat_action',{action:'stabilize',actorId:'player',targetId:id}],
 ])await refused(f.call,name,input)
 assert.equal((await f.call('get_game_state')).monsters[id],undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real return preserves important-NPC policy and old save receipts without reapplying their healing to a new episode',async t=>{
 const f=await policyZero(t,{dice:'20,9,19'}),id=f.target.id;await archive(f,id)
 const first=await saveDue(f,id),policy=structuredClone(body(first.state,id,f.mapId).npcLife.policy)
 let state=await returnToBody(f,id);assert.equal(state.monsters[id].hp.current,1);assert.deepEqual(state.monsters[id].npcLife.policy,policy)
 ok(await hurt(f.call,id,1));state=await roundtrip(f.call)
 assert.equal(state.monsters[id].hp.current,0);assert.equal(state.monsters[id].npcLife.episode.status,'dying')
 const nextEpisode=structuredClone(state.monsters[id].npcLife.episode),before=await f.call('get_game_state')
 ok(await f.call('roll_death_save',first.input));assert.deepEqual(await f.call('get_game_state'),before,'a historical nat20 result is not a new healing event')
 const second=await saveDue(f,id);state=second.state
 assert.equal(state.monsters[id].hp.current,0);assert.equal(state.monsters[id].npcLife.episode.id,nextEpisode.id)
 assert.equal(state.monsters[id].npcLife.episode.failures,1);assert.deepEqual(state.monsters[id].npcLife.policy,policy)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a new combat cannot omit a real active dying NPC, while its explicitly selected roster slot receives the actual due save turn',async t=>{
 const f=await policyZero(t,{dice:'1,20,17,19',stoneSeconds:0}),id=f.target.id,other=await spawn(f.call)
 await refused(f.call,'enter_combat',{combatants:['player',other.id]},'NPC_DYING_COMBATANT_REQUIRED')
 const state=await f.call('get_game_state'),cell=adjacent(state)[0]
 await refused(f.call,'start_encounter',{monsters:[{monsterType:'goblin',cell}],playerCell:state.player.position,reason:'Rencontre explicitement proposée sans sélection de l’ancien mourant.'},'NPC_DYING_COMBATANT_REQUIRED')
 const entered=ok(await f.call('enter_combat',{combatants:['player',id]}))
 assert.equal(entered.currentTurn,id)
 let current=await roundtrip(f.call),eventId=current.monsters[id].npcLife.episode.turnEventId
 assert.ok(eventId,'the actual start-of-turn hook exposes its own witness')
 ok(await f.call('roll_death_save',{entityId:id,eventId}))
 current=await f.call('get_game_state');assert.equal(current.monsters[id].npcLife.episode.successes,1)
 assert.equal(current.monsters[id].hp.current,0);assert.equal(Boolean(current.actionUsed.player),false)
 ok(await f.call('next_turn',{actorId:id}))
 assert.equal((await f.call('get_game_state')).currentTurn,'player')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
