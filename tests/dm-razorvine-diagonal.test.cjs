const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',LLM_PROVIDER: 'openai',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem(),{engine,ok}=require('./helpers/mcp-toolkit.cjs')
const{prepareDiagonalRazorvine,equipDiagonalHandaxe}=require('./helpers/razorvine-diagonal-fixture.cjs')
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
test.after(()=>pg.restore())
test('POST passes only the agent-selected exact45degree non-anchor face once and persists its actual physical throw without a fabricated contact or movement',async t=>{
 const call=await engine(t,{dice:'14,6,17'}),f=await prepareDiagonalRazorvine(call);await equipDiagonalHandaxe(call)
 const chosen={name:'interact_object',input:f.handaxe},played=await play(t,call,[chosen,params=>{
  const hit=ok(lastResult(params));assert.equal(hit.hit,true);assert.deepEqual(hit.razorvineRay.face,f.face);assert.equal(hit.razorvineRay.diagonal.entryNumerator,3)
  return 'La vraie arme lancée atteint la face explicitement choisie et repose dans cette cellule, sans contact du corps avec les épines.'
 }],'Je lance cette hachette réelle vers la cellule non ancrée exacte de cette haie.')
 assert.deepEqual(played.seen,[chosen]);assert.deepEqual(played.selected,[chosen]);assert.deepEqual(played.result.newGameState.droppedItems.handaxe.position,f.face)
 assert.deepEqual(played.result.newGameState.player.position,f.start);assert.deepEqual(played.result.newGameState.dmTools.razorvine?.contacts??{},{})
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})
