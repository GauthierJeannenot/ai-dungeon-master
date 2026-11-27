const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {registerAfflictionTools}=require('../mcp-server/dist/mcp-server/tools/affliction-tools.js')
const {nativePoisonAttackContext}=require('../mcp-server/dist/mcp-server/native-poison.js')
async function setup(t,type,dice,extra={}){
 const f=await fixture(t,{quantity:null,dice,...extra}),r=getMonsterRecord(type)
 f.state.monsters.target={...structuredClone(r.engine),id:'target',name:r.source.name,position:{x:2,y:2},isAlive:true,srd:{index:r.source.index,ruleset:'2014',url:r.sourceUrl}}
 f.state.currentTurn='target';f.state.player.hp={current:300,max:300}
 const callbacks={},server={registerTool(name,config,callback){callbacks[name]=input=>callback(require('zod').z.object(config.inputSchema).parse(input))}}
 registerAfflictionTools(server)
 f.event=async input=>JSON.parse((await callbacks.resolve_affliction_event(input)).content[0].text)
 f.hit=(actionName,extra={})=>f.call('resolve_monster_action',{monsterId:'target',targetId:'player',actionName,...extra})
 return f
}
for(const[type,action,primary,dc,count]of [['giant_poisonous_snake','Bite',[2],11,3],['wyvern','Stinger',[2,2],15,7],['purple_worm','Tail Stinger',[2,2,2],19,12]])for(const success of [false,true])test(`${type} ${action} resolves its original CON${dc} and ${count}d6 poison ${success?'halved on success':'on failure'} without a vial or poisoned condition`,async t=>{
 const f=await setup(t,type,[17,...primary,success?20:1,...Array(count).fill(1),19].join(',')),a=ok(await f.hit(action)),hit=a.attacks[0]
 assert.equal(hit.playerPoison.save.dc,dc);assert.equal(hit.playerPoison.save.success,success);assert.equal(hit.playerPoison.damageRoll.notation,`${count}d6`);assert.equal(hit.poisonDamageDealt,success?Math.floor(count/2):count)
 assert.equal(hit.damageDealt,hit.weaponDamageDealt+hit.poisonDamageDealt);assert.equal(gs.getPlayer().hp.current,300-hit.damageDealt);assert.equal(gs.getPlayer().conditions.includes('poisoned'),false);assert.equal(gs.getState().actionUsed.target,true)
 assert.equal(Object.keys(gs.getState().dmTools.nativePoison.hits).length,1);assert.equal(Object.keys(gs.getState().dmTools.playerPoisons.preparations).length,0);gs.replaceState(structuredClone(gs.getState()))
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a native critical doubles only the actual weapon dice, retaining a single ordinary source poison roll',async t=>{
 const f=await setup(t,'giant_poisonous_snake','20,2,3,1,1,1,1,19'),hit=ok(await f.hit('Bite')).attacks[0]
 assert.equal(hit.criticalHit,true);assert.equal(hit.damageRoll.notation,'2d4+4');assert.equal(hit.weaponDamageDealt,9);assert.equal(hit.playerPoison.damageRoll.notation,'3d6');assert.equal(hit.poisonDamageDealt,3);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the native bite miss cannot create any poison event, save or harvested physical dose',async t=>{
 const f=await setup(t,'giant_poisonous_snake','1,19'),hit=ok(await f.hit('Bite')).attacks[0];assert.equal(hit.hit,false);assert.equal(gs.getState().dmTools?.nativePoison,undefined);assert.equal(gs.getState().dmTools?.playerPoisons,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the original native CON held after its actual wound survives hydration and Inspiration without repeating damage or paying another action',async t=>{
 const f=await setup(t,'giant_poisonous_snake','17,2,1,6,1,1,1,19');f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const a=ok(await f.hit('Bite'));assert.ok(a.pendingReaction);const hp=gs.getPlayer().hp.current;assert.equal(hp,294);gs.replaceState(structuredClone(gs.getState()))
 const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));const hit=b.attacks[0]
 assert.equal(hit.weaponDamageDealt,6);assert.equal(hit.poisonDamageDealt,1);assert.equal(gs.getPlayer().hp.current,hp-1);assert.equal(Object.keys(gs.getState().dmTools.nativePoison.hits).length,1);assert.equal(Object.keys(gs.getState().dmTools.playerPoisons.deliveries).length,1);assert.equal(gs.getState().actionUsed.target,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual crawler tentacles deal poison and establish a distinct timed poison/paralysis with explicit end-turn save',async t=>{
 const f=await setup(t,'carrion_crawler','17,2,1,20,19'),hit=ok(await f.hit('Tentacles')).attacks[0]
 assert.equal(hit.weaponDamageDealt,4);assert.equal(hit.poisonDamageDealt,0);assert.equal(hit.playerPoison.save.dc,13);assert.ok(gs.getPlayer().conditions.includes('paralyzed'));assert.ok(gs.getPlayer().conditions.includes('poisoned'))
 const record=Object.values(gs.getState().dmTools.afflictions.records)[0];assert.equal(record.expiresAt,60);gs.replaceState(structuredClone(gs.getState()))
 gs.getState().currentTurn='player';gs.getState().turnCounter=(gs.getState().turnCounter??0)+1
 const saved=ok(await f.event({afflictionId:record.id,endTurn:true}));assert.equal(saved.save.success,true);assert.equal(gs.getPlayer().conditions.includes('paralyzed'),false);assert.equal(gs.getPlayer().conditions.includes('poisoned'),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('crawler Multiattack carries its poison procedure into the explicitly selected second bite without a second action',async t=>{
 const f=await setup(t,'carrion_crawler','17,2,20,17,2,2,19'),a=ok(await f.hit('Multiattack',{attackActions:['Tentacles','Bite']}));assert.equal(a.attacks.length,2);assert.equal(a.attacks[0].playerPoison.save.dc,13);assert.equal(gs.getState().actionUsed.target,true);assert.equal(Object.keys(gs.getState().dmTools.nativePoison.hits).length,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual poison damage immunity still retains the venom saving throw and source damage roll',async t=>{
 const f=await setup(t,'giant_poisonous_snake','17,2,1,1,1,1,19'),r=getMonsterRecord('gargoyle');f.state.monsters.victim={...structuredClone(r.engine),id:'victim',name:'Stone body',position:{x:1,y:2},isAlive:true,hp:{current:200,max:200}};f.state.initiativeOrder.push('victim')
 const hit=ok(await f.call('resolve_monster_action',{monsterId:'target',targetId:'victim',actionName:'Bite'})).attacks[0];assert.equal(hit.playerPoison.save.success,false);assert.equal(hit.poisonDamageDealt,0);assert.ok(hit.playerPoison.damageResolution.damageAdjustment.includes('immunité poison'));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('held old source attacks cannot gain an inferred native poison witness before a reaction die',async t=>{
 const f=await setup(t,'giant_poisonous_snake','19');assert.throws(()=>nativePoisonAttackContext('target','player','Bite','old-attack',true),e=>e.code==='NATIVE_POISON_HELD_CONTEXT_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('native group sources are refused without scaling venom into invented multiple exposures',async t=>{
 const f=await setup(t,'giant_poisonous_snake','19');f.state.monsters.target.group={initialCount:2,remainingCount:2,incapacitatedCount:0};await refused(f,'resolve_monster_action',{monsterId:'target',targetId:'player',actionName:'Bite'},'NATIVE_POISON_INDIVIDUAL_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('condition-only poisoned immunity cannot erase the actual native venom damage',async t=>{
 const f=await setup(t,'giant_poisonous_snake','17,2,1,1,1,1,19'),r=getMonsterRecord('goblin'),old=r.source.condition_immunities;t.after(()=>r.source.condition_immunities=old);r.source.condition_immunities=[...old,{index:'poisoned',name:'Poisoned',url:'/api/conditions/poisoned'}]
 f.state.monsters.victim={...structuredClone(r.engine),id:'victim',name:'Condition-only witness',position:{x:1,y:2},isAlive:true,hp:{current:200,max:200}};f.state.initiativeOrder.push('victim')
 const hit=ok(await f.call('resolve_monster_action',{monsterId:'target',targetId:'victim',actionName:'Bite'})).attacks[0];assert.equal(hit.playerPoison.save.success,false);assert.equal(hit.poisonDamageDealt,3);assert.equal(gs.getMonster('victim').conditions.includes('poisoned'),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real held source attack missing its original native witness refuses Inspiration before its die or debit',async t=>{
 const f=await setup(t,'giant_poisonous_snake','17,19');f.state.hero.inspiration.push({targetId:'target',die:8,expiresAt:600});const a=ok(await f.hit('Bite'));assert.ok(a.pendingReaction);delete gs.getState().hero.pending.command.nativePoisonContext
 await refused(f,'resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'},'NATIVE_POISON_HELD_CONTEXT_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a case-insensitive explicit native source selection keeps its original venom through an attack Inspiration reaction',async t=>{
 const f=await setup(t,'giant_poisonous_snake','17,1,2,1,1,1,1,19');f.state.hero.inspiration.push({targetId:'target',die:8,expiresAt:600});const a=ok(await f.hit('bite'));assert.ok(a.pendingReaction);gs.replaceState(structuredClone(gs.getState()))
 const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(b.attacks[0].poisonDamageDealt,3);assert.equal(gs.getState().actionUsed.target,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
