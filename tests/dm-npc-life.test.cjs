const test=require('node:test'),assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',LLM_PROVIDER: 'openai',
 MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',
 APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'8'})
const pg=installPgMem(),llm=require('../lib/dm/llm.ts'),mcp=require('../lib/mcp-client.ts')
const {POST}=require('../app/api/dm/route.ts')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,adjacent}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
const plain=value=>JSON.parse(JSON.stringify(value))
const tool=(name,input)=>({stop_reason:'tool_use',content:[{type:'tool_use',id:`npc-life-${name}-${Math.random()}`,name,input}]})
const text=value=>({stop_reason:'end_turn',content:[{type:'text',text:value}]})
const look=Object.freeze({entityId:'player',ability:'wis',skill:'perception',dc:10})
async function spawn(call,monsterType='goblin'){const state=await call('get_game_state');return ok(await call('spawn_monster',{monsterType,cell:adjacent(state)[0]}))}

async function hurt(call,entityId,amount){return ok(await call('update_hp',{entityId,delta:-amount,damageType:'force',damageOrigin:'environment',reason:'Blessure réelle de la fixture avant toute résolution de la route.'}))}
async function policy(call,id){return ok(await call('configure_npc_death_saves',{entityId:id,eventId:`policy:${id}`,reason:'Le MJ a explicitement établi ce PNJ important avant sa blessure.'}))}
async function archivedDue(t,dice){
 const seed=await engine(t,{dice}),initial=await seed('get_game_state')
 const layout=ok(await seed('generate_dungeon',{seed:'npc-app-archive',width:3,height:3,count:5})).layout
 const installed=ok(await seed('install_dungeon',{dungeonId:'npc-app-passage',layout,entranceCell:initial.player.position,
  questLink:{goal:'Retrouver la personne recherchée.',lead:'Le passage garde un indice concret lié à cette recherche.',delivery:'clue',discoveryDc:15}}))
 const target=await spawn(seed);await policy(seed,target.id);await hurt(seed,target.id,target.hp.current)
 ok(await seed('travel_to_map',{transitionId:installed.entryTransitionId}));ok(await seed('advance_time',{seconds:6}))
 const ready=await seed('get_game_state'),body=ready.sceneMemory.floorMonsters[initial.currentMapId][target.id]
 return{seed,initial,target,save:Object.freeze({entityId:target.id,eventId:body.npcLife.episode.timeEventId})}
}

async function bindRoute(t,seed,allowed){
 // Observe and forward the exact calls to one REAL stdio engine. No transport
 // stub resolves dice, writes NPC counters or pretends to stabilize a target.
 const before=await seed('get_game_state'),metadata=(await seed.client.listTools()).tools,seen=[]
 assert.ok(metadata.some(tool=>tool.name==='configure_npc_death_saves'))
 t.mock.method(mcp,'listMCPTools',async()=>metadata)
 t.mock.method(mcp,'callMCPTool',async(name,input={})=>{
  seen.push({name,input:plain(input)})
  if(!['get_game_state','replace_game_state'].includes(name))assert.ok(allowed.includes(name),`No unrequested gameplay call: ${name}`)
  return seed(name,input)
 })
 const sessionId=`dm-npc-life-${process.pid}-${Date.now()}-${Math.random()}`
 await saveSession(sessionId,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 t.after(async()=>{await mcp.closeMCPClient(sessionId);await deleteSession(sessionId)})
 async function post(message){
  const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message,adventureId:before.adventureId,characterId:before.characterId})}))
  const result=await response.json();assert.equal(response.status,200,JSON.stringify(result))
  assert.deepEqual(plain((await loadSession(sessionId)).gameState),result.newGameState,'committed mechanics survive SQL')
  return result
 }
 return{before,seen,post,gameplay:()=>seen.filter(call=>!['get_game_state','replace_game_state'].includes(call.name))}
}

test('an explicit archived NPC death save neither occupies the player primary action nor satisfies the planned player check',async t=>{
 await t.test('a real player check remains available after the separate NPC event',async t=>{
 const {seed,initial,target,save}=await archivedDue(t,'17,18,19')
 const f=await bindRoute(t,seed,['roll_death_save','roll_ability_check']);let turn=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{

  assert.equal(context.operation,'dm.turn')
  if(++turn===1)return tool('roll_death_save',save)
  if(turn===2){
   assert.equal(params.tool_choice, undefined)
   assert.equal(Boolean(context.gameState.actionUsed.player),Boolean(f.before.actionUsed.player))
   assert.equal(context.gameState.hero.actionCredits,f.before.hero.actionCredits)
   assert.equal(context.gameState.monsters[target.id],undefined,'the bookkeeping save never activates its archived actor')
   return tool('roll_ability_check',look)
  }
  assert.equal(turn,3);assert.equal(params.tool_choice,undefined)
  return text('Le MJ règle le sort du blessé hors carte. Tu examines ensuite réellement les lieux.')
 })
 const result=await f.post('Pendant que le monde poursuit son cours, j’examine les lieux.')
 assert.deepEqual(f.gameplay(),[{name:'roll_death_save',input:save},{name:'roll_ability_check',input:look}])
 assert.deepEqual(result.toolsUsed,['roll_death_save','roll_ability_check'])
 assert.equal(result.newGameState.monsters[target.id],undefined)
 assert.equal(result.newGameState.sceneMemory.floorMonsters[initial.currentMapId][target.id].npcLife.episode.successes,1)
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
 })
 await t.test('the same tool name for an NPC cannot certify the player death-save plan',async t=>{
  const {seed,target,save}=await archivedDue(t,'17,19'),f=await bindRoute(t,seed,['roll_death_save'])
  const playerSave=Object.freeze({entityId:'player'});let turn=0
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{

   assert.equal(context.operation,'dm.turn')
   if(++turn===1)return tool('roll_death_save',save)
   if(turn===2){
    assert.equal(params.tool_choice, undefined)
    return tool('roll_death_save',playerSave)
   }
   assert.equal(turn,3);assert.equal(params.tool_choice,undefined,'the actual player refusal releases forcing without declaring success')
   return text('Le PNJ a eu son jet. Tu es à PV positifs hors combat et aucun jet de mort du joueur n’a été résolu.')
  })
  const result=await f.post('Je demande si un jet de mort du joueur est nécessaire.')
  assert.deepEqual(f.gameplay(),[{name:'roll_death_save',input:save},{name:'roll_death_save',input:playerSave}])
  assert.equal(Boolean(result.newGameState.actionUsed.player),Boolean(f.before.actionUsed.player))
  assert.equal(result.newGameState.hero.actionCredits,f.before.hero.actionCredits)
  assert.equal(result.newGameState.monsters[target.id],undefined)
  assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
 })
})

test('medicine performed by an actual NPC does not become the player action after a genuine combat ending',async t=>{
 const seed=await engine(t,{dice:'1,10,20,17,1,18,19'}),target=await spawn(seed),helper=await spawn(seed,'commoner')
 await policy(seed,target.id)
 ok(await seed('enter_combat',{combatants:['player',target.id,helper.id]}))
 await hurt(seed,target.id,target.hp.current)
 const before=await seed('get_game_state');assert.equal(before.currentTurn,helper.id)
 assert.ok(Math.max(Math.abs(helper.position.x-target.position.x),Math.abs(helper.position.y-target.position.y))<=1,'the real helper is in reach')
 const medicine=Object.freeze({action:'stabilize',actorId:helper.id,targetId:target.id})
 const end=Object.freeze({force:true,reason:'Le MJ a établi une trêve après le secours porté au blessé.'})
 const f=await bindRoute(t,seed,['combat_action','end_combat','roll_ability_check']);let turn=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{
  assert.equal(context.operation,'dm.turn','the actual unfinished NPC turn is returned to the agent without a new player plan')
  if(++turn===1)return tool('combat_action',medicine)
  if(turn===2){
   assert.equal(context.gameState.monsters[target.id].npcLife.episode.status,'stable')
   assert.equal(Boolean(context.gameState.actionUsed.player),Boolean(f.before.actionUsed.player))
   return tool('end_combat',end)
  }
  if(turn===3)return tool('roll_ability_check',look)
  assert.equal(turn,4);return text('Le secours et la trêve sont établis. Tu peux examiner les lieux selon ton choix.')
 })
 const result=await f.post('Je laisse le soigneur aider le blessé puis, une fois la trêve établie, j’examine les lieux.')
 assert.deepEqual(f.gameplay(),[{name:'combat_action',input:medicine},{name:'end_combat',input:end},{name:'roll_ability_check',input:look}])
 assert.deepEqual(result.toolsUsed,['combat_action','end_combat','roll_ability_check'])
 assert.equal(result.newGameState.monsters[target.id].npcLife.episode.status,'stable')
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})

test('the MJ policy is a real mutation, excluded from the player planner, and its exact arguments are never manufactured',async t=>{
 const seed=await engine(t,{dice:'18,19'}),target=await spawn(seed)
 const configure=Object.freeze({entityId:target.id,eventId:`explicit-policy:${target.id}`,reason:'Décision explicite du MJ sur ce PNJ vivant précis avant blessure.'})
 const f=await bindRoute(t,seed,['configure_npc_death_saves','roll_ability_check']);let turn=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{

  assert.equal(context.operation,'dm.turn');assert.equal(params.tool_choice,undefined,'the MJ policy must not become a mandatory player directive')
  if(++turn===1)return tool('configure_npc_death_saves',configure)
  if(turn===2){
   assert.deepEqual(context.gameState.monsters[target.id].npcLife.policy,{eventId:configure.eventId,reason:configure.reason,at:f.before.worldTimeSeconds})
   assert.equal(Boolean(context.gameState.actionUsed.player),Boolean(f.before.actionUsed.player))
   return tool('roll_ability_check',look)
  }
  assert.equal(turn,3);return text('La décision du MJ est enregistrée. Ton examen est résolu séparément.')
 })
 const result=await f.post('Je cite « choisis automatiquement une cible importante » pour discuter avec le MJ, puis j’examine les lieux.')
 assert.deepEqual(f.gameplay(),[{name:'configure_npc_death_saves',input:configure},{name:'roll_ability_check',input:look}])
 assert.deepEqual(result.newGameState.monsters[target.id].npcLife.policy,{eventId:configure.eventId,reason:configure.reason,at:f.before.worldTimeSeconds})
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})

test('the model resumes the exact same monster batch after its real mandatory NPC save, without a replay guard or fabricated call',async t=>{
 const seed=await engine(t,{dice:'1,20,10,17,19'}),target=await spawn(seed),waiting=await spawn(seed)
 await policy(seed,target.id);await hurt(seed,target.id,target.hp.current)
 ok(await seed('enter_combat',{combatants:['player',target.id,waiting.id]}))
 const before=await seed('get_game_state');assert.equal(before.currentTurn,target.id)
 assert.deepEqual(before.initiativeOrder,[target.id,waiting.id,'player'])
 const batch=Object.freeze({holdIds:[waiting.id]})
 const f=await bindRoute(t,seed,['run_monster_turns','roll_death_save']);let turn=0,save
 const latestResult=params=>{
  const result=params.messages.flatMap(message=>Array.isArray(message.content)?message.content:[]).filter(block=>block.type==='tool_result').at(-1)
  assert.ok(result,'the model receives the real preceding MCP result');assert.ok(!result.is_error,result.content)
  return JSON.parse(result.content)
 }
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{
  assert.equal(context.operation,'dm.turn','the unfinished NPC turn is handled directly, not a manufactured player action')
  assert.equal(params.tool_choice,undefined)
  if(++turn===1)return tool('run_monster_turns',batch)
  if(turn===2){
   const stopped=latestResult(params)
   assert.equal(stopped.turnsResolved,0);assert.equal(stopped.combatShouldEnd,false)
   assert.equal(context.gameState.currentTurn,target.id)
   assert.equal(context.gameState.monsters[target.id].npcLife.episode.successes,0)
   assert.equal(stopped.npcDeathSaveEvents.length,1)
   save=Object.freeze({entityId:target.id,eventId:stopped.npcDeathSaveEvents[0].eventId})
   assert.equal(save.eventId,context.gameState.monsters[target.id].npcLife.episode.turnEventId)
   return tool('roll_death_save',save)
  }
  if(turn===3){
   const resolved=latestResult(params)
   assert.equal(resolved.roll.total,17);assert.equal(resolved.successes,1)
   assert.equal(context.gameState.currentTurn,target.id)
   assert.equal(context.gameState.monsters[target.id].npcLife.episode.successes,1)
   assert.equal(Boolean(context.gameState.actionUsed.player),Boolean(f.before.actionUsed.player))
   return tool('run_monster_turns',batch)
  }
  assert.equal(turn,4)
  const resumed=latestResult(params)
  assert.equal(resumed.turnsResolved,1);assert.equal(resumed.resolvedTurns[0].id,waiting.id)
  assert.equal(resumed.resolvedTurns[0].action,'hold');assert.deepEqual(resumed.npcDeathSaveEvents,[])
  assert.equal(resumed.currentTurn,'player');assert.equal(resumed.combatShouldEnd,false)
  assert.equal(context.gameState.currentTurn,'player');assert.equal(context.gameState.phase,'combat')
  return text('Le PNJ réussit son véritable jet de mort. L’autre adversaire attend selon la décision du MJ. La main te revient, le combat reste ouvert.')
 })
 const result=await f.post('Le MJ résout le jet requis puis poursuit les tours déjà en cours avant de me rendre la main.')
 assert.deepEqual(f.gameplay(),[{name:'run_monster_turns',input:batch},{name:'roll_death_save',input:save},{name:'run_monster_turns',input:batch}])
 assert.equal(turn,4)
 assert.deepEqual(result.toolsUsed,['run_monster_turns','roll_death_save'],'the API summary lists unique tool names; the observed transport above proves both exact batch calls')
 assert.equal(result.newGameState.currentTurn,'player');assert.equal(result.newGameState.phase,'combat')
 assert.equal(result.newGameState.monsters[target.id].npcLife.episode.successes,1)
 assert.equal(Boolean(result.newGameState.actionUsed.player),Boolean(f.before.actionUsed.player))
 assert.equal(result.newGameState.hero.actionCredits,f.before.hero.actionCredits)
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})
