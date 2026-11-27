const test=require('node:test'),assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',LLM_PROVIDER: 'openai',MONETIZATION_ENABLED:'false',
 DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'8'})
const pg=installPgMem(),llm=require('../lib/dm/llm.ts'),mcp=require('../lib/mcp-client.ts')
const {POST}=require('../app/api/dm/route.ts'),{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,adjacent}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
const plain=value=>JSON.parse(JSON.stringify(value))
const tool=(name,input)=>({stop_reason:'tool_use',content:[{type:'tool_use',id:`nonlethal-spell-${name}-${Math.random()}`,name,input}]})
const text=value=>({stop_reason:'end_turn',content:[{type:'text',text:value}]})
async function spawn(call){const state=await call('get_game_state');return ok(await call('spawn_monster',{monsterType:'goblin',cell:adjacent(state)[0]}))}
async function freeHand(call){ok(await call('equip_item',{itemId:'mace',slot:'main_hand',operation:'unequip'}))}
async function bindRoute(t,seed,allowed){
 const before=await seed('get_game_state'),metadata=(await seed.client.listTools()).tools,seen=[]
 t.mock.method(mcp,'listMCPTools',async()=>metadata)
 t.mock.method(mcp,'callMCPTool',async(name,input={})=>{
  seen.push({name,input:plain(input)})
  if(!['get_game_state','replace_game_state'].includes(name))assert.ok(allowed.includes(name),`No server-authored gameplay call: ${name}`)
  return seed(name,input)
 })
 const sessionId=`dm-nonlethal-spell-${process.pid}-${Date.now()}-${Math.random()}`
 await saveSession(sessionId,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 t.after(async()=>{await mcp.closeMCPClient(sessionId);await deleteSession(sessionId)})
 async function post(message){
  const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({sessionId,message,adventureId:before.adventureId,characterId:before.characterId})}))
  const result=await response.json();assert.equal(response.status,200,JSON.stringify(result))
  assert.deepEqual(plain((await loadSession(sessionId)).gameState),result.newGameState,'the real resolved mechanics persist unchanged in SQL')
  return result
 }
 return{before,post,gameplay:()=>seen.filter(entry=>!['get_game_state','replace_game_state'].includes(entry.name))}
}
function latestResult(params){
 const block=params.messages.flatMap(message=>Array.isArray(message.content)?message.content:[]).filter(block=>block.type==='tool_result').at(-1)
 assert.ok(block,'the model receives the preceding real engine result');return block
}

test('the API forwards the exact initial melee spell KO choice, persists its real witness and never creates a second player action or automatic combat end',async t=>{
 const seed=await engine(t,{characterId:'cleric',dice:'20,1,17,4,2,19'});await freeHand(seed)
 const target=await spawn(seed);ok(await seed('enter_combat',{combatants:['player',target.id]}))
 const state=await seed('get_game_state')
 const cast=Object.freeze({spellId:'spiritual-weapon',slotLevel:2,toCell:state.player.position,targetId:target.id,nonlethal:true})
 const ending=Object.freeze({force:true,reason:'Le MJ choisit de clore le combat après le KO confirmé de son seul adversaire.'})
 const f=await bindRoute(t,seed,['cast_spell','end_combat']);let turn=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{

  assert.equal(context.operation,'dm.turn')
  if(++turn===1)return tool('cast_spell',cast)
  if(turn===2){
   const after=context.gameState,body=after.monsters[target.id]
   assert.equal(body.hp.current,0);assert.equal(body.isAlive,true);assert.equal(body.npcLife.episode.status,'stable')
   assert.equal(body.knockout.recovery.hours,2);assert.equal(body.knockout.attackEventId,body.npcLife.episode.knockoutAttackEventId)
   assert.equal(after.hero.actionCredits,f.before.hero.actionCredits,'the bonus-action spell is not a new primary-action debit')
   assert.equal(Boolean(after.actionUsed.player),Boolean(f.before.actionUsed.player))
   assert.equal(after.bonusActionUsed.player,true);assert.equal(after.player.spellSlots.level2.current,f.before.player.spellSlots.level2.current-1)
   assert.equal(after.hero.attackAction,undefined);assert.equal(after.hero.pending,undefined,'no Spiritual Weapon held-roll window is invented')
   assert.equal(after.phase,'combat','the model, not the server, still chooses combat ending')
   return tool('end_combat',ending)
  }
  assert.equal(turn,3);return text('Ton Arme spirituelle assomme réellement l’adversaire avec son attaque de mêlée. Le MJ termine ensuite le combat ; le corps demeure vivant et stable.')
 })
 const result=await f.post('Je lance Arme spirituelle à ma position et frappe cet adversaire au corps à corps pour l’assommer.')
 assert.equal(turn,3);assert.deepEqual(f.gameplay(),[{name:'cast_spell',input:cast},{name:'end_combat',input:ending}])
 assert.equal(result.newGameState.phase,'exploration');assert.equal(result.newGameState.monsters[target.id].isAlive,true)
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})

test('ranged, save and healing spell flags are forwarded exactly and refused before costs, then the model chooses a real existing-weapon KO without recasting',async t=>{
 const seed=await engine(t,{characterId:'cleric',dice:'20,1,17,4,2,19'});await freeHand(seed)
 let state=await seed('get_game_state')
 ok(await seed('cast_spell',{spellId:'spiritual-weapon',slotLevel:2,toCell:state.player.position}))
 ok(await seed('update_hp',{entityId:'player',delta:-1,damageType:'force',damageOrigin:'environment',reason:'Blessure réelle préalable pour distinguer un soin refusé d’un soin effectif.'}))
 const target=await spawn(seed);ok(await seed('enter_combat',{combatants:['player',target.id]}))
 state=await seed('get_game_state')
 const effect=state.hero.effects.find(effect=>effect.kind==='spiritual-weapon'&&effect.data.mapId===state.currentMapId)
 assert.ok(effect);assert.equal(Object.hasOwn(effect.data,'nonlethal'),false)
 const refusedCasts=[
  Object.freeze({spellId:'guiding-bolt',slotLevel:1,targetId:target.id,nonlethal:true}),
  Object.freeze({spellId:'sacred-flame',targetId:target.id,nonlethal:false}),
  Object.freeze({spellId:'cure-wounds',slotLevel:1,targetId:'player',nonlethal:true}),
 ]
 for(const input of refusedCasts)assert.ok(state.player.knownSpells.includes(input.spellId),'only actual registered known spells are attempted')
 const strike=Object.freeze({featureId:'spiritual_weapon',effectId:effect.id,targetId:target.id,nonlethal:true})
 const ending=Object.freeze({force:true,reason:'Le MJ constate le vrai KO et choisit séparément la fin du combat.'})
 const f=await bindRoute(t,seed,['cast_spell','use_subclass_feature','end_combat']);let turn=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{

  assert.equal(context.operation,'dm.turn')
  ++turn
  if(turn>=2&&turn<=4){
   const refusal=latestResult(params);assert.equal(refusal.is_error,true,refusal.content)
   assert.deepEqual(context.gameState.player.spellSlots,f.before.player.spellSlots)
   assert.equal(context.gameState.player.hp.current,f.before.player.hp.current,'a rejected healing flag never heals')
   assert.deepEqual(context.gameState.monsters[target.id].hp,f.before.monsters[target.id].hp)
   assert.equal(context.gameState.hero.actionCredits,f.before.hero.actionCredits)
   assert.equal(Boolean(context.gameState.bonusActionUsed.player),Boolean(f.before.bonusActionUsed.player))
  }
  if(turn<=3)return tool('cast_spell',refusedCasts[turn-1])
  if(turn===4)return tool('use_subclass_feature',strike)
  if(turn===5){
   const after=context.gameState
   assert.equal(after.monsters[target.id].npcLife.episode.status,'stable')
   assert.deepEqual(after.player.spellSlots,f.before.player.spellSlots,'repeat never spends a new spell slot')
   assert.equal(after.hero.actionCredits,f.before.hero.actionCredits);assert.equal(after.bonusActionUsed.player,true)
   assert.equal(after.hero.pending,undefined)
   return tool('end_combat',ending)
  }
  assert.equal(turn,6);return text('Les choix KO des sorts non admissibles ont été refusés. Tu utilises ensuite la vraie frappe de ton Arme spirituelle, sans nouvelle incantation, et assommes l’adversaire.')
 })
 const result=await f.post('J’utilise mon Arme spirituelle déjà présente pour l’assommer ; je demande aussi comment seraient traités d’autres sorts.')
 assert.equal(turn,6)
 assert.deepEqual(f.gameplay(),[...refusedCasts.map(input=>({name:'cast_spell',input})),{name:'use_subclass_feature',input:strike},{name:'end_combat',input:ending}])
 assert.equal(result.newGameState.phase,'exploration');assert.equal(result.newGameState.monsters[target.id].knockout.recovery.hours,2)
 assert.deepEqual(result.newGameState.player.spellSlots,f.before.player.spellSlots)
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})
