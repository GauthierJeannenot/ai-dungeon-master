const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
const reason='Décision MJ explicite au point réel de la scène.'
function definition(tableId='campaign:actual-theme'){return{tableId,title:'Table thématique de la campagne',theme:'Rencontres proposées selon les lieux et objectifs déjà établis de cette partie.',scope:{kind:'adventure'},dice:[12,8],entries:[{rowId:'rare-low',low:2,high:2,text:'Une découverte proposée par le MJ, encore à mettre en scène explicitement.'},{rowId:'common',low:3,high:19,text:'Une conversation proposée, sans PNJ, information ou attitude créé automatiquement.'},{rowId:'rare-high',low:20,high:20,text:'Un événement proposé, sans durée ni conséquence mécanique accordée.'}]}}
async function refuse(call,tool,input,code){const before=await call('get_game_state'),result=await call(tool,input);assert.ok(result.error||result.isError,JSON.stringify(result));if(code)assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await call('get_game_state'),before)}
function noSceneEffects(after,before){for(const key of ['player','hero','npcs','monsters','worldFacts','worldTimeSeconds','phase','initiativeOrder','combatLog'])assert.deepEqual(after[key],before[key],key)}
test('actual authored d12+d8 table preserves source probabilities, exact retries and SQL without creating its suggested encounters',async t=>{
 const call=await engine(t,{dice:'12,8,17'}),before=await call('get_game_state'),input=definition()
 ok(await call('create_random_encounter_table',input));assert.equal(ok(await call('create_random_encounter_table',input)).replayed,true)
 ok(await call('check_random_encounter',{checkId:'actual-occurrence',method:'dm_occurrence',reason}))
 const args={checkId:'actual-occurrence',drawId:'actual-draw',tableId:input.tableId},draw=ok(await call('draw_random_encounter',args))
 assert.equal(draw.roll.total,20);assert.equal(draw.row.rowId,'rare-high');assert.deepEqual(draw.row.probability,{matchingCombinations:1,totalCombinations:96});assert.equal(draw.source.origin,'campaign_authored');assert.equal(draw.book,'campaign-authored')
 let state=await call('get_game_state');noSceneEffects(state,before)
 const id=`authored-table-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});ok(await call('replace_game_state',{gameState:(await loadSession(id)).gameState}))
 state=await call('get_game_state');assert.equal(ok(await call('draw_random_encounter',args)).replayed,true);assert.deepEqual(await call('get_game_state'),state)
 const inspect=ok(await call('inspect_random_encounter_tables',{tableId:input.tableId}));assert.equal(inspect.entries.length,3);assert.equal(inspect.theme,input.theme);assert.deepEqual(await call('get_game_state'),state)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})
test('gaps, overlaps and out-of-range authored entries refuse before registry mutation or any die',async t=>{
 const call=await engine(t,{dice:'19'}),input=definition()
 for(const entries of [[{rowId:'gap',low:3,high:20,text:'Référence incomplète.'}],[...input.entries,{rowId:'overlap',low:4,high:5,text:'Référence superposée.'}],[{rowId:'excess',low:1,high:20,text:'Débordement.'}]])await refuse(call,'create_random_encounter_table',{...input,entries})
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a retained authored table cannot be overwritten by changed text, dice or scope under the same identity',async t=>{
 const call=await engine(t,{dice:'19'}),input=definition();ok(await call('create_random_encounter_table',input))
 await refuse(call,'create_random_encounter_table',{...input,theme:'Autre thème.'},'ENCOUNTER_TABLE_CONFLICT')
 await refuse(call,'create_random_encounter_table',{...input,entries:input.entries.map((e,i)=>i?e:{...e,text:'Autre événement.'})},'ENCOUNTER_TABLE_CONFLICT')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('an actual other-map table can be authored but cannot be selected for the current scene; unknown maps never use the default map fallback',async t=>{
 const call=await engine(t,{dice:'19'}),state=await call('get_game_state'),{getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js'),other=getAdventureMap(state).maps.find(map=>map.id!==state.currentMapId);assert.ok(other)
 await refuse(call,'create_random_encounter_table',{...definition(),scope:{kind:'map',mapId:'invented-map'}},'ENCOUNTER_TABLE_MAP_REQUIRED')
 const input={...definition(),scope:{kind:'map',mapId:other.id}};ok(await call('create_random_encounter_table',input));ok(await call('check_random_encounter',{checkId:'actual-occurrence',method:'dm_occurrence',reason}))
 await refuse(call,'draw_random_encounter',{checkId:'actual-occurrence',drawId:'wrong-map',tableId:input.tableId},'ENCOUNTER_TABLE_CONTEXT_MISMATCH')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('authored entry inspection is bounded stable pagination with no roll or gameplay mutation',async t=>{
 const call=await engine(t,{dice:'19'}),input={...definition(),dice:[12],entries:Array.from({length:12},(_,i)=>({rowId:`actual-row-${i+1}`,low:i+1,high:i+1,text:`Référence MJ ${i+1}.`}))};ok(await call('create_random_encounter_table',input))
 const state=await call('get_game_state'),first=ok(await call('inspect_random_encounter_tables',{tableId:input.tableId,limit:5})),second=ok(await call('inspect_random_encounter_tables',{tableId:input.tableId,offset:first.nextOffset,limit:5})),last=ok(await call('inspect_random_encounter_tables',{tableId:input.tableId,offset:second.nextOffset,limit:5}))
 assert.equal(first.totalMatches,12);assert.equal(last.nextOffset,null);assert.deepEqual([...first.entries,...second.entries,...last.entries],input.entries);assert.deepEqual(await call('get_game_state'),state)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('foreign, future and changed authored-table history is rejected on hydration without changing the real state',async t=>{
 const call=await engine(t,{dice:'19'}),input=definition();ok(await call('create_random_encounter_table',input));const state=await call('get_game_state')
 for(const edit of [r=>r.adventureId='other-adventure',r=>r.authoredAt=(state.worldTimeSeconds??0)+1,r=>r.input.theme='Changed without its original receipt.',r=>r.input.scope={kind:'map',mapId:'invented-map'}]){
  const forged=structuredClone(state);edit(forged.dmTools.randomEncounterTables[input.tableId]);await refuse(call,'replace_game_state',{gameState:forged})
 }
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('unknown and inherited property names never become authored table records during inspection',async t=>{
 const call=await engine(t,{dice:'19'})
 for(const tableId of ['campaign:unknown','constructor','__proto__'])await refuse(call,'inspect_random_encounter_tables',{tableId},'ENCOUNTER_TABLE_REQUIRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
