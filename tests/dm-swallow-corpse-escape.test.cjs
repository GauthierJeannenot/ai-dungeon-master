const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const {installPgMem}=require('../tests/helpers/pg-mem.cjs'),pg=installPgMem()
const llm=require('../lib/dm/llm.ts'),mcp=require('../lib/mcp-client.ts'),{POST}=require('../app/api/dm/route.ts')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,adjacent}=require('../tests/helpers/mcp-toolkit.cjs')
const plain=value=>JSON.parse(JSON.stringify(value))
test.after(()=>pg.restore())
function lastResult(params){return JSON.parse(params.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(b=>b.type==='tool_result').at(-1).content)}
async function play(t,seed,steps,message){
 const before=await seed('get_game_state'),metadata=(await seed.client.listTools()).tools,seen=[],selected=[],id=`swallow-api-${process.pid}-${Date.now()}-${Math.random()}`
 await saveSession(id,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 t.after(async()=>{await mcp.closeMCPClient(id);await deleteSession(id)})
 t.mock.method(mcp,'listMCPTools',async()=>metadata)
 t.mock.method(mcp,'callMCPTool',async(name,input={})=>{if(!['get_game_state','replace_game_state'].includes(name)){seen.push({name,input:plain(input)});assert.ok(selected.some(command=>command.name===name&&JSON.stringify(command.input)===JSON.stringify(input)),`No fabricated gameplay call: ${name}`)}const response=await seed(name,input);if(name==='escape_worm_corpse'){const state=await seed('get_game_state');assert.equal(state.actionUsed.player??false,false);assert.equal(state.movementUsed.player,(before.movementUsed.player??0)+4);assert.ok(state.player.conditions.includes('prone'))}if(name==='combat_action'){assert.equal((await seed('get_game_state')).actionUsed.player,true)}return response})
 let index=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{assert.equal(context.operation,'dm.turn');assert.equal(params.tool_choice,undefined);const step=steps[index++];assert.ok(step,'The agent must finish its explicitly selected source event');const command=typeof step==='function'?step(params):step;if(typeof command==='string')return{stop_reason:'end_turn',content:[{type:'text',text:command}]};selected.push(plain(command));return{stop_reason:'tool_use',content:[{type:'tool_use',id:`swallow-${index}`,name:command.name,input:command.input}]}})
 const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,adventureId:before.adventureId,characterId:before.characterId,message})})),result=await response.json()
 assert.equal(response.status,200,JSON.stringify(result));assert.equal(index,steps.length);assert.deepEqual(plain((await loadSession(id)).gameState),result.newGameState);assert.deepEqual(seen,selected.filter(command=>command.name!=='roll_ability_check'))
 return{before,result,seen}
}
async function swallowed(t,{tail=[],beforeCombat}={}){
 const seed=await engine(t,{dice:[1,20,17,1,1,1,1,...tail].join(',')}),initial=await seed('get_game_state')
 const fact=ok(await seed('record_scene_fact',{description:'La taille Moyenne actuelle du vrai personnage est observée, sans transformation.',cell:initial.player.position})).worldFact
 ok(await seed('record_swallow_body_size',{entityId:'player',size:'Medium',factId:fact.id,source:'Observation actuelle du vrai corps.'}))
 if(beforeCombat)await beforeCombat(seed,initial)
 const host=ok(await seed('spawn_monster',{monsterType:'purple_worm',cell:adjacent(initial)[0]}));ok(await seed('enter_combat',{combatants:['player',host.id]}));ok(await seed('resolve_monster_action',{monsterId:host.id,targetId:'player',actionName:'Bite'}))
 return{seed,host}
}

test('POST corpse escape spends only actual20ft movement; one chosen player action remains and ending combat cannot reset this message budget',async t=>{
 const {seed,host}=await swallowed(t,{tail:[19]})
 ok(await seed('update_hp',{entityId:host.id,delta:-1000,damageType:'force',damageOrigin:'environment',reason:'Le vrai ver subit ces dégâts et meurt ; aucun épisode ni phase n’est créé.'}))
 const trapped=await seed('get_game_state'),episode=Object.values(trapped.dmTools.swallow.episodes)[0];assert.equal(episode.status,'corpse_inside');assert.equal(trapped.monsters[host.id].isAlive,false)
 const forbidden=await seed('end_combat');assert.equal(forbidden.code,'SWALLOW_MAP_TRANSITION_REQUIRED');assert.deepEqual(await seed('get_game_state'),trapped)
 ok(await seed('next_turn',{actorId:host.id}));const before=await seed('get_game_state');assert.equal(before.currentTurn,'player');assert.equal(before.actionUsed.player??false,false)
 const exit={...episode.entryOutsideCell},escape={episodeId:episode.id,toCell:exit}
 const {result,seen}=await play(t,seed,[{name:'escape_worm_corpse',input:escape},asyncParams=>{
  const resolved=lastResult(asyncParams);assert.equal(resolved.movementFeet,20);assert.equal(resolved.prone,true)
  return{name:'combat_action',input:{actorId:'player',action:'dodge'}}
 },params=>{assert.ok(!lastResult(params).error);return{name:'end_combat',input:{}}},params=>{assert.ok(!lastResult(params).error);return{name:'roll_ability_check',input:{entityId:'player',ability:'str',dc:10}}},params=>{
  assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu sors réellement du cadavre en dépensant vingt pieds de mouvement, à terre, puis utilises ton action pour esquiver. La seconde action demandée est refusée.'
 }],'Je sors dans la case choisie puis utilise mon action pour esquiver ; je demande ensuite une seconde action.')
 assert.deepEqual(seen[0].input,escape);assert.deepEqual(seen.map(c=>c.name),['escape_worm_corpse','combat_action','end_combat']);assert.equal(result.newGameState.phase,'exploration');assert.equal(result.newGameState.dmTools.swallow.episodes[episode.id].status,'escaped');assert.deepEqual(result.newGameState.player.position,exit);assert.ok(result.newGameState.player.conditions.includes('prone'));assert.equal(result.newGameState.dmTools.swallow.escapes[episode.id].result.movementFeet,20)
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})
