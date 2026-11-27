const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
async function actualWorm(t){const f=await fixture(t,{quantity:null,dice:'19'}),r=getMonsterRecord('purple_worm');f.state.monsters.target={...structuredClone(r.engine),id:'target',name:r.source.name,position:{x:2,y:2},isAlive:true,srd:{index:r.source.index,ruleset:'2014',url:r.sourceUrl}};f.state.currentTurn='target';return f}
test('an actual player body without measured size cannot receive a partial worm wound before its complete source preflight',async t=>{
 const f=await actualWorm(t);await refused(f,'resolve_monster_action',{monsterId:'target',targetId:'player',actionName:'Bite'},'SWALLOW_TARGET_SIZE_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('even choosing Tail Stinger first cannot pay or roll one attack before discovering the second mandatory swallow procedure is unavailable',async t=>{
 const f=await actualWorm(t);await refused(f,'resolve_monster_action',{monsterId:'target',targetId:'player',actionName:'Multiattack',attackActions:['Tail Stinger','Bite']},'SWALLOW_TARGET_SIZE_REQUIRED');assert.equal(gs.getState().dmTools?.nativePoison,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a living worm automatically requested from farther away cannot move first and only then discover its mandatory swallow rider is unimplemented',async t=>{
 const f=await actualWorm(t);gs.getMonster('target').position={x:5,y:2};await refused(f,'run_monster_turns',{},'SWALLOW_TARGET_SIZE_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
