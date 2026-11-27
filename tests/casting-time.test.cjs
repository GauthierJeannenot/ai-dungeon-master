const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {buildPlayerState}=require('../mcp-server/dist/lib/character-registry.js')
const {initialHeroState}=require('../mcp-server/dist/lib/hero-state.js')
const {DmToolStateSchema}=require('../mcp-server/dist/lib/dm-tool-state.js')
const {CastingStateSchema}=require('../mcp-server/dist/lib/casting-state.js')
const {advanceHeroTime,addHeroEffect}=require('../mcp-server/dist/mcp-server/hero-rules.js')
const {changeSpellComponentConstraint}=require('../mcp-server/dist/mcp-server/spell-components.js')
const {rollDice}=require('../mcp-server/dist/mcp-server/dice.js')
const {alarmCubeInput}=require('./helpers/alarm-fixture.cjs')
async function caster(t,{combat=false,characterId='wizard',dice='17,19,18'}={}){
 const f=await fixture(t,{quantity:null,startBattle:combat,dice})
 f.state.player=buildPlayerState({characterId,level:7,position:{x:1,y:2}})
 f.state.hero=initialHeroState(characterId,7)
 f.state.player.inventory=[{id:'pouch',equipmentId:'component_pouch',name:'Une véritable bourse',type:'misc'}]
 if(characterId==='wizard')f.state.player.inventory.push({id:'spellbook',equipmentId:'spellbook',name:'Grimoire réel',type:'misc',spellIds:[...f.state.player.spellbook]})
 f.state.dmTools.loadout={unarmoredAC:10}
 for(const id of ['mending','detect-magic','alarm','comprehend-languages','prayer-of-healing','magic-mouth'])if(!f.state.player.knownSpells.includes(id))f.state.player.knownSpells.push(id)
 const begin=extra=>f.call('cast_spell',{spellId:'mending',focusItemId:'pouch',...extra})
 return {...f,begin,record:id=>gs.getState().dmTools.casting.records[id]}
}
const progress=(f,id,eventId,seconds)=>f.call('continue_casting',{castingId:id,eventId,...seconds===undefined?{}:{seconds}})

test('one-minute cantrip begins with no free time/effect/slot, requires real work, finishes exactly once and hydrates',async t=>{
 const f=await caster(t),slots=structuredClone(f.state.player.spellSlots)
 const begun=ok(await f.begin());assert.equal(begun.status,'active');assert.equal(begun.durationSeconds,60)
 assert.equal(f.state.worldTimeSeconds,0);assert.equal(f.state.hero.effects.length,1);assert.equal(f.state.hero.effects[0].kind,'casting-in-progress')
 await refused(f,'finish_casting',{castingId:begun.castingId},'CASTING_NOT_READY')
 ok(await progress(f,begun.castingId,'part-one',20));assert.equal(f.state.worldTimeSeconds,20)
 const saved=structuredClone(f.state);assert.equal(CastingStateSchema.safeParse(saved.dmTools.casting).success,true)
 assert.equal(DmToolStateSchema.safeParse(saved.dmTools).success,true)
 gs.replaceState(saved)
 const before=structuredClone(gs.getState());ok(await progress(f,begun.castingId,'part-one',20));assert.deepEqual(gs.getState(),before)
 await refused(f,'continue_casting',{castingId:begun.castingId,eventId:'part-one',seconds:21},'CASTING_EVENT_CONFLICT')
 const ready=ok(await progress(f,begun.castingId,'part-two',40));assert.equal(ready.status,'ready')
 await refused(f,'advance_time',{seconds:1},'CASTING_COMPLETION_DUE')
 await refused(f,'move_token',{tokenId:'player',toCell:{x:2,y:2}},'CASTING_COMPLETION_DUE')
 const done=ok(await f.call('finish_casting',{castingId:begun.castingId}));assert.equal(done.castingCompleted,true);assert.equal(done.spell,'mending')
 assert.equal(gs.getState().worldTimeSeconds,60);assert.deepEqual(gs.getPlayer().spellSlots,slots);assert.equal(gs.getState().hero.concentrationId,undefined)
 const after=structuredClone(gs.getState());assert.deepEqual(ok(await f.call('finish_casting',{castingId:begun.castingId})),done);assert.deepEqual(gs.getState(),after)
 assert.equal(rollDice('1d20').total,17)
})

test('ritual adds ten actual minutes, never spends a slot, and refuses an explicit upcast before mutation',async t=>{
 const f=await caster(t),slots=structuredClone(f.state.player.spellSlots)
 await refused(f,'cast_spell',{spellId:'detect-magic',ritual:true,slotLevel:2},'RITUAL_UPCAST_INVALID')
 const begin=ok(await f.call('cast_spell',{spellId:'detect-magic',ritual:true}));assert.equal(begin.durationSeconds,606)
 const ready=ok(await progress(f,begin.castingId,'whole-ritual',606));assert.equal(ready.status,'ready')
 const result=ok(await f.call('finish_casting',{castingId:begin.castingId}));assert.equal(result.spell,'detect-magic')
 assert.deepEqual(f.state.player.spellSlots,slots);assert.equal(f.state.worldTimeSeconds,606)
 assert.ok(f.state.hero.effects.some(e=>e.kind==='concentration:detect-magic'));assert.ok(!f.state.hero.effects.some(e=>e.kind==='casting-in-progress'))
})

test('long leveled casting rechecks the exact original slot; cancellation spends none and restarting begins at zero',async t=>{
 const f=await caster(t),input={...alarmCubeInput({x:1,y:2}),focusItemId:'pouch'}
 const before=structuredClone(f.state.player.spellSlots),begin=ok(await f.call('cast_spell',input))
 assert.deepEqual(f.state.player.spellSlots,before)
 ok(await progress(f,begin.castingId,'twenty',20));ok(await f.call('cancel_casting',{castingId:begin.castingId}))
 assert.deepEqual(f.state.player.spellSlots,before);assert.equal(f.record(begin.castingId).status,'interrupted')
 const again=ok(await f.call('cast_spell',input));assert.notEqual(again.castingId,begin.castingId);assert.equal(again.activeSeconds,0)
 ok(await progress(f,again.castingId,'sixty',60));f.state.player.spellSlots.level1.current=0
 await refused(f,'finish_casting',{castingId:again.castingId},'SPELL_SLOTS_EXHAUSTED')
 assert.equal(f.record(again.castingId).status,'ready');assert.equal(f.state.worldTimeSeconds,80)
 ok(await f.call('cancel_casting',{castingId:again.castingId}));assert.equal(f.state.player.spellSlots.level1.current,0)
})

test('waiting does not become casting work and interrupts at the actual gap; no old progress can resume',async t=>{
 const f=await caster(t),begin=ok(await f.begin());ok(await progress(f,begin.castingId,'ten',10))
 ok(await f.call('advance_time',{seconds:6}));assert.equal(f.record(begin.castingId).status,'interrupted')
 assert.equal(f.record(begin.castingId).activeSeconds,10);assert.equal(f.record(begin.castingId).interruption.at,10)
 await refused(f,'continue_casting',{castingId:begin.castingId,eventId:'reuse',seconds:50},'CASTING_NOT_ACTIVE')
 assert.equal(f.state.worldTimeSeconds,16);assert.equal(rollDice('1d20').total,17)
})

test('a real verbal constraint interrupts immediately; removing it cannot revive prior progress',async t=>{
 const f=await caster(t),begin=ok(await f.begin());ok(await progress(f,begin.castingId,'ten',10))
 const fact={id:'gag',targetId:'player',kind:'gagged',source:'Un bâillon réellement établi dans la scène.',operation:'apply'}
 changeSpellComponentConstraint(fact)
 assert.equal(f.record(begin.castingId).status,'interrupted');assert.equal(f.state.hero.concentrationId,undefined)
 changeSpellComponentConstraint({...fact,operation:'remove'})
 await refused(f,'continue_casting',{castingId:begin.castingId,eventId:'old',seconds:50},'CASTING_NOT_ACTIVE')
})

test('actual second held item makes the component hand unavailable and interrupts before later work',async t=>{
 const f=await caster(t),begin=ok(await f.begin())
 f.state.player.inventory.push(...['dagger','shortsword'].map(id=>({id,equipmentId:id,name:id,type:'weapon'})))
 ok(await f.call('equip_item',{itemId:'dagger',slot:'main_hand',operation:'equip'}));assert.equal(f.record(begin.castingId).status,'active')
 ok(await f.call('equip_item',{itemId:'shortsword',slot:'off_hand',operation:'equip'}));assert.equal(f.record(begin.castingId).status,'interrupted')
 assert.equal(f.record(begin.castingId).interruption.reason,'SPELL_MATERIAL_HAND_REQUIRED');assert.equal(f.state.worldTimeSeconds,0)
})

test('damage uses the existing concentration save exactly once; failed concentration loses work without a slot',async t=>{
 const f=await caster(t,{dice:'1,19,18'}),begin=ok(await f.begin());ok(await progress(f,begin.castingId,'ten',10))
 const before=structuredClone(f.state.player.spellSlots)
 gs.updatePlayerHP(-1)
 assert.equal(f.record(begin.castingId).status,'interrupted');assert.deepEqual(f.state.player.spellSlots,before)
 assert.equal(rollDice('1d20').total,19)
})

test('successful concentration save preserves ongoing casting, and a new concentration really interrupts it',async t=>{
 const f=await caster(t,{dice:'20,19'}),begin=ok(await f.begin());gs.updatePlayerHP(-1)
 assert.equal(f.record(begin.castingId).status,'active');assert.equal(rollDice('1d20').total,19)
 addHeroEffect('test-concentration','player',['player'],60,{},true)
 assert.equal(f.record(begin.castingId).status,'interrupted');assert.equal(f.record(begin.castingId).interruption.reason,'concentration_lost')
})

test('combat start spends a genuine action; two action credits cannot accelerate work on that same turn',async t=>{
 const f=await caster(t,{combat:true});f.state.hero.actionCredits=2
 const begin=ok(await f.begin());assert.equal(begin.activeSeconds,6);assert.equal(f.state.hero.actionCredits,1)
 await refused(f,'continue_casting',{castingId:begin.castingId,eventId:'surged'},'CASTING_ACTION_ALREADY_USED')
 assert.equal(f.state.hero.actionCredits,1);assert.equal(f.state.worldTimeSeconds,0)
 ok(await f.call('combat_action',{action:'dodge'}));assert.equal(f.state.hero.actionCredits,0);assert.equal(f.record(begin.castingId).status,'active')
})

test('omitting the required real casting action on a later own turn interrupts without spending a slot',async t=>{
 const f=await caster(t,{combat:true}),before=structuredClone(f.state.player.spellSlots),begin=ok(await f.begin())
 gs.advanceTurn();assert.equal(f.state.currentTurn,'target');gs.advanceTurn();assert.equal(f.state.currentTurn,'player');assert.equal(f.state.worldTimeSeconds,6)
 gs.advanceTurn();assert.equal(f.record(begin.castingId).status,'interrupted');assert.equal(f.record(begin.castingId).interruption.reason,'required_turn_action_missing')
 assert.equal(f.record(begin.castingId).activeSeconds,6);assert.deepEqual(f.state.player.spellSlots,before)
})

test('ten real casting actions still require the full real minute; finish costs no eleventh action',async t=>{
 const f=await caster(t,{combat:true}),begin=ok(await f.begin())
 for(let n=1;n<10;n++){gs.advanceTurn();gs.advanceTurn();assert.equal(f.state.worldTimeSeconds,n*6);ok(await progress(f,begin.castingId,`turn-${n+1}`))}
 assert.equal(f.record(begin.castingId).activeSeconds,60);assert.equal(f.state.worldTimeSeconds,54)
 await refused(f,'finish_casting',{castingId:begin.castingId},'CASTING_NOT_READY')
 gs.advanceTurn();gs.advanceTurn();assert.equal(f.state.worldTimeSeconds,60);assert.equal(f.record(begin.castingId).status,'ready')
 const credits=f.state.hero.actionCredits,done=ok(await f.call('finish_casting',{castingId:begin.castingId}));assert.equal(done.castingCompleted,true)
 assert.equal(f.state.hero.actionCredits,credits);assert.equal(f.state.worldTimeSeconds,60)
})

test('a combat ritual uses its action on the actual turn and does not advance the clock by ten minutes',async t=>{
 const f=await caster(t,{combat:true}),before=structuredClone(f.state.player.spellSlots)
 const cast=ok(await f.call('cast_spell',{spellId:'detect-magic',ritual:true}));assert.equal(cast.durationSeconds,606);assert.equal(cast.activeSeconds,6)
 assert.equal(f.state.worldTimeSeconds,0);assert.equal(f.state.hero.actionCredits,0);assert.deepEqual(f.state.player.spellSlots,before)
 await refused(f,'continue_casting',{castingId:cast.castingId,eventId:'seconds',seconds:600},'CASTING_COMBAT_SECONDS_INVALID')
})

test('finish revalidates explicit original targets and accepts only an explicit replacement before its healing die and slot',async t=>{
 const f=await caster(t,{characterId:'cleric',dice:'6,5,19'}),before=f.state.player.spellSlots.level2.current
 f.state.player.hp.current-=20
 const cast=ok(await f.call('cast_spell',{spellId:'prayer-of-healing',targetId:'player'}));assert.equal(cast.durationSeconds,600)
 ok(await progress(f,cast.castingId,'prayer',600))
 const target=f.state.monsters.target;target.hostile=false;target.hp.current=5;target.hp.max=50;target.position={x:9,y:2}
 await refused(f,'finish_casting',{castingId:cast.castingId,targetId:'target'},'TARGET_OUT_OF_RANGE')
 assert.equal(f.state.player.spellSlots.level2.current,before)
 const done=ok(await f.call('finish_casting',{castingId:cast.castingId,targetId:'player'}));assert.equal(done.results[0].healRoll.rolls[0],6)
 assert.equal(f.state.player.spellSlots.level2.current,before-1);assert.equal(f.state.worldTimeSeconds,600)
 await refused(f,'finish_casting',{castingId:cast.castingId,targetId:'target'},'CASTING_COMPLETION_CONFLICT')
})

test('concentration, incapacity and no-history legacy casting schemas never grant unperformed work',async t=>{
 const f=await caster(t),before=structuredClone(f.state)
 assert.equal(before.dmTools.casting,undefined)
 assert.equal(CastingStateSchema.safeParse({version:1,records:{invented:{spellId:'identify',activeSeconds:60}}}).success,false)
 const begun=ok(await f.begin());gs.applyCondition('player','incapacitated');advanceHeroTime()
 assert.equal(f.record(begun.castingId).status,'interrupted');assert.equal(f.record(begun.castingId).activeSeconds,0)
})

async function identifyFixture(t){
 const f=await caster(t)
 if(!f.state.player.spellbook.includes('identify'))f.state.player.spellbook.push('identify')
 ok(await f.call('create_magic_item',{itemId:'real-wand',templateId:'wand_of_magic_missiles',name:'Baguette inconnue',description:'Un objet effectivement établi.',cell:{x:1,y:2},initialCharges:3}))
 ok(await f.call('pick_up_item',{itemId:'real-wand'}))
 ok(await f.call('create_scene_object',{objectId:'pearl-case',name:'Écrin',description:'Un écrin réel.',cell:{x:1,y:2},kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['identification_pearl']}))
 const opened=ok(await f.call('interact_object',{objectId:'pearl-case',action:'open'})),pearl=opened.releasedItems[0].id
 ok(await f.call('pick_up_item',{itemId:pearl}))
 const input={itemId:'real-wand',method:'spell',ritual:true,materialItemId:pearl,focusItemId:'pouch'}
 return {...f,pearl,input}
}

test('Identify public tool starts a real eleven-minute ritual and reveals no properties or charges until finish',async t=>{
 const f=await identifyFixture(t),slots=structuredClone(f.state.player.spellSlots)
 const cast=ok(await f.call('identify_magic_item',f.input));assert.equal(cast.durationSeconds,660)
 assert.equal(f.state.dmTools.magicItems['real-wand'].identified,false);assert.equal(f.state.worldTimeSeconds,0)
 ok(await progress(f,cast.castingId,'real-identification',660))
 const result=ok(await f.call('finish_casting',{castingId:cast.castingId}));assert.equal(result.item.charges,3);assert.equal(result.item.identified,true)
 assert.equal(f.state.worldTimeSeconds,660);assert.deepEqual(f.state.player.spellSlots,slots);assert.ok(f.state.player.inventory.some(i=>i.id===f.pearl))
})

test('Identify loses its actual touch after a real drop and movement, with no slot or remote completion',async t=>{
 const f=await identifyFixture(t),cast=ok(await f.call('identify_magic_item',f.input))
 ok(await progress(f,cast.castingId,'partial-identification',20))
 ok(await f.call('drop_item',{itemId:'real-wand'}));assert.equal(f.record(cast.castingId).status,'active')
 ok(await f.call('move_token',{tokenId:'player',toCell:{x:3,y:2}}));assert.equal(f.record(cast.castingId).status,'interrupted')
 assert.equal(f.record(cast.castingId).interruption.reason,'identify_touch_lost');assert.equal(f.state.dmTools.magicItems['real-wand'].identified,false)
 await refused(f,'finish_casting',{castingId:cast.castingId},'CASTING_NOT_READY')
})

test('a ready incantation refuses turn advance and direct inventory acquisition until finish or cancel',async t=>{
 const f=await caster(t,{combat:true}),cast=ok(await f.begin())
 for(let n=1;n<10;n++){gs.advanceTurn();gs.advanceTurn();ok(await progress(f,cast.castingId,`cast-${n}`))}
 gs.advanceTurn();gs.advanceTurn()
 const before=structuredClone(f.state);assert.throws(()=>gs.advanceTurn(),error=>error.code==='CASTING_COMPLETION_DUE');assert.deepEqual(f.state,before)
 await refused(f,'drop_item',{itemId:'pouch'},'CASTING_COMPLETION_DUE')
 ok(await f.call('cancel_casting',{castingId:cast.castingId}));gs.advanceTurn();assert.equal(f.state.currentTurn,'target')
})

test('hydration refuses fabricated ready work or a missing concentration witness without mutating the live game',async t=>{
 const f=await caster(t),cast=ok(await f.begin()),before=structuredClone(f.state)
 const invented=structuredClone(before);invented.worldTimeSeconds=60
 const record=invented.dmTools.casting.records[cast.castingId];record.status='ready';record.activeSeconds=60;record.lastWorkedAt=60
 assert.throws(()=>gs.replaceState(invented),error=>error.code==='CASTING_STATE_MISMATCH');assert.deepEqual(f.state,before)
 const missing=structuredClone(before);missing.hero.effects=[];delete missing.hero.concentrationIds.player;delete missing.hero.concentrationId
 assert.throws(()=>gs.replaceState(missing),error=>error.code==='CASTING_STATE_MISMATCH');assert.deepEqual(f.state,before)
})

test('leaving combat cannot convert an action credit into free elapsed time, and real continued work can finish the remainder',async t=>{
 const f=await caster(t,{combat:true}),cast=ok(await f.begin())
 Object.assign(f.state,{phase:'exploration',currentTurn:null,initiativeOrder:[]})
 const work=ok(await progress(f,cast.castingId,'fifty-four',54));assert.equal(work.activeSeconds,60);assert.equal(work.status,'active');assert.equal(work.remainingTimeSeconds,6)
 await refused(f,'finish_casting',{castingId:cast.castingId},'CASTING_NOT_READY')
 const ready=ok(await progress(f,cast.castingId,'last-real-seconds',6));assert.equal(ready.status,'ready');assert.equal(f.state.worldTimeSeconds,60)
 ok(await f.call('finish_casting',{castingId:cast.castingId}))
 assert.equal(CastingStateSchema.safeParse(f.state.dmTools.casting).success,true)
 gs.replaceState(structuredClone(f.state))
})
