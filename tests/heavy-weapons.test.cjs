const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
async function setup(t,{size,weapon='greatsword',dice='19',legacy=false,object=false,shield=false}={}){
 const f=await fixture(t,{startBattle:false,weapon,quantity:null,dice,legacy,shield})
 gs.getState().monsters.target.position={x:2,y:2}
 if(object)ok(await f.call('create_scene_object',{objectId:'heavy-object',name:'Cible matérielle',description:'Bois réel pour le scénario.',cell:{x:1,y:2},kind:'container',material:'wood',size:'small',resilience:'resilient'}))
 if(size)ok(await f.call('set_carrying_context',{eventId:'actual-heavy-size',entityId:'player',size,reason:'Taille physique établie explicitement avant toute attaque.',source:`Fait physique réel de ce scénario : taille ${size}.`}))
 Object.assign(gs.getState(),{phase:'combat',round:1,currentTurn:'player',initiativeOrder:['player','target'],combatGeneration:1})
 return f
}
test('a missing sourced Heavy size refuses attacks, the complete multiattack and objects before any dice, HP or action',async t=>{
 const f=await setup(t,{object:true})
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'greatsword'},'WEAPON_SIZE_REQUIRED')
 await refused(f,'resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:'unarmed'},{targetId:'target',weaponOrSpell:'greatsword'}]},'WEAPON_SIZE_REQUIRED')
 await refused(f,'interact_object',{objectId:'heavy-object',action:'attack',weaponId:'greatsword'},'WEAPON_SIZE_REQUIRED')
 assert.equal(gs.getState().dmTools.carrying,undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
for(const size of ['Tiny','Small','Medium','Large'])test(`the actual sourced ${size} size determines Heavy disadvantage without changing attack bonus, damage or equipment`,async t=>{
 const disadvantaged=['Tiny','Small'].includes(size),f=await setup(t,{size,dice:disadvantaged?'17,8,3,4,19':'17,3,4,19'})
 const loadout=structuredClone(gs.getState().dmTools.loadout),answer=ok(await f.attack())
 assert.equal(answer.heavyContext.size,size);assert.equal(answer.heavyContext.disadvantage,disadvantaged)
 assert.equal(answer.attackRoll.rolls.length,1);assert.equal(answer.attackRoll.detail.startsWith('DIS:'),disadvantaged);assert.equal(answer.naturalRoll,disadvantaged?8:17)
 assert.equal(answer.attackRoll.modifier,7);assert.equal(answer.damageRoll.notation,'2d6+4');assert.equal(answer.damageRoll.total,11)
 assert.deepEqual(gs.getState().dmTools.loadout,loadout);assert.equal(gs.getState().hero.attackAction.remaining,1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('established advantage cancels Heavy disadvantage and nonheavy attacks never require an actor-size guess',async t=>{
 const f=await setup(t,{size:'Small',dice:'17,3,4,19'}),answer=ok(await f.attack({advantage:true,advantageReason:'Avantage de scénario explicitement établi avant le jet.'}))
 assert.equal(answer.attackRoll.rolls.length,1);assert.equal(answer.naturalRoll,17);assert.equal(answer.heavyContext.disadvantage,true)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a nonheavy weapon resolves without manufacturing size, race or carrying tracking',async t=>{
 const f=await setup(t,{weapon:'longsword',dice:'17,3,19'}),answer=ok(await f.attack())
 assert.equal(answer.heavyContext,undefined);assert.equal(gs.getState().dmTools.carrying,undefined)
 assert.equal(answer.damageRoll.notation,'1d8+6');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a held Heavy d20 retains its exact original Small-size witness and missing legacy context refuses before an Inspiration die',async t=>{
 const f=await setup(t,{size:'Small',dice:'17,8,3,4,19'});gs.getState().hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const pending=ok(await f.attack()).pendingReaction,context=structuredClone(pending.command.heavyContext)
 assert.equal(pending.roll.rolls[0],8);assert.equal(context.size,'Small')
 gs.replaceState(structuredClone(gs.getState()))
 gs.getState().dmTools.carrying.actors.player.size='Medium'
 delete gs.getState().hero.pending.command.heavyContext
 await refused(f,'resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration'},'HEAVY_HELD_CONTEXT_REQUIRED')
 gs.getState().hero.pending.command.heavyContext=context
 const answer=ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'decline'}))
 assert.equal(answer.naturalRoll,8);assert.equal(answer.heavyContext.size,'Small');assert.equal(answer.heavyContext.disadvantage,true)
 assert.equal(answer.damageRoll.total,11);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a genuine object attack uses the same Small Heavy disadvantage before its real damage and attack cost',async t=>{
 const f=await setup(t,{size:'Small',object:true,dice:'17,8,3,4,19'}),answer=ok(await f.call('interact_object',{objectId:'heavy-object',action:'attack',weaponId:'greatsword'}))
 assert.equal(answer.attackRoll.rolls.length,1);assert.match(answer.attackRoll.detail,/^DIS:/);assert.equal(answer.attackRoll.rolls[0],8);assert.equal(answer.heavyContext.size,'Small')
 assert.equal(answer.damageRoll.notation,'2d6+4');assert.equal(gs.getState().hero.attackAction.remaining,1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real readied melee release applies Heavy disadvantage using one reaction and no extra Attack action',async t=>{
 const f=await setup(t,{size:'Small',dice:'17,8,3,4,19'}),ready=ok(await f.call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:'greatsword',trigger:'Le signe visible explicitement choisi survient.'}}))
 const answer=ok(await f.call('resolve_readied_action',{readyId:ready.readyId,choice:'execute',targetId:'target',triggerObserved:'Le signe visible vient effectivement de se produire.'}))
 assert.equal(answer.heavyContext.size,'Small');assert.equal(answer.naturalRoll,8);assert.equal(gs.getState().hero.reactionsUsed.player,true)
 assert.equal(gs.getState().hero.attackAction,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the opportunity Heavy-size preflight preserves the real pending movement when unknown and the player can explicitly decline',async t=>{
 const f=await setup(t);gs.getState().currentTurn='target'
 const movement=ok(await f.call('move_token',{tokenId:'target',toCell:{x:3,y:2}})),pending=gs.getState().hero.pending
 assert.equal(movement.stopReason,'reaction_decision');assert.ok(pending)
 await refused(f,'resolve_reaction',{pendingId:pending.id,choice:'opportunity_attack',weaponOrSpell:'greatsword'},'WEAPON_SIZE_REQUIRED')
 ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'decline'}))
 assert.deepEqual(gs.getState().monsters.target.position,{x:3,y:2});assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the actual Small player opportunity attack rolls Heavy disadvantage once and resumes the already chosen path',async t=>{
 const f=await setup(t,{size:'Small',dice:'17,8,3,4,19'});gs.getState().currentTurn='target'
 ok(await f.call('move_token',{tokenId:'target',toCell:{x:3,y:2}}));const pending=gs.getState().hero.pending
 const answer=ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'opportunity_attack',weaponOrSpell:'greatsword'}))
 assert.equal(answer.attack.heavyContext.size,'Small');assert.equal(answer.attack.naturalRoll,8)
 assert.deepEqual(gs.getState().monsters.target.position,{x:3,y:2});assert.equal(gs.getState().hero.reactionsUsed.player,true)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('legacy source attacks still require the true size and apply the same Heavy disadvantage rather than a free Medium default',async t=>{
 const f=await setup(t,{legacy:true,size:'Small',dice:'17,8,3,4,19'}),answer=ok(await f.attack())
 assert.equal(answer.heavyContext.size,'Small');assert.equal(answer.naturalRoll,8);assert.equal(answer.attackRoll.rolls.length,1);assert.match(answer.attackRoll.detail,/^DIS:/)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a later legacy Heavy attack with its other hand occupied refuses the whole explicit sequence before the first unarmed hit',async t=>{
 const f=await setup(t,{legacy:true,size:'Medium',shield:true})
 await refused(f,'resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:'unarmed'},{targetId:'target',weaponOrSpell:'greatsword'}]},'TWO_HANDS_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
