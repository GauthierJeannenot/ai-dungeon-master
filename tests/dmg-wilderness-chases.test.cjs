const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{ok}=require('./helpers/mcp-toolkit.cjs'),{next,refuse}=require('./helpers/chase-fixture.cjs')
const{setupWilderness,wildernessRoute,qualifyWilderness,persistWilderness}=require('./helpers/wilderness-chase-fixture.cjs')
test.after(()=>pg.restore())
const end=(f,id)=>f.call('resolve_chase_turn',{eventId:id,chaseId:f.input.chaseId}).then(ok)
const resolve=(f,id,eventId='resolve-'+id)=>f.call('resolve_chase_complication',{eventId,chaseId:f.input.chaseId,turnEventId:id,choice:'resolve'}).then(ok)
for(const[row,choice,feet]of[[1,'athletics',5],[2,'acrobatics',10],[4,'acrobatics',10]])for(const[face,succeeds]of[[1,false],[20,true]])test(`wilderness row${row} actual ${choice} check ${succeeds?'success':'failure'} keeps its printed DC and measured terrain without urban effects`,async t=>{
 const f=await setupWilderness(t,{dice:`20,10,${row},${face},19`}),before=await f.call('get_game_state'),turn=await end(f,'source-row-'+row)
 assert.equal(turn.tableRoll.total,row);assert.equal(turn.nextParticipantId,f.pursuer.id);assert.equal(turn.table,'wilderness')
 const q=await qualifyWilderness(f,'source-row-'+row,row,{choice}),result=await resolve(f,'source-row-'+row),check=result.consequence.check
 assert.equal(check.dc,10);assert.equal(check.ability,choice==='athletics'?'str':'dex');assert.equal((await f.call('get_game_state')).dmTools.chases.episodes[f.input.chaseId].turns['source-row-'+row].qualification.choice,choice);assert.equal(check.success,succeeds);assert.deepEqual(check.roll.rolls,[face])
 if(succeeds)assert.equal(result.consequence.difficultTerrain,undefined)
 else{assert.equal(result.consequence.difficultTerrain.feet,feet);assert.deepEqual(result.consequence.difficultTerrain.cells,q.path.slice(1,feet/5+1))}
 const after=await f.call('get_game_state');assert.deepEqual(after.monsters[f.pursuer.id].position,before.monsters[f.pursuer.id].position);assert.equal(after.monsters[f.pursuer.id].hp.current,before.monsters[f.pursuer.id].hp.current)
 const fresh=await persistWilderness(t,f.call);assert.equal(ok(await fresh('resolve_chase_turn',{eventId:'source-row-'+row,chaseId:f.input.chaseId})).replayed,true)
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})
for(const row of[3,6,7,9,10])test(`deferred official wilderness row${row} persists its original draw through SQL and refuses qualification, reroll, turn advance and stop without cost`,async t=>{
 const f=await setupWilderness(t,{dice:`20,10,${row},19`}),id='deferred-'+row,draw=await end(f,id)
 assert.equal(draw.tableRoll.total,row);assert.equal(draw.deferredRow,true)
 const state=await f.call('get_game_state'),path=wildernessRoute(state,f.pursuer.id),fact=ok(await f.call('record_scene_fact',{cell:path[0],description:'La conséquence officielle retenue exige encore sa procédure physique représentée.'})).worldFact
 await refuse(f.call,'qualify_chase_complication',{eventId:'cannot-qualify-'+row,chaseId:f.input.chaseId,turnEventId:id,factId:fact.id,path},'CHASE_WILDERNESS_ROW_DEFERRED')
 await refuse(f.call,'resolve_chase_turn',{eventId:'no-reroll-'+row,chaseId:f.input.chaseId},'CHASE_END_TURN_ALREADY_CHOSEN')
 await refuse(f.call,'next_turn',{actorId:'player',skipAction:true},'CHASE_EVENT_DUE')
 await refuse(f.call,'stop_chase',{eventId:'no-forgetting-'+row,chaseId:f.input.chaseId,participantIds:['player'],reason:'La complication retenue ne peut disparaître.'},'CHASE_EVENT_DUE')
 const fresh=await persistWilderness(t,f.call),replay=ok(await fresh('resolve_chase_turn',{eventId:id,chaseId:f.input.chaseId}));assert.equal(replay.tableRoll.total,row);assert.equal(replay.replayed,true)
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})
test('wilderness no-complication keeps existing initiative and the exact supplied source; isolated source changes refuse SQL restoration',async t=>{
 const f=await setupWilderness(t,{dice:'20,10,20,19',adopt:false}),before=await f.call('get_game_state')
 const adopted=ok(await f.call('begin_chase',f.input)),after=await f.call('get_game_state');assert.deepEqual(after.initiativeOrder,before.initiativeOrder);assert.equal(after.currentTurn,before.currentTurn);assert.equal(after.combatGeneration,before.combatGeneration)
 assert.equal(adopted.tableSource.startLine,8243);assert.equal(adopted.tableSource.endLine,8257)
 const result=await end(f,'actual-no-complication');assert.equal(result.consequence.noComplication,true)
 const fresh=await persistWilderness(t,f.call),bad=await fresh('get_game_state');bad.dmTools.chases.episodes[f.input.chaseId].tableSource.startLine++
 await refuse(fresh,'replace_game_state',{gameState:bad},'CHASE_STATE_MISMATCH');assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})
test('wilderness row5 actual CON failure blinds and halves speed through the affected real turn, keeps SQL and cannot create an urban prone result',async t=>{
 const f=await setupWilderness(t,{dice:'20,10,5,1,11,19'}),id='actual-dust-source';await end(f,id);await qualifyWilderness(f,id,5)
 const result=await resolve(f,id);assert.equal(result.consequence.check.ability,'con');assert.equal(result.consequence.check.dc,10);assert.equal(result.consequence.check.success,false)
 let state=await f.call('get_game_state');assert.ok(state.monsters[f.pursuer.id].conditions.includes('blinded'));assert.ok(!state.monsters[f.pursuer.id].conditions.includes('prone'))
 const fresh=await persistWilderness(t,f.call,'11,19');f.call=fresh;await next(f);state=await fresh('get_game_state');assert.equal(state.currentTurn,f.pursuer.id)
 const inspect=ok(await fresh('inspect_chase'));assert.equal(inspect.state.episodes[f.input.chaseId].turns[id].consequence.speedHalvedWhileBlinded,true)
 const route=wildernessRoute(state,f.pursuer.id,5)
 for(const toCell of route.slice(1,4))ok(await fresh('move_token',{tokenId:f.pursuer.id,toCell}))
 await refuse(fresh,'move_token',{tokenId:f.pursuer.id,toCell:route[4]},'MOVEMENT_EXCEEDED')
 await end(f,'actual-dust-affected-end');ok(await fresh('stop_chase',{eventId:'real-stop-after-dust',chaseId:f.input.chaseId,participantIds:['player'],reason:'Le quarry cesse réellement; la vraie fenêtre de fin de tour reste due.'}))
 await refuse(fresh,'end_combat',{force:true,reason:'Le tour affecté doit réellement finir.'},'CHASE_EFFECT_END_TURN_REQUIRED')
 await next(f);state=await fresh('get_game_state');assert.ok(!state.monsters[f.pursuer.id].conditions.includes('blinded'))
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})
test('wilderness stampede uses one real DEX10 save and separate 1d4 bludgeoning/piercing in the same canonical damage event, SQL and replay',async t=>{
 const f=await setupWilderness(t,{dice:'20,10,8,1,2,3,19'}),id='actual-stampede';await end(f,id);await qualifyWilderness(f,id,8)
 const before=await f.call('get_game_state'),result=await resolve(f,id),consequence=result.consequence
 assert.equal(consequence.check.ability,'dex');assert.equal(consequence.check.dc,10);assert.deepEqual(consequence.damageRolls.map(p=>[p.roll.notation,p.roll.total,p.type]),[['1d4',2,'bludgeoning'],['1d4',3,'piercing']])
 const after=await f.call('get_game_state');assert.equal(after.monsters[f.pursuer.id].hp.current,before.monsters[f.pursuer.id].hp.current-5);assert.deepEqual(Object.keys(after.monsters),Object.keys(before.monsters));assert.deepEqual(after.dmTools.wallet,before.dmTools.wallet)
 const fresh=await persistWilderness(t,f.call);assert.equal(ok(await fresh('resolve_chase_complication',{eventId:'resolve-'+id,chaseId:f.input.chaseId,turnEventId:id,choice:'resolve'})).replayed,true);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('wilderness row5 really halves the PLAYER walking and Dash budgets once and expires at the actual player end-turn',async t=>{
 const f=await setupWilderness(t,{dice:'20,10,11,5,1,11,19'});await end(f,'player-before-dust');await next(f);await end(f,'npc-dust-to-player')
 const q=await qualifyWilderness(f,'npc-dust-to-player',5);await resolve(f,'npc-dust-to-player')
 ok(await f.call('resolve_chase_escape',{eventId:'visible-before-dust-player',chaseId:f.input.chaseId,leaderId:f.pursuer.id,sightFactId:q.fact.id,continuousSight:true,hide:'normal',area:'normal',senseByPursuer:{[f.pursuer.id]:'sight'}}));await next(f)
 const before=await f.call('get_game_state');assert.equal(before.currentTurn,'player');assert.ok(before.player.conditions.includes('blinded'))
 const pair=wildernessRoute(before,'player',2),to=i=>pair[i%2?1:0]
 for(let i=1;i<=3;i++)ok(await f.call('move_token',{tokenId:'player',toCell:to(i)}))
 await refuse(f.call,'move_token',{tokenId:'player',toCell:to(4)},'MOVEMENT_EXCEEDED')
 ok(await f.call('chase_dash',{eventId:'real-blinded-player-dash',chaseId:f.input.chaseId,actorId:'player'}))
 for(let i=4;i<=6;i++)ok(await f.call('move_token',{tokenId:'player',toCell:to(i)}))
 await refuse(f.call,'move_token',{tokenId:'player',toCell:to(7)},'MOVEMENT_EXCEEDED')
 assert.equal((await f.call('get_game_state')).movementUsed.player,6)
 await end(f,'actual-blind-player-end');await next(f)
 const after=await f.call('get_game_state');assert.ok(!after.player.conditions.includes('blinded'));assert.equal(after.hero.effects.some(e=>e.kind==='chase-wilderness-blind'),false)
 const fresh=await persistWilderness(t,f.call);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('a real spell blindness provider survives dust expiration, while death closes only the bounded dust provider without blocking living actors',async t=>{
 const{engine}=require('./helpers/mcp-toolkit.cjs'),call=await engine(t,{characterId:'wizard',dice:'20,10,1,5,1,11,1,19'})
 ok(await call('take_rest',{kind:'long'}));ok(await call('prepare_spells',{spellIds:['blindness-deafness']}))
 const f=await setupWilderness(t,{call})
 ok(await f.call('cast_spell',{spellId:'blindness-deafness',targetId:f.pursuer.id,slotLevel:2,condition:'blinded'}))
 await end(f,'dust-with-existing-spell');await qualifyWilderness(f,'dust-with-existing-spell',5);await resolve(f,'dust-with-existing-spell');await next(f);await end(f,'dust-existing-provider-npc-end')
 ok(await f.call('stop_chase',{eventId:'real-stop-with-spell-provider',chaseId:f.input.chaseId,participantIds:['player'],reason:'Arrêt réel après les deux fenêtres conservées.'}));await next(f)
 let state=await f.call('get_game_state');assert.ok(state.monsters[f.pursuer.id].conditions.includes('blinded'));assert.equal(state.hero.effects.some(e=>e.kind==='chase-wilderness-blind'),false);assert.ok(state.hero.effects.some(e=>e.kind==='blindness-deafness'))
 const{navigationActor}=require('../mcp-server/dist/lib/navigation.js');assert.equal(navigationActor(state,f.pursuer.id).speed,30)
 const fresh=await persistWilderness(t,f.call);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
 const dead=await setupWilderness(t,{characterId:'cleric',dice:'20,10,5,1,19'});await end(dead,'dust-before-death');await qualifyWilderness(dead,'dust-before-death',5);await resolve(dead,'dust-before-death')
 ok(await dead.call('update_hp',{entityId:dead.pursuer.id,delta:-1000,reason:'Vraie conséquence létale environnementale après la crise de poussière.',damageType:'psychic',damageOrigin:'environment'}))
 state=await dead.call('get_game_state');assert.equal(state.dmTools.chases.episodes[dead.input.chaseId].turns['dust-before-death'].effectExpired,true);assert.equal(state.monsters[dead.pursuer.id].isAlive,false);assert.equal(state.hero.effects.some(e=>e.kind==='chase-wilderness-blind'),false)
 ok(await dead.call('stop_chase',{eventId:'real-stop-after-dust-death',chaseId:dead.input.chaseId,participantIds:['player'],reason:'Le quarry cesse réellement après le décès du poursuivant.'}))
 ok(await dead.call('end_combat',{force:true,reason:'Le corps réellement mort ne bloque pas le joueur vivant.'}));
 ok(await dead.call('equip_item',{itemId:'mace',slot:'main_hand',operation:'unequip'}))
 ok(await dead.call('cast_spell',{spellId:'revivify',targetId:dead.pursuer.id,materialItemId:'revivify_diamonds'}))
 state=await dead.call('get_game_state');assert.equal(state.monsters[dead.pursuer.id].isAlive,true);assert.equal(state.monsters[dead.pursuer.id].hp.current,1);assert.equal(state.hero.effects.some(e=>e.kind==='chase-wilderness-blind'),false);assert.equal(state.dmTools.chases.episodes[dead.input.chaseId].turns['dust-before-death'].effectExpired,true)
 await persistWilderness(t,dead.call)
})

test('the exact wilderness Constitution save holds real Bardic Inspiration through SQL without replacing its original d20',async t=>{
 const f=await setupWilderness(t,{characterId:'bard',dice:'20,10,5,1'})
 ok(await f.call('use_subclass_feature',{featureId:'bardic_inspiration',targetId:f.pursuer.id}))
 await end(f,'actual-wilderness-held');await qualifyWilderness(f,'actual-wilderness-held',5)
 const held=await resolve(f,'actual-wilderness-held');assert.ok(held.pendingReaction);assert.deepEqual(held.pendingReaction.roll.rolls,[1])
 const fresh=await persistWilderness(t,f.call,'6,19'),bad=await fresh('get_game_state');bad.hero.pending.roll.total++
 await refuse(fresh,'replace_game_state',{gameState:bad},'CHASE_STATE_MISMATCH')
 const result=ok(await fresh('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.deepEqual(result.consequence.check.roll.rolls,[1]);assert.equal(result.consequence.check.roll.total,held.pendingReaction.roll.total+6)
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('an explicitly awarded held source Inspiration may negate even an unrepresented wilderness row without manufacturing its actors or qualification',async t=>{
 const f=await setupWilderness(t,{dice:'20,10,3,19'})
 ok(await f.call('grant_inspiration',{eventId:'actual-wilderness-roleplay-award',reason:'Le MJ récompense explicitement cette décision de jeu de rôle du personnage.'}))
 await end(f,'actual-unrepresented-negation');const before=await f.call('get_game_state')
 const choice={eventId:'actual-token-wilderness-negation',chaseId:f.input.chaseId,turnEventId:'actual-unrepresented-negation',choice:'negate',inspirationHolderId:'player'}
 const result=ok(await f.call('resolve_chase_complication',choice));assert.equal(result.consequence.negatedBy,'player')
 const after=await f.call('get_game_state');assert.deepEqual(Object.keys(after.monsters),Object.keys(before.monsters));assert.equal(after.dmTools.dmInspiration.held,false);assert.equal(after.dmTools.chases.episodes[f.input.chaseId].turns['actual-unrepresented-negation'].qualification,undefined)
 const fresh=await persistWilderness(t,f.call);assert.equal(ok(await fresh('resolve_chase_complication',choice)).replayed,true);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('wrong wilderness kind, repeated route and urban-only coin refuse before the retained check or any cost',async t=>{
 const f=await setupWilderness(t,{dice:'20,10,4,20,19'}),id='real-wilderness-qualification';await end(f,id)
 const state=await f.call('get_game_state'),path=wildernessRoute(state,f.pursuer.id,3),fact=ok(await f.call('record_scene_fact',{cell:path[0],description:'L’obstacle rocheux est réellement mesuré sur le trajet choisi.'})).worldFact
 const input={eventId:'physical-wilderness-before-die',chaseId:f.input.chaseId,turnEventId:id,factId:fact.id,path,choice:'athletics',wilderness:{kind:'rock-bed',actualPhysicalEventConfirmed:true}}
 await refuse(f.call,'qualify_chase_complication',{...input,wilderness:{kind:'stampede',actualPhysicalEventConfirmed:true}},'CHASE_WILDERNESS_PHYSICAL_EVENT_REQUIRED')
 await refuse(f.call,'qualify_chase_complication',{...input,coin:'gp'},'CHASE_URBAN_ARGUMENT_NOT_APPLICABLE')
 await refuse(f.call,'qualify_chase_complication',{...input,path:[path[0],path[1],path[0]]},'CHASE_WILDERNESS_ROUTE_MEASURE_REQUIRED')
 ok(await f.call('qualify_chase_complication',input));assert.equal((await resolve(f,id)).consequence.check.success,true)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('real nonlethal Ready knockout keeps dust blindness on its living zero-HP body until actual end-turn, then actual Cure Wounds and SQL keep it closed',async t=>{
 const f=await setupWilderness(t,{characterId:'cleric',dice:'20,10,5,1,20,20,6,6,2,4,19'}),initial=await f.call('get_game_state'),weapon=initial.dmTools?.loadout?.mainHandId??initial.player.inventory.find(i=>i.type==='weapon').id
 ok(await f.call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:weapon,trigger:'Après la vraie fin de mon tour, le poursuivant aveuglé reste adjacent.'}}))
 const readyId=(await f.call('get_game_state')).hero.effects.find(e=>e.kind==='readied-action').id
 await end(f,'real-dust-before-knockout');await qualifyWilderness(f,'real-dust-before-knockout',5);await resolve(f,'real-dust-before-knockout');await next(f)
 ok(await f.call('resolve_readied_action',{readyId,choice:'execute',targetId:f.pursuer.id,triggerObserved:'Mon tour est réellement terminé et le poursuivant est toujours adjacent, aveuglé par les particules.',nonlethal:true}))
 let state=await f.call('get_game_state');assert.equal(state.monsters[f.pursuer.id].hp.current,0);assert.equal(state.monsters[f.pursuer.id].isAlive,true);assert.ok(state.monsters[f.pursuer.id].conditions.includes('blinded'));assert.ok(state.monsters[f.pursuer.id].knockout)
 const fresh=await persistWilderness(t,f.call,'4,19');f.call=fresh;state=await fresh('get_game_state');const bad=structuredClone(state);bad.hero.effects=bad.hero.effects.filter(e=>e.kind!=='chase-wilderness-blind')
 await refuse(fresh,'replace_game_state',{gameState:bad},'CHASE_STATE_MISMATCH')
 ok(await fresh('stop_chase',{eventId:'stop-after-real-knockout',chaseId:f.input.chaseId,participantIds:['player'],reason:'Le quarry cesse après le vrai KO, sans effacer la fin du tour affecté.'}))
 await refuse(fresh,'end_combat',{force:true,reason:'Le corps vivant à zéro PV conserve sa vraie fenêtre.'},'CHASE_EFFECT_END_TURN_REQUIRED')
 await next(f);assert.ok(!(await fresh('get_game_state')).monsters[f.pursuer.id].conditions.includes('blinded'))
 ok(await fresh('equip_item',{itemId:weapon,slot:'main_hand',operation:'unequip'}))
 ok(await fresh('cast_spell',{spellId:'cure-wounds',targetId:f.pursuer.id,slotLevel:1}))
 state=await fresh('get_game_state');assert.ok(state.monsters[f.pursuer.id].hp.current>0);assert.equal(state.monsters[f.pursuer.id].isAlive,true);assert.equal(state.hero.effects.some(e=>e.kind==='chase-wilderness-blind'),false)
 const healed=await persistWilderness(t,fresh);assert.equal(ok(await healed('roll_dice',{notation:'1d20'})).total,19)
})
