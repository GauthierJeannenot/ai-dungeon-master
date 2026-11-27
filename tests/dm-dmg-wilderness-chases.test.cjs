const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{ok}=require('./helpers/mcp-toolkit.cjs'),{setupWilderness,qualifyWilderness,persistWilderness}=require('./helpers/wilderness-chase-fixture.cjs'),{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
test.after(()=>pg.restore())
test('the API agent selects the retained wilderness stampede and exact source save; SQL stores the one packet without a fabricated next turn',async t=>{
 const f=await setupWilderness(t,{dice:'20,10,8,1,2,3,19'}),id='actual-post-wilderness'
 ok(await f.call('resolve_chase_turn',{eventId:id,chaseId:f.input.chaseId}));await qualifyWilderness(f,id,8)
 const input={eventId:'actual-post-wilderness-resolve',chaseId:f.input.chaseId,turnEventId:id,choice:'resolve'},before=await f.call('get_game_state')
 const{result,seen,selected}=await play(t,f.call,[{name:'inspect_chase',input:{}},{name:'resolve_chase_complication',input},p=>{assert.equal(lastResult(p).consequence.check.ability,'dex');return 'La vraie complication et ses deux dégâts typés sont conservés. Aucun déplacement ou tour supplémentaire n’est choisi.'}],'Résous cette complication wilderness déjà qualifiée, exactement avec la sauvegarde du livre.')
 assert.deepEqual(seen,selected);assert.equal(result.newGameState.currentTurn,before.currentTurn);assert.equal(result.newGameState.worldTimeSeconds,before.worldTimeSeconds)
 assert.equal(result.newGameState.monsters[f.pursuer.id].hp.current,before.monsters[f.pursuer.id].hp.current-5)
 const fresh=await persistWilderness(t,f.call);assert.equal(ok(await fresh('resolve_chase_complication',input)).replayed,true);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})
