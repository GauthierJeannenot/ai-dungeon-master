const test=require('node:test'),assert=require('node:assert/strict')
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{ok}=require('./helpers/mcp-toolkit.cjs')
const{setupCackle,persistCackle,cackleRefused}=require('./helpers/cackle-fever-fixture.cjs')
const{prepareNpcRest,completeNpcRest}=require('./helpers/npc-rest-fixture.cjs')
test.after(()=>pg.restore())
test('a real NPC long rest heals only that body and retains the exact disease save, reduction, SQL and replay',async t=>{
 const f=await setupCackle(t,{onset:false,dice:'1,20,6,19'}),{npcId}=f;let{call}=f
 ok(await call('update_hp',{entityId:npcId,delta:-7,reason:'Blessure environnementale réelle avant les symptômes.',damageType:'bludgeoning',damageOrigin:'environment'}))
 const inputs=await prepareNpcRest(call,{npcId}),before=await call('get_game_state')
 ok(await call('begin_npc_rest',inputs.start));ok(await call('advance_npc_rest',{...inputs.sleep,eventId:'actual-first-incubation-sleep',seconds:3600}))
 ok(await call('resolve_cackle_fever_onset',{afflictionId:f.seed.affliction.id}));ok(await call('advance_npc_rest',{...inputs.sleep,seconds:18000}))
 call=await persistCackle(t,call,'20,6,19');ok(await call('advance_npc_rest',inputs.light));const rest=ok(await call('finish_npc_rest',inputs.finish)),after=await call('get_game_state')
 assert.equal(after.worldTimeSeconds-before.worldTimeSeconds,28800);assert.equal(after.dmTools.npcRests.records[inputs.start.restId].sourceObservations.length,1);assert.equal(after.dmTools.afflictions.records[f.seed.affliction.id].cackleFever.onset.npcRestId,inputs.start.restId);assert.equal(after.npcs[npcId].hp.current,after.npcs[npcId].hp.max)
 assert.deepEqual(after.player.hp,before.player.hp);assert.deepEqual(after.player.spellSlots,before.player.spellSlots);assert.equal(after.hero.lastLongRestAt,before.hero.lastLongRestAt)
 assert.ok(rest.cackleFeverEvent);const rolled=ok(await call('resolve_cackle_fever_event',{eventId:rest.cackleFeverEvent.eventId,attemptSave:true}))
 assert.equal(rolled.save.dc,13);assert.equal(rolled.save.roll.rolls[0],20)
 assert.equal(rolled.reduction.total,6);assert.equal(rolled.newDC,7);assert.equal((await call('get_game_state')).dmTools.exhaustion.creatures[npcId].level,1)
 const fresh=await persistCackle(t,call);assert.equal(ok(await fresh('finish_npc_rest',inputs.finish)).replayed,true);assert.equal(ok(await fresh('resolve_cackle_fever_event',{eventId:rest.cackleFeverEvent.eventId,attemptSave:true})).replayed,true)
 const state=await fresh('get_game_state'),bad=structuredClone(state);delete bad.dmTools.npcRests
 await cackleRefused(fresh,'replace_game_state',{gameState:bad},'NPC_REST_STATE_MISMATCH')
 const badObservation=structuredClone(state);badObservation.dmTools.npcRests.records[inputs.start.restId].sourceObservations[0].afflictionId='not-a-real-onset';await cackleRefused(fresh,'replace_game_state',{gameState:badObservation},'NPC_REST_STATE_MISMATCH')
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})
test('NPC rest rejects an absent real agreement, incomplete sleep and unobserved time atomically',async t=>{
 const{call,npcId}=await setupCackle(t,{contagion:false,dice:'1,19'}),inputs=await prepareNpcRest(call,{npcId})
 await cackleRefused(call,'begin_npc_rest',{...inputs.start,factId:'not-an-actual-fact'},'NPC_REST_AGREEMENT_REQUIRED')
 ok(await call('begin_npc_rest',inputs.start));await cackleRefused(call,'finish_npc_rest',inputs.finish,'NPC_REST_NOT_COMPLETE')
 ok(await call('advance_npc_rest',{...inputs.light,seconds:3600}));ok(await call('advance_time',{seconds:1}))
 await cackleRefused(call,'advance_npc_rest',inputs.sleep,'NPC_REST_HISTORY_CHANGED')
 const before=await call('get_game_state');ok(await call('abandon_npc_rest',{restId:inputs.start.restId,reason:'Observation réelle perdue, aucune heure passée transformée en sommeil.'}));const after=await call('get_game_state')
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.equal(after.dmTools.npcRests.records[inputs.start.restId].status,'abandoned');assert.equal(after.dmTools.npcRests.records[inputs.start.restId].session.segments.length,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('declining a real NPC disease rest save preserves illness and spends no die across SQL',async t=>{
 const{call,npcId}=await setupCackle(t,{contagion:false,dice:'1,19'}),inputs=await prepareNpcRest(call,{npcId}),rest=await completeNpcRest(call,inputs)
 const result=ok(await call('resolve_cackle_fever_event',{eventId:rest.cackleFeverEvent.eventId,attemptSave:false}));assert.equal(result.saveDeclined,true);assert.equal(result.diceRolled,false)
 const state=await call('get_game_state');assert.equal(state.dmTools.afflictions.records[rest.cackleFeverEvent.afflictionId].cackleFever.dc,13)
 const fresh=await persistCackle(t,call);assert.equal(ok(await fresh('resolve_cackle_fever_event',{eventId:rest.cackleFeverEvent.eventId,attemptSave:false})).replayed,true);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})
test('three actual NPC long-rest failures on separate days create the retained official madness without inventing a cure',async t=>{
 const{call,npcId}=await setupCackle(t,{contagion:false,dice:'1,1,1,1,50,19'});let final,link
 for(let i=0;i<3;i++){
  if(i)ok(await call('advance_time',{seconds:57600}))
  const inputs=await prepareNpcRest(call,{npcId,restId:'actual-npc-day-'+i}),rest=await completeNpcRest(call,inputs);link=rest.cackleFeverEvent
  final=ok(await call('resolve_cackle_fever_event',{eventId:link.eventId,attemptSave:true}));assert.equal(final.save.success,false);assert.equal(final.cumulativeRecoveryFailures,i+1)
 }
 assert.equal(final.indefiniteMadness.roll.total,50);const state=await call('get_game_state');assert.equal(state.dmTools.afflictions.records[link.afflictionId].status,'active');assert.equal(state.dmTools.afflictions.records[link.afflictionId].cackleFever.dc,13)
 const fresh=await persistCackle(t,call);assert.deepEqual((await fresh('get_game_state')).dmTools.cackleFever.madness,state.dmTools.cackleFever.madness);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})
