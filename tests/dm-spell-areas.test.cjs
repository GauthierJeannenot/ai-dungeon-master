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
 const id=`area-api-${process.pid}-${Date.now()}-${Math.random()}`
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
  selected.push(plain(command));return {stop_reason:'tool_use',content:[{type:'tool_use',id:`area-${index}`,name:command.name,input:command.input}]}
 })
 const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,adventureId:before.adventureId,characterId:before.characterId,message})}))
 const result=await response.json();assert.equal(response.status,200,result.error);assert.equal(index,steps.length)
 assert.deepEqual(plain((await loadSession(id)).gameState),result.newGameState)
 return {result,seen,selected}
}
const {grid,spawn}=require('./helpers/mcp-toolkit.cjs')
const {inferRoomIdOnMap,getMapSpec}=require('../mcp-server/dist/lib/adventure-map.js')
const {playerSeesCell}=require('../mcp-server/dist/lib/scene-perception.js')
async function actualTarget(seed){
 const state=await seed('get_game_state'),nav=grid(state),map=getMapSpec(state.currentMapId,state)
 for(let y=0;y<map.grid.rows;y++)for(let x=0;x<map.grid.cols;x++)if(Math.hypot(x-state.player.position.x,y-state.player.position.y)>=5&&nav.free({x,y})&&playerSeesCell(state,{x,y}))return spawn(seed,'goblin',{x,y})
 assert.fail('The actual scene needs a visible distant target cell')
}
for(const succeeds of [true,false])test(`the API preserves exact cylinder choices and real Flame Strike scroll ${succeeds?'success':'reading failure'}`,async t=>{
 const seed=await engine(t,{characterId:'cleric',dice:succeeds?'20,1,1,1,1,1,1,1,1,1,19':'1,19'}),target=await actualTarget(seed),state=await seed('get_game_state')
 const roomId=inferRoomIdOnMap(target.position,state.currentMapId,state)
 ok(await seed('record_vertical_surface',{eventId:'area-floor-observation',surfaceId:'actual-area-floor',mapId:state.currentMapId,roomId,cells:[target.position],kind:'support',elevationFeet:0,actualGeometryConfirmed:true,source}))
 ok(await seed('observe_standing_surface',{eventId:'area-body-support',entityId:target.id,surfaceId:'actual-area-floor',actualCurrentSupportConfirmed:true,bodyHeightFeet:4,source}))
 const itemId='actual-api-flame-scroll'
 ok(await seed('create_spell_scroll',{itemId,spellId:'flame-strike',name:'Parchemin réel',description:'Un véritable parchemin de Colonne de flamme.',cell:state.player.position}))
 ok(await seed('pick_up_item',{itemId}));ok(await seed('read_spell_scroll',{itemId}))
 const before=await seed('get_game_state'),area={origin:{...target.position,zFeet:0},verticalDirection:'up',surfaceId:'actual-area-floor'}
 const steps=[{name:'inspect_vertical_barriers',input:{}},{name:'inspect_spell_area',input:{spellId:'flame-strike',area}},
  params=>{assert.equal(ok(lastResult(params)).previewOnly,true);return{name:'get_rules_support',input:{domain:'spell_areas'}}},
  {name:'use_spell_scroll',input:{itemId,area}},
  params=>{const answer=ok(lastResult(params));assert.equal(answer.spell,'flame-strike')
   if(succeeds){assert.equal(answer.dc,17);assert.equal(answer.damageDealt,8);assert.deepEqual(answer.damageComponents.map(c=>[c.damageType,c.rawDamage]),[['fire',4],['radiant',4]])}
   else{assert.equal(answer.success,false);assert.equal(answer.spellScrollUse.check.dc,15)}
   return{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}},
  params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Le vrai parchemin et sa zone choisie ont été résolus.'}]
 const {result,seen,selected}=await play(t,seed,steps,'J’utilise ce parchemin sur cette zone réelle.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState
 assert.deepEqual(seen.find(call=>call.name==='use_spell_scroll').input,{itemId,area},'no server rewriting of the nested actual spatial selection')
 assert.equal(after.monsters[target.id].hp.current,before.monsters[target.id].hp.current-(succeeds?8:0))
 assert.equal(after.dmTools.spellScrolls[itemId].status,'consumed');assert.equal(after.player.inventory.some(item=>item.id===itemId),false)
 assert.deepEqual(after.player.spellSlots,before.player.spellSlots);assert.deepEqual(after.player.position,before.player.position);assert.deepEqual(after.player.hp,before.player.hp)
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19,'preview and failed reading create no damage dice; successful reading uses only original packet dice and actual saves')
})
