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
 const id=`jump-api-${process.pid}-${Date.now()}-${Math.random()}`
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
  selected.push(plain(command));return {stop_reason:'tool_use',content:[{type:'tool_use',id:`jump-${index}`,name:command.name,input:command.input}]}
 })
 const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,adventureId:before.adventureId,characterId:before.characterId,message})}))
 const result=await response.json();assert.equal(response.status,200,result.error);assert.equal(index,steps.length)
 assert.deepEqual(plain((await loadSession(id)).gameState),result.newGameState)
 return {result,seen,selected}
}
const {grid}=require('./helpers/mcp-toolkit.cjs')
const {inferRoomIdOnMap}=require('../mcp-server/dist/lib/adventure-map.js')
function actualApproach(state){
 const nav=grid(state),start=state.player.position,room=state.currentRoomId
 const valid=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1&&nav.step(a,b)&&inferRoomIdOnMap(b,state.currentMapId,state)===room
 for(const first of nav.neighbors(start).filter(cell=>valid(start,cell))){
  for(const takeoff of nav.neighbors(first).filter(cell=>valid(first,cell)&&Math.abs(cell.x-start.x)+Math.abs(cell.y-start.y)===2)){
   const landing=nav.neighbors(takeoff).find(cell=>valid(takeoff,cell)&&Math.abs(cell.x-start.x)+Math.abs(cell.y-start.y)===3)
   if(landing)return{takeoff,landing}
  }
 }
 assert.fail('The actual room needs a legal ten-foot approach and five-foot landing')
}
test('the API uses actual walking steps for one jump, replays its same continuation and permits only one associated player action',async t=>{
 const seed=await engine(t,{dice:'17,19'}),before=await seed('get_game_state'),route=actualApproach(before)
 const steps=[{name:'move_token',input:{tokenId:'player',toCell:route.takeoff}},
  params=>{ok(lastResult(params));return{name:'jump',input:{eventId:'actual-api-jump',kind:'long',toCell:route.landing}}},
  params=>{const leap=ok(lastResult(params));assert.equal(leap.runningStart,true);assert.equal(leap.costFeet,5);return{name:'continue_jump',input:{jumpId:'actual-api-jump'}}},
  params=>{assert.equal(ok(lastResult(params)).replayed,true);return{name:'inspect_vertical_movement',input:{}}},
  {name:'get_rules_support',input:{domain:'jumping'}},
  {name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},
  params=>{assert.equal(ok(lastResult(params)).success,true);return{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}},
  params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu prends réellement ton élan puis sautes avant ton observation.'}]
 const {result,seen,selected}=await play(t,seed,steps,'Je prends cet élan, saute ici puis observe les alentours.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,jump=after.dmTools.jumping.jumps['actual-api-jump']
 assert.equal(jump.status,'completed');assert.equal(jump.running,true);assert.equal(jump.spentFeet,5)
 assert.deepEqual(after.player.position,route.landing);assert.deepEqual(after.player.hp,before.player.hp)
 assert.deepEqual(Object.keys(after.dmTools.jumping.jumps),['actual-api-jump'])
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})
test('the API preserves one actual higher-jump check and original Inspiration through SQL and exact continuation',async t=>{
 const seed=await engine(t,{dice:'1,4,19'})
 await replace(seed,state=>state.hero.inspiration.push({targetId:'player',die:8,expiresAt:(state.worldTimeSeconds??0)+600}))
 const before=await seed('get_game_state'),maximum=Math.max(0,3+Math.floor((before.player.stats.str-10)/2))/2,heightFeet=maximum+.5
 const input={eventId:'actual-api-higher',kind:'high',toCell:before.player.position,heightFeet,clearanceConfirmed:true,source,higherJump:{dc:15,allowedHeightFeet:heightFeet,failureHeightFeet:0,actualCircumstanceConfirmed:true,source}}
 const steps=[{name:'jump',input},
  params=>{const pending=ok(lastResult(params)).pendingReaction;assert.ok(pending);return{name:'resolve_reaction',input:{pendingId:pending.id,choice:'bardic_inspiration'}}},
  params=>{ok(lastResult(params));return{name:'continue_jump',input:{jumpId:input.eventId}}},
  params=>{assert.equal(ok(lastResult(params)).replayed,true);return{name:'jump',input:{eventId:'unrelated-second-leap',kind:'high',toCell:before.player.position,heightFeet:1}}},
  params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Le même saut et son inspiration ont été résolus une seule fois.'}]
 const {result,seen,selected}=await play(t,seed,steps,'Je tente ce saut plus haut dans la circonstance réellement constatée.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,jump=after.dmTools.jumping.jumps[input.eventId]
 assert.equal(jump.status,'completed');assert.equal(jump.obstacleChecks[0].check.roll.rolls[0],1)
 assert.equal(after.hero.inspiration.length,0);assert.ok(!after.hero.pending)
 assert.equal(after.hero.actionCredits,before.hero.actionCredits,'jump movement creates no player action cost or credit')
 assert.deepEqual(after.player.position,before.player.position);assert.deepEqual(after.player.hp,before.player.hp)
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})

test('a stealth move cannot use a new jump to obtain another voluntary movement decision',async t=>{
 const seed=await engine(t,{dice:'17,18,19'}),before=await seed('get_game_state'),route=actualApproach(before)
 const steps=[{name:'move_token',input:{tokenId:'player',toCell:route.takeoff,stealth:true}},
  params=>{const check=ok(lastResult(params)).stealthCheck;assert.equal(check.disadvantage,true);assert.deepEqual(check.roll.rolls,[17]);assert.match(check.roll.detail,/DIS:.*17.*18/,'the real disadvantage consumes both dice and retains the lower one');return{name:'jump',input:{eventId:'not-a-free-stealth-leap',kind:'long',toCell:route.landing}}},
  params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu as effectué ton déplacement discret, sans second saut gratuit.'}]
 const {result,seen,selected}=await play(t,seed,steps,'Je progresse discrètement puis voudrais refaire un autre mouvement.')
 assert.deepEqual(seen,selected.slice(0,-1));assert.deepEqual(result.newGameState.player.position,route.takeoff)
 assert.ok(!result.newGameState.dmTools?.jumping?.jumps['not-a-free-stealth-leap'])
 assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})
