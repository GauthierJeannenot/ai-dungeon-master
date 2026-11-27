const test = require('node:test')
const assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { LLM_MODE: 'mock', MONETIZATION_ENABLED: 'false', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_LEVEL: 'error' })
const pg = installPgMem()
const { POST } = require('../app/api/dm/route.ts')
const llm = require('../lib/dm/llm.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
const { engine, ok, object, addSupply } = require('./helpers/mcp-toolkit.cjs')
test.after(() => pg.restore())

async function play(t, state, message, dice = '20') {
  const id = `toolkit-route-${process.pid}-${Date.now()}-${Math.random()}`
  const previous = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = dice
  t.after(async () => {
    await closeMCPClient(id); await deleteSession(id)
    if (previous === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE
    else process.env.AI_DM_TEST_DICE_SEQUENCE = previous
  })
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: id, message, adventureId: state.adventureId, characterId: state.characterId }) }))
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  assert.deepEqual(JSON.parse(JSON.stringify((await loadSession(id)).gameState)), data.newGameState)
  return data
}

test('the mock AI selects one atomic object call; its actual result and state are persisted through the route', async t => {
  const call = await engine(t)
  await object(call, 'route-chest', { locked: true, forceDc: 15, lockDc: 15 })
  const result = await play(t, await call('get_game_state'), 'je force route-chest', '20')
  assert.deepEqual(result.toolsUsed, ['discover_tools','interact_object'])
  assert.equal(result.newGameState.dmTools.objects['route-chest'].state, 'open')
  assert.match(result.narrative, /réussite|open/)
})

test('the mock AI uses the actual consumable tool instead of narrating a free antitoxin effect', async t => {
  const call = await engine(t)
  await addSupply(call, 'antitoxin', 'route-antidote')
  const result = await play(t, await call('get_game_state'), 'je bois route-antidote')
  assert.deepEqual(result.toolsUsed, ['discover_tools','use_item'])
  assert.ok(!result.newGameState.player.inventory.some(item => item.id === 'route-antidote'))
  assert.ok(result.newGameState.hero.effects.some(effect => effect.kind === 'antitoxin'))
})

test('table rolls remain documentary and the agent chooses the atomic object action', async t => {
  const call = await engine(t)
  await object(call, 'planned-chest', { locked: true, forceDc: 15, lockDc: 15 })
  const tableId = ok(await call('consult_rules', { topic: 'npc' })).results[0].tableId
  let step = 0
  const answer = content => ({ content, stop_reason: 'tool_use' })
  const block = (name, input) => ({ type: 'tool_use', id: `toolkit-${++step}`, name, input })
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (step === 0) return answer([block('roll_table', { tableId })])
    if (step === 1) {
      assert.equal(params.tool_choice, undefined)
      assert.equal(context.gameState.dmTools.objects['planned-chest'].state, 'closed')
      assert.equal(context.gameState.dmTools.objects['planned-chest'].locked, true)
      return answer([block('interact_object', { objectId: 'planned-chest', action: 'force' })])
    }
    const resolved = JSON.parse(params.messages.at(-1).content[0].content)
    assert.equal(resolved.success, true)
    assert.equal(resolved.check.roll.rolls[0], 20, 'the atomic force action has its own actual deterministic die after the source-table die')
    return { content: [{ type: 'text', text: 'Tu ouvres le coffre après avoir forcé son verrou.' }], stop_reason: 'end_turn' }
  })
  const result = await play(t, await call('get_game_state'), 'je force planned-chest', '20,20')
  assert.equal(result.newGameState.dmTools.objects['planned-chest'].state, 'open')
  assert.ok(result.toolsUsed.includes('roll_table'))
  assert.ok(!result.toolsUsed.includes('roll_ability_check'), 'the duplicate generic roll must never reach MCP')
})

test('treasure inspection cannot satisfy collection; the model-selected collection persists the actual wallet', async t => {
  const call = await engine(t)
  const initial = await call('get_game_state')
  ok(await call('create_treasure', { treasureId: 'route-purse', name: 'Petite bourse', description: 'Des pièces ordinaires.',
    cell: initial.player.position, mode: 'authored', coins: { gp: 3, ep: 1 } }))
  let turn = 0
  const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `${name}-${turn}`, name, input }] })
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (++turn === 1) return tool('inspect_scene', { category: 'treasures' })
    if (turn === 2) {
      assert.equal(params.tool_choice, undefined)
      return tool('collect_treasure', { treasureId: 'route-purse' })
    }
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Tu ramasses la bourse : trois pièces d’or et une d’électrum rejoignent ta bourse.' }] }
  })
  const result = await play(t, await call('get_game_state'), 'je ramasse la petite bourse')
  assert.deepEqual(result.toolsUsed, ['inspect_scene', 'collect_treasure'])
  assert.deepEqual(result.newGameState.dmTools.wallet, { cp: 0, sp: 0, ep: 1, gp: initial.dmTools.wallet.gp+3, pp: 0 })
  assert.equal(result.newGameState.dmTools.treasures['route-purse'].collected, true)
})

test('one player message cannot cause two distinct currency payments; only the exact first model call is charged', async t => {
  const call = await engine(t)
  const initial = await call('get_game_state')
  ok(await call('create_treasure', { treasureId: 'fees', name: 'Pièces', description: 'Des pièces ordinaires.', cell: initial.player.position, mode: 'authored', coins: { gp: 5 } }))
  ok(await call('collect_treasure', { treasureId: 'fees' }))
  let turn = 0
  const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `${name}-${turn}`, name, input }] })
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (++turn <= 2) return tool('spend_currency', { transactionId: `fee-${turn}`, paid: { gp: 1 }, reason: 'Un paiement convenu.' })
    assert.equal(JSON.parse(params.messages.at(-1).content[0].content).code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Tu règles la somme convenue : une pièce d’or quitte ta bourse.' }] }
  })
  const result = await play(t, await call('get_game_state'), 'je règle le prix convenu')
  assert.deepEqual(result.toolsUsed, ['spend_currency'])
  assert.equal(result.newGameState.dmTools.wallet.gp, initial.dmTools.wallet.gp+4)
  assert.deepEqual(Object.keys(result.newGameState.dmTools.currencyTransactions), ['fee-1'])
})

test('an agent-selected tool check rolls once and retains failed-check confidentiality in narration evidence', async t => {
  const call = await engine(t, { characterId: 'bard' })
  let turn = 0
  const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `${name}-${turn}`, name, input }] })
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (++turn === 1) return tool('resolve_tool_check', { toolItemId: 'lute', ability: 'cha', relatedSkill: 'performance', dc: 30, task: 'Reproduire une mélodie difficile.' })
    const result = JSON.parse(params.messages.at(-1).content[0].content)
    assert.equal(result.success, false)
    assert.equal(result.check.roll.total, 10)
    assert.ok(result.narrationFacts.some(fact => /Jet de caractéristique ÉCHOUÉ/.test(fact)))
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Tu essaies de reprendre la mélodie, mais les notes te résistent.' }] }
  })
  const result = await play(t, await call('get_game_state'), 'je reprends cet air difficile au luth', '3')
  assert.deepEqual(result.toolsUsed, ['resolve_tool_check'])
})

test('magic catalog inspection cannot identify or activate an item; the exact AI activation persists once through SQL', async t => {
  const call=await engine(t),initial=await call('get_game_state')
  ok(await call('create_magic_item',{itemId:'route-potion',templateId:'potion_of_greater_healing',name:'Fiole trouble',description:'Une fiole encore inconnue.',cell:initial.player.position}))
  ok(await call('pick_up_item',{itemId:'route-potion'}))
  const state=await call('get_game_state');state.player.hp.current-=20
  let turn=0
  const tool=(name,input)=>({stop_reason:'tool_use',content:[{type:'tool_use',id:`magic-${++turn}`,name,input}]})
  t.mock.method(llm,'createLlmMessage',async(params,context)=>{

    if(turn===0){assert.ok(context.availableTools.some(t=>t.name==='use_magic_item'));return tool('inspect_magic_items',{itemId:'route-potion'})}
    if(turn===1){assert.equal(params.tool_choice, undefined);assert.equal(JSON.parse(params.messages.at(-1).content[0].content).identified,false);return tool('use_magic_item',{itemId:'route-potion',targetId:'player'})}
    if(turn===2)return tool('use_magic_item',{itemId:'route-potion',targetId:'player'})
    assert.equal(JSON.parse(params.messages.at(-1).content[0].content).code,'PRIMARY_ACTION_ALREADY_RESOLVED')
    return {stop_reason:'end_turn',content:[{type:'text',text:'Tu bois la potion ; elle te rend 14 points de vie.'}]}
  })
  const result=await play(t,state,'je bois la fiole trouble','1,2,3,4')
  assert.deepEqual(result.toolsUsed,['inspect_magic_items','use_magic_item'])
  assert.equal(result.newGameState.player.hp.current,state.player.hp.current+14)
  assert.equal(result.newGameState.dmTools.magicItems['route-potion'].status,'consumed')
  assert.equal(result.newGameState.dmTools.magicItems['route-potion'].identified,false)
  assert.ok(!result.newGameState.player.inventory.some(i=>i.id==='route-potion'))
})
