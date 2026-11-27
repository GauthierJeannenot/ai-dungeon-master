const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const{engine,ok,replace}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
const source='Le MJ observe les vrais aliments et la disposition physique de la dose entière, sans portion ou puissance inventée.'
async function setup(t,dice='2,5,19'){
 const call=await engine(t,{dice}),initial=await call('get_game_state'),shield=initial.player.inventory.find(item=>(item.equipmentId??item.id)==='shield')
 if(shield)ok(await call('equip_item',{itemId:shield.id,slot:'shield',operation:'unequip'}))
 let state=await call('get_game_state')
 ok(await call('create_scene_object',{objectId:'actual-api-provisions',name:'Réserve réelle',description:source,cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['poison_assassins_blood','ration_1_day']}))
 const items=ok(await call('interact_object',{objectId:'actual-api-provisions',action:'open'})).releasedItems
 for(const item of items)ok(await call('pick_up_item',{itemId:item.id}))
 const food=items.find(item=>item.equipmentId==='ration_1_day'),dose=items.find(item=>item.equipmentId==='poison_assassins_blood')
 ok(await call('begin_nutrition_tracking',{eventId:'actual-api-nutrition',operation:'begin',standardNeedsConfirmed:true,hotWeather:false,source,foodDebtHalfDays:0,priorDeprivation:'none'}))
 state=await call('get_game_state')
 const fact=ok(await call('record_scene_fact',{description:source,cell:state.player.position})).worldFact.id
 ok(await call('prepare_player_poison',{eventId:'actual-api-food-dose',doseItemId:dose.id,surfaceKind:'item',surfaceId:food.id,physicalFactId:fact,foodOrLiquidConfirmed:true,surfaceDescription:source}))
 const ruling={eventId:'actual-api-portion',preparationId:'actual-api-food-dose',operation:'consume',operationEventId:'actual-api-meal',sourceItemId:food.id,selectedUnits:1,disposition:'selected_portion',physicalFactId:fact,wholeDoseDispositionConfirmed:true,source}
 const meal={eventId:'actual-api-meal',itemId:food.id,units:1,poisonPortionAdjudicationId:ruling.eventId}
 return{call,food,dose,ruling,meal}
}
test('the actual API preserves an auxiliary exact whole-dose ruling, one poisoned intake and SQL, refusing a second player action before its die',async t=>{
 const{call,food,ruling,meal}=await setup(t)
 const{result,seen,selected,before}=await play(t,call,[{name:'adjudicate_poison_portion',input:ruling},{name:'consume_provisions',input:meal},params=>{assert.equal(ok(lastResult(params)).poisonDamageDealt,5);return{name:'inspect_poison_nutrition',input:{}}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu consommes la portion réelle et subis le poison effectivement avalé.'}],'Je mange cette portion réelle dont la disposition de la dose est établie.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState
 assert.equal(after.dmTools.survival.day.foodHalfPounds,1);assert.equal(after.dmTools.survival.provisions[food.id].remainingUnits,3)
 assert.equal(after.dmTools.poisonNutrition.adjudications[ruling.eventId].usedBy,meal.eventId)
 assert.equal(Object.keys(after.dmTools.playerPoisons.deliveries).length,1);assert.equal(after.player.hp.current,before.player.hp.current-5)
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('the API refuses an unruled partial ingestion before debit then resolves the actual portion leaving the entire dose in its true remainder',async t=>{
 const{call,food,ruling,meal}=await setup(t,'19');ruling.disposition='remainder'
 const{result,before}=await play(t,call,[{name:'consume_provisions',input:{eventId:meal.eventId,itemId:food.id,units:1}},params=>{assert.equal(lastResult(params).code,'POISON_WHOLE_DOSE_DISPOSITION_REQUIRED');return{name:'adjudicate_poison_portion',input:ruling}},{name:'consume_provisions',input:meal},params=>{assert.equal(ok(lastResult(params)).wholePoisonDoseRetained,true);return 'Tu manges la portion choisie ; la dose entière reste dans le reliquat observé.'}],'Je mange la portion dont le MJ constate la dose entière dans le reliquat.')
 const after=result.newGameState
 assert.equal(after.dmTools.survival.day.foodHalfPounds,1);assert.equal(after.dmTools.survival.provisions[food.id].remainingUnits,3)
 assert.equal(after.dmTools.playerPoisons.preparations[ruling.preparationId].status,'active');assert.equal(Object.keys(after.dmTools.playerPoisons.deliveries).length,0)
 assert.deepEqual(after.player.hp,before.player.hp);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('two actual API messages preserve the already consumed poisoned portion and resolve its original held CON without a second meal or die',async t=>{
 const{call,food,ruling,meal}=await setup(t,'2,1,5,19')
 ok(await call('adjudicate_poison_portion',ruling));await replace(call,state=>state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600}))
 const first=await play(t,call,[{name:'consume_provisions',input:meal},params=>{assert.ok(ok(lastResult(params)).pendingReaction);return 'La portion est avalée ; ton choix d’Inspiration reste en attente.'}],'Je mange la portion réelle et garde mon choix de réaction.')
 const pending=first.result.newGameState.hero.pending;assert.ok(pending)
 const second=await play(t,call,[{name:'resolve_reaction',input:{pendingId:pending.id,choice:'bardic_inspiration'}},params=>{assert.equal(ok(lastResult(params)).poisonDamageDealt,5);return 'Ton Inspiration résout la sauvegarde initiale du poison déjà avalé.'}],'Je dépense l’Inspiration pour cette sauvegarde déjà engagée.')
 const after=second.result.newGameState
 assert.equal(after.dmTools.survival.day.foodHalfPounds,1);assert.equal(after.dmTools.survival.provisions[food.id].remainingUnits,3)
 assert.equal(Object.keys(after.dmTools.playerPoisons.deliveries).length,1);assert.equal(after.dmTools.survival.receipts[meal.eventId].result.ingestionPending,false)
 assert.equal(after.player.hp.current,first.before.player.hp.current-5);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
