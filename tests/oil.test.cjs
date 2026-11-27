const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {dealDamage,dealDamageComponents}=require('../mcp-server/dist/mcp-server/monster-rules.js')
const {advanceHeroTime}=require('../mcp-server/dist/mcp-server/hero-rules.js')
const {onOilGroundContact,oilGroundContactIssue,reconcileOilWeather}=require('../mcp-server/dist/mcp-server/oil-ground.js')
const flask=(id='real-oil')=>({id,equipmentId:'oil_flask',name:'Flacon réel d’une pinte',type:'misc'})
async function setup(t,options={}){const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,...options});f.state.player.inventory.push(flask());return f}
const splash=(f,extra={})=>f.call('use_oil_flask',{useId:'real-use',itemId:'real-oil',targetKind:'creature',targetId:'target',mode:'throw',...extra})
function combat(f,ids=['target']){Object.assign(gs.getState(),{phase:'combat',round:1,turnCounter:0,currentTurn:'player',initiativeOrder:['player',...ids],combatGeneration:1,actionUsed:{},bonusActionUsed:{},movementUsed:{}});gs.getState().hero.actionCredits=1;delete gs.getState().hero.attackAction}
async function pour(f,cell={x:2,y:2},extra={}){
 const fact=ok(await f.call('record_scene_fact',{description:'Le carré de sol réellement observé est plat et horizontal.',cell})).worldFact
 return f.call('pour_oil_flask',{useId:'real-pool',itemId:'real-oil',cell,surfaceFactId:fact.id,levelSurfaceConfirmed:true,surfaceZFeet:0,...extra})
}
async function flame(f){
 f.state.player.inventory.push({id:'real-torch',equipmentId:'torch',name:'Torche physique',type:'misc'})
 ok(await f.call('equip_item',{itemId:'longsword',slot:'main_hand',operation:'unequip'}));ok(await f.call('equip_item',{itemId:'real-torch',slot:'main_hand',operation:'equip'}));ok(await f.call('manage_light_source',{itemId:'real-torch',operation:'light'}))
}
test('an actual public oil flask is picked up and thrown outside combat with six real seconds, no impact damage and sixty-second coating',async t=>{
 const f=await setup(t,{dice:'17,19'});f.state.player.inventory=f.state.player.inventory.filter(item=>item.id!=='real-oil')
 ok(await f.call('create_scene_object',{objectId:'stock',name:'Réserve',description:'Un vrai flacon d’huile.',cell:{...f.state.player.position},kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['oil_flask']}))
 const item=ok(await f.call('interact_object',{objectId:'stock',action:'open'})).releasedItems[0];ok(await f.call('pick_up_item',{itemId:item.id}))
 const before=f.target.hp.current,a=ok(await splash(f,{itemId:item.id}));assert.equal(a.hit,true);assert.equal(a.seconds,6);assert.equal(a.appliedAt,6);assert.equal(a.expiresAt,66);assert.equal(a.damageDealt,0);assert.equal(f.target.hp.current,before);assert.equal(a.proficiencyApplied,false)
 assert.equal(f.state.player.inventory.some(value=>value.id===item.id),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a miss spends the exact pint and action time once; retries and restored dose identities cannot refresh or duplicate it',async t=>{
 const f=await setup(t,{dice:'1,19'}),a=ok(await splash(f));assert.equal(a.hit,false);assert.equal(Object.keys(f.state.dmTools.oil.coatings).length,0)
 const saved=structuredClone(gs.getState());gs.replaceState(saved);const hydrated=structuredClone(gs.getState());assert.equal(ok(await splash(f)).replayed,true);assert.deepEqual(gs.getState(),hydrated)
 gs.getState().player.inventory.push(flask());await refused(f,'use_oil_flask',{useId:'another',itemId:'real-oil',targetKind:'creature',targetId:'target',mode:'throw'},'OIL_DOSE_ALREADY_SPENT');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('oil has its exact splash5/throw20 ranges and a full action: no long-range60 extension or Extra Attack payment',async t=>{
 const f=await setup(t,{dice:'19'});await refused(f,'use_oil_flask',{useId:'bad',itemId:'real-oil',targetKind:'creature',targetId:'target',mode:'splash'},'TARGET_OUT_OF_RANGE')
 gs.getState().monsters.target.position={x:6,y:2};await refused(f,'use_oil_flask',{useId:'bad',itemId:'real-oil',targetKind:'creature',targetId:'target',mode:'throw'},'TARGET_OUT_OF_RANGE')
 combat(f);f.state.hero.actionCredits=0;f.state.actionUsed.player=true;f.state.hero.attackAction={id:'real-old-action',used:1,remaining:1}
 await refused(f,'use_oil_flask',{useId:'bad',itemId:'real-oil',targetKind:'creature',targetId:'target',mode:'throw'},'ACTION_ALREADY_USED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('each real positive external fire event adds five once inside the same packet, does not create ongoing fire, and dries at the exact minute',async t=>{
 const f=await setup(t,{dice:'17,19'});ok(await splash(f));const before=f.target.hp.current
 const a=dealDamage('target',2,'fire',{damageEventId:'external-fire-one'});assert.equal(a.rawDamage,7);assert.equal(a.damageDealt,7);assert.equal(f.target.hp.current,before-7);assert.equal(a.oilFire.additionalFireDamage,5)
 const b=dealDamage('target',3,'fire',{damageEventId:'external-fire-two'});assert.equal(b.damageDealt,8)
 const saved=structuredClone(gs.getState());const repeat=dealDamage('target',2,'fire',{damageEventId:'external-fire-one'});assert.deepEqual(repeat,a);assert.deepEqual(gs.getState(),saved)
 advanceHeroTime(60);assert.equal(dealDamage('target',2,'fire',{damageEventId:'dry-fire'}).damageDealt,2);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('immunity or a defended base fire rounded to zero cannot ignite itself; mixed types coalesce and apply oil only once',async t=>{
 const f=await setup(t,{dice:'17,19'});ok(await splash(f));f.target.conditions.push('petrified')
 const zero=dealDamage('target',1,'fire',{damageEventId:'resisted-zero'});assert.equal(zero.damageDealt,0);assert.equal(zero.oilFire,undefined)
 const a=dealDamageComponents('target',[{type:'fire',amount:1},{type:'radiant',amount:4},{type:'fire',amount:2}],{damageEventId:'mixed-fire'})
 assert.equal(a.damageComponents.find(value=>value.damageType==='fire').rawDamage,8);assert.equal(a.damageComponents.find(value=>value.damageType==='fire').damageDealt,4);assert.equal(a.damageDealt,6)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an actual object can be oiled without phantom creature statistics or damage and its real fire defenses/threshold remain authoritative',async t=>{
 const f=await setup(t,{dice:'17,19'});ok(await f.call('create_scene_object',{objectId:'wood',name:'Bois',description:'Un vrai objet en bois.',cell:{x:2,y:1},kind:'container',material:'wood',size:'small',resilience:'resilient'}))
 const a=ok(await splash(f,{targetKind:'object',targetId:'wood'}));assert.equal(a.hit,true);assert.equal(a.damageDealt,0);assert.equal(f.state.monsters.wood,undefined)
 const {resolveOiledObjectDamage}=require('../mcp-server/dist/mcp-server/oil-object-damage.js')
 const r=resolveOiledObjectDamage('wood',[{type:'fire',amount:3}],undefined,'object-real-fire');assert.equal(r.rawDamage,8);assert.equal(r.damageDealt,8)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('public scene fact establishes one real level-square pour without a flame or fictional damage',async t=>{
 const f=await setup(t,{dice:'19'}),a=ok(await pour(f));assert.equal(a.consumed,true);assert.equal(a.seconds,6);assert.equal(a.patch.elevationFeet,0);assert.equal(a.patch.ignitedAt,undefined);assert.equal(f.target.hp.current,200)
 assert.equal(f.state.player.inventory.some(value=>value.id==='real-oil'),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a missing level fact, invented height and unlit source refuse before flask, work, action or dice',async t=>{
 const f=await setup(t,{dice:'19'});await refused(f,'pour_oil_flask',{useId:'bad',itemId:'real-oil',cell:{x:2,y:2},surfaceFactId:'none',levelSurfaceConfirmed:true,surfaceZFeet:0},'OIL_LEVEL_SURFACE_FACT_REQUIRED')
 const fact=ok(await f.call('record_scene_fact',{description:'Sol réellement horizontal.',cell:{x:2,y:2}})).worldFact
 await refused(f,'pour_oil_flask',{useId:'bad',itemId:'real-oil',cell:{x:2,y:2},surfaceFactId:fact.id,levelSurfaceConfirmed:true,surfaceZFeet:10},'OIL_SURFACE_HEIGHT_REQUIRED')
 ok(await pour(f));f.state.player.inventory.push({id:'unlit',equipmentId:'torch',name:'Torche éteinte',type:'misc'});f.state.dmTools.loadout.mainHandId='unlit'
 await refused(f,'ignite_oil_patch',{eventId:'bad',patchId:'real-pool',flameItemId:'unlit'},'OIL_REAL_BURNING_FLAME_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual flame ignites a real empty patch outside combat and twelve seconds can expire without invented victims or turns',async t=>{
 const f=await setup(t,{dice:'19'});f.target.position={x:5,y:2};ok(await pour(f));await flame(f)
 const a=ok(await f.call('ignite_oil_patch',{eventId:'real-ignite',patchId:'real-pool',flameItemId:'real-torch'}));assert.equal(a.burnsUntil-a.ignitedAt,12);assert.equal(a.seconds,6);assert.equal(a.turnResolutionRequired,false)
 const {assertGameTimeAdvance}=require('../mcp-server/dist/mcp-server/time-preflight.js');assertGameTimeAdvance(12);advanceHeroTime(12);assert.equal(onOilGroundContact('player'),undefined);assert.equal(f.state.phase,'exploration');assert.equal(f.state.initiativeOrder.length,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an actual burning surface damages on entry once per global turn, not again on same-turn contact/end, and permits the next real turn',async t=>{
 const f=await setup(t,{dice:'19'});ok(await pour(f));await flame(f);ok(await f.call('ignite_oil_patch',{eventId:'real-ignite',patchId:'real-pool',flameItemId:'real-torch'}));combat(f)
 f.state.player.position={x:2,y:2};const before=f.state.player.hp.current,a=onOilGroundContact('player');assert.equal(a.damageDealt,5);assert.equal(f.state.player.hp.current,before-5)
 const saved=structuredClone(f.state);assert.equal(onOilGroundContact('player').replayed,true);assert.deepEqual(f.state,saved)
 f.state.turnCounter++;assert.equal(onOilGroundContact('player').damageDealt,5);assert.equal(f.state.player.hp.current,before-10)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('real above-surface flight avoids ground oil while unresolved actual support cannot silently take ground damage',async t=>{
 const f=await setup(t,{dice:'19'});ok(await pour(f));await flame(f);ok(await f.call('ignite_oil_patch',{eventId:'real-ignite',patchId:'real-pool',flameItemId:'real-torch'}));combat(f);f.state.player.position={x:2,y:2}
 f.state.dmTools.weather??={version:1,contexts:{},profiles:{},clothing:{},events:{},flights:{},receipts:{}};f.state.dmTools.weather.flights.player={entityId:'player',mapId:f.state.currentMapId,airborne:true,heightFeet:10,revision:1,observedAt:f.state.worldTimeSeconds}
 assert.equal(onOilGroundContact('player'),undefined);assert.equal(Object.keys(f.state.dmTools.oil.damageTurns).length,0)
 f.state.dmTools.weather.flights.player.heightFeet=null;assert.equal(onOilGroundContact('player'),undefined);assert.equal(oilGroundContactIssue(f.state,'player'),null);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a held oil attack keeps its exact object and physical flask through Inspiration, hydration and its single outside-combat work interval',async t=>{
 const f=await setup(t,{dice:'8,6,19'});ok(await f.call('create_scene_object',{objectId:'wood',name:'Bois',description:'Vrai objet en bois.',cell:{x:2,y:1},kind:'container',material:'wood',size:'small',resilience:'resilient'}))
 f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const held=ok(await splash(f,{targetKind:'object',targetId:'wood'}));assert.ok(held.pendingReaction);assert.equal(f.state.worldTimeSeconds,0);assert.equal(f.state.player.inventory.some(value=>value.id==='real-oil'),true)
 gs.replaceState(structuredClone(gs.getState()));const a=ok(await f.call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(a.hit,true);assert.equal(a.seconds,6);assert.equal(gs.getState().worldTimeSeconds,6);assert.equal(gs.getState().player.inventory.some(value=>value.id==='real-oil'),false)
 const before=structuredClone(gs.getState());assert.equal(ok(await splash(f,{targetKind:'object',targetId:'wood'})).replayed,true);assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real choking deadline refuses oil work before the attack d20, pint, action or six-second completion',async t=>{
 const f=await setup(t,{dice:'19'});f.state.player.stats.con=8;require('../mcp-server/dist/mcp-server/breathing.js').setBreathingContext({entityId:'player',eventId:'no-air',mode:'choking',reason:'Privation réelle d’air.'});advanceHeroTime(1)
 await refused(f,'use_oil_flask',{useId:'bad',itemId:'real-oil',targetKind:'creature',targetId:'target',mode:'throw'},'ACTIVITY_BREATHING_BOUNDARY');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('ignition under an existing occupant does not invent entry damage; real player-only initiative then resolves two end turns before expiry',async t=>{
 const f=await setup(t,{dice:'17,19'});delete f.state.monsters.target;ok(await pour(f,{x:1,y:2}));await flame(f)
 const before=f.state.player.hp.current,a=ok(await f.call('ignite_oil_patch',{eventId:'real-ignite',patchId:'real-pool',flameItemId:'real-torch'}));assert.equal(a.turnResolutionRequired,true);assert.equal(f.state.player.hp.current,before)
 const {assertGameTimeAdvance}=require('../mcp-server/dist/mcp-server/time-preflight.js');assert.throws(()=>assertGameTimeAdvance(1),error=>error.code==='OIL_GROUND_TURNS_REQUIRED')
 ok(await f.call('enter_combat',{combatants:['player']}));assert.deepEqual(f.state.initiativeOrder,['player']);assert.equal(f.state.player.hp.current,before)
 ok(await f.call('next_turn',{actorId:'player',skipAction:true}));assert.equal(f.state.player.hp.current,before-5)
 ok(await f.call('next_turn',{actorId:'player',skipAction:true}));assert.equal(f.state.player.hp.current,before-10);assert.equal(f.state.worldTimeSeconds,a.burnsUntil)
 ok(await f.call('end_combat'));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('real affected bodies cannot be omitted from the explicit roster and unrelated player-only initiative remains refused',async t=>{
 const f=await setup(t,{dice:'19'});await refused(f,'enter_combat',{combatants:['player']},'NOT_ENOUGH_COMBATANTS')
 ok(await pour(f));await flame(f);ok(await f.call('ignite_oil_patch',{eventId:'real-ignite',patchId:'real-pool',flameItemId:'real-torch'}));gs.getState().monsters.target.position={x:2,y:2}
 await refused(f,'enter_combat',{combatants:['player']},'OIL_GROUND_ROSTER_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual strong wind extinguishes the mundane open oil flame without removing the real oil history or coating',async t=>{
 const f=await setup(t,{dice:'19'});ok(await pour(f));await flame(f);ok(await f.call('ignite_oil_patch',{eventId:'real-ignite',patchId:'real-pool',flameItemId:'real-torch'}))
 require('../mcp-server/dist/mcp-server/weather.js').configureWeather({eventId:'actual-wind',roomId:f.state.currentRoomId,temperatureF:70,strongWind:true,precipitation:'none',sandstorm:false,fog:'none',source:'Vent fort physiquement établi dans cette salle.'})
 assert.deepEqual(reconcileOilWeather(),[]);assert.equal(f.state.dmTools.oil.patches['real-pool'].extinguishedAt,f.state.worldTimeSeconds);assert.equal(f.state.dmTools.oil.patches['real-pool'].weatherExtinction.revision,1);combat(f);f.state.player.position={x:2,y:2};assert.equal(onOilGroundContact('player'),undefined);assert.equal(Object.keys(f.state.dmTools.oil.damageTurns).length,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('additional oil fire shares exactly one temporary-HP absorption, Death Ward and concentration save with the original typed packet',async t=>{
 const f=await setup(t,{dice:'17,20,19'});ok(await splash(f));f.target.hp.current=4
 const {grantTemporaryHp}=require('../mcp-server/dist/mcp-server/temporary-hp.js');grantTemporaryHp({eventId:'actual-buffer',targetId:'target',sourceId:'actual-established-effect',sourceDescription:'Source préparée du test de dégâts simultanés.',amount:4,duration:{kind:'seconds',seconds:60}})
 f.state.hero.effects.push({id:'actual-ward',kind:'death-ward',sourceId:'player',targetIds:['target'],expiresAt:600,concentration:false,data:{}},{id:'actual-concentration',kind:'fog-cloud',sourceId:'target',targetIds:['target'],expiresAt:600,concentration:true,data:{}});f.state.hero.concentrationIds.target='actual-concentration'
 const a=dealDamageComponents('target',[{type:'fire',amount:10},{type:'radiant',amount:2}],{damageEventId:'one-source-instance'})
 assert.equal(a.rawDamage,17);assert.equal(a.temporaryHp.absorbed,4);assert.equal(f.target.hp.current,1);assert.equal(f.state.hero.effects.some(value=>value.id==='actual-ward'),false);assert.equal(f.state.hero.concentrationIds.target,'actual-concentration')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real stable knocked-out body keeps its oil-exposed initiative slot without gaining an action, then takes its actual end-turn fire',async t=>{
 const f=await setup(t,{dice:'17,2,1,20,1,19'});f.target.position={x:2,y:2};f.target.hp.current=1;combat(f)
 const hit=ok(await f.attack({nonlethal:true}));assert.equal(hit.targetKnockedOut,true);ok(await f.call('end_combat'));ok(await pour(f));await flame(f)
 const ignition=ok(await f.call('ignite_oil_patch',{eventId:'real-ignite',patchId:'real-pool',flameItemId:'real-torch'}));assert.equal(ignition.turnResolutionRequired,true)
 ok(await f.call('enter_combat',{combatants:['player','target']}));ok(await f.call('next_turn',{actorId:'player',skipAction:true}));assert.equal(f.state.currentTurn,'target');assert.equal(f.state.monsters.target.hp.current,0);assert.equal(f.state.monsters.target.isAlive,true)
 const before=structuredClone(f.state);assert.ok(f.state.monsters.target.conditions.includes('unconscious'));assert.throws(()=>require('../mcp-server/dist/mcp-server/rules.js').validateActionUse('target'),error=>error.code==='ENTITY_INCAPACITATED');assert.deepEqual(f.state,before)
 ok(await f.call('next_turn',{actorId:'target',skipAction:true}));assert.equal(f.state.monsters.target.isAlive,true);assert.equal(f.state.monsters.target.npcLife.episode.status,'dying');assert.equal(f.state.monsters.target.npcLife.episode.failures,1);assert.equal(f.state.monsters.target.knockout,undefined);assert.ok(Object.values(f.state.dmTools.oil.damageTurns).some(value=>value.result.targetId==='target'));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the acquired Champion critical range applies to the actual improvised flask attack without inventing impact dice',async t=>{
 const f=await setup(t,{dice:'19,17'});ok(await f.call('create_scene_object',{objectId:'hard-object',name:'Objet réel',description:'Objet en adamantine réellement présent.',cell:{x:2,y:1},kind:'container',material:'adamantine',size:'small',resilience:'resilient'}))
 const a=ok(await splash(f,{targetKind:'object',targetId:'hard-object'}));assert.equal(a.targetAC,23);assert.ok(a.attackRoll.total<a.targetAC);assert.equal(a.criticalHit,true);assert.equal(a.hit,true);assert.equal(a.damageDealt,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('a real alchemist-fire turn tick supplies its own source fire and the oil adds five inside that one actual damage event',async t=>{
 const f=await setup(t,{dice:'17,17,2,19'});ok(await splash(f));f.state.player.inventory.push({id:'real-alchemist',equipmentId:'alchemists_fire_flask',name:'Feu grégeois réel',type:'misc'});combat(f)
 const a=ok(await f.call('use_weapon_consumable',{useId:'actual-fire-use',itemId:'real-alchemist',targetKind:'creature',targetId:'target',mode:'throw'}));assert.equal(a.damageDealt,0);assert.equal(a.burning,true)
 const hp=f.state.monsters.target.hp.current;ok(await f.call('next_turn',{actorId:'player'}));assert.equal(f.state.monsters.target.hp.current,hp-7);assert.equal(Object.keys(f.state.dmTools.oil.fireReceipts).length,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('retained oil-fire capacity preflights a whole explicit fiery multiattack and an individual attack before their first d20 or cost',async t=>{
 const f=await setup(t,{dice:'17,19'});f.target.hp={current:10000,max:10000}
 f.state.player.inventory.push({id:'actual-iron',name:'Barre de fer physique brûlante',type:'misc'})
 const fact=ok(await f.call('record_scene_fact',{description:'Cette barre de fer effectivement présente est réellement brûlante par sa chaleur physique établie.',cell:{...f.state.player.position}})).worldFact
 const reference=ok(await f.call('adjudicate_improvised_weapon',{referenceId:'actual-hot-iron',targetKind:'item',targetId:'actual-iron',mode:'melee',allowProficiency:false,damageType:'fire',hands:1,physicalFactId:fact.id,source:'PHB2014 type physique approprié choisi explicitement.',reason:'Chaleur physique réelle de cette instance, sans effet consommable ou magique créé.'})).reference
 ok(await splash(f));for(let i=0;i<511;i++)dealDamage('target',1,'fire',{damageEventId:`actual-source-${i}`})
 f.state.dmTools.loadout.mainHandId='actual-iron';f.state.monsters.target.position={x:2,y:2};combat(f)
 await refused(f,'resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:reference},{targetId:'target',weaponOrSpell:reference}]},'OIL_FIRE_RECEIPT_LIMIT')
 dealDamage('target',1,'fire',{damageEventId:'actual-source-last'})
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:reference},'OIL_FIRE_RECEIPT_LIMIT');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
