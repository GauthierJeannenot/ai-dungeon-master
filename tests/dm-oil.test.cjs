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
 const id=`oil-api-${process.pid}-${Date.now()}-${Math.random()}`
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
  selected.push(plain(command));return {stop_reason:'tool_use',content:[{type:'tool_use',id:`oil-${index}`,name:command.name,input:command.input}]}
 })
 const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,adventureId:before.adventureId,characterId:before.characterId,message})}))
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(index,steps.length)
 assert.deepEqual(plain((await loadSession(id)).gameState),result.newGameState)
 return {result,seen,selected}
}
async function acquire(seed,equipmentId,objectId){
 const state=await seed('get_game_state')
 ok(await seed('create_scene_object',{objectId,name:'Réserve physique',description:'Un vrai objet du stock est accessible.',cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:[equipmentId]}))
 const released=ok(await seed('interact_object',{objectId,action:'open'})).releasedItems[0]
 assert.equal(released.equipmentId,equipmentId);ok(await seed('pick_up_item',{itemId:released.id}));return released
}
for(const operation of ['use_oil_flask','pour_oil_flask','ignite_oil_patch'])test(`the API persists actual ${operation} and refuses a second unrelated player action`,async t=>{
 const seed=await engine(t,{dice:operation==='use_oil_flask'?'17,19':'19'}),initial=await seed('get_game_state')
 const shield=initial.player.inventory.find(item=>(item.equipmentId??item.id)==='shield')
 if(shield){const r=await seed('equip_item',{itemId:shield.id,operation:'unequip',slot:'shield'});if(r.error)assert.equal(r.code,'ITEM_NOT_EQUIPPED',JSON.stringify(r))}
 const flask=await acquire(seed,'oil_flask','actual-oil-stock'),cell=(await seed('get_game_state')).player.position
 let action
 if(operation==='use_oil_flask')action={name:operation,input:{useId:'actual-api-oil',itemId:flask.id,targetKind:'object',targetId:'actual-oil-stock',mode:'throw'}}
 else{
  const fact=ok(await seed('record_scene_fact',{description:'Le vrai carré de sol observé est horizontal.',cell})).worldFact
  const pour={name:'pour_oil_flask',input:{useId:'actual-api-pool',itemId:flask.id,cell,surfaceFactId:fact.id,levelSurfaceConfirmed:true,surfaceZFeet:0}}
  if(operation==='pour_oil_flask')action=pour
  else{
   ok(await seed(pour.name,pour.input))
   const torch=await acquire(seed,'torch','actual-torch-stock'),state=await seed('get_game_state')
   const blade=state.player.inventory.find(item=>(item.equipmentId??item.id)==='longsword')
   if(blade){const r=await seed('equip_item',{itemId:blade.id,slot:'main_hand',operation:'unequip'});if(r.error)assert.equal(r.code,'ITEM_NOT_EQUIPPED',JSON.stringify(r))}
   ok(await seed('equip_item',{itemId:torch.id,slot:'main_hand',operation:'equip'}))
   ok(await seed('manage_light_source',{itemId:torch.id,operation:'light'}))
   action={name:operation,input:{eventId:'actual-api-ignite',patchId:'actual-api-pool',flameItemId:torch.id}}
  }
 }
 const before=await seed('get_game_state')
 const steps=[action,{name:'get_rules_support',input:{domain:'offensive_oil'}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},
  params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu accomplis cette manipulation réelle du flacon et de sa surface.'}]
 const {result,seen,selected}=await play(t,seed,steps,'Je réalise la manipulation choisie avec cette huile réelle.')
 assert.deepEqual(seen,selected.slice(0,-1))
 const after=result.newGameState,oil=after.dmTools.oil
 assert.equal(after.worldTimeSeconds,(before.worldTimeSeconds??0)+6)
 assert.equal(after.player.inventory.some(item=>item.id===flask.id),false)
 assert.deepEqual(after.player.position,before.player.position);assert.deepEqual(after.player.hp,before.player.hp)
 assert.equal(after.phase,'exploration');assert.deepEqual(after.initiativeOrder,before.initiativeOrder,'no fabricated combat or enemy')
 if(operation==='use_oil_flask'){
  const coating=oil.coatings[JSON.stringify(['object','actual-oil-stock'])]
  assert.equal(coating.itemId,flask.id);assert.equal(coating.expiresAt,coating.appliedAt+60)
  assert.equal(oil.receipts['actual-api-oil'].result.hit,true)
  assert.equal(oil.receipts['actual-api-oil'].result.damageDealt,0)
 }else{
  const patch=oil.patches['actual-api-pool'];assert.equal(patch.itemId,flask.id)
  if(operation==='pour_oil_flask')assert.equal(patch.ignitedAt,undefined)
  else{assert.equal(patch.ignitedAt,after.worldTimeSeconds);assert.equal(patch.burnsUntil,patch.ignitedAt+12)}
 }
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19,'only the actual ranged attack rolls; the unrelated extra action is refused before rolling')
})
