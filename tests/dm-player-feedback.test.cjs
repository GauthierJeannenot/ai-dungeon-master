const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai',
  MONETIZATION_ENABLED: 'false', DM_RATE_LIMIT_PER_MINUTE: '0',
  APP_LOG_PERSIST_ENABLED: 'false', AI_DM_TEST_DICE_SEQUENCE: '1,20', LLM_MAX_CALLS_PER_REQUEST: '6' })
const pg = installPgMem()
const llm = require('../lib/dm/llm.ts')
const { POST } = require('../app/api/dm/route.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
const { loadSession, saveSession, deleteSession } = require('../lib/session-store.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { serializeGameState, buildStaticPrompt } = require('../lib/dm/prompts.ts')
test.after(() => pg.restore())

const answer = content => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: content }] })
const tool = (name, input, id = name) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name, input, id }] })

const lastResult = params => JSON.parse(params.messages.at(-1).content[0].content)

function session(t) {
  const id = `feedback-${process.pid}-${Date.now()}-${Math.random()}`
  t.after(async () => { await closeMCPClient(id); await deleteSession(id) })
  return id
}
async function post(sessionId, message) {
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, message }) }))
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  return data
}

test('the model can request atomic stealth movement after a planner failure', async t => {
  const id = session(t)
  const initial = buildInitialGameState(); initial.sceneMemory = { doorStates: { front: 'open' } }
  await saveSession(id, { gameState: initial, history: [], adventureId: initial.adventureId })
  let round = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (++round === 1) {
      assert.equal(params.tool_choice, undefined)
      return tool('move_token', { tokenId: 'player', toCell: { x: 3, y: 6 }, stealth: true })
    }
    const result = lastResult(params)
    assert.equal(result.stealthCheck.dc, 13)
    assert.equal(result.stealthCheck.success, false)
    return answer('Tu rejoins le quai, mais le bruit de tes pas signale ta présence.')
  })
  const data = await post(id, 'je vais tenter de rentrer discrètement par le quai de chargement')
  assert.deepEqual(data.newGameState.player.position, { x: 3, y: 6 })
  assert.equal(data.newGameState.combatLog.filter(entry => /Discrétion/.test(entry.action)).length, 1)
  assert.equal(data.newGameState.worldFacts.at(-1).source, 'move_token:stealth')
})

test('one move and one check are allowed, while a repeated check stays blocked', async t => {
  const id = session(t)
  let round = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    switch (++round) {
      case 1: return tool('move_token', { tokenId: 'player', toCell: { x: 11, y: 13 } })
      case 2: return tool('roll_ability_check', { ability: 'wis', skill: 'perception', dc: 12 }, 'first-check')
      case 3:
        assert.ok(lastResult(params).roll)
        return tool('roll_ability_check', { ability: 'wis', skill: 'perception', dc: 12 }, 'repeat-check')
      default:
        assert.equal(lastResult(params).code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
        return answer('Tu avances et observes les alentours.')
    }
  })
  const data = await post(id, 'je vais en (11,13) et observe les alentours')
  assert.equal(data.newGameState.combatLog.filter(entry => /Perception/.test(entry.action)).length, 1)
})

test('a deposited sword stays behind after movement, SQL save/load and the next prompt', async t => {
  const id = session(t)
  let round = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    switch (++round) {
      case 1: return tool('drop_item', { itemId: 'longsword' })
      case 2: return tool('move_token', { tokenId: 'player', toCell: { x: 14, y: 2 } })
      default: return answer('Tu poses ton épée et rejoins le verger.')
    }
  })
  await post(id, 'je pose mon épée au pied de mac et me rends vers le verger')
  const stored = await loadSession(id)
  assert.equal(stored.gameState.player.inventory.some(item => item.id === 'longsword'), false)
  assert.deepEqual(stored.gameState.droppedItems.longsword.position, { x: 4, y: 13 })
  assert.deepEqual(stored.gameState.player.position, { x: 14, y: 2 })
  const compact = JSON.parse(serializeGameState(stored.gameState))
  assert.deepEqual(compact.player.carriedWeapons, [])
  assert.ok(compact.droppedItems.longsword)
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    const prompt = JSON.stringify(params.messages)
    assert.match(prompt, /droppedItems/)
    assert.equal(context.gameState.player.inventory.some(item => item.id === 'longsword'), false)
    return answer('La gardienne remarque que tu ne portes aucune arme.')
  })
  const next = await post(id, 'Bonjour, je viens discuter.')
  assert.equal(next.newGameState.player.inventory.some(item => item.id === 'longsword'), false)
})

test('deposit before a stealth move keeps the item at the departure cell and rolls once', async t => {
  const id = session(t)
  const initial = buildInitialGameState(); initial.sceneMemory = { doorStates: { front: 'open' } }
  await saveSession(id, { gameState: initial, history: [], adventureId: initial.adventureId })
  let round = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (++round === 1) return tool('drop_item', { itemId: 'longsword' })
    if (round === 2) {
      assert.equal(params.tool_choice, undefined)
      return tool('move_token', { tokenId: 'player', toCell: { x: 3, y: 6 }, stealth: true })
    }
    return answer('Tu laisses ton épée puis entres dans le quai ; tes pas résonnent.')
  })
  const data = await post(id, 'je pose mon épée puis rentre discrètement au quai')
  assert.deepEqual(data.newGameState.droppedItems.longsword.position, { x: 4, y: 13 })
  assert.deepEqual(data.newGameState.player.position, { x: 3, y: 6 })
  assert.equal(data.newGameState.combatLog.filter(entry => /Discrétion/.test(entry.action)).length, 1)
})

test('a scene marker cannot release the forced mechanical directive', async t => {
  const id = session(t)
  let round = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (++round === 1) return tool('trigger_room_event', { roomId: '1', eventType: 'enter' })
    if (round === 2) {
      assert.equal(params.tool_choice, undefined)
      return tool('move_token', { tokenId: 'player', toCell: { x: 11, y: 13 } })
    }
    return answer('Tu avances.')
  })
  await post(id, 'je vais en (11,13)')
})

test('the observed first-person MJ response is repaired before publication or persistence', async t => {
  const id = session(t)
  const bad = 'Je m’approche du vieux pommier et le regarde droit dans les yeux.'
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (context.operation === 'dm.repair_narration') {
      assert.equal(JSON.stringify(params.messages).includes(bad), false)
      assert.equal(params.tools, undefined)
      return answer('Les branches frémissent lorsque tu interpelles l’arbre. Une voix grave te répond.')
    }
    return answer(bad)
  })
  const result = await post(id, 'Je demande à cet arbre pourquoi il me fixe.')
  assert.match(result.narrative, /^Les branches/)
  assert.equal(JSON.stringify((await loadSession(id)).history).includes(bad), false)
  assert.match(buildStaticPrompt(), /jamais le personnage du joueur/)
})
