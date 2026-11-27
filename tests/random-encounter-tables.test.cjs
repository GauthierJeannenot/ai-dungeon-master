const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok}=require('./helpers/mcp-toolkit.cjs')
const {sourceTableDice}=require('../mcp-server/dist/mcp-server/source-table-dice.js')

async function forestTable(call){
 const search=ok(await call('consult_rules',{book:'dmg-2014',query:'Sylvan Forest Encounters'}))
 const hit=search.results.find(row=>row.headings.at(-1)==='Sylvan Forest Encounters')
 assert.ok(hit,'the exact supplied encounter table must be discoverable')
 const section=ok(await call('consult_rules',{sectionId:hit.sectionId}))
 const table=section.tables.find(row=>row.title==='Sylvan Forest Encounters')
 assert.ok(table);return table.tableId
}

test('the actual DMG forest table rolls both source dice at its two extremes without creating an encounter or changing state',async t=>{
 const call=await engine(t,{dice:'1,1,12,8,19'}),tableId=await forestTable(call)
 const support=ok(await call('get_rules_support',{domain:'random_encounters'}));assert.ok(support.tools.includes('roll_table'));assert.ok(support.tools.includes('check_random_encounter'));assert.ok(support.tools.includes('draw_random_encounter'));assert.match(support.limitations.join(' '),/No default encounter frequency/)
 const before=await call('get_game_state')
 const low=ok(await call('roll_table',{tableId})),high=ok(await call('roll_table',{tableId}))
 assert.equal(low.notation,'1d12+1d8');assert.deepEqual(low.roll.rolls,[1,1]);assert.equal(low.roll.total,2)
 assert.equal(low.row.low,2);assert.match(low.row.text,/displacer beast/i)
 assert.deepEqual(high.roll.rolls,[12,8]);assert.equal(high.roll.total,20);assert.equal(high.row.low,20);assert.match(high.row.text,/unicorn/i)
 for(const result of [low,high])assert.deepEqual(result.row.probability,{matchingCombinations:1,totalCombinations:96})
 assert.deepEqual(await call('get_game_state'),before,'inspiration rolls grant no body, combat, HP, time, discovery or action')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the source compound table preserves its non-uniform middle probability and refuses a text column before rolling',async t=>{
 const call=await engine(t,{dice:'6,4,19'}),tableId=await forestTable(call),before=await call('get_game_state')
 assert.equal((await call('roll_table',{tableId,dieColumn:1})).code,'TABLE_DIE_UNSUPPORTED')
 const result=ok(await call('roll_table',{tableId}))
 assert.equal(result.roll.total,10);assert.deepEqual(result.roll.rolls,[6,4])
 assert.deepEqual(result.row.probability,{matchingCombinations:8,totalCombinations:96})
 assert.deepEqual(await call('get_game_state'),before)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('literal source headings have bounded exact distributions and do not interpret expressions or descriptions',()=>{
 const source=sourceTableDice('d12 + d8')
 assert.equal(source.minimum,2);assert.equal(source.maximum,20);assert.equal(source.combinations,96)
 assert.equal(source.counts.reduce((a,b)=>a+b,0),96)
 assert.equal(source.counts[2],1);assert.equal(source.counts[10],8);assert.equal(source.counts[20],1)
 assert.equal(sourceTableDice('d100').maximum,100)
 for(const heading of ['d20 + 1','d20 * d4','(d12+d8)','d20 encounters','5d6','d3','d100+d100+d100+d100+d100'])
  assert.equal(sourceTableDice(heading),null,heading)
})
