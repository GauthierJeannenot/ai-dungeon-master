const test=require('node:test'),assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',MONETIZATION_ENABLED:'false',ALLOW_PAID_LLM:'false',
  DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_LEVEL:'error'})
const pg=installPgMem()
const {POST}=require('../app/api/dm/route.ts'),llm=require('../lib/dm/llm.ts'),mcp=require('../lib/mcp-client.ts')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,replace,spawn,battle,grid}=require('./helpers/mcp-toolkit.cjs')
const {getMapSpec,inferRoomIdOnMap}=require('../mcp-server/dist/lib/adventure-map.js')
test.after(()=>pg.restore())
const json=value=>JSON.parse(JSON.stringify(value))

test('the model previews and moves a real grapple through SQL, with exact arguments and one exploration movement shared across both move tools',async t=>{
  const call=await engine(t,{characterId:'fighter',dice:'20,1'}),initial=await call('get_game_state')
  const nav=grid(initial),map=getMapSpec(initial.currentMapId,initial)
  let corner
  for(let y=0;y<=map.grid.rows-3&&!corner;y++)for(let x=0;x<=map.grid.cols-4&&!corner;x++){
    const patch=Array.from({length:3},(_,dy)=>Array.from({length:4},(_,dx)=>({x:x+dx,y:y+dy}))).flat()
    if(patch.every(cell=>nav.free(cell)&&inferRoomIdOnMap(cell,initial.currentMapId,initial)===initial.currentRoomId))corner={x,y}
  }
  assert.ok(corner,'the routing fixture needs a genuine free patch in the current room')
  const cell=(x,y)=>({x:corner.x+x,y:corner.y+y})
  const weapon=initial.dmTools?.loadout?.mainHandId??initial.player.inventory.find(item=>item.type==='weapon').id
  ok(await call('equip_item',{itemId:weapon,slot:'main_hand',operation:'unequip'}))
  const target=await spawn(call)
  await replace(call,state=>{state.player.position=cell(0,1);state.monsters[target.id].position=cell(1,1)})
  await battle(call,[target.id])
  const grapple=ok(await call('combat_action',{action:'grapple',actorId:'player',targetId:target.id,defenseSkill:'acrobatics'}))
  assert.equal(grapple.success,true,'the fixture establishes a real contested grapple, not a synthetic effect')
  await replace(call,state=>{state.phase='exploration';state.currentTurn=null;state.initiativeOrder=[]})
  const before=await call('get_game_state'),hold=before.hero.effects.find(effect=>effect.kind==='grapple'&&effect.sourceId==='player'&&effect.targetIds.includes(target.id))
  assert.ok(hold)
  const id=`grapple-routing-${process.pid}-${Date.now()}-${Math.random()}`,previous=process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE='19'
  t.after(async()=>{
    await mcp.closeMCPClient(id);await deleteSession(id)
    if(previous===undefined)delete process.env.AI_DM_TEST_DICE_SEQUENCE;else process.env.AI_DM_TEST_DICE_SEQUENCE=previous
  })
  await saveSession(id,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
  const chosen={actorId:'player',targetId:target.id,toCell:cell(1,1),targetToCell:cell(2,1),allowPartial:false,acknowledgeEventIds:[]}
  const second={...chosen,toCell:cell(2,1),targetToCell:cell(3,1)}
  const forwarded=[],realCall=mcp.callMCPTool
  t.mock.method(mcp,'callMCPTool',async(name,input,...rest)=>{
    if(['preview_grapple_transport','move_grappled_creature','move_token'].includes(name))forwarded.push({name,input:json(input)})
    return realCall(name,input,...rest)
  })
  let sequence=0,turn=0,lastCallId
  const text=()=>({stop_reason:'end_turn',content:[{type:'text',text:'Tu déplaces la créature maintenue avec toi jusqu’aux positions choisies.'}]})
  const emit=(name,input)=>{lastCallId=`grapple-route-${++sequence}`;return {stop_reason:'tool_use',content:[{type:'tool_use',id:lastCallId,name,input}]}}
  const last=params=>{
    const block=params.messages.flatMap(message=>Array.isArray(message.content)?message.content:[])
      .findLast(item=>item.type==='tool_result'&&item.tool_use_id===lastCallId)
    assert.ok(block);return JSON.parse(block.content)
  }
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{

    if(context.operation==='dm.final_narration'||context.operation==='dm.repair_narration')return text()
    turn++
    if(turn===1){
      for(const name of ['preview_grapple_transport','move_grappled_creature']){
        const exposed=context.availableTools.find(tool=>tool.name===name);assert.ok(exposed,`${name} remains available to the model`)
        for(const key of ['actorId','targetId','toCell','targetToCell','allowPartial','acknowledgeEventIds'])assert.ok(exposed.input_schema.properties[key],`${name}.${key} stays structured`)
      }
      return emit('preview_grapple_transport',chosen)
    }
    if(turn===2){
      assert.equal(params.tool_choice, undefined)
      assert.equal(last(params).costCells,1)
      const checkpoint=(await loadSession(id)).gameState
      for(const key of ['player','monsters','hero','dmTools','actionUsed','movementUsed','worldTimeSeconds'])
        assert.deepEqual(json(checkpoint[key]),json(before[key]),`preview preserves mechanical ${key}; request bookkeeping is separate`)
      return emit('move_grappled_creature',chosen)
    }
    if(turn===3){
      assert.equal(last(params).goalReached,true)
      const checkpoint=(await loadSession(id)).gameState
      assert.deepEqual(checkpoint.player.position,chosen.toCell)
      assert.deepEqual(checkpoint.monsters[target.id].position,chosen.targetToCell)
      assert.ok(checkpoint.hero.effects.some(effect=>effect.id===hold.id))
      return emit('move_grappled_creature',second)
    }
    if(turn===4){
      assert.equal(last(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED')
      return emit('move_token',{tokenId:'player',toCell:cell(1,0)})
    }
    if(turn===5)assert.equal(last(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED','ordinary movement shares the same one-movement budget')
    return text()
  })
  const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({sessionId:id,message:'je traîne la créature que je maintiens sur une courte distance',adventureId:before.adventureId,characterId:before.characterId})}))
  const result=await response.json()
  assert.equal(response.status,200,JSON.stringify(result))
  assert.deepEqual(forwarded,[{name:'preview_grapple_transport',input:chosen},{name:'move_grappled_creature',input:chosen}],
    'only the exact model-emitted preview and first move reach MCP; no server fabricates or rewrites a movement')
  assert.deepEqual(result.toolsUsed,['preview_grapple_transport','move_grappled_creature'])
  assert.deepEqual(result.newGameState.player.position,chosen.toCell)
  assert.deepEqual(result.newGameState.monsters[target.id].position,chosen.targetToCell)
  assert.ok(result.newGameState.hero.effects.some(effect=>effect.id===hold.id))
  assert.deepEqual(json((await loadSession(id)).gameState),result.newGameState)
})
