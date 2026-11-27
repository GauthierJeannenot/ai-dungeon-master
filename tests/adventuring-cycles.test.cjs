const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',APP_LOG_PERSIST_ENABLED:'false'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{engine,ok,grid,reachSarahChapel,persist,unchanged,open,qualify,closeIssue,finish}=require('./helpers/adventuring-cycle-fixture.cjs')
const{createPartyNpc,fact:partyFact,open:openDoor,walk}=require('./helpers/npc-party-fixture.cjs')
const{getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js')
test.after(()=>pg.restore())

test('only explicit MJ edges close cycles; midnight and genuine rests retain them, and same-end hit dice remain legal after close/SQL',async t=>{
 let call=await engine(t,{dice:'2,19'});const started=await open(call),id=started.cycle.input.cycleId
 ok(await call('advance_time',{seconds:86400}));assert.equal((await call('get_game_state')).dmTools.adventuringCycles.activeCycleId,id)
 ok(await call('take_rest',{kind:'long'}));assert.equal((await call('get_game_state')).dmTools.adventuringCycles.activeCycleId,id)
 ok(await call('update_hp',{entityId:'player',delta:-3,reason:'Blessure réelle actuelle distincte avant le repos choisi.',damageType:'bludgeoning',damageOrigin:'environment'}))
 ok(await call('begin_rest',{restId:'actual-cycle-short-rest',kind:'short'}));ok(await call('advance_rest',{restId:'actual-cycle-short-rest',eventId:'actual-cycle-hour',seconds:3600,activity:'light',reason:'Une vraie heure choisie d’activité légère, sans temps rétrospectif.'}));ok(await call('finish_rest',{restId:'actual-cycle-short-rest',hitDice:0}))
 const before=await call('get_game_state'),closed=ok(await finish(call));assert.equal(closed.close.rests.length,2);assert.deepEqual((await call('get_game_state')).player,before.player);assert.equal((await call('get_game_state')).worldTimeSeconds,before.worldTimeSeconds);assert.equal((await call('get_game_state')).dmTools.adventuringCycles.activeCycleId,undefined)
 const die=ok(await call('spend_rest_hit_die',{restId:'actual-cycle-short-rest',eventId:'actual-cycle-extra-hit-die'}));assert.equal(die.roll.rolls[0],2)
 call=await persist(t,call);const stable=await call('get_game_state');assert.equal(ok(await finish(call)).replayed,true);assert.deepEqual(await call('get_game_state'),stable)
 await open(call,'next-same-clock-cycle');const next=ok(await finish(call,'next-same-clock-cycle'));assert.equal(next.close.rests.length,0);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actual P1 closed issue binds its prior qualification and source XP once; missing qualification refuses before initiative',async t=>{
 let call=await engine(t,{dice:'20,1,1,19'});const site=await reachSarahChapel(call);await open(call)
 await unchanged(call,'start_encounter',site.start,'ADVENTURING_CYCLE_PARTY_REQUALIFICATION_REQUIRED');await qualify(call);ok(await call('start_encounter',site.start))
 const done=await closeIssue(call,{excludeWeak:true}),entry=done.recorded.entry;assert.equal(entry.assessment.rawXP,2750);assert.equal(entry.assessment.adjustedXP,4125);assert.equal(entry.assessment.multiplierMonsterCount,1);assert.equal(entry.assessment.partySize,1);assert.equal(entry.assessment.adventuringDayAdjustedXPReference,5000);assert.equal(entry.assessment.xpAward,null)
 call=await persist(t,call);const stable=await call('get_game_state');assert.equal(ok(await call('record_adventuring_cycle_encounter',done.input)).replayed,true);assert.deepEqual(await call('get_game_state'),stable)
 await unchanged(call,'record_adventuring_cycle_encounter',{...done.input,eventId:'another-entry-nonce'},'ADVENTURING_CYCLE_ENGAGEMENT_ALREADY_RECORDED')
 const bad=structuredClone(stable);delete bad.dmTools.adventuringCycles;await unchanged(call,'replace_game_state',{gameState:bad},'ADVENTURING_CYCLE_STATE_MISMATCH')
 const altered=structuredClone(stable);altered.dmTools.adventuringCycles.entries[done.input.eventId].assessment.rawXP=1;await unchanged(call,'replace_game_state',{gameState:altered},'ADVENTURING_CYCLE_STATE_MISMATCH')
 ok(await finish(call));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real civilian outside initiative receives a full reference share, off-scene NPC stays distinct, and unknown NPC levels never become CR',async t=>{
 let call=await engine(t,{dice:'20,1,1,19'});const site=await reachSarahChapel(call),civil=await createPartyNpc(call,{id:'actual-cycle-civilian',type:'commoner',role:'civilian'});ok(await call('declare_npc_party_role',civil.declaration))
 const remote=await createPartyNpc(call,{id:'actual-cycle-off-scene',role:'civilian',type:'knight'});ok(await call('declare_npc_party_role',remote.declaration));const s=await call('get_game_state');ok(await call('move_party_npc',{eventId:'actual-cycle-off-scene-move',npcId:remote.npc.id,toCell:getAdventureMap(s).entryCells['21']}))
 await open(call);await unchanged(call,'qualify_adventuring_cycle_encounter',{eventId:'missing-civilian',cycleId:'actual-cycle',encounterId:'viallis_ritual',factId:'missing',presentNpcIds:[],offSceneNpcIds:[],actualPartyPresenceConfirmed:true},'ADVENTURING_CYCLE_PRESENCE_FACT_REQUIRED')
 await qualify(call,{presentNpcIds:[civil.npc.id],offSceneNpcIds:[remote.npc.id]});ok(await call('start_encounter',site.start));const battle=await call('get_game_state');assert.equal(battle.initiativeOrder.includes(civil.npc.id),false)
 const done=await closeIssue(call),a=done.recorded.entry.assessment;assert.equal(a.partySize,2);assert.deepEqual(a.unknownCharacterLevelNpcIds,[civil.npc.id]);assert.equal(a.thresholds,null);assert.equal(a.difficulty,'indeterminate');assert.equal(a.adventuringDayAdjustedXPReference,null);assert.deepEqual(a.rawXpFullShareReference,{numerator:2750,denominator:2})
 const releaseId=await partyFact(call,civil.npc.id,'Le MJ constate maintenant la fin volontaire de cette escorte, après la vraie rencontre.');ok(await call('release_npc_party_role',{eventId:'actual-after-encounter-release',npcId:civil.npc.id,decisionFactId:releaseId,actualReleaseConfirmed:true}))
 call=await persist(t,call);const inspected=ok(await call('inspect_adventuring_cycles'));assert.equal(inspected.entries[0].assessment.partySize,2);assert.equal(inspected.bindings[0].members.find(m=>m.npcId===remote.npc.id).scope,'off_scene');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('real party movement makes the prospective presence stale before dice; only a new explicit qualification admits the real start',async t=>{
 const call=await engine(t,{dice:'20,1,1,19'}),site=await reachSarahChapel(call),civil=await createPartyNpc(call,{id:'actual-cycle-moving-civilian',type:'commoner',role:'civilian'});ok(await call('declare_npc_party_role',civil.declaration));await open(call);await qualify(call,{presentNpcIds:[civil.npc.id]})
 const s=await call('get_game_state'),n=s.npcs[civil.npc.id],nav=grid(s,n.id),to=nav.neighbors(n.position).find(c=>nav.step(n.position,c)&&nav.roomAt(c)===s.currentRoomId);assert(to);ok(await call('move_party_npc',{eventId:'actual-after-qualification-step',npcId:n.id,toCell:to}))
 await unchanged(call,'start_encounter',site.start,'ADVENTURING_CYCLE_PARTY_REQUALIFICATION_REQUIRED');await qualify(call,{eventId:'actual-refreshed-party-presence',presentNpcIds:[n.id]});ok(await call('start_encounter',site.start));await closeIssue(call);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('five actually freed captives count as five full civilian shares; later real attrition never invents survivor names or rewrites the initial six-person entry',async t=>{
 let call=await engine(t,{dice:'20,1,1,19'}),site=await reachSarahChapel(call);await walk(call,'20');ok(await call('move_token',{tokenId:'player',toCell:{x:38,y:22}}));ok(await call('travel_to_map',{transitionId:'descend_manor'}));await openDoor(call,'south_cell');await walk(call,'30');ok(await call('reveal_npc',{npcId:'yaeda',disposition:'helpful'}))
 let s=await call('get_game_state'),n=s.npcs.yaeda;ok(await call('move_token',{tokenId:'player',toCell:grid(s).neighbors(n.position).find(c=>grid(s).step(n.position,c))}));ok(await call('declare_npc_party_role',{eventId:'actual-cycle-captives-agreement',npcId:'yaeda',role:'civilian',releaseDoorId:'south_cell',agreementFactId:await partyFact(call,'yaeda'),actualAgreementConfirmed:true}))
 await walk(call,'27');ok(await call('move_token',{tokenId:'player',toCell:{x:38,y:2}}));s=await call('get_game_state');const near=grid(s,'yaeda').neighbors(s.player.position).find(c=>grid(s,'yaeda').free(c));assert(near);ok(await call('move_party_npc',{eventId:'actual-captives-to-stairs',npcId:'yaeda',toCell:near}));ok(await call('travel_to_map',{transitionId:'ascend_manor',partyCompanions:[{npcId:'yaeda',arrivalCell:{x:39,y:22}}]}));await walk(call,'24');s=await call('get_game_state');const target=grid(s,'yaeda').neighbors(s.player.position).find(c=>grid(s,'yaeda').free(c));assert(target);ok(await call('move_party_npc',{eventId:'actual-captives-at-chapel',npcId:'yaeda',toCell:target}))
 await open(call);const q=await qualify(call,{presentNpcIds:['yaeda']});assert.equal(q.result.qualification.members[0].shareUnits,5);ok(await call('start_encounter',site.start));const done=await closeIssue(call),a=done.recorded.entry.assessment;assert.equal(a.partySize,6);assert.equal(a.multiplier,1);assert.deepEqual(a.rawXpFullShareReference,{numerator:2750,denominator:6});assert.equal(a.thresholds,null)
 s=await call('get_game_state');const actualLoss=s.npcs.yaeda.group.memberMaxHp;ok(await call('update_hp',{entityId:'yaeda',delta:-actualLoss,reason:'Dommage extérieur réel distinct après la confrontation ; aucun survivant nommé choisi.',damageType:'bludgeoning',damageOrigin:'environment'}))
 const current=ok(await call('assess_encounter_budget',{mode:'planned',groups:[{monsterType:'mage',count:1,countsForMultiplier:true},{monsterType:'cult_fanatic',count:1,countsForMultiplier:true}]}));assert.equal(current.partySize,5);assert.equal(current.npcParty.present[0].survivingIdentitiesIndeterminate,true);assert.equal(current.npcParty.present[0].namedMemberIds,undefined)
 call=await persist(t,call);const past=ok(await call('inspect_adventuring_cycles'));assert.equal(past.entries[0].assessment.partySize,6);assert.equal(past.bindings[0].members[0].namedMemberIds.length,5);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('missing actual tracked issues refuse a silent close; explicit incomplete IDs/reasons survive SQL without victory, XP or a retrospective party change',async t=>{
 let call=await engine(t,{dice:'20,1,1,19'}),site=await reachSarahChapel(call);await open(call);await qualify(call);ok(await call('start_encounter',site.start));const done=await closeIssue(call,{record:false})
 const before=await call('get_game_state');const refused=await finish(call);assert.equal(refused.code,'ADVENTURING_CYCLE_UNRECORDED_ISSUES');assert.deepEqual(await call('get_game_state'),before)
 ok(await call('update_hp',{entityId:'player',delta:-2*before.player.hp.max,reason:'Danger extérieur actuel létal explicitement établi après la confrontation, sans victoire ou repos inventé.',damageType:'bludgeoning',damageOrigin:'environment'}));const afterDeath=await call('get_game_state');assert.equal(afterDeath.player.deathSaves.dead,true)
 const chosen={allowIncomplete:true,omittedEngagements:[{engagementId:done.engagement.id,reason:'Le MJ clôt explicitement le cycle sans calculer cette confrontation conservée ; aucune victoire n’est ajoutée.'}]},closed=ok(await finish(call,'actual-cycle',chosen));assert.equal(closed.close.summary.coverageComplete,false);assert.equal(closed.close.summary.partyBudgetDeterminate,false);assert.equal(closed.close.summary.xpAward,null);assert.deepEqual((await call('get_game_state')).player,afterDeath.player)
 call=await persist(t,call);assert.equal(ok(await finish(call,'actual-cycle',chosen)).replayed,true);assert.equal((await call('get_game_state')).player.deathSaves.dead,true);assert.equal((await call('get_game_state')).dmTools.campaignOutcomes.outcomes[done.input.eventId+'-source-outcome'].result,'surrender')
 await unchanged(call,'record_adventuring_cycle_encounter',done.input,'ADVENTURING_CYCLE_OPEN_REQUIRED');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
