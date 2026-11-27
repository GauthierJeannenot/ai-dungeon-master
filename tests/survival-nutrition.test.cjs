const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,addSupply}=require('./helpers/mcp-toolkit.cjs')
const {SurvivalStateSchema,SurvivalBeginSchema,foodDeprivationAfter,dailyWaterPints,nutritionRestEligibility,nutritionClockBlocked}=require('../mcp-server/dist/lib/survival-state.js')
const begin=(overrides={})=>({eventId:'begin-known-nutrition',operation:'begin',standardNeedsConfirmed:true,hotWeather:false,
 source:'Besoins PHB standard établis et historique alimentaire explicitement connu.',foodDebtHalfDays:0,priorDeprivation:'none',...overrides})
const daily=(overrides={})=>({eventId:'resolve-nutrition-day',nextHotWeather:false,source:'Le temps établi pour la journée suivante est tempéré.',...overrides})
async function start(call,overrides={}){return ok(await call('begin_nutrition_tracking',begin(overrides)))}
async function intake(call,kind,id,units){await addSupply(call,kind,id);return ok(await call('consume_provisions',{eventId:'eat-'+id,itemId:id,units}))}
async function rejectUnchanged(call,name,input,code){const before=await call('get_game_state'),failure=await call(name,input);assert.equal(failure.code,code,JSON.stringify(failure));assert.deepEqual(await call('get_game_state'),before)}
function pureRecord(priorDeprivation='none'){
 return {version:1,status:'active',startedAt:0,source:'État établi.',foodDebtHalfDays:0,priorDeprivation,
 day:{index:0,startsAt:0,endsAt:86400,hotWeather:false,foodHalfPounds:0,waterPints:0},
 recoveryIntake:{foodHalfPounds:0,waterPints:0},provisions:{},receipts:{}}
}

test('PHB food uses Constitution minimum one day, half-day debt and a real full-pound reset',()=>{
 assert.deepEqual(foodDeprivationAfter(0,0,6),{debtHalfDays:2,limitDays:1,exhaustionLevels:0})
 assert.equal(foodDeprivationAfter(2,1,6).exhaustionLevels,1)
 assert.equal(foodDeprivationAfter(6,0,10).exhaustionLevels,1)
 assert.equal(foodDeprivationAfter(100,2,10).debtHalfDays,0)
 assert.equal(foodDeprivationAfter(4,1,10).debtHalfDays,5)
})
test('water is eight pints normally and sixteen in actual hot weather',()=>{
 assert.equal(dailyWaterPints(false),8);assert.equal(dailyWaterPints(true),16)
})
test('one actual combat step may cross a boundary within six seconds, never a second due step or a rest',()=>{
 const record=pureRecord(),facts={combatStep:true,combatPhase:true}
 assert.equal(nutritionClockBlocked(record,86398,6,facts),false)
 assert.equal(nutritionClockBlocked(record,86404,6,facts),true)
 assert.equal(nutritionClockBlocked(record,86398,7,facts),true)
 assert.equal(nutritionClockBlocked(record,86398,6,{...facts,combatPhase:false}),true)
 assert.equal(nutritionClockBlocked(record,86398,6,{...facts,rest:true}),true)
 assert.equal(nutritionClockBlocked(record,86404,6,{...facts,dead:true}),false)
})
test('ordinary recovery needs some real food AND drink; known or unknown deprivation needs full amounts',()=>{
 assert.equal(nutritionRestEligibility(undefined).eligible,false)
 for(const provenance of ['none','known','unknown']){
  const record=pureRecord(provenance);record.recoveryIntake={foodHalfPounds:1,waterPints:1}
  assert.equal(nutritionRestEligibility(record).eligible,provenance==='none')
  record.recoveryIntake={foodHalfPounds:2,waterPints:8};assert.equal(nutritionRestEligibility(record).eligible,true)
  record.day.hotWeather=true;assert.equal(nutritionRestEligibility(record).eligible,provenance==='none')
 }
})
test('strict nutrition schemas reject unknown bypass flags, guessed initial history and unproven suspension',()=>{
 assert.equal(SurvivalBeginSchema.safeParse({...begin(),foodDebtHalfDays:undefined}).success,false)
 assert.equal(SurvivalBeginSchema.safeParse({...begin(),operation:'resume_after_death'}).success,false)
 assert.equal(SurvivalStateSchema.safeParse({...pureRecord(),freeNutrition:true}).success,false)
 assert.equal(SurvivalStateSchema.safeParse({...pureRecord(),status:'suspended'}).success,false)
 assert.equal(SurvivalStateSchema.safeParse({...pureRecord(),day:{...pureRecord().day,endsAt:42}}).success,false)
})

test('inspection does not initialize history, consume dice or infer meals; beginning cannot reset history',async t=>{
 const call=await engine(t,{dice:'17'}),before=await call('get_game_state')
 assert.equal(ok(await call('inspect_survival')).tracked,false);assert.deepEqual(await call('get_game_state'),before)
 const first=await start(call);assert.equal(first.day.foodHalfPounds,0)
 assert.equal(ok(await call('begin_nutrition_tracking',begin())).replayed,true)
 await rejectUnchanged(call,'begin_nutrition_tracking',begin({eventId:'other-start'}),'NUTRITION_ALREADY_TRACKED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})
test('one exact two-pound ration has four half-pound units; partial contents and receipts survive hydration',async t=>{
 const call=await engine(t);await start(call)
 await addSupply(call,'ration_1_day','actual-ration')
 const input={eventId:'half-pound-once',itemId:'actual-ration',units:1}
 assert.equal(ok(await call('consume_provisions',input)).remainingUnits,3)
 let state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}))
 assert.equal(ok(await call('consume_provisions',input)).replayed,true)
 assert.equal((await call('get_game_state')).dmTools.survival.day.foodHalfPounds,1)
 await rejectUnchanged(call,'consume_provisions',{eventId:'too-much',itemId:'actual-ration',units:4},'PROVISIONS_AMOUNT_UNAVAILABLE')
 ok(await call('consume_provisions',{eventId:'remaining-three',itemId:'actual-ration',units:3}))
 state=await call('get_game_state');assert.equal(state.dmTools.survival.day.foodHalfPounds,4)
 assert.ok(!state.player.inventory.some(item=>item.id==='actual-ration'))
 await rejectUnchanged(call,'consume_provisions',{eventId:'no-free-food',itemId:'missing-ration',units:1},'PROVISIONS_ITEM_REQUIRED')
})
test('a full actual waterskin contains four pints and becomes the same empty item without free refilling',async t=>{
 const call=await engine(t);await start(call)
 await intake(call,'waterskin_full','actual-water',4)
 const state=await call('get_game_state'),item=state.player.inventory.find(item=>item.id==='actual-water')
 assert.equal(item.equipmentId,'waterskin_empty');assert.equal(state.dmTools.survival.day.waterPints,4)
 await rejectUnchanged(call,'consume_provisions',{eventId:'no-refill',itemId:'actual-water',units:1},'PROVISIONS_ITEM_REQUIRED')
})
test('time reaches a due boundary but cannot skip it, eat retroactively or resolve a day twice',async t=>{
 const call=await engine(t);await start(call)
 await rejectUnchanged(call,'advance_time',{seconds:86401},'SURVIVAL_DAY_EVENT_DUE')
 await rejectUnchanged(call,'resolve_survival_day',daily(),'SURVIVAL_DAY_NOT_DUE')
 ok(await call('advance_time',{seconds:86400}))
 await addSupply(call,'ration_1_day','late-ration')
 await rejectUnchanged(call,'consume_provisions',{eventId:'late-food',itemId:'late-ration',units:2},'SURVIVAL_DAY_EVENT_DUE')
 const resolved=ok(await call('resolve_survival_day',daily()));assert.equal(resolved.exhaustionAfter,1)
 assert.equal(ok(await call('resolve_survival_day',daily())).replayed,true)
 assert.equal((await call('get_game_state')).dmTools.exhaustion.creatures.player.level,1)
})
test('half water uses one real CON15 save and existing exhaustion doubles its failed-source penalty',async t=>{
 const call=await engine(t,{dice:'1,19'});await start(call)
 await intake(call,'ration_1_day','food',2);await intake(call,'waterskin_full','water',4)
 ok(await call('add_exhaustion',{eventId:'known-tired',targetId:'player',levels:1,reason:'Épuisement déjà établi par une source distincte.'}))
 ok(await call('advance_time',{seconds:86400}))
 const result=ok(await call('resolve_survival_day',daily()))
 assert.equal(result.waterSave.ability,'con');assert.equal(result.waterSave.dc,15);assert.equal(result.waterSave.success,false)
 assert.equal(result.exhaustionAfter,3);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
 assert.deepEqual((await call('get_game_state')).dmTools.survival.recoveryIntake,{foodHalfPounds:0,waterPints:0},'inadequate earlier intake cannot satisfy recovery after the new deprivation source')
})
test('simultaneous food and water deprivation requires explicit source adjudication and preserves chosen order',async t=>{
 for(const [order,expected] of [['food_then_water',3],['water_then_food',2]]){
  const call=await engine(t),initial=await call('get_game_state'),limit=Math.max(1,3+Math.floor((initial.player.stats.con-10)/2))
  await start(call,{foodDebtHalfDays:limit*2});ok(await call('advance_time',{seconds:86400}))
  await rejectUnchanged(call,'resolve_survival_day',daily(),'SURVIVAL_SIMULTANEOUS_ORDER_REQUIRED')
  const result=ok(await call('resolve_survival_day',daily({order})))
  assert.equal(result.exhaustionAfter,expected);assert.equal(result.foodDebtHalfDays,limit*2+2)
 }
})
test('a held water save keeps its original d20 across retry and hydration, then consumes Bardic once',async t=>{
 const call=await engine(t,{dice:'8,6,19'});await start(call)
 await intake(call,'ration_1_day','food',2);await intake(call,'waterskin_full','water',4)
 await replace(call,state=>state.hero.inspiration.push({targetId:'player',expiresAt:200000,die:6}))
 ok(await call('advance_time',{seconds:86400}))
 const held=ok(await call('resolve_survival_day',daily()));assert.ok(held.pendingReaction)
 const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}))
 assert.equal(ok(await call('resolve_survival_day',daily())).pendingReaction.id,held.pendingReaction.id)
 ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}))
 const done=ok(await call('resolve_survival_day',daily()));assert.equal(done.replayed,true);assert.equal(done.waterSave.success,true)
 assert.equal(done.exhaustionAfter,0);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('successful actual long rest recovers one level using fresh food/drink and closes the intake window once',async t=>{
 const call=await engine(t);await start(call)
 ok(await call('add_exhaustion',{eventId:'ordinary-exhaustion',targetId:'player',levels:1,reason:'Une source ordinaire distincte de la privation.'}))
 await intake(call,'ration_1_day','food',1);await intake(call,'waterskin_full','water',1)
 assert.equal(ok(await call('inspect_survival')).recovery.eligible,true)
 ok(await call('take_rest',{kind:'long'}))
 assert.equal((await call('get_game_state')).dmTools.exhaustion.creatures.player.level,0)
 assert.equal(ok(await call('inspect_survival')).recovery.eligible,false)
})
test('deprivation death suspends the ledger and never freezes time or rolls another phase on the corpse',async t=>{
 const call=await engine(t,{dice:'17'});await start(call)
 await intake(call,'ration_1_day','food',2)
 ok(await call('add_exhaustion',{eventId:'near-death-exhaustion',targetId:'player',levels:5,reason:'Niveau cinq explicitement établi.'}))
 ok(await call('advance_time',{seconds:86400}));const result=ok(await call('resolve_survival_day',daily()))
 assert.equal(result.died,true);assert.equal((await call('get_game_state')).dmTools.survival.status,'suspended')
 ok(await call('advance_time',{seconds:100000}));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})
