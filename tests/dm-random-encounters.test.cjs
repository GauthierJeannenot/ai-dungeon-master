const test=require('node:test'),assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const pg=installPgMem(),llm=require('../lib/dm/llm.ts'),mcp=require('../lib/mcp-client.ts')
const {POST}=require('../app/api/dm/route.ts'),{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,replace}=require('./helpers/mcp-toolkit.cjs')
const source='Observation physique explicitement établie par le MJ pour cette scène.'
const plain=value=>JSON.parse(JSON.stringify(value))
test.after(()=>pg.restore())
function lastResult(params){const blocks=params.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]);return JSON.parse(blocks.filter(b=>b.type==='tool_result').at(-1).content)}
async function play(t,seed,steps,message){
 const before=await seed('get_game_state'),metadata=(await seed.client.listTools()).tools,seen=[],selected=[]
 const id=`random-api-${process.pid}-${Date.now()}-${Math.random()}`
 await saveSession(id,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 t.after(async()=>{await mcp.closeMCPClient(id);await deleteSession(id)})
 t.mock.method(mcp,'listMCPTools',async()=>metadata)
 t.mock.method(mcp,'callMCPTool',async(name,input={})=>{if(!['get_game_state','replace_game_state'].includes(name)){seen.push({name,input:plain(input)});assert.ok(selected.some(c=>c.name===name&&JSON.stringify(c.input)===JSON.stringify(input)),`No fabricated gameplay call: ${name}`)}return seed(name,input)})
 let index=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{
  assert.equal(context.operation,'dm.turn');assert.equal(params.tool_choice,undefined)
  const step=steps[index++];assert.ok(step,'The agent must finish the explicitly scripted sequence')
  const command=typeof step==='function'?step(params,context):step
  if(typeof command==='string')return {stop_reason:'end_turn',content:[{type:'text',text:command}]}
  selected.push(plain(command));return {stop_reason:'tool_use',content:[{type:'tool_use',id:`random-${index}`,name:command.name,input:command.input}]}
 })
 const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,adventureId:before.adventureId,characterId:before.characterId,message})}))
 const result=await response.json();assert.equal(response.status,200,result.error);assert.equal(index,steps.length)
 assert.deepEqual(plain((await loadSession(id)).gameState),result.newGameState)
 return {result,seen,selected}
}
async function forest(seed){
 const search=ok(await seed('consult_rules',{book:'dmg-2014',query:'Sylvan Forest Encounters'}))
 const hit=search.results.find(row=>row.headings.at(-1)==='Sylvan Forest Encounters');assert.ok(hit)
 return ok(await seed('consult_rules',{sectionId:hit.sectionId})).tables.find(row=>row.title==='Sylvan Forest Encounters').tableId
}
for(const legacy of [false,true])for(const campaign of [false,true])test(`the API persists model-selected ${campaign?'authored-campaign':'book-source'} encounter choices without spending the ${legacy?'legacy':'SRD'} player action`,async t=>{
 const seed=await engine(t,{dice:'12,8,17,19'})
 if(legacy)await replace(seed,state=>{delete state.player.ruleset;delete state.hero})
 const tableId=campaign?'campaign:actual-api-table':await forest(seed),before=await seed('get_game_state')
 const authored=campaign?[
  {name:'create_random_encounter_table',input:{tableId,title:'Table thématique choisie par le MJ',theme:'Références liées à la campagne en cours, sans changement automatique de la scène.',scope:{kind:'adventure'},dice:[12,8],entries:[{rowId:'proposed-reference',low:2,high:20,text:'Une interaction proposée, dont la mise en scène reste à choisir par le MJ.'}]}},
  {name:'inspect_random_encounter_tables',input:{tableId,limit:1}},
 ]:[]
 const commands=[...authored,{name:'check_random_encounter',input:{checkId:'actual-api-opportunity',method:'dm_occurrence',reason:'Le MJ choisit ce vrai moment de la scène.'}},
  params=>{assert.equal(ok(lastResult(params)).occurs,true);return{name:'draw_random_encounter',input:{checkId:'actual-api-opportunity',drawId:'actual-api-draw',tableId}}},
  params=>{assert.equal(ok(lastResult(params)).roll.total,20);return{name:'inspect_random_encounters',input:{checkId:'actual-api-opportunity',view:'draws',limit:1}}},
  params=>{assert.equal(ok(lastResult(params)).results[0].drawId,'actual-api-draw');return{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}},
  params=>{assert.equal(ok(lastResult(params)).success,true);return{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}},
  params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Le tirage du MJ est conservé ; ton observation réelle a été résolue.'}]
 const {result,seen,selected}=await play(t,seed,commands,'Je poursuis la scène, puis observe les alentours.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState
 assert.equal(after.dmTools.randomEncounters.checks['actual-api-opportunity'].latestDrawId,'actual-api-draw')
 assert.deepEqual(after.dmTools.randomEncounters.draws['actual-api-draw'].result.roll.rolls,[12,8])
 assert.deepEqual(after.player.hp,before.player.hp);assert.deepEqual(after.player.inventory,before.player.inventory)
 assert.deepEqual(after.monsters,before.monsters);assert.deepEqual(after.npcs,before.npcs)
 assert.deepEqual(after.player.position,before.player.position);assert.deepEqual(after.worldFacts,before.worldFacts)
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds)
 if(legacy)assert.equal(after.hero,undefined,'MJ checking never activates a modern hero profile')
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19,'only source dice and the one actual player check were rolled')
})
