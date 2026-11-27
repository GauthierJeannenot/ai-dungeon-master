const test=require('node:test'),assert=require('node:assert/strict')
const {engine:baseEngine,ok,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
const {getAdventureMap,getMapSpec}=require('../mcp-server/dist/lib/adventure-map.js')
const {navigationGrid}=require('../mcp-server/dist/lib/navigation.js')
const trapInput={trapId:'steel-sphere',name:'Sphère du couloir',template:'crushing_sphere',fromCell:{x:10,y:10},toCell:{x:11,y:11},
  northRune:{x:10,y:10},southRune:{x:10,y:11},triggerDoorId:'entry-apartment',geometryAdaptation:'Couloir court de 10 pieds sur 10, adapté à la salle existante ; dégâts et DD de la source conservés.'}
async function srdEngine(t,options={}){
  const call=await baseEngine(t,{adventureId:'grammys-country-apple-pie',...options})
  // This map intentionally keeps its legacy campaign profile. Transplant only
  // the current SRD character mechanics for this fixture, never campaign data.
  const source=await baseEngine(t,{characterId:options.characterId??'fighter'}),profile=await source('get_game_state')
  await replace(call,s=>{s.player=profile.player;s.hero=profile.hero;s.player.position={x:10,y:11}})
  return call
}
async function fixture(t,options={}){
  const call=await srdEngine(t,{...options,dice:'20,1,'+(options.dice??'')})
  ok(await call('create_complex_trap',trapInput))
  const enemy=await spawn(call,'goblin',{x:12,y:11})
  ok(await call('interact_door',{doorId:'entry-apartment',action:'open'}))
  if(options.outside)ok(await call('move_token',{tokenId:'player',toCell:{x:12,y:10}}))
  ok(await call('enter_combat',{combatants:['player',enemy.id]}));ok(await call('activate_complex_trap',{trapId:trapInput.trapId}))
  if(options.atHazard!==false)ok(await call('next_turn',{actorId:'player',skipAction:true}))
  return call
}
async function untilHazard(call){for(let n=0;n<8;n++){const s=await call('get_game_state');if(s.currentTurn?.startsWith('@complex-trap:'))return;ok(await call('next_turn',{actorId:s.currentTurn,skipAction:true}))}assert.fail('Actual trap turn must be reachable.')}
// Existing legacy positive profile/bardic fixture remains controlled; the new
// complex-trap-initiative tests use only public preparation and real turns.
async function newAction(call){return replace(call,s=>{s.actionUsed={};s.hero.actionCredits=1})}

test('complex source preparation is idempotent and validates geometry/actual closed trigger door before any die',async t=>{
  const call=await srdEngine(t,{dice:'19'})
  const made=ok(await call('create_complex_trap',trapInput)),state=await call('get_game_state')
  assert.equal(made.trap.damageDice,4);assert.equal(made.trap.status,'armed');assert.equal(made.trap.activated,false)
  assert.equal(made.trap.source.book,'xge');assert.match(made.trap.source.sha256,/^[a-f0-9]{64}$/)
  assert.equal(ok(await call('create_complex_trap',trapInput)).alreadyCreated,true)
  assert.deepEqual(await call('get_game_state'),state)
  assert.equal((await call('create_complex_trap',{...trapInput,geometryAdaptation:'Autre définition.'})).code,'COMPLEX_TRAP_ID_CONFLICT')
  assert.equal((await call('create_complex_trap',{...trapInput,trapId:'bad',toCell:{x:12,y:12}})).code,'COMPLEX_TRAP_GEOMETRY')
  assert.equal((await call('create_complex_trap',{...trapInput,trapId:'bad',triggerDoorId:'absent'})).code,'COMPLEX_TRAP_TRIGGER_DOOR')
  assert.deepEqual(await call('get_game_state'),state)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual door opening and an explicit combat activation are required, without automatic player action or initial damage',async t=>{
  const call=await srdEngine(t,{dice:'19'})
  ok(await call('create_complex_trap',trapInput))
  assert.equal((await call('activate_complex_trap',{trapId:trapInput.trapId})).code,'COMPLEX_TRAP_COMBAT_REQUIRED')
  const enemy=await spawn(call,'goblin',{x:12,y:11});await battle(call,[enemy.id])
  const before=await call('get_game_state')
  assert.equal((await call('activate_complex_trap',{trapId:trapInput.trapId})).code,'COMPLEX_TRAP_TRIGGER_NOT_MET')
  assert.deepEqual(await call('get_game_state'),before)
  ok(await call('interact_door',{doorId:'entry-apartment',action:'open'}))
  const opened=await call('get_game_state')
  ok(await call('activate_complex_trap',{trapId:trapInput.trapId}))
  let after=await call('get_game_state')
  assert.equal(after.player.hp.current,opened.player.hp.current);assert.equal(after.hero.actionCredits,opened.hero.actionCredits)
  assert.equal(after.dmTools.complexTraps['steel-sphere'].damageDice,4)
  assert.equal(ok(await call('activate_complex_trap',{trapId:trapInput.trapId})).alreadyActive,true)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('pulse requires every exact current target, uses source damage/save/prone, and never repeats a checkpoint',async t=>{
  const call=await fixture(t,{dice:'1,2,3,4,1,19'})
  const before=await call('get_game_state')
  assert.equal((await call('pulse_complex_trap',{trapId:trapInput.trapId,initiativeCount:20,targetIds:['player']})).code,'COMPLEX_TRAP_INITIATIVE_INVALID')
  assert.equal((await call('pulse_complex_trap',{trapId:trapInput.trapId,initiativeCount:10,targetIds:[]})).code,'COMPLEX_TRAP_TARGETS_INCOMPLETE')
  assert.deepEqual(await call('get_game_state'),before)
  const result=ok(await call('pulse_complex_trap',{trapId:trapInput.trapId,initiativeCount:10,targetIds:['player']}))
  assert.equal(result.damageRoll.total,10);assert.equal(result.results[0].save.dc,20);assert.equal(result.results[0].save.ability,'str')
  assert.equal(result.results[0].save.success,false);assert.equal(result.results[0].damageResolution.damageDealt,10)
  assert.equal(result.results[0].prone,true);assert.equal(result.nextDamageDice,6)
  const saved=await call('get_game_state');assert.equal(saved.hero.actionCredits,before.hero.actionCredits)
  ok(await call('replace_game_state',{gameState:saved}))
  assert.equal(ok(await call('pulse_complex_trap',{trapId:trapInput.trapId,initiativeCount:10,targetIds:['player']})).alreadyResolved,true)
  assert.deepEqual(await call('get_game_state'),saved)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('sphere accelerates after each pass, adds initiative20 from10d10 and enforces20-before10 without inventing automatic pulses',async t=>{
  const call=await fixture(t,{outside:true,dice:Array(80).fill(1).join(',')})
  for(let round=1;round<=3;round++){
    await untilHazard(call)
    const result=ok(await call('pulse_complex_trap',{trapId:trapInput.trapId,initiativeCount:10,targetIds:[]}))
    assert.equal(result.nextDamageDice,4+2*round)
  }
  await untilHazard(call)
  const before=await call('get_game_state')
  assert.equal((await call('pulse_complex_trap',{trapId:trapInput.trapId,initiativeCount:10,targetIds:[]})).code,'COMPLEX_TRAP_INITIATIVE_ORDER')
  assert.deepEqual(await call('get_game_state'),before)
  assert.equal(ok(await call('pulse_complex_trap',{trapId:trapInput.trapId,initiativeCount:20,targetIds:[]})).damageRoll.notation,'10d10')
  assert.equal(ok(await call('pulse_complex_trap',{trapId:trapInput.trapId,initiativeCount:10,targetIds:[]})).damageRoll.notation,'12d10')
  const after=await call('get_game_state');assert.equal(after.dmTools.complexTraps['steel-sphere'].damageDice,14)
  assert.equal(Object.keys(after.dmTools.complexTraps['steel-sphere'].pulses).length,5)
})

test('an inspired sphere save survives hydration and resolves shared damage/speed only once after the held reaction',async t=>{
  const call=await fixture(t,{characterId:'wizard',dice:'1,1,1,1,15,8,19'})
  await replace(call,s=>{s.hero.inspiration.push({targetId:'player',expiresAt:s.worldTimeSeconds+600,die:8})})
  const before=await call('get_game_state'),held=ok(await call('pulse_complex_trap',{trapId:trapInput.trapId,initiativeCount:10,targetIds:['player']}))
  assert.ok(held.pendingReaction)
  const saved=await call('get_game_state');assert.equal(saved.player.hp.current,before.player.hp.current);assert.equal(saved.dmTools.complexTraps['steel-sphere'].damageDice,4)
  ok(await call('replace_game_state',{gameState:saved}))
  const finished=ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}))
  assert.equal(finished.results[0].save.success,true);assert.equal(finished.results[0].damageResolution.damageDealt,2)
  assert.equal(finished.results[0].prone,false);assert.equal(finished.nextDamageDice,6)
  assert.equal(ok(await call('pulse_complex_trap',{trapId:trapInput.trapId,initiativeCount:10,targetIds:['player']})).alreadyResolved,true)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('portal sabotage requires a distinct examination action, three real successes, and southern shutdown physically blocks the exact tomb door',async t=>{
  const call=await fixture(t,{atHazard:false,characterId:'wizard',dice:'20,20,20,19'})
  assert.equal((await call('counter_complex_trap',{trapId:trapInput.trapId,portalId:'south',action:'vandalize'})).code,'COMPLEX_TRAP_EXAMINATION_REQUIRED')
  ok(await call('counter_complex_trap',{trapId:trapInput.trapId,portalId:'south',action:'examine'}))
  assert.equal((await call('counter_complex_trap',{trapId:trapInput.trapId,portalId:'south',action:'vandalize'})).code,'ACTION_ALREADY_USED')
  for(let n=1;n<=3;n++){
    await newAction(call)
    const result=ok(await call('counter_complex_trap',{trapId:trapInput.trapId,portalId:'south',action:'vandalize'}))
    assert.equal(result.success,true);assert.equal(result.successes,n);assert.equal(result.damageDice,Math.max(0,4-2*n))
  }
  await newAction(call)
  const saved=await call('get_game_state');assert.equal(saved.dmTools.complexTraps['steel-sphere'].status,'disabled')
  for(const action of ['open','force'])assert.equal((await call('interact_door',{doorId:'entry-apartment',action})).code,'SPHERE_BLOCKS_DOOR')
  const spec=getMapSpec(saved.currentMapId,saved),door=getAdventureMap(saved).doors.find(d=>d.id==='entry-apartment'),grid=navigationGrid(saved,'player',spec.geometry)
  assert.equal(grid.step(door.sides[0].cell,door.sides[1].cell,true,false),false,'even pathfinding ignoring ordinary closed doors must respect the steel obstruction')
  ok(await call('replace_game_state',{gameState:saved}))
  assert.equal((await call('interact_door',{doorId:'entry-apartment',action:'force'})).code,'SPHERE_BLOCKS_DOOR')
  assert.deepEqual(await call('get_game_state'),saved)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('disabling the north portal before activation creates no sphere and leaves the actual door geometry usable',async t=>{
  const call=await srdEngine(t,{characterId:'wizard',dice:'20,20,20,19'})
  ok(await call('create_complex_trap',trapInput))
  ok(await call('counter_complex_trap',{trapId:trapInput.trapId,portalId:'north',action:'examine'}))
  for(let n=0;n<3;n++)ok(await call('counter_complex_trap',{trapId:trapInput.trapId,portalId:'north',action:'vandalize'}))
  const state=await call('get_game_state');assert.equal(state.dmTools.complexTraps['steel-sphere'].activated,false)
  assert.equal(state.dmTools.complexTraps['steel-sphere'].status,'disabled')
  ok(await call('interact_door',{doorId:'entry-apartment',action:'open'}))
  const after=await call('get_game_state'),spec=getMapSpec(after.currentMapId,after),door=getAdventureMap(after).doors.find(d=>d.id==='entry-apartment')
  assert.equal(navigationGrid(after,'player',spec.geometry).step(door.sides[0].cell,door.sides[1].cell,true,false),true)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
