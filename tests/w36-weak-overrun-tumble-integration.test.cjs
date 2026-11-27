// R2 diagnostic fixture: compare the documentary assessment to its actual API-entry state.
const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',LLM_PROVIDER: 'openai',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false'})
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {engine,ok}=require('./helpers/mcp-toolkit.cjs')
const {prepareOverrunAtCurrentSite}=require('./helpers/dmg-overrun-fixture.cjs')
const {persistTumble}=require('./helpers/dmg-tumble-fixture.cjs')
const {play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
test.after(()=>pg.restore())

test('confidential weak assessment leaves the real primary action free, failed action Overrun permits explicit bonus Tumble and real API cycle choices, with SQL and immutable source replay',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'20,1,1,20,18,1,1,17'}),f=await prepareOverrunAtCurrentSite(call)
 ok(await f.enter());const before=await call('get_game_state');assert.equal(before.player.level,7)
 let overrunId,tumbleId,afterCross,apiBefore
 const steps=[
  (params,context)=>{apiBefore=structuredClone(context.gameState);return{name:'assess_xge_encounter',input:{mode:'planned',groups:[{monsterType:'rat',count:12}]}}},
  (params,context)=>{const a=lastResult(params);assert.equal(a.confidential,true);assert.equal(a.mechanicalFact,undefined);assert.equal(a.groups[0].ratioStatus,'weak_monster_guideline');assert.deepEqual(a.characterEquivalent,{numerator:1,denominator:1});assert.deepEqual(context.gameState,apiBefore);return{name:'combat_action',input:{action:'overrun',targetId:f.target.id,overrunCost:'action',overrunPath:f.path}}},
  params=>{const a=lastResult(params);assert.equal(a.success,false);overrunId=a.overrunId;return{name:'combat_action',input:{action:'tumble',targetId:f.target.id,tumbleCost:'bonus_action',tumblePath:f.path}}},
  (params,context)=>{const a=lastResult(params);assert.equal(a.success,true);tumbleId=a.tumbleId;const s=context.gameState;assert.deepEqual(s.player.position,f.path[2]);assert.equal(s.hero.actionCredits,0);assert.equal(s.bonusActionUsed.player,true);assert.equal(s.hero.attackAction,undefined);assert.equal(s.movementUsed.player,3);assert.equal(s.dmTools.overrun.attempts[overrunId].status,'failed');assert.equal(s.dmTools.tumble.attempts[tumbleId].status,'complete');assert.equal(s.worldTimeSeconds,before.worldTimeSeconds);afterCross=structuredClone(s);return{name:'next_turn',input:{actorId:'player'}}},
  {name:'run_monster_turns',input:{}},
  params=>{assert.equal(lastResult(params).turnsResolved,1);return 'La référence confidentielle a été consultée sans effet de jeu. Le passage en force a échoué, puis la culbute choisie a réussi avec le bonus réel. Les deux fins de tour ont été explicitement demandées.'},
 ]
 const played=await play(t,call,steps,'Je consulte cette référence, tente ce passage en force avec mon action, puis la culbute avec mon bonus si le premier essai échoue, et termine le vrai cycle.')
 assert.deepEqual(played.seen.map(x=>x.name),['assess_xge_encounter','combat_action','combat_action','next_turn','run_monster_turns'])
 assert.doesNotMatch(JSON.stringify(played.result),/characterEquivalent|weak_monster_guideline|weakMonsterRule|xge:\d+:table:/)
 assert.equal(played.result.newGameState.currentTurn,'player');assert.deepEqual(played.result.newGameState.dmTools.overrun.attempts[overrunId],afterCross.dmTools.overrun.attempts[overrunId]);assert.deepEqual(played.result.newGameState.dmTools.tumble.attempts[tumbleId],afterCross.dmTools.tumble.attempts[tumbleId])
 const fresh=await persistTumble(t,call,'19'),saved=await fresh('get_game_state'),replay=ok(await fresh('move_token',{tokenId:'player',toCell:f.path[2],tumbleId}))
 assert.equal(replay.replayed,true);assert.deepEqual(await fresh('get_game_state'),saved);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})
