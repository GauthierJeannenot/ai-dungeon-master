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
 const id=`book-api-${process.pid}-${Date.now()}-${Math.random()}`
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

const supplies={mode:'paid_supply',providedAndConsumedConfirmed:true,source:'Encres et composantes physiquement fournies et consommées une seule fois pour cette copie réelle.'}
const copyInput=(eventId='actual-copy',extra={})=>({eventId,mode:'backup',spellId:'magic-missile',sourceBookId:'spellbook',destinationBookId:'actual-api-book',paid:{gp:5},materials:supplies,workSeconds:900,restActivity:'light',activitySource:source,...extra})
const register={name:'register_spellbook',input:{eventId:'actual-register',itemId:'actual-api-book',kind:'blank',actualBookConfirmed:true,blankConfirmed:true,source}}
for(const variant of ['segmented','persisted','thermal'])test(`the API completes ${variant} actual copy work with one payment, exact choices and SQL persistence`,async t=>{
 const seed=await engine(t,{characterId:'wizard',dice:variant==='thermal'?'20,19':'19'})
 await replace(seed,state=>state.player.inventory.push({id:'actual-api-book',name:'Volume réellement acquis',type:'misc'}))
 if(variant==='persisted'){
  ok(await seed(register.name,register.input));ok(await seed('copy_personal_spell',copyInput()))
 }
 if(variant==='thermal'){
  const state=await seed('get_game_state')
  ok(await seed('configure_weather',{eventId:'actual-cold',roomId:state.currentRoomId,temperatureF:0,strongWind:false,precipitation:'none',sandstorm:false,fog:'none',source}))
  ok(await seed('record_weather_exposure',{eventId:'actual-exposure',entityId:'player',operation:'begin',exposed:true,breathes:true,altitudeFeet:0,historyKnown:true,knownColdPartialSeconds:2700,knownHeatPartialSeconds:0,priorResolvedHeatHours:0,knownAcclimationSeconds:0,source}))
 }
 const before=await seed('get_game_state'),steps=[{name:'inspect_spellbooks',input:{}}]
 if(variant!=='persisted')steps.push(register,{name:'copy_personal_spell',input:copyInput()})
 if(variant==='thermal')steps.push({name:'inspect_weather',input:{entityId:'player'}},params=>{
  const event=lastResult(params).events[0];assert.ok(event.eventId);return {name:'resolve_weather_event',input:{eventId:event.eventId}}
 })
 steps.push({name:'continue_spell_copy',input:{eventId:'actual-next-segment',jobId:'actual-copy',seconds:900,restActivity:'light',source}},
  {name:'resolve_spell_copy',input:{jobId:'actual-copy'}},
  {name:'copy_personal_spell',input:copyInput('unrelated-new-copy',{spellId:'shield',paid:{gp:10},workSeconds:undefined})},
  params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Le sort est recopié dans ton vrai volume ; le reste de ton grimoire ne change pas.'})
 const {result,seen,selected}=await play(t,seed,steps,'Je termine cette copie réelle, en résolvant ses événements avant de poursuivre.')
 assert.deepEqual(seen,selected.slice(0,-1))
 const after=result.newGameState
 assert.equal(after.worldTimeSeconds,1800)
 assert.equal(after.dmTools.wallet.gp,before.dmTools.wallet.gp-(variant==='persisted'?0:5))
 assert.equal(after.dmTools.spellbooks.jobs['actual-copy'].workedSeconds,1800)
 assert.equal(after.dmTools.spellbooks.jobs['actual-copy'].segments.length,2)
 assert.equal(after.dmTools.spellbooks.jobs['actual-copy'].status,'completed')
 assert.deepEqual(after.player.inventory.find(item=>item.id==='actual-api-book').spellIds,['magic-missile'])
 assert.deepEqual(after.player.knownSpells,before.player.knownSpells)
 assert.deepEqual(after.player.position,before.player.position)
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19,'copying and completion retries never invent or repeat a die')
})
