const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
async function setup(t,{weapon='rapier',distance=1,dice='17,3,19',object=false,...rest}={}){
 const f=await fixture(t,{weapon,quantity:null,dice,startBattle:!object,...rest})
 f.state.monsters.target.position={x:1+distance,y:2}
 if(object){ok(await f.call('create_scene_object',{objectId:'finesse-object',name:'Cible réelle',description:'Bois effectivement présent.',cell:{x:1+distance,y:2},kind:'container',material:'wood',size:'small',resilience:'resilient'}));Object.assign(f.state,{phase:'combat',round:1,currentTurn:'player',initiativeOrder:['player','target'],combatGeneration:1})}
 return f
}
test('an explicit finesse DEX uses that same lower modifier on attack and damage rather than forcing the higher STR',async t=>{
 const f=await setup(t),dex=Math.floor((f.state.player.stats.dex-10)/2),answer=ok(await f.attack({weaponAbility:'dex'}))
 assert.equal(answer.weaponAbility,'dex');assert.equal(answer.finesseContext.selection,'explicit_finesse_choice');assert.equal(answer.finesseContext.modifier,dex)
 assert.equal(answer.attackRoll.modifier,dex+f.state.player.proficiencyBonus);assert.equal(answer.damageRoll.modifier,dex+2);assert.equal(answer.damageDealt,3+dex+2)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('omitting the choice retains the compatible higher-stat engine default, explicitly identified as a default',async t=>{
 const f=await setup(t),answer=ok(await f.attack())
 assert.equal(answer.weaponAbility,'str');assert.equal(answer.finesseContext.selection,'compatibility_higher_ability');assert.equal(answer.damageRoll.notation,'1d8+6')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a complete multiattack refuses a non-finesse choice before its first otherwise valid attack or die',async t=>{
 const f=await setup(t,{weapon:'dagger',additionalWeapons:['club'],dice:'19'})
 await refused(f,'resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:'dagger',weaponAbility:'str'},{targetId:'target',weaponOrSpell:'club',weaponAbility:'dex'}]},'FINESSE_WEAPON_REQUIRED')
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'unarmed',weaponAbility:'str'},'FINESSE_WEAPON_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('explicit finesse is refused for an unrepresented legacy profile and a native source attack before costs or dice',async t=>{
 const f=await setup(t,{legacy:true,dice:'19'})
 await refused(f,'resolve_attack',{attackerId:'player',targetId:'target',weaponOrSpell:'rapier',weaponAbility:'dex'},'SRD_PROFILE_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a native monster cannot substitute a player finesse ability for its source attack profile',async t=>{
 const f=await setup(t,{dice:'19'});f.state.currentTurn='target'
 await refused(f,'resolve_attack',{attackerId:'target',targetId:'player',weaponOrSpell:'Scimitar',weaponAbility:'str'},'FINESSE_PLAYER_ONLY')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('held finesse keeps original ability and modifier through hydration and a real Inspiration without a reroll',async t=>{
 const f=await setup(t,{dice:'9,4,3,19'});f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const held=ok(await f.attack({weaponAbility:'dex'})),pending=held.pendingReaction
 assert.ok(pending);assert.equal(pending.command.finesseContext.ability,'dex');assert.equal(pending.command.finesseContext.modifier,1)
 await refused(f,'resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration',weaponAbility:'str'},'FINESSE_REACTION_CHOICE_INVALID')
 const saved=structuredClone(f.state);saved.player.stats.dex=20;gs.replaceState(saved)
 const answer=ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration'}))
 assert.equal(answer.naturalRoll,9);assert.equal(answer.finesseContext.modifier,1);assert.equal(answer.damageRoll.notation,'1d8+3');assert.equal(answer.damageDealt,6)
 assert.equal(gs.getState().hero.actionCredits,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a malformed or absent held finesse witness refuses before consuming its offered Inspiration die',async t=>{
 const f=await setup(t,{dice:'9,4,3,19'});f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const held=ok(await f.attack({weaponAbility:'dex'}));f.state.hero.pending.command.finesseContext.ability='str'
 await refused(f,'resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'},'FINESSE_HELD_CONTEXT_INVALID')
 delete f.state.hero.pending.command.finesseContext
 await refused(f,'resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'},'FINESSE_HELD_CONTEXT_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,4)
})
test('opportunity finesse is selected explicitly before its real d20 and retains the exact reach departure',async t=>{
 const f=await setup(t,{weapon:'whip',distance:2});f.state.currentTurn='target'
 ok(await f.call('move_token',{tokenId:'target',toCell:{x:4,y:2}}));const pending=f.state.hero.pending
 const answer=ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'opportunity_attack',weaponOrSpell:'whip',weaponAbility:'dex'}))
 assert.equal(answer.attack.weaponAbility,'dex');assert.equal(answer.attack.damageRoll.notation,'1d4+3');assert.equal(f.state.hero.reactionsUsed.player,true);assert.equal(f.state.hero.actionCredits,1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('readied physical release chooses finesse before the attack, while ignore cannot alter a future ability',async t=>{
 const f=await setup(t),ready=ok(await f.call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:'rapier',trigger:'Quand cet adversaire agit.'}}))
 await refused(f,'resolve_readied_action',{readyId:ready.readyId,choice:'ignore',weaponAbility:'str'},'FINESSE_READIED_ATTACK_REQUIRED')
 f.state.currentTurn='target'
 const answer=ok(await f.call('resolve_readied_action',{readyId:ready.readyId,choice:'execute',triggerObserved:'L’adversaire agit.',targetId:'target',weaponAbility:'dex'}))
 assert.equal(answer.weaponAbility,'dex');assert.equal(answer.damageRoll.notation,'1d8+3');assert.equal(f.state.hero.reactionsUsed.player,true)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an admissible object attack uses the same explicitly selected finesse modifier for its roll and source damage',async t=>{
 const f=await setup(t,{weapon:'whip',distance:2,object:true})
 const answer=ok(await f.call('interact_object',{objectId:'finesse-object',action:'attack',weaponId:'whip',weaponAbility:'dex'}))
 assert.equal(answer.weaponAbility,'dex');assert.equal(answer.attackRoll.modifier,4);assert.equal(answer.damageRoll.notation,'1d4+3')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the bonus weapon chooses its own finesse independently and retains its negative modifier without an acquired fighting style',async t=>{
 const f=await setup(t,{weapon:'dagger',additionalWeapons:['shortsword'],dice:'17,2,17,3,19'})
 f.state.player.stats.dex=8
 ok(await f.call('equip_item',{itemId:'shortsword',slot:'off_hand',operation:'equip'}))
 const primary=ok(await f.attack({weaponAbility:'str'}));assert.equal(primary.damageRoll.notation,'1d4+4')
 const input={attackId:'independent-bonus',primaryAttackId:primary.primaryAttackId,weaponItemId:'shortsword',targetId:'target',attackMode:'melee',weaponAbility:'dex'}
 const bonus=ok(await f.call('resolve_two_weapon_attack',input));assert.equal(bonus.weaponAbility,'dex');assert.equal(bonus.finesseContext.modifier,-1)
 assert.equal(bonus.attackRoll.modifier,2);assert.equal(bonus.damageRoll.notation,'1d6-1');assert.equal(bonus.damageDealt,2)
 assert.equal(primary.weaponAbility,'str');assert.equal(f.state.bonusActionUsed.player,true)
 await refused(f,'resolve_two_weapon_attack',{...input,weaponAbility:'str'},'TWO_WEAPON_EVENT_CONFLICT')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('finesse against the actual net uses each chosen ability before the source slashing threshold',async t=>{
 const f=await setup(t,{weapon:'net',additionalWeapons:['whip'],dice:'17,16,17,1,17,1,19'})
 ok(await f.call('set_net_creature_form',{eventId:'finesse-net-form',entityId:'target',formless:false,reason:'Corps réel établi.',source:'Fait physique explicite du scénario.'}))
 const shot=ok(await f.attack());gs.advanceTurn();gs.advanceTurn();ok(await f.call('equip_item',{itemId:'whip',slot:'main_hand',operation:'equip'}))
 const first=ok(await f.call('attack_net',{eventId:'dex-cut',netId:shot.net.id,weaponId:'whip',weaponAbility:'dex'}));assert.equal(first.slashingDamageThisAttack,4);assert.equal(first.destroyed,false);assert.equal(first.weaponAbility,'dex')
 const second=ok(await f.call('attack_net',{eventId:'str-cut',netId:shot.net.id,weaponId:'whip',weaponAbility:'str'}));assert.equal(second.slashingDamageThisAttack,7);assert.equal(second.destroyed,true)
 assert.equal(f.state.monsters.target.hp.current,200);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
