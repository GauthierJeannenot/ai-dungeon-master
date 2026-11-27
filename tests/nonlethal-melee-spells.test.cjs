process.env.ADVENTURE_ID='sarah-of-yellowcrest-manor'
process.env.CHARACTER_ID='cleric'
process.env.MONETIZATION_ENABLED='false'
process.env.ALLOW_PAID_LLM='false'
process.env.LLM_MODE='mock'
const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle,grid}=require('./helpers/mcp-toolkit.cjs')
const {inferRoomIdOnMap}=require('../mcp-server/dist/lib/adventure-map.js')
const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))
async function setup(t,{dice='17,4,2,19',type='goblin',hp=1,characterId='cleric',combat=true}={}){
 const call=await engine(t,{dice,characterId}),initial=await call('get_game_state')
 const main=initial.dmTools?.loadout?.mainHandId??initial.player.inventory.find(item=>item.type==='weapon')?.id
 if(main)ok(await call('equip_item',{itemId:main,slot:'main_hand',operation:'unequip'}))
 const current=await call('get_game_state'),nav=grid(current)
 let placement
 for(const cell of nav.neighbors(current.player.position)){
  if(!nav.step(current.player.position,cell)||inferRoomIdOnMap(cell,current.currentMapId,current)!==current.currentRoomId)continue
  const targetCell=nav.neighbors(cell).find(next=>distance(next,current.player.position)>1&&nav.step(cell,next)
   &&inferRoomIdOnMap(next,current.currentMapId,current)===current.currentRoomId)
  if(targetCell){placement={weaponCell:cell,targetCell};break}
 }
 assert.ok(placement,'fixture needs real clear cells with a target beyond caster melee reach')
 const target=await spawn(call,type,placement.targetCell)
 await replace(call,state=>{state.monsters[target.id].hp.current=hp})
 if(combat)await battle(call,[target.id])
 return {call,target,toCell:placement.weaponCell}
}
const cast=(f,extra={})=>f.call('cast_spell',{spellId:'spiritual-weapon',slotLevel:2,toCell:f.toCell,targetId:f.target.id,nonlethal:true,...extra})
const strike=answer=>answer.results.find(entry=>entry.attackEventId)
async function roundtrip(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,input,code){const before=await call('get_game_state');assert.equal((await call(name,input)).code,code);assert.deepEqual(await call('get_game_state'),before)}

test('the actual Spiritual Weapon melee spell attack can knock out beyond the caster melee reach with one source witness and real recovery die',async t=>{
 const f=await setup(t),before=await f.call('get_game_state')
 assert.ok(distance(before.player.position,before.monsters[f.target.id].position)>1)
 assert.equal(distance(f.toCell,before.monsters[f.target.id].position),1)
 const answer=ok(await cast(f)),attack=strike(answer),after=await roundtrip(f.call),body=after.monsters[f.target.id]
 assert.ok(attack);assert.equal(attack.nonlethal,true);assert.equal(attack.hit,true);assert.equal(attack.targetKnockedOut,true);assert.equal(attack.targetDied,false)
 assert.equal(body.hp.current,0);assert.equal(body.isAlive,true);assert.equal(body.knockout.attackEventId,attack.attackEventId)
 assert.deepEqual(body.knockout.recovery,{hours:2,wakeAt:7200});assert.equal(after.hero.corpseTimes[f.target.id],undefined)
 assert.ok(body.conditions.includes('unconscious'));assert.ok(body.conditions.includes('prone'));assert.deepEqual(body.position,before.monsters[f.target.id].position)
 assert.equal(after.player.spellSlots.level2.current,before.player.spellSlots.level2.current-1)
 assert.equal(after.bonusActionUsed.player,true);assert.equal(after.hero.actionCredits,before.hero.actionCredits)
 assert.equal(after.hero.attackAction,undefined);assert.equal(after.hero.reactionsUsed.player??false,false)
 const effect=after.hero.effects.find(entry=>entry.kind==='spiritual-weapon')
 assert.ok(effect);assert.equal(effect.data.nonlethal,undefined);assert.equal(effect.data.attackEventId,undefined)
 await refused(f.call,'cast_spell',{spellId:'spiritual-weapon',slotLevel:2,toCell:f.toCell,targetId:f.target.id,nonlethal:true},'NONLETHAL_LIVING_TARGET_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('omitted and explicit false valid spell attacks keep ordinary lethal behavior without consuming a recovery die',async t=>{
 for(const explicitFalse of [false,true])await t.test(explicitFalse?'explicit false':'omitted',async t=>{
  const f=await setup(t,{dice:'17,4,19'}),input={spellId:'spiritual-weapon',slotLevel:2,toCell:f.toCell,targetId:f.target.id}
  if(explicitFalse)input.nonlethal=false
  const attack=strike(ok(await f.call('cast_spell',input))),state=await roundtrip(f.call)
  assert.equal(attack.nonlethal,false);assert.equal(attack.targetDied,true);assert.equal(attack.targetKnockedOut,false)
  assert.equal(state.monsters[f.target.id].knockout,undefined);assert.equal(state.hero.corpseTimes[f.target.id],0)
  await refused(f.call,'cast_spell',{spellId:'spiritual-weapon',slotLevel:2,toCell:f.toCell,targetId:f.target.id,nonlethal:true},'NONLETHAL_LIVING_TARGET_REQUIRED')
  assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
 })
})

test('a miss and a nonterminal hit consume only the real cast and never a KO recovery die',async t=>{
 for(const miss of [true,false])await t.test(miss?'miss':'nonterminal',async t=>{
  const f=await setup(t,{dice:miss?'1,19':'17,4,19',hp:200}),before=await f.call('get_game_state')
  const attack=strike(ok(await cast(f))),state=await roundtrip(f.call)
  assert.equal(attack.hit,!miss);assert.equal(attack.targetKnockedOut,false);assert.equal(attack.targetDied,false)
  assert.equal(before.player.stats.wis,18);assert.equal(state.monsters[f.target.id].hp.current,miss?200:192)
  assert.equal(state.monsters[f.target.id].knockout,undefined)
  assert.equal(state.player.spellSlots.level2.current,before.player.spellSlots.level2.current-1)
  assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
 })
})

test('real slot scaling and a natural critical precede the same stable knockout without another attack or source die',async t=>{
 const f=await setup(t,{dice:'20,1,2,3,4,2,19'}),before=await f.call('get_game_state')
 const attack=strike(ok(await cast(f,{slotLevel:4}))),state=await roundtrip(f.call)
 assert.equal(attack.roll.rolls[0],20);assert.deepEqual(attack.damageRoll.rolls,[1,2,3,4])
 assert.equal(attack.damageRoll.total,14);assert.equal(attack.targetKnockedOut,true)
 assert.equal(state.monsters[f.target.id].knockout.attackEventId,attack.attackEventId)
 assert.deepEqual(state.monsters[f.target.id].knockout.recovery,{hours:2,wakeAt:7200})
 assert.equal(state.player.spellSlots.level4.current,before.player.spellSlots.level4.current-1)
 assert.equal(state.player.spellSlots.level2.current,before.player.spellSlots.level2.current)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('ranged, saving-throw, automatic and healing spells reject any nonlethal field even false before dice slots components or actions',async t=>{
 const f=await setup(t,{dice:'19'})
 for(const spellId of ['guiding-bolt','ray-of-frost','sacred-flame','magic-missile','cure-wounds'])
  for(const nonlethal of [true,false])await refused(f.call,'cast_spell',{spellId,targetId:f.target.id,nonlethal},'NONLETHAL_SPELL_ATTACK_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('creation without one exact attack target cannot store a future knockout default even false',async t=>{
 const f=await setup(t,{dice:'19'})
 for(const nonlethal of [true,false]){
  await refused(f.call,'cast_spell',{spellId:'spiritual-weapon',slotLevel:2,toCell:f.toCell,nonlethal},'NONLETHAL_SPELL_ATTACK_REQUIRED')
  await refused(f.call,'cast_spell',{spellId:'spiritual-weapon',slotLevel:2,toCell:f.toCell,targetIds:[f.target.id],nonlethal},'NONLETHAL_SPELL_ATTACK_REQUIRED')
 }
 const answer=ok(await f.call('cast_spell',{spellId:'spiritual-weapon',slotLevel:2,toCell:f.toCell}))
 assert.ok(answer.results.some(entry=>entry.kind==='spiritual-weapon'));assert.equal(strike(answer),undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the weapon actual creation cell must put its melee spell attack in reach before a slot bonus action effect or die is spent',async t=>{
 const f=await setup(t),state=await f.call('get_game_state')
 await refused(f.call,'cast_spell',{spellId:'spiritual-weapon',slotLevel:2,toCell:state.player.position,targetId:f.target.id,nonlethal:true},'TARGET_OUT_OF_RANGE')
 assert.equal(strike(ok(await cast(f))).targetKnockedOut,true)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('source immunity and unsupported initial danger refuse before spell creation bonus action slots or dice',async t=>{
 for(const mode of ['immune','hazard'])await t.test(mode,async t=>{
  const f=await setup(t,{type:mode==='immune'?'will_o_wisp':'goblin',dice:'19',combat:mode!=='hazard'})
  if(mode==='hazard'){
   // A real ingested Midnight Tears dose is pending without immediate damage.
   const position=(await f.call('get_game_state')).monsters[f.target.id].position
   ok(await f.call('create_affliction_source',{sourceId:'spell-ko-danger',templateId:'midnight_tears',name:'Dose ingérée réellement établie',cell:position,doses:1}))
   ok(await f.call('expose_affliction',{sourceId:'spell-ko-danger',targetId:f.target.id,eventId:'spell-ko-ingestion',delivery:'ingested',midnightAt:86400}))
   await battle(f.call,[f.target.id])
  }
  await refused(f.call,'cast_spell',{spellId:'spiritual-weapon',slotLevel:2,toCell:f.toCell,targetId:f.target.id,nonlethal:true},mode==='immune'?'NONLETHAL_CONDITION_IMMUNE':'NONLETHAL_ONGOING_DAMAGE_UNSUPPORTED')
  assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
 })
})

test('temporary hit points can absorb the entire melee spell impact without creating a knockout or recovery die',async t=>{
 const f=await setup(t,{dice:'17,4,19'})
 ok(await f.call('grant_temporary_hp',{eventId:'spell-buffer',targetId:f.target.id,sourceId:'established-ward',sourceDescription:'Protection temporaire effectivement établie.',amount:10,duration:{kind:'until_long_rest'}}))
 const attack=strike(ok(await cast(f))),state=await roundtrip(f.call)
 assert.equal(attack.targetKnockedOut,false);assert.equal(state.monsters[f.target.id].hp.current,1);assert.equal(state.monsters[f.target.id].knockout,undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('successful source Undead Fortitude leaves a real HP and never consumes the knockout d4',async t=>{
 const f=await setup(t,{type:'zombie',dice:'17,4,10,19'})
 const attack=strike(ok(await cast(f))),state=await roundtrip(f.call)
 assert.equal(attack.targetKnockedOut,false);assert.equal(state.monsters[f.target.id].hp.current,1);assert.equal(state.monsters[f.target.id].isAlive,true)
 assert.equal(state.monsters[f.target.id].knockout,undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the early internal guard rejects NPC casting and Ready preparation before their original validation or cost path',async t=>{
 const f=await setup(t,{dice:'19',combat:false}),mage=await spawn(f.call,'mage')
 await battle(f.call,[f.target.id,mage.id])
 const snapshot=await f.call('get_game_state')
 const gs=require('../mcp-server/dist/mcp-server/game-state.js'),{cast5eSpell}=require('../mcp-server/dist/mcp-server/hero-spells.js')
 const original=structuredClone(gs.getState());t.after(()=>gs.replaceState(original));gs.replaceState(snapshot)
 const savedDice=process.env.AI_DM_TEST_DICE_SEQUENCE
 process.env.AI_DM_TEST_DICE_SEQUENCE='19,18'
 t.after(()=>{if(savedDice===undefined)delete process.env.AI_DM_TEST_DICE_SEQUENCE;else process.env.AI_DM_TEST_DICE_SEQUENCE=savedDice})
 for(const nonlethal of [true,false]){
  assert.throws(()=>cast5eSpell({spellId:'spiritual-weapon',casterId:mage.id,targetId:f.target.id,toCell:f.toCell,nonlethal}),{code:'NONLETHAL_PLAYER_ATTACK_REQUIRED'})
  assert.deepEqual(gs.getState(),snapshot)
  assert.throws(()=>cast5eSpell({spellId:'spiritual-weapon',targetId:f.target.id,toCell:f.toCell,readiedPrepare:{trigger:'Signal réellement observé.'},nonlethal}),{code:'NONLETHAL_SPELL_ATTACK_REQUIRED'})
  assert.deepEqual(gs.getState(),snapshot)
 }
 assert.equal(require('../mcp-server/dist/mcp-server/dice.js').rollDice('1d20').total,19)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the actual legacy campaign caster rejects a present knockout flag even false instead of silently ignoring it',async t=>{
 const call=await engine(t,{adventureId:'grammys-country-apple-pie',characterId:'cleric',dice:'19'}),target=await spawn(call)
 const state=await call('get_game_state');assert.notEqual(state.player.ruleset,'srd2014')
 for(const nonlethal of [true,false])await refused(call,'cast_spell',{
  spellId:'spiritual-weapon',targetId:target.id,toCell:state.player.position,nonlethal,
 },'SRD_PROFILE_REQUIRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
