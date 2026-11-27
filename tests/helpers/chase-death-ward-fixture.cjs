const assert=require('node:assert/strict')
const{engine,ok,adjacent}=require('./mcp-toolkit.cjs')
const CODE='CHASE_DEATH_WARD_SEQUENCE_UNREPRESENTED'
async function refused(call,name,input,code=CODE){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}
async function message(call,requestId){
 const before=await call('get_game_state'),sync=structuredClone(before)
 sync.dmActionAllowance={requestId,actionRevisionAtStart:before.playerActionRevision??0,granted:false,...before.dmActionAllowance?.combatTurnKey?{combatTurnKey:before.dmActionAllowance.combatTurnKey}:{}}
 ok(await call('replace_game_state',{gameState:sync}))
 const after=await call('get_game_state'),old=structuredClone(before),next=structuredClone(after);delete old.dmActionAllowance;delete next.dmActionAllowance;assert.deepEqual(next,old)
}
async function setupWardChase(t,{level=4,ward=true,dice}={}){
 const call=await engine(t,{characterId:'cleric',dice}),initial=await call('get_game_state')
 assert.equal(initial.player.level,7);assert.equal(3+Math.floor((initial.player.stats.con-10)/2),5)
 ok(await call('prepare_spells',{spellIds:['death-ward']}));ok(await call('drop_item',{itemId:'mace'}))
 if(ward)ok(await call('cast_spell',{spellId:'death-ward',targetId:'player'}))
 ok(await call('add_exhaustion',{eventId:'ward-probe-real-other-source',targetId:'player',levels:level,reason:'Explicit exceptional MJ adjudication of this actual other-source exhaustion baseline, not a rest or inferred condition.'}))
 let s=await call('get_game_state');const pursuer=ok(await call('spawn_monster',{monsterType:'bandit',cell:adjacent(s)[0]}));s=await call('get_game_state')
 const guard=ok(await call('spawn_monster',{monsterType:'commoner',cell:adjacent(s)[0]}));s=await call('get_game_state')
 const fact=ok(await call('record_scene_fact',{description:'Actual current-map supported urban chase circumstances explicitly qualified for these existing bodies.',cell:s.player.position})).worldFact
 const role=ok(await call('record_scene_fact',{description:'Actual explicit guard role of this existing commoner, without a general Guard stat block.',cell:s.player.position})).worldFact
 const spear=ok(await call('record_scene_fact',{description:'The exact physical spear actually held by this guard before initiative, not given to the player.',cell:s.player.position})).worldFact
 ok(await call('qualify_chase_guard',{eventId:'ward-probe-real-guard',entityId:guard.id,roleFactId:role.id,spearFactId:spear.id,spearInstanceId:'ward-probe-actual-held-spear',actualSpearHeld:true}))
 ok(await call('enter_combat',{combatants:['player',pursuer.id,guard.id],tieOrder:['player',pursuer.id,guard.id]}))
 const chaseId='ward-probe-real-chase'
 ok(await call('begin_chase',{eventId:'ward-probe-real-chase-begin',chaseId,quarryId:'player',pursuerIds:[pursuer.id],table:'urban',guardIds:[guard.id],reason:'Explicit optional official urban chase with actual initiative, current supported bodies and no inferred movement.'}))
 async function next(){const s=await call('get_game_state');return ok(await call('next_turn',{actorId:s.currentTurn,skipAction:true,reason:'Explicitly chosen end of this real completed chase turn, without fabricated action or movement.'}))}
 for(let round=1;round<=5;round++){
  ok(await call('chase_dash',{eventId:'ward-free-dash-'+round,chaseId,actorId:'player'}))
  assert.equal(ok(await call('resolve_chase_turn',{eventId:'ward-free-player-end-'+round,chaseId})).checks.length,0)
  await next();ok(await call('resolve_chase_turn',{eventId:'ward-free-pursuer-end-'+round,chaseId}));await next()
  ok(await call('resolve_chase_escape',{eventId:'ward-real-visible-escape-'+round,chaseId,leaderId:pursuer.id,sightFactId:fact.id,continuousSight:true,hide:'normal',area:'normal',senseByPursuer:{[pursuer.id]:'sight'}}));await next()
 }
 s=await call('get_game_state');assert.equal(s.currentTurn,'player');assert.equal(s.dmTools.exhaustion.creatures.player.level,level);assert.equal(s.dmTools.chases.episodes[chaseId].participants.player.dashIds.length,5)
 await message(call,'ward-probe-real-sixth-turn-message')
 const first={eventId:'ward-actual-sixth-dash',chaseId,actorId:'player'},second={eventId:'ward-actual-seventh-dash',chaseId,actorId:'player'}
 ok(await call('chase_dash',first));ok(await call('grant_player_action',{reason:'Exceptional explicit MJ grant of one second action in this actual player turn; the first Dash is resolved and no movement, reaction, source, exhaustion or resource is refreshed.'}))
 return{call,chaseId,first,second}
}
const freeDice=tail=>[20,20,10,1,...Array(10).fill(11),...tail].join(',')
module.exports={setupWardChase,freeDice,refused,message,CODE}
