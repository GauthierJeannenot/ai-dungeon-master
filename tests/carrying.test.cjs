const test=require('node:test'),assert=require('node:assert/strict')
const {carryingLimits,carryingItemWeight,inspectCarryingCapacity}=require('../mcp-server/dist/lib/carrying-state.js')
const {engine,ok,replace,spawn,battle,adjacent,object}=require('./helpers/mcp-toolkit.cjs')
const reason='Le MJ établit la masse ou la taille physique réelle de cette instance.'
const source='Mesure physique et fiche explicite de cet acteur/objet ; aucune déduction depuis son nom.'
const base=inventory=>({player:{id:'player',stats:{str:10},inventory},monsters:{}})
test('standard capacities use STR15/30 and exact source size multipliers, with Small equal to Medium',()=>{
 const expected={Tiny:75,Small:150,Medium:150,Large:300,Huge:600,Gargantuan:1200}
 for(const [size,carry]of Object.entries(expected)){
  const result=carryingLimits(10,size);assert.equal(result.carryingCapacityLb,carry);assert.equal(result.pushDragLiftLimitLb,carry*2)
 }
})
test('missing size/mass stays unresolved, exact equipment IDs work and convincing names never grant mass zero or a catalog identity',()=>{
 const state=base([{id:'unidentified-sword',name:'Longsword',type:'weapon'},{id:'actual-sword',equipmentId:'longsword',name:'Renamed',type:'weapon'}])
 const result=inspectCarryingCapacity(state)
 assert.equal(result.status,'unresolved');assert.equal(result.tracking,'untracked');assert.equal(result.carriedWeightLb,null)
 assert.equal(result.knownLoadLb,3);assert.ok(result.missing.some(item=>item.code==='actual_actor_size_required'))
 assert.equal(result.items[0].weightLb,null);assert.equal(result.items[1].weightLb,3)
})
test('real ammunition counts determine per-projectile mass and a legacy bundle description never invents twenty arrows',()=>{
 const state=base([]),item={id:'arrows',name:'Twenty arrows',type:'misc'}
 assert.equal(carryingItemWeight(state,item).weightLb,null)
 assert.equal(carryingItemWeight(state,{...item,quantity:20}).weightLb,1)
 assert.equal(carryingItemWeight(state,{...item,quantity:19}).weightLb,19/20)
 assert.equal(carryingItemWeight(state,{...item,quantity:0}).weightLb,0,'zero follows an actual depleted count')
})
test('variable provisions need actual content data and coin mass counts pieces rather than their gold value',()=>{
 const ration={id:'ration',equipmentId:'ration_1_day',type:'misc'},water={id:'water',equipmentId:'waterskin_full',type:'misc'},state=base([ration,water])
 state.dmTools={wallet:{cp:50,sp:0,ep:0,gp:50,pp:0},survival:{provisions:{ration:{kind:'ration_1_day',remainingUnits:3},water:{kind:'waterskin_full',remainingUnits:3}}}}
 assert.equal(carryingItemWeight(state,ration).weightLb,1.5)
 assert.equal(carryingItemWeight(state,water).weightLb,null,'the actual empty-container mass is still missing')
 delete state.dmTools.survival.provisions.ration
 assert.equal(carryingItemWeight(state,ration).weightLb,null,'no full ration is inferred without its ledger')
 const result=inspectCarryingCapacity(state);assert.equal(result.coinWeightLb,2);assert.equal(result.carriedWeightLb,null)
})

async function clearGear(call){for(const item of (await call('get_game_state')).player.inventory)ok(await call('drop_item',{itemId:item.id}))}
async function begin(call,eventId='begin',size='Medium'){return ok(await call('set_carrying_context',{eventId,entityId:'player',size,reason,source}))}
async function declare(call,targetKind,targetId,weightLb,eventId=`mass-${targetId}`){return ok(await call('declare_physical_weight',{eventId,targetKind,targetId,weightLb,
 unit:targetKind==='item'?'lb_per_inventory_unit':'lb_total',reason,source}))}
async function refused(call,name,input,code){const before=await call('get_game_state');assert.equal((await call(name,input)).code,code);assert.deepEqual(await call('get_game_state'),before)}
async function groundStone(call,id='physical-stone'){
 await replace(call,state=>{state.droppedItems??={};state.droppedItems[id]={item:{id,name:'Pierre réellement présente',type:'misc'},position:{...state.player.position},mapId:state.currentMapId,roomId:state.currentRoomId}})
 return id
}
test('tracking remains explicit, preserves unresolved legacy facts and then blocks movement until real missing masses are declared',async t=>{
 const call=await engine(t,{dice:'19'})
 const initial=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(initial.status,'unresolved');assert.equal(initial.tracking,'untracked')
 const goal=adjacent(await call('get_game_state'))[0]
 const started=await begin(call);assert.equal(started.carrying.tracking,'active');assert.ok(started.carrying.missing.length)
 await refused(call,'move_token',{tokenId:'player',toCell:goal},'CARRYING_DATA_REQUIRED')
 for(const item of started.carrying.missing.filter(row=>row.itemId))await declare(call,'item',item.itemId,0.5)
 const resolved=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(resolved.status,'resolved')
 const before=await call('get_game_state');ok(await call('replace_game_state',{gameState:before}))
 assert.deepEqual((await call('get_game_state')).dmTools.carrying,before.dmTools.carrying)
 ok(await call('move_token',{tokenId:'player',toCell:goal}))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('pickup enforces unknown mass and the exact capacity boundary before inventory, ground fact or costs change',async t=>{
 const call=await engine(t,{dice:'19'});await clearGear(call);await begin(call)
 const enemy=await spawn(call);await battle(call,[enemy.id])
 const id=await groundStone(call),load=ok(await call('inspect_carrying_capacity',{entityId:'player'}))
 await refused(call,'pick_up_item',{itemId:id},'CARRYING_DATA_REQUIRED')
 const boundary=load.carryingCapacityLb-load.carriedWeightLb
 await declare(call,'item',id,boundary+1,'first-mass')
 await refused(call,'pick_up_item',{itemId:id},'CARRYING_CAPACITY_EXCEEDED')
 assert.equal((await call('get_game_state')).hero.actionCredits,1,'the refused actual combat pickup spent no action')
 await declare(call,'item',id,boundary,'correct-measurement')
 const current=await call('get_game_state')
 const old=ok(await call('declare_physical_weight',{eventId:'first-mass',targetKind:'item',targetId:id,weightLb:boundary+1,unit:'lb_per_inventory_unit',reason,source}))
 assert.equal(old.replayed,true);assert.deepEqual(await call('get_game_state'),current,'receipt replay cannot rewind the latest actual fact')
 ok(await call('pick_up_item',{itemId:id}))
 const after=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(after.carriedWeightLb,after.carryingCapacityLb);assert.equal(after.overloaded,false)
 assert.equal((await call('get_game_state')).droppedItems[id],undefined)
 assert.equal((await call('get_game_state')).actionUsed.player,true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real changed Strength can make the player overloaded; dropping an exact item remains possible and frees movement',async t=>{
 const call=await engine(t,{dice:'19'});await clearGear(call);await begin(call)
 const id=await groundStone(call);await declare(call,'item',id,20);ok(await call('pick_up_item',{itemId:id}))
 await replace(call,state=>{state.player.stats.str=1})
 const goal=adjacent(await call('get_game_state'))[0]
 await refused(call,'move_token',{tokenId:'player',toCell:goal},'CARRYING_CAPACITY_EXCEEDED')
 ok(await call('drop_item',{itemId:id}));ok(await call('move_token',{tokenId:'player',toCell:goal}))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('handling an actual weighed object reports both standard limits and the pushing speed cap without moving either target or actor',async t=>{
 const call=await engine(t,{dice:'19'});await clearGear(call);await begin(call)
 await object(call,'real-load',{size:'large'})
 const cap=ok(await call('inspect_carrying_capacity',{entityId:'player'}))
 await declare(call,'object','real-load',cap.pushDragLiftLimitLb)
 const before=await call('get_game_state')
 for(const operation of ['push','drag','lift']){
  const result=ok(await call('assess_handling_load',{entityId:'player',targetKind:'object',targetId:'real-load',operation}))
  assert.equal(result.capacityPermits,true);assert.equal(result.actionResolved,false);assert.equal(result.movementResolved,false)
  assert.equal(result.pushingDraggingSpeedLimitFeet,operation==='lift'?null:5)
 }
 const carried=ok(await call('assess_handling_load',{entityId:'player',targetKind:'object',targetId:'real-load',operation:'carry'}));assert.equal(carried.capacityPermits,false)
 assert.deepEqual(await call('get_game_state'),before)
 await declare(call,'object','real-load',cap.pushDragLiftLimitLb+1,'heavier-fact')
 const excessive=ok(await call('assess_handling_load',{entityId:'player',targetKind:'object',targetId:'real-load',operation:'drag'}))
 assert.equal(excessive.capacityPermits,false);assert.equal(excessive.pushingDraggingSpeedLimitFeet,null)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('native monster size is sourced while body mass and creature inventory remain explicitly unmodeled until declared',async t=>{
 const call=await engine(t,{dice:'19'}),ogre=await spawn(call,'awakened_tree')
 const result=ok(await call('inspect_carrying_capacity',{entityId:ogre.id}))
 assert.equal(result.size,'Huge');assert.equal(result.strength,19);assert.equal(result.carryingCapacityLb,1140);assert.equal(result.pushDragLiftLimitLb,2280)
 assert.equal(result.carriedWeightLb,null);assert.ok(result.missing.some(row=>row.code==='creature_inventory_not_modeled'))
 await begin(call)
 const unknown=ok(await call('assess_handling_load',{entityId:'player',targetKind:'creature',targetId:ogre.id,operation:'lift'}));assert.equal(unknown.targetWeightLb,null);assert.equal(unknown.capacityPermits,null)
 await declare(call,'creature',ogre.id,600)
 const known=ok(await call('assess_handling_load',{entityId:'player',targetKind:'creature',targetId:ogre.id,operation:'lift'}));assert.equal(known.targetWeightLb,600);assert.equal(known.movementResolved,false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('changed real provision contents invalidate a declared mass instead of preserving a fabricated full container',async t=>{
 const call=await engine(t,{dice:'19'});await clearGear(call)
 await replace(call,state=>{state.player.inventory.push({id:'water',equipmentId:'waterskin_full',name:'Outre réelle',type:'misc'})})
 await declare(call,'item','water',4,'measured-outre')
 const initial=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(initial.items[0].weightLb,4)
 await replace(call,state=>{state.player.inventory[0].equipmentId='waterskin_empty'})
 const changed=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(changed.items[0].weightLb,null);assert.equal(changed.items[0].missing,'physical_content_changed')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('absent physical targets and incompatible mass units refuse before allocating histories, actions or dice',async t=>{
 const call=await engine(t,{dice:'19'})
 await refused(call,'declare_physical_weight',{eventId:'missing',targetKind:'object',targetId:'invented',weightLb:100,unit:'lb_total',reason,source},'PHYSICAL_OBJECT_REQUIRED')
 await refused(call,'declare_physical_weight',{eventId:'wrong-unit',targetKind:'item',targetId:'longsword',weightLb:3,unit:'lb_total',reason,source},'PHYSICAL_WEIGHT_UNIT_INVALID')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
