const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {prepareGroundGearStep,recordGroundGearContact,groundGearMovementIssue}=require('../mcp-server/dist/mcp-server/ground-gear-contacts.js')
const {groundGearWalkingPenalty,groundGearStoppedThisTurn}=require('../mcp-server/dist/lib/ground-gear-state.js')
const gear=(kind,id='real-gear')=>({id,equipmentId:kind,name:'Équipement réel du scénario',type:'misc'})
async function setup(t,kind='caltrops',options={}){const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,...options});f.state.player.inventory.push(gear(kind));return f}
async function place(f,kind='caltrops',extra={}){
 const originCell=kind==='ball_bearings'?{x:1,y:1}:{x:2,y:2},fact=ok(await f.call('record_scene_fact',{description:'Cette surface physique réellement observée est du sol stable ; le carré de billes est nivelé.',cell:originCell})).worldFact
 return f.call('place_ground_gear',{placementId:'real-placement',itemId:'real-gear',originCell,surfaceZFeet:0,surfaceFactId:fact.id,...kind==='ball_bearings'?{levelSurfaceConfirmed:true}:{},...extra})
}
function combat(f,current='player'){Object.assign(gs.getState(),{phase:'combat',round:1,turnCounter:0,currentTurn:current,initiativeOrder:['player','target'],combatGeneration:1,actionUsed:{},bonusActionUsed:{},movementUsed:{}});gs.getState().hero.actionCredits=1;delete gs.getState().hero.attackAction}
function contact(f,id='target',cell={x:2,y:2},kind='forced'){
 gs.moveToken(id,cell.x,cell.y,{voluntaryFootstep:kind==='walk',groundContactKind:kind})
 const already=Object.values(gs.getState().dmTools.groundGear.contacts).find(value=>value.entityId===id&&value.status!=='resolved')
 return already
}
const resolve=(f,c,extra={})=>f.call('resolve_ground_gear_contact',{contactId:c.id,orderedPlacementIds:c.placementIds,...extra})
async function trap(f,extra={}){
 ok(await f.call('create_scene_object',{objectId:'real-anchor',name:'Anneau fixe',description:'Un anneau de fixation physiquement ancré dans cette dalle.',cell:{x:2,y:2},kind:'lever',material:'iron',size:'tiny',resilience:'resilient'}))
 const anchor=ok(await f.call('record_scene_fact',{description:'Cet anneau réellement présent est immobile et la vraie chaîne du piège y est fixée.',cell:{x:2,y:2}})).worldFact
 return place(f,'hunting_trap',{anchorObjectId:'real-anchor',anchorFactId:anchor.id,immobileAnchorConfirmed:true,...extra})
}
test('a real public bag is placed once with its source area and six actual work seconds, without invented entry damage or stock',async t=>{
 const f=await setup(t,'ball_bearings',{dice:'19'});f.state.player.inventory=f.state.player.inventory.filter(item=>item.id!=='real-gear')
 ok(await f.call('create_scene_object',{objectId:'stock',name:'Réserve',description:'Un vrai sac de billes.',cell:{...f.state.player.position},kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['ball_bearings']}))
 const item=ok(await f.call('interact_object',{objectId:'stock',action:'open'})).releasedItems[0];ok(await f.call('pick_up_item',{itemId:item.id}))
 const a=ok(await place(f,'ball_bearings',{itemId:item.id}));assert.equal(a.seconds,6);assert.equal(a.placement.units,1000);assert.equal(a.placement.unitsRemaining,1000);assert.equal(a.placement.cells.length,4);assert.equal(f.state.player.inventory.some(value=>value.id===item.id),false);assert.equal(Object.keys(f.state.dmTools.groundGear.contacts).length,0);assert.equal(f.state.player.conditions.includes('prone'),false)
 const before=structuredClone(f.state);const replay=ok(await f.call('place_ground_gear',{placementId:'real-placement',itemId:item.id,originCell:{x:1,y:1},surfaceZFeet:0,surfaceFactId:a.placement.surfaceFactId,levelSurfaceConfirmed:true}));assert.equal(replay.replayed,true);assert.deepEqual(f.state,before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real teleport leaves the external anchored trap closed in place only after the body actually commits its departure',async t=>{
 const f=await setup(t,'hunting_trap',{dice:'1,2,19'});ok(await trap(f));combat(f);const c=contact(f)
 ok(await resolve(f,c,{plateContacts:[{placementId:'real-placement',stepped:true,source:'Le vrai pied est pris dans le dispositif externe fixé au sol.'}]}))
 const trapState=gs.getState().dmTools.groundGear.placements['real-placement'],projection=structuredClone(gs.getState());projection.monsters.target.position={x:4,y:2}
 const from=prepareGroundGearStep(gs.getState(),'target','teleport');assert.equal(groundGearMovementIssue(projection,'target','teleport',from),null);assert.equal(trapState.victimId,'target')
 gs.moveToken('target',4,2,{groundContactKind:'teleport'});assert.equal(trapState.victimId,undefined);assert.equal(trapState.status,'sprung');assert.deepEqual(trapState.cells,[{x:2,y:2}]);assert.deepEqual(gs.getMonster('target').position,{x:4,y:2})
 gs.replaceState(structuredClone(gs.getState()));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a genuinely longer anchored chain follows the trapped foot within its real limit and a teleport leaves the device at that last position',async t=>{
 const f=await setup(t,'hunting_trap',{dice:'1,2,19'});ok(await trap(f,{chainLengthFeet:10}));combat(f);const c=contact(f)
 ok(await resolve(f,c,{plateContacts:[{placementId:'real-placement',stepped:true,source:'Le pied réel referme la mâchoire.'}]}))
 // This scenario supplies the genuinely measured longer chain; no new equipment is granted.
 const trapState=gs.getState().dmTools.groundGear.placements['real-placement']
 gs.moveToken('target',3,2);assert.deepEqual(trapState.cells,[{x:3,y:2}]);assert.equal(trapState.anchor.zFeet,0);assert.deepEqual(trapState.anchor.cell,{x:2,y:2})
 const before=structuredClone(gs.getState());assert.throws(()=>gs.moveToken('target',5,2),error=>error.code==='HUNTING_TRAP_CHAIN_LIMIT');assert.deepEqual(gs.getState(),before)
 gs.moveToken('target',5,2,{groundContactKind:'teleport'});assert.equal(trapState.victimId,undefined);assert.deepEqual(trapState.cells,[{x:3,y:2}]);gs.replaceState(structuredClone(gs.getState()));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an ordinary intermap passage never becomes magical freedom from an actual anchored trap, and refuses before state mutation',async t=>{
 const f=await setup(t,'hunting_trap',{dice:'1,2,19'});ok(await trap(f));combat(f);const c=contact(f,'player')
 ok(await resolve(f,c,{plateContacts:[{placementId:'real-placement',stepped:true,source:'Le pied du joueur est réellement pris dans le piège fixé à cette carte.'}]}))
 const map=require('../mcp-server/dist/lib/adventure-map.js').getAdventureMap();map.maps.push({...structuredClone(map.maps[0]),id:'actual-other-map',geometry:undefined});map.rooms.push({id:'actual-arrival-room',mapId:'actual-other-map',name:'Autre pièce réellement définie',zone:{minX:0,maxX:11,minY:0,maxY:4}})
 const before=structuredClone(gs.getState());assert.throws(()=>gs.applyMapPassage('actual-other-map',{x:1,y:2},'actual-arrival-room'),error=>error.code==='HUNTING_TRAP_CHAIN_GEOMETRY_REQUIRED');assert.deepEqual(gs.getState(),before);assert.equal(gs.getState().dmTools.groundGear.placements['real-placement'].victimId,'player');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('bearings require a real level square, and traps require a real immobile anchor before item, action, time or dice',async t=>{
 const f=await setup(t,'ball_bearings',{dice:'19'}),cell={x:1,y:1},fact=ok(await f.call('record_scene_fact',{description:'Sol réel du scénario.',cell})).worldFact
 await refused(f,'place_ground_gear',{placementId:'bad',itemId:'real-gear',originCell:cell,surfaceZFeet:0,surfaceFactId:fact.id},'BALL_BEARINGS_LEVEL_REQUIRED')
 gs.getState().player.inventory.find(value=>value.id==='real-gear').equipmentId='hunting_trap'
 await refused(f,'place_ground_gear',{placementId:'bad',itemId:'real-gear',originCell:cell,surfaceZFeet:0,surfaceFactId:fact.id},'HUNTING_TRAP_REAL_ANCHOR_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('legacy ownership of a bag never supplies a manipulating hand beside the actually inferred weapon and shield',async t=>{
 const f=await setup(t,'caltrops',{dice:'19'});f.state.player.inventory.push({id:'actual-shield',equipmentId:'shield',name:'Bouclier réel',type:'armor',acBonus:2});delete f.state.dmTools.loadout
 const cell={x:2,y:2},fact=ok(await f.call('record_scene_fact',{description:'Sol réellement présent.',cell})).worldFact
 await refused(f,'place_ground_gear',{placementId:'bad',itemId:'real-gear',originCell:cell,surfaceZFeet:0,surfaceFactId:fact.id},'GROUND_GEAR_FREE_HAND_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the actual failed caltrops save stops this global turn and gives walking-10 only after real piercing, until actualHP gain',async t=>{
 const f=await setup(t,'caltrops',{dice:'1,19'});ok(await place(f));combat(f)
 const c=contact(f),a=ok(await resolve(f,c));assert.equal(a.contactResults[0].save.dc,15);assert.equal(a.contactResults[0].damageDealt,1);assert.equal(gs.getState().monsters.target.hp.current,199);assert.equal(groundGearWalkingPenalty(gs.getState(),'target'),10);assert.equal(groundGearStoppedThisTurn(gs.getState(),'target'),true)
 gs.updateMonsterHP('target',0);assert.equal(groundGearWalkingPenalty(gs.getState(),'target'),10)
 const {grantTemporaryHp}=require('../mcp-server/dist/mcp-server/temporary-hp.js');grantTemporaryHp({eventId:'real-buffer',targetId:'target',sourceId:'actual-prepared-source',sourceDescription:'Source explicite du test de PV temporaires.',amount:1,duration:{kind:'seconds',seconds:60}});assert.equal(groundGearWalkingPenalty(gs.getState(),'target'),10)
 gs.updateMonsterHP('target',1);assert.equal(groundGearWalkingPenalty(gs.getState(),'target'),0);gs.getState().turnCounter++;assert.equal(groundGearStoppedThisTurn(gs.getState(),'target'),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a true failed save still stops caltrops movement when defended piercing becomes zero, without inventing the walking injury',async t=>{
 const f=await setup(t,'caltrops',{dice:'19'});ok(await place(f));combat(f);f.state.monsters.target.conditions.push('petrified')
 const c=contact(f),a=ok(await resolve(f,c));assert.equal(a.contactResults[0].save.success,false);assert.equal(a.contactResults[0].damageDealt,0);assert.equal(groundGearWalkingPenalty(gs.getState(),'target'),0);assert.equal(groundGearStoppedThisTurn(gs.getState(),'target'),true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('one true bearing traversal gets DEX10/prone and no second per-subcell save, while outside reentry creates a new actual contact',async t=>{
 const f=await setup(t,'ball_bearings',{dice:'1,20,19'});ok(await place(f,'ball_bearings'));combat(f)
 const c=contact(f),a=ok(await resolve(f,c));assert.equal(a.contactResults[0].save.dc,10);assert.equal(a.movementStopped,true);assert.ok(gs.getState().monsters.target.conditions.includes('prone'))
 assert.equal(contact(f,'target',{x:2,y:1}),undefined);contact(f,'target',{x:3,y:1});const again=contact(f,'target',{x:2,y:1});assert.ok(again);assert.equal(ok(await resolve(f,again)).contactResults[0].save.success,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a held contact save survives hydration and Inspiration without another entry, action, attack or duplicate piercing',async t=>{
 const f=await setup(t,'caltrops',{dice:'10,6,19'});ok(await place(f));combat(f);f.state.hero.inspiration.push({targetId:'target',die:8,expiresAt:600})
 const c=contact(f),held=ok(await resolve(f,c));assert.ok(held.pendingReaction);assert.equal(gs.getState().monsters.target.hp.current,200)
 gs.replaceState(structuredClone(gs.getState()));const before=structuredClone(gs.getState());assert.equal(ok(await resolve(f,c)).alreadyPending,true);assert.deepEqual(gs.getState(),before)
 const a=ok(await f.call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(a.contactResults[0].save.success,true);assert.equal(gs.getState().monsters.target.hp.current,200);assert.equal(gs.getState().dmTools.groundGear.contacts[c.id].status,'resolved');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('pending actual contacts block a new pace, action or time before costs instead of being erased',async t=>{
 const f=await setup(t,'caltrops',{dice:'19'});ok(await place(f));combat(f);contact(f)
 await refused(f,'set_ground_gear_pace',{eventId:'too-late',entityId:'player',pace:'careful'},'GROUND_GEAR_CONTACT_DUE')
 const {assertGameTimeAdvance}=require('../mcp-server/dist/mcp-server/time-preflight.js');assert.throws(()=>assertGameTimeAdvance(1),error=>error.code==='GROUND_GEAR_CONTACT_DUE');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the small pressure plate is an explicit physical decision, not every creature entering its5foot cell',async t=>{
 const f=await setup(t,'hunting_trap',{dice:'19'});ok(await trap(f));combat(f);const c=contact(f)
 await refused(f,'resolve_ground_gear_contact',{contactId:c.id,orderedPlacementIds:c.placementIds},'HUNTING_TRAP_PRESSURE_FACT_REQUIRED')
 const a=ok(await resolve(f,c,{plateContacts:[{placementId:'real-placement',stepped:false,source:'Le vrai pas observé évite la petite plaque centrale.'}]}));assert.equal(a.contactResults[0].skipped,'actual_plate_not_stepped_on');assert.equal(gs.getState().dmTools.groundGear.placements['real-placement'].status,'armed');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real hunting trap uses DEX13/1d4, anchored chain geometry, real STR13 actions and failed-opening1piercing without restrained',async t=>{
 const f=await setup(t,'hunting_trap',{dice:'1,3,1,20,19'});ok(await trap(f));combat(f,'target');const c=contact(f)
 const a=ok(await resolve(f,c,{plateContacts:[{placementId:'real-placement',stepped:true,source:'Le pied réel appuie effectivement sur la plaque.'}]}));assert.equal(a.contactResults[0].save.dc,13);assert.equal(a.contactResults[0].damageRoll.notation,'1d4');assert.equal(gs.getState().monsters.target.hp.current,197);assert.equal(gs.getState().monsters.target.conditions.includes('restrained'),false)
 const projection=structuredClone(gs.getState());projection.monsters.target.position={x:3,y:2};assert.equal(groundGearMovementIssue(projection,'target','walk').code,'HUNTING_TRAP_CHAIN_LIMIT')
 ok(await f.call('next_turn',{actorId:'target',skipAction:true}));const bad=ok(await f.call('escape_hunting_trap',{eventId:'first-opening',placementId:'real-placement',actorId:'player',targetId:'target'}));assert.equal(bad.freed,false);assert.equal(bad.damageDealt,1);assert.equal(gs.getState().monsters.target.hp.current,196)
 ok(await f.call('use_subclass_feature',{featureId:'action_surge'}));const good=ok(await f.call('escape_hunting_trap',{eventId:'second-opening',placementId:'real-placement',actorId:'player',targetId:'target'}));assert.equal(good.freed,true);assert.equal(gs.getState().dmTools.groundGear.placements['real-placement'].victimId,undefined);assert.equal(gs.getState().dmTools.groundGear.placements['real-placement'].status,'sprung');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an actual walk directly off a newly covered bearing square still records that crossing instead of testing only the final outside cell',async t=>{
 const f=await setup(t,'ball_bearings',{dice:'1,19'});ok(await place(f,'ball_bearings'));combat(f)
 const c=contact(f,'player',{x:0,y:2},'walk');assert.ok(c);assert.deepEqual(c.stepWitness.fromCell,{x:1,y:2});assert.deepEqual(c.cell,{x:0,y:2})
 const a=ok(await resolve(f,c));assert.equal(a.contactResults[0].save.dc,10);assert.equal(a.movementStopped,true);assert.ok(gs.getState().player.conditions.includes('prone'));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('successfully dodging the actual plate closes that same trap, with no free next target until a new actual setting action',async t=>{
 const f=await setup(t,'hunting_trap',{dice:'20,1,2,19'});ok(await trap(f));combat(f);const first=contact(f)
 ok(await resolve(f,first,{plateContacts:[{placementId:'real-placement',stepped:true,source:'Vrai contact du pied avec la plaque.'}]}));assert.equal(gs.getState().dmTools.groundGear.placements['real-placement'].status,'sprung');assert.equal(gs.getState().dmTools.groundGear.placements['real-placement'].victimId,undefined)
 contact(f,'target',{x:3,y:2});assert.equal(contact(f,'target',{x:2,y:2}),undefined)
 const reset=ok(await f.call('reset_hunting_trap',{eventId:'actual-reset',placementId:'real-placement'}));assert.equal(reset.actionSpent,true);assert.equal(gs.getState().hero.actionCredits,0)
 contact(f,'target',{x:3,y:2});const second=contact(f,'target',{x:2,y:2});assert.ok(second);assert.equal(ok(await resolve(f,second,{plateContacts:[{placementId:'real-placement',stepped:true,source:'Second vrai pas après réarmement effectif.'}]})).contactResults[0].damageDealt,2)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a held actual trap-opening check preserves its one action and STR roll through hydration, then exact retries never open or hurt twice',async t=>{
 const f=await setup(t,'hunting_trap',{dice:'1,2,5,6,19'});ok(await trap(f));combat(f,'target');const c=contact(f);ok(await resolve(f,c,{plateContacts:[{placementId:'real-placement',stepped:true,source:'Pied physiquement engagé.'}]}));ok(await f.call('next_turn',{actorId:'target',skipAction:true}))
 gs.getState().hero.inspiration.push({targetId:'player',die:8,expiresAt:600});const input={eventId:'actual-held-opening',placementId:'real-placement',actorId:'player',targetId:'target'}
 const held=ok(await f.call('escape_hunting_trap',input));assert.ok(held.pendingReaction);assert.equal(gs.getState().hero.actionCredits,1);assert.equal(gs.getState().monsters.target.hp.current,198)
 gs.replaceState(structuredClone(gs.getState()));const a=ok(await f.call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(a.freed,true);assert.equal(gs.getState().hero.actionCredits,0);assert.equal(gs.getState().monsters.target.hp.current,198)
 const before=structuredClone(gs.getState());assert.equal(ok(await f.call('escape_hunting_trap',input)).replayed,true);assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('simultaneous devices require one complete explicit order and retain the separately chosen exact plate contact',async t=>{
 const f=await setup(t,'hunting_trap',{dice:'1,19'});ok(await trap(f));f.state.player.inventory.push(gear('caltrops','other-gear'));const fact=ok(await f.call('record_scene_fact',{description:'La même dalle porte réellement les chausse-trappes.',cell:{x:2,y:2}})).worldFact
 ok(await f.call('place_ground_gear',{placementId:'actual-caltrops',itemId:'other-gear',originCell:{x:2,y:2},surfaceZFeet:0,surfaceFactId:fact.id}));combat(f);const c=contact(f);assert.equal(c.placementIds.length,2)
 await refused(f,'resolve_ground_gear_contact',{contactId:c.id,orderedPlacementIds:['actual-caltrops']},'GROUND_GEAR_COMPLETE_ORDER_REQUIRED')
 const a=ok(await f.call('resolve_ground_gear_contact',{contactId:c.id,orderedPlacementIds:['actual-caltrops','real-placement'],plateContacts:[{placementId:'real-placement',stepped:false,source:'Le pied se blesse sur une pointe, sans toucher la petite plaque centrale.'}]}));assert.deepEqual(a.contactResults.map(value=>value.placementId),['actual-caltrops','real-placement']);assert.equal(a.contactResults[0].damageDealt,1);assert.equal(a.contactResults[1].skipped,'actual_plate_not_stepped_on');assert.equal(gs.getState().dmTools.groundGear.placements['real-placement'].status,'armed');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('real recovered contents cannot be equipped or thrown separately from their actual container, including legacy held ownership, before costs or dice',async t=>{
 const f=await setup(t,'caltrops',{dice:'19'}),callbacks={},server={tool(n,d,s,fn){callbacks[n]=v=>fn(require('zod').z.object(s).parse(v))},registerTool(n,c,fn){callbacks[n]=v=>fn(require('zod').z.object(c.inputSchema).parse(v))}}
 require('../mcp-server/dist/mcp-server/tools/ground-gear-recovery-tools.js').registerGroundGearRecoveryTools(server)
 const original=f.call;f.call=async(n,v={})=>callbacks[n]?JSON.parse((await callbacks[n](v)).content[0].text):original(n,v)
 f.state.player.inventory.push({id:'actual-pouch',equipmentId:'pouch',name:'Bourse réellement possédée',type:'misc'})
 const cell={...f.state.player.position},fact=ok(await f.call('record_scene_fact',{description:'Sol réel et capacité disponible du vrai récipient confirmés à cet emplacement.',cell})).worldFact.id
 ok(await place(f,'caltrops',{originCell:cell,surfaceFactId:fact}))
 ok(await f.call('start_ground_gear_recovery',{eventId:'actual-recovery-start',recoveryId:'actual-recovery',placementId:'real-placement',units:10,containerItemId:'actual-pouch',containerFactId:fact,actualContainerConfirmed:true,availableCapacityUnits:20,capacityForCurrentContentsConfirmed:true,requiredSeconds:6,workSeconds:6,remainingCells:[cell],remainingCoverageFactId:fact,remainingCoverageConfirmed:true,restActivity:'light',activitySource:'Ramassage réellement effectué et chronométré, sans masse fractionnaire supposée.'}))
 const recovered=ok(await f.call('finish_ground_gear_recovery',{eventId:'actual-recovery-finish',recoveryId:'actual-recovery'}))
 await refused(f,'equip_item',{itemId:recovered.stock.itemId,slot:'off_hand',operation:'equip'},'GROUND_GEAR_CONTAINER_SELECTION_REQUIRED')
 ok(await f.call('adjudicate_improvised_weapon',{referenceId:'actual-stock-throw',targetKind:'item',targetId:recovered.stock.itemId,mode:'thrown',allowProficiency:false,damageType:'piercing',hands:1,source:'Vraies pointes choisies explicitement par le MJ.',reason:'La sélection ne les retire pas du vrai récipient.'}))
 delete gs.getState().dmTools.loadout
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'actual-stock-throw'},'IMPROVISED_OBJECT_NOT_HELD')
 assert.equal(gs.getState().dmTools.groundGear.stocks[recovered.stock.itemId].units,10);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an untracked living zeroHP history refuses the whole possible damaging trap contact before the first DEX or d4 and before springing its jaws',async t=>{
 const f=await setup(t,'hunting_trap',{dice:'19'});ok(await trap(f));combat(f);const c=contact(f);gs.getMonster('target').hp.current=0
 await refused(f,'resolve_ground_gear_contact',{contactId:c.id,orderedPlacementIds:c.placementIds,plateContacts:[{placementId:'real-placement',stepped:true,source:'Vrai contact de plaque, mais histoire de zéro PV encore inconnue.'}]},'NPC_ZERO_HP_UNTRACKED')
 assert.equal(gs.getState().dmTools.groundGear.placements['real-placement'].status,'armed');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
