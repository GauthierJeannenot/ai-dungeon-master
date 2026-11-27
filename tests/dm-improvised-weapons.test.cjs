const test=require('node:test'),assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const pg=installPgMem(),llm=require('../lib/dm/llm.ts'),mcp=require('../lib/mcp-client.ts')
const {POST}=require('../app/api/dm/route.ts'),{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,replace}=require('./helpers/mcp-toolkit.cjs')
const source='Observation physique explicitement établie par le MJ pour cette scène.'
const plain=value=>JSON.parse(JSON.stringify(value))
test.after(()=>pg.restore())
function lastResult(params){const blocks=params.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]);return JSON.parse(blocks.filter(b=>b.type==='tool_result').at(-1).content)}
async function play(t,seed,steps,message){
 const before=await seed('get_game_state'),metadata=(await seed.client.listTools()).tools,seen=[],selected=[]
 const id=`improvised-api-${process.pid}-${Date.now()}-${Math.random()}`
 await saveSession(id,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 t.after(async()=>{await mcp.closeMCPClient(id);await deleteSession(id)})
 t.mock.method(mcp,'listMCPTools',async()=>metadata)
 t.mock.method(mcp,'callMCPTool',async(name,input={})=>{if(!['get_game_state','replace_game_state'].includes(name)){seen.push({name,input:plain(input)});assert.ok(selected.some(c=>c.name===name&&JSON.stringify(c.input)===JSON.stringify(input)),`No fabricated gameplay call: ${name}`)}return seed(name,input)})
 let index=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{
  assert.equal(context.operation,'dm.turn');assert.equal(params.tool_choice,undefined)
  const step=steps[index++];assert.ok(step,'The agent must finish the explicitly scripted sequence')
  const command=typeof step==='function'?step(params,context):step
  if(typeof command==='string')return {stop_reason:'end_turn',content:[{type:'text',text:command}]}
  selected.push(plain(command));return {stop_reason:'tool_use',content:[{type:'tool_use',id:`weather-${index}`,name:command.name,input:command.input}]}
 })
 const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,adventureId:before.adventureId,characterId:before.characterId,message})}))
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(index,steps.length)
 assert.deepEqual(plain((await loadSession(id)).gameState),result.newGameState)
 return {result,seen,selected}
}
function weather(state,eventId='actual-weather'){return {eventId,roomId:state.currentRoomId,temperatureF:0,strongWind:false,precipitation:'none',sandstorm:false,fog:'none',source}}

test('an explicit ruling for a real improvised object remains auxiliary and persists without replacing the player action',async t=>{
 const seed=await engine(t,{dice:'17,19'})
 await replace(seed,state=>{state.player.inventory.push({id:'actual-pan',name:'Poêle réellement possédée',type:'misc'})})
 const before=await seed('get_game_state'),ruling={name:'adjudicate_improvised_weapon',input:{referenceId:'actual-pan-ruling',targetKind:'item',targetId:'actual-pan',mode:'melee',allowProficiency:false,damageType:'bludgeoning',hands:1,source,reason:'Objet déjà possédé, aucun don ni maîtrise créée.'}}
 const {result,seen,selected}=await play(t,seed,[ruling,
  {name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},
  {name:'roll_ability_check',input:{entityId:'player',ability:'int',dc:10}},
  params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu effectues ton examen ; ta poêle reste dans ton inventaire.'}],
  'Je garde ma poêle et effectue mon examen.')
 assert.deepEqual(seen,selected.slice(0,-1))
 assert.equal(result.newGameState.dmTools.improvised.rulings['actual-pan-ruling'].targetId,'actual-pan')
 assert.deepEqual(result.newGameState.player.inventory,before.player.inventory)
 assert.deepEqual(result.newGameState.player.position,before.player.position)
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19,'the ruling rolls no die and does not permit a second player action')
})
