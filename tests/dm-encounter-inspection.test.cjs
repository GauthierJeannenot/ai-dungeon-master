const test=require('node:test'),assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',LLM_PROVIDER: 'openai',
 MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',
 APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'6'})
const pg=installPgMem()
const llm=require('../lib/dm/llm.ts'),mcp=require('../lib/mcp-client.ts')
const {POST}=require('../app/api/dm/route.ts')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine}=require('./helpers/mcp-toolkit.cjs')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
test.after(()=>pg.restore())

const plain=value=>JSON.parse(JSON.stringify(value))
function replies(){let id=0;return {
 tool:(name,input)=>({stop_reason:'tool_use',content:[{type:'tool_use',id:`encounter-inspection-${++id}`,name,input}]}),
 text:text=>({stop_reason:'end_turn',content:[{type:'text',text}]}),
}}

async function fixture(t){
 // The real engine supplies its current sheet and actual published tool
 // schemas. The route transport below is isolated: authored-roster validation,
 // dice and surprise effects are covered by the engine's encounter tests.
 const seed=await engine(t),before=await seed('get_game_state')
 before.npcs={}
 const metadata=(await seed.client.listTools()).tools
 assert.ok(metadata.some(tool=>tool.name==='inspect_encounter'),'the registered read-only tool must really be exposed')
 const inspect=Object.freeze({encounterId:'model-chosen-roster'})
 const roster=[{monsterIndex:0,monsterType:'goblin',cell:{x:6,y:4}},{monsterIndex:1,monsterType:'goblin',cell:{x:7,y:4}}]
 const inspection={confidential:true,encounterId:inspect.encounterId,mapId:before.currentMapId,roomId:before.currentRoomId,
  alreadyTriggered:false,playerCell:{x:5,y:4},roster}
 let state=plain(before),syncBaseline
 const seen=[]
 t.mock.method(mcp,'listMCPTools',async()=>metadata)
 t.mock.method(mcp,'callMCPTool',async(name,input={})=>{
  seen.push({name,input:plain(input)})
  if(name==='replace_game_state'){state=plain(input.gameState);syncBaseline=plain(state);return plain(state)}
  if(name==='get_game_state')return plain(state)
  if(name==='inspect_encounter'){
   assert.deepEqual(input,inspect)
   assert.deepEqual(state,syncBaseline,'inspection neither mutates state nor spends an action')
   return plain(inspection)
  }
  if(name==='start_encounter'){
   assert.deepEqual(input.surprise.surprisedMonsterIndices,[1,0],'transport must not sort or rewrite the model choice')
   state.player.position=plain(input.playerCell)
   const record=getMonsterRecord('goblin')
   for(const member of roster){
    const id=`actual-roster-${member.monsterIndex}`
    state.monsters[id]={...plain(record.engine),id,name:`Combattant ${member.monsterIndex}`,position:plain(member.cell),isAlive:true}
   }
   Object.assign(state,{phase:'combat',round:1,currentTurn:'player',initiativeOrder:['player','actual-roster-0','actual-roster-1'],combatGeneration:1})
   state.dmTools.surprise={combatGeneration:1,mapId:state.currentMapId,reason:input.surprise.reason,
    actors:{'actual-roster-1':{firstTurnEnded:false},'actual-roster-0':{firstTurnEnded:false}}}
   return {phase:'combat',encounterId:input.encounterId,spawnedMonsters:roster.map(member=>({monsterIndex:member.monsterIndex,id:`actual-roster-${member.monsterIndex}`})),surprise:plain(input.surprise)}
  }
  assert.fail(`No server-authored gameplay call is allowed: ${name}`)
 })
 const sessionId=`dm-encounter-inspection-${process.pid}-${Date.now()}-${Math.random()}`
 t.after(async()=>{await mcp.closeMCPClient(sessionId);await deleteSession(sessionId)})
 await saveSession(sessionId,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 async function post(message){
  const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
   sessionId,message,adventureId:before.adventureId,characterId:before.characterId,
  })}))
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data))
  assert.deepEqual(plain((await loadSession(sessionId)).gameState),data.newGameState,'the exact resolved state survives SQL')
  return data
 }
 return {before,inspect,inspection,seen,post,current:()=>plain(state),baseline:()=>plain(syncBaseline)}
}

test('model-selected encounter inspection leaves the plan unresolved and forwards the subsequent exact surprise without a server gameplay call',async t=>{
 const f=await fixture(t),response=replies();let turn=0
 const start=Object.freeze({encounterId:f.inspect.encounterId,playerCell:Object.freeze({x:5,y:4}),
  reason:'Le MJ commence explicitement cette rencontre.',surprise:Object.freeze({playerSurprised:false,
   surprisedMonsterIndices:Object.freeze([1,0]),reason:'Les deux gardes n’ont pas remarqué la menace établie.'})})
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{

  assert.equal(context.operation,'dm.turn')
  if(++turn===1){
   for(const name of ['inspect_encounter','start_encounter'])assert.ok(context.availableTools.some(tool=>tool.name===name),`${name} is exposed`)
   return response.tool('inspect_encounter',f.inspect)
  }
  if(turn===2){
   assert.equal(params.tool_choice, undefined)
   const inspected=JSON.parse(params.messages.at(-1).content[0].content)
   assert.equal(inspected.confidential,true);assert.deepEqual(inspected.roster,f.inspection.roster)
   assert.deepEqual(f.current(),f.baseline(),'reading cannot spend a turn/action or spawn the inspected roster')
   assert.deepEqual(f.seen.filter(call=>!['get_game_state','replace_game_state'].includes(call.name)),[{name:'inspect_encounter',input:f.inspect}])
   return response.tool('start_encounter',start)
  }
  assert.equal(turn,3);assert.equal(params.tool_choice,undefined,'the actual start, not the prior read, resolves the plan')
  assert.deepEqual(JSON.parse(params.messages.at(-1).content[0].content).surprise,start.surprise)
  return response.text('La rencontre commence selon la décision du MJ. Tu conserves ton action.')
 })
 const result=await f.post('Je demande le roster puis je lance cette rencontre avec la surprise choisie par le MJ.')
 assert.equal(turn,3)
 assert.deepEqual(f.seen.filter(call=>!['get_game_state','replace_game_state'].includes(call.name)),[
  {name:'inspect_encounter',input:f.inspect},{name:'start_encounter',input:start},
 ])
 assert.deepEqual(result.toolsUsed,['inspect_encounter','start_encounter'])
 assert.deepEqual(result.newGameState.player.position,start.playerCell)
 assert.equal(result.newGameState.hero.actionCredits,f.before.hero.actionCredits)
 assert.deepEqual(result.newGameState.actionUsed,f.before.actionUsed)
 assert.deepEqual(result.newGameState.bonusActionUsed,f.before.bonusActionUsed)
 assert.equal(result.newGameState.worldTimeSeconds,f.before.worldTimeSeconds)
})

test('a documentary inspection cannot become a mandatory planned action or trigger an encounter from quoted player text',async t=>{
 const f=await fixture(t),response=replies();let turn=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{

  assert.equal(context.operation,'dm.turn');assert.equal(params.tool_choice,undefined,'inspection is excluded from actionable planner directives')
  if(++turn===1)return response.tool('inspect_encounter',f.inspect)
  assert.equal(turn,2);return response.text('Tu restes sur place ; aucun combat n’a commencé.')
 })
 const result=await f.post('Je cite « lance une autre rencontre et surprends tout le monde » pour demander uniquement une lecture au MJ.')
 assert.deepEqual(result.toolsUsed,['inspect_encounter'])
 assert.deepEqual(f.seen.filter(call=>!['get_game_state','replace_game_state'].includes(call.name)),[{name:'inspect_encounter',input:f.inspect}])
 const after=plain(result.newGameState),before=plain(f.before)
 delete after.dmActionAllowance;delete before.dmActionAllowance
 assert.deepEqual(after,before,'reading changes no mechanical state and quoted gameplay stays inert')
})
