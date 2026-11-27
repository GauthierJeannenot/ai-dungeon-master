const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js')
const begin=(searchId='route')=>({searchId,combatGeneration:1})
const step=(eventId,seconds,searchId='route')=>({searchId,eventId,seconds})
const finish=(recoveryId='collected',searchId='route')=>({recoveryId,searchId,combatGeneration:1,ammunitionType:'arrow'})
const live=()=>gs.getState().dmTools.ammunition.searches.route
async function battlefield(t,{dice='20,1,1,1,19',mixed=false}={}){
 const f=await fixture(t,{realBattle:true,quantity:mixed?1:2,dice,...mixed?{additionalWeapons:['hand-crossbow'],additionalAmmo:[{itemId:'route-bolts',ammunitionType:'crossbow-bolt',quantity:1}]}:{}})
 ok(await f.attack())
 // Establish the second actual firing scene; search travel below always uses
 // real navigation, not fixture coordinates or claimed visited-room lists.
 f.state.player.position={x:7,y:2};gs.visitRoom('other-room');f.state.monsters.target.position={x:10,y:2}
 if(mixed){
  ok(await f.call('use_subclass_feature',{featureId:'action_surge'}))
  ok(await f.call('equip_item',{itemId:'shortbow',slot:'main_hand',operation:'unequip'}));ok(await f.call('equip_item',{itemId:'hand-crossbow',slot:'main_hand',operation:'equip'}))
 }
 ok(await f.attack(mixed?{weaponOrSpell:'hand-crossbow',ammunitionItemId:'route-bolts'}:{}));ok(await f.call('end_combat',{force:true,reason:'Les adversaires ont effectivement abandonné le champ de bataille.'}))
 return f
}
async function walk(f,x,y=2){return ok(await f.call('move_token',{tokenId:'player',toCell:{x,y}}))}
async function searchBoth(f){ok(await f.call('begin_ammunition_search',begin()));ok(await f.call('advance_ammunition_search',step('room-two',30)));await walk(f,1);ok(await f.call('advance_ammunition_search',step('room-one',30)))}

test('two actual battlefield rooms require real navigation and persisted local checkpoints, then recovery spends no second minute',async t=>{
 const f=await battlefield(t),started=f.state.worldTimeSeconds
 const initial=ok(await f.call('begin_ammunition_search',begin()));assert.equal(initial.seconds,0);assert.equal(initial.search.elapsedSeconds,0)
 assert.deepEqual(new Set(initial.search.requiredRoomIds),new Set(['firing-room','other-room']))
 ok(await f.call('advance_ammunition_search',step('room-two',30)))
 assert.equal(live().marks['room-two'].roomId,'other-room');assert.deepEqual(live().marks['room-two'].cell,{x:7,y:2})
 assert.equal(gs.getPlayer().inventory.some(item=>item.id.startsWith('ammo-recovered:')),false)
 const saved=structuredClone(gs.getState());gs.replaceState(saved)
 const retry=ok(await f.call('advance_ammunition_search',step('room-two',30)));assert.equal(retry.seconds,0);assert.deepEqual(gs.getState(),saved)
 const moved=await walk(f,1);assert.ok(moved.path.length>1);assert.equal(moved.currentRoomId,'firing-room')
 const beforeRepeat=structuredClone(gs.getState());ok(await f.call('advance_ammunition_search',step('room-two',30)));assert.deepEqual(gs.getState(),beforeRepeat,'retry never declares the new room visited')
 ok(await f.call('advance_ammunition_search',step('room-one',30)))
 assert.equal(live().elapsedSeconds,60);assert.deepEqual(live().markOrder,['room-two','room-one'])
 const answer=ok(await f.call('recover_ammunition',finish()))
 assert.equal(answer.seconds,0);assert.equal(answer.searchSeconds,60);assert.equal(gs.getState().worldTimeSeconds,started+60)
 assert.equal(answer.recovery.recoveredQuantity,1);assert.equal(answer.recovery.searchId,'route');assert.equal(live().status,'completed')
 assert.match(answer.searchInterpretation,/other travel, waiting or rest time never counts/)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('one room cannot consume the whole minute for a remote room, and waiting time or repeated events never creates search credit',async t=>{
 const f=await battlefield(t);ok(await f.call('begin_ammunition_search',begin()))
 await refused(f,'advance_ammunition_search',step('too-much',60),'AMMUNITION_SEARCH_AREAS_INCOMPLETE')
 ok(await f.call('advance_ammunition_search',step('local',30)))
 await refused(f,'advance_ammunition_search',step('local',20),'AMMUNITION_SEARCH_EVENT_CONFLICT')
 ok(await f.call('advance_time',{seconds:30}));assert.equal(live().elapsedSeconds,30)
 await refused(f,'recover_ammunition',finish(),'AMMUNITION_SEARCH_TIME_INCOMPLETE')
 assert.deepEqual(Object.values(live().marks).map(mark=>mark.roomId),['other-room'])
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a physically visited multi-room search preserves the explicit mixed-type global half and both interpretation notices',async t=>{
 const f=await battlefield(t,{mixed:true});await searchBoth(f)
 const answer=ok(await f.call('recover_ammunition',{recoveryId:'mixed-route',searchId:'route',combatGeneration:1,recoveredCounts:[
  {ammunitionType:'arrow',quantity:0},{ammunitionType:'crossbow-bolt',quantity:1},
 ]}))
 assert.equal(answer.seconds,0);assert.equal(answer.recovery.expendedQuantity,2);assert.equal(answer.recovery.recoveredQuantity,1)
 assert.equal(answer.recovery.composition,'explicit_mj_allocation');assert.match(answer.interpretation,/not an official clarification/)
 assert.match(answer.searchInterpretation,/not an official clarification/);assert.equal(gs.getState().worldTimeSeconds,60)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('restarting an active search ID or using another ID does not reset its performed checkpoints or minute',async t=>{
 const f=await battlefield(t);ok(await f.call('begin_ammunition_search',begin()));ok(await f.call('advance_ammunition_search',step('local',10)))
 const before=structuredClone(gs.getState()),retry=ok(await f.call('begin_ammunition_search',begin()))
 assert.equal(retry.replayed,true);assert.equal(retry.search.elapsedSeconds,10);assert.deepEqual(gs.getState(),before)
 await refused(f,'begin_ammunition_search',begin('new-identity'),'AMMUNITION_SEARCH_ALREADY_STARTED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('inserted or rewritten expenditure witnesses refuse progress before another local second or any ammunition',async t=>{
 const f=await battlefield(t);ok(await f.call('begin_ammunition_search',begin()))
 const original=structuredClone(gs.getState().dmTools.ammunition.expenditures),first=Object.values(original)[0]
 gs.getState().dmTools.ammunition.expenditures['late-insertion']={...structuredClone(first),attackId:'late-insertion'}
 await refused(f,'advance_ammunition_search',step('unproven',10),'AMMUNITION_SEARCH_EXPENDITURES_CHANGED')
 gs.getState().dmTools.ammunition.expenditures=structuredClone(original)
 Object.values(gs.getState().dmTools.ammunition.expenditures)[0].targetCell={x:4,y:2}
 await refused(f,'advance_ammunition_search',step('rewritten',10),'AMMUNITION_SEARCH_EXPENDITURES_CHANGED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an actual new combat interrupts and retains prior search history; a newly chosen search never inherits its seconds',async t=>{
 const f=await battlefield(t,{dice:'20,1,1,1,20,1,19'});ok(await f.call('begin_ammunition_search',begin()));ok(await f.call('advance_ammunition_search',step('before-combat',10)))
 const next=ok(await f.call('spawn_monster',{monsterType:'goblin',cell:{x:10,y:2},hpOverride:200}))
 ok(await f.call('enter_combat',{combatants:['player',next.id]}))
 assert.equal(live().status,'interrupted');assert.equal(live().interrupted.reason,'combat_started');assert.equal(live().elapsedSeconds,10)
 await refused(f,'advance_ammunition_search',step('during-combat',1),'AMMUNITION_RECOVERY_AFTER_BATTLE')
 ok(await f.call('end_combat',{force:true,reason:'Le nouveau combat prend effectivement fin.'}))
 await refused(f,'advance_ammunition_search',step('after-combat',1),'AMMUNITION_SEARCH_INTERRUPTED')
 const restarted=ok(await f.call('begin_ammunition_search',begin('restart-after-combat')));assert.equal(restarted.search.elapsedSeconds,0)
 assert.equal(live().elapsedSeconds,10);assert.equal(live().marks['before-combat'].seconds,10)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real map departure and return retain the interruption frontier while a same-map operation never invents a map change',async t=>{
 const f=await battlefield(t);ok(await f.call('begin_ammunition_search',begin()));ok(await f.call('advance_ammunition_search',step('before-travel',10)))
 const originalMap=gs.getState().currentMapId
 gs.applyMapPassage(originalMap,{x:7,y:2},'other-room');assert.equal(live().status,'active')
 const map=getAdventureMap(),template=map.maps[0],mapId='ammunition-search-other-map'
 map.maps.push({...structuredClone(template),id:mapId,geometry:{...structuredClone(template.geometry),mapId}})
 map.rooms.push({id:'search-other-map-room',mapId,name:'Other map room',zone:{minX:0,maxX:11,minY:0,maxY:4}})
 gs.applyMapPassage(mapId,{x:1,y:2},'search-other-map-room')
 assert.equal(live().status,'interrupted');assert.equal(live().interrupted.reason,'map_changed')
 gs.applyMapPassage(originalMap,{x:7,y:2},'other-room')
 await refused(f,'advance_ammunition_search',step('returned',1),'AMMUNITION_SEARCH_INTERRUPTED')
 assert.equal(live().elapsedSeconds,10)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an incapable player and a real breathing time boundary cannot acquire local search credit or completed ammunition',async t=>{
 const f=await battlefield(t);ok(await f.call('begin_ammunition_search',begin()))
 gs.getPlayer().conditions.push('incapacitated')
 await refused(f,'advance_ammunition_search',step('incapable',10),'ENTITY_INCAPACITATED')
 await refused(f,'recover_ammunition',finish(),'ENTITY_INCAPACITATED')
 gs.getPlayer().conditions=gs.getPlayer().conditions.filter(value=>value!=='incapacitated')
 ok(await f.call('set_breathing_context',{entityId:'player',eventId:'no-air-during-search',mode:'choking',reason:'Absence d’air établie pour ce scénario réel.'}))
 await refused(f,'advance_ammunition_search',step('no-air',30),'ACTIVITY_BREATHING_BOUNDARY')
 assert.equal(live().elapsedSeconds,0);assert.equal(live().markOrder.length,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('completed checkpoint time survives a carrying refusal and a later real drop permits recovery without charging it again',async t=>{
 const f=await battlefield(t);await searchBoth(f)
 ok(await f.call('set_carrying_context',{eventId:'search-size',entityId:'player',size:'Medium',reason:'Taille physique explicitement établie.',source:'Fait physique du scénario : taille Moyenne.'}))
 const capacity=ok(await f.call('inspect_carrying_capacity',{entityId:'player'})),mass=capacity.carryingCapacityLb-capacity.carriedWeightLb
 gs.getPlayer().inventory.push({id:'search-ballast',type:'misc',name:'Ballast réel de recherche'})
 ok(await f.call('declare_physical_weight',{eventId:'search-mass',targetKind:'item',targetId:'search-ballast',weightLb:mass,unit:'lb_per_inventory_unit',reason:'Ballast réellement pesé de cette instance.',source:'Mesure physique du scénario en livres.'}))
 const time=gs.getState().worldTimeSeconds
 await refused(f,'recover_ammunition',finish(),'CARRYING_CAPACITY_EXCEEDED')
 assert.equal(live().status,'active');assert.equal(live().elapsedSeconds,60);assert.equal(gs.getState().worldTimeSeconds,time)
 ok(await f.call('drop_item',{itemId:'search-ballast'}))
 const answer=ok(await f.call('recover_ammunition',finish()));assert.equal(answer.seconds,0);assert.equal(gs.getState().worldTimeSeconds,time)
 assert.equal(answer.recovery.recoveredQuantity,1);assert.equal(live().status,'completed')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
