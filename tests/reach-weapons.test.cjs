const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {getWeapon}=require('../mcp-server/dist/lib/srd/weapons.js')
async function setup(t,{weapon='whip',distance=2,dice='17,3,19',legacy=false,object=false}={}){
 const f=await fixture(t,{startBattle:false,weapon,quantity:null,dice,legacy})
 gs.getState().monsters.target.position={x:1+distance,y:2}
 if(getWeapon(weapon).properties.includes('heavy'))ok(await f.call('set_carrying_context',{eventId:'reach-size',entityId:'player',size:'Medium',reason:'Taille réelle déclarée avant le jet Heavy.',source:'Fait physique du scénario : taille Moyenne.'}))
 if(object)ok(await f.call('create_scene_object',{objectId:'reach-object',name:'Coffre réel',description:'Bois effectivement présent au scénario.',cell:{x:3,y:1},kind:'container',material:'wood',size:'small',resilience:'resilient'}))
 Object.assign(gs.getState(),{phase:'combat',round:1,currentTurn:'player',initiativeOrder:['player','target'],combatGeneration:1})
 return f
}
const opportunity=(pending,weaponOrSpell,extra={})=>({pendingId:pending.id,choice:'opportunity_attack',weaponOrSpell,...extra})
async function movingEnemy(f,toX){gs.getState().currentTurn='target';return ok(await f.call('move_token',{tokenId:'target',toCell:{x:toX,y:2}}))}

for(const [weapon,notation,type]of [['whip','1d4+6','slashing'],['glaive','1d10+4','slashing'],['halberd','1d10+4','slashing'],['pike','1d10+4','piercing']])test(`the actual ${weapon} attacks at its published ten-foot reach with its own damage and no implicit item`,async t=>{
 const f=await setup(t,{weapon}),inventory=structuredClone(gs.getPlayer().inventory),answer=ok(await f.attack())
 assert.equal(answer.meleeReachCells,2);assert.equal(answer.damageRoll.notation,notation);assert.equal(getWeapon(weapon).damageType,type)
 assert.deepEqual(gs.getPlayer().inventory,inventory);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('outside the exact reach, a later multiattack and a wall refuse before the first roll or cost',async t=>{
 const f=await setup(t,{distance:3,dice:'19'})
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'whip'},'TARGET_OUT_OF_RANGE')
 gs.getState().monsters.near={...structuredClone(gs.getState().monsters.target),id:'near',position:{x:3,y:2}};gs.getState().initiativeOrder.push('near')
 await refused(f,'resolve_player_multiattack',{attacks:[{targetId:'near',weaponOrSpell:'whip'},{targetId:'target',weaponOrSpell:'whip'}]},'TARGET_OUT_OF_RANGE')
 getAdventureMap().maps[0].geometry.edges.push({from:{x:1,y:2},to:{x:2,y:2},kind:'wall'})
 await refused(f,'resolve_player_attack',{targetId:'near',weaponOrSpell:'whip'},'ATTACK_PATH_BLOCKED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('extended weapon reach does not extend the five-foot prone disadvantage or automatic critical rules',async t=>{
 const f=await setup(t,{dice:'17,8,3,19'});gs.getState().monsters.target.conditions=['prone']
 const answer=ok(await f.attack());assert.equal(answer.naturalRoll,8);assert.match(answer.attackRoll.detail,/^DIS:/);assert.equal(answer.criticalHit,false)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a paralyzed target ten feet away grants advantage but not the adjacent automatic critical',async t=>{
 const f=await setup(t,{dice:'17,16,3,19'});gs.getState().monsters.target.conditions=['paralyzed']
 const answer=ok(await f.attack());assert.equal(answer.naturalRoll,17);assert.match(answer.attackRoll.detail,/^ADV:/)
 assert.equal(answer.criticalHit,false);assert.equal(answer.damageRoll.notation,'1d4+6');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an object can be struck at weapon reach while inspection and opening still require actual hand reach',async t=>{
 const f=await setup(t,{object:true})
 await refused(f,'interact_object',{objectId:'reach-object',action:'open'},'SCENE_TARGET_OUT_OF_REACH')
 await refused(f,'interact_object',{objectId:'reach-object',action:'inspect'},'SCENE_TARGET_OUT_OF_REACH')
 const answer=ok(await f.call('interact_object',{objectId:'reach-object',action:'attack',weaponId:'whip'}))
 assert.equal(answer.meleeReachCells,2);assert.equal(answer.damageRoll.notation,'1d4+6');assert.equal(gs.getState().hero.attackAction.remaining,1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a readied reach attack holds its original reach, weapon and d20 through hydration and refuses a late weapon choice',async t=>{
 const f=await setup(t,{dice:'15,3,19'}),ready=ok(await f.call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:'whip',trigger:'Le geste choisi devient réellement visible.'}}))
 gs.getState().hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const held=ok(await f.call('resolve_readied_action',{readyId:ready.readyId,choice:'execute',targetId:'target',triggerObserved:'Le geste choisi vient réellement de survenir.'})).pendingReaction
 assert.equal(held.command.meleeReachCells,2);assert.equal(held.roll.rolls[0],15);gs.replaceState(structuredClone(gs.getState()))
 await refused(f,'resolve_reaction',{pendingId:held.id,choice:'bardic_inspiration',weaponOrSpell:'unarmed'},'OPPORTUNITY_WEAPON_CHOICE_INVALID')
 const answer=ok(await f.call('resolve_reaction',{pendingId:held.id,choice:'decline'}))
 assert.equal(answer.meleeReachCells,2);assert.equal(answer.naturalRoll,15);assert.equal(gs.getState().hero.attackAction,undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('declining the five-foot unarmed boundary preserves the later ten-foot polearm boundary in the SAME chosen path',async t=>{
 const f=await setup(t,{weapon:'glaive',distance:1});await movingEnemy(f,4)
 let pending=gs.getState().hero.pending,boundary=pending.command.opportunityBoundary
 assert.deepEqual(boundary.choices.map(choice=>choice.weaponOrSpell),['unarmed']);assert.deepEqual(boundary.from,{x:2,y:2});assert.deepEqual(boundary.to,{x:3,y:2})
 await refused(f,'resolve_reaction',opportunity(pending,'glaive'),'OPPORTUNITY_REACH_NOT_LEFT')
 ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'decline'}))
 pending=gs.getState().hero.pending;boundary=pending.command.opportunityBoundary
 assert.deepEqual(boundary.choices.map(choice=>choice.weaponOrSpell),['glaive']);assert.deepEqual(boundary.from,{x:3,y:2});assert.deepEqual(boundary.to,{x:4,y:2})
 assert.equal(pending.command.ignored.includes('player'),false);assert.equal(gs.getState().movementUsed.target,1)
 const answer=ok(await f.call('resolve_reaction',opportunity(pending,'glaive')))
 assert.equal(answer.attack.meleeReachCells,2);assert.equal(answer.attack.heavyContext.size,'Medium')
 assert.deepEqual(gs.getState().monsters.target.position,{x:4,y:2});assert.equal(gs.getState().movementUsed.target,2)
 assert.equal(gs.getState().hero.reactionsUsed.player,true);assert.equal(gs.getState().hero.actionCredits,1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('unarmed reach remains five feet while a two-handed reach weapon is held, and an explicit kick consumes only its real reaction',async t=>{
 const f=await setup(t,{weapon:'glaive',distance:1,dice:'17,19'});await movingEnemy(f,4)
 const pending=gs.getState().hero.pending,answer=ok(await f.call('resolve_reaction',opportunity(pending,'unarmed')))
 assert.equal(answer.attack.meleeReachCells,1);assert.equal(answer.attack.damageRoll.notation,'1+STR');assert.equal(answer.attack.damageRoll.total,5)
 assert.deepEqual(gs.getState().monsters.target.position,{x:4,y:2});assert.equal(gs.getState().hero.pending,undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a ten-foot nonlethal opportunity really stops the selected movement before the departing step',async t=>{
 const f=await setup(t,{distance:2,dice:'17,3,2,19'});gs.getState().monsters.target.hp.current=1;await movingEnemy(f,4)
 const pending=gs.getState().hero.pending,answer=ok(await f.call('resolve_reaction',opportunity(pending,'whip',{nonlethal:true})))
 assert.equal(answer.attack.targetKnockedOut,true);assert.equal(gs.getState().monsters.target.hp.current,0)
 assert.deepEqual(gs.getState().monsters.target.position,{x:3,y:2});assert.equal(gs.getState().movementUsed.target??0,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a held reach opportunity keeps its original departure witness through its inner reaction and resumes exactly once',async t=>{
 const f=await setup(t,{distance:2,dice:'15,3,19'});gs.getState().hero.inspiration.push({targetId:'player',die:8,expiresAt:600});await movingEnemy(f,4)
 const initial=gs.getState().hero.pending,held=ok(await f.call('resolve_reaction',opportunity(initial,'whip'))).pendingReaction
 assert.equal(held.command.meleeReachCells,2);assert.deepEqual(held.command.opportunityBoundary.from,{x:3,y:2})
 gs.replaceState(structuredClone(gs.getState()))
 const answer=ok(await f.call('resolve_reaction',{pendingId:held.id,choice:'decline'}))
 assert.equal(answer.attack.naturalRoll,15);assert.equal(answer.attack.meleeReachCells,2);assert.deepEqual(gs.getState().monsters.target.position,{x:4,y:2})
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a legacy offer without its departure witness cannot retrospectively use extended reach but can still be declined',async t=>{
 const f=await setup(t,{distance:2,dice:'19'});await movingEnemy(f,4)
 const pending=gs.getState().hero.pending;delete pending.command.opportunityBoundary;pending.command.ignored=['player']
 await refused(f,'resolve_reaction',opportunity(pending,'whip'),'OPPORTUNITY_BOUNDARY_REQUIRED')
 ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'decline'}));assert.deepEqual(gs.getState().monsters.target.position,{x:4,y:2})
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a native ten-foot Slam opens only on departure from its own reach and the agent explicitly chooses its real profile',async t=>{
 const f=await setup(t,{dice:'17,1,1,1,19'}),state=gs.getState(),tree={...structuredClone(getMonsterRecord('awakened_tree').engine),id:'tree',position:{x:1,y:2},hp:{current:200,max:200},isAlive:true}
 state.monsters={tree};state.player.position={x:2,y:2};state.initiativeOrder=['player','tree'];const hp=state.player.hp.current
 const moved=ok(await f.call('move_token',{tokenId:'player',toCell:{x:4,y:2}})),pending=gs.getState().hero.pending
 assert.equal(moved.stopReason,'reaction_decision');assert.deepEqual(gs.getPlayer().position,{x:3,y:2})
 assert.deepEqual(pending.command.opportunityBoundary.choices.map(choice=>[choice.weaponOrSpell,choice.reachCells]),[['Slam',2]])
 const answer=ok(await f.call('resolve_reaction',opportunity(pending,'Slam')))
 assert.equal(answer.attack.damageRoll.notation,'3d6+4');assert.equal(gs.getPlayer().hp.current,hp-7)
 assert.deepEqual(gs.getPlayer().position,{x:4,y:2});assert.equal(gs.getState().hero.reactionsUsed.tree,true)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('native ranged actions are never offered as opportunity profiles or substituted for the exact melee departure',async t=>{
 const f=await setup(t,{dice:'19'}),state=gs.getState();state.player.position={x:2,y:2};state.monsters.target.position={x:1,y:2}
 ok(await f.call('move_token',{tokenId:'player',toCell:{x:3,y:2}}));const pending=gs.getState().hero.pending
 assert.deepEqual(pending.command.opportunityBoundary.choices.map(choice=>choice.weaponOrSpell),['Scimitar'])
 await refused(f,'resolve_reaction',opportunity(pending,'Shortbow'),'OPPORTUNITY_REQUIRES_MELEE')
 ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'decline'}));assert.deepEqual(gs.getPlayer().position,{x:3,y:2})
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('legacy physical weapon attacks use their exact registered reach without inventing a ranged attack mode',async t=>{
 const f=await setup(t,{legacy:true,dice:'17,3,19'}),answer=ok(await f.attack())
 assert.equal(answer.damageRoll.notation,'1d4+4');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
