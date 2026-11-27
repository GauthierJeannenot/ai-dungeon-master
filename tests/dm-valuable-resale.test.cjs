const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{setupValuable}=require('./helpers/valuable-resale-fixture.cjs')
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const{ok}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
test('API preserves exact full-value source qualification, real funded payout and SQL, then refuses another player action',async t=>{
 const f=await setupValuable(t),commands=[{name:'create_valuable_resale_offer',input:f.valuableOffer},{name:'sell_to_merchant',input:f.valuableSale},{name:'inspect_merchant_resales',input:{merchantId:f.valuableOffer.merchantId}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}]
 const{result,seen,selected,before}=await play(t,f.call,[(params,context)=>{assert.ok(context.availableTools.some(t=>t.name==='create_valuable_resale_offer'));return commands[0]},commands[1],commands[2],commands[3],params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'La gemme réelle rejoint la garde du marchand ; ses pièces effectivement disponibles te sont versées.'}],'Je vends cette gemme précisément qualifiée à sa vraie pleine valeur au marchand intéressé.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,v=f.values[0];assert.equal(after.dmTools.wallet.gp,before.dmTools.wallet.gp+v.valueGp);assert.equal(after.dmTools.merchantResales.offers[f.valuableOffer.offerId].valuation,'registered_valuable_full');assert.deepEqual(after.dmTools.merchantResales.custody[v.id].valuableProvenance.record,before.dmTools.valuables[v.id]);assert.deepEqual(after.dmTools.valuables,before.dmTools.valuables);assert.deepEqual(after.dmTools.hoards,before.dmTools.hoards);assert.equal(after.player.inventory.some(i=>i.id===v.id),false);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+6);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('API full-value qualification is auxiliary and creates no item, coin or time before the one distinct player action',async t=>{
 const f=await setupValuable(t,{tail:'17,19'}),commands=[{name:'create_valuable_resale_offer',input:f.valuableOffer},{name:'inspect_merchant_resales',input:{merchantId:f.valuableOffer.merchantId}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}]
 const{result,seen,selected,before}=await play(t,f.call,[...commands,'La qualification et l’accord sont conservés ; ton observation distincte est résolue.'],'Le marchand confirme cet accord réel ; j’observe les environs avant de vendre.')
 assert.deepEqual(seen,selected);const after=result.newGameState;assert.equal(after.dmTools.merchantResales.offers[f.valuableOffer.offerId].status,'open');assert.deepEqual(after.player.inventory,before.player.inventory);assert.deepEqual(after.dmTools.wallet,before.dmTools.wallet);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
