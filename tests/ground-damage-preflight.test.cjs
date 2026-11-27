const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {oilActualActorIds}=require('../mcp-server/dist/mcp-server/oil-ground.js')
async function burning(t){
 const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,dice:'19'}),cell={x:2,y:2}
 f.state.player.inventory.push({id:'actual-oil',equipmentId:'oil_flask',name:'Huile réelle',type:'misc'},{id:'actual-torch',equipmentId:'torch',name:'Torche réelle',type:'misc'})
 const fact=ok(await f.call('record_scene_fact',{description:'Vrai sol horizontal observé.',cell})).worldFact.id
 ok(await f.call('pour_oil_flask',{useId:'actual-pool',itemId:'actual-oil',cell,surfaceZFeet:0,surfaceFactId:fact,levelSurfaceConfirmed:true}))
 ok(await f.call('equip_item',{itemId:'longsword',slot:'main_hand',operation:'unequip'}));ok(await f.call('equip_item',{itemId:'actual-torch',slot:'main_hand',operation:'equip'}));ok(await f.call('manage_light_source',{itemId:'actual-torch',operation:'light'}));ok(await f.call('ignite_oil_patch',{eventId:'actual-ignition',patchId:'actual-pool',flameItemId:'actual-torch'}))
 Object.assign(f.state,{phase:'combat',round:1,currentTurn:'player',initiativeOrder:['player','target'],combatGeneration:1,turnCounter:0});return f
}

test('ground oil refuses a living zeroHP body with unknown death history before its actual entry or damage and preserves the next die',async t=>{
 const f=await burning(t);f.target.hp.current=0;const before=structuredClone(gs.getState())
 assert.throws(()=>gs.moveToken('target',2,2),error=>error.code==='NPC_ZERO_HP_UNTRACKED');assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a true hidden stat-backed NPC contacts ground fire without discovery, activation or a direct-target privilege',async t=>{
 const f=await burning(t),{createNpcState}=require('../mcp-server/dist/lib/npc-stat-blocks.js')
 const npc=createNpcState({id:'actual-hidden-npc',name:'Témoin caché',kind:'goblin',statBlock:'goblin',cell:{x:3,y:2},roomId:'firing-room',disposition:'neutral',visibleFromStart:false,description:'Corps réel caché du scénario.'},f.state.currentMapId)
 f.state.npcs[npc.id]=npc;f.state.initiativeOrder.push(npc.id);assert.ok(oilActualActorIds(f.state).includes(npc.id));const before=npc.hp.current
 gs.moveToken(npc.id,2,2);assert.equal(npc.hp.current,before-5);assert.equal(npc.visible,false);assert.equal(gs.getEntity(npc.id),undefined);assert.equal(gs.getState().monsters[npc.id],undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
