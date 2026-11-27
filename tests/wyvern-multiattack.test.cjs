const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {monsterAutomation}=require('../mcp-server/dist/mcp-server/monster-automation.js')
async function setup(t,dice){
 const f=await fixture(t,{quantity:null,dice}),r=getMonsterRecord('wyvern')
 f.state.monsters.target={...structuredClone(r.engine),id:'target',name:r.source.name,position:{x:2,y:2},isAlive:true,srd:{index:r.source.index,ruleset:'2014',url:r.sourceUrl}}
 f.state.currentTurn='target';f.state.player.hp={current:300,max:300}
 f.multi=attackActions=>f.call('resolve_monster_action',{monsterId:'target',targetId:'player',actionName:'Multiattack',...(attackActions?{attackActions}:{})})
 return f
}
for(const order of [['Bite','Stinger'],['Stinger','Bite']])test(`actual wyvern Multiattack preserves the explicitly selected ${order.join(' then ')} and complete source venom for one action`,async t=>{
 const roll=order[0]==='Bite'?[17,2,3,17,2,3,1,...Array(7).fill(1),19]:[17,2,3,1,...Array(7).fill(1),17,2,3,19]
 const f=await setup(t,roll.join(',')),a=ok(await f.multi(order));assert.equal(a.attacks.length,2);assert.deepEqual(a.attacks.map(hit=>hit.weaponOrSpell),order);assert.equal(a.attacks.reduce((sum,hit)=>sum+hit.damageDealt,0),25);assert.equal(gs.getPlayer().hp.current,275);assert.equal(gs.getState().actionUsed.target,true)
 const poisoned=a.attacks.find(hit=>hit.weaponOrSpell==='Stinger');assert.equal(poisoned.playerPoison.save.dc,15);assert.equal(poisoned.playerPoison.damageRoll.notation,'7d6');assert.equal(poisoned.poisonDamageDealt,7);assert.equal(Object.keys(gs.getState().dmTools.nativePoison.hits).length,1)
 gs.replaceState(structuredClone(gs.getState()));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
for(const selection of [undefined,['Bite'],['Bite','Bite'],['Stinger','Stinger'],['Bite','Stinger','Stinger']])test(`wyvern Multiattack cannot invent or complete the missing/invalid source selection ${JSON.stringify(selection)}`,async t=>{
 const f=await setup(t,'19');await refused(f,'resolve_monster_action',{monsterId:'target',targetId:'player',actionName:'Multiattack',...(selection?{attackActions:selection}:{})},'MULTIATTACK_SELECTION_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
for(const selection of [['Claws','Stinger'],['Bite','Claws'],['Claws','Claws']])test(`wyvern flying substitution ${selection.join('+')} cannot infer flight from its source speed or create 3D reach`,async t=>{
 const f=await setup(t,'19');assert.equal(gs.getMonster('target').movementModes.fly,80);await refused(f,'resolve_monster_action',{monsterId:'target',targetId:'player',actionName:'Multiattack',attackActions:selection},'WYVERN_FLYING_MULTIATTACK_UNSUPPORTED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the complete ordinary pair preflights the real target range before its first attack die or action',async t=>{
 const f=await setup(t,'19');gs.getMonster('target').position={x:5,y:2};const before=structuredClone(gs.getState()),a=await f.multi(['Bite','Stinger']);assert.equal(a.code,'TARGET_OUT_OF_RANGE');assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a held second source CON keeps the first actual bite and both single wounds through hydration without a second Multiattack action',async t=>{
 const f=await setup(t,[17,2,3,17,2,3,1,1,...Array(7).fill(1),19].join(','));f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const a=ok(await f.multi(['Bite','Stinger']));assert.ok(a.pendingReaction);assert.equal(gs.getPlayer().hp.current,282);gs.replaceState(structuredClone(gs.getState()))
 const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(b.attacks.length,2);assert.deepEqual(b.attacks.map(hit=>hit.weaponOrSpell),['Bite','Stinger']);assert.equal(b.attacks[0].damageDealt,9);assert.equal(b.attacks[1].weaponDamageDealt,9);assert.equal(b.attacks[1].poisonDamageDealt,7);assert.equal(gs.getPlayer().hp.current,275);assert.equal(gs.getState().actionUsed.target,true);assert.equal(Object.keys(gs.getState().dmTools.nativePoison.hits).length,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('engine support advertises the ordinary plan and its explicit conditional actual-flight alternatives',()=>{
 const support=monsterAutomation('wyvern');assert.ok(support.implementedActions.includes('Multiattack'));assert.deepEqual(support.multiattack.supportedPlans,[['Bite','Stinger']]);assert.deepEqual(support.multiattack.conditionalWhileFlyingPlans,[['Claws','Stinger'],['Bite','Claws']]);assert.match(support.multiattack.prerequisite,/actualNativeFlightLocation/);assert.equal(monsterAutomation('purple_worm').implementedActions.includes('Multiattack'),true)
})
test('an explicitly requested automatic ground turn resolves the complete ordinary Wyvern pair and never fabricates its flying alternative',async t=>{
 const f=await setup(t,[17,2,3,17,2,3,1,...Array(7).fill(1),19].join(',')),a=ok(await f.call('run_monster_turns',{}));assert.equal(a.resolvedTurns.length,1);assert.deepEqual(a.resolvedTurns[0].attacks.map(hit=>hit.weaponOrSpell),['Bite','Stinger']);assert.equal(gs.getPlayer().hp.current,275);assert.equal(gs.getState().currentTurn,'player');assert.equal(gs.getState().dmTools.weather?.flights?.target,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
