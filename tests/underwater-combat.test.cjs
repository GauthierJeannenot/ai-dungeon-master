const test=require('node:test'),assert=require('node:assert/strict')

const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')

const gs=require('../mcp-server/dist/mcp-server/game-state.js')

const uw=require('../mcp-server/dist/lib/underwater-rules.js')

const {registerUnderwaterTools}=require('../mcp-server/dist/mcp-server/tools/underwater-tools.js')

const {registerSpecialMovementTools}=require('../mcp-server/dist/mcp-server/tools/special-movement-tools.js')

const {adjustedDamage}=require('../mcp-server/dist/mcp-server/monster-rules.js')

const {resolveOiledObjectDamage}=require('../mcp-server/dist/mcp-server/oil-object-damage.js')

const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')

const {pendingStartTurnFire}=require('../mcp-server/dist/lib/weapon-consumable-state.js')

const source='Observation physique du volume d’eau, du corps et de l’attaque réelle par le MJ.'

async function water(t,opts={}){

 const f=await fixture(t,{weapon:'longsword',quantity:null,dice:'17,6,4,19',...opts}),callbacks={}

 const server={registerTool(name,config,callback){callbacks[name]=input=>callback(require('zod').z.object(config.inputSchema).parse(input))}}

 registerUnderwaterTools(server);registerSpecialMovementTools(server)

 const original=f.call;f.call=async(name,input={})=>callbacks[name]?JSON.parse((await callbacks[name](input)).content[0].text):original(name,input)

 f.state.worldFacts.push({id:'water-fact',text:'Bassin et positions physiques mesurés.',source,mapId:f.state.currentMapId,expires:'never'})

 ok(await f.call('record_movement_medium',{eventId:'water-observed',mediumId:'pool',mapId:f.state.currentMapId,roomId:'firing-room',mode:'swim',cells:[{x:1,y:2},{x:2,y:2},{x:3,y:2},{x:4,y:2},{x:5,y:2}],bottomZFeet:0,topZFeet:12,surfaceZFeet:12,factId:'water-fact',actualPhysicalMediumConfirmed:true,handsRequired:0,difficult:false,source}))

 f.observe=(extra={})=>f.call('record_underwater_context',{eventId:'actual-immersion',subject:{kind:'creature',entityId:'player'},waterMediumId:'pool',fullyImmersed:false,factId:'water-fact',actualPhysicalObservationConfirmed:true,source,...extra})

 f.qualify=(extra={})=>f.observe({weaponAttack:{target:{kind:'creature',entityId:'target'},weaponReference:opts.weapon??'longsword',madeUnderwater:true},...extra})

 f.hold=async(id='player')=>{ok(await f.call('set_breathing_context',{entityId:id,eventId:'hold-'+id,mode:'hold_breath',reason:source}));return gs.getState().dmTools.breathing.creatures[id].episode.id}

 return f

}



test('unresolved actual water refuses a nonexempt weapon before attack dice, action and costs',async t=>{

 const f=await water(t);f.target.position={x:2,y:2}

 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'longsword'},'UNDERWATER_ATTACK_CONTEXT_REQUIRED')

 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)

})

test('an explicitly qualified real submerged longsword attack rolls disadvantage once and spends its real action',async t=>{

 const f=await water(t);f.target.position={x:2,y:2};ok(await f.qualify());const a=ok(await f.attack())

 assert.equal(a.underwaterContext.madeUnderwater,true);assert.equal(a.underwaterContext.disadvantage,true);assert.match(a.attackRoll.detail,/DIS/);assert.equal(a.attackRoll.rolls[0],6);assert.equal(f.state.hero.actionCredits,0)

})

for(const weapon of ['dagger','javelin','shortsword','spear','trident'])test('actual '+weapon+' melee retains its PHB underwater exception',async t=>{

 const f=await water(t,{weapon,dice:'17,3,19'});f.target.position={x:2,y:2};ok(await f.qualify());const a=ok(await f.attack({attackMode:'melee'}));assert.equal(a.underwaterContext.disadvantage,false);assert.equal(a.attackRoll.rolls.length,1)

})

test('a submerged shortbow rolls disadvantage within normal range and its physical rule automatically misses beyond that range',async t=>{

 const f=await water(t,{weapon:'shortbow',quantity:3,dice:'19'});f.target.position={x:11,y:2}

 // The real catalog shortbow normal range is16cells; select an actual longer physical projection in the pure rule as well.

 ok(await f.qualify());const context=uw.underwaterWeaponContext(f.state,{actorId:'player',target:{kind:'creature',entityId:'target'},weaponReference:'shortbow',canonicalWeaponId:'shortbow',melee:false,weaponAttack:true,normalRangeCells:8,distanceCells:10}).context

 assert.equal(context.automaticMiss,true)

 const before=f.stock();const a=ok(await f.attack());assert.equal(a.underwaterContext.disadvantage,true);assert.equal(f.stock(),before-1)

})

test('hand crossbow beyond its actual normal range misses without rolling, still paying ammunition and Attack',async t=>{

 const f=await water(t,{weapon:'hand-crossbow',quantity:3,ammunitionType:'crossbow-bolt',dice:'19'});f.target.position={x:11,y:2};ok(await f.qualify());const a=ok(await f.attack())

 assert.equal(a.automaticMiss,true);assert.equal(a.hit,false);assert.deepEqual(a.attackRoll.rolls,[]);assert.equal(f.stock(),2);assert.equal(f.state.hero.actionCredits,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)

})

test('spell attacks and native real swimming speed do not acquire unsupported weapon penalties',async t=>{

 const f=await water(t);f.target.position={x:2,y:2}

 const spell=uw.underwaterWeaponContext(f.state,{actorId:'player',target:{kind:'creature',entityId:'target'},weaponReference:'fire-bolt',melee:false,weaponAttack:false,normalRangeCells:24,distanceCells:1}).context

 assert.equal(spell.disadvantage,false)

 f.state.monsters.swimmer={...structuredClone(getMonsterRecord('giant_frog').engine),id:'swimmer',position:{x:1,y:2},hp:{current:20,max:20},isAlive:true}

 const swim=uw.underwaterWeaponContext(f.state,{actorId:'swimmer',target:{kind:'creature',entityId:'target'},weaponReference:'Bite',melee:true,weaponAttack:true,distanceCells:1}).context

 assert.ok(swim.nativeSwimmingSpeedFeet>0);assert.equal(swim.disadvantage,false)

})

test('whole immersion requires its existing actual breathing episode and grants no free air',async t=>{

 const f=await water(t);await refused(f,'record_underwater_context',{eventId:'missing-breath',subject:{kind:'creature',entityId:'player'},waterMediumId:'pool',fullyImmersed:true,factId:'water-fact',actualPhysicalObservationConfirmed:true,source},'UNDERWATER_BREATHING_CONTEXT_REQUIRED')

 const episode=await f.hold();ok(await f.observe({fullyImmersed:true,breathingEpisodeId:episode}));assert.equal(uw.fullyImmersedInWater(f.state,{kind:'creature',entityId:'player'}),true)

 await refused(f,'set_breathing_context',{entityId:'player',eventId:'invent-air',mode:'air',reason:source},'UNDERWATER_AIR_CONTEXT_REQUIRED')

 assert.equal(f.state.dmTools.breathing.creatures.player.episode.id,episode)

})

test('a new observation nonce cannot emerge the unchanged fully immersed body',async t=>{

 const f=await water(t),episode=await f.hold();ok(await f.observe({fullyImmersed:true,breathingEpisodeId:episode}));const before=structuredClone(f.state)

 const a=await f.observe({eventId:'free-emergence',fullyImmersed:false});assert.equal(a.code,'UNDERWATER_PHYSICAL_CHANGE_REQUIRED');assert.deepEqual(gs.getState(),before)

})

test('changed water invalidates an old exact weapon qualification instead of retaining its exemption',async t=>{

 const f=await water(t);ok(await f.qualify({weaponAttack:{target:{kind:'creature',entityId:'target'},weaponReference:'longsword',madeUnderwater:false}}))

 f.state.dmTools.jumping.locomotion.media.pool.surfaceZFeet=11

 assert.equal(uw.underwaterWeaponContext(f.state,{actorId:'player',target:{kind:'creature',entityId:'target'},weaponReference:'longsword',canonicalWeaponId:'longsword',melee:true,weaponAttack:true,distanceCells:4}).issue.code,'UNDERWATER_ATTACK_CONTEXT_REQUIRED')

})

test('whole creature immersion halves only fire once and keeps other damage unchanged',async t=>{

 const f=await water(t),episode=await f.hold();ok(await f.observe({fullyImmersed:true,breathingEpisodeId:episode}));assert.equal(adjustedDamage(f.state.player,9,'fire').damage,4);assert.equal(adjustedDamage(f.state.player,9,'cold').damage,9)

 f.state.player.conditions.push('petrified');assert.equal(adjustedDamage(f.state.player,9,'fire').damage,4)

})

test('unknown immersion blocks a decisive fire packet but existing fire resistance needs no invented context',async t=>{

 const f=await water(t);assert.throws(()=>adjustedDamage(f.state.player,9,'fire'),e=>e.code==='UNDERWATER_FIRE_CONTEXT_REQUIRED')

 f.state.player.conditions.push('petrified');assert.equal(adjustedDamage(f.state.player,9,'fire').damage,4)

})

test('a whole actual object receives fire resistance without duplicate halving or damage to its marker',async t=>{

 const f=await water(t,{startBattle:false});ok(await f.call('create_scene_object',{objectId:'actual-box',name:'Boîte',description:'Objet réel.',cell:{x:2,y:2},kind:'obstacle',material:'wood',size:'small',resilience:'resilient'}))

 const subject={kind:'object',objectId:'actual-box'};ok(await f.observe({subject,fullyImmersed:true}));const before=structuredClone(f.state.dmTools.objects['actual-box'])

 assert.equal(resolveOiledObjectDamage('actual-box',[{type:'fire',amount:9}]).damageDealt,4);assert.deepEqual(f.state.dmTools.objects['actual-box'],before)

})

test('observations round trip without granting position, swimming speed, action or breath and immutable retries do not mutate',async t=>{

 const f=await water(t);ok(await f.qualify());const saved=structuredClone(f.state);ok(await f.qualify());assert.deepEqual(f.state,saved);gs.replaceState(saved);const restored=gs.getState();assert.deepEqual(restored.dmTools,saved.dmTools);assert.deepEqual(restored.player,saved.player);assert.deepEqual(restored.hero,saved.hero)

})

test('already due start-turn fire waits for physical context then resolves its exact event once without replaying turn/time',async t=>{

 const f=await water(t,{dice:'4,19'});f.state.dmTools.weaponConsumables={receipts:{},burning:{player:{targetId:'player',sourceId:'target',itemId:'actual-flask',useId:'actual-fire',startedAt:0}}}

 const due=pendingStartTurnFire(f.state),before=structuredClone(f.state)

 await refused(f,'resolve_start_turn_fire',{entityId:'player',eventId:due.eventId},'UNDERWATER_FIRE_CONTEXT_REQUIRED')

 ok(await f.observe());const hp=f.state.player.hp.current,turn=f.state.turnCounter,time=f.state.worldTimeSeconds

 const result=ok(await f.call('resolve_start_turn_fire',{entityId:'player',eventId:due.eventId}));assert.equal(result.damageRoll.total,4);assert.equal(f.state.player.hp.current,hp-4);assert.equal(f.state.turnCounter,turn);assert.equal(f.state.worldTimeSeconds,time);assert.equal(pendingStartTurnFire(f.state),undefined)

 const saved=structuredClone(f.state);assert.equal(ok(await f.call('resolve_start_turn_fire',{entityId:'player',eventId:due.eventId})).replayed,true);assert.deepEqual(f.state,saved);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)

})


test('a held underwater attack keeps its original two dice and physical qualification after SQL-shaped hydration and later water changes',async t=>{
 const f=await water(t,{dice:'8,7,3,4,19'});f.target.position={x:2,y:2};f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600});ok(await f.qualify())
 const held=ok(await f.attack());assert.ok(held.pendingReaction);assert.equal(held.pendingReaction.roll.rolls[0],7)
 const saved=structuredClone(f.state);gs.replaceState(saved);gs.getState().dmTools.jumping.locomotion.media.pool.surfaceZFeet=11
 const a=ok(await f.call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(a.underwaterContext.madeUnderwater,true);assert.equal(a.attackRoll.rolls[0],7);assert.match(a.attackRoll.detail,/DIS/);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('forged immersion without its original receipt is rejected before replacing authoritative state',async t=>{
 const f=await water(t);ok(await f.qualify());const saved=structuredClone(f.state),key=Object.keys(saved.dmTools.underwater.subjects)[0]
 saved.dmTools.underwater.subjects[key].fullyImmersed=true;assert.throws(()=>gs.replaceState(saved),e=>e.code==='JUMP_STATE_INVALID')
 assert.equal(gs.getState().dmTools.underwater.subjects[key].fullyImmersed,false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})

test('a second unqualified underwater weapon in one player multiattack refuses the whole action before its first die',async t=>{
 const f=await water(t,{additionalWeapons:['dagger'],dice:'17,6,3,19'});f.target.position={x:2,y:2}
 // Actual off hand, explicit first target/longsword context; the second sword target has no attack qualification.
 f.state.monsters.other={...structuredClone(f.target),id:'other',position:{x:1,y:3}};f.state.initiativeOrder.push('other');ok(await f.qualify())
 await refused(f,'resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:'longsword'},{targetId:'other',weaponOrSpell:'longsword'}]},'UNDERWATER_ATTACK_CONTEXT_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
test('a later source multiattack with unknown underwater context refuses before the first actual attack die',async t=>{
 const f=await water(t,{dice:'17,6,3,19'});const grick={...structuredClone(getMonsterRecord('grick').engine),id:'grick',srd:{index:'grick',ruleset:'2014',url:getMonsterRecord('grick').sourceUrl},position:{x:2,y:2},hp:{current:40,max:40},isAlive:true};f.state.monsters.grick=grick;f.state.initiativeOrder.push('grick');f.state.currentTurn='grick';gs.replaceState(structuredClone(f.state))
 ok(await f.observe({subject:{kind:'creature',entityId:'grick'},weaponAttack:{target:{kind:'creature',entityId:'player'},weaponReference:'Tentacles',madeUnderwater:true}}))
 await refused(f,'resolve_monster_action',{monsterId:'grick',targetId:'player',actionName:'Multiattack',attackActions:['Tentacles','Beak']},'UNDERWATER_ATTACK_CONTEXT_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
