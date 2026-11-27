const test=require('node:test'),assert=require('node:assert/strict')
const {engine:spawnEngine,ok,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
// The actual cleric's CON save can total <=5; the level-7 fighter's cannot.
const engine=(t,options)=>spawnEngine(t,{characterId:'cleric',...options})
const {validatePetrifiedSpriteHistory}=require('../mcp-server/dist/mcp-server/petrified-sprite-effects.js')
const {getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js')
const spriteEffects=(state,targetId='player')=>state.monsterEffects.filter(effect=>effect.targetId===targetId&&['sprite-poison','sprite-sleep'].includes(effect.kind))
async function exploration(call){return replace(call,state=>Object.assign(state,{phase:'exploration',currentTurn:null,initiativeOrder:[],round:0}))}
async function contaminate(call,targetId='player'){
 const sprite=await spawn(call,'sprite')
 await battle(call,[sprite.id,...targetId==='player'?[]:[targetId]],sprite.id)
 ok(await call('resolve_attack',{attackerId:sprite.id,targetId,weaponOrSpell:'Shortbow'}))
 await exploration(call)
 const effects=spriteEffects(await call('get_game_state'),targetId)
 assert.equal(effects.length,2);assert.equal(effects.find(e=>e.kind==='sprite-sleep').spritePoisonId,effects.find(e=>e.kind==='sprite-poison').id)
 return{sprite,effects}
}
async function stone(call,targetId='player',seconds=100,provider='hero'){
 await replace(call,state=>{
  const expiresAt=state.worldTimeSeconds+seconds,id='actual-stone-'+targetId
  if(provider==='hero')state.hero.effects.push({id,kind:'actual-petrification',sourceId:'player',targetIds:[targetId],expiresAt,concentration:false,data:{condition:'petrified'}})
  else state.monsterEffects.push({id,kind:'actual-petrification',sourceId:'player',targetId,expiresAt,conditions:['petrified']})
 })
 return ok(await call('apply_condition',{entityId:targetId,condition:'petrified'}))
}
async function roundtrip(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)}
async function freeCasterHand(call){const state=await call('get_game_state'),id=state.dmTools?.loadout?.mainHandId??state.player.inventory.find(item=>item.type==='weapon')?.id;if(id)ok(await call('equip_item',{itemId:id,slot:'main_hand',operation:'unequip'}))}

test('sprite poison and linked sleep preserve IDs, source and remaining time through stone and hydration',async t=>{
 const call=await engine(t,{dice:'17,17,1,19'}),{effects}=await contaminate(call)
 ok(await call('advance_time',{seconds:10}));await stone(call)
 let state=await roundtrip(call)
 for(const effect of spriteEffects(state)){
  assert.deepEqual(effect.conditions,[]);assert.equal(effect.petrificationPause.pausedAt,10)
  assert.equal(effect.expiresAt,60);assert.ok(effects.some(original=>original.id===effect.id&&original.sourceId===effect.sourceId))
 }
 assert.ok(!state.player.conditions.includes('poisoned'));assert.ok(!state.player.conditions.includes('unconscious'))
 const dropped=structuredClone(state.droppedItems),loadout=structuredClone(state.dmTools.loadout)
 ok(await call('advance_time',{seconds:100}));state=await call('get_game_state')
 assert.ok(state.player.conditions.includes('poisoned'));assert.ok(state.player.conditions.includes('unconscious'))
 assert.deepEqual(state.droppedItems,dropped);assert.deepEqual(state.dmTools.loadout,loadout)
 for(const effect of spriteEffects(state)){assert.equal(effect.expiresAt,160);assert.equal(effect.petrificationPause,undefined)}
 ok(await call('advance_time',{seconds:49}));assert.equal(spriteEffects(await call('get_game_state')).length,2)
 ok(await call('advance_time',{seconds:1}));assert.equal(spriteEffects(await call('get_game_state')).length,0)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

for(const provider of ['hero','monster'])test('large clock jump uses actual '+provider+' stone expiry without restoring already expired sprite symptoms',async t=>{
 const call=await engine(t,{dice:'17,17,1,19'});await contaminate(call);await stone(call,'player',100,provider)
 ok(await call('advance_time',{seconds:500}));const state=await call('get_game_state')
 assert.equal(spriteEffects(state).length,0);assert.ok(!state.player.conditions.includes('petrified'))
 assert.ok(!state.player.conditions.includes('poisoned'));assert.ok(!state.player.conditions.includes('unconscious'))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('positive damage during stone does not erase suspended sleep; damage after resumption wakes only that sleep',async t=>{
 const call=await engine(t,{dice:'17,17,1,19'});await contaminate(call);await stone(call)
 ok(await call('update_hp',{entityId:'player',delta:-2,reason:'Dégât réel sur la statue.',damageType:'force',damageOrigin:'environment'}))
 let state=await call('get_game_state');assert.equal(spriteEffects(state).length,2);assert.ok(spriteEffects(state).every(effect=>effect.petrificationPause))
 ok(await call('advance_time',{seconds:100}));ok(await call('update_hp',{entityId:'player',delta:-1,reason:'Dégât réel au réveil.',damageType:'force',damageOrigin:'environment'}))
 state=await call('get_game_state');assert.ok(!state.player.conditions.includes('unconscious'));assert.ok(state.player.conditions.includes('poisoned'))
 assert.deepEqual(spriteEffects(state).map(effect=>effect.kind),['sprite-poison'])
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('shake action refuses a suspended sprite source before cost and wakes only sleep after real stone removal',async t=>{
 const call=await engine(t,{dice:'17,17,1,19'}),victim=await spawn(call)
 await contaminate(call,victim.id);await stone(call,victim.id)
 await refused(call,'wake_sleeping_creature',{actorId:'player',targetId:victim.id},'SPRITE_EFFECT_SUSPENDED')
 ok(await call('advance_time',{seconds:100}));ok(await call('wake_sleeping_creature',{actorId:'player',targetId:victim.id}))
 const state=await call('get_game_state');assert.ok(!state.monsters[victim.id].conditions.includes('unconscious'))
 assert.ok(state.monsters[victim.id].conditions.includes('poisoned'));assert.equal(spriteEffects(state,victim.id).length,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a new sprite arrow against stone is a real hit with poison immunity, no save and no extra source',async t=>{
 const call=await engine(t,{dice:'17,17,1,17,17,19'}),{sprite}=await contaminate(call)
 await stone(call);const before=await call('get_game_state')
 await battle(call,[sprite.id],sprite.id)
 const attack=ok(await call('resolve_attack',{attackerId:sprite.id,targetId:'player',weaponOrSpell:'Shortbow'}))
 assert.equal(attack.hit,true)
 const state=await call('get_game_state');assert.equal(spriteEffects(state).length,2)
 assert.deepEqual(spriteEffects(state),spriteEffects(before));assert.deepEqual(state.player.hp,before.player.hp)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('native poison immunity prevents both sprite symptoms and a needless save',async t=>{
 const call=await engine(t,{dice:'17,17,19'}),victim=await spawn(call,'zombie'),sprite=await spawn(call,'sprite')
 await battle(call,[sprite.id,victim.id],sprite.id)
 const attack=ok(await call('resolve_attack',{attackerId:sprite.id,targetId:victim.id,weaponOrSpell:'Shortbow'}))
 assert.equal(attack.hit,true);assert.equal(spriteEffects(await call('get_game_state'),victim.id).length,0)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('suspension preserves an independent active unconscious provider',async t=>{
 const call=await engine(t,{dice:'17,17,1,19'});await contaminate(call)
 await replace(call,state=>state.hero.effects.push({id:'independent-sleep',kind:'independent-sleep',sourceId:'player',targetIds:['player'],expiresAt:500,concentration:false,data:{condition:'unconscious'}}))
 await stone(call);const state=await roundtrip(call)
 assert.ok(state.player.conditions.includes('unconscious'));assert.ok(!state.player.conditions.includes('poisoned'))
 assert.ok(state.hero.effects.some(effect=>effect.id==='independent-sleep'));assert.ok(spriteEffects(state).every(effect=>effect.conditions.length===0))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

for(const spellId of ['lesser-restoration','protection-from-poison'])test(spellId+' neutralizes exactly one suspended sprite poison and its attested sleep, without return at stone expiry',async t=>{
 const call=await engine(t,{characterId:'cleric',dice:'17,17,1,19'}),victim=await spawn(call)
 const{effects}=await contaminate(call,victim.id);await stone(call,victim.id);await freeCasterHand(call)
 const poison=effects.find(effect=>effect.kind==='sprite-poison')
 ok(await call('cast_spell',{spellId,targetId:victim.id,slotLevel:2,afflictionId:poison.id,...spellId==='lesser-restoration'?{condition:'poisoned'}:{}}))
 let state=await roundtrip(call);assert.equal(spriteEffects(state,victim.id).length,0);assert.ok(state.monsters[victim.id].conditions.includes('petrified'))
 ok(await call('advance_time',{seconds:100}));state=await call('get_game_state')
 assert.ok(!state.monsters[victim.id].conditions.includes('poisoned'));assert.ok(!state.monsters[victim.id].conditions.includes('unconscious'))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('ambiguous unlinked legacy sprite sleep refuses a cure before slot, source or dice changes',async t=>{
 const call=await engine(t,{characterId:'cleric',dice:'17,17,1,19'}),victim=await spawn(call)
 const{effects}=await contaminate(call,victim.id)
 await replace(call,state=>{
  const poison=spriteEffects(state,victim.id).find(effect=>effect.kind==='sprite-poison'),sleep=spriteEffects(state,victim.id).find(effect=>effect.kind==='sprite-sleep')
  delete sleep.spritePoisonId;state.monsterEffects.push({...structuredClone(poison),id:'another-legacy-poison'})
 })
 await stone(call,victim.id);await freeCasterHand(call)
 await refused(call,'cast_spell',{spellId:'lesser-restoration',targetId:victim.id,slotLevel:2,condition:'poisoned',afflictionId:effects.find(effect=>effect.kind==='sprite-poison').id},'SPRITE_POISON_LINK_AMBIGUOUS')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('curing an exact paused sprite source preserves a distinct structured poison and its resumed symptoms',async t=>{
 const call=await engine(t,{characterId:'cleric',dice:'17,17,1,1,19'}),victim=await spawn(call)
 const{effects}=await contaminate(call,victim.id),state=await call('get_game_state')
 ok(await call('create_affliction_source',{sourceId:'separate-malice',templateId:'malice',name:'Une autre source réellement établie',cell:state.monsters[victim.id].position,doses:1}))
 ok(await call('expose_affliction',{sourceId:'separate-malice',eventId:'inhaled',targetId:victim.id,delivery:'inhaled'}))
 await stone(call,victim.id);await freeCasterHand(call)
 ok(await call('cast_spell',{spellId:'lesser-restoration',targetId:victim.id,slotLevel:2,condition:'poisoned',afflictionId:effects.find(effect=>effect.kind==='sprite-poison').id}))
 let after=await call('get_game_state');assert.equal(spriteEffects(after,victim.id).length,0)
 assert.equal(after.dmTools.afflictions.records['separate-malice:inhaled'].status,'active')
 assert.ok(after.dmTools.afflictions.records['separate-malice:inhaled'].petrificationPause)
 ok(await call('advance_time',{seconds:100}));after=await call('get_game_state')
 assert.ok(after.monsters[victim.id].conditions.includes('poisoned'));assert.ok(after.monsters[victim.id].conditions.includes('blinded'))
 assert.ok(!after.monsters[victim.id].conditions.includes('unconscious'))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('strict pause data and real links survive hydration while corrupt source links or clocks refuse unchanged',async t=>{
 const call=await engine(t,{dice:'17,17,1,19'});await contaminate(call);await stone(call)
 const saved=await roundtrip(call)
 for(const [change,code]of [[s=>spriteEffects(s)[0].petrificationPause.extra=true,'MCP_INPUT_INVALID'],
  [s=>spriteEffects(s)[0].petrificationPause.pausedAt=1,'PETRIFIED_SPRITE_STATE_MISMATCH'],
  [s=>spriteEffects(s).find(effect=>effect.kind==='sprite-sleep').spritePoisonId='missing-poison','SPRITE_POISON_LINK_INVALID']]){
  const corrupt=structuredClone(saved);change(corrupt);await refused(call,'replace_game_state',{gameState:corrupt},code)
 }
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('legacy stone with no saved sprite pause is distinguishable and blocks time without inventing onset',async t=>{
 const call=await engine(t,{dice:'17,17,1,19'});await contaminate(call)
 await replace(call,state=>state.player.conditions.push('petrified'))
 const state=await call('get_game_state'),validation=validatePetrifiedSpriteHistory(state)
 assert.equal(validation.valid,true);assert.equal(validation.unresolvedEffectIds.length,2)
 await refused(call,'advance_time',{seconds:10},'PETRIFIED_SPRITE_HISTORY_REQUIRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('saved sprite pause follows archived floors or retired actors without activating them',async t=>{
 const call=await engine(t,{dice:'17,17,1,19'}),victim=await spawn(call)
 await contaminate(call,victim.id);await stone(call,victim.id)
 const state=await call('get_game_state'),other=getAdventureMap(state).maps.find(map=>map.id!==state.currentMapId);assert.ok(other)
 for(const archive of ['floor','retired']){
  const archived=structuredClone(state);archived.sceneMemory??={}
  if(archive==='floor')archived.sceneMemory.floorMonsters={[other.id]:{[victim.id]:archived.monsters[victim.id]}}
  else archived.sceneMemory.retiredMonsters={[victim.id]:archived.monsters[victim.id]}
  delete archived.monsters[victim.id]
  assert.deepEqual(validatePetrifiedSpriteHistory(archived),{valid:true,errors:[],unresolvedEffectIds:[]})
 }
 const archived=structuredClone(state);archived.sceneMemory??={};archived.sceneMemory.floorMonsters={[other.id]:{[victim.id]:archived.monsters[victim.id]}};delete archived.monsters[victim.id]
 ok(await call('replace_game_state',{gameState:archived}));ok(await call('advance_time',{seconds:50}))
 const after=await call('get_game_state');assert.equal(after.monsters[victim.id],undefined)
 assert.ok(spriteEffects(after,victim.id).every(effect=>effect.petrificationPause.pausedAt===0))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
