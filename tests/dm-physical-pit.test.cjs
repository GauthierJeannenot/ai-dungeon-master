const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const{engine,ok}=require('./helpers/mcp-toolkit.cjs')
const{preparePhysicalPit}=require('./helpers/physical-pit-fixture.cjs')
test.after(()=>pg.restore())
test('the API transmits exact pit geometry and chosen safe step, then allows only the explicitly selected primary check',async t=>{
 const call=await engine(t,{dice:'20,17,19'}),f=await preparePhysicalPit(call,{prefix:'api-real-pit',qualify:false})
 const{result,seen,selected,before}=await play(t,call,[
  {name:'qualify_pit_geometry',input:f.qualification},
  {name:'interact_trap',input:f.trigger},
  {name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},
  {name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},
  params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu évites cette fosse par le pas explicitement choisi puis observes.'},
 ],'Je qualifie cette fosse réelle, déclenche son événement puis observe depuis le bord choisi.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState
 assert.deepEqual(after.player.position,f.safe);assert.deepEqual(after.player.hp,before.player.hp)
 assert.equal(after.dmTools.traps[f.trapId].pitGeometry.attempt.save.roll.rolls[0],20)
 assert.equal(after.dmTools.traps[f.trapId].pitGeometry.attempt.outcome,'edge')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
