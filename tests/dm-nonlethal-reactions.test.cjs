const test=require('node:test'),assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',LLM_PROVIDER: 'openai',MONETIZATION_ENABLED:'false',
 DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'8'})
const pg=installPgMem(),llm=require('../lib/dm/llm.ts'),mcp=require('../lib/mcp-client.ts')
const {POST}=require('../app/api/dm/route.ts'),{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,adjacent,grid}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
const plain=value=>JSON.parse(JSON.stringify(value))
const tool=(name,input)=>({stop_reason:'tool_use',content:[{type:'tool_use',id:`nonlethal-reaction-${name}-${Math.random()}`,name,input}]})
const text=value=>({stop_reason:'end_turn',content:[{type:'text',text:value}]})
const main=state=>state.dmTools?.loadout?.mainHandId??state.player.inventory.find(item=>item.type==='weapon').id
async function spawn(call){const state=await call('get_game_state');return ok(await call('spawn_monster',{monsterType:'goblin',cell:adjacent(state)[0]}))}
async function route(t,seed,allowed){
 const before=await seed('get_game_state'),metadata=(await seed.client.listTools()).tools,seen=[]
 t.mock.method(mcp,'listMCPTools',async()=>metadata)
 t.mock.method(mcp,'callMCPTool',async(name,input={})=>{
  seen.push({name,input:plain(input)})
  if(!['get_game_state','replace_game_state'].includes(name))assert.ok(allowed.includes(name),`Only model-selected gameplay calls are permitted: ${name}`)
  return seed(name,input)
 })
 const sessionId=`dm-nonlethal-react-${process.pid}-${Date.now()}-${Math.random()}`
 await saveSession(sessionId,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 t.after(async()=>{await mcp.closeMCPClient(sessionId);await deleteSession(sessionId)})
 async function post(message){
  const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({sessionId,message,adventureId:before.adventureId,characterId:before.characterId})}))
  const result=await response.json();assert.equal(response.status,200,JSON.stringify(result))
  assert.deepEqual(plain((await loadSession(sessionId)).gameState),result.newGameState,'the exact resolved mechanics survive SQL persistence')
  return result
 }
 return{before,post,gameplay:()=>seen.filter(entry=>!['get_game_state','replace_game_state'].includes(entry.name))}
}

test('the API preserves a real opportunity question, forwards the chosen nonlethal reaction exactly and ends combat only on a model call',async t=>{
 const seed=await engine(t,{dice:'1,20,17,4,2,19'}),target=await spawn(seed)
 ok(await seed('enter_combat',{combatants:['player',target.id]}))
 let state=await seed('get_game_state');assert.equal(state.currentTurn,target.id)
 const from={...state.monsters[target.id].position},nav=grid(state,target.id)
 const toCell=nav.neighbors(from).find(cell=>nav.step(from,cell)&&Math.max(Math.abs(cell.x-state.player.position.x),Math.abs(cell.y-state.player.position.y))>1)
 assert.ok(toCell)
 ok(await seed('move_token',{tokenId:target.id,toCell}));state=await seed('get_game_state')
 assert.equal(state.hero.pending.sourceId,'player');assert.equal(state.hero.pending.targetId,target.id)
 ok(await seed('replace_game_state',{gameState:plain(state)}));assert.deepEqual(await seed('get_game_state'),state)
 const selection=Object.freeze({pendingId:state.hero.pending.id,choice:'opportunity_attack',weaponOrSpell:main(state),nonlethal:true})
 const ending=Object.freeze({force:true,reason:'Le MJ constate que le seul adversaire est réellement assommé et décide la fin du combat.'})
 const f=await route(t,seed,['resolve_reaction','end_combat']);let mode='question',turn=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{
  assert.equal(context.operation,'dm.turn','a real pending reaction bypasses a new player plan');assert.equal(params.tool_choice,undefined)
  if(mode==='question')return text('L’adversaire quitte ta portée. Veux-tu utiliser ta réaction, et avec quelle intention ?')
  if(++turn===1)return tool('resolve_reaction',selection)
  if(turn===2){
   const body=context.gameState.monsters[target.id]
   assert.equal(body.hp.current,0);assert.equal(body.isAlive,true);assert.equal(body.npcLife.episode.status,'stable')
   assert.deepEqual(body.position,from);assert.equal(context.gameState.hero.reactionsUsed.player,true)
   assert.equal(context.gameState.hero.actionCredits,f.before.hero.actionCredits)
   assert.equal(Boolean(context.gameState.actionUsed.player),Boolean(f.before.actionUsed.player))
   assert.equal(context.gameState.phase,'combat','the server has not automatically ended the fight')
   return tool('end_combat',ending)
  }
  assert.equal(turn,3);return text('Ton coup de mêlée assomme réellement l’adversaire avant son départ. Le MJ clôt le combat ; le blessé reste inconscient et stable.')
 })
 const question=await f.post('Quelles sont mes options pour cette réaction ?')
 assert.deepEqual(f.gameplay(),[]);assert.deepEqual(question.toolsUsed,[])
 assert.equal(question.newGameState.hero.pending.id,state.hero.pending.id)
 assert.deepEqual(question.newGameState.monsters[target.id].hp,state.monsters[target.id].hp)
 mode='resolve'
 const result=await f.post('J’utilise ma réaction avec mon arme tenue pour assommer cet adversaire, sans le tuer.')
 assert.deepEqual(f.gameplay(),[{name:'resolve_reaction',input:selection},{name:'end_combat',input:ending}])
 assert.equal(turn,3);assert.equal(result.newGameState.hero.pending,undefined);assert.equal(result.newGameState.phase,'exploration')
 assert.equal(result.newGameState.monsters[target.id].knockout.recovery.hours,2)
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})

test('the model chooses KO only on the exact Ready release after paying the real preparation action, without a second player action or fabricated continuation',async t=>{
 const seed=await engine(t,{dice:'20,1,17,4,2,19'}),target=await spawn(seed)
 ok(await seed('enter_combat',{combatants:['player',target.id]}))
 const initial=await seed('get_game_state');assert.equal(initial.currentTurn,'player')
 const prepare=Object.freeze({action:'ready',readied:{kind:'attack',weaponId:main(initial),trigger:'Lorsque mon tour se termine et que cet adversaire reste adjacent.'}})
 const advance=Object.freeze({actorId:'player'})
 const ending=Object.freeze({force:true,reason:'Le MJ choisit de terminer le combat après le KO réellement confirmé de son seul adversaire.'})
 const f=await route(t,seed,['combat_action','next_turn','resolve_readied_action','end_combat']);let turn=0,release,readyId
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{

  assert.equal(context.operation,'dm.turn')
  if(++turn===1){assert.equal(params.tool_choice,undefined);return tool('combat_action',prepare)}
  assert.equal(params.tool_choice,undefined)
  if(turn===2){
   const effect=context.gameState.hero.effects.find(effect=>effect.kind==='readied-action')
   assert.ok(effect);readyId=effect.id
   assert.equal(Object.hasOwn(effect.data.readied,'nonlethal'),false,'KO is not inferred or stored at preparation')
   assert.equal(context.gameState.hero.actionCredits,initial.hero.actionCredits-1)
   return tool('next_turn',advance)
  }
  if(turn===3){
   assert.equal(context.gameState.currentTurn,target.id)
   const player=context.gameState.player.position,enemy=context.gameState.monsters[target.id].position
   assert.ok(Math.max(Math.abs(player.x-enemy.x),Math.abs(player.y-enemy.y))<=1)
   release=Object.freeze({readyId,choice:'execute',targetId:target.id,triggerObserved:'Mon tour s’est réellement terminé et cet adversaire reste adjacent.',nonlethal:true})
   return tool('resolve_readied_action',release)
  }
  if(turn===4){
   assert.equal(context.gameState.monsters[target.id].npcLife.episode.status,'stable')
   assert.equal(context.gameState.hero.actionCredits,initial.hero.actionCredits-1,'release adds no primary-action cost')
   assert.equal(context.gameState.hero.reactionsUsed.player,true)
   assert.equal(context.gameState.hero.attackAction,undefined)
   assert.equal(context.gameState.phase,'combat','ending remains a separate explicit model choice')
   return tool('end_combat',ending)
  }
  assert.equal(turn,5);return text('L’attaque préparée est libérée en réaction et assomme l’adversaire. Le MJ termine le combat après ce résultat confirmé.')
 })
 const result=await f.post('Je prépare mon attaque ; s’il reste adjacent quand mon tour finit, je veux la libérer pour l’assommer.')
 assert.equal(turn,5)
 assert.deepEqual(f.gameplay(),[{name:'combat_action',input:prepare},{name:'next_turn',input:advance},{name:'resolve_readied_action',input:release},{name:'end_combat',input:ending}])
 assert.deepEqual(result.toolsUsed,['combat_action','next_turn','resolve_readied_action','end_combat'])
 assert.equal(result.newGameState.phase,'exploration');assert.equal(result.newGameState.monsters[target.id].isAlive,true)
 assert.equal(result.newGameState.monsters[target.id].knockout.recovery.hours,2)
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})
