const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{setup}=require('./helpers/merchant-resale-fixture.cjs')
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const{ok}=require('./helpers/mcp-toolkit.cjs')
const{localMerchantResaleContext}=require('../lib/dm/merchant-resale-context.ts')
test.after(()=>pg.restore())
test('API preserves exact model-selected ordinary resale and real funded payout, then refuses another player action before its die',async t=>{
 const f=await setup(t),commands=[{name:'create_resale_offer',input:f.offer},{name:'sell_to_merchant',input:f.sale},{name:'inspect_merchant_resales',input:{merchantId:f.offer.merchantId}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}]
 const{result,seen,selected,before}=await play(t,f.call,[(params,context)=>{assert.ok(context.availableTools.some(tool=>tool.name==='sell_to_merchant'));assert.ok(JSON.stringify(params.messages).includes('REVENTES LOCALES'));return commands[0]},commands[1],commands[2],commands[3],params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'La hache réelle est vendue ; les pièces effectivement disponibles rejoignent ta bourse.'}],'Je vends cette hache intacte au marchand qui a réellement accepté le demi-prix.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState
 assert.deepEqual(after.dmTools.merchantResales.custody[f.item.id].item,f.item);assert.equal(after.player.inventory.some(i=>i.id===f.item.id),false);assert.equal(after.dmTools.wallet.gp,before.dmTools.wallet.gp+2);assert.equal(after.dmTools.wallet.sp,before.dmTools.wallet.sp+5);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+6);assert.deepEqual(after.dmTools.merchants.earnedCoins,before.dmTools.merchants.earnedCoins)
 assert.deepEqual(after.player.hp,before.player.hp);assert.deepEqual(after.player.position,before.player.position);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
 assert.equal(localMerchantResaleContext({...after,currentMapId:'another-map'}),'');const hidden=structuredClone(after);hidden.npcs[f.offer.merchantId].visible=false;assert.equal(localMerchantResaleContext(hidden),'')
})
test('actual accepted resale preparation and confidential inspection consume no player action, item, coin, clock or hidden merchant revelation',async t=>{
 const f=await setup(t,{dice:'17,19'}),commands=[{name:'create_resale_offer',input:f.offer},{name:'inspect_merchant_resales',input:{merchantId:f.offer.merchantId}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}]
 const{result,seen,selected,before}=await play(t,f.call,[...commands,'L’offre effective reste ouverte ; ton observation distincte est résolue.'],'Le marchand accepte cet accord ; j’observe ensuite les environs.')
 assert.deepEqual(seen,selected);const after=result.newGameState;assert.equal(after.dmTools.merchantResales.offers[f.offer.offerId].status,'open');assert.equal(after.dmTools.merchantResales.custody[f.item.id],undefined);assert.deepEqual(after.dmTools.wallet,before.dmTools.wallet);assert.deepEqual(after.player.inventory,before.player.inventory);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an actual unfunded sale refusal reaches the model without granting coins or using its one independent player action',async t=>{
 const f=await setup(t,{fund:false,dice:'17,19'}),commands=[{name:'create_resale_offer',input:f.offer},{name:'sell_to_merchant',input:f.sale},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}]
 const{result,seen,selected,before}=await play(t,f.call,[commands[0],commands[1],params=>{assert.equal(lastResult(params).code,'INSUFFICIENT_COINS');return commands[2]},'Le marchand ne peut pas payer ces pièces ; ton observation distincte est résolue.'],'Je demande cette vente convenue ; si elle ne peut pas être payée, j’observe les environs.')
 assert.deepEqual(seen,selected);const after=result.newGameState;assert.equal(after.dmTools.merchantResales.offers[f.offer.offerId].status,'open');assert.equal(after.dmTools.merchantResales.custody[f.item.id],undefined);assert.deepEqual(after.dmTools.wallet,before.dmTools.wallet);assert.deepEqual(after.player.inventory,before.player.inventory);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
