const test=require('node:test'),assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',MONETIZATION_ENABLED:'false',ALLOW_PAID_LLM:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_LEVEL:'error'})
const pg=installPgMem()
const {POST}=require('../app/api/dm/route.ts'),llm=require('../lib/dm/llm.ts')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {closeMCPClient}=require('../lib/mcp-client.ts')
const {buildDynamicPrompt}=require('../lib/dm/prompts.ts')
const {buildInitialGameState}=require('../lib/initial-game-state.ts')
const {engine,ok}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())

test('SQL loading migrates both reserves once and saving an exhausted wallet cannot recreate starting gold',async()=>{
  const state=buildInitialGameState('sarah-of-yellowcrest-manor','wizard')
  state.hero.gold=17.23;state.dmTools.wallet={cp:2,sp:1,ep:0,gp:5,pp:0}
  await saveSession('currency-migration',{gameState:state,history:[],adventureId:state.adventureId,characterId:'wizard'})
  const migrated=await loadSession('currency-migration')
  assert.deepEqual(migrated.gameState.dmTools.wallet,{cp:5,sp:3,ep:0,gp:22,pp:0});assert.equal(migrated.gameState.hero.gold,undefined)
  migrated.gameState.dmTools.wallet={cp:0,sp:0,ep:0,gp:0,pp:0}
  await saveSession('currency-migration',migrated)
  assert.equal((await loadSession('currency-migration')).gameState.dmTools.wallet.gp,0)
})

test('a model-selected dungeon passage stays in the same SQL session and survives closing/restarting its MCP process',async t=>{
  const call=await engine(t),initial=await call('get_game_state')
  const layout=ok(await call('generate_dungeon',{seed:'sql-session',width:3,height:3,count:5})).layout
  const installed=ok(await call('install_dungeon',{dungeonId:'sql-passage',layout,entranceCell:initial.player.position,
    questLink:{goal:'Poursuivre la quête déjà établie.',lead:'Une piste concrète ramène au témoin de la campagne.',delivery:'clue',discoveryDc:10}}))
  const state=await call('get_game_state'),id=`dungeon-route-${process.pid}`
  t.after(async()=>{await closeMCPClient(id);await deleteSession(id)})
  await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
  let transitionId=installed.entryTransitionId,turn=0
  const tool=(name,input)=>({stop_reason:'tool_use',content:[{type:'tool_use',id:`${name}-${turn}`,name,input}]})
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{

    if(++turn%2===1)return tool('travel_to_map',{transitionId})
    return {stop_reason:'end_turn',content:[{type:'text',text:'Tu empruntes le passage choisi et observes les lieux où tu arrives.'}]}
  })
  async function play(){
    const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,message:'Je passe par le seuil choisi.',adventureId:state.adventureId,characterId:state.characterId})}))
    const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data
  }
  const entered=await play()
  assert.equal(entered.newGameState.currentMapId,installed.mapId)
  assert.equal(entered.newGameState.adventureId,initial.adventureId)
  assert.deepEqual(entered.toolsUsed,['travel_to_map'])
  const stored=await loadSession(id)
  assert.deepEqual(JSON.parse(JSON.stringify(stored.gameState)),entered.newGameState)
  assert.ok(buildDynamicPrompt(stored.gameState).includes(installed.exitTransitionId),'return passage is in actual DM context')
  await closeMCPClient(id)
  transitionId=installed.exitTransitionId
  const returned=await play()
  assert.equal(returned.newGameState.currentMapId,initial.currentMapId)
  assert.deepEqual(returned.newGameState.dmTools.dungeons,entered.newGameState.dmTools.dungeons)
  assert.deepEqual(returned.newGameState.dmTools.wallet,initial.dmTools.wallet)
})
