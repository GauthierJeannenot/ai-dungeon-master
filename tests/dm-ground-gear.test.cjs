const test=require('node:test'),assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const pg=installPgMem(),llm=require('../lib/dm/llm.ts'),mcp=require('../lib/mcp-client.ts')
const {POST}=require('../app/api/dm/route.ts'),{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,replace}=require('./helpers/mcp-toolkit.cjs')
const plain=value=>JSON.parse(JSON.stringify(value))
const activitySource='Travail physique réellement choisi et observé ; durée établie par le MJ pour ces objets existants.'
test.after(()=>pg.restore())
function lastResult(params){return JSON.parse(params.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(b=>b.type==='tool_result').at(-1).content)}
async function play(t,seed,steps){
 const before=await seed('get_game_state'),metadata=(await seed.client.listTools()).tools,seen=[],selected=[]
 const id=`gear-api-${process.pid}-${Date.now()}-${Math.random()}`
 await saveSession(id,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 t.after(async()=>{await mcp.closeMCPClient(id);await deleteSession(id)})
 t.mock.method(mcp,'listMCPTools',async()=>metadata)
 t.mock.method(mcp,'callMCPTool',async(name,input={})=>{
  if(!['get_game_state','replace_game_state'].includes(name)){
   seen.push({name,input:plain(input)})
   assert.ok(selected.some(c=>c.name===name&&JSON.stringify(c.input)===JSON.stringify(input)),`No fabricated gameplay call: ${name}`)
  }
  return seed(name,input)
 })
 let index=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{
  assert.equal(context.operation,'dm.turn');assert.equal(params.tool_choice,undefined)
  const step=steps[index++];assert.ok(step,'The explicitly scripted agent must finish')
  const command=typeof step==='function'?step(params):step
  if(typeof command==='string')return{stop_reason:'end_turn',content:[{type:'text',text:command}]}
  selected.push(plain(command));return{stop_reason:'tool_use',content:[{type:'tool_use',id:`gear-${index}`,name:command.name,input:command.input}]}
 })
 const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,adventureId:before.adventureId,characterId:before.characterId,message:'Je réalise le travail choisi avec ces équipements et récipients réels.'})}))
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(index,steps.length)
 assert.deepEqual(plain((await loadSession(id)).gameState),result.newGameState)
 return{result,seen,selected,before}
}
async function setup(t){
 const call=await engine(t,{dice:'19'})
 // Fixture contains actual owned instances before the player request; no game
 // server creates a bag/container to make an incomplete model call succeed.
 await replace(call,s=>s.player.inventory.push({id:'actual-caltrops',equipmentId:'caltrops',name:'Lot réel de chausse-trappes',type:'misc',quantity:1},{id:'source-pouch',equipmentId:'pouch',name:'Bourse source réelle',type:'misc',quantity:1},{id:'destination-pouch',equipmentId:'pouch',name:'Bourse destination réelle',type:'misc',quantity:1}))
 let state=await call('get_game_state')
 if(!state.dmTools?.loadout){const weapon=state.player.inventory.find(i=>i.type==='weapon');if(weapon)ok(await call('equip_item',{itemId:weapon.id,operation:'unequip',slot:'main_hand'}))}
 for(const[key,slot]of [['mainHandId','main_hand'],['offHandId','off_hand'],['shieldId','shield']]){
  state=await call('get_game_state');const itemId=state.dmTools?.loadout?.[key];if(itemId)ok(await call('equip_item',{itemId,operation:'unequip',slot}))
 }
 state=await call('get_game_state');const origin={...state.player.position}
 const fact=async description=>ok(await call('record_scene_fact',{description,cell:origin})).worldFact.id
 const surfaceFactId=await fact('Le véritable sol au plan Z0 est stable à cet endroit.')
 const placement={placementId:'actual-placement',itemId:'actual-caltrops',originCell:origin,surfaceZFeet:0,surfaceFactId}
 const containerFactId=await fact('Ces deux récipients réellement possédés disposent de la capacité libre explicitement annoncée compte tenu de leur contenu présent.')
 const remainingCoverageFactId=await fact('Les unités restantes couvrent réellement le même carré déjà observé.')
 function recovery(recoveryId,containerItemId,remaining,workSeconds=6){return{eventId:`start-${recoveryId}`,recoveryId,placementId:placement.placementId,units:10,containerItemId,containerFactId,actualContainerConfirmed:true,availableCapacityUnits:20,capacityForCurrentContentsConfirmed:true,requiredSeconds:6,workSeconds,remainingCells:remaining?[origin]:[],...remaining?{remainingCoverageFactId,remainingCoverageConfirmed:true}:{},restActivity:'light',activitySource}}
 return{call,placement,recovery,containerFactId}
}
test('the API charges actual placement and blocks an unrelated second action before its die',async t=>{
 const{call,placement}=await setup(t)
 const{result,seen,selected,before}=await play(t,call,[{name:'place_ground_gear',input:placement},{name:'get_rules_support',input:{domain:'ground_gear'}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu poses le véritable lot sur la surface choisie.'}])
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+6);assert.equal(after.dmTools.groundGear.placements[placement.placementId].unitsRemaining,20)
 assert.equal(after.player.inventory.some(i=>i.id===placement.itemId),false);assert.deepEqual(after.player.position,before.player.position);assert.deepEqual(after.player.hp,before.player.hp)
 assert.equal(after.phase,'exploration');assert.deepEqual(after.initiativeOrder,before.initiativeOrder)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('the API permits actual segments and auxiliary completion of the same recovery, never another job',async t=>{
 const{call,placement,recovery}=await setup(t);ok(await call('place_ground_gear',placement))
 const input=recovery('chosen-recovery','source-pouch',true,3)
 const{result,seen,selected,before}=await play(t,call,[{name:'start_ground_gear_recovery',input},{name:'continue_ground_gear_recovery',input:{eventId:'work-original-recovery',recoveryId:input.recoveryId,workSeconds:3,restActivity:'light',activitySource}},{name:'finish_ground_gear_recovery',input:{eventId:'finish-original-recovery',recoveryId:input.recoveryId}},{name:'start_ground_gear_recovery',input:recovery('unrelated-recovery','destination-pouch',false)},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu récupères les dix unités réellement collectées dans ta bourse.'}])
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,job=after.dmTools.groundGear.recoveries[input.recoveryId]
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+6);assert.equal(job.workedSeconds,6);assert.equal(job.status,'completed');assert.equal(job.segments.length,2)
 assert.equal(after.dmTools.groundGear.placements[placement.placementId].unitsRemaining,10);assert.equal(after.dmTools.groundGear.recoveries['unrelated-recovery'],undefined)
 const stock=after.dmTools.groundGear.stocks[job.stockItemId];assert.equal(stock.units,10);assert.equal(stock.containerItemId,'source-pouch')
 assert.deepEqual(after.player.hp,before.player.hp);assert.deepEqual(after.player.position,before.player.position);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('the API persists explicit two-container fusion and completion without a second action or invented full bag',async t=>{
 const{call,placement,recovery,containerFactId}=await setup(t);ok(await call('place_ground_gear',placement))
 const stocks=[]
 for(const[id,container,remaining]of [['first','source-pouch',true],['second','destination-pouch',false]]){
  ok(await call('start_ground_gear_recovery',recovery(id,container,remaining)))
  stocks.push(ok(await call('finish_ground_gear_recovery',{eventId:`finish-${id}`,recoveryId:id})).stock)
 }
 const input={eventId:'chosen-transfer-start',transferId:'chosen-transfer',sourceStockItemId:stocks[0].itemId,destinationContainerItemId:'destination-pouch',destinationStockItemId:stocks[1].itemId,units:10,containerFactId,actualContainerConfirmed:true,availableCapacityUnits:10,capacityForCurrentContentsConfirmed:true,requiredSeconds:12,workSeconds:6,restActivity:'light',activitySource}
 const{result,seen,selected,before}=await play(t,call,[{name:'start_ground_gear_transfer',input},{name:'continue_ground_gear_transfer',input:{eventId:'chosen-transfer-work',transferId:input.transferId,workSeconds:6,restActivity:'light',activitySource}},{name:'finish_ground_gear_transfer',input:{eventId:'chosen-transfer-finish',transferId:input.transferId}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu réunis les vingt unités réelles dans la bourse choisie.'}])
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,data=after.dmTools.groundGear
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+12);assert.equal(data.transfers[input.transferId].status,'completed');assert.equal(data.transfers[input.transferId].segments.length,2)
 assert.equal(data.stocks[stocks[0].itemId],undefined);assert.equal(data.stocks[stocks[1].itemId].units,20);assert.equal(after.player.inventory.some(i=>i.equipmentId==='caltrops'),false)
 for(const id of ['source-pouch','destination-pouch'])assert.equal(after.player.inventory.filter(i=>i.id===id).length,1)
 assert.deepEqual(after.player.hp,before.player.hp);assert.deepEqual(after.player.position,before.player.position);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
