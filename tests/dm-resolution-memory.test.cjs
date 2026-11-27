const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai',
  MONETIZATION_ENABLED: 'false', DM_RATE_LIMIT_PER_MINUTE: '0',
  APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error', LLM_MAX_CALLS_PER_REQUEST: '6', AI_DM_TEST_DICE_SEQUENCE: '1' })
const pg = installPgMem()
const llm = require('../lib/dm/llm.ts')
const { POST } = require('../app/api/dm/route.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const tool = (name, input = {}) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `${name}-${Math.random()}`, name, input }] })
const text = value => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: value }] })

const lastResult = params => JSON.parse(params.messages.at(-1).content[0].content)
const fact = description => tool('record_scene_fact', { description, cell: { x: 11, y: 13 } })

test.after(() => pg.restore())
async function session(t) {
  const state = buildInitialGameState()
  state.player.position = { x: 11, y: 13 }
  state.currentRoomId = '1'
  const id = `resolution-memory-${process.pid}-${Math.random()}`
  await saveSession(id, { gameState: state, history: [] })
  t.after(async () => { await closeMCPClient(id); await deleteSession(id) })
  return id
}
async function post(id, message) {
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: id, message }) }))
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  return data
}
async function assertNoFacts(id, data) {
  assert.deepEqual(data.newGameState.worldFacts ?? [], [])
  assert.deepEqual((await loadSession(id)).gameState.worldFacts ?? [], [])
  assert.equal(data.toolsUsed.includes('record_scene_fact'), false)
}

test('the agent chooses the atomic door tool directly, consuming exactly its own check', async t => {
  const previousDice = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = '20'
  t.after(() => { process.env.AI_DM_TEST_DICE_SEQUENCE = previousDice })
  const id = await session(t)
  let calls = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    switch (++calls) {
      case 1: return tool('interact_door', { doorId: 'front', action: 'force' })
      default:
        assert.equal(lastResult(params).check.success, true)
        assert.deepEqual(lastResult(params).check.roll.rolls, [20])
        return text('Tu forces la porte, sans franchir le seuil.')
    }
  })
  const data = await post(id, 'Je force la porte.')
  assert.deepEqual(data.toolsUsed, ['interact_door'])
  assert.equal(data.newGameState.sceneMemory?.doorStates?.front, 'broken')
  assert.equal(data.newGameState.combatLog.filter(entry => / - Forcer/.test(entry.action)).length, 1)
  await assertNoFacts(id, data)
})

test('a server-blocked second action cannot be bypassed with a memory in the same batch', async t => {
  const id = await session(t)
  let calls = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    switch (++calls) {
      case 1: return tool('roll_ability_check', { ability: 'str', skill: 'athletics', dc: 1 })
      case 2:
        assert.equal(lastResult(params).success, true)
        return { stop_reason: 'tool_use', content: [
          ...tool('interact_door', { doorId: 'front', action: 'force' }).content,
          ...fact('La porte est ouverte après un forçage réussi.').content,
        ] }
      default: {
        const results = params.messages.at(-1).content.map(result => JSON.parse(result.content))
        assert.equal(results[0].code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
        assert.equal(results[1].code, 'SCENE_FACT_UNCONFIRMED')
        return text('Ton test a réussi, mais la porte n’a pas été forcée.')
      }
    }
  })
  const data = await post(id, 'Je teste ma force.')
  assert.equal(data.newGameState.sceneMemory?.doorStates?.front, undefined)
  await assertNoFacts(id, data)
})

test('a confirmed successful check still permits a narrative consequence to be remembered', async t => {
  const id = await session(t)
  let calls = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    switch (++calls) {
      case 1: return tool('roll_ability_check', { ability: 'wis', skill: 'perception', dc: 1 })
      case 2:
        assert.equal(lastResult(params).success, true)
        return fact('Des traces de pas sont visibles dans la poussière.')
      default:
        assert.equal(lastResult(params).success, true)
        return text('Tu repères des traces dans la poussière.')
    }
  })
  const data = await post(id, 'Je cherche des traces.')
  assert.deepEqual(data.toolsUsed, ['roll_ability_check', 'record_scene_fact'])
  assert.equal(data.newGameState.worldFacts.length, 1)
  assert.equal((await loadSession(id)).gameState.worldFacts.length, 1)
})

{
  test('a failed generic check cannot be turned into a saved success', async t => {
    const id = await session(t)
    let calls = 0
    t.mock.method(llm, 'createLlmMessage', async (params, context) => {

      switch (++calls) {
        case 1: return tool('roll_ability_check', { ability: 'wis', skill: 'perception', dc: 99 })
        case 2:
          assert.equal(lastResult(params).success, false)
          return fact('Tu as découvert un passage secret derrière la porte.')
        default:
          assert.equal(lastResult(params).code, 'SCENE_FACT_UNCONFIRMED')
          return text('Tu ne découvres aucun passage.')
      }
    })
    await assertNoFacts(id, await post(id, 'Je cherche un passage caché.'))
  })
}

test('a failed atomic door check blocks a false memory in the same batch and on retries', async t => {
  const id = await session(t)
  let calls = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    switch (++calls) {
      case 1: return { stop_reason: 'tool_use', content: [
        ...tool('interact_door', { doorId: 'front', action: 'force' }).content,
        ...fact('La porte est maintenant ouverte.').content,
      ] }
      case 2: {
        const results = params.messages.at(-1).content.map(result => JSON.parse(result.content))
        assert.equal(results[0].check.success, false)
        assert.equal(results[1].code, 'SCENE_FACT_UNCONFIRMED')
        return fact('La porte est brisée et le passage est libre.')
      }
      default:
        assert.equal(lastResult(params).code, 'SCENE_FACT_UNCONFIRMED')
        return text('La porte résiste et reste fermée.')
    }
  })
  const data = await post(id, 'Je force la porte.')
  assert.equal(data.newGameState.sceneMemory.doorStates.front, 'closed')
  await assertNoFacts(id, data)
})

test('a refused movement blocks a memory of arrival', async t => {
  const id = await session(t)
  let calls = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    switch (++calls) {
      case 1: return tool('move_token', { tokenId: 'player', doorId: 'front', doorMode: 'cross' })
      case 2:
        assert.equal(lastResult(params).code, 'DOOR_CLOSED')
        return fact('Tu es entré derrière la porte.')
      default:
        assert.equal(lastResult(params).code, 'SCENE_FACT_UNCONFIRMED')
        return text('La porte fermée bloque ton passage.')
    }
  })
  const data = await post(id, 'Je franchis la porte.')
  assert.equal(data.newGameState.currentRoomId, '1')
  await assertNoFacts(id, data)
})

test('memory stays blocked after a refusal, then certain roleplay can be remembered on a later turn', async t => {
  const id = await session(t)
  let calls = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {
    assert.equal(context.operation, 'dm.turn')
    if (++calls === 1) return tool('move_token', { tokenId: 'player', doorId: 'front', doorMode: 'cross' })
    if (calls === 2) {
      assert.equal(lastResult(params).code, 'DOOR_CLOSED')
      return fact('La porte est ouverte.')
    }
    assert.equal(lastResult(params).code, 'SCENE_FACT_UNCONFIRMED')
    return text('Tu attends devant la porte fermée.')
  })
  await assertNoFacts(id, await post(id, 'Je franchis la porte.'))
  calls = 0
  t.mock.method(llm, 'createLlmMessage', async (_params, context) => {
    assert.equal(context.operation, 'dm.turn')
    if (++calls === 1) return fact('Une croix est tracée dans la poussière devant la porte.')
    return text('Tu traces une croix dans la poussière.')
  })
  const data = await post(id, 'Je trace une croix dans la poussière.')
  assert.equal(data.newGameState.worldFacts.length, 1)
  assert.equal((await loadSession(id)).gameState.worldFacts.length, 1)
})


test('an unavailable gameplay tool cannot be followed by a saved success invented through scene memory', async t => {
  const id = await session(t)
  let calls = 0
  t.mock.method(llm, 'createLlmMessage', async params => {
    switch (++calls) {
      case 1: return tool('invent_game_effect', { targetId: 'player' })
      case 2:
        assert.equal(lastResult(params).code, 'TOOL_UNAVAILABLE')
        return fact('La porte a été ouverte par cette action inconnue.')
      default:
        assert.equal(lastResult(params).code, 'SCENE_FACT_UNCONFIRMED')
        return text('Cette action n’a pas été exécutée et aucun effet n’a été enregistré.')
    }
  })
  const data = await post(id, 'Je demande cette action précise.')
  assert.deepEqual(data.toolsUsed, [])
  await assertNoFacts(id, data)
})
