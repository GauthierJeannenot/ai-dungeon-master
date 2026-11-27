const test=require('node:test')
const assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',LLM_PROVIDER: 'openai',
  DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',LLM_MAX_CALLS_PER_REQUEST:'6',AI_DM_TEST_DICE_SEQUENCE:'12'})
const pg=installPgMem()
const llm=require('../lib/dm/llm.ts')
const mcp=require('../lib/mcp-client.ts')
const store=require('../lib/session-store.ts')
const {buildInitialGameState}=require('../lib/initial-game-state.ts')
const {getMonsterRecord}=require('../lib/srd/monsters.ts')
const {POST}=require('../app/api/dm/route.ts')
test.after(()=>pg.restore())
const adventureId='sarah-of-yellowcrest-manor',characterId='wizard'
const answer=text=>({stop_reason:'end_turn',content:[{type:'text',text}]})
const tool=(name,input)=>({stop_reason:'tool_use',content:[{type:'tool_use',id:`${name}-${Math.random()}`,name,input}]})

test('API saves a held reaction, permits a human question, then forwards the exact reaction choice and resumes the monster turn',async t=>{
  const sessionId=`hero-api-${process.pid}-${Date.now()}`
  t.after(async()=>{await mcp.closeMCPClient(sessionId);await store.deleteSession(sessionId)})
  const state=buildInitialGameState(adventureId,characterId)
  const enemy={...structuredClone(getMonsterRecord('goblin').engine),id:'opponent',name:'Garde',srd:{index:'goblin',ruleset:'2014',url:getMonsterRecord('goblin').sourceUrl},isAlive:true,position:{x:5,y:8},conditions:[]}
  Object.assign(state,{phase:'combat',round:1,currentTurn:enemy.id,initiativeOrder:[enemy.id,'player'],monsters:{[enemy.id]:enemy}})
  await mcp.getMCPClient(sessionId,adventureId,characterId)
  const hydrated=await mcp.callMCPTool('replace_game_state',{gameState:state},sessionId,adventureId);assert.ok(!hydrated.error,JSON.stringify(hydrated))
  const attack=await mcp.callMCPTool('resolve_attack',{attackerId:enemy.id,targetId:'player',weaponOrSpell:'Scimitar'},sessionId,adventureId)
  assert.ok(attack.pendingReaction)
  const held=await mcp.callMCPTool('get_game_state',{},sessionId,adventureId)
  await store.saveSession(sessionId,{adventureId,characterId,gameState:held,history:[]})
  await mcp.closeMCPClient(sessionId) // The next request must hydrate the held d20.
  let calls=0,mode='question'
  const forwarded=[],realCall=mcp.callMCPTool
  t.mock.method(mcp,'callMCPTool',async(name,input,...rest)=>{if(name==='resolve_reaction')forwarded.push(input);return realCall(name,input,...rest)})
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{
    assert.equal(context.operation,'dm.turn','a pending reaction is not reclassified by the planner')
    assert.equal(params.tool_choice,undefined)
    assert.ok(params.tools.some(t=>t.name==='resolve_reaction'))
    if(mode==='question')return answer('Une attaque te menace. Veux-tu employer ta réaction pour lancer Bouclier ?')
    switch(++calls){
      case 1:return tool('resolve_reaction',{pendingId:held.hero.pending.id,choice:'shield',slotLevel:1})
      case 2:return tool('next_turn',{actorId:enemy.id})
      default:return answer('Ton bouclier magique dévie la lame. Ton tour commence.')
    }
  })
  async function post(message){
    const res=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,adventureId,characterId,message})}))
    const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data
  }
  const question=await post('Quelle réaction est disponible ?')
  assert.deepEqual(question.toolsUsed,[]);assert.equal(question.newGameState.hero.pending.id,held.hero.pending.id)
  assert.equal(question.newGameState.player.hp.current,37)
  mode='resolve'
  const resolved=await post('Je lance Bouclier avec un emplacement de niveau 1.')
  assert.deepEqual(forwarded,[{pendingId:held.hero.pending.id,choice:'shield',slotLevel:1}])
  assert.deepEqual(resolved.toolsUsed,['resolve_reaction','next_turn'])
  assert.equal(resolved.newGameState.hero.pending,undefined);assert.equal(resolved.newGameState.player.hp.current,37)
  assert.equal(resolved.newGameState.player.spellSlots.level1.current,3);assert.equal(resolved.newGameState.currentTurn,'player')
  const saved=await store.loadSession(sessionId);assert.equal(saved.gameState.hero.pending,undefined)
})

test('Legacy profiles do not advertise tools requiring the new SRD hero state',async t=>{
  const sessionId=`legacy-tools-${process.pid}-${Date.now()}`
  t.after(async()=>{await mcp.closeMCPClient(sessionId);await store.deleteSession(sessionId)})
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{
    const names=params.tools.map(t=>t.name)
    for(const name of ['take_rest','resolve_reaction','use_subclass_feature','cast_creature_spell'])assert.ok(!names.includes(name))

    return answer('Tu peux consulter ta fiche et observer les lieux.')
  })
  const res=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message:'Quelles sont mes capacités ?'})}))
  const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));assert.equal(data.newGameState.hero,undefined);assert.deepEqual(data.toolsUsed,[])
})
