const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
const reason='Le MJ choisit ce point réel de la scène pour contrôler une rencontre.'
const input=(checkId,method='d20')=>({checkId,method,reason})
async function forest(call){
 const search=ok(await call('consult_rules',{book:'dmg-2014',query:'Sylvan Forest Encounters'}))
 const hit=search.results.find(row=>row.headings.at(-1)==='Sylvan Forest Encounters');assert.ok(hit)
 return ok(await call('consult_rules',{sectionId:hit.sectionId})).tables.find(row=>row.title==='Sylvan Forest Encounters').tableId
}
function noPlayerEffect(after,before){
 for(const key of ['player','hero','phase','monsters','npcs','worldTimeSeconds','worldFacts','combatLog','initiativeOrder','currentTurn'])
  assert.deepEqual(after[key],before[key],`MJ checking and inspiration must not change ${key}`)
}
async function unchangedFailure(call,tool,args,code){
 const before=await call('get_game_state'),answer=await call(tool,args)
 assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)
}

test('real occurrence checks use unmodified17/18 and never grant character actions, resources, monsters or elapsed time',async t=>{
 const call=await engine(t,{dice:'17,18,19'}),before=await call('get_game_state')
 const miss=ok(await call('check_random_encounter',input('actual-miss'))),hit=ok(await call('check_random_encounter',input('actual-hit')))
 assert.equal(miss.occurs,false);assert.equal(miss.roll.total,17);assert.equal(miss.roll.modifier,0)
 assert.equal(hit.occurs,true);assert.equal(hit.roll.total,18);assert.equal(hit.roll.modifier,0)
 assert.deepEqual(hit.roll.rolls,[18]);const after=await call('get_game_state');noPlayerEffect(after,before)
 assert.equal(after.dmTools.randomEncounters.checks['actual-hit'].adventureId,before.adventureId)
 assert.equal(after.dmTools.randomEncounters.checks['actual-hit'].mapId,before.currentMapId)
 assert.equal(after.dmTools.randomEncounters.checks['actual-hit'].roomId,before.currentRoomId)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('explicit MJ choices have no die, failed checks cannot draw, and retries cannot replace a recorded decision',async t=>{
 const call=await engine(t,{dice:'19'}),tableId=await forest(call),before=await call('get_game_state')
 const no=ok(await call('check_random_encounter',input('actual-none','dm_no_occurrence')))
 const yes=ok(await call('check_random_encounter',input('actual-chosen','dm_occurrence')))
 assert.equal(no.occurs,false);assert.equal(no.roll,undefined);assert.equal(yes.occurs,true);assert.equal(yes.roll,undefined)
 assert.equal(ok(await call('check_random_encounter',input('actual-chosen','dm_occurrence'))).replayed,true)
 await unchangedFailure(call,'check_random_encounter',input('actual-none','d20'),'ENCOUNTER_CHECK_CONFLICT')
 await unchangedFailure(call,'draw_random_encounter',{checkId:'actual-none',drawId:'not-a-free-draw',tableId},'ENCOUNTER_NOT_DUE')
 noPlayerEffect(await call('get_game_state'),before)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('source draws, explicit latest-result rerolls and original dice survive SQL without creating a world encounter',async t=>{
 const call=await engine(t,{dice:'18,12,8,6,4,19'}),tableId=await forest(call),before=await call('get_game_state')
 ok(await call('check_random_encounter',input('actual-occurrence')))
 const firstInput={checkId:'actual-occurrence',drawId:'actual-first',tableId}
 const first=ok(await call('draw_random_encounter',firstInput));assert.equal(first.roll.total,20);assert.match(first.row.text,/unicorn/i)
 assert.deepEqual(first.roll.rolls,[12,8]);assert.deepEqual(first.row.probability,{matchingCombinations:1,totalCombinations:96})
 const id=`random-encounter-sql-${process.pid}`;t.after(()=>deleteSession(id))
 await saveSession(id,{gameState:await call('get_game_state'),history:[]})
 const loaded=await loadSession(id);ok(await call('replace_game_state',{gameState:loaded.gameState}))
 assert.equal(ok(await call('draw_random_encounter',firstInput)).replayed,true)
 await unchangedFailure(call,'draw_random_encounter',{...firstInput,drawId:'unmotivated-repeat'},'ENCOUNTER_REROLL_CONTEXT_REQUIRED')
 await unchangedFailure(call,'draw_random_encounter',{...firstInput,drawId:'wrong-ancestor',reroll:{previousDrawId:'not-the-last',contextIncompatibleConfirmed:true,reason}},'ENCOUNTER_REROLL_CONTEXT_REQUIRED')
 const secondInput={...firstInput,drawId:'actual-second',reroll:{previousDrawId:'actual-first',contextIncompatibleConfirmed:true,reason:'La première ligne est incompatible avec la circonstance réellement établie.'}}
 const second=ok(await call('draw_random_encounter',secondInput));assert.equal(second.sequence,2);assert.equal(second.roll.total,10)
 assert.deepEqual(second.roll.rolls,[6,4]);assert.deepEqual(second.row.probability,{matchingCombinations:8,totalCombinations:96})
 assert.equal(ok(await call('draw_random_encounter',firstInput)).roll.total,20)
 const after=await call('get_game_state');assert.equal(after.dmTools.randomEncounters.checks['actual-occurrence'].latestDrawId,'actual-second')
 assert.equal(ok(await call('draw_random_encounter',secondInput)).replayed,true)
 noPlayerEffect(after,before);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an invalid source table or column refuses before any source die, without reserving the draw ID',async t=>{
 const call=await engine(t,{dice:'19'}),tableId=await forest(call)
 ok(await call('check_random_encounter',input('actual-check','dm_occurrence')))
 await unchangedFailure(call,'draw_random_encounter',{checkId:'actual-check',drawId:'not-reserved',tableId:'dmg-2014:missing'},'RULES_TABLE_NOT_FOUND')
 await unchangedFailure(call,'draw_random_encounter',{checkId:'actual-check',drawId:'not-reserved',tableId,dieColumn:1},'TABLE_DIE_UNSUPPORTED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('confidential history pagination remains stable after hydration and performs no dice or state change',async t=>{
 const call=await engine(t,{dice:'19'})
 for(const id of ['check-c','check-a','check-b'])ok(await call('check_random_encounter',input(id,'dm_no_occurrence')))
 const before=await call('get_game_state'),first=ok(await call('inspect_random_encounters',{view:'checks',limit:2}))
 assert.equal(first.totalMatches,3);assert.equal(first.nextOffset,2);assert.deepEqual(first.results.map(row=>row.id),['check-a','check-b'])
 ok(await call('replace_game_state',{gameState:before}))
 const last=ok(await call('inspect_random_encounters',{view:'checks',offset:first.nextOffset,limit:2}))
 assert.deepEqual(last.results.map(row=>row.id),['check-c']);assert.equal(last.nextOffset,null)
 assert.deepEqual(await call('get_game_state'),before)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('hydration cannot turn a real result into no encounter, erase the latest draw, or bring future records into the scene',async t=>{
 const call=await engine(t,{dice:'12,8,19'}),tableId=await forest(call)
 ok(await call('check_random_encounter',input('actual-history','dm_occurrence')))
 ok(await call('draw_random_encounter',{checkId:'actual-history',drawId:'actual-history-draw',tableId}))
 const before=await call('get_game_state')
 for(const mutate of [state=>{state.dmTools.randomEncounters.checks['actual-history'].occurs=false},
  state=>{delete state.dmTools.randomEncounters.checks['actual-history'].latestDrawId},
  state=>{state.dmTools.randomEncounters.checks['actual-history'].at=(state.worldTimeSeconds??0)+1},
  state=>{state.dmTools.randomEncounters.checks['actual-history'].adventureId='another-adventure'}]){
  const corrupted=structuredClone(before);mutate(corrupted)
  const rejected=await call('replace_game_state',{gameState:corrupted})
  assert.ok(rejected.error,JSON.stringify(rejected));assert.match(JSON.stringify(rejected),/encounter|draw/i)
  assert.deepEqual(await call('get_game_state'),before)
 }
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a restored snapshot on another actual map cannot draw retroactively for the previous scene',async t=>{
 const {getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js')
 const call=await engine(t,{dice:'19'}),tableId=await forest(call)
 ok(await call('check_random_encounter',input('actual-old-scene','dm_occurrence')))
 const saved=await call('get_game_state'),data=getAdventureMap(saved)
 const room=data.rooms.find(value=>value.mapId&&value.mapId!==saved.currentMapId&&data.entryCells[value.id]);assert.ok(room)
 saved.currentMapId=room.mapId;saved.currentRoomId=room.id;saved.player.position={...data.entryCells[room.id]}
 ok(await call('replace_game_state',{gameState:saved}))
 await unchangedFailure(call,'draw_random_encounter',{checkId:'actual-old-scene',drawId:'not-a-retroactive-draw',tableId},'ENCOUNTER_SCENE_CHANGED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
