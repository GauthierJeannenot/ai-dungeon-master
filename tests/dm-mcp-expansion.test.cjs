const test=require('node:test'),assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',MONETIZATION_ENABLED:'false',ALLOW_PAID_LLM:'false',
  DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_LEVEL:'error'})
const pg=installPgMem()
const {POST}=require('../app/api/dm/route.ts')
const llm=require('../lib/dm/llm.ts')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {closeMCPClient}=require('../lib/mcp-client.ts')
const {engine,ok,spawn,replace}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())

async function play(t,state,message,dice='20'){
  const id=`mcp-expansion-route-${process.pid}-${Date.now()}-${Math.random()}`,previous=process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE=dice
  t.after(async()=>{await closeMCPClient(id);await deleteSession(id);if(previous===undefined)delete process.env.AI_DM_TEST_DICE_SEQUENCE;else process.env.AI_DM_TEST_DICE_SEQUENCE=previous})
  await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
  const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({sessionId:id,message,adventureId:state.adventureId,characterId:state.characterId})}))
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data))
  assert.deepEqual(JSON.parse(JSON.stringify((await loadSession(id)).gameState)),data.newGameState)
  return data
}
function responses(){let sequence=0;return {tool:(name,input)=>({stop_reason:'tool_use',content:[{type:'tool_use',id:`expansion-${++sequence}`,name,input}]}),
  text:text=>({stop_reason:'end_turn',content:[{type:'text',text}]})}}

test('scroll reading/inspection never satisfies the planned cast; exact activation and its once-only consumption survive SQL',async t=>{
  const call=await engine(t,{characterId:'wizard'}),initial=await call('get_game_state')
  ok(await call('create_spell_scroll',{itemId:'route-scroll',spellId:'magic-missile',name:'Rouleau couvert de signes',description:'Des signes encore inconnus.',cell:initial.player.position}))
  ok(await call('pick_up_item',{itemId:'route-scroll'}))
  const enemy=await spawn(call)
  await replace(call,s=>{s.player.knownSpells=s.player.knownSpells.filter(id=>id!=='magic-missile');for(const pool of Object.values(s.player.spellSlots))pool.current=0})
  const before=await call('get_game_state'),response=responses();let turn=0
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{

    turn++
    if(turn===1){assert.ok(context.availableTools.some(tool=>tool.name==='use_spell_scroll'));return response.tool('inspect_spell_scrolls',{itemId:'route-scroll'})}
    if(turn===2){assert.equal(params.tool_choice, undefined);assert.equal(JSON.parse(params.messages.at(-1).content[0].content).identified,false);return response.tool('read_spell_scroll',{itemId:'route-scroll'})}
    if(turn===3){assert.equal(params.tool_choice, undefined);assert.equal(JSON.parse(params.messages.at(-1).content[0].content).item.spellId,'magic-missile');return response.tool('use_spell_scroll',{itemId:'route-scroll',targetId:enemy.id})}
    if(turn===4){const result=JSON.parse(params.messages.at(-1).content[0].content);assert.equal(result.spellSlotSpent,false);assert.equal(result.spellScrollUse.consumed,true);return response.tool('use_spell_scroll',{itemId:'route-scroll',targetId:enemy.id})}
    if(turn===5)assert.equal(JSON.parse(params.messages.at(-1).content[0].content).code,'PRIMARY_ACTION_ALREADY_RESOLVED')
    return response.text('Tu lis les signes, puis le parchemin se consume et ses projectiles frappent la créature pour 9 dégâts.')
  })
  const result=await play(t,before,'je lis ce parchemin puis je lance son sort sur cette créature','1,2,3')
  assert.deepEqual(result.toolsUsed,['inspect_spell_scrolls','read_spell_scroll','use_spell_scroll'])
  assert.equal(result.newGameState.dmTools.spellScrolls['route-scroll'].status,'consumed')
  assert.ok(!result.newGameState.player.inventory.some(item=>item.id==='route-scroll'))
  assert.equal(result.newGameState.monsters[enemy.id].hp.current,before.monsters[enemy.id].hp.current-9)
  assert.deepEqual(result.newGameState.player.spellSlots,before.player.spellSlots)
  assert.deepEqual(result.newGameState.player.knownSpells,before.player.knownSpells)
})

test('documentary valuable inspection never collects a hoard; AI collection credits only actual coins and persists physical valuables once',async t=>{
  const call=await engine(t,{dice:[...Array(11).fill(1),7,1,1,1,12].join(',')})
  await replace(call,s=>{s.dmTools.wallet={cp:0,sp:0,ep:0,gp:0,pp:0}})
  const initial=await call('get_game_state')
  const made=ok(await call('create_treasure_hoard',{hoardId:'route-hoard',name:'Cache de richesses',description:'Des pièces et deux pierres ordinaires.',cell:initial.player.position,challengeBand:'0-4'}))
  const before=await call('get_game_state'),response=responses();let turn=0
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{

    turn++
    if(turn===1)return response.tool('inspect_valuables',{})
    if(turn===2){assert.equal(params.tool_choice, undefined);assert.equal(JSON.parse(params.messages.at(-1).content[0].content).total,0);return response.tool('collect_treasure_hoard',{hoardId:'route-hoard'})}
    if(turn===3)return response.tool('collect_treasure_hoard',{hoardId:'route-hoard'})
    if(turn===4)assert.equal(JSON.parse(params.messages.at(-1).content[0].content).code,'PRIMARY_ACTION_ALREADY_RESOLVED')
    return response.text('Tu ramasses les pièces et les deux pierres ; les pierres restent des objets dans ton inventaire.')
  })
  const result=await play(t,before,'je ramasse les richesses de cette cache')
  assert.deepEqual(result.toolsUsed,['inspect_valuables','collect_treasure_hoard'])
  assert.deepEqual(result.newGameState.dmTools.wallet,made.hoard.coins)
  assert.equal(result.newGameState.dmTools.hoards['route-hoard'].collected,true)
  assert.equal(result.newGameState.player.inventory.length,before.player.inventory.length+2)
  for(const id of made.hoard.valuableIds){
    assert.equal(result.newGameState.player.inventory.filter(item=>item.id===id).length,1)
    assert.equal(result.newGameState.dmTools.valuables[id].valueGp,10)
  }
})

test('DM inspiration grant and preparation never satisfy a planned check; its actual advantage and one consumed receipt survive SQL',async t=>{
  const call=await engine(t),before=await call('get_game_state'),response=responses();let turn=0,actualCheck
  const reason='Le personnage assume son idéal malgré un risque établi dans la scène.'
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{

    turn++
    if(turn===1){
      for(const name of ['grant_inspiration','spend_inspiration','roll_ability_check'])assert.ok(context.availableTools.some(tool=>tool.name===name),`${name} is exposed to the DM`)
      return response.tool('grant_inspiration',{eventId:'route-inspiration-gift',reason})
    }
    if(turn===2){
      assert.equal(params.tool_choice, undefined)
      const grant=JSON.parse(params.messages.at(-1).content[0].content)
      assert.equal(grant.granted,true);assert.equal(grant.held,true)
      return response.tool('spend_inspiration',{spendId:'route-inspiration-spend',rollKind:'check'})
    }
    if(turn===3){
      assert.equal(params.tool_choice, undefined)
      const prepared=JSON.parse(params.messages.at(-1).content[0].content)
      assert.equal(prepared.prepared,true);assert.equal(prepared.held,false);assert.equal(prepared.preparedRollKind,'check')
      return response.tool('roll_ability_check',{ability:'int',dc:10})
    }
    if(turn===4){
      actualCheck=JSON.parse(params.messages.at(-1).content[0].content)
      assert.equal(actualCheck.advantage,true);assert.equal(actualCheck.roll.rolls[0],18)
      assert.match(actualCheck.roll.detail,/ADV:/);assert.match(actualCheck.roll.detail,/Inspiration du MJ/)
      assert.equal(actualCheck.roll.modifier,Math.floor((before.player.stats.int-10)/2))
      return response.tool('roll_ability_check',{ability:'int',dc:10})
    }
    if(turn===5)assert.equal(JSON.parse(params.messages.at(-1).content[0].content).code,'PRIMARY_ACTION_ALREADY_RESOLVED')
    return response.text('Ton engagement te vaut une Inspiration. Tu la dépenses avant le test et tu réussis ton examen attentif.')
  })
  // play also reloads the SQL session and compares its complete state, including
  // inspiration receipts, with the route response after all tools have resolved.
  const result=await play(t,before,'je dépense mon inspiration avant ce test pour examiner attentivement les signes','2,18,19')
  assert.ok(actualCheck,'the planned real check was resolved after both preparations')
  assert.deepEqual(result.toolsUsed,['grant_inspiration','spend_inspiration','roll_ability_check'])
  const ledger=result.newGameState.dmTools.dmInspiration
  assert.equal(ledger.held,false);assert.equal(ledger.prepared,undefined)
  assert.deepEqual(Object.keys(ledger.grants),['route-inspiration-gift'])
  assert.deepEqual(ledger.grants['route-inspiration-gift'],{reason,outcome:'granted'})
  assert.deepEqual(Object.keys(ledger.spends),['route-inspiration-spend'])
  assert.equal(ledger.spends['route-inspiration-spend'].kind,'check')
  assert.equal(ledger.spends['route-inspiration-spend'].status,'consumed')
  assert.equal(ledger.spends['route-inspiration-spend'].consumedAt,result.newGameState.worldTimeSeconds)
  assert.equal(result.newGameState.worldTimeSeconds,before.worldTimeSeconds)
  assert.deepEqual(result.newGameState.player,before.player)
})
