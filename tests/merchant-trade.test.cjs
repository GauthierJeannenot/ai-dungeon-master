const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,replace,adjacent}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
async function setup(t){
 const call=await engine(t,{dice:'19'}),state=await call('get_game_state'),cell=adjacent(state)[0]
 ok(await call('create_npc',{npcId:'real-dealer',name:'Marchand établi',statBlock:'goblin',cell,disposition:'neutral',visible:true,description:'Un vrai marchand déjà présent ; aucune vente ni volonté déduite de sa disposition.'}))
 ok(await call('create_scene_object',{objectId:'real-stock-crate',name:'Caisse réelle',description:'Une caisse effectivement approvisionnée.',cell,kind:'container',material:'wood',size:'small',resilience:'resilient',contents:['poison_drow_poison']}))
 const item=ok(await call('interact_object',{objectId:'real-stock-crate',action:'open'})).releasedItems[0]
 const fact=ok(await call('record_scene_fact',{description:'Le marchand existant détient réellement cette instance et en propose la vente au prix convenu explicite.',cell})).worldFact
 const stock={eventId:'real-stock-observed',merchantId:'real-dealer',itemIds:[item.id],physicalFactId:fact.id,actualStockConfirmed:true}
 ok(await call('record_merchant_stock',stock))
 const offer={offerId:'real-agreed-offer',merchantId:'real-dealer',itemIds:[item.id],priceCp:20000,agreementFactId:fact.id,actualAgreementConfirmed:true}
 ok(await call('create_trade_offer',offer))
 let loadout=await call('get_game_state');if(!loadout.dmTools?.loadout){const held=loadout.player.inventory.find(i=>i.type==='weapon');if(held)ok(await call('equip_item',{itemId:held.id,operation:'unequip',slot:'main_hand'}));loadout=await call('get_game_state')}
 for(const[key,slot]of [['mainHandId','main_hand'],['offHandId','off_hand'],['shieldId','shield']])if(loadout.dmTools?.loadout?.[key]){ok(await call('equip_item',{itemId:loadout.dmTools.loadout[key],operation:'unequip',slot}));loadout=await call('get_game_state')}
 return{call,item,cell,fact,stock,offer,purchase:{eventId:'real-purchase',offerId:offer.offerId,paid:{gp:200},workSeconds:6,activitySource:'Échange physique réel de ces instances et dénominations ; durée explicitement établie par le MJ.'}}
}
async function refuse(call,name,input,code){const before=await call('get_game_state'),result=await call(name,input);assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await call('get_game_state'),before)}
test('a real offered poison instance transfers once against exact chosen coins, retains seller earnings and survives SQL',async t=>{
 const{call,item,purchase}=await setup(t),before=await call('get_game_state');assert.equal(before.droppedItems[item.id],undefined);assert.equal(before.player.inventory.some(i=>i.id===item.id),false)
 const answer=ok(await call('purchase_trade_offer',purchase));assert.deepEqual(answer.purchasedItemIds,[item.id]);assert.equal(answer.items[0].equipmentId,'poison_drow_poison')
 const after=await call('get_game_state');assert.equal(after.player.inventory.filter(i=>i.id===item.id).length,1);assert.equal(after.dmTools.wallet.gp,before.dmTools.wallet.gp-200);assert.equal(after.dmTools.merchants.earnedCoins['real-dealer'].gp,200);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+6)
 const id=`merchant-real-purchase-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:after,history:[],adventureId:after.adventureId,characterId:after.characterId});ok(await call('replace_game_state',{gameState:(await loadSession(id)).gameState}))
 const restored=await call('get_game_state');assert.equal(ok(await call('purchase_trade_offer',purchase)).replayed,true);assert.deepEqual(await call('get_game_state'),restored)
 await refuse(call,'purchase_trade_offer',{...purchase,eventId:'second-purchase'},'TRADE_OFFER_ALREADY_PURCHASED');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('no real merchant or stock, wrong payment and insufficient coins cannot create or acquire an item',async t=>{
 const{call,stock,purchase}=await setup(t)
 await refuse(call,'record_merchant_stock',{...stock,eventId:'missing-seller',merchantId:'invented-dealer'},'TRADE_REAL_MERCHANT_REQUIRED')
 await refuse(call,'record_merchant_stock',{...stock,eventId:'missing-stock',itemIds:['invented-dose']},'TRADE_EXISTING_STOCK_REQUIRED')
 await refuse(call,'purchase_trade_offer',{...purchase,paid:{gp:199}},'TRADE_EXACT_PAYMENT_REQUIRED')
 await replace(call,s=>s.dmTools.wallet.gp=199);await refuse(call,'purchase_trade_offer',purchase,'INSUFFICIENT_COINS');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('tracked carrying rejects unknown poison mass before money or time, then uses only its explicit actual measurement',async t=>{
 const{call,item,cell,purchase}=await setup(t);await replace(call,s=>{s.player.inventory=[];s.dmTools.loadout={unarmoredAC:10+Math.floor((s.player.stats.dex-10)/2)}})
 ok(await call('set_carrying_context',{eventId:'real-size',entityId:'player',size:'Medium',reason:'Taille physique réelle.',source:'Observation actuelle.'}))
 await refuse(call,'purchase_trade_offer',purchase,'CARRYING_DATA_REQUIRED')
 const fact=ok(await call('record_scene_fact',{description:'Cette dose entière réellement proposée a été pesée : 0,2 livre avec son vrai récipient.',cell})).worldFact
 ok(await call('purchase_trade_offer',{...purchase,itemWeights:[{itemId:item.id,weightLb:.2,physicalFactId:fact.id}]}))
 const capacity=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(capacity.status,'resolved');assert.equal(capacity.items.find(i=>i.itemId===item.id).weightLb,.2)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a genuinely incapable or unseen seller cannot be replaced by stock inspection or payment',async t=>{
 const{call,purchase}=await setup(t);await replace(call,s=>s.npcs['real-dealer'].visible=false)
 await refuse(call,'purchase_trade_offer',purchase,'TRADE_MERCHANT_UNSEEN');await replace(call,s=>{s.npcs['real-dealer'].visible=true;s.npcs['real-dealer'].conditions=['incapacitated']})
 await refuse(call,'purchase_trade_offer',purchase,'TRADE_REAL_MERCHANT_REQUIRED');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('real merchant ingredients and an actual paid kit feed the crafting project without a second currency-only creation',async t=>{
 const{call,cell}=await setup(t);ok(await call('create_scene_object',{objectId:'real-ingredient-stock',name:'Fournitures présentes',description:'Un vrai kit et un lot de matières réellement approvisionnés, sans création depuis un débit.',cell,kind:'container',material:'wood',size:'small',resilience:'resilient',contents:['poisoners_kit','raw_crafting_materials']}))
 const items=ok(await call('interact_object',{objectId:'real-ingredient-stock',action:'open'})).releasedItems,observed=ok(await call('record_scene_fact',{description:'Ces deux vrais lots appartiennent au marchand ; le kit vaut50gp, les ingrédients adaptés au poison courant valent50gp, et la vente totale est effectivement convenue100gp.',cell})).worldFact
 ok(await call('record_merchant_stock',{eventId:'actual-material-stock',merchantId:'real-dealer',itemIds:items.map(i=>i.id),physicalFactId:observed.id,actualStockConfirmed:true}));ok(await call('create_trade_offer',{offerId:'actual-material-offer',merchantId:'real-dealer',itemIds:items.map(i=>i.id),priceCp:10000,agreementFactId:observed.id,actualAgreementConfirmed:true}))
 const before=await call('get_game_state');ok(await call('purchase_trade_offer',{eventId:'actual-material-purchase',offerId:'actual-material-offer',paid:{gp:100},workSeconds:6,activitySource:'Échange réellement convenu de ces fournitures présentes.'}))
 await replace(call,s=>s.player.toolProficiencies=['poisoners_kit']);const state=await call('get_game_state'),tool=items.find(i=>i.equipmentId==='poisoners_kit'),raw=items.find(i=>i.equipmentId==='raw_crafting_materials'),fact=ok(await call('record_scene_fact',{description:'Le kit réellement acheté convient au poison courant et ces matières réelles adaptées, récipient compris, valent50gp au total.',cell:state.player.position})).worldFact
 ok(await call('start_ordinary_crafting',{eventId:'paid-ingredients-craft-start',projectId:'paid-ingredients-project',equipmentId:'basic_poison_vial',outputItemIds:['actual-future-poison'],toolItemId:tool.id,toolRelationFactId:fact.id,actualRelatedToolConfirmed:true,materials:[{itemId:raw.id,valueCp:5000,physicalFactId:fact.id}],actualIngredientsConfirmed:true}))
 ok(await call('work_ordinary_crafting',{eventId:'paid-ingredients-work',projectId:'paid-ingredients-project',seconds:28800,restActivity:'strenuous',activitySource:'Huit heures réelles sur ce lot réellement acheté.'}));ok(await call('complete_ordinary_crafting_day',{eventId:'paid-ingredients-progress',projectId:'paid-ingredients-project',materialUses:[{itemId:raw.id,valueCp:250}]}))
 const after=await call('get_game_state');assert.equal(after.dmTools.wallet.gp,before.dmTools.wallet.gp-100);assert.equal(after.dmTools.ordinaryCrafting.projects['paid-ingredients-project'].progressCp,500);assert.equal(after.droppedItems['actual-future-poison'],undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('ordinary stock custody cannot hide a real active flame or silently implement magic-item trading',async t=>{
 const{call,cell,fact}=await setup(t)
 ok(await call('create_scene_object',{objectId:'real-torch-stock',name:'Torche existante',description:'Une vraie torche encore indépendante du stock marchand.',cell,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['torch']}))
 const torch=ok(await call('interact_object',{objectId:'real-torch-stock',action:'open'})).releasedItems[0];ok(await call('manage_light_source',{itemId:torch.id,operation:'light'}))
 await refuse(call,'record_merchant_stock',{eventId:'lit-stock-transfer',merchantId:'real-dealer',itemIds:[torch.id],physicalFactId:fact.id,actualStockConfirmed:true},'TRADE_ACTIVE_PHYSICAL_SOURCE_UNSUPPORTED')
 ok(await call('create_spell_scroll',{itemId:'actual-magic-scroll-stock',spellId:'magic-missile',name:'Parchemin réel',description:'Un vrai parchemin déjà inscrit.',cell}))
 await refuse(call,'record_merchant_stock',{eventId:'magic-stock-transfer',merchantId:'real-dealer',itemIds:['actual-magic-scroll-stock'],physicalFactId:fact.id,actualStockConfirmed:true},'TRADE_MAGIC_ITEM_PROCEDURE_REQUIRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
