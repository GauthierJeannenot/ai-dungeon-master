const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {addHeroEffect,removeHeroEffect}=require('../mcp-server/dist/mcp-server/hero-rules.js')
const {NetStateSchema,validateNetState}=require('../mcp-server/dist/lib/net-state.js')
const form=(f,formless=false,eventId='actual-form')=>f.call('set_net_creature_form',{eventId,entityId:'target',formless,reason:'Forme physique effectivement établie avant le lancer.',source:'Fait de corps du scénario, indépendant du nom et du dessin du jeton.'})
async function setup(t,{distance=1,dice='17,16,19',knownForm=true,additionalWeapons=[],targetType}={}){
 const f=await fixture(t,{weapon:'net',quantity:null,dice,additionalWeapons})
 if(targetType){const source=getMonsterRecord(targetType);assert.ok(source,targetType);f.state.monsters.target={...structuredClone(source.engine),id:'target',position:{x:1+distance,y:2},hp:{current:200,max:200},isAlive:true}}
 else f.state.monsters.target.position={x:1+distance,y:2}
 if(knownForm)ok(await form(f))
 return {...f,target:()=>gs.getState().monsters.target,throw:()=>f.call('resolve_player_attack',{targetId:'target',weaponOrSpell:'net'}),binding:id=>gs.getState().dmTools.nets.bindings[id]}
}
async function caught(t,options){const f=await setup(t,options),answer=ok(await f.throw());assert.equal(answer.net.status,'restraining');return{...f,answer,id:answer.net.id}}
async function hold(f,id){const loadout=gs.getState().dmTools.loadout;if(loadout.mainHandId)ok(await f.call('equip_item',{itemId:loadout.mainHandId,slot:'main_hand',operation:'unequip'}));ok(await f.call('equip_item',{itemId:id,slot:'main_hand',operation:'equip'}))}
function nextPlayerTurn(){gs.advanceTurn();gs.advanceTurn();assert.equal(gs.getState().currentTurn,'player')}

test('a net throw has a real ranged d20 and physical item, deals zero damage and ends the whole Attack action',async t=>{
 const f=await caught(t),answer=f.answer
 assert.equal(answer.damageDealt,0);assert.equal(answer.damageRoll,undefined);assert.equal(f.target().hp.current,200)
 assert.match(answer.attackRoll.detail,/^DIS:/);assert.equal(answer.naturalRoll,16)
 assert.ok(f.target().conditions.includes('restrained'));assert.equal(f.state.hero.attackAction.remaining,0);assert.equal(f.state.hero.actionCredits,0)
 assert.ok(!f.state.player.inventory.some(i=>i.id==='net'));assert.deepEqual(f.state.droppedItems.net.position,f.target().position)
 assert.equal(f.state.dmTools.loadout.mainHandId,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
 assert.equal(validateNetState(f.state).length,0);assert.equal(NetStateSchema.safeParse(f.state.dmTools.nets).success,true)
 gs.replaceState(structuredClone(f.state));assert.equal((await f.call('inspect_net',{netId:f.id})).status,'restraining')
})
test('a miss still launches the real net and permits no second attack, without any damage die',async t=>{
 const f=await setup(t,{dice:'8,7,19'}),answer=ok(await f.throw())
 assert.equal(answer.hit,false);assert.equal(answer.net.status,'missed');assert.equal(answer.damageDealt,0);assert.equal(f.target().hp.current,200)
 assert.equal(f.target().conditions.includes('restrained'),false);assert.equal(f.state.hero.attackAction.remaining,0);assert.ok(f.state.droppedItems.net)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('unknown form, out-of-range and a forged knockout choice refuse before net/action/dice changes',async t=>{
 const f=await setup(t,{knownForm:false,dice:'19'})
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'net'},'NET_TARGET_FORM_REQUIRED')
 ok(await form(f));f.target().position={x:5,y:2}
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'net'},'TARGET_OUT_OF_RANGE')
 f.target().position={x:2,y:2}
 const before=structuredClone(f.state),answer=await f.call('resolve_player_attack',{targetId:'target',weaponOrSpell:'net',nonlethal:false})
 assert.ok(answer.error);assert.deepEqual(f.state,before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the complete explicit multiattack cannot include a net plus another attack before the first die',async t=>{
 const f=await setup(t,{dice:'19'})
 await refused(f,'resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:'net'},{targetId:'target',weaponOrSpell:'unarmed'}]},'NET_ONLY_ATTACK')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a net cannot follow a prior attack of the same action, but an explicitly paid new Action Surge action can use it',async t=>{
 const f=await setup(t,{dice:'17,17,16,19'})
 ok(await f.call('resolve_player_attack',{targetId:'target',weaponOrSpell:'unarmed'}));assert.equal(f.state.hero.attackAction.remaining,1)
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'net'},'NET_ONLY_ATTACK')
 ok(await f.call('use_class_feature',{featureId:'action_surge'}))
 const answer=ok(await f.call('resolve_player_attack',{targetId:'target',weaponOrSpell:'net',newAttackAction:true}));assert.equal(answer.net.status,'restraining')
 assert.equal(f.state.hero.actionCredits,0);assert.equal(f.state.hero.attackAction.remaining,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('source Huge size makes a net ineffective without any inferred form',async t=>{
 const f=await setup(t,{targetType:'awakened_tree',knownForm:false}),answer=ok(await f.throw())
 assert.equal(answer.hit,true);assert.equal(answer.net.status,'ineffective');assert.equal(answer.net.targetWitness.size,'Huge')
 assert.equal(answer.net.targetWitness.reason,'too_large');assert.equal(f.target().conditions.includes('restrained'),false);assert.equal(f.target().hp.current,200)
})
test('an explicitly established formless creature is not restrained, and a source restrained immunity is preserved',async t=>{
 const f=await setup(t);ok(await form(f,true,'actual-formless'));const answer=ok(await f.throw())
 assert.equal(answer.net.status,'ineffective');assert.equal(answer.net.targetWitness.reason,'formless');assert.equal(f.target().conditions.includes('restrained'),false)
})
test('actual native restrained immunity makes the net ineffective without an inferred corporeal form',async t=>{
 const f=await setup(t,{targetType:'will_o_wisp',knownForm:false}),answer=ok(await f.throw())
 assert.equal(answer.hit,true);assert.equal(answer.net.status,'ineffective');assert.equal(answer.net.targetWitness.reason,'source_restrained_immunity')
 assert.equal(f.target().conditions.includes('restrained'),false);assert.equal(f.target().hp.current,200)
})
test('a bare legacy restraint refuses before dice instead of being erased by a later net release',async t=>{
 const f=await setup(t,{dice:'19'});f.target().conditions.push('restrained')
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'net'},'NET_RESTRAINT_PROVENANCE_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('self Strength action DD10 frees only the net and an exact retry spends no second action or die',async t=>{
 const f=await caught(t,{dice:'17,16,11,19'});gs.advanceTurn();assert.equal(f.state.currentTurn,'target')
 const answer=ok(await f.call('free_from_net',{eventId:'real-self-free',netId:f.id,actorId:'target'}))
 assert.equal(answer.success,true);assert.equal(answer.check.ability,'str');assert.equal(f.binding(f.id).status,'freed');assert.equal(f.target().conditions.includes('restrained'),false)
 assert.equal(f.state.actionUsed.target,true);assert.ok(f.state.droppedItems.net);assert.equal(f.state.player.hp.current,f.state.player.hp.max)
 const before=structuredClone(f.state);assert.deepEqual(ok(await f.call('free_from_net',{eventId:'real-self-free',netId:f.id,actorId:'target'})),answer);assert.deepEqual(f.state,before)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a failed Strength action spends the real actor action and leaves its net active',async t=>{
 const f=await caught(t,{dice:'17,16,1,19'});gs.advanceTurn()
 const answer=ok(await f.call('free_from_net',{eventId:'failed-self-free',netId:f.id,actorId:'target'}));assert.equal(answer.success,false)
 assert.equal(f.binding(f.id).status,'restraining');assert.equal(f.state.actionUsed.target,true);assert.ok(f.target().conditions.includes('restrained'))
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('freeing by a helper requires the real hand reach and a real action, and retains another restraint provider',async t=>{
 const f=await setup(t,{dice:'17,10,19'}),other=addHeroEffect('actual-other-restraint','player',['target'],60,{condition:'restrained'})
 const thrown=ok(await f.throw()),id=thrown.net.id;nextPlayerTurn()
 gs.getPlayer().position={x:4,y:2}
 await refused(f,'free_from_net',{eventId:'too-far-help',netId:id,actorId:'player'},'NET_FREE_OUT_OF_REACH')
 gs.getPlayer().position={x:1,y:2}
 const answer=ok(await f.call('free_from_net',{eventId:'real-helper-free',netId:id,actorId:'player'}));assert.equal(answer.success,true)
 assert.equal(f.binding(id).status,'freed');assert.ok(f.target().conditions.includes('restrained'));assert.ok(f.state.hero.effects.some(e=>e.id===other.id))
 assert.equal(f.state.hero.actionCredits,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a restraining net cannot be picked up, follows a real forced move, and hydrates without teleporting a target',async t=>{
 const f=await caught(t);nextPlayerTurn()
 await refused(f,'pick_up_item',{itemId:'net'},'NET_STILL_RESTRAINING')
 gs.moveToken('target',3,2);assert.deepEqual(f.state.droppedItems.net.position,{x:3,y:2});assert.equal(f.target().conditions.includes('restrained'),true)
 const before=structuredClone(f.state);gs.replaceState(before);assert.equal(validateNetState(gs.getState()).length,0)
 assert.deepEqual(gs.getState().monsters.target.position,{x:3,y:2})
})
test('a readied net uses the actual target, one real reaction and physical throw without another action',async t=>{
 const f=await setup(t),ready=ok(await f.call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:'net',trigger:'Quand cet adversaire fait un geste hostile.'}}))
 f.state.currentTurn='target'
 const answer=ok(await f.call('resolve_readied_action',{readyId:ready.readyId,choice:'execute',triggerObserved:'Le geste hostile se produit.',targetId:'target'}))
 assert.equal(answer.net.status,'restraining');assert.equal(f.state.hero.reactionsUsed.player,true);assert.equal(f.state.hero.actionCredits,0);assert.ok(f.state.droppedItems.net)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an unmodeled piercing attack refuses before dice/resources without claiming an official net immunity',async t=>{
 const f=await caught(t,{dice:'17,16,19',additionalWeapons:['dagger']});nextPlayerTurn();await hold(f,'dagger')
 const refusedResult=await refused(f,'attack_net',{eventId:'piercing-not-modeled',netId:f.id,weaponId:'dagger'},'NET_DAMAGE_PROCEDURE_UNSUPPORTED')
 assert.match(refusedResult.error,/no universal net immunity/i);assert.equal(f.binding(f.id).slashingDamageTaken,0);assert.equal(f.target().hp.current,200)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('two real slashing hits aggregate to five, destroy only that physical net and preserve other restraint',async t=>{
 const f=await setup(t,{dice:'17,17,2,17,3,19',additionalWeapons:['sickle']}),other=addHeroEffect('separate-rope','player',['target'],60,{condition:'restrained'})
 const shot=ok(await f.throw()),id=shot.net.id;nextPlayerTurn();await hold(f,'sickle')
 f.state.player.stats.str=10;f.state.player.features=f.state.player.features.filter(id=>id!=='dueling')
 const first=ok(await f.call('attack_net',{eventId:'first-slash',netId:id,weaponId:'sickle'}));assert.equal(first.slashingDamageThisAttack,2);assert.equal(first.slashingDamageTaken,2);assert.equal(first.destroyed,false)
 const second=ok(await f.call('attack_net',{eventId:'second-slash',netId:id,weaponId:'sickle'}));assert.equal(second.slashingDamageThisAttack,3);assert.equal(second.slashingDamageTaken,5);assert.equal(second.destroyed,true)
 assert.equal(f.binding(id).status,'destroyed');assert.equal(f.state.droppedItems.net,undefined);assert.equal(f.target().hp.current,200);assert.ok(f.target().conditions.includes('restrained'));assert.ok(f.state.hero.effects.some(e=>e.id===other.id))
 const before=structuredClone(f.state);assert.deepEqual(ok(await f.call('attack_net',{eventId:'second-slash',netId:id,weaponId:'sickle'})),second);assert.deepEqual(f.state,before)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19);assert.equal(validateNetState(f.state).length,0)
})
test('the actual physical thrown handaxe cuts the net at range and is deposited without hitting the captive',async t=>{
 const f=await caught(t,{dice:'17,16,17,4,19',additionalWeapons:['handaxe']});nextPlayerTurn();await hold(f,'handaxe');f.state.player.position={x:4,y:2}
 const answer=ok(await f.call('attack_net',{eventId:'thrown-cut',netId:f.id,weaponId:'handaxe',attackMode:'thrown'}))
 assert.equal(answer.destroyed,true);assert.equal(answer.captiveDamage,0);assert.equal(f.target().hp.current,200)
 assert.ok(!f.state.player.inventory.some(i=>i.id==='handaxe'));assert.deepEqual(f.state.droppedItems.handaxe.position,f.target().position)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a held net d20 persists with its exact target witness and is not rerolled or thrown twice',async t=>{
 const f=await setup(t,{dice:'8,7,6,19'});f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const held=ok(await f.throw());assert.ok(held.pendingReaction);assert.equal(f.state.player.inventory.some(i=>i.id==='net'),true)
 const saved=structuredClone(f.state);gs.replaceState(saved)
 const result=ok(await f.call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}))
 assert.equal(result.naturalRoll,7);assert.equal(result.net.status,'restraining');assert.equal(Object.keys(gs.getState().dmTools.nets.bindings).length,1)
 assert.equal(gs.getPlayer().inventory.some(i=>i.id==='net'),false);assert.equal(gs.getState().hero.actionCredits,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('forged held net eligibility and detached hydration witnesses refuse before a reaction die or state change',async t=>{
 const f=await setup(t,{dice:'8,7,6,19'});f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const held=ok(await f.throw());delete f.state.hero.pending.command.netContext
 await refused(f,'resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'},'NET_HELD_CONTEXT_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,6)
})
test('an actual slashing attack held for Inspiration preserves its original net, weapon, roll and one-time destruction through hydration',async t=>{
 const f=await caught(t,{dice:'17,16,8,4,2,19',additionalWeapons:['sickle']});nextPlayerTurn();await hold(f,'sickle')
 f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const held=ok(await f.call('attack_net',{eventId:'held-cut',netId:f.id,weaponId:'sickle'}));assert.ok(held.pendingReaction)
 const before=structuredClone(f.state);gs.replaceState(before)
 const answer=ok(await f.call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(answer.attackRoll.rolls[0],8)
 assert.equal(answer.destroyed,true);assert.equal(answer.captiveDamage,0);assert.equal(gs.getState().monsters.target.hp.current,200)
 const completed=structuredClone(gs.getState());assert.deepEqual(ok(await f.call('attack_net',{eventId:'held-cut',netId:f.id,weaponId:'sickle'})),answer);assert.deepEqual(gs.getState(),completed)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a new established formless fact releases only that net and does not destroy the physical object',async t=>{
 const f=await caught(t);ok(await form(f,true,'actual-change-of-form'))
 assert.equal(f.binding(f.id).status,'freed');assert.equal(f.target().conditions.includes('restrained'),false);assert.ok(f.state.droppedItems.net)
 assert.equal(validateNetState(f.state).length,0)
})
test('an active net provider survives a bare condition-bit removal and detached persisted witnesses are rejected',async t=>{
 const f=await caught(t),saved=structuredClone(f.state)
 const invalid=structuredClone(saved);delete invalid.droppedItems.net
 assert.throws(()=>gs.replaceState(invalid),error=>error.code==='NET_STATE_MISMATCH');assert.deepEqual(f.state,saved)
 gs.removeCondition('target','restrained');require('../mcp-server/dist/mcp-server/hero-rules.js').advanceHeroTime()
 assert.ok(f.target().conditions.includes('restrained'));assert.equal(f.binding(f.id).status,'restraining')
 removeHeroEffect(f.binding(f.id).effectId);assert.equal(f.binding(f.id).status,'freed');assert.equal(f.target().conditions.includes('restrained'),false)
})
test('a net preflights the actual existing Fey Charm saving throw before the attack d20, item or action',async t=>{
 const f=await setup(t,{dice:'19'}),source=getMonsterRecord('dryad');assert.ok(source)
 f.state.monsters.charmer={...structuredClone(source.engine),id:'charmer',position:{x:5,y:2},isAlive:true,hostile:false}
 f.state.monsterEffects=[{id:'real-fey-charm',kind:'fey-charm',sourceId:'charmer',targetId:'target',conditions:['charmed'],dc:14}]
 f.target().conditions.push('charmed','exhaustion') // Explicit legacy exhaustion lacks a level.
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'net'},'EXHAUSTION_LEVEL_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the real stdio engine exposes and persists the complete physical net throw and free procedure',async t=>{
 const {engine,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs'),call=await engine(t,{dice:'17,16,1,19'})
 let current=await call('get_game_state'),held=current.dmTools?.loadout?.mainHandId??current.player.inventory.find(i=>i.type==='weapon').id
 ok(await call('equip_item',{itemId:held,slot:'main_hand',operation:'unequip'}))
 await replace(call,state=>state.player.inventory.push({id:'authored-real-net',equipmentId:'net',name:'Filet réel du scénario',type:'weapon'}))
 ok(await call('equip_item',{itemId:'authored-real-net',slot:'main_hand',operation:'equip'}))
 const enemy=await spawn(call)
 ok(await call('set_net_creature_form',{eventId:'public-actual-form',entityId:enemy.id,formless:false,source:'Corps réel établi dans la scène de test, fiche gobelin SRD.',reason:'Créature corporelle effectivement présente.'}))
 await battle(call,[enemy.id])
 const shot=ok(await call('resolve_player_attack',{targetId:enemy.id,weaponOrSpell:'authored-real-net'}));assert.equal(shot.net.status,'restraining');assert.equal(shot.damageDealt,0)
 current=await call('get_game_state');ok(await call('replace_game_state',{gameState:current}));assert.equal(ok(await call('inspect_net',{netId:shot.net.id})).status,'restraining')
 ok(await call('next_turn'))
 const failed=ok(await call('free_from_net',{eventId:'public-captive-attempt',netId:shot.net.id,actorId:enemy.id}));assert.equal(failed.success,false)
 ok(await call('next_turn'))
 const before=await call('get_game_state');assert.equal((await call('pick_up_item',{itemId:'authored-real-net'})).code,'NET_STILL_RESTRAINING');assert.deepEqual(await call('get_game_state'),before)
 const input={eventId:'public-real-free',netId:shot.net.id,actorId:'player'},freed=ok(await call('free_from_net',input));assert.equal(freed.success,true)
 const after=await call('get_game_state');assert.equal(after.monsters[enemy.id].hp.current,200);assert.equal(after.monsters[enemy.id].conditions.includes('restrained'),false);assert.ok(after.droppedItems['authored-real-net'])
 assert.deepEqual(ok(await call('free_from_net',input)),freed);assert.deepEqual(await call('get_game_state'),after)
})
