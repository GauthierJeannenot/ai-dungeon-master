const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',APP_LOG_PERSIST_ENABLED:'false'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{engine,ok,grid}=require('./helpers/mcp-toolkit.cjs')
const{fact,createPartyNpc,persistParty,refused,walk,open,toTemple,toGreenfast}=require('./helpers/npc-party-fixture.cjs')
const{reactionOpportunities}=require('../mcp-server/dist/lib/npc-reactions.js')
const{getAdventureMap,getMapSpec,evaluateMapQuest}=require('../mcp-server/dist/lib/adventure-map.js')
test.after(()=>pg.restore())

test('real voluntary civilian registration and walking preserve original HP, SQL and the reciprocal movement owner without a player action or die',async t=>{
 let call=await engine(t,{dice:'19'});const f=await createPartyNpc(call,{role:'civilian',type:'commoner'}),s=await call('get_game_state'),n=s.npcs[f.npc.id],nav=grid(s,n.id)
 assert.ok(ok(await call('get_rules_support',{domain:'npc_party'})).tools.includes('declare_npc_party_role'));assert.deepEqual(await call('get_game_state'),s)
 const target=nav.neighbors(n.position).find(c=>nav.step(n.position,c));assert.ok(target)
 await refused(call,'move_party_npc',{eventId:'unregistered',npcId:n.id,toCell:target},'NPC_PARTY_EXPLORATION_MOVE_REQUIRED')
 await refused(call,'declare_npc_party_role',{...f.declaration,agreementFactId:'absent'},'NPC_PARTY_FACT_REQUIRED')
 ok(await call('declare_npc_party_role',f.declaration));const before=await call('get_game_state'),input={eventId:'actual-civil-step',npcId:n.id,toCell:target}
 const move=ok(await call('move_party_npc',input));assert.equal(move.goalReached,true);let after=await call('get_game_state')
 assert.deepEqual(after.npcs[n.id].hp,n.hp);assert.deepEqual(after.player,before.player);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds)
 call=await persistParty(t,call);const exact=await call('get_game_state');assert.equal(ok(await call('move_party_npc',input)).replayed,true);assert.deepEqual(await call('get_game_state'),exact)
 const bad=structuredClone(exact);delete bad.dmTools.npcParty.movements[input.eventId];await refused(call,'replace_game_state',{gameState:bad},'NPC_PARTY_STATE_MISMATCH')
 const gone=structuredClone(exact);delete gone.dmTools.npcParty;await refused(call,'replace_game_state',{gameState:gone},'NPC_PARTY_STATE_MISMATCH')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a separately recruited real knight owns its actual initiative, attack action and SQL activation; monster batches never choose its attack',async t=>{
 let call=await engine(t,{dice:'1,20,10,20,1,1,1,1,19'});const f=await createPartyNpc(call);ok(await call('declare_npc_party_role',f.declaration))
 let s=await call('get_game_state'),nav=grid(s),cell=nav.neighbors(s.npcs[f.npc.id].position).find(c=>nav.step(s.npcs[f.npc.id].position,c));assert.ok(cell)
 const enemy=ok(await call('spawn_monster',{monsterType:'bandit',cell}));ok(await call('enter_combat',{combatants:['player',f.npc.id,enemy.id]}));s=await call('get_game_state');assert.equal(s.currentTurn,f.npc.id)
 const batch=ok(await call('run_monster_turns'));assert.equal(batch.turnsResolved,0);assert.equal((await call('get_game_state')).currentTurn,f.npc.id)
 call=await persistParty(t,call,'20,1,1,1,1,19');s=await call('get_game_state');const opportunity=reactionOpportunities(s).find(r=>r.npcId===f.npc.id);assert.ok(opportunity)
 const input={npcId:f.npc.id,activationKey:opportunity.activationKey,actions:[{kind:'attack',targetId:enemy.id,weaponOrSpell:s.npcs[f.npc.id].attackName}]}
 ok(await call('npc_action',input));const after=await call('get_game_state');assert.ok(after.monsters[enemy.id].hp.current<enemy.hp.current);assert.equal(after.npcs[f.npc.id].hp.current,f.npc.hp.current)
 assert.equal(after.actionUsed.player,undefined);await refused(call,'npc_action',input,'NPC_ACTIVATION_UNAVAILABLE');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real explicit departure ends only the voluntary role and survives SQL without erasing the body or its past agreement',async t=>{
 let call=await engine(t,{dice:'19'});const f=await createPartyNpc(call,{role:'civilian',type:'commoner'});ok(await call('declare_npc_party_role',f.declaration))
 const decisionFactId=await fact(call,f.npc.id,'Le MJ constate une décision explicite de quitter cette escorte sur place, sans déplacement ni soin.'),input={eventId:'real-voluntary-departure',npcId:f.npc.id,decisionFactId,actualReleaseConfirmed:true},before=await call('get_game_state')
 ok(await call('release_npc_party_role',input));const s=await call('get_game_state');assert.deepEqual(s.npcs[f.npc.id].hp,before.npcs[f.npc.id].hp);assert.deepEqual(s.npcs[f.npc.id].position,before.npcs[f.npc.id].position);assert.equal(s.npcs[f.npc.id].controller,undefined)
 assert.equal(s.dmTools.npcParty.registrations[f.declaration.eventId].releasedByEventId,input.eventId);assert.deepEqual(s.player,before.player)
 call=await persistParty(t,call);const exact=await call('get_game_state');assert.equal(ok(await call('release_npc_party_role',input)).replayed,true);assert.deepEqual(await call('get_game_state'),exact)
 await refused(call,'move_party_npc',{eventId:'cannot-move-released-body',npcId:f.npc.id,toCell:f.npc.position},'NPC_PARTY_EXPLORATION_MOVE_REQUIRED')
 const bad=structuredClone(exact);delete bad.dmTools.npcParty.releases[input.eventId];await refused(call,'replace_game_state',{gameState:bad},'NPC_PARTY_STATE_MISMATCH');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real civilian has a passive chosen NPC turn but cannot become an attacking ally merely by being enrolled in combat',async t=>{
 const call=await engine(t,{dice:'1,20,10,19'}),f=await createPartyNpc(call,{role:'civilian',type:'mage'});ok(await call('declare_npc_party_role',f.declaration))
 const s=await call('get_game_state'),nav=grid(s),cell=nav.neighbors(s.npcs[f.npc.id].position).find(c=>nav.step(s.npcs[f.npc.id].position,c));assert.ok(cell)
 const enemy=ok(await call('spawn_monster',{monsterType:'bandit',cell}));ok(await call('enter_combat',{combatants:['player',f.npc.id,enemy.id]}));const before=await call('get_game_state'),o=reactionOpportunities(before).find(r=>r.npcId===f.npc.id);assert.ok(o)
 await refused(call,'npc_action',{npcId:f.npc.id,activationKey:o.activationKey,actions:[{kind:'attack',targetId:enemy.id,weaponOrSpell:before.npcs[f.npc.id].attackName}]},'NPC_CAPABILITY_MISSING')
 await refused(call,'cast_creature_spell',{casterId:f.npc.id,spellId:'magic-missile',targetId:enemy.id},'NPC_CAPABILITY_MISSING')
 ok(await call('npc_action',{npcId:f.npc.id,activationKey:o.activationKey,actions:[{kind:'wait'}]}));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual companions must approach the real departure and choose distinct physical arrival cells; SQL preserves the exact transported body',async t=>{
 let call=await engine(t,{dice:'19'});const f=await createPartyNpc(call,{role:'civilian',type:'commoner'});ok(await call('declare_npc_party_role',f.declaration));ok(await call('reveal_npc',{npcId:'sarah',disposition:'helpful'}));ok(await call('pick_up_item',{itemId:'sarah_diary_copy'}));await walk(call,'3')
 let s=await call('get_game_state');const arrival=getAdventureMap(s).entryCells['4'],target=grid({...s,currentMapId:'waterdeep',currentRoomId:'4'}).neighbors(arrival).find(c=>grid({...s,currentMapId:'waterdeep',currentRoomId:'4'}).free(c));assert.ok(target)
 const input={transitionId:'sail_to_waterdeep',partyCompanions:[{npcId:f.npc.id,arrivalCell:target}]}
 await refused(call,'travel_to_map',input,'NPC_PARTY_TRANSFER_DEPARTURE_REQUIRED')
 const near=grid(s,f.npc.id).neighbors(s.player.position).find(c=>grid(s,f.npc.id).free(c));assert.ok(near);ok(await call('move_party_npc',{eventId:'approach-real-ship',npcId:f.npc.id,toCell:near}))
 await refused(call,'travel_to_map',{...input,partyCompanions:[{npcId:f.npc.id,arrivalCell:arrival}]},'NPC_PARTY_PLAYER_ARRIVAL_OCCUPIED')
 ok(await call('travel_to_map',input));s=await call('get_game_state');assert.deepEqual(s.npcs[f.npc.id].position,target);assert.equal(s.npcs[f.npc.id].mapId,'waterdeep');assert.deepEqual(s.npcs[f.npc.id].hp,f.npc.hp)
 call=await persistParty(t,call);s=await call('get_game_state');const bad=structuredClone(s);bad.dmTools.npcParty.transfers={};await refused(call,'replace_game_state',{gameState:bad},'NPC_PARTY_STATE_MISMATCH');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the actual intact captive group leaves its opened cell, crosses the real stairs and reaches the authored safe room before any rescue objective becomes true',async t=>{
 let call=await engine(t,{dice:'19'});await toTemple(call);await walk(call,'20');ok(await call('move_token',{tokenId:'player',toCell:{x:38,y:22}}));ok(await call('travel_to_map',{transitionId:'descend_manor'}));await open(call,'south_cell');await walk(call,'30');ok(await call('reveal_npc',{npcId:'yaeda',disposition:'helpful'}))
 let s=await call('get_game_state');const npc=s.npcs.yaeda;ok(await call('move_token',{tokenId:'player',toCell:grid(s).neighbors(npc.position).find(c=>grid(s).step(npc.position,c))}));const declaration={eventId:'actual-captives-consent',npcId:'yaeda',role:'civilian',releaseDoorId:'south_cell',agreementFactId:await fact(call,'yaeda'),actualAgreementConfirmed:true}
 await refused(call,'declare_npc_party_role',{...declaration,role:'ally'},'NPC_PARTY_GROUP_COMBAT_UNSUPPORTED');ok(await call('declare_npc_party_role',declaration))
 assert.equal(evaluateMapQuest(await call('get_game_state'),'temple',await call('get_game_state')).objectives.find(o=>o.id==='yaeda_freed').done,false)
 await refused(call,'attest_party_arrival',{eventId:'no-rescue-by-name',npcId:'yaeda',safetyFactId:declaration.agreementFactId,actualSafetyConfirmed:true},'NPC_PARTY_SAFE_DESTINATION_REQUIRED')
 await walk(call,'27');ok(await call('move_token',{tokenId:'player',toCell:{x:38,y:2}}));s=await call('get_game_state');const near=grid(s,'yaeda').neighbors(s.player.position).find(c=>grid(s,'yaeda').free(c)&&getMapSpec(s.currentMapId,s));assert.ok(near)
 ok(await call('move_party_npc',{eventId:'actual-cell-to-stairs',npcId:'yaeda',toCell:near}));ok(await call('travel_to_map',{transitionId:'ascend_manor',partyCompanions:[{npcId:'yaeda',arrivalCell:{x:39,y:22}}]}));await walk(call,'17');s=await call('get_game_state');const safe=grid(s,'yaeda').neighbors(s.player.position).find(c=>grid(s,'yaeda').free(c));assert.ok(safe)
 ok(await call('move_party_npc',{eventId:'actual-stairs-to-safety',npcId:'yaeda',toCell:safe}));const input={eventId:'actual-named-arrival',npcId:'yaeda',safetyFactId:await fact(call,'yaeda','Le MJ constate le groupe réellement réuni avec le héros dans ce vestibule sécurisé, après son trajet depuis la cellule.'),actualSafetyConfirmed:true}
 const arrival=ok(await call('attest_party_arrival',input));assert.deepEqual(arrival.arrival.memberIds,['yaeda','jalrax','durz','seffra','ashlan']);assert.deepEqual((await call('get_game_state')).npcs.yaeda.hp,npc.hp)
 assert.equal(evaluateMapQuest(await call('get_game_state'),'temple',await call('get_game_state')).objectives.find(o=>o.id==='yaeda_freed').done,true)
 call=await persistParty(t,call);const exact=await call('get_game_state');assert.equal(ok(await call('attest_party_arrival',input)).replayed,true);assert.deepEqual(await call('get_game_state'),exact);const bad=structuredClone(exact);delete bad.dmTools.npcParty.arrivals[input.eventId];await refused(call,'replace_game_state',{gameState:bad},'NPC_PARTY_STATE_MISMATCH');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a true zero walking speed from actual level-five exhaustion cannot be bypassed by an otherwise valid map departure',async t=>{
 const call=await engine(t,{dice:'19'});await toGreenfast(call);await walk(call,'16');const f=await createPartyNpc(call,{type:'commoner',role:'civilian'});ok(await call('declare_npc_party_role',f.declaration))
 ok(await call('add_exhaustion',{eventId:'actual-exceptional-source',targetId:f.npc.id,levels:5,reason:'Le MJ établit explicitement cette conséquence exceptionnelle actuelle sur cet individu réel, sans repos ni source automatique.'}))
 const s=await call('get_game_state'),arrival=getAdventureMap(s).entryCells['17'],destination={...s,currentMapId:'temple',monsters:{},player:{...s.player,position:arrival}},target=grid(destination).neighbors(arrival).find(c=>grid(destination).free(c));assert.ok(target)
 await refused(call,'travel_to_map',{transitionId:'walk_to_tower',partyCompanions:[{npcId:f.npc.id,arrivalCell:target}]},'NPC_PARTY_TRANSFER_IMMOBILE');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real incubation ending exactly on the companion arrival succeeds once and retains the due onset through SQL for explicit resolution',async t=>{
 let call=await engine(t,{dice:'1,19'});await toGreenfast(call);await walk(call,'16');const f=await createPartyNpc(call,{type:'commoner',role:'civilian'});ok(await call('declare_npc_party_role',f.declaration));await require('./helpers/cackle-fever-fixture.cjs').qualify(call,f.npc.id)
 const source=ok(await call('record_scene_fact',{cell:f.npc.position,description:'Le MJ établit une nouvelle infection actuelle sur ce vrai compagnon, sans date passée ni contamination du joueur.'})).worldFact
 const seed=ok(await call('record_cackle_fever_case',{eventId:'real-party-incubation',creatureId:f.npc.id,factId:source.id,actualNewNpcInfectionConfirmed:true}));assert.equal(seed.seed.incubation.total,1)
 const before=await call('get_game_state'),arrival=getAdventureMap(before).entryCells['17'],destination={...before,currentMapId:'temple',monsters:{},player:{...before.player,position:arrival}},target=grid(destination).neighbors(arrival).find(c=>grid(destination).free(c));assert.ok(target)
 const result=ok(await call('travel_to_map',{transitionId:'walk_to_tower',partyCompanions:[{npcId:f.npc.id,arrivalCell:target}]})),after=await call('get_game_state')
 assert.equal(after.currentMapId,'temple');assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+3600);assert.deepEqual(after.npcs[f.npc.id].position,target);assert.deepEqual(after.npcs[f.npc.id].hp,f.npc.hp);assert.equal(after.dmTools.afflictions.records[seed.affliction.id].cackleFever.onset,undefined);assert.ok(result.cackleFeverOnsetsDue.some(e=>e.afflictionId===seed.affliction.id))
 call=await persistParty(t,call);await refused(call,'advance_time',{seconds:1},'CACKLE_EVENT_REQUIRED');ok(await call('resolve_cackle_fever_onset',{afflictionId:seed.affliction.id}));assert.equal((await call('get_game_state')).dmTools.exhaustion.creatures[f.npc.id].level,1);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
