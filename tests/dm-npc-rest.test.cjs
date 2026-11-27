const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{ok}=require('./helpers/mcp-toolkit.cjs')
const{setupCackle}=require('./helpers/cackle-fever-fixture.cjs')
const{prepareNpcRest}=require('./helpers/npc-rest-fixture.cjs')
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
test.after(()=>pg.restore())
test('the API transmits only chosen NPC rest and disease commands and persists the actual independent NPC benefit',async t=>{
 const{call,npcId}=await setupCackle(t,{contagion:false,dice:'1,20,6,19'}),inputs=await prepareNpcRest(call,{npcId})
 ok(await call('begin_npc_rest',inputs.start));ok(await call('advance_npc_rest',inputs.sleep));ok(await call('advance_npc_rest',inputs.light))
 let eventId
 const{result,seen,selected,before}=await play(t,call,[{name:'inspect_npc_rest',input:{restId:inputs.start.restId}},{name:'finish_npc_rest',input:inputs.finish},params=>{eventId=lastResult(params).cackleFeverEvent.eventId;return{name:'resolve_cackle_fever_event',input:{eventId,attemptSave:true}}},params=>{assert.equal(lastResult(params).newDC,7);return 'Le PNJ a réellement achevé son repos et son jet conservé réduit le DD de sa maladie, sans repos ni soin du personnage.'}],'Termine ce repos réel du PNJ et tente son jet de rétablissement, sans autre action du personnage.')
 assert.deepEqual(seen,selected);assert.equal(result.newGameState.hero.lastLongRestAt,before.hero.lastLongRestAt);assert.equal(result.newGameState.dmTools.npcRests.records[inputs.start.restId].status,'completed');assert.equal(result.newGameState.dmTools.cackleFever.events[eventId].result.save.success,true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('an explicitly chosen eight-hour NPC sleep interval blocks a second player action in that API turn before its die',async t=>{
 const{call,npcId}=await setupCackle(t,{contagion:false,dice:'1,19'}),inputs=await prepareNpcRest(call,{npcId})
 ok(await call('begin_npc_rest',inputs.start));const sleep={...inputs.sleep,seconds:28800},commands=[{name:'advance_npc_rest',input:sleep},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}]
 const{result,seen,selected,before}=await play(t,call,[...commands,params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Huit vraies heures de sommeil du PNJ sont enregistrées ; aucun second test du personnage n’a été lancé.'}],'J’attends pendant ces huit heures de sommeil réel du PNJ ; je ne fais aucune autre action.')
 assert.deepEqual(seen,selected.slice(0,-1));assert.equal(result.newGameState.worldTimeSeconds-before.worldTimeSeconds,28800);assert.equal(result.newGameState.dmTools.npcRests.records[inputs.start.restId].status,'active');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
