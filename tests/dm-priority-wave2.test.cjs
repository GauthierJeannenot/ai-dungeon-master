const test=require('node:test'),assert=require('node:assert/strict')
const {installPgMem}=require('./helpers/pg-mem.cjs')
Object.assign(process.env,{LLM_MODE:'mock',MONETIZATION_ENABLED:'false',ALLOW_PAID_LLM:'false',
  DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_LEVEL:'error'})
const pg=installPgMem()
const {POST}=require('../app/api/dm/route.ts'),llm=require('../lib/dm/llm.ts')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {closeMCPClient}=require('../lib/mcp-client.ts')
const {engine,ok,spawn,replace,battle}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
const json=value=>JSON.parse(JSON.stringify(value))
function responses(){let sequence=0;return {
  tool:(name,input)=>({stop_reason:'tool_use',content:[{type:'tool_use',id:`priority-wave2-${++sequence}`,name,input}]}),
  text:text=>({stop_reason:'end_turn',content:[{type:'text',text}]}),
}}
function resultFor(params,toolUseId){
  const block=params.messages.flatMap(message=>Array.isArray(message.content)?message.content:[])
    .findLast(item=>item.type==='tool_result'&&item.tool_use_id===toolUseId)
  assert.ok(block,`the exact tool result ${toolUseId} remains available`)
  return JSON.parse(block.content)
}
async function routeSession(t,state,dice){
  const id=`priority-wave2-${process.pid}-${Date.now()}-${Math.random()}`,previous=process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE=dice
  t.after(async()=>{await closeMCPClient(id);await deleteSession(id);if(previous===undefined)delete process.env.AI_DM_TEST_DICE_SEQUENCE;else process.env.AI_DM_TEST_DICE_SEQUENCE=previous})
  await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
  return {id,async play(message){
    const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({sessionId:id,message,adventureId:state.adventureId,characterId:state.characterId})}))
    const data=await response.json();assert.equal(response.status,200,JSON.stringify(data))
    assert.deepEqual(json((await loadSession(id)).gameState),data.newGameState)
    return data
  }}
}

test('temporary-HP and directional-cover preparations checkpoint in SQL without satisfying the planned ability check',async t=>{
  const call=await engine(t),enemy=await spawn(call),before=await call('get_game_state')
  const session=await routeSession(t,before,'15,19'),response=responses();let turn=0,check,lastCallId
  const emit=(name,input)=>{const request=response.tool(name,input);lastCallId=request.content[0].id;return request}
  const gift={eventId:'route-buffer-event',targetId:'player',sourceId:'route-established-buffer',
    sourceDescription:'Une protection temporaire déjà établie est arbitrée explicitement par le MJ.',amount:8,duration:{kind:'until_long_rest'}}
  const cover={coverId:'route-parapet',operation:'set',originId:enemy.id,targetId:'player',
    obstacleCell:before.player.position,degree:'half',reason:'Le parapet établi protège le joueur de ce côté précis de la créature.'}
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{

    if(context.operation==='dm.final_narration'||context.operation==='dm.repair_narration')return response.text('La protection et le parapet sont établis ; ton examen attentif réussit.')
    turn++
    if(turn===1){
      for(const name of ['grant_temporary_hp','configure_cover','roll_ability_check'])assert.ok(context.availableTools.some(tool=>tool.name===name),`${name} is exposed`)
      const temporary=context.availableTools.find(tool=>tool.name==='grant_temporary_hp').input_schema
      for(const name of ['eventId','targetId','sourceId','sourceDescription','amount','duration','choice'])assert.ok(temporary.properties[name],`${name} remains a structured temporary-HP argument`)
      const coverSchema=context.availableTools.find(tool=>tool.name==='configure_cover').input_schema
      for(const name of ['originId','targetId','obstacleCell','degree','reason'])assert.ok(coverSchema.properties[name],`${name} remains a structured cover argument`)
      return emit('grant_temporary_hp',gift)
    }
    if(turn===2){
      assert.equal(params.tool_choice, undefined)
      assert.equal(resultFor(params,lastCallId).target.temporaryHp,8)
      const checkpoint=(await loadSession(session.id)).gameState
      assert.equal(checkpoint.dmTools.temporaryHp.pools.player.current,8)
      assert.equal(checkpoint.dmTools.temporaryHp.receipts[gift.eventId].outcome,'granted')
      assert.deepEqual(checkpoint.player.hp,before.player.hp)
      assert.equal(checkpoint.monsters[enemy.id].hp.current,before.monsters[enemy.id].hp.current)
      return emit('configure_cover',cover)
    }
    if(turn===3){
      assert.equal(params.tool_choice, undefined)
      const configured=resultFor(params,lastCallId)
      assert.equal(configured.cover.acBonus,2);assert.equal(configured.declaration.origin.id,enemy.id)
      const checkpoint=(await loadSession(session.id)).gameState,record=checkpoint.dmTools.cover.records[cover.coverId]
      assert.equal(record.origin.id,enemy.id);assert.equal(record.targetId,'player')
      assert.deepEqual(record.obstacleCell,before.player.position)
      assert.equal(checkpoint.dmTools.temporaryHp.pools.player.current,8)
      assert.equal(checkpoint.monsters[enemy.id].hp.current,before.monsters[enemy.id].hp.current)
      return emit('roll_ability_check',{ability:'int',dc:10})
    }
    if(turn===4){
      check=resultFor(params,lastCallId)
      assert.equal(check.success,true);assert.equal(check.roll.rolls[0],15)
      assert.equal(check.roll.modifier,Math.floor((before.player.stats.int-10)/2),'cover grants no bonus to an unrelated Intelligence check')
      const checkpoint=(await loadSession(session.id)).gameState
      assert.equal(checkpoint.monsters[enemy.id].hp.current,before.monsters[enemy.id].hp.current)
      return emit('roll_ability_check',{ability:'int',dc:10})
    }
    if(turn===5)assert.equal(resultFor(params,lastCallId).code,'PRIMARY_ACTION_ALREADY_RESOLVED')
    return response.text('La protection et le parapet sont établis ; ton examen attentif réussit.')
  })
  const result=await session.play('j’examine attentivement les signes pour les comprendre')
  assert.ok(check)
  assert.deepEqual(result.toolsUsed,['grant_temporary_hp','configure_cover','roll_ability_check'])
  assert.equal(result.newGameState.dmTools.temporaryHp.pools.player.current,8)
  assert.equal(Object.keys(result.newGameState.dmTools.temporaryHp.receipts).length,1)
  assert.equal(result.newGameState.dmTools.cover.records[cover.coverId].degree,'half')
  assert.equal(result.newGameState.monsters[enemy.id].hp.current,before.monsters[enemy.id].hp.current)
  assert.deepEqual(result.newGameState.player.hp,before.player.hp)
})

test('a planned two-weapon bonus attack consumes its persisted real Attack witness without inventing another primary action',async t=>{
  const call=await engine(t,{characterId:'fighter',dice:'15,2'}),initial=await call('get_game_state')
  const held=initial.dmTools?.loadout?.mainHandId??initial.player.inventory.find(item=>item.type==='weapon').id
  ok(await call('equip_item',{itemId:held,slot:'main_hand',operation:'unequip'}))
  if(initial.player.inventory.some(item=>item.id==='shield'))ok(await call('equip_item',{itemId:'shield',slot:'shield',operation:'unequip'}))
  await replace(call,state=>state.player.inventory.push(
    {id:'route-left-dagger',equipmentId:'dagger',name:'Dague gauche',type:'weapon'},
    {id:'route-right-dagger',equipmentId:'dagger',name:'Dague droite',type:'weapon'}))
  ok(await call('equip_item',{itemId:'route-left-dagger',slot:'main_hand',operation:'equip'}))
  ok(await call('equip_item',{itemId:'route-right-dagger',slot:'off_hand',operation:'equip'}))
  const enemy=await spawn(call)
  await replace(call,state=>{state.monsters[enemy.id].hp.current=9})
  await battle(call,[enemy.id])
  // A real earlier Attack in this same combat turn supplies the witness; the
  // player message below declares only the still-available bonus attack.
  const primary=ok(await call('resolve_player_attack',{targetId:enemy.id,weaponOrSpell:'route-left-dagger'}))
  assert.ok(primary.primaryAttackId)
  const before=await call('get_game_state'),witness=before.dmTools.twoWeapon.witnesses[primary.primaryAttackId]
  assert.equal(before.hero.actionCredits,0)
  assert.equal(before.hero.attackAction.remaining,1,'a still-optional Extra Attack keeps the current message eligible for a genuine new bonus-attack plan')
  assert.equal(before.monsters[enemy.id].hp.current,3)
  const session=await routeSession(t,before,'16,3,19'),response=responses();let turn=0,bonus,lastCallId
  const emit=(name,args)=>{const request=response.tool(name,args);lastCallId=request.content[0].id;return request}
  const input={attackId:'route-bonus-attack',primaryAttackId:primary.primaryAttackId,weaponItemId:'route-right-dagger',targetId:enemy.id,attackMode:'melee'}
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{

    if(context.operation==='dm.final_narration'||context.operation==='dm.repair_narration')return response.text('Ta seconde dague abat la créature ; le combat prend fin.')
    turn++
    if(turn===1){
      assert.ok(context.availableTools.some(tool=>tool.name==='resolve_two_weapon_attack'))
      assert.deepEqual((await loadSession(session.id)).gameState.dmTools.twoWeapon.witnesses[primary.primaryAttackId],witness)
      return emit('resolve_two_weapon_attack',input)
    }
    if(turn===2){
      bonus=resultFor(params,lastCallId)
      assert.equal(bonus.hit,true);assert.equal(bonus.damageRoll.modifier,0);assert.equal(bonus.damageDealt,3)
      const checkpoint=(await loadSession(session.id)).gameState
      assert.equal(checkpoint.dmTools.twoWeapon.receipts[input.attackId].status,'resolved')
      assert.equal(checkpoint.dmTools.twoWeapon.receipts[input.attackId].primaryAttackId,primary.primaryAttackId)
      assert.deepEqual(checkpoint.dmTools.twoWeapon.witnesses[primary.primaryAttackId],witness)
      assert.equal(checkpoint.bonusActionUsed.player,true);assert.equal(checkpoint.hero.actionCredits,0)
      assert.equal(checkpoint.monsters[enemy.id].isAlive,false)
      return emit('end_combat',{})
    }
    if(turn===3)assert.equal(resultFor(params,lastCallId).phase,'exploration')
    return response.text('Ta seconde dague abat la créature ; le combat prend fin.')
  })
  const result=await session.play('je frappe avec la dague de mon autre main en action bonus')
  assert.deepEqual(result.toolsUsed,['resolve_two_weapon_attack','end_combat'])
  assert.equal(result.newGameState.monsters[enemy.id].hp.current,before.monsters[enemy.id].hp.current-3)
  assert.equal(result.newGameState.hero.actionCredits,0)
  assert.equal(result.newGameState.bonusActionUsed.player,true)
  assert.deepEqual(result.newGameState.dmTools.twoWeapon.witnesses[primary.primaryAttackId],witness)
  assert.equal(result.newGameState.dmTools.twoWeapon.receipts[input.attackId].status,'resolved')
})
