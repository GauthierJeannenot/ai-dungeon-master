const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,addSupply}=require('./helpers/mcp-toolkit.cjs')
function actualLegacyFullHands(state){
 if(!state.player.inventory.some(item=>item.type==='weapon'))state.player.inventory.push({id:'legacy-sword',equipmentId:'longsword',name:'Épée réelle',type:'weapon'})
 if(!state.player.inventory.some(item=>item.equipmentId==='shield'))state.player.inventory.push({id:'legacy-shield',equipmentId:'shield',name:'Bouclier réel',type:'armor',acBonus:2})
 delete state.dmTools.loadout
}
test('public Oil use cannot treat an owned legacy flask as held while the real inferred weapon and shield occupy both hands',async t=>{
 const call=await engine(t,{dice:'19'}),target=await spawn(call);await addSupply(call,'oil_flask','actual-oil');await replace(call,actualLegacyFullHands)
 const before=await call('get_game_state');assert.equal(before.dmTools.loadout,undefined)
 const answer=await call('use_oil_flask',{useId:'actual-use',itemId:'actual-oil',targetKind:'creature',targetId:target.id,mode:'throw'})
 assert.equal(answer.code,'OIL_FREE_HAND_REQUIRED');assert.deepEqual(await call('get_game_state'),before);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('public ignition cannot turn a stowed legacy burning torch into the source actually held beside a real weapon and shield',async t=>{
 const call=await engine(t,{dice:'19'});await addSupply(call,'oil_flask','actual-oil');await addSupply(call,'torch','actual-torch')
 await replace(call,state=>{state.dmTools.loadout={unarmoredAC:14}})
 const state=await call('get_game_state'),cell=state.player.position,fact=ok(await call('record_scene_fact',{description:'Cette dalle réellement observée est horizontale et nivelée.',cell})).worldFact
 ok(await call('pour_oil_flask',{useId:'actual-pool',itemId:'actual-oil',cell,surfaceFactId:fact.id,levelSurfaceConfirmed:true,surfaceZFeet:0}))
 ok(await call('equip_item',{itemId:'actual-torch',slot:'main_hand',operation:'equip'}));ok(await call('manage_light_source',{itemId:'actual-torch',operation:'light'}));await replace(call,actualLegacyFullHands)
 const before=await call('get_game_state');assert.equal(before.dmTools.loadout,undefined);assert.ok(before.dmTools.lighting.sources['actual-torch'].litAt!==undefined)
 const answer=await call('ignite_oil_patch',{eventId:'actual-ignition',patchId:'actual-pool',flameItemId:'actual-torch'})
 assert.equal(answer.code,'OIL_REAL_FLAME_CONTACT_REQUIRED');assert.deepEqual(await call('get_game_state'),before);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
