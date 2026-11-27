const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js')
const close=f=>f.call('end_combat',{force:true,reason:'Le dernier adversaire abandonne effectivement ce combat.'}).then(ok)
const recover=(id='search')=>({recoveryId:id,combatGeneration:1,ammunitionType:'arrow'})
async function mixedBattle(t,arrows=1){
 const f=await fixture(t,{realBattle:true,quantity:arrows,dice:arrows===1?'20,1,1,1,19':'20,1,1,1,1,1,19',additionalWeapons:['hand-crossbow'],additionalAmmo:[{itemId:'actual-bolts',ammunitionType:'crossbow-bolt',quantity:1}]})
 ok(await f.attack())
 if(arrows===3){
  ok(await f.attack());ok(await f.call('next_turn',{actorId:'player'}));ok(await f.call('next_turn',{actorId:'target',skipAction:true}));ok(await f.attack())
 }
 ok(await f.call('use_subclass_feature',{featureId:'action_surge'}))
 ok(await f.call('equip_item',{itemId:'shortbow',slot:'main_hand',operation:'unequip'}));ok(await f.call('equip_item',{itemId:'hand-crossbow',slot:'main_hand',operation:'equip'}))
 ok(await f.attack({weaponOrSpell:'hand-crossbow',ammunitionItemId:'actual-bolts'}));await close(f)
 return f
}
const counts=(arrows,bolts)=>[{ammunitionType:'arrow',quantity:arrows},{ammunitionType:'crossbow-bolt',quantity:bolts}]
const batch=(recoveryId,recoveredCounts)=>({recoveryId,combatGeneration:1,recoveredCounts})

test('one real minute recovers half the whole actual battle total, rounding down once across three physical one-arrow stacks',async t=>{
 const f=await fixture(t,{realBattle:true,quantity:1,dice:'20,1,1,1,1,19',additionalAmmo:[{itemId:'second-ammo',quantity:1},{itemId:'third-ammo',quantity:1}]})
 ok(await f.attack());ok(await f.attack({ammunitionItemId:'second-ammo'}));ok(await f.call('use_subclass_feature',{featureId:'action_surge'}));ok(await f.attack({ammunitionItemId:'third-ammo'}));await close(f)
 const before=f.state.worldTimeSeconds,answer=ok(await f.call('recover_ammunition',recover())),receipt=answer.recovery
 assert.equal(receipt.expendedQuantity,3);assert.equal(receipt.recoveredQuantity,1);assert.equal(receipt.attackIds.length,3)
 assert.equal(answer.seconds,60);assert.equal(f.state.worldTimeSeconds,before+60);assert.equal(receipt.completedAt-receipt.startedAt,60)
 const item=f.state.player.inventory.find(item=>item.id===receipt.itemId);assert.equal(item.quantity,1);assert.equal(item.ammunitionType,'arrow')
 for(const id of ['actual-ammo','second-ammo','third-ammo'])assert.equal(f.state.player.inventory.find(item=>item.id===id).quantity,0,'spent original stacks never refill')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('hydrated recovery receipts return the actual old result and neither another ID nor a moved recovered stack grants a second half',async t=>{
 const f=await fixture(t,{realBattle:true,quantity:2,dice:'20,1,1,1,19'});ok(await f.attack());ok(await f.attack());await close(f)
 const first=ok(await f.call('recover_ammunition',recover('first')))
 ok(await f.call('drop_item',{itemId:first.recovery.itemId}))
 const saved=structuredClone(gs.getState());gs.replaceState(saved)
 const replay=ok(await f.call('recover_ammunition',recover('first')));assert.equal(replay.replayed,true);assert.equal(replay.seconds,0);assert.deepEqual(gs.getState(),saved)
 await refused(f,'recover_ammunition',recover('second'),'AMMUNITION_BATTLE_ALREADY_SEARCHED')
 await refused(f,'recover_ammunition',{...recover('first'),ammunitionType:'crossbow-bolt'},'AMMUNITION_RECOVERY_ID_CONFLICT')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a one-arrow battle still costs the search minute, returns zero objects and cannot be repeatedly rounded up',async t=>{
 const f=await fixture(t,{realBattle:true,quantity:1,dice:'20,1,1,19'});ok(await f.attack());await close(f)
 const before=f.state.player.inventory.length,answer=ok(await f.call('recover_ammunition',recover('toString')))
 assert.equal(answer.recovery.expendedQuantity,1);assert.equal(answer.recovery.recoveredQuantity,0);assert.equal(answer.recovery.itemId,undefined)
 assert.equal(f.state.player.inventory.length,before);assert.equal(f.state.worldTimeSeconds,60)
 await refused(f,'recover_ammunition',recover('new-name'),'AMMUNITION_BATTLE_ALREADY_SEARCHED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an ongoing battle, a different real room and a different real map all refuse before search time or inventory changes',async t=>{
 const f=await fixture(t,{realBattle:true,quantity:1,dice:'20,1,1,19'});ok(await f.attack())
 await refused(f,'recover_ammunition',recover(),'AMMUNITION_RECOVERY_AFTER_BATTLE');await close(f)
 f.state.player.position={x:8,y:2};f.state.currentRoomId='other-room'
 await refused(f,'recover_ammunition',recover(),'AMMUNITION_BATTLEFIELD_REQUIRED')
 const map=getAdventureMap(),original=map.maps[0],mapId='different-ammunition-map'
 map.maps.push({...structuredClone(original),id:mapId,geometry:{...structuredClone(original.geometry),mapId}})
 map.rooms.push({id:'different-room',mapId,name:'Different room',zone:{minX:0,maxX:11,minY:0,maxY:4}})
 f.state.currentMapId=mapId;f.state.currentRoomId='different-room'
 await refused(f,'recover_ammunition',recover(),'AMMUNITION_BATTLEFIELD_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a battle with real shots in two rooms refuses the bounded search instead of recovering remote arrows or rounding separately',async t=>{
 const f=await fixture(t,{realBattle:true,quantity:2,dice:'20,1,1,1,19'});ok(await f.attack())
 f.state.player.position={x:7,y:2};f.state.currentRoomId='other-room';f.state.monsters.target.position={x:10,y:2}
 ok(await f.attack());await close(f)
 assert.equal(new Set(Object.values(f.state.dmTools.ammunition.expenditures).map(record=>record.roomId)).size,2)
 await refused(f,'recover_ammunition',recover(),'BATTLEFIELD_SEARCH_ROUTE_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an actual breathing boundary preflights the full minute before any recovery, clock advance or projectile grant',async t=>{
 const f=await fixture(t,{realBattle:true,quantity:2,dice:'20,1,1,1,19'});ok(await f.attack());ok(await f.attack());await close(f)
 const {setBreathingContext}=require('../mcp-server/dist/mcp-server/breathing.js')
 setBreathingContext({entityId:'player',eventId:'actual-choking',mode:'choking',reason:'La source réelle prive le joueur d’air pendant cette recherche.'})
 await refused(f,'recover_ammunition',recover(),'ACTIVITY_BREATHING_BOUNDARY')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('exploration attack attempts before and after an actual battle cannot create recoverable battle expenditures',async t=>{
 const f=await fixture(t,{startBattle:false,quantity:3,dice:'20,1,1,19'})
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'shortbow',ammunitionItemId:'actual-ammo'},'NOT_IN_COMBAT')
 ok(await f.call('enter_combat',{combatants:['player','target']}));ok(await f.attack())
 await close(f)
 const newTarget=ok(await f.call('spawn_monster',{monsterType:'goblin',cell:{x:5,y:2},hpOverride:200}))
 await refused(f,'resolve_player_attack',{targetId:newTarget.id,weaponOrSpell:'shortbow',ammunitionItemId:'actual-ammo'},'NOT_IN_COMBAT')
 const receipts=Object.values(gs.getState().dmTools.ammunition.expenditures)
 assert.equal(receipts.length,1);assert.equal(receipts[0].inCombat,true);assert.equal(receipts[0].combatGeneration,1)
 const answer=ok(await f.call('recover_ammunition',recover()))
 assert.equal(answer.recovery.expendedQuantity,1);assert.equal(answer.recovery.recoveredQuantity,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('old receipts without a real combat witness and generation-zero exploration requests never grant ammunition',async t=>{
 const f=await fixture(t,{startBattle:false,quantity:2,dice:'20,1,1,19'})
 await refused(f,'recover_ammunition',{...recover(),combatGeneration:0},'AMMUNITION_BATTLE_REQUIRED')
 ok(await f.call('enter_combat',{combatants:['player','target']}));ok(await f.attack());await close(f)
 for(const receipt of Object.values(f.state.dmTools.ammunition.expenditures))delete receipt.inCombat
 await refused(f,'recover_ammunition',recover(),'AMMUNITION_NO_EXPENDITURE')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the first single-type search refuses a mixed-type battle instead of charging separate minutes for its physical stacks',async t=>{
 const f=await mixedBattle(t)
 await refused(f,'recover_ammunition',recover(),'AMMUNITION_MIXED_TYPES_SEARCH_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('one arrow and one bolt recover one explicitly chosen real projectile in a single minute, with the mixed interpretation stated',async t=>{
 const f=await mixedBattle(t),before=f.state.worldTimeSeconds,answer=ok(await f.call('recover_ammunition',batch('mixed',counts(0,1))))
 assert.equal(answer.recovery.expendedQuantity,2);assert.equal(answer.recovery.recoveredQuantity,1);assert.equal(answer.seconds,60)
 assert.equal(f.state.worldTimeSeconds,before+60);assert.equal(answer.recovery.composition,'explicit_mj_allocation')
 assert.match(answer.interpretation,/not an official clarification/);assert.match(answer.interpretation,/explicitly declared by the MJ/)
 assert.equal(answer.recovery.allocations.find(row=>row.ammunitionType==='arrow').itemId,undefined)
 const bolt=answer.recovery.allocations.find(row=>row.ammunitionType==='crossbow-bolt'),item=f.state.player.inventory.find(item=>item.id===bolt.itemId)
 assert.equal(item.quantity,1);assert.equal(item.ammunitionType,'crossbow-bolt');assert.equal(item.equipmentId,'crossbow_bolts')
 assert.equal(f.state.player.inventory.find(item=>item.id==='actual-ammo').quantity,0);assert.equal(f.state.player.inventory.find(item=>item.id==='actual-bolts').quantity,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('mixed recovery refuses missing, duplicated, invented, excessive or wrongly totaled allocations before time, inventory or dice',async t=>{
 const f=await mixedBattle(t)
 for(const [input,code]of [
  [batch('invalid',[{ammunitionType:'arrow',quantity:1}]),'AMMUNITION_RECOVERY_TYPES_INCOMPLETE'],
  [batch('invalid',[{ammunitionType:'arrow',quantity:1},{ammunitionType:'arrow',quantity:0}]),'AMMUNITION_RECOVERY_TYPE_DUPLICATE'],
  [batch('invalid',[...counts(1,0),{ammunitionType:'sling-bullet',quantity:0}]),'AMMUNITION_RECOVERY_TYPES_INCOMPLETE'],
  [batch('invalid',counts(0,2)),'AMMUNITION_RECOVERY_TYPE_EXCESS'],
  [batch('invalid',counts(0,0)),'AMMUNITION_RECOVERY_TOTAL_INVALID'],
  [batch('invalid',counts(1,1)),'AMMUNITION_RECOVERY_TOTAL_INVALID'],
  [{...batch('invalid',counts(1,0)),ammunitionType:'arrow'},'AMMUNITION_RECOVERY_ARGUMENTS_INVALID'],
  [{recoveryId:'invalid',combatGeneration:1},'AMMUNITION_RECOVERY_COUNTS_REQUIRED'],
 ])await refused(f,'recover_ammunition',input,code)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('mixed distributions replay regardless of array order and a different ID or type cannot reallocate or collect another half',async t=>{
 const f=await mixedBattle(t);ok(await f.call('recover_ammunition',batch('once',counts(1,0))))
 const saved=structuredClone(gs.getState());gs.replaceState(saved)
 const replay=ok(await f.call('recover_ammunition',batch('once',counts(1,0).reverse())))
 assert.equal(replay.replayed,true);assert.equal(replay.seconds,0);assert.deepEqual(gs.getState(),saved)
 await refused(f,'recover_ammunition',batch('twice',counts(0,1)),'AMMUNITION_BATTLE_ALREADY_SEARCHED')
 await refused(f,'recover_ammunition',batch('once',counts(0,1)),'AMMUNITION_RECOVERY_ID_CONFLICT')
 await refused(f,'recover_ammunition',{recoveryId:'new-type',combatGeneration:1,ammunitionType:'crossbow-bolt'},'AMMUNITION_BATTLE_ALREADY_SEARCHED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an old qualified single-type receipt remains unchanged after hydration and blocks a second search of the whole battle',async t=>{
 const f=await fixture(t,{realBattle:true,quantity:2,dice:'20,1,1,1,19'});ok(await f.attack());ok(await f.attack());await close(f)
 const input=recover('old-qualified');ok(await f.call('recover_ammunition',input))
 const saved=structuredClone(gs.getState()),record=saved.dmTools.ammunition.recoveries['old-qualified']
 delete record.allocations;delete record.composition;delete record.interpretation
 require('../mcp-server/dist/lib/ammunition-state.js').AmmunitionStateSchema.parse(saved.dmTools.ammunition)
 gs.replaceState(saved);assert.equal(ok(await f.call('recover_ammunition',input)).replayed,true);assert.deepEqual(gs.getState(),saved)
 await refused(f,'recover_ammunition',{recoveryId:'other-type',combatGeneration:1,ammunitionType:'crossbow-bolt'},'AMMUNITION_BATTLE_ALREADY_SEARCHED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('three arrows and one bolt recover two total projectiles without losing the cross-type half to per-type rounding',async t=>{
 const f=await mixedBattle(t,3),before=f.state.worldTimeSeconds,answer=ok(await f.call('recover_ammunition',batch('unequal',counts(1,1))))
 assert.equal(answer.recovery.expendedQuantity,4);assert.equal(answer.recovery.recoveredQuantity,2);assert.equal(f.state.worldTimeSeconds,before+60)
 assert.equal(answer.recovery.allocations.reduce((sum,row)=>sum+row.recoveredQuantity,0),2)
 assert.equal(answer.recovery.allocations.filter(row=>row.itemId).length,2)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual recovered projectile mass preflights active carrying before the search minute, receipt or inventory gain',async t=>{
 const f=await fixture(t,{realBattle:true,quantity:2,dice:'20,1,1,1,19'});ok(await f.attack());ok(await f.attack());await close(f)
 ok(await f.call('set_carrying_context',{eventId:'actual-player-size',entityId:'player',size:'Medium',reason:'Taille physique fournie explicitement pour ce scénario.',source:'Fait physique établi : ce personnage est de taille Moyenne.'}))
 const capacity=ok(await f.call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(capacity.status,'resolved')
 const ballast=capacity.carryingCapacityLb-capacity.carriedWeightLb;assert.ok(ballast>0)
 f.state.player.inventory.push({id:'actual-ballast',name:'Ballast effectivement porté',type:'misc'})
 await refused(f,'recover_ammunition',recover('heavy'),'CARRYING_DATA_REQUIRED')
 ok(await f.call('declare_physical_weight',{eventId:'measured-ballast',targetKind:'item',targetId:'actual-ballast',weightLb:ballast,unit:'lb_per_inventory_unit',reason:'Masse totale réellement mesurée pour cette instance.',source:'Mesure de scénario du ballast porté : masse déclarée en livres.'}))
 const loaded=ok(await f.call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(loaded.carriedWeightLb,loaded.carryingCapacityLb)
 await refused(f,'recover_ammunition',recover('heavy'),'CARRYING_CAPACITY_EXCEEDED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
