const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{ok}=require('./helpers/mcp-toolkit.cjs')
const{startSarah}=require('./helpers/campaign-outcome-fixture.cjs')
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
test.after(()=>pg.restore())

test('POST preserves the exact MJ outcome choice after a real close and never classifies surrender from narrative words or invents a gameplay call',async t=>{
 const{call}=await startSarah(t),ended=ok(await call('end_combat',{force:true,reason:'Words in this stored explanation do not select an outcome: victory, flight or surrender.'}))
 const before=await call('get_game_state');assert.equal(Object.keys(before.dmTools.campaignOutcomes.outcomes).length,0)
 const input={eventId:'post-explicit-campaign-issue',closureId:ended.campaignClosures[0].closureId,result:'agreement',reason:'The MJ explicitly selects an agreement for these actual surviving participants.'}
 const inspect={name:'inspect_campaign_outcomes',input:{}},record={name:'record_campaign_outcome',input}
 const played=await play(t,call,[inspect,params=>{const a=ok(lastResult(params));assert.equal(a.encounters.find(e=>e.encounterId==='viallis_ritual').evidence.outcome,undefined);return record},'Le MJ a explicitement consigné l’accord de cette confrontation ; aucune victoire ni conséquence rituelle n’est déduite.'],
  'Le texte évoque victoire, fuite et reddition sans choisir. Le MJ choisit ici explicitement l’accord indiqué dans son appel structuré.')
 assert.deepEqual(played.selected,[inspect,record]);assert.deepEqual(played.seen,played.selected)
 const after=played.result.newGameState;assert.equal(after.dmTools.campaignOutcomes.outcomes[input.eventId].result,'agreement')
 assert.deepEqual(after.player,before.player);assert.deepEqual(after.monsters,before.monsters);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
