const test=require('node:test'),assert=require('node:assert/strict')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const breathing=require('../mcp-server/dist/mcp-server/breathing.js')
const {BreathingStateSchema}=require('../mcp-server/dist/lib/breathing-state.js')
const playerSuffocation=require('../mcp-server/dist/mcp-server/suffocation-player.js')

let collapsed,resumed
function fresh(con=10){
 gs.resetState();const state=gs.getState();state.player.stats.con=con;state.worldTimeSeconds=0
 collapsed=[];resumed=[]
 breathing.installBreathingHooks({collapse:event=>{collapsed.push(event)},stabilizeAfterAir:marker=>{
  assert.equal(breathing.breathingRecoveryBlocked(marker.entityId),false)
  resumed.push(marker)
 }})
 return state
}
const context=(mode,eventId=mode,entityId='player')=>({mode,eventId,entityId,reason:'Fait physique explicitement établi par le MJ.'})
const declare=(mode,eventId,entityId)=>breathing.setBreathingContext(context(mode,eventId,entityId))
const episode=(id='player')=>gs.getState().dmTools.breathing.creatures[id].episode
function until(at){
 const state=gs.getState();state.worldTimeSeconds=at
 try{for(let count=0;;count++){
  assert.ok(count<20,'chronological event loop must make progress')
  const next=breathing.breathingClockExpirations(at)[0];if(!next)break
  state.worldTimeSeconds=next.at;next.run()
 }}finally{state.worldTimeSeconds=at}
}
function npc(state,{policy=true}={}){
 const monster={id:'breathing-npc',name:'Véritable acteur',type:'goblin',hp:{current:12,max:12},ac:10,
  stats:{str:10,dex:10,con:10,int:10,wis:10,cha:10},position:{...state.player.position},conditions:[],
  xpValue:0,attackBonus:0,damageDice:'1d4',speed:30,isAlive:true}
 if(policy)monster.npcLife={policy:{eventId:'preinjury-policy',reason:'Choix du MJ avant blessure.',at:0},receipts:{}}
 state.monsters[monster.id]=monster;return monster
}
function actualThirdSuccess(state){
 state.phase='combat';state.initiativeOrder=['player'];state.currentTurn='player'
 state.player.hp.current=0;state.player.conditions=['unconscious','prone'];state.player.deathSaves={successes:0,failures:0}
 for(let index=1;index<=3;index++){
  state.turnCounter=index
  const command=playerSuffocation.prepareSuffocationPlayerDeathSave()
  const answer=gs.rollPlayerDeathSave(10,0,command.eventId)
  playerSuffocation.completeSuffocationPlayerDeathSave(command,answer)
 }
 return structuredClone(episode().blockedStabilization)
}

test('breathing inspection is a pure read and never creates a context from prose',()=>{
 fresh();const before=structuredClone(gs.getState()),result=breathing.inspectBreathing('player')
 assert.equal(result.episode,null);assert.equal(result.canRegainHitPoints,true)
 assert.deepEqual(gs.getState(),before)
 assert.throws(()=>breathing.inspectBreathing('unstatted-narrative-npc'),{code:'BREATHING_ACTOR_REQUIRED'})
 assert.deepEqual(gs.getState(),before)
})

test('holding snapshots real Constitution limits, minimum thirty seconds and immutable repeated commands',()=>{
 for(const [con,hold,rounds]of[[1,30,1],[8,30,1],[10,60,1],[14,180,2],[30,660,10]]){
  const state=fresh(con),input=context('hold_breath','original'),result=breathing.setBreathingContext(input)
  assert.equal(result.episode.holdSeconds,hold);assert.equal(result.episode.graceRounds,rounds)
  const original=structuredClone(episode());state.worldTimeSeconds=12;state.player.stats.con=20
  assert.equal(breathing.setBreathingContext(input).alreadyResolved,true)
  declare('hold_breath','new-nonce');assert.deepEqual(episode(),original)
  assert.deepEqual(breathing.validateBreathingState(state),[])
 }
})

test('a reused event with different facts refuses before mutation and choking cannot reset by nonce',()=>{
 fresh();const input=context('choking','one');breathing.setBreathingContext(input)
 let before=structuredClone(gs.getState())
 assert.throws(()=>breathing.setBreathingContext({...input,reason:'Une autre affirmation.'}),{code:'BREATHING_EVENT_CONFLICT'})
 assert.deepEqual(gs.getState(),before)
 const original=structuredClone(episode());gs.getState().worldTimeSeconds=3
 declare('choking','second');assert.deepEqual(episode(),original)
 before=structuredClone(gs.getState())
 assert.throws(()=>declare('hold_breath','third'),{code:'BREATHING_AIR_REQUIRED'})
 assert.deepEqual(gs.getState(),before)
})

test('explicit early choking keeps the original episode witness and never supplies a second reserve',()=>{
 const state=fresh(14);declare('hold_breath','initial');const id=episode().id
 state.worldTimeSeconds=7;declare('choking','lost-air')
 assert.equal(episode().id,id);assert.equal(episode().sourceEventId,'initial')
 assert.equal(episode().chokingAt,7);assert.equal(episode().collapseAt,19)
 assert.equal(breathing.breathingRecoveryBlocked('player'),true)
 assert.deepEqual(breathing.validateBreathingState(state),[])
})

test('chronological expiry creates choking then one exact non-damage collapse without rolling saves',()=>{
 fresh();declare('hold_breath');assert.equal(episode().breathEndsAt,60)
 breathing.assertBreathingTimeAdvance(72)
 assert.throws(()=>breathing.assertBreathingTimeAdvance(73),{code:'SUFFOCATION_TIME_BOUNDARY'})
 const hp=gs.getPlayer().hp.current
 until(60);assert.equal(episode().phase,'choking');assert.equal(episode().collapseAt,66);assert.equal(collapsed.length,0)
 until(66);assert.equal(collapsed.length,1);assert.equal(collapsed[0].at,66);assert.equal(collapsed[0].scope,'time')
 assert.equal(episode().phase,'collapsed');assert.equal(gs.getPlayer().hp.current,hp,'the shared callback exclusively owns HP')
 until(72);assert.equal(collapsed.length,1)
 assert.equal(breathing.breathingRecoveryBlocked('player'),true)
 assert.throws(()=>breathing.assertBreathingRecoveryAllowed('player'),{code:'SUFFOCATION_RECOVERY_BLOCKED'})
})

test('combat grace waits real rounds and the actual victim start rather than another actor slot',()=>{
 const state=fresh(14);npc(state);state.phase='combat';state.round=1;state.combatGeneration=4
 state.initiativeOrder=['player','breathing-npc'];state.currentTurn='breathing-npc'
 declare('choking');assert.deepEqual(episode().combat,{generation:4,notBeforeRound:3})
 state.worldTimeSeconds=12;state.round=3
 assert.equal(breathing.breathingTurnEventDue('player'),true)
 assert.equal(breathing.startBreathingTurn('player'),undefined);assert.equal(collapsed.length,0)
 until(12);assert.equal(collapsed.length,0,'clock never collapses an actor in the active roster')
 state.currentTurn='player';state.turnCounter=7
 breathing.startBreathingTurn('player');assert.equal(collapsed.length,1)
 assert.equal(collapsed[0].turnKey,'4:7:player');assert.equal(collapsed[0].at,12)
 breathing.startBreathingTurn('player');assert.equal(collapsed.length,1)
})

test('a stable zero-HP body exposes its required future combat slot without healing or fake damage',()=>{
 const state=fresh(8);state.player.hp.current=0;state.player.conditions=['unconscious','prone']
 state.player.deathSaves={successes:0,failures:0,stable:true};state.phase='combat';state.round=1
 state.initiativeOrder=['player'];state.currentTurn='player';declare('choking')
 assert.equal(breathing.breathingTurnEventDue('player'),false)
 state.round=2;state.worldTimeSeconds=6
 assert.equal(breathing.breathingTurnEventDue('player'),true)
 breathing.startBreathingTurn('player');assert.equal(collapsed.length,1)
 assert.deepEqual(state.player.deathSaves,{successes:0,failures:0,stable:true},'the central callback owns the life transition')
})

test('NPC contexts require prior true life support and never opt ordinary monsters into saves',()=>{
 const state=fresh(),monster=npc(state,{policy:false}),before=structuredClone(state)
 assert.throws(()=>declare('hold_breath','no-policy',monster.id),{code:'BREATHING_NPC_LIFE_POLICY_REQUIRED'})
 assert.deepEqual(state,before)
 monster.hp.current=0;monster.npcLife={receipts:{},episode:{id:'real-ko',origin:'knockout',status:'stable',at:0,successes:0,failures:0,stableAt:0,knockoutAttackEventId:'actual-attack'}}
 assert.throws(()=>declare('hold_breath','hold-ko',monster.id),{code:'BREATHING_NPC_LIFE_POLICY_REQUIRED'})
 declare('choking','choke-existing-ko',monster.id);assert.equal(episode(monster.id).phase,'choking')
})

test('saved bodies continue chronological bookkeeping without activation or public remote context mutation',()=>{
 const state=fresh(),monster=npc(state);declare('choking','actual-context',monster.id)
 state.sceneMemory??={};state.sceneMemory.retiredMonsters={[monster.id]:monster};delete state.monsters[monster.id]
 assert.equal(breathing.inspectBreathing(monster.id).active,false)
 const before=structuredClone(state)
 assert.throws(()=>declare('air','remote-air',monster.id),{code:'BREATHING_ACTIVE_ACTOR_REQUIRED'})
 assert.deepEqual(state,before)
 until(6);assert.equal(collapsed.length,1);assert.equal(collapsed[0].entityId,monster.id)
 assert.equal(state.monsters[monster.id],undefined);assert.equal(state.currentTurn,null)
 assert.ok(breathing.validateBreathingState(state).some(message=>message.includes('cannot regain HP')),'a mocked callback which does not set zero HP is correctly rejected at hydration')
})

test('only an exact third-success witness resumes stability at actual air and never banks HP',()=>{
 const state=fresh();declare('choking');const marker=actualThirdSuccess(state)
 assert.throws(()=>breathing.noteBlockedBreathingStabilization({...marker,lifeEpisodeId:'different-life'}),{code:'BREATHING_STABILIZATION_WITNESS_REQUIRED'})
 breathing.noteBlockedBreathingStabilization(marker);assert.deepEqual(breathing.validateBreathingState(state),[])
 const answer=declare('air','actual-air');assert.equal(answer.resumedStability,true);assert.equal(resumed.length,1)
 assert.equal(state.player.hp.current,0);assert.equal(episode(),undefined)
 const before=structuredClone(state);assert.equal(declare('air','actual-air').alreadyResolved,true)
 assert.equal(resumed.length,1);assert.deepEqual(state,before)
 declare('hold_breath','new-real-episode');assert.notEqual(episode().id,marker.breathingEpisodeId)
})

test('death cleanup removes a retained third-success witness and hydration rejects forged actor or episode facts',()=>{
 const state=fresh();declare('choking');const marker=actualThirdSuccess(state)
 const forged=structuredClone(state);forged.dmTools.breathing.creatures.player.episode.blockedStabilization.lifeEpisodeId='forged'
 assert.ok(breathing.validateBreathingState(forged).length)
 state.player.deathSaves.dead=true;state.player.deathSaves.failures=3
 assert.ok(breathing.validateBreathingState(state).length)
 breathing.clearBlockedBreathingStabilization('player',marker.lifeEpisodeId)
 assert.deepEqual(breathing.validateBreathingState(state),[])
 const malformed=structuredClone(state.dmTools.breathing);malformed.creatures.player.episode.graceRounds=9
 assert.equal(BreathingStateSchema.safeParse(malformed).success,false)
 const sourceForged=structuredClone(state);sourceForged.dmTools.breathing.creatures.player.receipts={}
 assert.ok(breathing.validateBreathingState(sourceForged).length)
 const expired=structuredClone(state);expired.phase='exploration';expired.player.deathSaves={successes:0,failures:0};expired.worldTimeSeconds=episode().collapseAt
 assert.ok(breathing.validateBreathingState(expired).some(message=>message.includes('skipped its actual chronological boundary')))
 const oldCorpse=structuredClone(state);oldCorpse.worldTimeSeconds=1000
 assert.deepEqual(breathing.validateBreathingState(oldCorpse),[],'an old dead context cannot block chronology or hydration')
})

test('receipt capacity refuses before a context mutation and never evicts an old event',()=>{
 const state=fresh();declare('hold_breath','first');const record=state.dmTools.breathing.creatures.player
 for(let index=1;index<256;index++)record.receipts[`retained-${index}`]={command:'retained',result:{}}
 const before=structuredClone(state)
 assert.throws(()=>declare('choking','one-too-many'),{code:'BREATHING_RECEIPT_LIMIT'})
 assert.deepEqual(state,before);assert.equal(Object.keys(record.receipts).length,256)
})
