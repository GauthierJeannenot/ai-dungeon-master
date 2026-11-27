const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false'})
const root=process.cwd(),local=p=>path.join(root,p)
const{setup:ordinary}=require(local('tests/helpers/merchant-resale-fixture.cjs'))
const{setupValuable}=require(local('tests/helpers/valuable-resale-fixture.cjs'))
const{ok}=require(local('tests/helpers/mcp-toolkit.cjs'))
const{entityVerticalContext}=require(local('mcp-server/dist/lib/jumping-state.js'))
async function fixture(t,kind){
 const f=kind==='ordinary'?await ordinary(t):await setupValuable(t)
 const offer=kind==='ordinary'?f.offer:f.valuableOffer,sale=kind==='ordinary'?f.sale:f.valuableSale
 ok(await f.call(kind==='ordinary'?'create_resale_offer':'create_valuable_resale_offer',offer))
 return{...f,chosenOffer:offer,chosenSale:sale}
}
for(const kind of ['ordinary','valuable'])test(`${kind}: a real accepted offer refuses unknown actual merchant height without coins, custody, time or dice`,async t=>{
 const f=await fixture(t,kind),accepted=await f.call('get_game_state'),npc=accepted.npcs[f.chosenOffer.merchantId]
 assert.equal(entityVerticalContext(accepted,npc.id).known,true)
 ok(await f.call('record_vertical_surface',{eventId:'observed-unresolved-merchant-gap',surfaceId:'observed-merchant-gap',mapId:accepted.currentMapId,roomId:npc.roomId,cells:[npc.position],kind:'gap',elevationFeet:0,actualGeometryConfirmed:true,source:'The actual merchant column has an observed gap; the body support and height have not been established. This observation neither relocates the body nor supplies a ground elevation.'}))
 const before=await f.call('get_game_state'),height=entityVerticalContext(before,npc.id)
 assert.equal(height.known,false);assert.equal(height.source,'actual_ground_support_required');assert.equal(height.zFeet,null)
 assert.equal(entityVerticalContext(before,'player').known,true);assert.deepEqual(before.player.position,accepted.player.position);assert.deepEqual(before.npcs[npc.id].position,npc.position)
 assert.deepEqual(before.dmTools.merchantResales,accepted.dmTools.merchantResales,'The genuine accepted offer is retained; no consent or sale is fabricated')
 const answer=await f.call('sell_to_merchant',f.chosenSale)
 assert.equal(answer.code,'PHYSICAL_HEIGHT_POINT_GEOMETRY_REQUIRED',JSON.stringify(answer));assert.ok(answer.error)
 assert.deepEqual(await f.call('get_game_state'),before,'Unknown merchant height must refuse before ALL money, inventory, doses, provenance, offer, custody and six-second mutations')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19,'The refusal consumed no queued die')
})
test('ordinary: the unchanged genuine legacy ground Z0 handoff still succeeds',async t=>{
 const f=await fixture(t,'ordinary'),before=await f.call('get_game_state'),merchant=entityVerticalContext(before,f.chosenOffer.merchantId)
 assert.equal(merchant.known,true);assert.equal(merchant.zFeet,0);assert.equal(entityVerticalContext(before,'player').zFeet,0)
 ok(await f.call('sell_to_merchant',f.chosenSale));const after=await f.call('get_game_state')
 assert.ok(before.player.inventory.some(i=>i.id===f.item.id));assert.ok(!after.player.inventory.some(i=>i.id===f.item.id));assert.equal(after.worldTimeSeconds-before.worldTimeSeconds,6)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
