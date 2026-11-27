const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,adjacent}=require('./helpers/mcp-toolkit.cjs')
const source='Observation physique réelle du sol dans cette scène.'
async function stock(call,equipmentId,id){
 const state=await call('get_game_state')
 ok(await call('create_scene_object',{objectId:id,name:'Réserve réelle',description:'Équipement réellement fourni.',cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:[equipmentId]}))
 const item=ok(await call('interact_object',{objectId:id,action:'open'})).releasedItems[0]
 ok(await call('pick_up_item',{itemId:item.id}));return item
}
async function freeHands(call){
 const state=await call('get_game_state')
 for(const [equipmentId,slot] of [['shield','shield'],['longsword','main_hand']]){
  const item=state.player.inventory.find(value=>(value.equipmentId??value.id)===equipmentId)
  if(item){const answer=await call('equip_item',{itemId:item.id,operation:'unequip',slot});if(answer.error)assert.equal(answer.code,'ITEM_NOT_EQUIPPED',JSON.stringify(answer))}
 }
}
async function realDanger(call,kind='oil'){
 await freeHands(call)
 const item=await stock(call,kind==='oil'?'oil_flask':'caltrops','actual-danger-stock')
 const state=await call('get_game_state'),cell=adjacent(state)[0]
 const fact=ok(await call('record_scene_fact',{description:source,cell})).worldFact
 if(kind==='ground_gear'){
  ok(await call('place_ground_gear',{placementId:'actual-caltrops',itemId:item.id,originCell:cell,surfaceZFeet:0,surfaceFactId:fact.id,levelSurfaceConfirmed:true}))
  return {cell,hazardPreparation:{kind,hazardId:'actual-caltrops'}}
 }
 ok(await call('pour_oil_flask',{useId:'actual-patch',itemId:item.id,cell,surfaceFactId:fact.id,levelSurfaceConfirmed:true,surfaceZFeet:0}))
 const torch=await stock(call,'torch','actual-flame-stock')
 ok(await call('equip_item',{itemId:torch.id,slot:'main_hand',operation:'equip'}))
 ok(await call('manage_light_source',{itemId:torch.id,operation:'light'}))
 ok(await call('ignite_oil_patch',{eventId:'actual-ignition',patchId:'actual-patch',flameItemId:torch.id}))
 return{cell,hazardPreparation:{kind,hazardId:'actual-patch'}}
}
async function refusedUnchanged(call,input,code){
 const before=await call('get_game_state'),answer=await call('enter_combat',input)
 assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)
}

test('no solo initiative can be manufactured from an absent danger or without its explicit selection',async t=>{
 const call=await engine(t,{dice:'19'})
 await refusedUnchanged(call,{combatants:['player']},'NOT_ENOUGH_COMBATANTS')
 await refusedUnchanged(call,{combatants:['player'],hazardPreparation:{kind:'oil',hazardId:'invented'}},'ACTIVE_HAZARD_REQUIRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an explicitly selected reachable burning patch permits real initiative before contact, without moving or damaging anyone',async t=>{
 const call=await engine(t,{dice:'19,17'}),danger=await realDanger(call),before=await call('get_game_state')
 await refusedUnchanged(call,{combatants:['player']},'NOT_ENOUGH_COMBATANTS')
 const answer=ok(await call('enter_combat',{combatants:['player'],hazardPreparation:danger.hazardPreparation}))
 assert.deepEqual(answer.initiativeOrder,['player']);assert.equal(answer.hazardPreparation.hazardId,'actual-patch')
 const after=await call('get_game_state')
 assert.deepEqual(after.player.position,before.player.position);assert.deepEqual(after.player.hp,before.player.hp)
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.equal(Object.keys(after.dmTools.oil.damageTurns).length,0)
 assert.deepEqual(Object.keys(after.monsters),Object.keys(before.monsters),'preparation creates no foe')
 await refusedUnchanged(call,{combatants:['player'],hazardPreparation:danger.hazardPreparation},'COMBAT_ALREADY_ACTIVE')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17,'only one actual initiative die was rolled')
})

test('a physical obstacle blocking the selected oil square refuses preparation before initiative or mutation',async t=>{
 const call=await engine(t,{dice:'19'}),danger=await realDanger(call)
 ok(await call('create_scene_object',{objectId:'actual-blocker',name:'Obstacle réel',description:'Un bloc physiquement infranchissable.',cell:danger.cell,kind:'obstacle',material:'stone',size:'small',resilience:'resilient'}))
 await refusedUnchanged(call,{combatants:['player'],hazardPreparation:danger.hazardPreparation},'DESTINATION_BLOCKED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a patch that has actually burned out cannot be renamed into an active danger',async t=>{
 const call=await engine(t,{dice:'19'}),danger=await realDanger(call)
 ok(await call('advance_time',{seconds:12}))
 await refusedUnchanged(call,{combatants:['player'],hazardPreparation:danger.hazardPreparation},'ACTIVE_HAZARD_REQUIRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real hidden local oil victim requires explicit participation without being revealed',async t=>{
 const call=await engine(t,{dice:'19,7,17'}),danger=await realDanger(call)
 await replace(call,state=>{state.npcs.sarah.position={...danger.cell};state.npcs.sarah.visible=false})
 const before=await call('get_game_state')
 await refusedUnchanged(call,{combatants:['player'],hazardPreparation:danger.hazardPreparation},'OIL_GROUND_ROSTER_REQUIRED')
 ok(await call('enter_combat',{combatants:['player','sarah'],hazardPreparation:danger.hazardPreparation}))
 const after=await call('get_game_state');assert.ok(after.initiativeOrder.includes('sarah'))
 assert.equal(after.npcs.sarah.visible,false);assert.equal(after.monsters.sarah.visible,false)
 assert.deepEqual(after.npcs.sarah.hp,before.npcs.sarah.hp);assert.deepEqual(after.player.hp,before.player.hp)
 assert.deepEqual(after.worldFacts,before.worldFacts);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('a real deployed caltrops lot also permits preparation without inventing a contact or second actor',async t=>{
 const call=await engine(t,{dice:'19,17'}),danger=await realDanger(call,'ground_gear'),before=await call('get_game_state')
 const answer=ok(await call('enter_combat',{combatants:['player'],hazardPreparation:danger.hazardPreparation}))
 assert.equal(answer.hazardPreparation.hazardId,'actual-caltrops');const after=await call('get_game_state')
 assert.deepEqual(after.player.position,before.player.position);assert.deepEqual(after.player.hp,before.player.hp)
 assert.deepEqual(after.dmTools.groundGear.contacts,before.dmTools.groundGear.contacts)
 assert.deepEqual(after.initiativeOrder,['player']);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('a resolved caltrops stop must finish its real turn before a forced combat exit can clear initiative',async t=>{
 const {fixture}=require('./helpers/ammunition-fixture.cjs')
 const gs=require('../mcp-server/dist/mcp-server/game-state.js')
 const {registerGroundGearTools}=require('../mcp-server/dist/mcp-server/tools/ground-gear-tools.js')
 const {prepareGroundGearStep,recordGroundGearContact}=require('../mcp-server/dist/mcp-server/ground-gear-contacts.js')
 const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,dice:'19,3,1,17'})
 const callbacks={};registerGroundGearTools({registerTool(name,config,fn){callbacks[name]=args=>fn(require('zod').z.object(config.inputSchema).parse(args))}})
 const call=async(name,input={})=>callbacks[name]?JSON.parse((await callbacks[name](input)).content[0].text):f.call(name,input)
 f.state.player.inventory.push({id:'actual-stop-bag',equipmentId:'caltrops',name:'Vrai sac de20chausse-trappes',type:'misc'})
 const cell={x:2,y:2},fact=ok(await call('record_scene_fact',{description:source,cell})).worldFact
 ok(await call('place_ground_gear',{placementId:'actual-stop-hazard',itemId:'actual-stop-bag',originCell:cell,surfaceZFeet:0,surfaceFactId:fact.id,levelSurfaceConfirmed:true}))
 ok(await call('enter_combat',{combatants:['player','target']}))
 const from=prepareGroundGearStep(gs.getState(),'player','walk')
 // Fixture of one already committed physical step; the real contact backend
 // records its witness and resolves the actual source save, not a forged stop.
 gs.getState().player.position={...cell}
 recordGroundGearContact('player','walk',from)
 const contact=Object.values(gs.getState().dmTools.groundGear.contacts).find(value=>value.status==='waiting');assert.ok(contact)
 ok(await call('resolve_ground_gear_contact',{contactId:contact.id,orderedPlacementIds:['actual-stop-hazard']}))
 assert.ok(gs.getState().dmTools.groundGear.stops.player)
 const before=structuredClone(gs.getState())
 assert.equal((await call('end_combat',{force:true,reason:'La scène se termine réellement.'})).code,'CALTROPS_TURN_UNRESOLVED')
 assert.deepEqual(gs.getState(),before,'refusal precedes XP, phase, initiative or resource changes')
 ok(await call('pass_turn',{reason:'Le joueur laisse réellement finir son tour.'}))
 ok(await call('end_combat',{force:true,reason:'Le vrai tour est désormais terminé.'}))
 assert.equal(gs.getState().phase,'exploration')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})
