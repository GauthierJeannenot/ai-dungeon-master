const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
const {persistedConditionTarget}=require('../mcp-server/dist/mcp-server/persisted-conditions.js')
const {AFFLICTIONS}=require('../mcp-server/dist/lib/srd/afflictions.js')
const floorBody=(state,id)=>state.sceneMemory.floorMonsters.temple[id]
const spriteEffects=(state,id)=>state.monsterEffects.filter(effect=>effect.targetId===id&&['sprite-poison','sprite-sleep'].includes(effect.kind))
async function setup(t,dice='1,19'){
 const call=await engine(t,{characterId:'cleric',dice})
 await replace(call,state=>{Object.assign(state,{phase:'exploration',currentTurn:null,initiativeOrder:[],round:0,currentMapId:'temple',currentRoomId:'20'});state.player.position={x:38,y:22}})
 const victim=await spawn(call);return{call,victim}
}
async function expose(call,victim,templateId='malice',id='actual-source',extra={}){
 const state=await call('get_game_state')
 ok(await call('create_affliction_source',{sourceId:id,templateId,name:'Source établie avant de quitter cet étage',cell:state.monsters[victim.id].position,doses:2}))
 ok(await call('expose_affliction',{sourceId:id,eventId:'actual-exposure',targetId:victim.id,delivery:AFFLICTIONS[templateId].delivery,...extra}))
 return id+':actual-exposure'
}
async function contaminateSprite(call,victim){
 const sprite=await spawn(call,'sprite');await battle(call,[sprite.id,victim.id],sprite.id)
 ok(await call('resolve_attack',{attackerId:sprite.id,targetId:victim.id,weaponOrSpell:'Shortbow'}))
 await replace(call,state=>Object.assign(state,{phase:'exploration',currentTurn:null,initiativeOrder:[],round:0}))
 const effects=spriteEffects(await call('get_game_state'),victim.id);assert.equal(effects.length,2);return effects
}
async function stone(call,victim,providers=[{kind:'hero',seconds:100}]){
 await replace(call,state=>{
  for(const [i,provider]of providers.entries()){
   const id='actual-stone-provider-'+i,expiresAt=state.worldTimeSeconds+provider.seconds
   if(provider.kind==='hero')state.hero.effects.push({id,kind:'fixture-established-stone',sourceId:'player',targetIds:[victim.id],expiresAt,concentration:false,data:{condition:'petrified'}})
   else state.monsterEffects.push({id,kind:'fixture-established-stone',sourceId:'player',targetId:victim.id,expiresAt,conditions:['petrified']})
  }
 })
 ok(await call('apply_condition',{entityId:victim.id,condition:'petrified'}))
}
async function descend(call){ok(await call('travel_to_map',{transitionId:'descend_manor'}));assert.equal((await call('get_game_state')).currentMapId,'cellar')}
async function ascend(call){ok(await call('travel_to_map',{transitionId:'ascend_manor'}));assert.equal((await call('get_game_state')).currentMapId,'temple')}
async function roundtrip(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)}
async function freeHand(call){const state=await call('get_game_state'),id=state.dmTools?.loadout?.mainHandId??state.player.inventory.find(item=>item.type==='weapon')?.id;if(id)ok(await call('equip_item',{itemId:id,slot:'main_hand',operation:'unequip'}))}

test('a structured poison resumes on the actual archived floor at stone expiry and returns with the same IDs and remaining clock',async t=>{
 const{call,victim}=await setup(t),afflictionId=await expose(call,victim)
 const original=await call('get_game_state'),ids=original.hero.effects.filter(effect=>effect.data.afflictionId===afflictionId).map(effect=>effect.id).sort()
 await stone(call,victim);await descend(call);const archived=await call('get_game_state'),body=structuredClone(floorBody(archived,victim.id)),position=structuredClone(archived.player.position)
 ok(await call('advance_time',{seconds:100}));let state=await roundtrip(call)
 assert.equal(state.monsters[victim.id],undefined);assert.equal(state.currentMapId,'cellar');assert.deepEqual(state.player.position,position)
 assert.deepEqual(state.initiativeOrder,[]);assert.equal(state.currentTurn,null)
 assert.deepEqual(floorBody(state,victim.id).hp,body.hp);assert.deepEqual(floorBody(state,victim.id).position,body.position)
 assert.ok(!floorBody(state,victim.id).conditions.includes('petrified'));assert.ok(floorBody(state,victim.id).conditions.includes('poisoned'));assert.ok(floorBody(state,victim.id).conditions.includes('blinded'))
 assert.equal(state.dmTools.afflictions.records[afflictionId].expiresAt,3700)
 assert.deepEqual(state.hero.effects.filter(effect=>effect.data.afflictionId===afflictionId).map(effect=>effect.id).sort(),ids)
 await ascend(call);state=await call('get_game_state');assert.deepEqual(state.monsters[victim.id],floorBody(state,victim.id))
 assert.ok(state.monsters[victim.id].conditions.includes('poisoned'));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

for(const kind of ['hero','monster'])test(kind+' stone and resumed sprite effects expire in the real archived order during one long jump',async t=>{
 const{call,victim}=await setup(t,'17,17,1,19');await contaminateSprite(call,victim);await stone(call,victim,[{kind,seconds:100}]);await descend(call)
 const before=await call('get_game_state');ok(await call('advance_time',{seconds:500}));let state=await roundtrip(call)
 assert.equal(state.monsters[victim.id],undefined);assert.equal(spriteEffects(state,victim.id).length,0)
 assert.ok(!floorBody(state,victim.id).conditions.some(condition=>['petrified','poisoned','unconscious'].includes(condition)))
 assert.ok(floorBody(state,victim.id).conditions.includes('prone'));assert.deepEqual(floorBody(state,victim.id).hp,floorBody(before,victim.id).hp)
 await ascend(call);state=await call('get_game_state');assert.ok(!state.monsters[victim.id].conditions.includes('unconscious'))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('concurrent hero and monster stone providers preserve the pause until the last actual archived expiration',async t=>{
 const{call,victim}=await setup(t),afflictionId=await expose(call,victim)
 await stone(call,victim,[{kind:'hero',seconds:100},{kind:'monster',seconds:200}]);await descend(call)
 ok(await call('advance_time',{seconds:150}));let state=await roundtrip(call)
 assert.ok(floorBody(state,victim.id).conditions.includes('petrified'));assert.ok(!floorBody(state,victim.id).conditions.includes('poisoned'))
 assert.equal(state.dmTools.afflictions.records[afflictionId].petrificationPause.pausedAt,0)
 ok(await call('advance_time',{seconds:50}));state=await roundtrip(call)
 assert.ok(!floorBody(state,victim.id).conditions.includes('petrified'));assert.ok(floorBody(state,victim.id).conditions.includes('poisoned'))
 assert.equal(state.dmTools.afflictions.records[afflictionId].expiresAt,3800);assert.equal(state.dmTools.afflictions.records[afflictionId].petrificationPause,undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real cure before floor travel never resurrects a suspended poison at its off-map stone expiration',async t=>{
 const{call,victim}=await setup(t),afflictionId=await expose(call,victim)
 await stone(call,victim);await freeHand(call)
 ok(await call('cast_spell',{spellId:'lesser-restoration',slotLevel:2,targetId:victim.id,condition:'poisoned',afflictionId}))
 await descend(call);ok(await call('advance_time',{seconds:500}));const state=await roundtrip(call)
 assert.equal(state.dmTools.afflictions.records[afflictionId].status,'cured');assert.equal(state.monsters[victim.id],undefined)
 assert.ok(!floorBody(state,victim.id).conditions.some(condition=>['petrified','poisoned','blinded'].includes(condition)))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('Sight Rot incubation resumes in the archive without activating an actor or rolling another disease save',async t=>{
 const{call,victim}=await setup(t),afflictionId=await expose(call,victim,'sight_rot')
 await stone(call,victim);await descend(call);ok(await call('advance_time',{seconds:100}))
 let state=await call('get_game_state');assert.equal(state.dmTools.afflictions.records[afflictionId].nextAt,86500)
 ok(await call('advance_time',{seconds:86400}));state=await roundtrip(call)
 assert.equal(state.monsters[victim.id],undefined);assert.equal(state.dmTools.afflictions.records[afflictionId].sightPenalty,1)
 await ascend(call);assert.equal((await call('get_game_state')).dmTools.afflictions.records[afflictionId].sightPenalty,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('Midnight Tears keeps its exact shifted deadline and requires its explicit event only after the actor returns',async t=>{
 const{call,victim}=await setup(t,'19'),afflictionId=await expose(call,victim,'midnight_tears','actual-midnight',{midnightAt:500})
 await stone(call,victim,[{kind:'hero',seconds:1000}]);await descend(call)
 const originalHp=structuredClone(floorBody(await call('get_game_state'),victim.id).hp)
 ok(await call('advance_time',{seconds:1499}));let state=await roundtrip(call)
 assert.equal(state.dmTools.afflictions.records[afflictionId].nextAt,1500);assert.deepEqual(floorBody(state,victim.id).hp,originalHp)
 await ascend(call);ok(await call('advance_time',{seconds:1}))
 const inspected=ok(await call('inspect_afflictions',{targetId:victim.id})).records.find(record=>record.id===afflictionId)
 assert.equal(inspected.dueEvent,'midnight');assert.equal(inspected.status,'pending')
 assert.deepEqual((await call('get_game_state')).monsters[victim.id].hp,originalHp)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('all archived unconscious providers expire in order without erasing a later resumed sprite sleep',async t=>{
 const{call,victim}=await setup(t,'17,17,1,19');await contaminateSprite(call,victim)
 await replace(call,state=>state.hero.effects.push({id:'independent-unconscious-provider',kind:'fixture-established-sleep',sourceId:'player',targetIds:[victim.id],expiresAt:150,concentration:false,data:{condition:'unconscious'}}))
 await stone(call,victim);await descend(call);ok(await call('advance_time',{seconds:155}));let state=await roundtrip(call)
 assert.ok(!state.hero.effects.some(effect=>effect.id==='independent-unconscious-provider'))
 assert.ok(floorBody(state,victim.id).conditions.includes('unconscious'));assert.equal(spriteEffects(state,victim.id).find(effect=>effect.kind==='sprite-sleep').expiresAt,160)
 ok(await call('advance_time',{seconds:5}));state=await roundtrip(call)
 assert.ok(!floorBody(state,victim.id).conditions.includes('unconscious'));assert.equal(spriteEffects(state,victim.id).length,0)
 assert.equal(state.monsters[victim.id],undefined);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a genuinely concentrating mage remains a valid archived source until its spell really expires',async t=>{
 const{call,victim}=await setup(t);await expose(call,victim);const mage=await spawn(call,'mage')
 await battle(call,[victim.id,mage.id],mage.id)
 ok(await call('cast_creature_spell',{casterId:mage.id,spellId:'greater-invisibility',slotLevel:4,targetId:mage.id}))
 await replace(call,state=>Object.assign(state,{phase:'exploration',currentTurn:null,initiativeOrder:[],round:0}))
 const original=await call('get_game_state'),spell=original.hero.effects.find(effect=>effect.kind==='greater-invisibility'&&effect.sourceId===mage.id)
 const anchor=original.hero.effects.find(effect=>effect.kind==='concentration:greater-invisibility'&&effect.sourceId===mage.id)
 assert.ok(anchor?.concentration);assert.equal(spell?.data.groupId,anchor.id);await stone(call,victim);await descend(call)
 ok(await call('advance_time',{seconds:30}));let state=await roundtrip(call)
 assert.ok(state.hero.effects.some(effect=>effect.id===spell.id));assert.ok(state.hero.effects.some(effect=>effect.id===anchor.id));assert.ok(floorBody(state,mage.id).conditions.includes('invisible'))
 assert.equal(state.monsters[mage.id],undefined);assert.equal(state.monsters[victim.id],undefined)
 ok(await call('advance_time',{seconds:30}));state=await roundtrip(call)
 assert.ok(!state.hero.effects.some(effect=>effect.id===spell.id));assert.ok(!state.hero.effects.some(effect=>effect.id===anchor.id));assert.ok(!floorBody(state,mage.id).conditions.includes('invisible'))
 assert.ok(floorBody(state,victim.id).conditions.includes('petrified'));assert.equal(state.hero.concentrationIds[mage.id],undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a genuinely retired exhausted creature also thaws and resumes its timed source without reappearing',async t=>{
 const{call,victim}=await setup(t),afflictionId=await expose(call,victim)
 ok(await call('add_exhaustion',{eventId:'actual-exhaustion-before-retirement',targetId:victim.id,levels:1,reason:'Épuisement établi avant la retraite.'}))
 await stone(call,victim);await battle(call,[victim.id]);ok(await call('end_combat',{force:true,reason:'Le combat cesse par reddition, le corps reste sur place.'}))
 let state=await call('get_game_state');assert.equal(state.monsters[victim.id],undefined);assert.ok(state.sceneMemory.retiredMonsters[victim.id].conditions.includes('petrified'))
 ok(await call('advance_time',{seconds:100}));state=await roundtrip(call)
 const retired=state.sceneMemory.retiredMonsters[victim.id]
 assert.ok(!retired.conditions.includes('petrified'));assert.ok(retired.conditions.includes('poisoned'));assert.ok(retired.conditions.includes('exhaustion'))
 assert.equal(state.dmTools.afflictions.records[afflictionId].expiresAt,3700);assert.deepEqual(state.initiativeOrder,[])
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('legacy archived stone without a saved poison pause blocks clock/provider mutation, and public cures remain active-map only',async t=>{
 const{call,victim}=await setup(t),afflictionId=await expose(call,victim)
 await stone(call,victim);await freeHand(call);await descend(call)
 await refused(call,'cast_spell',{spellId:'lesser-restoration',slotLevel:2,targetId:victim.id,condition:'poisoned',afflictionId},'ENTITY_NOT_FOUND')
 await refused(call,'apply_condition',{entityId:victim.id,condition:'poisoned'},'ENTITY_NOT_FOUND')
 await replace(call,state=>{delete state.dmTools.afflictions.records[afflictionId].petrificationPause})
 await refused(call,'advance_time',{seconds:500},'PETRIFIED_AFFLICTION_HISTORY_REQUIRED')
 assert.equal((await call('get_game_state')).monsters[victim.id],undefined);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('persisted lookup ignores a stale cache of the current floor and always preserves references without activation',async t=>{
 const{call,victim}=await setup(t,'19'),state=await call('get_game_state'),active=state.monsters[victim.id]
 state.sceneMemory??={};state.sceneMemory.floorMonsters={temple:{[victim.id]:{...structuredClone(active),conditions:['petrified']}}}
 assert.equal(persistedConditionTarget(victim.id,state),active)
 delete state.monsters[victim.id];assert.equal(persistedConditionTarget(victim.id,state),undefined)
 const retired=structuredClone(active);state.sceneMemory.retiredMonsters={[victim.id]:retired}
 assert.equal(persistedConditionTarget(victim.id,state),retired);assert.equal(state.monsters[victim.id],undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
