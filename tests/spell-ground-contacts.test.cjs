const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
test.after(()=>pg.restore())
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {buildPlayerState}=require('../mcp-server/dist/lib/character-registry.js')
const {initialHeroState}=require('../mcp-server/dist/lib/hero-state.js')
const {getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js')
async function setup(t,dice='19'){
 const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,dice})
 f.state.player=buildPlayerState({characterId:'bard',level:7,position:{x:1,y:2}});f.state.hero=initialHeroState('bard',7)
 f.state.dmTools.loadout={unarmoredAC:14};f.target.position={x:1,y:3};f.target.hostile=false
 return f
}
async function place(f,id,cell,kind='caltrops'){
 const old={...f.state.player.position};f.state.player.position={x:cell.x,y:cell.y===0?1:cell.y-1}
 f.state.player.inventory.push({id,equipmentId:kind,name:'Vrai lot de test',type:'misc'})
 const fact=ok(await f.call('record_scene_fact',{description:'Le sol existant est réellement stable au plan Z0.',cell})).worldFact
 ok(await f.call('place_ground_gear',{placementId:id,itemId:id,originCell:cell,surfaceZFeet:0,surfaceFactId:fact.id,...kind==='ball_bearings'?{levelSurfaceConfirmed:true}:{}}));f.state.player.position=old
}
function combat(f,ids=['player','target']){Object.assign(f.state,{phase:'combat',currentTurn:'player',initiativeOrder:ids,round:1,turnCounter:0,combatGeneration:1,actionUsed:{},bonusActionUsed:{},movementUsed:{}});f.state.hero.actionCredits=1}
const contact=(f,id)=>Object.values(f.state.dmTools.groundGear.contacts).find(c=>c.entityId===id&&c.status!=='resolved')
const resolve=(f,c)=>f.call('resolve_ground_gear_contact',{contactId:c.id,orderedPlacementIds:c.placementIds})
const pair={spellId:'dimension-door',toCell:{x:4,y:2},companionId:'target',companionToCell:{x:5,y:2},companionWillingConfirmed:true}

test('real Dimension Door commits both explicit arrivals before their contacts and spends its slot once',async t=>{
 const f=await setup(t,'20,20,19');await place(f,'first',{x:4,y:2});await place(f,'second',{x:5,y:2});combat(f)
 const slots=f.state.player.spellSlots.level4.current,result=ok(await f.call('cast_spell',pair))
 assert.deepEqual(f.state.player.position,pair.toCell);assert.deepEqual(f.target.position,pair.companionToCell)
 assert.equal(result.pendingGroundGearContactIds.length,2);assert.equal(f.state.player.spellSlots.level4.current,slots-1)
 const a=contact(f,'player'),b=contact(f,'target');assert.equal(ok(await resolve(f,a)).physicalContinuationComplete,undefined)
 const final=ok(await resolve(f,b));assert.equal(final.physicalContinuationComplete,true)
 const after=structuredClone(f.state);ok(await resolve(f,b));assert.deepEqual(f.state,after)
 assert.equal(f.state.player.spellSlots.level4.current,slots-1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('companion consent and exact destination refuse before slot, action, position or die',async t=>{
 const f=await setup(t);combat(f)
 const missing={...pair};delete missing.companionToCell
 await refused(f,'cast_spell',missing,'TELEPORT_COMPANION_DESTINATION_REQUIRED')
 const unwilling={...pair};delete unwilling.companionWillingConfirmed
 await refused(f,'cast_spell',unwilling,'TELEPORT_COMPANION_INVALID')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a zero-distance actual teleport never manufactures an entry contact',async t=>{
 const f=await setup(t);await place(f,'underfoot',{x:1,y:2});combat(f)
 const result=ok(await f.call('cast_spell',{spellId:'dimension-door',toCell:{...f.state.player.position}}))
 assert.equal(result.pendingGroundGearContactIds,undefined);assert.equal(Object.keys(f.state.dmTools.groundGear.contacts).length,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('Misty Step uses its real bonus action and visible destination, then resolves only the actual arrival contact',async t=>{
 const f=await setup(t,'1,19');await place(f,'destination',{x:2,y:2})
 f.state.player=buildPlayerState({characterId:'wizard',level:3,position:{x:1,y:2}});f.state.hero=initialHeroState('wizard',3);combat(f)
 const slots=f.state.player.spellSlots.level2.current,result=ok(await f.call('cast_spell',{spellId:'misty-step',toCell:{x:2,y:2}}))
 assert.equal(result.pendingGroundGearContactIds.length,1);assert.equal(f.state.bonusActionUsed.player,true);assert.equal(f.state.hero.actionCredits,1)
 const c=contact(f,'player'),done=ok(await resolve(f,c));assert.equal(done.physicalContinuationComplete,true);assert.equal(f.state.player.spellSlots.level2.current,slots-1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('real hazard initiative may explicitly prepare a possible Dimension Door through a wall without casting or moving',async t=>{
 const f=await setup(t,'18,19');await place(f,'behind-wall',{x:5,y:2})
 const map=getAdventureMap();for(let y=0;y<5;y++)map.maps[0].geometry.blockedCells.push({x:3,y})
 f.state.player.conditions.push('grappled');const before=structuredClone(f.state),slots=f.state.player.spellSlots.level4.current
 const result=ok(await f.call('enter_combat',{combatants:['player'],hazardPreparation:{kind:'ground_gear',hazardId:'behind-wall',approach:{source:'spell',spellId:'dimension-door',toCell:{x:5,y:2}}}}))
 assert.equal(result.hazardPreparation.validatedBy,'reachable_magic_approach');assert.deepEqual(f.state.player.position,before.player.position)
 assert.equal(f.state.player.spellSlots.level4.current,slots);assert.equal(Object.keys(f.state.dmTools.groundGear.contacts).length,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a chosen magical preparation cannot ignore unavailable slots or silently choose the hazard destination',async t=>{
 const f=await setup(t);await place(f,'danger',{x:5,y:2});f.state.player.spellSlots.level4.current=0
 await refused(f,'enter_combat',{combatants:['player'],hazardPreparation:{kind:'ground_gear',hazardId:'danger',approach:{source:'spell',spellId:'dimension-door',toCell:{x:5,y:2}}}},'SPELL_SLOTS_EXHAUSTED')
 f.state.player.spellSlots.level4.current=1
 await refused(f,'enter_combat',{combatants:['player'],hazardPreparation:{kind:'ground_gear',hazardId:'danger',approach:{source:'spell',spellId:'dimension-door',toCell:{x:4,y:2}}}},'HAZARD_MAGIC_APPROACH_MISSES')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('Thunderwave applies its damage once before two actual forced-step contacts; voluntary stopping never erases its push',async t=>{
 const f=await setup(t,'2,2,1,1,1,19');await place(f,'first-step',{x:3,y:2});await place(f,'second-step',{x:4,y:2})
 f.target.position={x:2,y:2};f.target.hostile=true;combat(f)
 const slots=f.state.player.spellSlots.level1.current,result=ok(await f.call('cast_spell',{spellId:'thunderwave',direction:{x:1,y:0}}))
 assert.equal(f.target.hp.current,196);assert.deepEqual(f.target.position,{x:3,y:2});assert.equal(result.physicalPush.cursor,1)
 const first=contact(f,'target'),resumed=ok(await resolve(f,first));assert.equal(resumed.groundGearContact.movementStopped,true)
 assert.deepEqual(f.target.position,{x:4,y:2});assert.equal(f.target.hp.current,195);assert.equal(resumed.physicalPush.cursor,2)
 const last=contact(f,'target'),finished=ok(await resolve(f,last));assert.equal(finished.physicalPush.completed,true);assert.equal(f.target.hp.current,194)
 const after=structuredClone(f.state);ok(await resolve(f,last));assert.deepEqual(f.state,after)
 assert.equal(f.state.player.spellSlots.level1.current,slots-1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('Thunderwave refuses the capacity of both possible future steps before its damage dice or slot',async t=>{
 const f=await setup(t,'19');await place(f,'first-step',{x:3,y:2});await place(f,'second-step',{x:4,y:2});f.target.position={x:2,y:2};f.target.hostile=true;combat(f)
 const data=f.state.dmTools.groundGear
 // Saturation fixture: retained, resolved source contacts, never pending work.
 data.contacts=Object.fromEntries(Array.from({length:511},(_,n)=>{const id=`past-contact-${n}`;return[id,{id,entityId:'target',mapId:f.state.currentMapId,cell:{x:3,y:2},at:0,turnKey:'past-turn',placementIds:['first-step'],kind:'forced',status:'resolved',cursor:1,results:[],stopMovement:false}]}))
 await refused(f,'cast_spell',{spellId:'thunderwave',direction:{x:1,y:0}},'GROUND_GEAR_CONTACT_LIMIT')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a trap produced by the first forced step can end only the remaining push without repeating damage',async t=>{
 const f=await setup(t,'2,2,1,1,3,19'),cell={x:3,y:2},old={...f.state.player.position};f.state.player.position={x:3,y:1}
 f.state.player.inventory.push({id:'real-trap',equipmentId:'hunting_trap',name:'Vrai piège',type:'misc'})
 const floor=ok(await f.call('record_scene_fact',{description:'Le vrai sol est stable au plan Z0.',cell})).worldFact
 ok(await f.call('create_scene_object',{objectId:'fixed-ring',name:'Anneau',description:'Anneau réellement ancré.',cell,kind:'lever',material:'iron',size:'tiny',resilience:'resilient'}))
 const anchor=ok(await f.call('record_scene_fact',{description:'Cet anneau existant est réellement immobile et la chaîne réelle y est fixée.',cell})).worldFact
 ok(await f.call('place_ground_gear',{placementId:'real-trap',itemId:'real-trap',originCell:cell,surfaceZFeet:0,surfaceFactId:floor.id,anchorObjectId:'fixed-ring',anchorFactId:anchor.id,immobileAnchorConfirmed:true}))
 f.state.player.position=old;f.target.position={x:2,y:2};f.target.hostile=true;combat(f)
 ok(await f.call('cast_spell',{spellId:'thunderwave',direction:{x:1,y:0}}));assert.equal(f.target.hp.current,196)
 const c=contact(f,'target'),input={contactId:c.id,orderedPlacementIds:c.placementIds,plateContacts:[{placementId:'real-trap',stepped:true,source:'Le pied réellement poussé actionne la vraie plaque.'}]}
 const result=ok(await f.call('resolve_ground_gear_contact',input));assert.equal(result.physicalBoundary.code,'HUNTING_TRAP_CHAIN_LIMIT');assert.deepEqual(f.target.position,{x:3,y:2});assert.equal(f.target.hp.current,193)
 const after=structuredClone(f.state);ok(await f.call('resolve_ground_gear_contact',input));assert.deepEqual(f.state,after);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real scroll arrival and its held contact survive SQL without rereading the scroll, rerolling or paying twice',async t=>{
 const {engine,replace,adjacent}=require('./helpers/mcp-toolkit.cjs'),call=await engine(t,{characterId:'bard',dice:'18,10,8,19'})
 let state=await call('get_game_state');const toCell=adjacent(state)[0]
 await replace(call,s=>s.player.inventory.push({id:'real-caltrops',equipmentId:'caltrops',name:'Vrai sac',type:'misc'}))
 const fact=ok(await call('record_scene_fact',{description:'Cette case réellement existante est au sol stable Z0.',cell:toCell})).worldFact
 ok(await call('place_ground_gear',{placementId:'real-caltrops',itemId:'real-caltrops',originCell:toCell,surfaceZFeet:0,surfaceFactId:fact.id}))
 state=await call('get_game_state');ok(await call('create_spell_scroll',{itemId:'real-door-scroll',spellId:'dimension-door',name:'Parchemin réel',description:'Un vrai parchemin déjà inscrit.',cell:state.player.position}));ok(await call('pick_up_item',{itemId:'real-door-scroll'}))
 ok(await call('enter_combat',{combatants:['player'],hazardPreparation:{kind:'ground_gear',hazardId:'real-caltrops',approach:{source:'scroll',spellId:'dimension-door',scrollItemId:'real-door-scroll',toCell}}}))
 await replace(call,s=>s.hero.inspiration.push({targetId:'player',expiresAt:s.worldTimeSeconds+600,die:8}))
 const before=await call('get_game_state'),cast=ok(await call('use_spell_scroll',{itemId:'real-door-scroll',toCell}));assert.equal(cast.pendingGroundGearContactIds.length,1)
 state=await call('get_game_state');assert.equal(state.dmTools.spellScrolls['real-door-scroll'].status,'consumed');assert.deepEqual(state.player.position,toCell)
 const c=state.dmTools.groundGear.contacts[cast.pendingGroundGearContactIds[0]],held=ok(await call('resolve_ground_gear_contact',{contactId:c.id,orderedPlacementIds:c.placementIds}));assert.ok(held.pendingReaction)
 state=await call('get_game_state');const id=`spell-ground-held-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
 const restored=(await loadSession(id)).gameState;ok(await call('replace_game_state',{gameState:restored}))
 const result=ok(await call('resolve_reaction',{pendingId:restored.hero.pending.id,choice:'bardic_inspiration'}));assert.equal(result.physicalContinuationComplete,true)
 const after=await call('get_game_state');assert.deepEqual(after.player.spellSlots,before.player.spellSlots);assert.equal(after.dmTools.spellScrolls['real-door-scroll'].status,'consumed');assert.equal(after.hero.actionCredits,0)
 assert.equal(after.player.hp.current,before.player.hp.current);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
