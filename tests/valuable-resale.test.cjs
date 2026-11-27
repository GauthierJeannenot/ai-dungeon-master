const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const{setupValuable}=require('./helpers/valuable-resale-fixture.cjs')
const{ok,replace}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}
async function persist(t,f,key){const state=await f.call('get_game_state'),id=`valuable-resale-${key}-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});ok(await f.call('replace_game_state',{gameState:(await loadSession(id)).gameState}));return f.call('get_game_state')}
for(const kind of ['gem','art'])test(`actual registered ${kind} sells at its true full source value from an actually collected hoard, preserving original source and SQL`,async t=>{
 const f=await setupValuable(t,{kind}),v=f.values[0];ok(await f.call('declare_physical_weight',{eventId:'actual-registered-valuable-mass',targetKind:'item',targetId:v.id,weightLb:0.1,unit:'lb_per_inventory_unit',reason:'Cet exemplaire réel a été pesé.',source:'Mesure physique actuelle, aucune masse déduite du prix, de la pureté ou de la table de valeur.'}));const before=await f.call('get_game_state'),original=structuredClone(before.player.inventory.find(i=>i.id===v.id)),source=structuredClone(before.dmTools.valuables[v.id]),hoard=structuredClone(before.dmTools.hoards[v.hoardId])
 if(kind==='art')assert.equal(v.name,'Gold ring set with bloodstones','this actual jewelry identity is already structurally art; no display-name classification selects its rule')
 const offer=ok(await f.call('create_valuable_resale_offer',f.valuableOffer));assert.equal(offer.priceCp,v.valueGp*100);await persist(t,f,`${kind}-accepted`)
 const sale=ok(await f.call('sell_to_merchant',f.valuableSale));assert.equal(sale.valuation,'registered_valuable_full');assert.equal(sale.received.gp,v.valueGp);const after=await persist(t,f,`${kind}-sold`)
 assert.equal(after.dmTools.wallet.gp,before.dmTools.wallet.gp+v.valueGp);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+6);assert.equal(after.player.inventory.some(i=>i.id===v.id),false);assert.equal(after.droppedItems[v.id],undefined);assert.deepEqual(after.dmTools.merchantResales.custody[v.id].item,original);assert.deepEqual(after.dmTools.merchantResales.custody[v.id].valuableProvenance.record,source);assert.deepEqual(after.dmTools.valuables[v.id],source);assert.deepEqual(after.dmTools.hoards[v.hoardId],hoard);assert.deepEqual(after.dmTools.carrying.weights,before.dmTools.carrying.weights)
 await refused(f.call,'inspect_valuables',{itemId:v.id},'VALUABLE_NOT_OWNED');const saved=await f.call('get_game_state');assert.equal(ok(await f.call('sell_to_merchant',f.valuableSale)).replayed,true);assert.deepEqual(await f.call('get_game_state'),saved);assert.equal(ok(await f.call('collect_treasure_hoard',{hoardId:v.hoardId})).alreadyCollected,true);assert.deepEqual(await f.call('get_game_state'),saved);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('two genuinely distinct existing gems retain the sum of their full values, never multiplied quantity or half equipment price',async t=>{
 const f=await setupValuable(t,{count:2});await refused(f.call,'create_valuable_resale_offer',{...f.valuableOffer,priceCp:f.valuableOffer.priceCp/2},'VALUABLE_RESALE_FULL_VALUE_REQUIRED');await refused(f.call,'create_valuable_resale_offer',{...f.valuableOffer,valuables:[f.valuableOffer.valuables[0],f.valuableOffer.valuables[0]]},'RESALE_DUPLICATE_INSTANCE');ok(await f.call('create_valuable_resale_offer',f.valuableOffer));ok(await f.call('sell_to_merchant',f.valuableSale));const state=await persist(t,f,'two-real-gems');assert.equal(Object.keys(state.dmTools.merchantResales.custody).length,2);assert.equal(state.dmTools.merchantResales.sales[f.valuableSale.eventId].input.received.gp,20);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a registered but uncollected source is not owned and cannot fund a full-value sale or become a new physical gem',async t=>{
 const f=await setupValuable(t,{fund:false,collect:false});await refused(f.call,'create_valuable_resale_offer',f.valuableOffer,'RESALE_OWNED_INSTANCE_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('structured source kind, canonical identity/hash and existing true value are required; names never classify a handaxe as a gem',async t=>{
 const f=await setupValuable(t,{fund:false});await refused(f.call,'create_valuable_resale_offer',{...f.valuableOffer,valuables:[{...f.valuableOffer.valuables[0],registeredKind:'art'}]},'VALUABLE_RESALE_KIND_MISMATCH')
 await replace(f.call,s=>s.player.inventory.find(i=>i.id===f.item.id).name='Diamant pur de grande valeur')
 await refused(f.call,'create_valuable_resale_offer',{...f.valuableOffer,valuables:[{...f.valuableOffer.valuables[0],itemId:f.item.id}]},'VALUABLE_RESALE_PROVENANCE_REQUIRED')
 const original=await f.call('get_game_state');await replace(f.call,s=>s.dmTools.valuables[f.values[0].id].source.sha256='0'.repeat(64));await refused(f.call,'create_valuable_resale_offer',f.valuableOffer,'VALUABLE_RESALE_PROVENANCE_REQUIRED');ok(await f.call('replace_game_state',{gameState:original}));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an accepted valuable retains full-source provenance through hydration; changed value or forged source cannot rewrite its price or payout',async t=>{
 const f=await setupValuable(t);ok(await f.call('create_valuable_resale_offer',f.valuableOffer));const before=await persist(t,f,'true-full-value')
 const valueChanged=structuredClone(before);valueChanged.dmTools.valuables[f.values[0].id].valueGp=50;await refused(f.call,'replace_game_state',{gameState:valueChanged},'MERCHANT_RESALE_STATE_MISMATCH')
 const sourceChanged=structuredClone(before);sourceChanged.dmTools.valuables[f.values[0].id].source.sha256='0'.repeat(64);sourceChanged.dmTools.merchantResales.offers[f.valuableOffer.offerId].valuableProvenance[0].record.source.sha256='0'.repeat(64);await refused(f.call,'replace_game_state',{gameState:sourceChanged},'VALUABLE_RESALE_SOURCE_MISMATCH');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('real contact poison on a registered gem remains nontransferable without deleting dose, preparation or value provenance',async t=>{
 const f=await setupValuable(t),state=await f.call('get_game_state');ok(await f.call('create_scene_object',{objectId:'actual-gem-contact-dose',name:'Dose actuelle',description:'Une vraie dose de poison de contact présente.',cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['poison_oil_of_taggit']}));const dose=ok(await f.call('interact_object',{objectId:'actual-gem-contact-dose',action:'open'})).releasedItems[0];ok(await f.call('pick_up_item',{itemId:dose.id}));const fact=ok(await f.call('record_scene_fact',{description:'La surface actuelle de cette même vraie gemme est physiquement accessible pour l’enduction réellement choisie.',cell:state.player.position})).worldFact
 ok(await f.call('prepare_player_poison',{eventId:'actual-gem-contact-preparation',doseItemId:dose.id,surfaceKind:'item',surfaceId:f.values[0].id,physicalFactId:fact.id,surfaceDescription:'Cette dose entière est réellement appliquée à cette surface choisie, sans exposition de quiconque.'}));await refused(f.call,'create_valuable_resale_offer',f.valuableOffer,'RESALE_ASSOCIATED_STATE_UNSUPPORTED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('full-value sale still requires actual merchant coins in the selected denomination and never manufactures an initial purse',async t=>{
 const f=await setupValuable(t,{fund:false});ok(await f.call('create_valuable_resale_offer',f.valuableOffer));await refused(f.call,'sell_to_merchant',f.valuableSale,'INSUFFICIENT_COINS');const after=await f.call('get_game_state');assert.equal(after.dmTools.merchantResales.custody[f.values[0].id],undefined);assert.equal(after.dmTools.merchants,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('full-value gem and ordinary half-price shield spend the same real finite merchant ledger without resetting earlier payouts',async t=>{
 const f=await setupValuable(t);ok(await f.call('create_valuable_resale_offer',f.valuableOffer));ok(await f.call('sell_to_merchant',f.valuableSale));ok(await f.call('equip_item',{itemId:'shield',operation:'unequip',slot:'shield'}))
 const fact=ok(await f.call('record_scene_fact',{description:'Ce véritable bouclier ordinaire du joueur est intact ; le même marchand accepte son demi-prix source5gp.',cell:f.cell})).worldFact
 const input={offerId:'actual-ordinary-shield-after-gem',merchantId:f.valuableOffer.merchantId,itemConditions:[{itemId:'shield',physicalFactId:fact.id,actualUndamagedConfirmed:true}],priceCp:500,agreementFactId:fact.id,actualMerchantAcceptanceConfirmed:true}
 ok(await f.call('create_resale_offer',input));ok(await f.call('sell_to_merchant',{eventId:'actual-shield-sale-after-gem',offerId:input.offerId,received:{gp:5},workSeconds:6,activitySource:'Échange physique réel, payé sur les mêmes recettes nettes.'}));const state=await persist(t,f,'mixed-valuations');assert.equal(Object.keys(state.dmTools.merchantResales.sales).length,2);assert.equal(state.dmTools.merchants.earnedCoins[f.valuableOffer.merchantId].gp,15);assert.deepEqual(ok(await f.call('inspect_merchant_resales',{merchantId:f.valuableOffer.merchantId})).availableCoins,{cp:0,sp:0,ep:0,gp:0,pp:0});assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual stdio exposes the exact full-value qualification and source-support domain without creating or revaluing a valuable',async t=>{
 const f=await setupValuable(t,{fund:false}),before=await f.call('get_game_state'),tools=(await f.call.client.listTools()).tools
 assert.ok(tools.some(t=>t.name==='create_valuable_resale_offer'));assert.ok(tools.find(t=>t.name==='get_rules_support').inputSchema.properties.domain.enum.includes('valuable_resale'))
 const support=ok(await f.call('get_rules_support',{domain:'valuable_resale'}));assert.ok(support.tools.includes('create_valuable_resale_offer'));assert.match(support.source.join(' '),/3913/);assert.match(support.limitations.join(' '),/No new valuable, appraisal roll/);assert.deepEqual(await f.call('get_game_state'),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
