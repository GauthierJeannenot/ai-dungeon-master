const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,addSupply,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
const {getSpell}=require('../mcp-server/dist/lib/srd/spells.js')
const {foodDeprivationAfter}=require('../mcp-server/dist/lib/survival-state.js')
const begin=(overrides={})=>({eventId:'lifecycle-nutrition',operation:'begin',standardNeedsConfirmed:true,hotWeather:false,
 source:'Historique nutritionnel établi pour ce scénario et besoins standard confirmés.',foodDebtHalfDays:0,priorDeprivation:'none',...overrides})
const daily=(eventId='lifecycle-day')=>({eventId,nextHotWeather:false,source:'Temps tempéré établi pour la prochaine journée.'})
async function consume(call,kind,id,units){await addSupply(call,kind,id);return ok(await call('consume_provisions',{eventId:'consume-'+id,itemId:id,units}))}
async function rejectsUnchanged(call,name,input,code){const before=await call('get_game_state');assert.equal((await call(name,input)).code,code);assert.deepEqual(await call('get_game_state'),before)}

test('both elapsed-time tools preflight a nutrition boundary before clock or effects change',async t=>{
 const call=await engine(t,{dice:'17'});ok(await call('begin_nutrition_tracking',begin()))
 await rejectsUnchanged(call,'advance_game_time',{seconds:86401},'SURVIVAL_DAY_EVENT_DUE')
 ok(await call('advance_game_time',{seconds:86400}))
 await rejectsUnchanged(call,'roll_ability_check',{ability:'str',dc:10},'SURVIVAL_DAY_EVENT_DUE')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('spell preparation uses its exact total duration before replacing the prepared list',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'17'});ok(await call('begin_nutrition_tracking',begin()))
 const state=await call('get_game_state'),spells=state.player.knownSpells.filter(id=>getSpell(id).level>0).slice(0,3)
 assert.ok(spells.reduce((sum,id)=>sum+getSpell(id).level*60,0)>70)
 ok(await call('advance_time',{seconds:86330}))
 await rejectsUnchanged(call,'prepare_spells',{spellIds:spells},'SURVIVAL_DAY_EVENT_DUE')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('long rest recovers a verified exhaustion level before healing to the actual restored maximum',async t=>{
 const call=await engine(t);ok(await call('begin_nutrition_tracking',begin()))
 await consume(call,'ration_1_day','food',1);await consume(call,'waterskin_full','water',1)
 const initial=await call('get_game_state')
 ok(await call('add_exhaustion',{eventId:'ordinary-four',targetId:'player',levels:4,reason:'Quatre niveaux ordinaires établis, hors privation.'}))
 const rest=ok(await call('take_rest',{kind:'long'})),after=await call('get_game_state')
 assert.equal(rest.exhaustionRecovery.beforeLevel,4);assert.equal(rest.exhaustionRecovery.afterLevel,3)
 assert.equal(after.player.hp.max,initial.player.hp.max);assert.equal(after.player.hp.current,after.player.hp.max)
 assert.deepEqual(after.dmTools.survival.recoveryIntake,{foodHalfPounds:0,waterPints:0})
})

test('a rest ending on an unresolved nutrition boundary refuses before any benefits',async t=>{
 const call=await engine(t);ok(await call('begin_nutrition_tracking',begin()))
 ok(await call('advance_time',{seconds:86400-28800}))
 await rejectsUnchanged(call,'take_rest',{kind:'long'},'SURVIVAL_DAY_EVENT_DUE')
})

test('a crossing combat round defers its first turn until nutrition, retains initial initiative through hydration and resumes once',async t=>{
 const call=await engine(t,{dice:'19,2,17'});ok(await call('begin_nutrition_tracking',begin()))
 await consume(call,'ration_1_day','food',2)
 const enemy=await spawn(call)
 ok(await call('advance_time',{seconds:86398}));const entered=ok(await call('enter_combat',{combatants:['player',enemy.id]}))
 assert.equal(entered.currentTurn,'player');const assigned=await call('get_game_state')
 const initiativeValues=[assigned.player.initiative,assigned.monsters[enemy.id].initiative]
 ok(await call('next_turn',{actorId:'player',skipAction:true}))
 const crossed=ok(await call('next_turn',{actorId:enemy.id,skipAction:true})),saved=await call('get_game_state')
 assert.equal(crossed.survivalEventDue,true);assert.equal(crossed.currentTurn,null);assert.equal(saved.worldTimeSeconds,86404)
 assert.equal(saved.dmTools.survival.pendingCombatRound.round,saved.round)
 assert.equal(saved.dmTools.survival.pendingCombatRound.mapId,saved.currentMapId)
 ok(await call('replace_game_state',{gameState:saved}))
 for(const mutate of [s=>s.combatGeneration=(s.combatGeneration??0)+1,s=>s.round++,s=>s.dmTools.survival.pendingCombatRound.dayIndex++]){
  const foreign=JSON.parse(JSON.stringify(saved));mutate(foreign)
  assert.ok((await call('replace_game_state',{gameState:foreign})).error,'a foreign continuation is rejected before replacing authoritative state')
  assert.deepEqual(await call('get_game_state'),saved)
 }
 await rejectsUnchanged(call,'update_hp',{entityId:'player',delta:-999,reason:'Événement postérieur à la journée encore due.'},'SURVIVAL_DAY_EVENT_DUE')
 const held=ok(await call('run_monster_turns'));assert.equal(held.turnsResolved,0);assert.equal(held.survivalEventDue,true)
 await rejectsUnchanged(call,'next_turn',{skipAction:true},'SURVIVAL_DAY_EVENT_DUE')
 const resolved=ok(await call('resolve_survival_day',daily())),after=await call('get_game_state')
 assert.equal(resolved.exhaustionAfter,1);assert.ok(resolved.resumedCombatTurn)
 assert.equal(after.dmTools.survival.pendingCombatRound,undefined)
 const retained=after.combatLog.findLast(entry=>entry.action==='Ordre d’initiative — round '+after.round)
 assert.match(retained.mechanicalDetail,/aucun nouveau jet/)
 assert.deepEqual(after.initiativeOrder,entered.initiativeOrder)
 assert.deepEqual([after.player.initiative,after.monsters[enemy.id].initiative],initiativeValues,'new exhaustion does not retroactively change the initial check')
 const replay=ok(await call('resolve_survival_day',daily()));assert.equal(replay.replayed,true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17,'only the actual initial initiative dice were used; nutrition and its replay do not reroll')
})

test('actual damage death suspends nutrition before later world time can pass',async t=>{
 const call=await engine(t);ok(await call('begin_nutrition_tracking',begin()))
 ok(await call('update_hp',{entityId:'player',delta:-999,reason:'Dégâts massifs réels de ce scénario.'}))
 const dead=await call('get_game_state');assert.equal(dead.player.deathSaves.dead,true);assert.equal(dead.dmTools.survival.status,'suspended')
 ok(await call('advance_game_time',{seconds:100000}))
 assert.equal((await call('get_game_state')).worldTimeSeconds,100000)
})

test('very old food deprivation saturates as a persisted lower bound and a full eating day clears it',async t=>{
 assert.equal(foodDeprivationAfter(20000,0,10).debtHalfDays,20000)
 assert.equal(foodDeprivationAfter(20000,0,10).debtAtLeast,true)
 const call=await engine(t);ok(await call('begin_nutrition_tracking',begin({foodDebtHalfDays:20000,priorDeprivation:'known'})))
 await consume(call,'waterskin_full','water-a',4);await consume(call,'waterskin_full','water-b',4)
 ok(await call('advance_time',{seconds:86400}));ok(await call('resolve_survival_day',daily()))
 let state=await call('get_game_state');assert.equal(state.dmTools.survival.foodDebtHalfDays,20000);assert.equal(state.dmTools.survival.foodDebtAtLeast,true)
 ok(await call('replace_game_state',{gameState:state}))
 await consume(call,'ration_1_day','normal-food',2);await consume(call,'waterskin_full','water-c',4);await consume(call,'waterskin_full','water-d',4)
 ok(await call('advance_time',{seconds:86400}));ok(await call('resolve_survival_day',daily('next-day')))
 state=await call('get_game_state');assert.equal(state.dmTools.survival.foodDebtHalfDays,0);assert.equal(state.dmTools.survival.foodDebtAtLeast,false)
 ok(await call('replace_game_state',{gameState:state}))
})
