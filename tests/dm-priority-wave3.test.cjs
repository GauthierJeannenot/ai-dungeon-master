const test=require('node:test'),assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',MONETIZATION_ENABLED:'false',ALLOW_PAID_LLM:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_LEVEL:'error'})
const pg=installPgMem()
const {POST}=require('../app/api/dm/route.ts'),llm=require('../lib/dm/llm.ts')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {closeMCPClient}=require('../lib/mcp-client.ts')
const {engine}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())

test('new rule inspections and an established component fact checkpoint without satisfying the planned check',async t=>{
 const call=await engine(t),state=await call('get_game_state')
 const id='wave3-route-'+process.pid+'-'+Date.now(),previous=process.env.AI_DM_TEST_DICE_SEQUENCE
 process.env.AI_DM_TEST_DICE_SEQUENCE='15,19'
 t.after(async()=>{await closeMCPClient(id);await deleteSession(id);if(previous===undefined)delete process.env.AI_DM_TEST_DICE_SEQUENCE;else process.env.AI_DM_TEST_DICE_SEQUENCE=previous})
 await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
 let turn=0,serial=0,lastId
 const text=value=>({stop_reason:'end_turn',content:[{type:'text',text:value}]})
 const emit=(name,input)=>{lastId='wave3-'+(++serial);return {stop_reason:'tool_use',content:[{type:'tool_use',id:lastId,name,input}]}}
 const result=params=>JSON.parse(params.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).findLast(x=>x.type==='tool_result'&&x.tool_use_id===lastId).content)
 const fact={id:'established-gag',targetId:'player',kind:'gagged',source:'Le bandeau est déjà établi dans cette scène.',operation:'apply'}
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{

  if(context.operation==='dm.final_narration'||context.operation==='dm.repair_narration')return text('Tu comprends les signes.')
  turn++
  if(turn===1){
   for(const name of ['inspect_spell_components','set_spell_component_constraint','inspect_creature_senses','resolve_passive_check','provide_check_help','resolve_group_check'])assert.ok(context.availableTools.some(t=>t.name===name),name+' exposed')
   return emit('set_spell_component_constraint',fact)
  }
  if(turn===2){
   assert.equal(params.tool_choice, undefined);assert.equal((await loadSession(id)).gameState.dmTools.spellComponents.constraints[fact.id].kind,'gagged')
   return emit('inspect_creature_senses',{observerId:'player'})
  }
  if(turn===3){assert.equal(params.tool_choice, undefined);assert.equal(result(params).observerId,'player');return emit('resolve_passive_check',{entityId:'player',ability:'int',dc:10})}
  if(turn===4){assert.equal(params.tool_choice, undefined);return emit('roll_ability_check',{ability:'int',dc:10})}
  if(turn===5){assert.equal(result(params).roll.rolls[0],15);return emit('roll_ability_check',{ability:'int',dc:10})}
  if(turn===6)assert.equal(result(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED')
  return text('Tu comprends les signes.')
 })
 const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,message:'J’examine attentivement les signes.',adventureId:state.adventureId,characterId:state.characterId})}))
 const data=await response.json();assert.equal(response.status,200,JSON.stringify(data))
 assert.deepEqual(data.toolsUsed,['set_spell_component_constraint','inspect_creature_senses','resolve_passive_check','roll_ability_check'])
 assert.deepEqual(data.newGameState.player.hp,state.player.hp)
 assert.equal(data.newGameState.dmTools.spellComponents.constraints[fact.id].source,fact.source)
 assert.deepEqual(JSON.parse(JSON.stringify((await loadSession(id)).gameState)),data.newGameState)
})
