const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const{engine,ok,replace,adjacent}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}
const{setup}=require('./helpers/merchant-resale-fixture.cjs')
async function persist(t,f,key){const state=await f.call('get_game_state'),id=`resale-${key}-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});ok(await f.call('replace_game_state',{gameState:(await loadSession(id)).gameState}));return f.call('get_game_state')}

test('real funded merchant pays actual chosen denominations once for the same undamaged source-priced item, preserving SQL and purchase tombstones',async t=>{
 const f=await setup(t);ok(await f.call('create_resale_offer',f.offer));const before=await persist(t,f,'open-offer'),gross=structuredClone(before.dmTools.merchants.earnedCoins),stock=structuredClone(before.dmTools.merchants.stocks)
 const result=ok(await f.call('sell_to_merchant',f.sale));assert.deepEqual(result.received,{cp:0,sp:5,ep:0,gp:2,pp:0});const after=await persist(t,f,'sold')
 assert.equal(after.player.inventory.some(i=>i.id===f.item.id),false);assert.equal(after.droppedItems[f.item.id],undefined);assert.deepEqual(after.dmTools.merchantResales.custody[f.item.id].item,f.item);assert.deepEqual(after.dmTools.merchants.earnedCoins,gross);assert.deepEqual(after.dmTools.merchants.stocks,stock)
 assert.equal(after.dmTools.wallet.gp,before.dmTools.wallet.gp+2);assert.equal(after.dmTools.wallet.sp,before.dmTools.wallet.sp+5);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+6);assert.deepEqual(after.player.position,before.player.position);assert.deepEqual(after.player.hp,before.player.hp)
 const inspection=ok(await f.call('inspect_merchant_resales',{merchantId:f.offer.merchantId}));assert.deepEqual(inspection.availableCoins,{cp:0,sp:0,ep:0,gp:3,pp:0});const current=await f.call('get_game_state');assert.equal(ok(await f.call('sell_to_merchant',f.sale)).replayed,true);assert.deepEqual(await f.call('get_game_state'),current)
 await refused(f.call,'sell_to_merchant',{...f.sale,eventId:'another-payout'},'RESALE_ALREADY_SOLD');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('no actual merchant earnings means no purse, and unavailable denominations never receive automatic change or credit',async t=>{
 const f=await setup(t,{fund:false});ok(await f.call('create_resale_offer',f.offer));await refused(f.call,'sell_to_merchant',f.sale,'INSUFFICIENT_COINS');assert.deepEqual(ok(await f.call('inspect_merchant_resales',{merchantId:f.offer.merchantId})).availableCoins,{cp:0,sp:0,ep:0,gp:0,pp:0});assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('source half-price, original exact instance and actual acceptance remain mandatory before all money, time and dice',async t=>{
 const f=await setup(t)
 await refused(f.call,'create_resale_offer',{...f.offer,priceCp:500},'RESALE_SOURCE_HALF_PRICE_REQUIRED')
 await refused(f.call,'create_resale_offer',{...f.offer,agreementFactId:'invented-acceptance'},'RESALE_PHYSICAL_FACT_REQUIRED')
 ok(await f.call('create_resale_offer',f.offer));await refused(f.call,'sell_to_merchant',{...f.sale,received:{gp:2}},'RESALE_EXACT_PAYOUT_REQUIRED')
 await refused(f.call,'sell_to_merchant',{...f.sale,received:{cp:250}},'INSUFFICIENT_COINS')
 await replace(f.call,s=>s.player.inventory.find(i=>i.id===f.item.id).quantity=2);await refused(f.call,'sell_to_merchant',f.sale,'RESALE_INSTANCE_CHANGED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('equipped, magical, silvered or spell-bearing physical instances cannot be sold through ordinary half-price custody',async t=>{
 const f=await setup(t,{fund:false});ok(await f.call('equip_item',{itemId:f.item.id,operation:'equip',slot:'main_hand'}));await refused(f.call,'create_resale_offer',f.offer,'RESALE_UNEQUIP_REQUIRED');ok(await f.call('equip_item',{itemId:f.item.id,operation:'unequip',slot:'main_hand'}))
 for(const key of ['magical','silvered']){await replace(f.call,s=>s.player.inventory.find(i=>i.id===f.item.id)[key]=true);await refused(f.call,'create_resale_offer',f.offer,'RESALE_SPECIAL_ITEM_UNSUPPORTED');await replace(f.call,s=>delete s.player.inventory.find(i=>i.id===f.item.id)[key])}
 await replace(f.call,s=>s.player.inventory.find(i=>i.id===f.item.id).spellIds=['shield']);await refused(f.call,'create_resale_offer',f.offer,'RESALE_SPECIAL_ITEM_UNSUPPORTED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real retained poison coating refuses before sale without purging its preparation, dose history or potency clock',async t=>{
 const f=await setup(t);ok(await f.call('equip_item',{itemId:'shield',operation:'unequip',slot:'shield'}));ok(await f.call('equip_item',{itemId:f.item.id,operation:'equip',slot:'main_hand'}))
 const state=await f.call('get_game_state');ok(await f.call('create_scene_object',{objectId:'actual-coating-dose',name:'Dose réelle',description:'Une vraie dose de poison courant présente.',cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['basic_poison_vial']}));const dose=ok(await f.call('interact_object',{objectId:'actual-coating-dose',action:'open'})).releasedItems[0];ok(await f.call('pick_up_item',{itemId:dose.id}));ok(await f.call('coat_weapon_with_poison',{eventId:'actual-coating',vialItemId:dose.id,weaponReference:f.item.id}));ok(await f.call('equip_item',{itemId:f.item.id,operation:'unequip',slot:'main_hand'}))
 await refused(f.call,'create_resale_offer',f.offer,'RESALE_ASSOCIATED_STATE_UNSUPPORTED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('unknown source prices and single half-copper units refuse without rounding, invented buyers or a second unit',async t=>{
 const f=await setup(t,{fund:false});await replace(f.call,s=>{const item=s.player.inventory.find(i=>i.id===f.item.id);item.equipmentId='dart'})
 await refused(f.call,'create_resale_offer',f.offer,'RESALE_FRACTIONAL_COPPER_UNSUPPORTED');await replace(f.call,s=>s.player.inventory.find(i=>i.id===f.item.id).equipmentId='raw_crafting_materials');await refused(f.call,'create_resale_offer',f.offer,'RESALE_SOURCE_PRICE_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the actual selected coin mass can refuse a sale before payout even when the old item leaves the carried load',async t=>{
 const f=await setup(t,{copper:true});ok(await f.call('create_resale_offer',f.offer))
 await replace(f.call,s=>{s.player.inventory=s.player.inventory.filter(i=>i.id===f.item.id);s.player.inventory.push({id:'actual-ballast',name:'Charge réelle',type:'misc',equipmentId:'raw_crafting_materials',quantity:1});s.dmTools.loadout={unarmoredAC:10+Math.floor((s.player.stats.dex-10)/2)}})
 ok(await f.call('declare_physical_weight',{eventId:'actual-ballast-mass',targetKind:'item',targetId:'actual-ballast',weightLb:260,unit:'lb_per_inventory_unit',reason:'Cette charge réelle a été pesée.',source:'Mesure physique actuelle, sans masse déduite de son prix.'}))
 ok(await f.call('set_carrying_context',{eventId:'actual-resale-body-size',entityId:'player',size:'Medium',reason:'Taille actuelle réelle.',source:'Observation physique actuelle.'}));assert.equal(ok(await f.call('inspect_carrying_capacity',{entityId:'player'})).overloaded,false)
 await refused(f.call,'sell_to_merchant',f.sale,'CARRYING_CAPACITY_EXCEEDED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a true completed sale preserves the actual item mass record rather than converting its price to zero or discarding the measurement',async t=>{
 const f=await setup(t);ok(await f.call('declare_physical_weight',{eventId:'actual-owned-weapon-mass',targetKind:'item',targetId:f.item.id,weightLb:2,unit:'lb_per_inventory_unit',reason:'Masse réellement mesurée de cette hache.',source:'Mesure actuelle, distincte du prix.'}));ok(await f.call('create_resale_offer',f.offer));const before=await f.call('get_game_state');ok(await f.call('sell_to_merchant',f.sale));const after=await persist(t,f,'mass-retained');assert.deepEqual(after.dmTools.carrying.weights,before.dmTools.carrying.weights);assert.equal(after.player.inventory.some(i=>i.id===f.item.id),false);assert.deepEqual(after.dmTools.merchantResales.custody[f.item.id].item,f.item);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('legacy implicit equipped hands still require the true equipment operation, without creating an explicit loadout or taking a die',async t=>{
 const f=await setup(t,{fund:false});await replace(f.call,s=>delete s.dmTools.loadout)
 const fact=ok(await f.call('record_scene_fact',{description:'Cette épée longue ordinaire exacte est examinée intacte et son vrai acheteur accepte le demi-prix750cp.',cell:f.cell})).worldFact
 const offer={...f.offer,itemConditions:[{itemId:'longsword',physicalFactId:fact.id,actualUndamagedConfirmed:true}],priceCp:750,agreementFactId:fact.id}
 await refused(f.call,'create_resale_offer',offer,'RESALE_UNEQUIP_REQUIRED');assert.equal((await f.call('get_game_state')).dmTools.loadout,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('real choking boundary, unseen buyer and changed acceptance refuse before time, item custody or payout',async t=>{
 const f=await setup(t);ok(await f.call('create_resale_offer',f.offer));const original=await f.call('get_game_state')
 await replace(f.call,s=>s.npcs[f.offer.merchantId].visible=false);await refused(f.call,'sell_to_merchant',f.sale,'TRADE_MERCHANT_UNSEEN');ok(await f.call('replace_game_state',{gameState:original}))
 ok(await f.call('set_breathing_context',{eventId:'actual-resale-no-air',entityId:'player',mode:'choking',reason:'Le personnage ne dispose réellement plus d’air pendant cet échange.'}));await refused(f.call,'sell_to_merchant',{...f.sale,workSeconds:19},'ACTIVITY_BREATHING_BOUNDARY');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('hydration rejects duplicated sold custody, forged payout and fabricated merchant denomination history without a free die',async t=>{
 const f=await setup(t);ok(await f.call('create_resale_offer',f.offer));ok(await f.call('sell_to_merchant',f.sale));const original=await persist(t,f,'real-sale')
 const variants=[s=>s.player.inventory.push(structuredClone(f.item)),s=>s.dmTools.merchantResales.sales[f.sale.eventId].input.received.gp++,s=>s.dmTools.merchantResales.sales[f.sale.eventId].merchantBefore.gp++]
 for(const mutate of variants){const changed=structuredClone(original);mutate(changed);await refused(f.call,'replace_game_state',{gameState:changed},'MERCHANT_RESALE_STATE_MISMATCH')}
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual source support is exposed in the stdio schema and read without creating any wallet, offer or die',async t=>{
 const call=await engine(t,{dice:'19'}),before=await call('get_game_state'),metadata=(await call.client.listTools()).tools.find(t=>t.name==='get_rules_support');assert.ok(metadata.inputSchema.properties.domain.enum.includes('merchant_resale'))
 const support=ok(await call('get_rules_support',{domain:'merchant_resale'}));assert.ok(support.tools.includes('sell_to_merchant'));assert.match(support.source.join(' '),/3905/);assert.match(support.limitations.join(' '),/No initial\/external merchant purse/);assert.deepEqual(await call('get_game_state'),before);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
