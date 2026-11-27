const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const{setupGoods}=require('./helpers/trade-goods-fixture.cjs')
const{ok,replace,adjacent}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}
async function sql(t,f,key){const state=await f.call('get_game_state'),id=`trade-goods-${key}-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});ok(await f.call('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.deepEqual(await f.call('get_game_state'),state);return state}
test('the 17 explicit nonliving PHB references keep exact prices and units, without livestock or inferred cloth weight',()=>{
 const{TRADE_GOODS:g}=require('../mcp-server/dist/lib/srd/trade-goods.js')
 assert.deepEqual(Object.fromEntries(Object.entries(g).map(([id,s])=>[id,s.priceCp])),{wheat:1,flour:2,salt:5,iron:10,canvas:10,copper:50,cotton:50,ginger:100,cinnamon:200,pepper:200,cloves:300,silver:500,linen:500,silk:1000,saffron:1500,gold:5000,platinum:50000})
 assert.equal(Object.values(g).filter(s=>s.unit==='lb').length,13);assert.equal(Object.values(g).filter(s=>s.unit==='square_yard').length,4);assert.ok(Object.values(g).every(s=>!('weightLb'in s)))
})
test('a genuine qualified lot buys at full source units, then sells whole at the same full value using only those real merchant coins, SQL and exact replay',async t=>{
 const f=await setupGoods(t),before=await sql(t,f,'purchased'),original=structuredClone(before.dmTools.tradeGoods.lots[f.goodsItem.id])
 assert.equal(f.priceCp,150);assert.equal(before.dmTools.merchants.earnedCoins[f.offer.merchantId].sp,15)
 ok(await f.call('create_trade_good_resale_offer',f.resaleOffer));await sql(t,f,'accepted')
 const result=ok(await f.call('sell_to_merchant',f.resale));assert.equal(result.valuation,'trade_goods_full');assert.equal(result.priceCp,150)
 const after=await sql(t,f,'sold');assert.deepEqual(after.dmTools.tradeGoods.lots[f.goodsItem.id],original);assert.deepEqual(after.dmTools.merchantResales.custody[f.goodsItem.id].tradeGoodProvenance,original);assert.deepEqual(after.dmTools.merchantResales.custody[f.goodsItem.id].item,f.goodsItem);assert.equal(after.player.inventory.some(i=>i.id===f.goodsItem.id),false);assert.equal(after.dmTools.merchants.stocks[f.goodsItem.id].status,'sold');assert.equal(after.worldTimeSeconds-before.worldTimeSeconds,6)
 assert.deepEqual(ok(await f.call('inspect_merchant_resales',{merchantId:f.offer.merchantId})).availableCoins,{cp:0,sp:0,ep:0,gp:0,pp:0})
 assert.equal(ok(await f.call('sell_to_merchant',f.resale)).replayed,true);assert.deepEqual(await f.call('get_game_state'),after)
 await refused(f.call,'sell_to_merchant',{...f.resale,eventId:'no-second-payout'},'RESALE_ALREADY_SOLD');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('qualification neither creates nor acquires a lot and cannot relabel, resize or qualify nonexistent goods from their name',async t=>{
 const f=await setupGoods(t,{buy:false}),before=await f.call('get_game_state')
 assert.ok(before.droppedItems[f.goodsItem.id]);assert.ok(!before.player.inventory.some(i=>i.id===f.goodsItem.id));assert.equal(before.dmTools.tradeGoods.lots[f.goodsItem.id].input.sourceUnits,3)
 assert.equal(ok(await f.call('record_trade_good',f.qualification)).replayed,true);assert.deepEqual(await f.call('get_game_state'),before)
 await refused(f.call,'record_trade_good',{...f.qualification,sourceUnits:4},'TRADE_GOOD_IDENTITY_IMMUTABLE');await refused(f.call,'record_trade_good',{...f.qualification,commodityId:'gold'},'TRADE_GOOD_IDENTITY_IMMUTABLE');await refused(f.call,'record_trade_good',{...f.qualification,eventId:'no-narrated-lot-event',itemId:'a-narrated-gold-lot'},'TRADE_GOOD_EXISTING_LOT_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('source full price is required before stock purchase and resale; no invented merchant purse or denomination change',async t=>{
 const f=await setupGoods(t,{buy:false});ok(await f.call('record_merchant_stock',f.stock))
 await refused(f.call,'create_trade_offer',{...f.purchaseOffer,priceCp:75},'TRADE_GOOD_FULL_VALUE_REQUIRED');ok(await f.call('create_trade_offer',f.purchaseOffer));await refused(f.call,'purchase_trade_offer',{...f.purchase,paid:{gp:2}},'TRADE_EXACT_PAYMENT_REQUIRED');ok(await f.call('purchase_trade_offer',f.purchase))
 await refused(f.call,'create_trade_good_resale_offer',{...f.resaleOffer,priceCp:75},'TRADE_GOOD_FULL_VALUE_REQUIRED');ok(await f.call('create_trade_good_resale_offer',f.resaleOffer));await refused(f.call,'sell_to_merchant',{...f.resale,received:{cp:150}},'INSUFFICIENT_COINS');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('SQL rejects altered whole-lot source quantity, classification, value procedure and provenance snapshots',async t=>{
 const f=await setupGoods(t);ok(await f.call('create_trade_good_resale_offer',f.resaleOffer));const before=await sql(t,f,'unaltered')
 for(const mutate of [s=>s.dmTools.tradeGoods.lots[f.goodsItem.id].input.sourceUnits=4,s=>s.dmTools.tradeGoods.lots[f.goodsItem.id].input.commodityId='gold',s=>s.dmTools.tradeGoods.lots[f.goodsItem.id].source.sha256='bad',s=>s.dmTools.merchantResales.offers[f.resaleOffer.offerId].valuation='registered_valuable_full']){
  const altered=structuredClone(before);mutate(altered);const answer=await f.call('replace_game_state',{gameState:altered});assert.ok(answer.error,JSON.stringify(answer));assert.deepEqual(await f.call('get_game_state'),before)
 }
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the first qualification alone retains its exact original command through SQL before any stock or offer can cross-check it',async t=>{
 const f=await setupGoods(t,{buy:false}),before=await sql(t,f,'qualification-only'),record=before.dmTools.tradeGoods.lots[f.goodsItem.id]
 assert.equal(Object.keys(before.dmTools.merchants?.stocks??{}).length,0);assert.equal(Object.keys(before.dmTools.merchantResales?.offers??{}).length,0)
 const{groundGearPhysicalWitness:witness}=require('../mcp-server/dist/lib/ground-gear-recovery-state.js')
 assert.equal(record.command,witness({operation:'record_trade_good',input:record.input}))
 const reordered=structuredClone(before);reordered.dmTools.tradeGoods.lots[f.goodsItem.id].input=Object.fromEntries(Object.entries(record.input).reverse())
 assert.deepEqual(require('../mcp-server/dist/lib/trade-goods-state.js').validateTradeGoodsState(reordered),[],'JSONB key order does not change the original structured qualification')
 const reorderedId=`trade-goods-reordered-${process.pid}`;t.after(()=>deleteSession(reorderedId));await saveSession(reorderedId,{gameState:reordered,history:[],adventureId:before.adventureId,characterId:before.characterId});ok(await f.call('replace_game_state',{gameState:(await loadSession(reorderedId)).gameState}));assert.deepEqual(await f.call('get_game_state'),before)

 for(const[field,value]of [['sourceUnits',4],['commodityId','gold']]){
  const altered=structuredClone(before);altered.dmTools.tradeGoods.lots[f.goodsItem.id].input[field]=value
  const id=`trade-goods-preoffer-invalid-${field}-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:altered,history:[],adventureId:before.adventureId,characterId:before.characterId})
  const answer=await f.call('replace_game_state',{gameState:(await loadSession(id)).gameState});assert.equal(answer.code,'TRADE_GOODS_STATE_MISMATCH',JSON.stringify(answer));assert.deepEqual(await f.call('get_game_state'),before)
 }
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual cloth has source area and full value but keeps unknown mass until a genuine measurement, never area-price derived weight',async t=>{
 const f=await setupGoods(t,{commodityId:'canvas',sourceUnits:2}),before=await f.call('get_game_state');assert.equal(f.priceCp,20)
 assert.ok(!Object.values(before.dmTools.carrying?.weights??{}).some(w=>w.targetId===f.goodsItem.id));ok(await f.call('create_trade_good_resale_offer',f.resaleOffer));ok(await f.call('sell_to_merchant',f.resale));const after=await sql(t,f,'cloth');assert.deepEqual(after.dmTools.carrying,before.dmTools.carrying);assert.deepEqual(after.dmTools.merchantResales.custody[f.goodsItem.id].tradeGoodProvenance.input.sourceUnits,2)
})
test('actual altered lot quantity cannot be silently split, topped up or replaced at handoff',async t=>{
 const f=await setupGoods(t);ok(await f.call('create_trade_good_resale_offer',f.resaleOffer));await replace(f.call,s=>{s.player.inventory.find(i=>i.id===f.goodsItem.id).quantity=2})
 await refused(f.call,'sell_to_merchant',f.resale,'TRADE_GOOD_PROVENANCE_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a genuine contact poison added after acceptance refuses the lot handoff without deleting source, dose, funds or clocks',async t=>{
 const f=await setupGoods(t);ok(await f.call('create_trade_good_resale_offer',f.resaleOffer));const state=await f.call('get_game_state')
 ok(await f.call('create_scene_object',{objectId:'actual-goods-poison-dose',name:'Dose actuelle',description:'Une vraie dose source présente et distincte du lot.',cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['poison_oil_of_taggit']}));const dose=ok(await f.call('interact_object',{objectId:'actual-goods-poison-dose',action:'open'})).releasedItems[0];ok(await f.call('pick_up_item',{itemId:dose.id}))
 const fact=ok(await f.call('record_scene_fact',{description:'La surface de ce même lot réel est accessible pour cette enduction réelle explicitement choisie.',cell:state.player.position})).worldFact
 ok(await f.call('prepare_player_poison',{eventId:'actual-goods-poison-preparation',doseItemId:dose.id,surfaceKind:'item',surfaceId:f.goodsItem.id,physicalFactId:fact.id,surfaceDescription:'La dose entière est réellement appliquée à cette surface, sans exposition inventée.'}))
 await refused(f.call,'sell_to_merchant',f.resale,'TRADE_GOOD_ASSOCIATED_STATE_UNSUPPORTED');await sql(t,f,'coated');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real partly consumed ration cannot be relabeled as source wheat or regain its already eaten portion',async t=>{
 const f=await setupGoods(t,{buy:false}),state=await f.call('get_game_state')
 ok(await f.call('create_scene_object',{objectId:'actual-partial-ration',name:'Ration présente',description:'Une ration réelle distincte des marchandises.',cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['ration_1_day']}));const ration=ok(await f.call('interact_object',{objectId:'actual-partial-ration',action:'open'})).releasedItems[0];ok(await f.call('pick_up_item',{itemId:ration.id}));ok(await f.call('begin_nutrition_tracking',{eventId:'actual-nutrition-known',operation:'begin',standardNeedsConfirmed:true,hotWeather:false,source:'Besoins standards PHB et vrai historique alimentaire établis.',foodDebtHalfDays:0,priorDeprivation:'none'}));ok(await f.call('consume_provisions',{eventId:'actual-eaten-half-pound',itemId:ration.id,units:1}))
 const fact=ok(await f.call('record_scene_fact',{description:'Cette vraie ration a déjà été partiellement consommée ; aucune portion historique ne revient par qualification commerciale.',cell:state.player.position})).worldFact
 await refused(f.call,'record_trade_good',{...f.qualification,eventId:'no-nutrition-reset',itemId:ration.id,commodityId:'wheat',sourceUnits:2,physicalFactId:fact.id},'TRADE_GOOD_SIMPLE_WHOLE_LOT_REQUIRED')
 assert.equal((await f.call('get_game_state')).dmTools.survival.provisions[ration.id].remainingUnits,3);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('stdio support exposes trade-goods source limits read-only and never gives stock or permission',async t=>{
 const f=await setupGoods(t,{buy:false}),before=await f.call('get_game_state'),support=ok(await f.call('get_rules_support',{domain:'trade_goods'}))
 assert.ok(support.tools.includes('record_trade_good'));assert.match(support.source.join(' '),/3915/);assert.match(support.limitations.join(' '),/No goods, mass, price/);assert.deepEqual(await f.call('get_game_state'),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('owned qualified goods cannot manufacture an initial merchant purse',async t=>{
 const f=await setupGoods(t),state=await f.call('get_game_state'),first=state.npcs[f.offer.merchantId],cell=adjacent(state).find(c=>c.x!==first.position.x||c.y!==first.position.y);assert.ok(cell)
 ok(await f.call('create_npc',{npcId:'actual-unfunded-second-buyer',name:'Autre acheteur actuel',statBlock:'goblin',cell,disposition:'neutral',visible:true,description:'Un autre vrai marchand, sans achat du joueur ni réserve fictive.'}))
 const fact=ok(await f.call('record_scene_fact',{description:'Ce second marchand accepte réellement cet exemplaire entier inchangé à sa pleine valeur source ; son accord ne fabrique aucune pièce.',cell})).worldFact
 const offer={...f.resaleOffer,merchantId:'actual-unfunded-second-buyer',agreementFactId:fact.id,tradeGoods:[{...f.resaleOffer.tradeGoods[0],physicalFactId:fact.id}]}
 ok(await f.call('create_trade_good_resale_offer',offer));await refused(f.call,'sell_to_merchant',f.resale,'INSUFFICIENT_COINS');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a genuine accepted whole-lot offer refuses unresolved merchant height before any actual payout or clock',async t=>{
 const f=await setupGoods(t);ok(await f.call('create_trade_good_resale_offer',f.resaleOffer));const state=await f.call('get_game_state'),npc=state.npcs[f.offer.merchantId]
 ok(await f.call('record_vertical_surface',{eventId:'actual-goods-merchant-gap',surfaceId:'actual-goods-gap',mapId:state.currentMapId,roomId:npc.roomId,cells:[npc.position],kind:'gap',elevationFeet:0,actualGeometryConfirmed:true,source:'Cette vraie colonne marchand est un vide observé ; sa hauteur de corps reste inconnue, aucune remise n’est prouvée par XY.'}))
 await refused(f.call,'sell_to_merchant',f.resale,'PHYSICAL_HEIGHT_POINT_GEOMETRY_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
for(const described of [false,true])test(`a real pickup ${described?'with':'without'} description preserves its exact harmless history through qualification, full-value sale and SQL`,async t=>{
 const f=await setupGoods(t,{buy:false,qualify:false,initialFunding:true}),beforePickup=await f.call('get_game_state')
 ok(await f.call('pick_up_item',{itemId:f.goodsItem.id,...described?{description:'Le vrai lot entier est repris sans changer sa matière ou ses quantités.'}:{}}));const picked=await f.call('get_game_state'),history=picked.worldFacts.find(fact=>fact.subjectItemId===f.goodsItem.id&&fact.source==='pick_up_item');assert.ok(history)
 const{isTradeGoodPickupHistory}=require('../mcp-server/dist/lib/trade-goods-state.js');assert.equal(isTradeGoodPickupHistory(history,f.goodsItem.id),true)
 for(const foreign of [{...history,source:'record_scene_fact'},{...history,waterEffect:{description:'Une réelle autre relation physique.',cell:picked.player.position}},{...history,clueId:'actual-other-meaning'},{...history,foreignActiveProperty:true}])assert.equal(isTradeGoodPickupHistory(foreign,f.goodsItem.id),false)
 const fact=ok(await f.call('record_scene_fact',{description:'Le même lot réellement ramassé a son identité, ses unités source et son état entier inchangé physiquement observés ici.',cell:picked.player.position})).worldFact
 ok(await f.call('record_trade_good',{...f.qualification,physicalFactId:fact.id}));await sql(t,f,`picked-qualified-${described}`);ok(await f.call('create_trade_good_resale_offer',f.resaleOffer));ok(await f.call('sell_to_merchant',{...f.resale,received:{gp:1,sp:5}}));const after=await sql(t,f,`picked-sold-${described}`)
 assert.deepEqual(after.worldFacts.find(fact=>fact.id===history.id),history);assert.deepEqual(after.dmTools.merchantResales.custody[f.goodsItem.id].item,f.goodsItem);assert.equal(after.dmTools.wallet.gp,beforePickup.dmTools.wallet.gp+1);assert.equal(after.dmTools.wallet.sp,beforePickup.dmTools.wallet.sp+5);assert.equal(after.worldTimeSeconds,beforePickup.worldTimeSeconds+6);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('recognizing real pickup history never exempts an actual poison added to that same qualified lot',async t=>{
 const f=await setupGoods(t,{buy:false,qualify:false,initialFunding:true});ok(await f.call('pick_up_item',{itemId:f.goodsItem.id}));const state=await f.call('get_game_state'),history=state.worldFacts.find(fact=>fact.subjectItemId===f.goodsItem.id&&fact.source==='pick_up_item')
 const fact=ok(await f.call('record_scene_fact',{description:'Le même lot est physiquement observé intact avant cette enduction explicitement choisie.',cell:state.player.position})).worldFact;ok(await f.call('record_trade_good',{...f.qualification,physicalFactId:fact.id}));ok(await f.call('create_trade_good_resale_offer',f.resaleOffer))
 ok(await f.call('create_scene_object',{objectId:'actual-picked-lot-dose',name:'Dose présente',description:'Une vraie dose source indépendante.',cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['poison_oil_of_taggit']}));const dose=ok(await f.call('interact_object',{objectId:'actual-picked-lot-dose',action:'open'})).releasedItems[0];ok(await f.call('pick_up_item',{itemId:dose.id}));ok(await f.call('prepare_player_poison',{eventId:'actual-picked-lot-coating',doseItemId:dose.id,surfaceKind:'item',surfaceId:f.goodsItem.id,physicalFactId:fact.id,surfaceDescription:'La dose entière réelle est appliquée à ce même lot, sans contact d’un corps.'}))
 await refused(f.call,'sell_to_merchant',{...f.resale,received:{gp:1,sp:5}},'TRADE_GOOD_ASSOCIATED_STATE_UNSUPPORTED');const after=await sql(t,f,'picked-poison-refusal');assert.deepEqual(after.worldFacts.find(fact=>fact.id===history.id),history);assert.equal(after.dmTools.playerPoisons.preparations['actual-picked-lot-coating'].status,'active');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
