const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn}=require('./helpers/mcp-toolkit.cjs')
const {AFFLICTIONS}=require('../mcp-server/dist/lib/srd/afflictions.js')
const {AfflictionStateSchema,afflictionSightPenalty}=require('../mcp-server/dist/lib/affliction-state.js')
const {validatePetrifiedAfflictionHistory}=require('../mcp-server/dist/mcp-server/afflictions.js')
const {getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js')
const record=(state,id)=>state.dmTools.afflictions.records[id+':exposure']
async function expose(call,templateId,id='toxin',targetId='player',extra={}){
 const state=await call('get_game_state'),target=targetId==='player'?state.player:state.monsters[targetId]
 ok(await call('create_affliction_source',{sourceId:id,templateId,name:'Contamination réelle du scénario',cell:target.position,doses:2}))
 return ok(await call('expose_affliction',{sourceId:id,eventId:'exposure',targetId,delivery:AFFLICTIONS[templateId].delivery,...extra}))
}
async function temporaryStone(call,targetId='player',seconds=100){
 await replace(call,state=>state.hero.effects.push({id:'established-stone-'+targetId,kind:'established-petrification',sourceId:'player',targetIds:[targetId],expiresAt:state.worldTimeSeconds+seconds,concentration:false,data:{condition:'petrified'}}))
 return ok(await call('apply_condition',{entityId:targetId,condition:'petrified'}))
}
async function rejectsUnchanged(call,name,input,code){
 const before=await call('get_game_state'),result=await call(name,input)
 assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await call('get_game_state'),before)
}

test('petrification suspends timed poison symptoms and resumes the original effects and remaining duration after real expiry',async t=>{
 const call=await engine(t,{dice:'1,17'});await expose(call,'malice')
 const before=await call('get_game_state'),ids=before.hero.effects.filter(e=>e.data.afflictionId==='toxin:exposure').map(e=>e.id).sort()
 assert.ok(before.player.conditions.includes('blinded'));await temporaryStone(call)
 let state=await call('get_game_state'),r=record(state,'toxin')
 assert.equal(r.status,'active');assert.equal(r.petrificationPause.pausedAt,0)
 assert.equal(r.expiresAt,3600);assert.equal(r.petrificationPause.effects.length,2)
 assert.ok(!state.player.conditions.includes('poisoned'));assert.ok(!state.player.conditions.includes('blinded'))
 ok(await call('advance_time',{seconds:50}));state=await call('get_game_state')
 ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state)
 ok(await call('advance_time',{seconds:50}));state=await call('get_game_state');r=record(state,'toxin')
 assert.equal(r.petrificationPause,undefined);assert.equal(r.expiresAt,3700)
 assert.ok(state.player.conditions.includes('poisoned'));assert.ok(state.player.conditions.includes('blinded'))
 assert.deepEqual(state.hero.effects.filter(e=>e.data.afflictionId===r.id).map(e=>e.id).sort(),ids)
 ok(await call('advance_time',{seconds:3599}));assert.equal(record(await call('get_game_state'),'toxin').status,'active')
 ok(await call('advance_time',{seconds:1}));assert.equal(record(await call('get_game_state'),'toxin').status,'ended')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('a long time jump uses the actual petrification expiration rather than extending poison until the late clock read',async t=>{
 const call=await engine(t,{dice:'1,17'});await expose(call,'malice');await temporaryStone(call)
 ok(await call('advance_time',{seconds:5000}));const state=await call('get_game_state')
 assert.equal(record(state,'toxin').status,'ended');assert.ok(!state.player.conditions.includes('petrified'))
 assert.ok(!state.player.conditions.includes('poisoned'));assert.ok(!state.player.conditions.includes('blinded'))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('Midnight Tears preserves its remaining delay without a new midnight or automatic save',async t=>{
 const call=await engine(t,{dice:['1',...Array(9).fill('1'),'17'].join(',')})
 await expose(call,'midnight_tears','delayed','player',{midnightAt:100});await temporaryStone(call,'player',200)
 ok(await call('advance_time',{seconds:150}));let state=await call('get_game_state')
 assert.equal(record(state,'delayed').nextAt,100);assert.equal(ok(await call('inspect_afflictions',{targetId:'player'})).records[0].dueEvent,undefined)
 await rejectsUnchanged(call,'resolve_affliction_event',{afflictionId:'delayed:exposure'},'AFFLICTION_EVENT_NOT_DUE')
 ok(await call('advance_time',{seconds:50}));state=await call('get_game_state')
 assert.equal(record(state,'delayed').nextAt,300);assert.equal(record(state,'delayed').petrificationPause,undefined)
 ok(await call('advance_time',{seconds:99}));await rejectsUnchanged(call,'resolve_affliction_event',{afflictionId:'delayed:exposure'},'AFFLICTION_EVENT_NOT_DUE')
 ok(await call('advance_time',{seconds:1}));const resolved=ok(await call('resolve_affliction_event',{afflictionId:'delayed:exposure'}))
 assert.equal(resolved.damageRoll.total,9);assert.equal(record(await call('get_game_state'),'delayed').status,'ended')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('Sight Rot incubation is suspended and resumes without disease discovery or progression during stone time',async t=>{
 const call=await engine(t,{dice:'1,17'});await expose(call,'sight_rot','disease');await temporaryStone(call,'player',172800)
 ok(await call('advance_time',{seconds:86400}));let state=await call('get_game_state')
 assert.equal(record(state,'disease').sightPenalty,0);assert.equal(record(state,'disease').nextAt,86400)
 ok(await call('replace_game_state',{gameState:state}));ok(await call('advance_time',{seconds:86400}));state=await call('get_game_state')
 assert.equal(record(state,'disease').sightPenalty,0);assert.equal(record(state,'disease').nextAt,259200)
 ok(await call('advance_time',{seconds:86400}));state=await call('get_game_state')
 assert.equal(record(state,'disease').sightPenalty,1);assert.equal(record(state,'disease').status,'active')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('new poison and disease exposures against an already petrified creature are immune receipts without a save or new infection',async t=>{
 const call=await engine(t,{dice:'17'});ok(await call('apply_condition',{entityId:'player',condition:'petrified'}))
 for(const [id,template]of [['new-poison','malice'],['new-disease','sight_rot']]){
  const exposed=await expose(call,template,id);assert.equal(exposed.immune,true);assert.equal(exposed.affliction.status,'ended')
  const state=await call('get_game_state');assert.equal(state.dmTools.afflictions.sources[id].doses,1)
  const replay=ok(await call('expose_affliction',{sourceId:id,eventId:'exposure',targetId:'player',delivery:AFFLICTIONS[template].delivery}))
  assert.equal(replay.alreadyResolved,true);assert.deepEqual(await call('get_game_state'),state)
 }
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('an affliction save already held for Bardic Inspiration cannot be invalidated by petrification',async t=>{
 const call=await engine(t,{dice:'1,17'})
 await replace(call,state=>state.hero.inspiration.push({targetId:'player',expiresAt:600,die:8}))
 const exposed=await expose(call,'malice');assert.ok(exposed.pendingReaction)
 await rejectsUnchanged(call,'apply_condition',{entityId:'player',condition:'petrified'},'REACTION_PENDING')
 ok(await call('resolve_reaction',{pendingId:exposed.pendingReaction.id,choice:'decline'}))
 ok(await call('apply_condition',{entityId:'player',condition:'petrified'}))
 assert.equal(record(await call('get_game_state'),'toxin').status,'active')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('an actual disease cure while petrified removes the stored source rather than restoring its symptoms at thaw',async t=>{
 const call=await engine(t,{characterId:'cleric',dice:'1,17'}),victim=await spawn(call,'goblin')
 await expose(call,'sight_rot','curable',victim.id);await temporaryStone(call,victim.id)
 const state=await call('get_game_state'),main=state.dmTools?.loadout?.mainHandId??state.player.inventory.find(i=>i.type==='weapon').id
 ok(await call('equip_item',{itemId:main,operation:'unequip',slot:'main_hand'}))
 ok(await call('cast_spell',{spellId:'lesser-restoration',targetId:victim.id,slotLevel:2,afflictionId:'curable:exposure'}))
 assert.equal(record(await call('get_game_state'),'curable').status,'cured')
 ok(await call('advance_time',{seconds:100}));const after=await call('get_game_state')
 assert.equal(record(after,'curable').petrificationPause,undefined);assert.equal(record(after,'curable').status,'cured')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('pause schema preserves only exact owned linked effects, rejects duplicates, and suppresses visual penalty while suspended',async t=>{
 const call=await engine(t,{dice:'1'});await expose(call,'malice');await temporaryStone(call)
 const state=await call('get_game_state'),data=structuredClone(state.dmTools.afflictions),r=record(state,'toxin')
 assert.equal(AfflictionStateSchema.safeParse(data).success,true)
 r.sightPenalty=3;assert.equal(afflictionSightPenalty(state,'player'),0)
 const bad=structuredClone(data);bad.records[r.id].petrificationPause.effects[0].data.afflictionId='foreign'
 assert.equal(AfflictionStateSchema.safeParse(bad).success,false)
 const duplicate=structuredClone(data);duplicate.records[r.id].petrificationPause.effects.push(structuredClone(duplicate.records[r.id].petrificationPause.effects[0]))
 assert.equal(AfflictionStateSchema.safeParse(duplicate).success,false)
})

test('legacy unanchored history stays distinguishable and archived frozen actors remain frozen without activation',async t=>{
 const call=await engine(t,{dice:'1'}),victim=await spawn(call,'goblin');await expose(call,'malice','archived',victim.id);await temporaryStone(call,victim.id)
 const state=await call('get_game_state'),before=structuredClone(state)
 assert.deepEqual(validatePetrifiedAfflictionHistory(state).errors,[])
 const unknown=structuredClone(state);delete record(unknown,'archived').petrificationPause
 const validation=validatePetrifiedAfflictionHistory(unknown)
 assert.equal(validation.valid,true);assert.deepEqual(validation.unresolvedRecordIds,['archived:exposure']);assert.deepEqual(unknown.monsters[victim.id].conditions,state.monsters[victim.id].conditions)
 const other=getAdventureMap(state).maps.find(map=>map.id!==state.currentMapId);assert.ok(other)
 state.sceneMemory??={};state.sceneMemory.floorMonsters={[other.id]:{[victim.id]:state.monsters[victim.id]}};delete state.monsters[victim.id]
 assert.deepEqual(validatePetrifiedAfflictionHistory(state),{valid:true,unresolvedRecordIds:[],errors:[]})
 assert.deepEqual(await call('get_game_state'),before,'pure archive/history validation changes no engine state')
})

test('multiple afflictions resume atomically without a half-restored condition/history state',async t=>{
 const call=await engine(t,{dice:'1,1,17'});await expose(call,'malice','first');await expose(call,'truth_serum','second')
 await temporaryStone(call);let state=await call('get_game_state')
 assert.ok(record(state,'first').petrificationPause);assert.ok(record(state,'second').petrificationPause)
 assert.ok(!state.hero.effects.some(effect=>effect.data.cannotKnowinglyLie))
 ok(await call('replace_game_state',{gameState:state}));ok(await call('advance_time',{seconds:100}));state=await call('get_game_state')
 assert.equal(record(state,'first').petrificationPause,undefined);assert.equal(record(state,'second').petrificationPause,undefined)
 assert.ok(state.player.conditions.includes('poisoned'));assert.ok(state.player.conditions.includes('blinded'))
 assert.ok(state.hero.effects.some(effect=>effect.data.cannotKnowinglyLie))
 assert.equal(record(state,'first').expiresAt,3700);assert.equal(record(state,'second').expiresAt,3700)
 assert.deepEqual(validatePetrifiedAfflictionHistory(state),{valid:true,unresolvedRecordIds:[],errors:[]})
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('repeat saves preserve their six-second remaining delay and are never rolled while suspended',async t=>{
 const call=await engine(t,{dice:'1,1,17'});await expose(call,'carrion_crawler_mucus','repeat');await temporaryStone(call)
 ok(await call('advance_time',{seconds:100}));let state=await call('get_game_state')
 assert.equal(record(state,'repeat').nextAt,106);assert.equal(record(state,'repeat').expiresAt,160)
 await rejectsUnchanged(call,'resolve_affliction_event',{afflictionId:'repeat:exposure'},'AFFLICTION_EVENT_NOT_DUE')
 ok(await call('advance_time',{seconds:6}));const event=ok(await call('resolve_affliction_event',{afflictionId:'repeat:exposure'}))
 assert.equal(event.save.success,false);state=await call('get_game_state')
 assert.equal(record(state,'repeat').nextAt,112);assert.equal(record(state,'repeat').successes,0)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})
