const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'6'})
const {installPgMem}=require('./helpers/pg-mem.cjs')
const pg=installPgMem()
const llm=require('../lib/dm/llm.ts'),mcp=require('../lib/mcp-client.ts')
const {POST}=require('../app/api/dm/route.ts')
const {buildInitialGameState}=require('../lib/initial-game-state.ts')
const {saveSession,deleteSession,loadSession}=require('../lib/session-store.ts')
const {reactionOpportunities}=require('../lib/npc-reactions.ts')
const {buildStaticSystemBlocks}=require('../lib/dm/prompts.ts')
test.after(()=>pg.restore())
const tool=(name,input)=>({stop_reason:'tool_use',content:[{type:'tool_use',name,input,id:`call-${Math.random()}`}]})
const text=content=>({stop_reason:'end_turn',content:[{type:'text',text:content}]})
async function post(id,message,extra={}) {const r=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,message,...extra})}));return {status:r.status,data:await r.json()} }
function session(t) {const id=`navigation-${process.pid}-${Math.random()}`;t.after(async()=>{await mcp.closeMCPClient(id);await deleteSession(id)});return id}

test('the model explicitly selects the named room ID; server forwards it unchanged and engine computes the path',async t=>{
  const id=session(t), calls=[];const real=mcp.callMCPTool
  t.mock.method(mcp,'callMCPTool',async(...args)=>{if(args[0]==='move_token')calls.push(structuredClone(args[1]));return real(...args)})
  let n=0,system
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{

    if(++n===1){system=params.system;assert.match(JSON.stringify(params.messages),/roomId/);return tool('move_token',{tokenId:'player',roomId:'5'})}
    assert.deepEqual(params.system,system)
    const result=JSON.parse(params.messages.at(-1).content[0].content)
    assert.equal(result.goalReached,false);assert.equal(result.stopReason,'closed_door')
    assert.ok(result.path.length>1);assert.equal(result.stopDoorId,'front')
    return text('Tu t’arrêtes devant la porte principale fermée ; le bureau reste à l’intérieur.')
  })
  const {status,data}=await post(id,'Je me dirige vers le bureau.')
  assert.equal(status,200,JSON.stringify(data));assert.deepEqual(calls,[{tokenId:'player',roomId:'5'}])
  assert.equal(data.newGameState.currentRoomId,'1');assert.equal(data.newGameState.roomsVisited.includes('5'),false)
})

test('reactive decisions follow a resolved action, use model arguments, persist once and cannot cascade or repeat on retry',async t=>{
  const id=session(t),state=buildInitialGameState('tide-crypt')
  state.player.position={x:6,y:1};state.currentRoomId='8';state.roomsVisited=['8']
  await saveSession(id,{gameState:state,history:[],adventureId:'tide-crypt'})
  const real=mcp.callMCPTool,actions=[];let regular=0,reactions=0,staticSystem
  t.mock.method(mcp,'callMCPTool',async(...args)=>{if(!['get_game_state','replace_game_state'].includes(args[0]))actions.push(structuredClone(args.slice(0,2)));return real(...args)})
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{

    staticSystem??=params.system;assert.deepEqual(params.system,staticSystem)
    if(context.operation==='dm.npc') {
      reactions++;assert.deepEqual(params.tools.map(tool=>tool.name).sort(),['consult_rules','discover_tools','get_monster_stat_block','get_rules_support','npc_action'])
      assert.equal(params.tool_choice.type,'any','a real pending NPC activation still requires its explicit decision')
      if(reactions===1)return tool('consult_rules',{query:'surprise',book:'phb-2014'})
      assert.equal(JSON.parse(params.messages.at(-1).content[0].content).kind,'search')
      assert.equal(context.gameState.npcActivationLedger?.length??0,0,'reading must not complete the pending activation')
      const opportunity=reactionOpportunities(context.gameState)[0]
      return tool('npc_action',{npcId:opportunity.npcId,activationKey:opportunity.activationKey,actions:[{kind:'move',targetEntityId:'player',relation:'adjacent'}]})
    }
    if(++regular===1)return tool('move_token',{tokenId:'player',toCell:{x:6,y:2}})
    return text('Tu avances dans la chapelle ; une présence se rapproche sans se révéler.')
  })
  const first=await post(id,'J’avance.',{clientRequestId:'same-request'})
  assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(reactions,2)
  assert.deepEqual(actions.map(a=>a[0]),['move_token','consult_rules','npc_action'])
  assert.equal(first.data.newGameState.npcs.guardian_echo.visible,false,'navigation must not reveal hidden entities')
  assert.equal(first.data.newGameState.npcActivationLedger.length,1)
  const saved=await loadSession(id);assert.deepEqual(saved.gameState.npcActivationLedger,first.data.newGameState.npcActivationLedger)
  const retry=await post(id,'J’avance.',{clientRequestId:'same-request'})
  assert.equal(retry.status,409);assert.equal(retry.data.code,'REQUEST_ALREADY_RESOLVED');assert.equal(reactions,2)
  assert.equal(actions.length,3)
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{
    assert.notEqual(context.operation,'dm.npc','a completed reaction cannot run again on dialogue')

    return text('Le silence retombe autour de toi.')
  })
  const next=await post(id,'Je contemple la scène.')
  assert.equal(next.status,200)
  assert.deepEqual(next.data.newGameState.npcActivationLedger,first.data.newGameState.npcActivationLedger,'MCP schema hydration preserves activation receipts')
  assert.deepEqual(next.data.newGameState.handledRequestIds,['same-request'])
})

test('DM static system stay stable when spatial state changes',()=>{
  const a=buildInitialGameState('tide-crypt'),b=structuredClone(a)
  b.player.position={x:6,y:2};b.currentRoomId='8';b.sceneMemory={doorStates:{sample:'open'}}
  assert.deepEqual(buildStaticSystemBlocks(a),buildStaticSystemBlocks(b))
})

test('model-chosen noise reactions persist alert then investigation across requests through the real MCP transport',async t=>{
  const id=session(t),state=buildInitialGameState()
  state.player.position={x:11,y:12};state.currentRoomId='4';state.roomsVisited=['4']
  await saveSession(id,{gameState:state,history:[]})
  const real=mcp.callMCPTool,calls=[];let step=0,staticSystem
  const investigate={encounterId:'bakery_floor_goblins',sourceRoomId:'4',reason:'Second resolved impact heard through the open threshold',
    response:'investigate',moves:[{monsterIndex:1,toCell:{x:10,y:10}}]}
  t.mock.method(mcp,'callMCPTool',async(...args)=>{if(args[0]==='react_to_noise')calls.push(structuredClone(args[1]));return real(...args)})
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{

    staticSystem??=params.system;assert.deepEqual(params.system,staticSystem)
    step++
    if(step===1||step===4)return tool('roll_ability_check',{ability:'str',dc:1,skill:'athletics'})
    if(step===2)return tool('react_to_noise',{encounterId:investigate.encounterId,sourceRoomId:'4',reason:'First resolved impact heard nearby',response:'alert'})
    if(step===5)return tool('react_to_noise',investigate)
    const result=JSON.parse(params.messages.at(-1).content[0].content)
    assert.match(result.sceneContext,/SALLES VOISINES/)
    assert.equal(result.response,step===3?'alert':'investigate')
    return text('Tu frappes le bois ; le bruit résonne dans la pièce.')
  })
  const first=await post(id,'Je frappe le bois.',{clientRequestId:'noise-one'})
  assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(first.data.newGameState.sceneMemory.encounterAwareness.bakery_floor_goblins.status,'alert')
  const second=await post(id,'Je frappe encore.',{clientRequestId:'noise-two'})
  assert.equal(second.status,200,JSON.stringify(second.data))
  assert.deepEqual(calls[1],investigate,'model-selected creature and goal pass through unchanged')
  const awareness=second.data.newGameState.sceneMemory.encounterAwareness.bakery_floor_goblins
  assert.equal(awareness.status,'investigating');assert.deepEqual(awareness.positions[1],{x:10,y:10})
  assert.equal(second.data.newGameState.phase,'exploration');assert.deepEqual(second.data.newGameState.encountersTriggered,[])
  assert.deepEqual((await loadSession(id)).gameState.sceneMemory.encounterAwareness.bakery_floor_goblins,awareness)
})
