const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',LLM_PROVIDER: 'openai',
 LLM_MAX_STALLED_ITERATIONS:'3',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{engine,ok}=require('./helpers/mcp-toolkit.cjs')
const llm=require('../lib/dm/llm.ts'),mcp=require('../lib/mcp-client.ts')
const{POST}=require('../app/api/dm/route.ts')
const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const plain=value=>JSON.parse(JSON.stringify(value))
test.after(()=>pg.restore())

test('a real inspection-only sacred-rites POST stays documentary across stagnation, without a gameplay narration call, request receipt, action or altered state',async t=>{
 const call=await engine(t,{characterId:'bard',dice:'19'}),before=await call('get_game_state')
 const original=ok(await call('inspect_sacred_rites'))
 assert.equal(original.readOnly,true);assert.equal(original.state,null,'No rite was started or worked in this scenario.')
 const metadata=(await call.client.listTools()).tools
 assert.ok(metadata.some(tool=>tool.name==='inspect_sacred_rites'))
 const sessionId=`sacred-inspection-only-${process.pid}-${Date.now()}`,clientRequestId='actual-inspection-only-request'
 await saveSession(sessionId,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 t.after(async()=>{await mcp.closeMCPClient(sessionId);await deleteSession(sessionId)})
 const selected=[],executed=[],operations=[],feedback=[],earlyReceipts=[]
 t.mock.method(mcp,'listMCPTools',async()=>metadata)
 t.mock.method(mcp,'callMCPTool',async(name,input={})=>{
  if(!['get_game_state','replace_game_state'].includes(name)){
   const command={name,input:plain(input)}
   assert.equal(name,'inspect_sacred_rites','No action, award, fact, clock or rite call may be fabricated.')
   assert.deepEqual(command,selected[executed.length],'The transport preserves the exact inspection selected by the AI.')
   executed.push(command)
  }
  return call(name,input)
 })
 let turns=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{
  operations.push(context.operation)
  if(context.operation==='dm.final_narration'){
   // Allow the pre-fix route to complete so the test reports the observable
   // extra model call rather than aborting inside the scripted model.
   return{stop_reason:'end_turn',content:[{type:'text',text:'Le registre a seulement été relu ; aucun rite ou don n’a été exécuté.'}]}
  }
  assert.equal(context.operation,'dm.turn');assert.equal(params.tool_choice,undefined)
  if(turns>0){
   const last=params.messages.flatMap(message=>Array.isArray(message.content)?message.content:[]).filter(block=>block.type==='tool_result').at(-1)
   assert.ok(last);feedback.push(JSON.parse(last.content))
   earlyReceipts.push((await loadSession(sessionId)).gameState.handledRequestIds.includes(clientRequestId))
  }
  assert.ok(++turns<=4,'One new reading followed by three unchanged readings must exhaust stagnation.')
  const command={name:'inspect_sacred_rites',input:{}};selected.push(command)
  return{stop_reason:'tool_use',content:[{type:'tool_use',id:`only-sacred-inspection-${turns}`,...command}]}
 })
 const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
  sessionId,clientRequestId,adventureId:before.adventureId,characterId:before.characterId,
  message:'Je demande seulement la lecture du registre des rites, sans commencer ni accomplir de rite, sans don ni avance du temps.',
 })}))
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result))
 assert.deepEqual(operations,['dm.turn','dm.turn','dm.turn','dm.turn'],'A documentary stagnation stop must not trigger a fifth gameplay final-narration call.')
 assert.deepEqual(executed,selected);assert.equal(executed.length,4)
 assert.deepEqual(result.toolsUsed,['inspect_sacred_rites'])
 assert.equal(feedback.length,3)
 for(const receipt of feedback)assert.deepEqual(receipt,original,'A reading is returned as its actual MCP receipt, without fabricated gameplay narrationFacts.')
 assert.deepEqual(earlyReceipts,[false,false,false],'A reference is not checkpointed as a resolved player action.')
 const after=plain(result.newGameState),initial=plain(before)
 assert.equal(after.handledRequestIds.includes(clientRequestId),false)
 // Per-request allowance bookkeeping is the same exception used by the
 // existing documentary API tests; it grants no mechanical action or state.
 delete after.dmActionAllowance;delete initial.dmActionAllowance
 assert.deepEqual(after,initial,'Inspection changes no HP, resource, condition, inventory, inspiration, clock, action, fact or progress.')
 assert.deepEqual(plain((await loadSession(sessionId)).gameState),result.newGameState)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
