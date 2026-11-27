const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle,grid}=require('./helpers/mcp-toolkit.cjs')
async function fixture(t,{dice='19',policy=true,hp=1,type='goblin',combat=true}={}){
 const call=await engine(t,{dice}),target=await spawn(call,type)
 if(policy)ok(await call('configure_npc_death_saves',{entityId:target.id,eventId:'important-npc',reason:'Ce véritable acteur important suit explicitement les sauvegardes contre la mort.'}))
 await replace(call,state=>{state.monsters[target.id].hp.current=hp})
 if(combat)await battle(call,[target.id])
 return {call,target}
}
const hurt=(call,id,amount,extra={})=>call('update_hp',{entityId:id,delta:-amount,reason:'Dégâts réellement établis dans ce scénario.',...extra})
async function dying(t,options={}){const f=await fixture(t,options);ok(await hurt(f.call,f.target.id,options.hp??1));return f}
async function outside(call){ok(await call('end_combat'))}
async function nextSave(call,id){const before=await call('get_game_state'),at=before.monsters[id].npcLife.episode.nextSaveAt;if(at>before.worldTimeSeconds)ok(await call('advance_time',{seconds:at-before.worldTimeSeconds}));const state=await call('get_game_state');return {entityId:id,eventId:state.monsters[id].npcLife.episode.timeEventId}}
async function roundtrip(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,args,code){const before=await call('get_game_state');assert.equal((await call(name,args)).code,code);assert.deepEqual(await call('get_game_state'),before)}

test('only the explicit pre-injury immutable MJ policy opts a real statted NPC into death saves',async t=>{
 const{call,target}=await fixture(t,{policy:false,combat:false}),other=await spawn(call),wisp=await spawn(call,'will_o_wisp')
 const input={entityId:target.id,eventId:'chosen-important',reason:'Le MJ choisit ce PNJ important avant sa blessure.'}
 ok(await call('configure_npc_death_saves',input));const before=await call('get_game_state')
 assert.equal(ok(await call('configure_npc_death_saves',input)).alreadyConfigured,true)
 assert.deepEqual(await call('get_game_state'),before)
 await refused(call,'configure_npc_death_saves',{...input,reason:'Une autre règle après coup.'},'NPC_POLICY_IMMUTABLE')
 await refused(call,'configure_npc_death_saves',{...input,entityId:other.id},'NPC_POLICY_EVENT_CONFLICT')
 await refused(call,'configure_npc_death_saves',{...input,entityId:'narrative-without-statistics',eventId:'story'},'NPC_LIFE_ACTOR_REQUIRED')
 await refused(call,'configure_npc_death_saves',{...input,entityId:wisp.id,eventId:'immune'},'NPC_LIFE_CONDITION_IMMUNE')
 ok(await hurt(call,other.id,200));let state=await call('get_game_state')
 assert.equal(state.monsters[other.id].isAlive,false);assert.equal(state.monsters[other.id].npcLife,undefined)
 await refused(call,'configure_npc_death_saves',{...input,entityId:other.id,eventId:'too-late'},'NPC_POLICY_PREINJURY_REQUIRED')
 await refused(call,'update_hp',{entityId:other.id,delta:1,reason:'Un soin ordinaire ne ressuscite pas.'},'ENTITY_DEAD')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('three real successes reset both counters and start a generic one-die stable recovery without a forged knockout attack',async t=>{
 const{call,target}=await dying(t,{dice:'10,10,10,2,19'});await outside(call)
 for(let index=0;index<3;index++)ok(await call('roll_death_save',await nextSave(call,target.id)))
 const stable=await roundtrip(call),body=stable.monsters[target.id],episode=body.npcLife.episode
 assert.equal(body.isAlive,true);assert.equal(body.hp.current,0);assert.equal(body.knockout,undefined)
 assert.equal(episode.status,'stable');assert.equal(episode.successes,0);assert.equal(episode.failures,0)
 assert.deepEqual(episode.recovery,{hours:2,wakeAt:7218});assert.equal(episode.timeEventId,undefined)
 const recovered=ok(await call('advance_time',{seconds:7200}));assert.equal(recovered.naturalRecoveries.length,1)
 assert.equal(recovered.naturalRecoveries[0].origin,'policy');assert.equal(recovered.naturalRecoveries[0].wakeAt,7218)
 assert.equal(recovered.naturalRecoveries[0].attackEventId,undefined)
 const after=await roundtrip(call);assert.equal(after.monsters[target.id].hp.current,1);assert.equal(after.monsters[target.id].npcLife.episode,undefined)
 assert.ok(after.monsters[target.id].npcLife.policy);assert.ok(after.monsters[target.id].conditions.includes('prone'))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('natural one adds two failures and the third failure records the real death instant without resurrection on replay',async t=>{
 const{call,target}=await dying(t,{dice:'1,2,19'});await outside(call)
 const firstInput=await nextSave(call,target.id),first=ok(await call('roll_death_save',firstInput))
 assert.equal(first.criticalFailure,true);assert.equal(first.failures,2);assert.equal(first.dead,false)
 const last=ok(await call('roll_death_save',await nextSave(call,target.id)))
 assert.equal(last.dead,true);assert.equal(last.failures,3);assert.equal(last.at,12)
 const dead=await roundtrip(call);assert.equal(dead.hero.corpseTimes[target.id],12)
 assert.equal(dead.monsters[target.id].npcLife.episode.deathReason,'failed_saves')
 assert.equal(ok(await call('roll_death_save',firstInput)).alreadyResolved,true);assert.deepEqual(await call('get_game_state'),dead)
 await refused(call,'update_hp',{entityId:target.id,delta:1,reason:'Pas de résurrection par un soin.'},'ENTITY_DEAD')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('outside combat exact due-event witnesses gate time and arbitrary retry IDs cannot consume another save',async t=>{
 const{call,target}=await dying(t,{dice:'10,10,19'});await outside(call)
 const initial=await call('get_game_state'),scheduled=initial.monsters[target.id].npcLife.episode.timeEventId
 await refused(call,'roll_death_save',{entityId:target.id,eventId:scheduled},'NPC_DEATH_SAVE_EVENT_NOT_DUE')
 await refused(call,'advance_time',{seconds:7},'NPC_DEATH_SAVE_EVENT_REQUIRED')
 const event=await nextSave(call,target.id)
 await refused(call,'roll_death_save',{entityId:target.id,eventId:'arbitrary-client-nonce'},'NPC_DEATH_SAVE_EVENT_NOT_DUE')
 ok(await call('roll_death_save',event));const after=await call('get_game_state')
 assert.equal(ok(await call('roll_death_save',event)).alreadyResolved,true);assert.deepEqual(await call('get_game_state'),after)
 await refused(call,'advance_time',{seconds:7},'NPC_DEATH_SAVE_EVENT_REQUIRED')
 ok(await call('roll_death_save',await nextSave(call,target.id)))
 assert.equal((await call('get_game_state')).monsters[target.id].npcLife.episode.successes,2)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an NPC death save is not a Constitution save and does not gain the creature ability modifier',async t=>{
 const{call,target}=await fixture(t,{type:'zombie',dice:'9,19'})
 ok(await hurt(call,target.id,1,{critical:true,damageType:'force',damageOrigin:'environment'}));await outside(call)
 const before=await call('get_game_state');assert.ok(before.monsters[target.id].stats.con>10)
 const result=ok(await call('roll_death_save',await nextSave(call,target.id)))
 assert.equal(result.naturalRoll,9);assert.equal(result.roll.total,9);assert.equal(result.roll.modifier,0);assert.equal(result.failures,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an old natural-twenty receipt leaves a later real injury episode untouched',async t=>{
 const{call,target}=await dying(t,{dice:'20,19'});await outside(call)
 const input=await nextSave(call,target.id),result=ok(await call('roll_death_save',input))
 assert.equal(result.hpAfter,1);assert.equal(result.actionSpent,false)
 let state=await call('get_game_state');assert.equal(state.monsters[target.id].npcLife.episode,undefined)
 ok(await hurt(call,target.id,1));state=await roundtrip(call)
 assert.notEqual(state.monsters[target.id].npcLife.episode.id,result.episodeId)
 assert.equal(ok(await call('roll_death_save',input)).alreadyResolved,true);assert.deepEqual(await call('get_game_state'),state)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('natural twenty on the actual NPC turn leaves its normal action available and never grants a second action',async t=>{
 const{call,target}=await dying(t,{dice:'20,20,20,3,4,19'})
 ok(await call('next_turn',{actorId:'player',skipAction:true}))
 let state=await call('get_game_state');assert.equal(state.currentTurn,target.id)
 const result=ok(await call('roll_death_save',{entityId:target.id,eventId:state.monsters[target.id].npcLife.episode.turnEventId}))
 assert.equal(result.hpAfter,1);assert.equal(result.actionSpent,false)
 state=await call('get_game_state');assert.ok(!state.actionUsed[target.id]);assert.ok(state.monsters[target.id].conditions.includes('prone'))
 const attack=ok(await call('resolve_monster_action',{monsterId:target.id,actionName:'Scimitar',targetId:'player'}))
 assert.equal(attack.attacks.length,1);assert.equal(attack.actionSpent,true);state=await call('get_game_state');assert.equal(state.actionUsed[target.id],true)
 await refused(call,'resolve_monster_action',{monsterId:target.id,actionName:'Scimitar',targetId:'player'},'ACTION_ALREADY_USED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real fall after the start of its own turn cannot create a retroactive death save',async t=>{
 const{call,target}=await fixture(t,{combat:false,dice:'1,20,19'})
 ok(await call('enter_combat',{combatants:['player',target.id]}));assert.equal((await call('get_game_state')).currentTurn,target.id)
 ok(await hurt(call,target.id,1));const state=await call('get_game_state')
 assert.ok(state.monsters[target.id].npcLife.episode.enteredTurnKey)
 await refused(call,'roll_death_save',{entityId:target.id,eventId:state.monsters[target.id].npcLife.episode.timeEventId},'NPC_DEATH_SAVE_EVENT_NOT_DUE')
 ok(await call('next_turn',{actorId:target.id}));assert.equal((await call('get_game_state')).currentTurn,'player')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the explicit monster batch stops at the mandatory save without rolling or announcing combat finished',async t=>{
 const{call,target}=await dying(t,{dice:'19'})
 ok(await call('next_turn',{actorId:'player',skipAction:true}));const before=await call('get_game_state')
 const result=ok(await call('run_monster_turns'))
 assert.equal(result.turnsResolved,0);assert.equal(result.combatShouldEnd,false)
 assert.equal(result.npcDeathSaveEvents[0].eventId,before.monsters[target.id].npcLife.episode.turnEventId)
 assert.deepEqual(await call('get_game_state'),before)
 await refused(call,'next_turn',{actorId:target.id,skipAction:true},'NPC_DEATH_SAVE_EVENT_REQUIRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('real damage at zero breaks stable KO, cancels its timer and counts critical failures after temporary HP',async t=>{
 const{call,target}=await fixture(t,{policy:false,dice:'17,2,19'})
 ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:'unarmed',nonlethal:true}))
 ok(await call('grant_temporary_hp',{eventId:'buffer',targetId:target.id,sourceId:'established-protection',sourceDescription:'Protection réellement établie avant les dégâts.',amount:10,duration:{kind:'until_long_rest'}}))
 const received=ok(await hurt(call,target.id,1)),state=await roundtrip(call)
 assert.equal(received.damageResolution.damageReceived,1);assert.equal(received.damageResolution.hpDamage,0)
 assert.equal(state.monsters[target.id].npcLife.episode.status,'dying');assert.equal(state.monsters[target.id].npcLife.episode.failures,1)
 assert.equal(state.monsters[target.id].knockout,undefined);assert.equal(state.monsters[target.id].npcLife.episode.recovery,undefined)
 ok(await hurt(call,target.id,1,{critical:true}));const dead=await roundtrip(call)
 assert.equal(dead.monsters[target.id].isAlive,false);assert.equal(dead.monsters[target.id].npcLife.episode.failures,3)
 assert.equal(dead.hero.corpseTimes[target.id],0)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('zero adjusted damage leaves a stable zero-HP episode and its exact recovery witness unchanged',async t=>{
 const{call,target}=await fixture(t,{policy:false,type:'zombie',dice:'20,2,19'})
 ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:'unarmed',nonlethal:true}))
 const before=await call('get_game_state'),answer=ok(await hurt(call,target.id,100,{damageType:'poison',damageOrigin:'environment'}))
 assert.equal(answer.damageResolution.damageReceived,0)
 const after=await call('get_game_state');assert.deepEqual(after.monsters[target.id],before.monsters[target.id]);assert.equal(after.hero.corpseTimes[target.id],undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('massive damage kills on the positive-HP fall or at zero and never starts another save or timer',async t=>{
 for(const atZero of [false,true])await t.test(atZero?'at zero':'on fall',async t=>{
  const{call,target}=await fixture(t,{hp:2,dice:'19'})
  if(atZero){ok(await hurt(call,target.id,2));ok(await hurt(call,target.id,200))}else ok(await hurt(call,target.id,202))
  const state=await roundtrip(call),episode=state.monsters[target.id].npcLife.episode
  assert.equal(state.monsters[target.id].isAlive,false);assert.equal(episode.status,'dead');assert.equal(episode.deathReason,'massive_damage')
  assert.equal(episode.recovery,undefined);assert.equal(episode.timeEventId,undefined);assert.equal(state.hero.corpseTimes[target.id],0)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
 })
})

test('medicine uses the helper action and creates a generic stable timer without a player attack witness',async t=>{
 const{call,target}=await dying(t,{dice:'15,2,19'}),before=await call('get_game_state')
 ok(await call('combat_action',{action:'stabilize',actorId:'player',targetId:target.id}))
 const state=await roundtrip(call),body=state.monsters[target.id]
 assert.equal(body.knockout,undefined);assert.equal(body.npcLife.episode.status,'stable')
 assert.deepEqual(body.npcLife.episode.recovery,{hours:2,wakeAt:7200})
 assert.equal(body.npcLife.episode.knockoutAttackEventId,undefined)
 assert.equal(state.hero.actionCredits,before.hero.actionCredits-1);assert.equal(state.actionUsed.player,true)
 await refused(call,'combat_action',{action:'stabilize',actorId:'player',targetId:target.id},'ACTION_ALREADY_USED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('held NPC save resumes one exact die after hydration and a corrupt episode refuses before inspiration or counters',async t=>{
 const{call,target}=await dying(t,{dice:'6,4,19'});await outside(call)
 await replace(call,state=>{state.hero.inspiration.push({targetId:target.id,die:8,expiresAt:600})})
 const input=await nextSave(call,target.id),held=ok(await call('roll_death_save',input))
 assert.ok(held.pendingReaction);let state=await roundtrip(call)
 assert.equal(state.monsters[target.id].npcLife.episode.successes,0)
 assert.equal(ok(await call('roll_death_save',input)).alreadyPending,true)
 const corrupt=structuredClone(state);corrupt.monsters[target.id].npcLife.episode.id='different-episode'
 assert.ok((await call('replace_game_state',{gameState:corrupt})).error);assert.deepEqual(await call('get_game_state'),state)
 const result=ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}))
 assert.equal(result.naturalRoll,6);assert.equal(result.roll.total,10);assert.equal(result.successes,1)
 state=await roundtrip(call);assert.equal(state.hero.pending,undefined)
 assert.equal(ok(await call('roll_death_save',input)).alreadyResolved,true);assert.deepEqual(await call('get_game_state'),state)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('explicit later lethal strikes in one selected Extra Attack sequence really hit a living zero-HP NPC',async t=>{
 const{call,target}=await fixture(t,{dice:'17,17,16,19'})
 const answer=ok(await call('resolve_player_multiattack',{attacks:[{targetId:target.id,weaponOrSpell:'unarmed'},{targetId:target.id,weaponOrSpell:'unarmed'}]}))
 assert.equal(answer.attacks.length,2);assert.equal(answer.attacks[1].criticalHit,true);assert.equal(answer.attacks[1].skipped,undefined)
 const state=await roundtrip(call);assert.equal(state.monsters[target.id].isAlive,true);assert.equal(state.monsters[target.id].npcLife.episode.failures,2)
 assert.equal(state.hero.actionCredits,0);assert.equal(state.hero.attackAction.remaining,0)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a KO-only episode does not silently opt the healed monster into future death saves',async t=>{
 const{call,target}=await fixture(t,{policy:false,dice:'17,1,19'})
 ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:'unarmed',nonlethal:true}));await outside(call)
 ok(await call('advance_time',{seconds:3600}));let state=await call('get_game_state')
 assert.equal(state.monsters[target.id].npcLife.policy,undefined);assert.equal(state.monsters[target.id].npcLife.episode,undefined)
 ok(await hurt(call,target.id,1));state=await roundtrip(call)
 assert.equal(state.monsters[target.id].isAlive,false);assert.equal(state.hero.corpseTimes[target.id],3600)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('damage during an unstable episode retains prior successes and its already-scheduled save boundary',async t=>{
 const{call,target}=await dying(t,{dice:'10,10,10,1,19'});await outside(call)
 ok(await call('roll_death_save',await nextSave(call,target.id)))
 const before=await call('get_game_state');ok(await hurt(call,target.id,1))
 let state=await call('get_game_state'),episode=state.monsters[target.id].npcLife.episode
 assert.equal(episode.successes,1);assert.equal(episode.failures,1)
 assert.equal(episode.nextSaveAt,before.monsters[target.id].npcLife.episode.nextSaveAt)
 assert.equal(episode.timeEventId,before.monsters[target.id].npcLife.episode.timeEventId)
 ok(await call('roll_death_save',await nextSave(call,target.id)));ok(await call('roll_death_save',await nextSave(call,target.id)))
 state=await roundtrip(call);episode=state.monsters[target.id].npcLife.episode
 assert.equal(episode.status,'stable');assert.equal(episode.successes,0);assert.equal(episode.failures,0)
 assert.deepEqual(episode.recovery,{hours:1,wakeAt:3618})
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('Consume Life is a true source death that cleans the NPC episode without inventing three failures or another timer',async t=>{
 const{call,target}=await dying(t,{dice:'1,1,1,1,19'});await outside(call)
 const state=await call('get_game_state'),nav=grid(state),cell=nav.neighbors(state.monsters[target.id].position).find(cell=>nav.free(cell))
 assert.ok(cell);const source=await spawn(call,'will_o_wisp',cell)
 const result=ok(await call('use_monster_power',{monsterId:source.id,powerName:'Consume Life',targetId:target.id}))
 assert.equal(result.killed,true)
 const dead=await roundtrip(call),episode=dead.monsters[target.id].npcLife.episode
 assert.equal(episode.status,'dead');assert.equal(episode.deathReason,'source_effect');assert.equal(episode.failures,0)
 assert.equal(episode.timeEventId,undefined);assert.equal(episode.recovery,undefined);assert.equal(dead.hero.corpseTimes[target.id],0)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual death during the NPC turn can end that turn without an action or a new end-of-turn saving throw',async t=>{
 const{call,target}=await dying(t,{dice:'1,12,19'})
 ok(await call('next_turn',{actorId:'player',skipAction:true}))
 let state=await call('get_game_state')
 ok(await call('roll_death_save',{entityId:target.id,eventId:state.monsters[target.id].npcLife.episode.turnEventId}))
 await replace(call,state=>{state.hero.effects.push({id:'corpse-save-witness',kind:'blindness-deafness',sourceId:'player',targetIds:[target.id],expiresAt:100,concentration:false,data:{dc:10}})})
 ok(await hurt(call,target.id,1,{critical:true}));state=await call('get_game_state');assert.equal(state.monsters[target.id].isAlive,false)
 const result=ok(await call('next_turn',{actorId:target.id}))
 assert.equal(result.currentTurn,'player');assert.equal((await call('get_game_state')).hero.corpseTimes[target.id],0)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,12,'neither an end-of-turn corpse save nor a new-round initiative may consume this die')
})

test('an allied NPC injury grants no defeat XP while an enemy policy episode is rewarded only once across healing and a later fall',async t=>{
 for(const allied of [true,false])await t.test(allied?'ally':'enemy',async t=>{
  const{call,target}=await fixture(t)
  if(allied)await replace(call,state=>{state.monsters[target.id].hostile=false})
  ok(await hurt(call,target.id,1));const before=await call('get_game_state'),first=ok(await call('end_combat'))
  assert.equal(first.xpAwarded,allied?0:before.monsters[target.id].xpValue)
  assert.equal((await call('get_game_state')).monsters[target.id].isAlive,true)
  ok(await call('update_hp',{entityId:target.id,delta:1,reason:'Soin réel entre deux blessures.'}))
  await battle(call,[target.id]);ok(await hurt(call,target.id,1))
  assert.equal(ok(await call('end_combat')).xpAwarded,0)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
 })
})
