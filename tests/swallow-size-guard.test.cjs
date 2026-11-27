const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
test.after(()=>pg.restore())
const {fixture,ok}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {recordSwallowSize,captureSwallowBite}=require('../mcp-server/dist/mcp-server/swallow.js')
const {swallowedBy,validateSwallowState}=require('../mcp-server/dist/lib/swallow-state.js')
for(const [type,size,actual]of [['purple_worm','Large','Gargantuan'],['giant_poisonous_snake','Tiny','Medium']])test(`an observation cannot transform actual source ${type} ${actual} into ${size}`,async t=>{
 const f=await fixture(t,{quantity:null,dice:'19'}),r=getMonsterRecord(type)
 f.state.monsters.target={...structuredClone(r.engine),id:'target',name:r.source.name,position:{x:2,y:2},isAlive:true,srd:{index:r.source.index,ruleset:'2014',url:r.sourceUrl}}
 f.state.worldFacts.push({id:'current-size-observation',mapId:f.state.currentMapId,text:'Actual current body observation, no transformation effect.',source:'Actual physical observation.',expires:'never'})
 const before=structuredClone(gs.getState())
 assert.equal(r.source.size,actual)
 assert.throws(()=>recordSwallowSize({entityId:'target',size,factId:'current-size-observation',source:'Current body observation, no form change.'}),e=>e.code==='SWALLOW_SIZE_CONFLICT')
 assert.deepEqual(gs.getState(),before)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('one actual ingested canonical snake cannot receive another containment episode through a second bite',async t=>{
 const f=await fixture(t,{quantity:null,dice:'17,1,1,1,1,19'}),worm=getMonsterRecord('purple_worm'),snake=getMonsterRecord('giant_poisonous_snake')
 for(const [id,r,position]of [['target',worm,{x:2,y:2}],['snake',snake,{x:3,y:2}]])f.state.monsters[id]={...structuredClone(r.engine),id,name:r.source.name,position,isAlive:true,srd:{index:r.source.index,ruleset:'2014',url:r.sourceUrl}}
 f.state.monsters.snake.hp={current:100,max:100};f.state.initiativeOrder.push('snake');f.state.currentTurn='target'
 const result=ok(await f.call('resolve_monster_action',{monsterId:'target',targetId:'snake',actionName:'Bite'}))
 assert.equal(result.attacks[0].swallow.save.dc,19);assert.equal(swallowedBy(gs.getState(),'snake'),'target');assert.deepEqual(validateSwallowState(gs.getState()),[])
 const before=structuredClone(gs.getState())
 assert.throws(()=>captureSwallowBite('target','snake','Bite','another-source-bite'),e=>e.code==='SWALLOW_BODY_ALREADY_CONTAINED')
 assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('SQL restoration rejects a tampered canonical size instead of accepting a transformed source profile',async t=>{
 const f=await fixture(t,{quantity:null,dice:'19'}),worm=getMonsterRecord('purple_worm'),snake=getMonsterRecord('giant_poisonous_snake')
 for(const [id,r,position]of [['target',worm,{x:2,y:2}],['snake',snake,{x:3,y:2}]])f.state.monsters[id]={...structuredClone(r.engine),id,name:r.source.name,position,isAlive:true,srd:{index:r.source.index,ruleset:'2014',url:r.sourceUrl}}
 f.state.worldFacts.push({id:'real-medium-body',mapId:f.state.currentMapId,text:'Actual unchanged canonical Medium snake.',source:'Actual observation.',expires:'never'})
 recordSwallowSize({entityId:'snake',size:'Medium',factId:'real-medium-body',source:'Actual source body, unchanged.'})
 const before=structuredClone(gs.getState()),tampered=structuredClone(before);tampered.dmTools.swallow.sizes.snake.size='Tiny'
 assert.ok(validateSwallowState(tampered).some(message=>message.includes('actual unchanged source body')))
 const id=`swallow-size-guard-${process.pid}`;await saveSession(id,{gameState:tampered,history:[],adventureId:tampered.adventureId,characterId:tampered.characterId});t.after(()=>deleteSession(id));const restored=(await loadSession(id)).gameState
 assert.throws(()=>gs.replaceState(restored),/swallow|size|body|transformation/i)
 assert.deepEqual(gs.getState(),before)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a live conflicting retained size refuses before a source bite die or mutation',async t=>{
 const f=await fixture(t,{quantity:null,dice:'19'}),worm=getMonsterRecord('purple_worm')
 for(const [id,position]of [['target',{x:2,y:2}],['other-worm',{x:3,y:2}]])f.state.monsters[id]={...structuredClone(worm.engine),id,name:worm.source.name,position,isAlive:true,srd:{index:worm.source.index,ruleset:'2014',url:worm.sourceUrl}}
 f.state.worldFacts.push({id:'real-gargantuan-body',mapId:f.state.currentMapId,text:'Actual unchanged Gargantuan worm.',source:'Actual observation.',expires:'never'})
 recordSwallowSize({entityId:'other-worm',size:'Gargantuan',factId:'real-gargantuan-body',source:'Actual unchanged source.'})
 gs.getState().dmTools.swallow.sizes['other-worm'].size='Large'
 const before=structuredClone(gs.getState())
 assert.throws(()=>captureSwallowBite('target','other-worm','Bite','tampered-live-source'),e=>e.code==='SWALLOW_SIZE_CONFLICT')
 assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
