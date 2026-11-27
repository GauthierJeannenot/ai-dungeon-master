const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const{engine,ok}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
async function acquire(call,equipmentId,objectId){
 const state=await call('get_game_state')
 ok(await call('create_scene_object',{objectId,name:'Réserve présente',description:'Cette vraie réserve contient l’instance physique sélectionnée.',cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:[equipmentId]}))
 const item=ok(await call('interact_object',{objectId,action:'open'})).releasedItems[0];ok(await call('pick_up_item',{itemId:item.id}));return item
}
async function setup(t,template='serpent_venom',dice='19'){
 const call=await engine(t,{dice}),initial=await call('get_game_state'),blade=initial.player.inventory.find(item=>(item.equipmentId??item.id)==='longsword');assert.ok(blade)
 const shield=initial.player.inventory.find(item=>(item.equipmentId??item.id)==='shield')
 if(shield){const answer=await call('equip_item',{itemId:shield.id,operation:'unequip',slot:'shield'});if(answer.error)assert.equal(answer.code,'ITEM_NOT_EQUIPPED')}
 const dose=await acquire(call,`poison_${template}`,'actual-api-poison-stock'),state=await call('get_game_state')
 const fact=ok(await call('record_scene_fact',{description:'La partie exacte de cette vraie lame est observée et physiquement accessible pour l’enduction choisie.',cell:state.player.position})).worldFact
 const prepare={eventId:'actual-api-preparation',doseItemId:dose.id,surfaceKind:'weapon',surfaceId:blade.id,physicalFactId:fact.id,surfaceDescription:'La vraie dose entière est appliquée à cette surface physique choisie.'}
 return{call,dose,blade,prepare}
}
test('the API prepares one actual DMG dose with its real full action interval and refuses a second unrelated action',async t=>{
 const{call,dose,prepare}=await setup(t)
 const{result,seen,selected,before}=await play(t,call,[{name:'prepare_player_poison',input:prepare},{name:'inspect_player_poisons',input:{}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'La lame réelle porte la dose effectivement appliquée.'}],'J’enduis cette lame avec la dose réelle choisie.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,preparation=after.dmTools.playerPoisons.preparations[prepare.eventId]
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+6);assert.equal(after.player.inventory.some(item=>item.id===dose.id),false);assert.equal(preparation.templateId,'serpent_venom');assert.equal(preparation.status,'active')
 assert.deepEqual(after.player.hp,before.player.hp);assert.deepEqual(after.player.position,before.player.position);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('the API resolves an actually protected contact as an auxiliary physical event, then permits one real player check',async t=>{
 const{call,prepare}=await setup(t,'oil_of_taggit','17,19');ok(await call('prepare_player_poison',prepare))
 const state=await call('get_game_state'),fact=ok(await call('record_scene_fact',{description:'Le vrai contact avec la partie enduite a eu lieu sans peau exposée, selon la protection physique réellement observée.',cell:state.player.position})).worldFact
 const input={eventId:'actual-api-protected-contact',preparationId:prepare.eventId,targetId:'player',physicalFactId:fact.id,actualTouchConfirmed:true,exposedSkinConfirmed:false}
 const{result,seen,selected,before}=await play(t,call,[{name:'expose_player_poison',input},params=>{assert.equal(ok(lastResult(params)).playerPoison.skipped,'actual_touch_without_exposed_skin');return{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Le contact protégé ne t’empoisonne pas ; ton observation distincte est résolue.'}],'Le contact décrit est déjà réel ; j’observe ensuite les alentours.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState
 assert.equal(after.dmTools.playerPoisons.preparations[prepare.eventId].status,'delivered');assert.deepEqual(after.player.hp,before.player.hp);assert.deepEqual(after.player.conditions,before.player.conditions);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19,'only the actual WIS check rolled; protected contact and refused extra action did not')
})
test('the API washes one real coating with counted owned water once, without a free surface reset or second action',async t=>{
 const{call,prepare}=await setup(t);ok(await call('prepare_player_poison',prepare))
 const water=await acquire(call,'waterskin_full','actual-api-water-stock')
 ok(await call('register_water_container',{eventId:'actual-api-water-observation',itemId:water.id,containerType:'waterskin',actualContainerConfirmed:true,contentsQuarterPints:16,dryWeightLb:1,waterWeightLbPerPint:1,hazardFactIds:[],source:'La vraie outre possède les quatre pintes effectivement présentes et mesurées.'}))
 const state=await call('get_game_state'),fact=ok(await call('record_scene_fact',{description:'La vraie surface enduite reçoit le lavage complet effectivement réalisé avec la quantité d’eau choisie.',cell:state.player.position})).worldFact
 const input={eventId:'actual-api-complete-wash',preparationId:prepare.eventId,waterContainerItemId:water.id,quarterPints:2,physicalFactId:fact.id,completeWashingConfirmed:true,adjudication:'Le MJ constate cette quantité suffisante pour le lavage physique complet ; aucun volume universel n’est attribué aux règles.'}
 const{result,seen,selected,before}=await play(t,call,[{name:'wash_player_poison',input},{name:'inspect_player_poisons',input:{}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'La vraie enduction est lavée et l’eau utilisée est retirée de l’outre.'}],'Je lave complètement cette lame avec l’eau réelle de mon outre.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+6);assert.equal(after.dmTools.playerPoisons.preparations[prepare.eventId].status,'washed');assert.equal(after.dmTools.foraging.containers[water.id].contentsQuarterPints,14);assert.deepEqual(after.player.hp,before.player.hp)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
