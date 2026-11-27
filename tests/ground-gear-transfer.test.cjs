const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,replace}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
const explanation='Travail physique réellement observé, durée explicitement établie par le MJ ; aucun tarif publié ni fraction de masse déduite.'
async function fact(call,description,itemId){const state=await call('get_game_state');return ok(await call('record_scene_fact',{description,cell:state.player.position,...itemId?{subjectItemId:itemId}:{}})).worldFact.id}
async function setup(t,kind='caltrops'){
 const half=kind==='ball_bearings'?500:10,call=await engine(t,{dice:'19'});await replace(call,s=>s.player.inventory.push({id:'actual-full-lot',equipmentId:kind,name:'Vrai lot initial',type:'misc',quantity:1},{id:'source-pouch',equipmentId:'pouch',name:'Bourse source',type:'misc',quantity:1},{id:'destination-pouch',equipmentId:'pouch',name:'Bourse destination',type:'misc',quantity:1},{id:'other-pouch',equipmentId:'pouch',name:'Autre bourse',type:'misc',quantity:1}))
 let state=await call('get_game_state');if(!state.dmTools?.loadout){const held=state.player.inventory.find(i=>i.type==='weapon');if(held)ok(await call('equip_item',{itemId:held.id,operation:'unequip',slot:'main_hand'}))}
 state=await call('get_game_state');for(const[key,slot]of [['mainHandId','main_hand'],['offHandId','off_hand'],['shieldId','shield']])if(state.dmTools?.loadout?.[key]){ok(await call('equip_item',{itemId:state.dmTools.loadout[key],operation:'unequip',slot}));state=await call('get_game_state')}
 let origin={...state.player.position}
 if(kind==='ball_bearings'){const {grid}=require('./helpers/mcp-toolkit.cjs'),{inferRoomIdOnMap}=require('../mcp-server/dist/lib/adventure-map.js'),nav=grid(state);origin=[-1,0].flatMap(dx=>[-1,0].map(dy=>({x:state.player.position.x+dx,y:state.player.position.y+dy}))).find(c=>[c,{x:c.x+1,y:c.y},{x:c.x,y:c.y+1},{x:c.x+1,y:c.y+1}].every(p=>nav.valid(p)&&nav.free(p,false)&&inferRoomIdOnMap(p,state.currentMapId,state)===state.currentRoomId));assert.ok(origin)}
 const surfaceFactId=ok(await call('record_scene_fact',{description:'Le vrai sol est stable et nivelé au plan Z0.',cell:origin})).worldFact.id
 const placed=ok(await call('place_ground_gear',{placementId:'actual-placement',itemId:'actual-full-lot',originCell:origin,surfaceZFeet:0,surfaceFactId,...kind==='ball_bearings'?{levelSurfaceConfirmed:true}:{}})).placement
 const remainingCoverageFactId=ok(await call('record_scene_fact',{description:'Les vraies unités restantes couvrent toujours les cellules explicitement choisies de la surface existante.',cell:origin})).worldFact.id,containerFactId=await fact(call,'Les récipients existants ont réellement la capacité libre annoncée, compte tenu de leur contenu actuel.')
 const recover=async(id,container,remaining)=>{
  ok(await call('start_ground_gear_recovery',{eventId:`start-${id}`,recoveryId:id,placementId:'actual-placement',units:half,containerItemId:container,containerFactId,actualContainerConfirmed:true,availableCapacityUnits:half*2,capacityForCurrentContentsConfirmed:true,requiredSeconds:6,workSeconds:6,remainingCells:remaining?placed.cells:[],...remaining?{remainingCoverageFactId,remainingCoverageConfirmed:true}:{},restActivity:'light',activitySource:explanation}))
  return ok(await call('finish_ground_gear_recovery',{eventId:`finish-${id}`,recoveryId:id})).stock
 }
 const source=await recover('source-recovery','source-pouch',true),destination=await recover('destination-recovery','destination-pouch',false)
 const input={eventId:'actual-transfer-start',transferId:'actual-transfer',sourceStockItemId:source.itemId,destinationContainerItemId:'destination-pouch',destinationStockItemId:destination.itemId,units:half,containerFactId,actualContainerConfirmed:true,availableCapacityUnits:half,capacityForCurrentContentsConfirmed:true,requiredSeconds:12,workSeconds:6,restActivity:'light',activitySource:explanation}
 return{call,source,destination,input,origin}
}
async function refuse(call,name,input,code){const before=await call('get_game_state'),result=await call(name,input);assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await call('get_game_state'),before)}
const finish=(call,id='actual-transfer',eventId='actual-transfer-finish')=>call('finish_ground_gear_transfer',{eventId,transferId:id})
test('explicit carried-stock fusion preserves exact provenance, both real pouches and one redeployable20unit stock through SQL',async t=>{
 const{call,source,destination,input,origin}=await setup(t),before=await call('get_game_state')
 ok(await call('start_ground_gear_transfer',input));let state=await call('get_game_state');assert.equal(state.dmTools.groundGear.stocks[source.itemId].units,10);assert.equal(state.dmTools.groundGear.stocks[destination.itemId].units,10);assert.equal(state.worldTimeSeconds,before.worldTimeSeconds+6)
 await refuse(call,'finish_ground_gear_transfer',{eventId:'too-early',transferId:input.transferId},'GROUND_GEAR_TRANSFER_NOT_DUE')
 const id=`ground-transfer-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});ok(await call('replace_game_state',{gameState:(await loadSession(id)).gameState}))
 ok(await call('continue_ground_gear_transfer',{eventId:'actual-work-two',transferId:input.transferId,workSeconds:6,restActivity:'light',activitySource:explanation}));const done=ok(await finish(call));assert.equal(done.unitsTransferred,10)
 state=await call('get_game_state');assert.equal(state.dmTools.groundGear.stocks[source.itemId],undefined);assert.equal(state.dmTools.groundGear.stocks[destination.itemId].units,20);assert.deepEqual(state.dmTools.groundGear.stocks[destination.itemId].sourcePlacements,['actual-placement'])
 for(const pouch of ['source-pouch','destination-pouch'])assert.equal(state.player.inventory.filter(i=>i.id===pouch).length,1)
 assert.equal(state.player.inventory.some(i=>i.equipmentId==='caltrops'),false);ok(await call('replace_game_state',{gameState:state}));ok(await finish(call));assert.deepEqual(await call('get_game_state'),state)
 const surfaceFactId=await fact(call,'Le vrai sol est toujours physiquement stable au même plan Z0.')
 ok(await call('place_ground_gear',{placementId:'reconstituted-real-placement',itemId:destination.itemId,originCell:origin,surfaceZFeet:0,surfaceFactId}));state=await call('get_game_state');assert.equal(state.dmTools.groundGear.placements['reconstituted-real-placement'].unitsRemaining,20);assert.equal(state.player.inventory.some(i=>i.id==='destination-pouch'),true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a partial split to an explicitly chosen empty actual container keeps exact remaining units and creates no full bag',async t=>{
 const{call,source,input}=await setup(t),split={...input,units:4,destinationContainerItemId:'other-pouch',requiredSeconds:6};delete split.destinationStockItemId
 ok(await call('start_ground_gear_transfer',split));const done=ok(await finish(call)),state=await call('get_game_state'),created=Object.values(done.stocks).find(s=>s.containerItemId==='other-pouch')
 assert.equal(state.dmTools.groundGear.stocks[source.itemId].units,6);assert.equal(created.units,4);assert.equal(created.measuredWeightLb,undefined);assert.equal(state.player.inventory.filter(i=>i.id==='other-pouch').length,1);assert.equal(state.player.inventory.some(i=>i.equipmentId==='caltrops'),false)
 ok(await call('replace_game_state',{gameState:state}));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
 const forged=structuredClone(state);forged.dmTools.groundGear.stocks[created.itemId].units++
 await refuse(call,'replace_game_state',{gameState:forged},'GROUND_GEAR_STATE_MISMATCH')
})
test('missing merge choice, wrong container, unavailable units and current capacity refuse before work or dice',async t=>{
 const{call,input}=await setup(t),missing={...input};delete missing.destinationStockItemId
 await refuse(call,'start_ground_gear_transfer',missing,'GROUND_GEAR_TRANSFER_MERGE_CHOICE_REQUIRED')
 await refuse(call,'start_ground_gear_transfer',{...input,destinationContainerItemId:'invented-pouch'},'GROUND_GEAR_TRANSFER_CONTAINER_REQUIRED')
 await refuse(call,'start_ground_gear_transfer',{...input,units:11},'GROUND_GEAR_UNITS_UNAVAILABLE')
 await refuse(call,'start_ground_gear_transfer',{...input,availableCapacityUnits:9},'GROUND_GEAR_CONTAINER_CAPACITY')
 ok(await call('start_ground_gear_transfer',input));await refuse(call,'start_ground_gear_transfer',{...input,units:9},'GROUND_GEAR_EVENT_CONFLICT')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('changed actual contents or a deposited container cannot be silently substituted at completion; cancellation refunds nothing',async t=>{
 const{call,input}=await setup(t);ok(await call('start_ground_gear_transfer',{...input,requiredSeconds:6}));ok(await call('drop_item',{itemId:'destination-pouch'}))
 await refuse(call,'finish_ground_gear_transfer',{eventId:'changed-finish',transferId:input.transferId},'GROUND_GEAR_TRANSFER_CONTAINER_REQUIRED')
 const before=await call('get_game_state');ok(await call('cancel_ground_gear_transfer',{eventId:'actual-cancel',transferId:input.transferId,reason:'Le vrai récipient a été déposé ; cette procédure est annulée sans transfert.'}));const after=await call('get_game_state');assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.deepEqual(after.player.inventory,before.player.inventory);assert.deepEqual(after.droppedItems,before.droppedItems)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('tracked carrying requires measured total remainder and destination masses before work, never a prorated full bag',async t=>{
 const{call,source,destination,input}=await setup(t)
 await replace(call,s=>{s.player.inventory=s.player.inventory.filter(i=>['source-pouch','destination-pouch',source.itemId,destination.itemId].includes(i.id));s.dmTools.loadout={unarmoredAC:10+Math.floor((s.player.stats.dex-10)/2)}})
 ok(await call('set_carrying_context',{eventId:'actual-size',entityId:'player',size:'Medium',reason:'Taille réelle observée.',source:'Mesure physique actuelle.'}))
 const partial={...input,units:4,requiredSeconds:6}
 await refuse(call,'start_ground_gear_transfer',partial,'CARRYING_DATA_REQUIRED')
 await refuse(call,'start_ground_gear_transfer',{...partial,measuredSourceRemainingWeightLb:.6},'GROUND_GEAR_MASS_FACT_REQUIRED')
 const measured={...partial,measuredSourceRemainingWeightLb:.6,sourceWeightFactId:await fact(call,'Les six unités réelles restant dans le récipient source ont été pesées ensemble : 0,6 livre.'),measuredDestinationWeightLb:1.4,destinationWeightFactId:await fact(call,'Les quatorze unités réelles de destination ont été pesées ensemble : 1,4 livre, récipient exclu.')}
 await refuse(call,'start_ground_gear_transfer',{...measured,measuredDestinationWeightLb:10000},'CARRYING_CAPACITY_EXCEEDED')
 ok(await call('start_ground_gear_transfer',measured));ok(await finish(call));const state=await call('get_game_state')
 assert.equal(state.dmTools.groundGear.stocks[source.itemId].measuredWeightLb,.6);assert.equal(state.dmTools.groundGear.stocks[destination.itemId].measuredWeightLb,1.4)
 const weight=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(weight.status,'resolved');ok(await call('replace_game_state',{gameState:state}));assert.equal(ok(await call('inspect_carrying_capacity',{entityId:'player'})).carriedWeightLb,weight.carriedWeightLb)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('combat work pays only real actions, never advances its own clock, and auxiliary finish waits for actual elapsed time',async t=>{
 const{call,input}=await setup(t),{battle}=require('./helpers/mcp-toolkit.cjs');await battle(call,[])
 const before=await call('get_game_state');ok(await call('start_ground_gear_transfer',input));let state=await call('get_game_state');assert.equal(state.worldTimeSeconds,before.worldTimeSeconds);assert.equal(state.hero.actionCredits,0)
 await refuse(call,'continue_ground_gear_transfer',{eventId:'impossible-extra-action',transferId:input.transferId,workSeconds:6,restActivity:'light',activitySource:explanation},'ACTION_ALREADY_USED')
 ok(await call('next_turn',{actorId:'player',skipAction:true}));ok(await call('continue_ground_gear_transfer',{eventId:'next-real-action',transferId:input.transferId,workSeconds:6,restActivity:'light',activitySource:explanation}))
 await refuse(call,'finish_ground_gear_transfer',{eventId:'not-elapsed',transferId:input.transferId},'GROUND_GEAR_TRANSFER_NOT_DUE')
 ok(await call('next_turn',{actorId:'player',skipAction:true}));ok(await finish(call));state=await call('get_game_state');assert.equal(state.worldTimeSeconds,before.worldTimeSeconds+12);assert.equal(state.hero.actionCredits,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('incapacity supplies no completion work, while explicit cancellation remains bookkeeping only',async t=>{
 const{call,input}=await setup(t);ok(await call('start_ground_gear_transfer',{...input,requiredSeconds:6}));await replace(call,s=>s.player.conditions.push('incapacitated'))
 await refuse(call,'finish_ground_gear_transfer',{eventId:'incapable-finish',transferId:input.transferId},'ENTITY_INCAPACITATED')
 const before=await call('get_game_state');ok(await call('cancel_ground_gear_transfer',{eventId:'incapable-cancel',transferId:input.transferId,reason:'Annulation comptable explicite, aucun travail pendant incapacité.'}));const after=await call('get_game_state')
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.deepEqual(after.player,before.player);assert.deepEqual(after.dmTools.groundGear.stocks,before.dmTools.groundGear.stocks)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('two actual500bearing stocks explicitly reconstitute one1000unit deployment without manufacturing a bag',async t=>{
 const{call,destination,input,origin}=await setup(t,'ball_bearings');ok(await call('start_ground_gear_transfer',{...input,requiredSeconds:6}));ok(await finish(call))
 let state=await call('get_game_state');assert.equal(state.dmTools.groundGear.stocks[destination.itemId].units,1000);assert.equal(state.player.inventory.some(i=>i.equipmentId==='ball_bearings'),false)
 const surfaceFactId=ok(await call('record_scene_fact',{description:'La vraie surface existante est toujours nivelée, stable au plan Z0.',cell:origin})).worldFact.id
 ok(await call('place_ground_gear',{placementId:'actual-reconstituted-bearings',itemId:destination.itemId,originCell:origin,surfaceZFeet:0,surfaceFactId,levelSurfaceConfirmed:true}));state=await call('get_game_state')
 assert.equal(state.dmTools.groundGear.placements['actual-reconstituted-bearings'].unitsRemaining,1000);assert.equal(state.dmTools.groundGear.placements['actual-reconstituted-bearings'].sourceContainerItemId,'destination-pouch');assert.equal(state.player.inventory.filter(i=>i.id==='destination-pouch').length,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
