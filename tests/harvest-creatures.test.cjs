const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {monsterAutomation}=require('../mcp-server/dist/mcp-server/monster-automation.js')
const {nativeCreatureSenses}=require('../mcp-server/dist/lib/creature-senses.js')
const {conditionImmune,adjustedDamage,creatureSavingThrow}=require('../mcp-server/dist/mcp-server/monster-rules.js')
const expected=[
 ['carrion_crawler',51,13,'Large',{walk:30,climb:30},[14,13,16,1,12,5],60,0],
 ['purple_worm',247,18,'Gargantuan',{walk:50,burrow:30},[28,7,22,1,8,4],0,30],
 ['wyvern',110,13,'Large',{walk:20,fly:80},[19,10,16,5,12,6],60,0],
 ['giant_poisonous_snake',11,14,'Medium',{walk:30,swim:30},[10,18,13,2,10,3],0,10],
]
function realBody(type){const record=getMonsterRecord(type);return{...structuredClone(record.engine),id:'target',name:record.source.name,position:{x:2,y:2},isAlive:true,srd:{index:record.source.index,ruleset:'2014',url:record.sourceUrl}}}
for(const[type,hp,ac,size,modes,stats,dark,blind]of expected)test(`the supplied ${type} retains its real body, source senses/modes and poisonability instead of a substitute goblin`,()=>{
 const record=getMonsterRecord(type),body=realBody(type);assert.equal(record.engine.hp.max,hp);assert.equal(body.ac,ac);assert.equal(record.source.size,size);assert.deepEqual(body.movementModes,modes);assert.deepEqual(Object.values(body.stats),stats)
 assert.match(record.sourceUrl,/^rules\/books\/mm-2014.md#L\d+$/);assert.equal(crypto.createHash('sha256').update(JSON.stringify(record.source)).digest('hex'),record.sourceSha256);assert.match(record.source.local_source.statBlock,new RegExp(record.source.name))
 assert.equal(nativeCreatureSenses(body).darkvisionFeet,dark);assert.equal(nativeCreatureSenses(body).blindsightFeet,blind);assert.equal(conditionImmune(body,'poisoned'),false);assert.equal(adjustedDamage(body,7,'poison').damage,7)
})

test('the actual worm retains its CON/WIS saving throws, tremorsense and complete swallowing/regurgitation source',async t=>{
 const f=await fixture(t,{dice:'1,19',quantity:null});const body=realBody('purple_worm');assert.equal(creatureSavingThrow(body,'con',19).roll.modifier,11);assert.equal(nativeCreatureSenses(body).tremorsenseFeet,60)
 const bite=getMonsterRecord('purple_worm').source.actions.find(a=>a.name==='Bite');assert.match(bite.desc,/6d6/);assert.match(bite.desc,/regurgitate/);assert.match(bite.desc,/20 feet/);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

for(const[type,action]of [['purple_worm','Bite']])test(`${type} ${action} refuses an unknown actual target size before the mandatory swallowing save before a die, HP change or paid action`,async t=>{
 const f=await fixture(t,{quantity:null,dice:'19'});gs.getState().monsters.target=realBody(type);gs.getState().currentTurn='target'
 await refused(f,'resolve_monster_action',{monsterId:'target',targetId:'player',actionName:action},'SWALLOW_TARGET_SIZE_REQUIRED');await refused(f,'resolve_attack',{attackerId:'target',targetId:'player',weaponOrSpell:action},'SWALLOW_TARGET_SIZE_REQUIRED');assert.equal(monsterAutomation(type).implementedActions.includes(action),true);assert.equal(monsterAutomation(type).sourceReferenceOnly.includes(action),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a source Multiattack is refused whole and its automatic consecutive turns cannot first move, recharge, spend time or damage another actor',async t=>{
 const f=await fixture(t,{quantity:null,dice:'19'});gs.getState().monsters.target=realBody('purple_worm');gs.getState().monsters.target.position={x:5,y:2};gs.getState().currentTurn='target'
 await refused(f,'resolve_monster_action',{monsterId:'target',targetId:'player',actionName:'Multiattack',attackActions:['Bite','Tail Stinger']},'TARGET_OUT_OF_RANGE');await refused(f,'run_monster_turns',{},'SWALLOW_TARGET_SIZE_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the legacy nonsourced attack path cannot strip the new source poison rider by deleting optional srd metadata',async t=>{
 const f=await fixture(t,{quantity:null,legacy:true,dice:'19'});gs.getState().monsters.target=realBody('giant_poisonous_snake');delete gs.getState().monsters.target.srd;gs.getState().currentTurn='target'
 await refused(f,'resolve_attack',{attackerId:'target',targetId:'player',weaponOrSpell:'Bite'},'SRD_PROFILE_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the actual crawler source Bite alone uses +4 and2d4+2piercing without substituting its poisonous tentacles',async t=>{
 const f=await fixture(t,{quantity:null,dice:'17,1,2,19'});gs.getState().monsters.target=realBody('carrion_crawler');gs.getState().currentTurn='target';const before=gs.getPlayer().hp.current
 const a=ok(await f.call('resolve_monster_action',{monsterId:'target',targetId:'player',actionName:'Bite'}));assert.equal(a.attacks.length,1);assert.equal(a.attacks[0].damageDealt,5);assert.equal(gs.getPlayer().hp.current,before-5);assert.deepEqual(monsterAutomation('carrion_crawler').implementedActions,['Multiattack','Tentacles','Bite']);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})


for(const[type]of expected)test(`public spawn and a true incapacitating condition make the actual ${type} natural source available without a free harvested vial`,async t=>{
 const f=await fixture(t,{quantity:null,startBattle:false,dice:'19'});delete gs.getState().monsters.target
 const body=ok(await f.call('spawn_monster',{monsterType:type,cell:{x:4,y:0}}));assert.equal(body.type,type);assert.equal(body.hp.max,getMonsterRecord(type).engine.hp.max);assert.equal(body.srd.url,getMonsterRecord(type).sourceUrl)
 ok(await f.call('apply_condition',{entityId:body.id,condition:'incapacitated'}));const template={carrion_crawler:'carrion_crawler_mucus',purple_worm:'purple_worm_poison',wyvern:'wyvern_poison',giant_poisonous_snake:'serpent_venom'}[type],witness=require('../mcp-server/dist/mcp-server/player-poison-exposure.js').naturalPlayerPoisonSource(body.id,template)
 assert.equal(witness.creatureType,type);assert.equal(witness.entityId,body.id);assert.equal(gs.getPlayer().inventory.some(item=>(item.equipmentId??'').startsWith('poison_')),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
