const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',APP_LOG_PERSIST_ENABLED:'false'})
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {engine,ok}=require('./helpers/mcp-toolkit.cjs')
const {persistShoveAside}=require('./helpers/dmg-shove-aside-fixture.cjs')
test.after(()=>pg.restore())
const input={trapId:'initiative-sphere',name:'Sphère mesurée',template:'crushing_sphere',fromCell:{x:7,y:7},toCell:{x:8,y:8},northRune:{x:7,y:7},southRune:{x:8,y:8},triggerDoorId:'reading_departure',geometryAdaptation:'Le MJ établit ce couloir local court de dix pieds par dix, dégâts et DD de la source inchangés.'}
async function setup(t,{dice,inside=true,solo=false,bystander=false}={}){
 const call=await engine(t,{dice})
 ok(await call('move_token',{tokenId:'player',toCell:{x:9,y:8}}))
 ok(await call('interact_door',{doorId:'reading_departure',action:'close'}))
 ok(await call('create_complex_trap',input))
 if(inside)ok(await call('move_token',{tokenId:'player',toCell:{x:8,y:8}}))
 ok(await call('interact_door',{doorId:'reading_departure',action:'open'}))
 if(bystander)ok(await call('spawn_monster',{monsterType:'goblin',cell:{x:9,y:7}}))
 if(solo){ok(await call('enter_combat',{combatants:['player'],hazardPreparation:{kind:'complex_trap',hazardId:input.trapId}}));return{call}}
 const enemy=ok(await call('spawn_monster',{monsterType:'goblin',cell:{x:9,y:7}}))
 ok(await call('enter_combat',{combatants:['player',enemy.id],tieOrder:['player',enemy.id]}))
 ok(await call('activate_complex_trap',{trapId:input.trapId}))
 return{call,enemy}
}
async function next(call){const s=await call('get_game_state');return ok(await call('next_turn',{actorId:s.currentTurn,skipAction:true}))}
async function untilHazard(call){for(let n=0;n<8;n++){const s=await call('get_game_state');if(s.currentTurn?.startsWith('@complex-trap:'))return s;await next(call)}assert.fail('Hazard was skipped.')}
async function unchanged(call,name,args,code){const s=await call('get_game_state'),result=await call(name,args);assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await call('get_game_state'),s)}
test('a real fixed trap turn follows BOTH creatures tied at10, cannot be skipped and resumes through SQL without new initiative or free action',async t=>{
 let {call,enemy}=await setup(t,{dice:'7,8,1,1,1,1,1,19'})
 let s=await call('get_game_state');assert.equal(s.player.initiative,10);assert.equal(s.monsters[enemy.id].initiative,10)
 assert.equal(s.currentTurn,'player');assert.equal(ok(await call('inspect_complex_trap_turn')).event,null)
 await unchanged(call,'pulse_complex_trap',{trapId:input.trapId,initiativeCount:10,targetIds:['player']},'COMPLEX_TRAP_NOT_CURRENT_INITIATIVE')
 await next(call);s=await call('get_game_state');assert.equal(s.currentTurn,enemy.id)
 await next(call);s=await call('get_game_state');assert.equal(s.currentTurn,'@complex-trap:initiative-sphere:10')
 const held=structuredClone(s)
 await unchanged(call,'next_turn',{skipAction:true},'COMPLEX_TRAP_TURN_DUE')
 await unchanged(call,'combat_action',{action:'dodge'},'COMPLEX_TRAP_TURN_DUE')
 await unchanged(call,'pulse_complex_trap',{trapId:input.trapId,initiativeCount:10,targetIds:[]},'COMPLEX_TRAP_TARGETS_INCOMPLETE')
 const corrupt=structuredClone(s);corrupt.initiativeOrder=corrupt.initiativeOrder.filter(id=>!id.startsWith('@complex-trap:'))
 assert.equal((await call('replace_game_state',{gameState:corrupt})).code,'MCP_INPUT_INVALID')
 assert.deepEqual(await call('get_game_state'),held)
 // Save and restore the untouched public snapshot, not a manufactured effect.
 call=await persistShoveAside(t,call,'1,1,1,1,1,19')
 const pulse=ok(await call('pulse_complex_trap',{trapId:input.trapId,initiativeCount:10,targetIds:['player']}))
 assert.equal(pulse.damageRoll.total,4);assert.equal(pulse.results[0].save.success,false)
 s=await call('get_game_state');assert.equal(s.player.hp.current,held.player.hp.current-4);assert.ok(s.player.conditions.includes('prone'))
 assert.equal(s.currentTurn,'player');assert.equal(s.round,2);assert.equal(s.hero.actionCredits,1)
 // A completed prior-round event is not a new current event. Replaying its
 // stable receipt is covered separately while the same real round remains.
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual rounds add20 only after acceleration, place20 before10, and retain the preserved creature initiatives',async t=>{
 const {call}=await setup(t,{inside:false,dice:'20,1,'+Array(80).fill(1).join(',')})
 for(let round=1;round<=3;round++){
  const s=await untilHazard(call);assert.equal(s.round,round);assert.ok(s.currentTurn.endsWith(':10'))
  const pulse=ok(await call('pulse_complex_trap',{trapId:input.trapId,initiativeCount:10,targetIds:[]}));assert.equal(pulse.nextDamageDice,4+2*round)
 }
 let s=await untilHazard(call);assert.equal(s.round,4);assert.ok(s.currentTurn.endsWith(':20'))
 await unchanged(call,'pulse_complex_trap',{trapId:input.trapId,initiativeCount:10,targetIds:[]},'COMPLEX_TRAP_INITIATIVE_ORDER')
 assert.equal(ok(await call('pulse_complex_trap',{trapId:input.trapId,initiativeCount:20,targetIds:[]})).damageRoll.notation,'10d10')
 s=await call('get_game_state');assert.ok(s.currentTurn.endsWith(':10'));assert.equal(s.round,4)
 assert.equal(ok(await call('pulse_complex_trap',{trapId:input.trapId,initiativeCount:10,targetIds:[]})).damageRoll.notation,'12d10')
 const after=await call('get_game_state');assert.equal(after.dmTools.complexTraps[input.trapId].damageDice,14)
 assert.equal(Object.keys(after.dmTools.complexTraps[input.trapId].pulses).length,5)
})

test('one real selected trap starts genuine solo initiative without an invented enemy and acts before a lower-initiative player',async t=>{
 const {call}=await setup(t,{solo:true,dice:'2,1,1,1,1,1,19'})
 const before=await call('get_game_state');assert.equal(before.player.initiative,5);assert.deepEqual(Object.keys(before.monsters),[])
 assert.equal(before.currentTurn,'@complex-trap:initiative-sphere:10');assert.equal(before.round,1)
 assert.equal(ok(await call('inspect_complex_trap_turn')).event.initiativeCount,10)
 await unchanged(call,'end_combat',{},'COMPLEX_TRAP_TURN_DUE')
 const result=ok(await call('pulse_complex_trap',{trapId:input.trapId,initiativeCount:10,targetIds:['player']}));assert.equal(result.damageRoll.total,4)
 const after=await call('get_game_state');assert.equal(after.currentTurn,'player');assert.equal(after.round,1)
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.equal(after.hero.actionCredits,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a nonparticipant outside the corridor cannot keep trap turns alive after actual death of the only participant',async t=>{
 const {call}=await setup(t,{solo:true,bystander:true,dice:Array(60).fill(10).join(',')})
 const start=await call('get_game_state'),outsider=Object.values(start.monsters)[0];assert.ok(outsider);assert.ok(!start.initiativeOrder.includes(outsider.id))
 for(let n=0;n<6;n++){
  let state=await call('get_game_state');if(state.player.deathSaves?.dead)break
  if(state.currentTurn==='player'){
   if(state.player.hp.current===0)ok(await call('roll_death_save',{}))
   state=await call('get_game_state');if(!state.player.deathSaves?.dead)await next(call)
  }
  state=await call('get_game_state');if(state.currentTurn?.startsWith('@complex-trap:'))ok(await call('pulse_complex_trap',{trapId:input.trapId,initiativeCount:10,targetIds:['player']}))
 }
 const ended=await call('get_game_state');assert.equal(ended.player.deathSaves?.dead,true);assert.equal(ended.monsters[outsider.id].isAlive,true)
 assert.equal(ok(await call('inspect_complex_trap_turn')).event,null)
 ok(await call('end_combat',{force:true,reason:'La seule participante à cette initiative est réellement morte ; le témoin hors couloir ne reçoit aucun tour inventé.'}))
 assert.equal((await call('get_game_state')).phase,'exploration')
})
