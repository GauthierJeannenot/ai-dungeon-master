const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',APP_LOG_PERSIST_ENABLED:'false'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{ok}=require('./helpers/mcp-toolkit.cjs')
const{startSarah,persistCampaign,unchanged,knockoutSarahOpponents}=require('./helpers/campaign-outcome-fixture.cjs')
test.after(()=>pg.restore())
const close=async(call,reason)=>ok(await call('end_combat',{force:true,reason}))
const choice=(closureId,result,eventId='actual-campaign-issue')=>({eventId,closureId,result,reason:'The MJ explicitly records this established issue, without inferring a ritual or faction consequence.'})

test('actual engagement is not completion; a real close and explicit surrender survive SQL/replay without new body, reward or cost',async t=>{
 let{call,evidence}=await startSarah(t),state=await call('get_game_state')
 assert.equal(evidence.outcome,undefined);assert.ok(state.encountersTriggered.includes('viallis_ritual'))
 await unchanged(call,'record_campaign_outcome',choice('not-a-real-closure','victory'),'CAMPAIGN_CLOSED_ENCOUNTER_REQUIRED')
 const ended=await close(call,'The MJ explicitly ends this actual confrontation for a negotiated surrender.'),closureId=ended.campaignClosures[0].closureId
 await unchanged(call,'record_campaign_outcome',choice(closureId,'victory'),'CAMPAIGN_VICTORY_NOT_ATTESTED')
 await unchanged(call,'record_campaign_outcome',choice(closureId,'opponents_fled'),'CAMPAIGN_FLIGHT_NOT_ATTESTED')
 const before=await call('get_game_state'),input=choice(closureId,'surrender'),record=ok(await call('record_campaign_outcome',input))
 state=await call('get_game_state');assert.equal(record.outcome.result,'surrender');assert.deepEqual(state.player,before.player)
 assert.deepEqual(state.monsters,before.monsters);assert.deepEqual(state.worldFacts,before.worldFacts);assert.equal(state.worldTimeSeconds,before.worldTimeSeconds)
 call=await persistCampaign(t,call);state=await call('get_game_state')
 const bad=structuredClone(state);delete bad.dmTools.campaignOutcomes
 await unchanged(call,'replace_game_state',{gameState:bad},'CAMPAIGN_OUTCOME_STATE_MISMATCH')
 const changed=structuredClone(state);changed.dmTools.campaignOutcomes.outcomes[input.eventId].result='victory'
 await unchanged(call,'replace_game_state',{gameState:changed},'CAMPAIGN_OUTCOME_STATE_MISMATCH')
 assert.equal(ok(await call('record_campaign_outcome',input)).replayed,true);assert.deepEqual(await call('get_game_state'),state)
 await unchanged(call,'record_campaign_outcome',{...input,reason:'Another story'},'CAMPAIGN_OUTCOME_EVENT_CONFLICT')
 const missing=await call('travel_to_map',{transitionId:'return_for_burial'});assert.equal(missing.code,'MAP_QUEST_INCOMPLETE')
 assert.deepEqual(missing.detail.missingObjectives.map(o=>o.id),['family_ashes'])
 // A real differently identified potion can carry this display name. It is
 // not the authored urn and contains none of the required family remains.
 const spot=(await call('get_game_state')).player.position
 ok(await call('create_magic_item',{itemId:'actual-homonymous-potion',templateId:'potion_of_healing',name:'yellowcrest_urn',description:'An actual distinct potion labelled with the urn identifier; it is not the family urn.',cell:spot}))
 ok(await call('pick_up_item',{itemId:'actual-homonymous-potion'}))
 const homonym=await call('get_game_state');assert.ok(homonym.player.inventory.some(i=>i.id==='actual-homonymous-potion'))
 assert.ok(homonym.droppedItems.yellowcrest_urn)
 await unchanged(call,'travel_to_map',{transitionId:'return_for_burial'},'MAP_QUEST_INCOMPLETE')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('real room escape with the actual urn permits departure only after its explicit failed issue, keeps failure across SQL and never declares victory',async t=>{
 let{call}=await startSarah(t,{urn:true})
 ok(await call('move_token',{tokenId:'player',toCell:{x:16,y:11}}))
 const moved=await call('get_game_state');assert.equal(moved.currentRoomId,'21');assert.ok(moved.movementUsed.player>0)
 const ended=await close(call,'The player has actually left the chapel and the living opponents remain behind.'),closureId=ended.campaignClosures[0].closureId
 const denied=await call('travel_to_map',{transitionId:'return_for_burial'});assert.equal(denied.code,'MAP_QUEST_INCOMPLETE')
 assert.deepEqual(denied.detail.missingObjectives.map(o=>o.id),['viallis_confronted'])
 await unchanged(call,'record_campaign_outcome',choice(closureId,'victory'),'CAMPAIGN_VICTORY_NOT_ATTESTED')
 const input=choice(closureId,'player_fled');ok(await call('record_campaign_outcome',input))
 call=await persistCampaign(t,call);const before=await call('get_game_state')
 assert.equal(ok(await call('record_campaign_outcome',input)).replayed,true);assert.deepEqual(await call('get_game_state'),before)
 const travelled=ok(await call('travel_to_map',{transitionId:'return_for_burial'})),after=await call('get_game_state')
 assert.equal(travelled.outcome.completion,'partial');assert.deepEqual(travelled.outcome.campaignOutcomeIds,[input.eventId])
 assert.equal(after.dmTools.campaignOutcomes.outcomes[input.eventId].result,'player_fled')
 const{buildDynamicPrompt}=require('../lib/dm/prompts.ts'),context=buildDynamicPrompt(after)
 assert.ok(context.includes('ISSUES DE CONFRONTATIONS CONSIGNÉES'));assert.ok(context.includes('"result":"player_fled"'))
 assert.ok(after.player.inventory.some(i=>i.id==='yellowcrest_urn'))
 const bad=structuredClone(after);delete bad.dmTools.campaignOutcomes.outcomes[input.eventId]
 await unchanged(call,'replace_game_state',{gameState:bad},'CAMPAIGN_OUTCOME_STATE_MISMATCH')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

// Actual level7 sword critical2d8+6=22: mage40 takes2 hits, fanatic22 takes1.
// Each genuine stable knockout rolls its own1d4-hour recovery exactly once.
const attacks='20,1,1,20,8,8,20,8,8,1,20,8,8,1,19'
test('actual nonlethal attacks support a bounded living capture without healing, second damage, fabricated restraints or a second outcome',async t=>{
 let{call}=await startSarah(t,{playerCell:{x:24,y:20},dice:attacks})
 const actors=await knockoutSarahOpponents(call),ended=await close(call,'The actual knocked-out living opponents are retained beside the player.'),closureId=ended.campaignClosures[0].closureId
 const before=await call('get_game_state'),input={...choice(closureId,'capture'),custodianId:'player'}
 await unchanged(call,'record_campaign_outcome',choice(closureId,'capture'),'CAMPAIGN_CAPTURE_NOT_ATTESTED')
 ok(await call('record_campaign_outcome',input));let after=await call('get_game_state')
 assert.deepEqual(after.monsters,before.monsters);assert.deepEqual(after.player,before.player)
 for(const id of Object.values(actors)){assert.equal(after.monsters[id].hp.current,0);assert.equal(after.monsters[id].isAlive,true);assert.ok(after.monsters[id].conditions.includes('unconscious'));assert.ok(!after.monsters[id].conditions.includes('restrained'))}
 call=await persistCampaign(t,call);after=await call('get_game_state')
 assert.equal(ok(await call('record_campaign_outcome',input)).replayed,true);assert.deepEqual(await call('get_game_state'),after)
 await unchanged(call,'record_campaign_outcome',choice(closureId,'victory','second-issue'),'CAMPAIGN_OUTCOME_ALREADY_RECORDED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('victory requires actual defeated source opponents and can be nonlethal, preserving each initial roster/source and original closure',async t=>{
 const{call,evidence}=await startSarah(t,{playerCell:{x:24,y:20},dice:attacks})
 const ids=await knockoutSarahOpponents(call),ended=ok(await call('end_combat',{})),input=choice(ended.campaignClosures[0].closureId,'victory')
 const recorded=ok(await call('record_campaign_outcome',input));assert.equal(recorded.outcome.result,'victory')
 const read=ok(await call('inspect_campaign_outcomes')).encounters.find(e=>e.encounterId==='viallis_ritual').evidence
 assert.deepEqual(read.participants,evidence.participants);assert.deepEqual(read.participants.map(p=>p.sourceType),['mage','cult_fanatic'])
 assert.deepEqual(read.closure.actors.map(a=>a.actorId),[ids.mageId,ids.priestId]);assert.equal(read.closure.force,false)
 assert.ok(read.closure.actors.every(a=>a.body.hp.current===0&&a.body.isAlive===true))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
