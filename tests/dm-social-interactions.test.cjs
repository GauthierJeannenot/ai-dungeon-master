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
 const id=`social-api-${process.pid}-${Date.now()}-${Math.random()}`
 await saveSession(id,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 t.after(async()=>{await mcp.closeMCPClient(id);await deleteSession(id)})
 t.mock.method(mcp,'listMCPTools',async()=>metadata)
 t.mock.method(mcp,'callMCPTool',async(name,input={})=>{if(!['get_game_state','replace_game_state'].includes(name)){seen.push({name,input:plain(input)});assert.ok(selected.some(c=>c.name===name&&JSON.stringify(c.input)===JSON.stringify(input)),`No fabricated gameplay call: ${name}`)}return seed(name,input)})
 let index=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{
  assert.equal(context.operation,'dm.turn')
  if(params.tool_choice)assert.deepEqual(params.tool_choice,{type:'any',disable_parallel_tool_use:true},'a pending engine continuation may require tools, never a server-selected tool')
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

const {spawn}=require('./helpers/mcp-toolkit.cjs')
for(const resolution of ['check','roleplay'])test(`the API resolves a standard social ${resolution} without inventing NPC effects or spending an unrelated action`,async t=>{
 const seed=await engine(t,{dice:'20,19'}),target=await spawn(seed,'goblin')
 const before=await seed('get_game_state'),interactionId='actual-api-conversation',conversationEventId='actual-dialogue'
 const request={name:'resolve_social_request',input:{eventId:'actual-request',interactionId,targetId:target.id,conversationEventId,entityId:'player',
  request:{id:'actual-simple-request',description:'Écouter cette courte demande sans risque ni sacrifice.',risk:'none',source},
  resolution,...(resolution==='check'?{skill:'persuasion'}:{roleplayDecision:{granted:true,source:'Le MJ constate explicitement sa réaction réelle à cette conversation, sans jet requis.'}})}}
 const commands=[{name:'begin_social_interaction',input:{eventId:'actual-begin',interactionId,targetId:target.id,attitude:'hostile',source}},
  {name:'record_social_conversation',input:{eventId:conversationEventId,interactionId,targetId:target.id,source,requestReached:true,sufficientForInsight:false,
   participants:[{entityId:'player',statement:'Je te demande de m’écouter un instant.',contribution:'neutral',source}]}},
  {name:'inspect_social_interaction',input:{interactionId}},request]
 if(resolution==='roleplay')commands.push({name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}})
 commands.push({name:'roll_ability_check',input:{entityId:'player',ability:'int',dc:10}},
  params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu exposes ta demande ; aucun déplacement, récompense ou objectif n’est accordé automatiquement.'})
 const {result,seen,selected}=await play(t,seed,commands,'Je formule cette courte demande dans notre conversation.')
 assert.deepEqual(seen,selected.slice(0,-1))
 const after=result.newGameState
 assert.equal(after.dmTools.socialInteractions.receipts['actual-request'].result.requestGranted,true)
 assert.equal(Object.hasOwn(after,'socialRelationships'),false)
 assert.deepEqual(after.player.inventory,before.player.inventory)
 assert.deepEqual(after.player.position,before.player.position)
 assert.deepEqual(after.monsters[target.id].hp,before.monsters[target.id].hp)
 assert.deepEqual(after.monsters[target.id].position,before.monsters[target.id].position)
 assert.deepEqual(after.sceneMemory?.npcDispositions,before.sceneMemory?.npcDispositions)
 assert.deepEqual(after.worldFacts,before.worldFacts)
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19,'one actual check, no die for preparation, roleplay, reading or refused second action')
})
