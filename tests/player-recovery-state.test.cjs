const test=require('node:test'),assert=require('node:assert/strict')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const recovery=require('../mcp-server/dist/mcp-server/player-recovery.js')
const breathing=require('../mcp-server/dist/mcp-server/breathing.js')
const {rollDice}=require('../mcp-server/dist/mcp-server/dice.js')
const {PlayerRecoveryStateSchema}=require('../mcp-server/dist/lib/player-recovery-state.js')
const previousDice=process.env.AI_DM_TEST_DICE_SEQUENCE
test.after(()=>{if(previousDice===undefined)delete process.env.AI_DM_TEST_DICE_SEQUENCE;else process.env.AI_DM_TEST_DICE_SEQUENCE=previousDice})
let sequence=0
function fresh(dice='2,19'){
 gs.resetState();process.env.AI_DM_TEST_DICE_SEQUENCE=dice+' '.repeat(++sequence)
 const state=gs.getState();state.worldTimeSeconds=0;state.player.hp.current=0
 state.player.deathSaves={successes:0,failures:0,stable:true};state.player.conditions=['unconscious','prone']
 breathing.installBreathingHooks({collapse(){},stabilizeAfterAir(){}})
 return state
}
const episode=()=>gs.getState().dmTools.playerRecovery.episode

test('reading legacy player stability does not initialize a timer, fabricate an onset or consume a die',()=>{
 const state=fresh('19'),before=structuredClone(state),answer=recovery.inspectPlayerRecovery()
 assert.equal(answer.legacyUnresolved,true);assert.equal(answer.recovery,null)
 assert.equal(answer.firstPossibleLegacyBoundary,3600);assert.deepEqual(state,before)
 assert.equal(rollDice('1d20').total,19)
})

test('a genuinely new stabilization rolls one persistent d4 and repeated internal initialization refuses before another die',()=>{
 const state=fresh();recovery.beginPlayerStableRecovery();const actual=structuredClone(episode())
 assert.equal(actual.hours,2);assert.equal(actual.stabilizedAt,0);assert.equal(actual.wakeAt,7200)
 assert.deepEqual(recovery.validatePlayerRecoveryState(state),[])
 assert.throws(()=>recovery.beginPlayerStableRecovery(),{code:'PLAYER_STABILITY_ALREADY_TRACKED'})
 assert.deepEqual(episode(),actual)
 gs.replaceState(structuredClone(state));assert.deepEqual(episode(),actual)
 assert.equal(rollDice('1d20').total,19)
})

test('a due real stable recovery grants exactly one HP, retains prone and consumes no further d4',()=>{
 const state=fresh();recovery.beginPlayerStableRecovery();const source=structuredClone(episode())
 assert.deepEqual(recovery.duePlayerStableRecovery(7199),[])
 state.worldTimeSeconds=7200;const event=recovery.duePlayerStableRecovery(7200)[0].recover()
 assert.equal(event.hpAfter,1);assert.equal(event.wakeAt,7200);assert.equal(event.recoveredAt,7200)
 assert.equal(gs.getPlayer().hp.current,1);assert.ok(gs.getPlayer().conditions.includes('prone'))
 assert.ok(!gs.getPlayer().conditions.includes('unconscious'))
 assert.equal(episode(),undefined);assert.equal(state.dmTools.playerRecovery.lastClosed.reason,'recovered')
 assert.equal(state.dmTools.playerRecovery.lastClosed.episode.id,source.id)
 assert.deepEqual(recovery.duePlayerStableRecovery(99999),[])
 assert.deepEqual(recovery.validatePlayerRecoveryState(state),[])
 assert.equal(rollDice('1d20').total,19)
})

test('closing a real recovery on damage cancels its old deadline and a distinct real stabilization gets its own one d4',()=>{
 const state=fresh('1,3,19');recovery.beginPlayerStableRecovery();const first=structuredClone(episode())
 state.worldTimeSeconds=10;recovery.closePlayerStableRecovery('damage')
 state.player.deathSaves.stable=false;assert.deepEqual(recovery.duePlayerStableRecovery(3600),[])
 state.player.deathSaves={successes:0,failures:0,stable:true};recovery.beginPlayerStableRecovery()
 assert.notEqual(episode().id,first.id);assert.equal(episode().hours,3);assert.equal(episode().wakeAt,10810)
 state.worldTimeSeconds=3600;assert.deepEqual(recovery.duePlayerStableRecovery(3600),[])
 assert.equal(state.player.hp.current,0);assert.equal(rollDice('1d20').total,19)
})

test('the unknown legacy first-hour bound survives repeated hydration and never starts again at load time',()=>{
 const state=fresh('19'),before=structuredClone(state)
 recovery.assertPlayerRecoveryTimeAdvance(3599)
 assert.throws(()=>recovery.assertPlayerRecoveryTimeAdvance(3600),{code:'PLAYER_STABLE_RECOVERY_UNKNOWN'})
 assert.deepEqual(state,before)
 for(const at of[3599,4000,9000]){
  gs.replaceState({...structuredClone(state),worldTimeSeconds:at})
  assert.throws(()=>recovery.assertPlayerRecoveryTimeAdvance(1),{code:'PLAYER_STABLE_RECOVERY_UNKNOWN'})
  assert.equal(recovery.inspectPlayerRecovery().firstPossibleLegacyBoundary,3600)
 }
 assert.equal(rollDice('1d20').total,19)
})

test('a due player recovery blocked by choking waits for actual air without rerolling or backdating its HP',()=>{
 const state=fresh('1,19');recovery.beginPlayerStableRecovery()
 state.worldTimeSeconds=3599
 breathing.setBreathingContext({entityId:'player',eventId:'actual-choking',mode:'choking',reason:'Le MJ établit une absence réelle d’air.'})
 state.worldTimeSeconds=3600;assert.equal(recovery.duePlayerStableRecovery(3600)[0].recover(),undefined)
 assert.equal(state.player.hp.current,0);assert.equal(episode().heldByBreathing.blockedAt,3600)
 assert.deepEqual(recovery.validatePlayerRecoveryState(state),[]);assert.deepEqual(recovery.duePlayerStableRecovery(3602),[])
 state.worldTimeSeconds=3602
 breathing.setBreathingContext({entityId:'player',eventId:'actual-air',mode:'air',reason:'Le MJ établit le retour réel à l’air.'})
 recovery.resumePlayerStableRecoveryAfterAir('player','actual-air')
 assert.deepEqual(recovery.validatePlayerRecoveryState(state),[])
 const event=recovery.duePlayerStableRecovery(3602)[0].recover()
 assert.equal(event.wakeAt,3600);assert.equal(event.recoveredAt,3602);assert.equal(event.hpAfter,1)
 assert.equal(rollDice('1d20').total,19)
})

test('corrupt source timing, active positive HP or an invented held-air receipt cannot pass recovery hydration',()=>{
 const state=fresh();recovery.beginPlayerStableRecovery()
 const wrongDie=structuredClone(state.dmTools.playerRecovery);wrongDie.episode.hours=4
 assert.equal(PlayerRecoveryStateSchema.safeParse(wrongDie).success,false)
 const positive=structuredClone(state);positive.player.hp.current=1
 assert.ok(recovery.validatePlayerRecoveryState(positive).length)
 const forged=structuredClone(state);forged.worldTimeSeconds=7200
 forged.dmTools.playerRecovery.episode.heldByBreathing={breathingEpisodeId:'invented',blockedAt:7200,airEventId:'fake-air',resumedAt:7200}
 assert.ok(recovery.validatePlayerRecoveryState(forged).length)
 assert.equal(rollDice('1d20').total,19)
})
