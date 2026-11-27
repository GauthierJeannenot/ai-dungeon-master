const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',LLM_PROVIDER: 'openai',APP_LOG_LEVEL:'error',DM_RATE_LIMIT_PER_MINUTE:'0'})
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {engine,ok,replace}=require('./helpers/mcp-toolkit.cjs')
const {knownObjectives,validateObjectiveJournal}=require('../lib/objective-journal.ts')
const {buildObjectiveContext}=require('../lib/dm/objective-context.ts')
const {buildDynamicPrompt,buildStaticSystemBlocks}=require('../lib/dm/prompts.ts')
const {buildInitialGameState}=require('../lib/initial-game-state.ts')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const plain=value=>JSON.parse(JSON.stringify(value))
test.after(()=>pg.restore())
const offer=(eventId='actual-dialogue')=>({eventId,npcId:'sarah',communication:'gesture',statement:'Elle montre le journal puis la copie autorisée, et te demande de retrouver les cendres.',authored:[{mapId:'candlekeep',objectiveId:'diary_copy'},{mapId:'temple',objectiveId:'family_ashes'}],generated:[]})
async function refused(call,name,input,code){const before=await call('get_game_state'),result=await call(name,input);assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await call('get_game_state'),before)}
async function reveal(call){ok(await call('reveal_npc',{npcId:'sarah',disposition:'helpful'}))}

test('authored goals remain unknown after friendliness and are revealed only by an explicit present NPC communication, without rewards, costs or acceptance',async t=>{
 const call=await engine(t,{dice:'19'}),initial=await call('get_game_state')
 assert.deepEqual(ok(await call('inspect_objectives')).objectives,[])
 await refused(call,'record_objective_dialogue',offer(),'OBJECTIVE_SPEAKER_UNAVAILABLE')
 await reveal(call)
 const before=await call('get_game_state')
 assert.deepEqual(ok(await call('inspect_objectives')).objectives,[])
 const done=ok(await call('record_objective_dialogue',offer()))
 assert.equal(done.objectives.length,2);assert.equal(done.source.communication,'gesture')
 assert.ok(done.objectives.every(objective=>!objective.done))
 const after=await call('get_game_state')
 for(const key of ['player','npcs','dmTools','worldFacts','worldTimeSeconds','actionUsed','bonusActionUsed','movementUsed','combatLog','hero'])assert.deepEqual(after[key],before[key],key)
 assert.deepEqual(knownObjectives(after),done.objectives)
 assert.equal(Object.keys(after.objectiveJournal.dialogues).length,1)
 ok(await call('record_objective_dialogue',offer()))
 assert.deepEqual(await call('get_game_state'),after)
 await refused(call,'record_objective_dialogue',{...offer(),statement:'Un autre propos.'},'OBJECTIVE_DIALOGUE_CONFLICT')
 await refused(call,'record_objective_dialogue',offer('another-nonce'),'OBJECTIVES_ALREADY_KNOWN')
 const view=ok(await call('inspect_objectives',{mapId:'candlekeep'}));assert.equal(view.objectives.length,1)
 assert.ok(!JSON.stringify(view).includes('young_fargo'))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real item condition updates only the revealed goal and the original dialogue survives SQL and hydration, with corrupt input rejected atomically',async t=>{
 const call=await engine(t,{dice:'19'});await reveal(call);ok(await call('record_objective_dialogue',offer()))
 ok(await call('pick_up_item',{itemId:'sarah_diary_copy'}))
 let state=await call('get_game_state')
 assert.equal(knownObjectives(state).find(objective=>objective.mapId==='candlekeep').done,true)
 ok(await call('drop_item',{itemId:'sarah_diary_copy'}))
 state=await call('get_game_state');assert.equal(knownObjectives(state).find(objective=>objective.mapId==='candlekeep').done,false)
 const id='objective-sql-'+process.pid;t.after(()=>deleteSession(id))
 await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
 const restored=(await loadSession(id)).gameState
 ok(await call('replace_game_state',{gameState:restored}))
 assert.deepEqual((await call('get_game_state')).objectiveJournal,state.objectiveJournal)
 const tampered=structuredClone(state);tampered.objectiveJournal.dialogues['actual-dialogue'].input.statement='Faux passé.'
 await refused(call,'replace_game_state',{gameState:tampered},'OBJECTIVE_JOURNAL_STATE_MISMATCH')
 assert.deepEqual(validateObjectiveJournal(state),[])
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('invented quests work in another campaign, use real conditions and never replace internal required act goals or create physical items',async t=>{
 const call=await engine(t,{adventureId:'grammys-country-apple-pie',characterId:'fighter',dice:'19'})
 let state=await call('get_game_state')
 const npc=Object.values(state.npcs).find(npc=>npc.visible&&(npc.roomId===null||npc.roomId===state.currentRoomId)&&npc.hp?.current>0)
 assert.ok(npc,'The authored initial scene has an actual visible speaker')
 const generated={id:'actual-local-request',label:'Revenir avec cet objet déjà présent.',mapId:state.currentMapId,checks:[{type:'itemInInventory',item:state.player.inventory[0].id,strictmatch:'id'}]}
 const input={eventId:'other-campaign-dialogue',npcId:npc.id,communication:'speech',statement:'Je te propose de me montrer cet objet que tu portes déjà.',authored:[],generated:[generated]}
 const before=plain(state),result=ok(await call('record_objective_dialogue',input))
 assert.equal(result.objectives[0].origin,'generated');assert.equal(result.objectives[0].done,true)
 state=await call('get_game_state')
 for(const key of ['player','npcs','dmTools','worldTimeSeconds','worldFacts','hero','actionUsed','combatLog'])assert.deepEqual(state[key],before[key],key)
 await refused(call,'record_objective_dialogue',{...input,eventId:'changed-id',generated:[{...generated,label:'Remplacer cette quête.'}]},'OBJECTIVE_ID_CONFLICT')
 await refused(call,'record_objective_dialogue',{...input,eventId:'unknown-item',generated:[{...generated,id:'another-goal',checks:[{type:'itemInInventory',item:'not-a-real-item',strictmatch:'id'}]}]},'OBJECTIVE_ITEM_UNKNOWN')
 await refused(call,'record_objective_dialogue',{...input,eventId:'unknown-map',generated:[{...generated,id:'another-goal',mapId:'not-a-real-map'}]},'OBJECTIVE_MAP_UNKNOWN')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('wrong authored sources, hidden/incapable speakers, and conflicting or duplicate targets refuse before journal mutation or dice',async t=>{
 const call=await engine(t,{dice:'19'});await reveal(call)
 await refused(call,'record_objective_dialogue',{...offer(),authored:[{mapId:'greenfast',objectiveId:'kara_promise'}]},'OBJECTIVE_SOURCE_INVALID')
 await refused(call,'record_objective_dialogue',{...offer(),authored:[offer().authored[0],offer().authored[0]]},'OBJECTIVE_DUPLICATE')
 await refused(call,'record_objective_dialogue',{...offer(),authored:[],generated:[]},'OBJECTIVE_SELECTION_REQUIRED')
 await replace(call,s=>s.npcs.sarah.hp.current=0)
 await refused(call,'record_objective_dialogue',offer(),'OBJECTIVE_COMMUNICATION_UNAVAILABLE')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the journal freezes on actual story departure, survives SQL, and does not freeze merely because progress was inspected',async t=>{
 const call=await engine(t);await reveal(call)
 ok(await call('record_objective_dialogue',offer()))
 ok(await call('pick_up_item',{itemId:'sarah_diary_copy'}))
 ok(await call('move_token',{tokenId:'player',roomId:'3'}))
 ok(await call('travel_to_map',{transitionId:'sail_to_waterdeep'}))
 let state=await call('get_game_state'),goal=knownObjectives(state).find(objective=>objective.mapId==='candlekeep')
 assert.equal(goal.done,true);assert.equal(goal.archived,true)
 ok(await call('drop_item',{itemId:'sarah_diary_copy'}))
 state=await call('get_game_state');goal=knownObjectives(state).find(objective=>objective.mapId==='candlekeep')
 assert.equal(goal.done,true,'The real departure snapshot retains completion after later inventory changes')
 const id='objective-archive-sql-'+process.pid;t.after(()=>deleteSession(id))
 await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
 ok(await call('replace_game_state',{gameState:(await loadSession(id)).gameState}))
 assert.deepEqual(validateObjectiveJournal(await call('get_game_state')),[])
 assert.equal(knownObjectives(await call('get_game_state')).find(objective=>objective.mapId==='temple').archived,false)
})

test('legacy states invent no past quest dialogues; current prompt and public journal distinguish private offers from known objectives',()=>{
 const state=buildInitialGameState('sarah-of-yellowcrest-manor','fighter'),system=buildStaticSystemBlocks(state)
 state.npcs.sarah.visible=true;state.npcs.sarah.disposition='helpful'
 assert.deepEqual(knownObjectives(state),[])
 assert.equal(state.objectiveJournal,undefined)
 const context=buildObjectiveContext(state)
 assert.match(context,/PROPOSITIONS POSSIBLES/);assert.match(context,/record_objective_dialogue/)
 assert.match(context,/diary_copy/)
 assert.deepEqual(buildStaticSystemBlocks(state),system)
 assert.match(buildDynamicPrompt(state),/ne déclenchent aucun objectif du journal/)
 for(const npc of Object.values(state.npcs))npc.visible=false
 assert.equal(buildObjectiveContext(state),'')
})


test('the player component renders only disclosed public labels and escapes generated quest text', async t => {
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript')
 const filename=path.resolve('components/ObjectiveJournal.tsx'),compiled=new Module(filename,module)
 compiled.filename=filename;compiled.paths=module.paths
 compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename)
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
 const render=state=>renderToStaticMarkup(React.createElement(compiled.exports.default,{gameState:state}))
 const call=await engine(t);await reveal(call)
 assert.equal(render(await call('get_game_state')),'','private authored offers must not appear before disclosure')
 ok(await call('record_objective_dialogue',offer()))
 let state=await call('get_game_state'),html=render(state)
 assert.match(html,/Emporter une copie autorisée du journal/)
 assert.match(html,/Retrouver l’urne des cendres/)
 assert.ok(!html.includes('young_fargo')&&!html.includes('sarah_diary_copy')&&!html.includes('Écouter la demande de Kara'))
 ok(await call('record_objective_dialogue',{eventId:'public-escaped-goal',npcId:'sarah',communication:'gesture',statement:'Une nouvelle proposition.',authored:[],generated:[{id:'public-text',mapId:'candlekeep',label:'Chercher <script>alert(1)</script>',checks:[{type:'roomVisited',roomId:state.currentRoomId}]}]}))
 html=render(await call('get_game_state'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'))
})


test('reserved JavaScript names, unsupported completion predicates and required generated gates refuse as invalid input without mutations or dice',async t=>{
 const call=await engine(t,{dice:'19'});await reveal(call)
 const state=await call('get_game_state')
 const input={eventId:'strict-goal',npcId:'sarah',communication:'gesture',statement:'Une proposition réelle.',authored:[],generated:[{id:'strict-generated',mapId:'candlekeep',label:'Une proposition optionnelle.',checks:[{type:'roomVisited',roomId:state.currentRoomId}]}]}
 for(const invalid of [
  {...input,eventId:'toString'},
  {...input,generated:[{...input.generated[0],checks:[{type:'itemInInventory',item:'toString',strictmatch:'id'}]}]},
  {...input,generated:[{...input.generated[0],required:true}]},
  {...input,generated:[{...input.generated[0],checks:[{type:'narrationSaysDone',value:true}]}]},
 ]) await refused(call,'record_objective_dialogue',invalid,'MCP_INPUT_INVALID')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
