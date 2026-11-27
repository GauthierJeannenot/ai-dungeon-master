const test=require('node:test'),assert=require('node:assert/strict')
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{ok}=require('./helpers/mcp-toolkit.cjs')
const{setupCackle,persistCackle,cackleRefused}=require('./helpers/cackle-fever-fixture.cjs')
test.after(()=>pg.restore())
async function passage(call){const state=await call('get_game_state'),layout=ok(await call('generate_dungeon',{seed:'actual-npc-continuity',width:3,height:3,count:5})).layout;return ok(await call('install_dungeon',{dungeonId:'actual-npc-continuity',layout,entranceCell:state.player.position,questLink:{goal:'Poursuivre la recherche réellement ouverte.',lead:'Le seuil découvert mène vers un indice de cette recherche.',delivery:'clue',discoveryDc:10}}))}
async function declaration(call,npcId,transitionId,eventId='actual-npc-separated'){const npc=(await call('get_game_state')).npcs[npcId],fact=ok(await call('record_scene_fact',{cell:npc.position,description:'Le MJ constate la séparation choisie : cet individu réel reste sur sa carte au départ explicite du personnage, sans aucune activité hors carte supposée.'})).worldFact;return{eventId,npcId,transitionId,decisionFactId:fact.id,actualSeparationConfirmed:true}}
test('explicit separation keeps the real NPC and incubation off map, then an actual return reconciles symptoms without cure or retrospective rest',async t=>{
 const f=await setupCackle(t,{onset:false,dice:'1,19'}),{npcId,seed}=f;let{call}=f;const link=await passage(call),input=await declaration(call,npcId,link.entryTransitionId)
 ok(await call('declare_npc_separation',input));const before=await call('get_game_state'),disease=structuredClone(before.dmTools.afflictions.records[seed.affliction.id])
 call=await persistCackle(t,call,'19')
 ok(await call('travel_to_map',{transitionId:link.entryTransitionId}));ok(await call('advance_time',{seconds:7200}))
 const away=await call('get_game_state');assert.notEqual(away.currentMapId,before.currentMapId);assert.equal(away.npcs[npcId].mapId??before.currentMapId,before.currentMapId);assert.deepEqual(away.npcs[npcId].position,before.npcs[npcId].position)
 assert.deepEqual(away.dmTools.afflictions.records[seed.affliction.id],disease);assert.equal(away.dmTools.npcContinuity.separations[input.eventId].status,'departed');assert.equal(away.dmTools.npcRests,undefined)
 const fresh=await persistCackle(t,call),bad=structuredClone(await fresh('get_game_state'));delete bad.dmTools.npcContinuity
 await cackleRefused(fresh,'replace_game_state',{gameState:bad},'NPC_CONTINUITY_STATE_MISMATCH')
 assert.equal(ok(await fresh('declare_npc_separation',input)).replayed,true)
 const travel=ok(await fresh('travel_to_map',{transitionId:link.exitTransitionId}));assert.deepEqual(travel.cackleFeverOnsetsDue,[{kind:'onset',afflictionId:seed.affliction.id,creatureId:npcId,at:disease.nextAt}]);const returned=await fresh('get_game_state');assert.equal(returned.currentMapId,before.currentMapId);assert.equal(returned.dmTools.npcContinuity.separations[input.eventId].status,'rejoined')
 await cackleRefused(fresh,'advance_time',{seconds:1},'CACKLE_EVENT_REQUIRED')
 ok(await fresh('resolve_cackle_fever_onset',{afflictionId:seed.affliction.id}));const after=await fresh('get_game_state'),record=after.dmTools.afflictions.records[seed.affliction.id]
 assert.equal(record.status,'active');assert.equal(record.cackleFever.onset.at,disease.nextAt);assert.equal(record.cackleFever.incubationHours,1);assert.equal(record.cackleFever.incubationSuspendedSeconds,undefined);assert.equal(after.dmTools.exhaustion.creatures[npcId].level,1)
 assert.equal(after.worldTimeSeconds,returned.worldTimeSeconds);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})
test('leaving an incubating NPC requires its exact still-current declared separation, before any map or time change',async t=>{
 const{call,npcId}=await setupCackle(t,{onset:false,dice:'1,19'}),link=await passage(call)
 await cackleRefused(call,'travel_to_map',{transitionId:link.entryTransitionId},'CACKLE_OFF_MAP_HOST_UNSUPPORTED')
 const input=await declaration(call,npcId,link.entryTransitionId);ok(await call('declare_npc_separation',input))
 ok(await call('update_hp',{entityId:npcId,delta:-1,reason:'Blessure réelle distincte pendant l’incubation, avant le départ.',damageType:'bludgeoning',damageOrigin:'environment'}))
 await cackleRefused(call,'travel_to_map',{transitionId:link.entryTransitionId},'CACKLE_OFF_MAP_HOST_UNSUPPORTED')
 const replacement=await declaration(call,npcId,link.entryTransitionId,'actual-renewed-separation');ok(await call('declare_npc_separation',replacement));ok(await call('travel_to_map',{transitionId:link.entryTransitionId}))
 assert.equal((await call('get_game_state')).dmTools.npcContinuity.separations[replacement.eventId].status,'departed');assert.equal((await call('get_game_state')).dmTools.npcContinuity.separations[input.eventId].status,'prepared')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
