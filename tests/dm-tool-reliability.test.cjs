const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

process.env.LLM_MODE = 'mock'
process.env.ALLOW_PAID_LLM = 'false'
process.env.LLM_PROVIDER = 'openai'
process.env.MONETIZATION_ENABLED = 'false'
process.env.LLM_MAX_STALLED_ITERATIONS = '3'
process.env.DM_RATE_LIMIT_PER_MINUTE = '0'
const pg = installPgMem()
const llm = require('../lib/dm/llm.ts')
const { POST } = require('../app/api/dm/route.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
const { loadSession, deleteSession } = require('../lib/session-store.ts')
test.after(() => pg.restore())

function text(value) { return { type: 'text', text: value } }
function toolCall(id, x) {
  return { type: 'tool_use', id, name: 'move_token', input: { tokenId: 'player', toCell: { x, y: 13 } } }
}
function answer(content, stop_reason = 'tool_use') { return { content, stop_reason } }

async function run(t, handler) {
  const sessionId = `reliability-${process.pid}-${Date.now()}`
  t.after(async () => { await closeMCPClient(sessionId); await deleteSession(sessionId) })
  let turn = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    return handler(params, context, ++turn)
  })
  const response = await POST(new Request('http://localhost/api/dm', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, message: 'je vais en (11,13)' }),
  }))
  return { response, data: await response.json(), sessionId }
}

test('a real engine rejection does not consume the primary action; pre-tool prose is discarded', async t => {
  const result = await run(t, (params, context, turn) => {
    if (turn === 1) return answer([text('Tu atteins déjà ta destination imaginaire.'), toolCall('bad', 999)])
    if (turn === 2) {
      assert.equal(params.tool_choice, undefined, 'the agent retains tool selection after a refusal')
      const last = params.messages.at(-1).content[0]
      assert.equal(last.is_error, true)
      assert.equal(typeof JSON.parse(last.content).error, 'string')
      assert.equal(JSON.stringify(params.messages).includes('destination imaginaire'), false)
      return answer([text('Tu gagnes aussi un trésor inventé.'), toolCall('good', 11)])
    }
    assert.equal(params.tool_choice, undefined)
    assert.deepEqual(context.gameState.player.position, { x: 11, y: 13 })
    assert.equal(JSON.stringify(params.messages).includes('trésor inventé'), false)
    return answer([text('Tu arrives à destination.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.deepEqual(result.data.newGameState.player.position, { x: 11, y: 13 })
  assert.equal(result.data.narrative, 'Tu arrives à destination.')
  assert.equal((await loadSession(result.sessionId)).history.at(-1).content, result.data.narrative)
})

test('exhausting rejected tools never invokes free narration or claims success', async t => {
  const result = await run(t, (params, context, turn) => {
    assert.equal(context.operation, 'dm.turn')
    assert.equal(params.tool_choice, undefined)
    return answer([text('Réussite inventée.'), toolCall(`bad-${turn}`, 999)])
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.match(result.data.narrative, /n’a pas pu être résolue/)
  assert.equal(result.data.narrative.includes('inventée'), false)
  assert.notEqual(result.data.newGameState.player.position.x, 999)
})

test('fallback narration retains successful results and refusals and excludes pre-tool claims', async t => {
  const result = await run(t, (params, context, turn) => {
    if (turn === 1) return answer([text('Faux résultat.'), toolCall('bad', 999)])
    if (turn === 2) return answer([toolCall('good', 11)])
    if (turn <= 5) return answer([toolCall(`duplicate-${turn}`, 12)])
    assert.equal(context.operation, 'dm.final_narration')
    assert.equal(params.tools, undefined)
    const results = params.messages.flatMap(m => Array.isArray(m.content) ? m.content : [])
      .filter(block => block.type === 'tool_result')
    assert.equal(results.length, 5)
    assert.equal(results[0].is_error, true)
    assert.equal(results[1].is_error, undefined)
    assert.equal(results[2].is_error, true)
    assert.equal(JSON.parse(results[2].content).code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
    assert.equal(JSON.stringify(params.messages).includes('Faux résultat'), false)
    return answer([text('Tu avances une seule fois.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.equal(result.data.narrative, 'Tu avances une seule fois.')
  assert.deepEqual(result.data.newGameState.player.position, { x: 11, y: 13 })
})

test('dialogue needs exactly one unforced DM call and cannot mutate engine state', async t => {
  let calls = 0
  const result = await run(t, (params, context) => {
    calls++
    assert.equal(context.operation, 'dm.turn')
    assert.equal(params.tool_choice, undefined)
    return answer([text('Tu peux préciser où tu souhaites aller.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.equal(calls, 1)
  assert.deepEqual(result.data.toolsUsed, [])
  assert.deepEqual(result.data.newGameState.player.position, { x: 4, y: 13 })
})

test('a truncated tool response never executes a partial action', async t => {
  const result = await run(t, () => answer([toolCall('partial', 11)], 'max_tokens'))
  assert.equal(result.response.status, 500)
  assert.match(result.data.error, /tronquée/)
  assert.equal(await loadSession(result.sessionId), null)
})

test('MCP isError with plain text from schema validation also allows a corrected retry', async t => {
  const result = await run(t, (params, _context, turn) => {
    if (turn === 1) return answer([toolCall('invalid-schema', -1)])
    if (turn === 2) {
      assert.equal(params.tool_choice, undefined)
      const last = params.messages.at(-1).content[0]
      assert.equal(last.is_error, true)
      assert.equal(JSON.parse(last.content).code, 'MCP_TOOL_ERROR')
      return answer([toolCall('corrected', 11)])
    }
    return answer([text('Déplacement effectué.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.deepEqual(result.data.newGameState.player.position, { x: 11, y: 13 })
})

test('the AI can search and read a rule before choosing its action without exhausting the stagnation allowance', async t => {
  let sectionId
  const result = await run(t, async (params, context, turn) => {
    assert.ok(params.tools.some(tool => tool.name === 'consult_rules'))
    if (turn <= 4) assert.equal(params.tool_choice, undefined)
    if (turn === 1) return answer([{ type: 'tool_use', id: 'search-rules', name: 'consult_rules', input: { query: 'surprise', book: 'phb-2014' } }])
    if (turn === 2) {
      const lookup = JSON.parse(params.messages.at(-1).content[0].content)
      sectionId = lookup.results[0].sectionId
      assert.equal(lookup.narrationFacts, undefined, 'book excerpts are not mechanical evidence')
      return answer([{ type: 'tool_use', id: 'read-rule', name: 'consult_rules', input: { sectionId } }])
    }
    if (turn === 3) {
      const passage = JSON.parse(params.messages.at(-1).content[0].content)
      assert.equal(passage.sectionId, sectionId)
      assert.match(passage.text, /can't move or take an action/)
      assert.deepEqual(context.gameState.player.position, { x: 4, y: 13 })
      assert.equal(await loadSession(context.sessionId), null, 'no mutation checkpoint for a reference lookup')
      return answer([toolCall('move-after-rule', 11)])
    }
    assert.equal(turn, 4, 'new successful resolutions let the agent continue beyond three iterations')
    assert.equal(params.tool_choice, undefined)
    return answer([text('Tu avances après vérification de la règle.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.deepEqual(result.data.toolsUsed, ['consult_rules', 'move_token'])
  assert.deepEqual(result.data.newGameState.player.position, { x: 11, y: 13 })
  assert.equal(result.data.narrative, 'Tu avances après vérification de la règle.')
})

test('one player action allows more than twelve sequential GM events while a second player action stays blocked', async t => {
  const result = await run(t, (params, context, turn) => {
    assert.equal(context.operation, 'dm.turn', 'progress must keep tools available until the GM finishes')
    if (turn === 1) return answer([toolCall('player-move', 11)])
    const last = JSON.parse(params.messages.at(-1).content[0].content)
    if (turn <= 14) {
      assert.equal(last.error, undefined)
      return answer([{ type: 'tool_use', id: `event-${turn}`, name: 'trigger_room_event', input: {
        roomId: context.gameState.currentRoomId, eventType: 'custom', description: `Conséquence distincte ${turn}`,
      } }])
    }
    if (turn === 15) return answer([toolCall('second-player-move', 12)])
    assert.equal(last.code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
    return answer([text('Tu avances ; les événements autour de toi sont résolus.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.ok(result.data.toolsUsed.includes('trigger_room_event'))
  assert.equal(result.data.toolsUsed.filter(name => name === 'move_token').length, 1)
  assert.deepEqual(result.data.newGameState.player.position, { x: 11, y: 13 })
  assert.equal(result.data.newGameState.combatLog.filter(entry => entry.mechanicalDetail?.startsWith('Conséquence distincte')).length, 13)
  assert.deepEqual((await loadSession(result.sessionId)).gameState, result.data.newGameState)
})

test('shared tools for other actors neither consume nor hit the player action limit', async t => {
  let actorId
  const result = await run(t, (params, context, turn) => {
    const last = turn > 1 ? JSON.parse(params.messages.at(-1).content[0].content) : null
    if (turn < 8 && last) assert.equal(last.error, undefined, JSON.stringify(last))
    if (turn === 1) return answer([{ type: 'tool_use', id: 'spawn', name: 'spawn_monster', input: {
      monsterType: 'bandit', cell: { x: 10, y: 13 }, name: 'Observateur',
    } }])
    if (turn === 2) {
      actorId = last.id
      assert.ok(actorId)
      return answer([{ type: 'tool_use', id: 'npc-check-before', name: 'roll_ability_check', input: { entityId: actorId, ability: 'wis', dc: 1 } }])
    }
    if (turn === 3) return answer([toolCall('player-move', 11)])
    if (turn === 4) return answer([{ type: 'tool_use', id: 'npc-move', name: 'move_token', input: { tokenId: actorId, toCell: { x: 9, y: 13 } } }])
    if (turn === 5) return answer([{ type: 'tool_use', id: 'npc-check-after', name: 'roll_ability_check', input: { entityId: actorId, ability: 'int', dc: 1 } }])
    if (turn === 6) return answer([{ type: 'tool_use', id: 'player-action-with-movement', name: 'roll_ability_check', input: { ability: 'wis', dc: 1 } }])
    if (turn === 7) return answer([{ type: 'tool_use', id: 'second-player-action', name: 'roll_ability_check', input: { ability: 'int', dc: 1 } }])
    assert.equal(last.code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
    return answer([text('Tu avances pendant que l’observateur réagit.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.deepEqual(result.data.newGameState.player.position, { x: 11, y: 13 })
  assert.deepEqual(result.data.newGameState.monsters[actorId].position, { x: 9, y: 13 })
  assert.equal(result.data.newGameState.combatLog.filter(entry => entry.action.startsWith('Observateur - Test')).length, 2)
  assert.equal(result.data.newGameState.combatLog.filter(entry => entry.action.startsWith('Héros - Test')).length, 1)
})

test('an explicit exceptional GM grant allows a second player action, but neither another grant nor a third action', async t => {
  const reason = 'Une ouverture fugace a été établie dans la scène.'
  const result = await run(t, (params, context, turn) => {
    const last = turn > 1 ? JSON.parse(params.messages.at(-1).content[0].content) : null
    if (turn === 1) return answer([toolCall('first-action', 11)])
    if (turn === 2) return answer([{ type: 'tool_use', id: 'exception', name: 'grant_player_action', input: { reason } }])
    if (turn === 3) {
      assert.equal(last.additionalPlayerAction, true)
      return answer([toolCall('second-action', 12)])
    }
    if (turn === 4) {
      assert.deepEqual(context.gameState.player.position, { x: 12, y: 13 })
      return answer([{ type: 'tool_use', id: 'repeat-exception', name: 'grant_player_action', input: { reason } }])
    }
    if (turn === 5) {
      assert.equal(last.code, 'ADDITIONAL_ACTION_ALREADY_GRANTED')
      return answer([toolCall('third-action', 13)])
    }
    assert.equal(last.code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
    return answer([text('Tu profites exceptionnellement de cette ouverture pour agir une seconde fois.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.deepEqual(result.data.newGameState.player.position, { x: 12, y: 13 })
  assert.equal(result.data.newGameState.combatLog.filter(entry => entry.action === 'player se deplace').length, 2)
  assert.equal((await loadSession(result.sessionId)).gameState.dmActionAllowance.reason, reason)
})

test('repeating an identical successful rule lookup cannot renew the stagnation allowance', async t => {
  let calls = 0
  const result = await run(t, (_params, context, turn) => {
    calls++
    assert.equal(context.operation, 'dm.turn')
    assert.ok(turn <= 4, 'one new result followed by three repetitions must stop')
    return answer([{ type: 'tool_use', id: `same-lookup-${turn}`, name: 'consult_rules', input: { query: 'surprise', book: 'phb-2014' } }])
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.equal(calls, 4)
  assert.match(result.data.narrative, /n’a pas pu être résolue/)
})

test('a rejected book lookup does not count as a refused game action or consume the primary action', async t => {
  const result = await run(t, (params, _context, turn) => {
    if (turn === 1) return answer([{ type: 'tool_use', id: 'bad-reference', name: 'consult_rules', input: { sectionId: 'phb-2014:999999' } }])
    if (turn === 2) {
      const last = params.messages.at(-1).content[0]
      assert.equal(last.is_error, true)
      assert.equal(JSON.parse(last.content).code, 'RULES_SECTION_NOT_FOUND')
      assert.equal(params.tool_choice, undefined)
      return answer([toolCall('move-without-reference', 11)])
    }
    return answer([text('Tu avances.')], 'end_turn')
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  assert.deepEqual(result.data.newGameState.player.position, { x: 11, y: 13 })
})
