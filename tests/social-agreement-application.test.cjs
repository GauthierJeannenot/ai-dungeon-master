const test = require('node:test'), assert = require('node:assert/strict')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { engine, ok, replace } = require('./helpers/mcp-toolkit.cjs')
const llm = require('../lib/dm/llm.ts'), mcp = require('../lib/mcp-client.ts')
const { POST } = require('../app/api/dm/route.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { socialInteractionContext } = require('../lib/dm/social-interaction-context.ts')
const { evaluateMapQuest } = require('../mcp-server/dist/lib/adventure-map.js')
const source = 'Le MJ constate la compassion effectivement exprimée pour Sarah, conformément à la salle 6 ; aucun départ ni accompagnement demandé.'
test.after(() => pg.restore())

async function vecken(t, dice = '7,19') {
  const call = await engine(t, { dice, characterId: 'fighter' })
  await replace(call, state => {
    const npc = state.npcs.vecken
    state.currentMapId = 'waterdeep'; state.currentRoomId = npc.roomId
    state.player.position = { ...npc.position }
    if (!state.roomsVisited.includes(npc.roomId)) state.roomsVisited.push(npc.roomId)
  })
  ok(await call('reveal_npc', { npcId: 'vecken', reason: 'Interlocuteur déjà présent et visible.' }))
  return call
}
const begin = attitude => ({ eventId: 'vecken-begin', interactionId: 'vecken-talk', targetId: 'vecken', attitude, source })
const conversation = { eventId: 'vecken-words', interactionId: 'vecken-talk', targetId: 'vecken', source,
  requestReached: true, sufficientForInsight: false,
  participants: [{ entityId: 'player', statement: 'Je lui parle de Sarah avec compassion et lui demande son aide pour comprendre son histoire.', contribution: 'positive', source }] }
const request = resolution => ({ eventId: 'vecken-agreement', interactionId: 'vecken-talk', targetId: 'vecken',
  conversationEventId: 'vecken-words', entityId: 'player',
  request: { id: 'vecken-help', description: 'Aider par son témoignage sur Sarah, sans rejoindre une expédition.', risk: 'none', source },
  resolution, ...(resolution === 'check' ? { skill: 'persuasion' } : { roleplayDecision: { granted: true, source } }) })

test('the API applies certain NPC cooperation with an explicit disposition tool, no dice, and saves the actual disposition', async t => {
  const seed = await vecken(t), initial = await seed('get_game_state')
  const id = `social-agreement-${process.pid}-${Date.now()}`
  await saveSession(id, { gameState: initial, history: [], adventureId: initial.adventureId, characterId: initial.characterId })
  t.after(async () => { await mcp.closeMCPClient(id); await deleteSession(id) })
  const selected = [], forwarded = []
  t.mock.method(mcp, 'listMCPTools', async () => (await seed.client.listTools()).tools)
  t.mock.method(mcp, 'callMCPTool', async (name, input = {}) => {
    if (!['get_game_state', 'replace_game_state'].includes(name)) {
      const command = { name, input: structuredClone(input) }
      assert.ok(selected.some(chosen => JSON.stringify(chosen) === JSON.stringify(command)), `No fabricated call: ${name}`)
      forwarded.push(command)
    }
    return seed(name, input)
  })
  const disposition = { npcId: 'vecken', disposition: 'helpful', reason: source }
  const commands = [
    { name: 'get_rules_support', input: { domain: 'social_interactions' } },
    { name: 'begin_social_interaction', input: begin('friendly') },
    { name: 'record_social_conversation', input: conversation },
    { name: 'resolve_social_request', input: request('roleplay') },
    { name: 'reveal_npc', input: disposition },
  ]
  let index = 0
  t.mock.method(llm, 'createLlmMessage', async params => {
    const last = params.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === 'tool_result').at(-1)
    const result = last && JSON.parse(last.content)
    if (index === 0) assert.match(typeof params.system === 'string' ? params.system : params.system.map(block => block.text).join('\n'), /Aucun jet sans enjeu/)
    if (index === 1) {
      assert.ok(params.tools.some(tool => tool.name === 'reveal_npc'), 'the social procedure must load the disposition schema')
      assert.ok(result.procedures.some(guide => guide.id === 'social-interactions-stakes-and-disposition'))
    }
    if (index === 3) {
      assert.equal(result.agentContinuation.stage, 'resolve_request')
      assert.match(result.agentContinuation.instruction, /resolution=roleplay/)
      assert.deepEqual(params.tool_choice, { type: 'any', disable_parallel_tool_use: true })
    }
    if (index === 4) {
      assert.equal(result.requestGranted, true); assert.equal(result.check, undefined)
      assert.equal(result.outcomeApplication.npcId, 'vecken')
      assert.equal(result.outcomeApplication.npcDispositionAtResolution, initial.npcs.vecken.disposition)
      assert.equal(result.outcomeApplication.dispositionApplied, false)
      assert.match(result.outcomeApplication.instruction, /reveal_npc/)
      const beforeDisposition = await seed('get_game_state')
      assert.equal(beforeDisposition.npcs.vecken.disposition, initial.npcs.vecken.disposition)
      assert.equal(evaluateMapQuest(beforeDisposition, 'waterdeep').objectives.find(objective => objective.id === 'vecken_warned').done, false)
    }
    if (index === commands.length) {
      assert.equal(result.success, true)
      assert.equal((await seed('get_game_state')).npcs.vecken.disposition, 'helpful')
      index++
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Vecken te répond : « Je te dirai ce que je sais de Sarah. Je dois rester auprès de mon père. »' }] }
    }
    const command = commands[index++]; assert.ok(command, 'the agent must finish without another roll')
    selected.push(structuredClone(command))
    return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `social-${index}`, ...command }] }
  })
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: id, adventureId: initial.adventureId, characterId: initial.characterId, message: 'Je tente de persuader Vecken de m’aider à comprendre ce qui est arrivé à Sarah.' }) }))
  const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result))
  assert.equal(index, commands.length + 1); assert.deepEqual(forwarded, selected)
  assert.equal(result.newGameState.npcs.vecken.disposition, 'helpful')
  assert.equal(evaluateMapQuest(result.newGameState, 'waterdeep').objectives.find(objective => objective.id === 'vecken_warned').done, true)
  assert.deepEqual(result.newGameState.npcs.vecken.position, initial.npcs.vecken.position)
  assert.equal(result.newGameState.npcs.vecken.roomId, initial.npcs.vecken.roomId)
  assert.deepEqual(result.newGameState.player.position, initial.player.position)
  assert.deepEqual(result.newGameState.player.inventory, initial.player.inventory)
  assert.deepEqual(JSON.parse(JSON.stringify((await loadSession(id)).gameState)), result.newGameState)
  const context = socialInteractionContext(result.newGameState)
  assert.match(context, /"currentNpcDisposition":"helpful"/)
  assert.match(context, /"lastResolvedRequest":\{"eventId":"vecken-agreement","requestGranted":true/)
  assert.equal(ok(await seed('roll_dice', { notation: '1d20' })).total, 7, 'the first die was never consumed by the certain agreement or its disposition')
})

for (const [die, granted] of [[1, false], [17, true]]) test(`an uncertain social request keeps its actual d20 ${die} and does not automatically change NPC disposition`, async t => {
  const call = await vecken(t, `${die},19`), initial = await call('get_game_state')
  ok(await call('begin_social_interaction', begin('indifferent')))
  ok(await call('record_social_conversation', conversation))
  const input = request('check'), result = ok(await call('resolve_social_request', input))
  assert.equal(result.check.roll.rolls[0], die); assert.equal(result.check.dc, 10)
  assert.equal(result.requestGranted, granted)
  assert.equal(Boolean(result.outcomeApplication), granted)
  assert.equal((await call('get_game_state')).npcs.vecken.disposition, initial.npcs.vecken.disposition)
  const beforeReplay = await call('get_game_state')
  assert.equal(ok(await call('resolve_social_request', input)).replayed, true)
  assert.deepEqual(await call('get_game_state'), beforeReplay)
  if (granted) {
    ok(await call('reveal_npc', { npcId: 'vecken', disposition: 'helpful', reason: source }))
    assert.equal((await call('get_game_state')).npcs.vecken.disposition, 'helpful')
  }
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19, 'no second social roll was substituted')
})

test('DC0 still has real uncertainty with a negative modifier; a failed request grants no disposition follow-up', async t => {
  const call = await vecken(t, '1,19')
  await replace(call, state => { state.player.stats.cha = 6 })
  ok(await call('begin_social_interaction', begin('friendly')))
  ok(await call('record_social_conversation', conversation))
  const result = ok(await call('resolve_social_request', request('check')))
  assert.equal(result.check.dc, 0); assert.equal(result.check.roll.total, -1)
  assert.equal(result.requestGranted, false)
  assert.equal(result.outcomeApplication, undefined)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
