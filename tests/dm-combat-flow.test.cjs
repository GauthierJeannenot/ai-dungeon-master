const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai',
  MONETIZATION_ENABLED: 'false', DM_RATE_LIMIT_PER_MINUTE: '0',
  APP_LOG_PERSIST_ENABLED: 'false', LLM_MAX_CALLS_PER_REQUEST: '6' })
const pg = installPgMem()
const llm = require('../lib/dm/llm.ts')
const { POST } = require('../app/api/dm/route.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
test.after(() => pg.restore())

function combatState(spent = false, hp = 20) {
  const state = buildInitialGameState()
  state.phase = 'combat'; state.round = spent ? 2 : 1
  state.currentTurn = 'player'; state.initiativeOrder = ['player', 'opponent']
  state.actionUsed = spent ? { player: true } : {}
  state.player.hp.current = 13
  state.monsters.opponent = { id: 'opponent', name: 'Négociateur', type: 'bandit',
    hp: { current: hp, max: hp }, ac: 10, stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    position: { x: 5, y: 13 }, conditions: [], xpValue: 25, attackBonus: 0, damageDice: '1d4', speed: 30, isAlive: true }
  return state
}
const tool = (name, input = {}) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name, input, id: `${name}-${Math.random()}` }] })
const text = value => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: value }] })

function results(params, name) {
  const calls = new Map(params.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
    .filter(block => block.type === 'tool_use').map(block => [block.id, block.name]))
  return params.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
    .filter(block => block.type === 'tool_result' && calls.get(block.tool_use_id) === name).map(block => JSON.parse(block.content))
}
async function session(t, state, sequence) {
  const id = `combat-flow-${process.pid}-${Date.now()}-${Math.random()}`
  const previous = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = sequence
  await saveSession(id, { gameState: state, history: [] })
  t.after(async () => {
    await closeMCPClient(id); await deleteSession(id)
    if (previous === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE
    else process.env.AI_DM_TEST_DICE_SEQUENCE = previous
  })
  return id
}
async function post(id, message) {
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: id, message }) }))
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  return data
}

test('the AI explicitly resumes a saved spent turn before the new negotiation', async t => {
  const id = await session(t, combatState(true), '1,20,1,20')
  let turns = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {
    assert.equal(context.operation, 'dm.turn', 'pending state is returned directly to the AI')
    assert.equal(params.tool_choice, undefined)
    switch (++turns) {
      case 1:
        assert.equal(context.gameState.actionUsed.player, true)
        return tool('next_turn', { actorId: 'player' })
      case 2: return tool('run_monster_turns')
      case 3:
        assert.equal(context.gameState.round, 3)
        return tool('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: 'opponent', dc: 6 })
      case 4:
        assert.equal(results(params, 'roll_ability_check')[0].success, true)
        return tool('end_combat', { force: true, reason: 'Accord après le test réussi.' })
      default: return text('Le négociateur accepte ta proposition. Le combat cesse.')
    }
  })
  const data = await post(id, 'Je propose au dernier adversaire de cesser le combat.')
  assert.equal(turns, 5)
  assert.equal(data.newGameState.phase, 'exploration')
  assert.deepEqual(data.toolsUsed, ['next_turn', 'run_monster_turns', 'roll_ability_check', 'end_combat'])
})

test('premature combat prose receives state feedback and the AI chooses the missing response tools', async t => {
  const id = await session(t, combatState(), '20,1,1,20,1,1,20,1')
  let turns = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    switch (++turns) {
      case 1: return tool('resolve_player_attack', { targetId: 'opponent', weaponOrSpell: 'longsword' })
      case 2: return text('Tu touches ; aucune riposte ne vient.')
      case 3:
        assert.match(params.messages.at(-1).content, /résolution mécanique/)
        assert.equal(params.tool_choice, undefined, 'the server does not select the next tool')
        return tool('next_turn', { actorId: 'player' })
      case 4: return tool('run_monster_turns')
      default:
        assert.equal(results(params, 'run_monster_turns')[0].turnsResolved, 1)
        return text('Ton épée touche. La riposte adverse te blesse malgré ton armure.')
    }
  })
  const data = await post(id, 'Je frappe mon adversaire.')
  assert.equal(turns, 5)
  assert.equal(data.newGameState.round, 2)
  assert.equal(data.newGameState.actionUsed.player, undefined)
  assert.ok(data.newGameState.player.hp.current < 13)
  assert.equal((await loadSession(id)).gameState.actionUsed.player, undefined)
  assert.match(data.narrative, /te blesse/)
})

test('the AI completes one failed negotiation without a second roll', async t => {
  const id = await session(t, combatState(), '1,1,20,1')
  let turns = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    switch (++turns) {
      case 1: return tool('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: 'opponent', dc: 6 })
      case 2:
        assert.equal(results(params, 'roll_ability_check')[0].success, false)
        return tool('next_turn', { actorId: 'player' })
      case 3: return tool('run_monster_turns')
      default: return text('Ton adversaire refuse et tente une attaque, sans te toucher.')
    }
  })
  const data = await post(id, 'Je tente de convaincre cet adversaire de se rendre.')
  assert.equal(data.newGameState.round, 2)
  assert.equal(data.toolsUsed.filter(name => name === 'roll_ability_check').length, 1)
})

test('a complete combat cycle cannot perform a second player attack', async t => {
  const id = await session(t, combatState(), '20,1,1,1,20,1')
  let turns = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (context.operation === 'dm.final_narration') return text('Tu touches et esquives la riposte.')
    switch (++turns) {
      case 1: return tool('resolve_player_attack', { targetId: 'opponent', weaponOrSpell: 'longsword' })
      case 2: return tool('next_turn', { actorId: 'player' })
      case 3: return tool('run_monster_turns')
      default: return tool('resolve_player_attack', { targetId: 'opponent', weaponOrSpell: 'longsword' })
    }
  })
  const data = await post(id, 'Je frappe mon adversaire une fois.')
  assert.equal(turns, 4)
  assert.equal(data.newGameState.monsters.opponent.hp.current, 15)
  assert.equal(data.toolsUsed.filter(name => name === 'resolve_player_attack').length, 1)
})

test('individually resolved monster events still hand control back to the human after one player action', async t => {
  const id = await session(t, combatState(), '20,1,1,1,20,1')
  let turns = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (context.operation === 'dm.final_narration') {
      assert.equal(results(params, 'resolve_player_attack').at(-1).code, 'COMBAT_RESPONSE_COMPLETE')
      return text('Tu touches et esquives la riposte.')
    }
    switch (++turns) {
      case 1: return tool('resolve_player_attack', { targetId: 'opponent', weaponOrSpell: 'longsword' })
      case 2: return tool('next_turn', { actorId: 'player' })
      case 3: return tool('resolve_attack', { attackerId: 'opponent', weaponOrSpell: 'attaque', targetId: 'player' })
      case 4:
        assert.equal(results(params, 'resolve_attack')[0].error, undefined)
        return tool('next_turn', { actorId: 'opponent' })
      default: return tool('resolve_player_attack', { targetId: 'opponent', weaponOrSpell: 'longsword' })
    }
  })
  const data = await post(id, 'Je frappe mon adversaire une fois.')
  assert.equal(turns, 5)
  assert.equal(data.newGameState.currentTurn, 'player')
  assert.equal(data.newGameState.round, 2)
  assert.equal(data.newGameState.monsters.opponent.hp.current, 15)
  assert.deepEqual(data.toolsUsed, ['resolve_player_attack', 'next_turn', 'resolve_attack'])
})

test('acting last retains the encounter order and returns control after one explicit monster turn without a second player action', async t => {
  const state = combatState()
  state.initiativeOrder = ['opponent', 'player']
  const id = await session(t, state, '1,1,20')
  let turns = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (context.operation === 'dm.final_narration') {
      assert.equal(results(params, 'resolve_player_attack').at(-1).code, 'COMBAT_RESPONSE_COMPLETE')
      return text('Ton attaque manque. Ton adversaire manque sa riposte ; à toi de choisir ta prochaine action.')
    }
    switch (++turns) {
      case 1: return tool('resolve_player_attack', { targetId: 'opponent', weaponOrSpell: 'longsword' })
      case 2: return tool('next_turn', { actorId: 'player' })
      case 3: return tool('run_monster_turns')
      default: return tool('resolve_player_attack', { targetId: 'opponent', weaponOrSpell: 'longsword' })
    }
  })
  const data = await post(id, 'Je frappe mon adversaire une fois.')
  assert.equal(turns, 4)
  assert.equal(data.newGameState.currentTurn, 'player')
  assert.equal(data.newGameState.round, 2)
  assert.deepEqual(data.newGameState.initiativeOrder, ['opponent', 'player'])
  assert.equal(data.newGameState.monsters.opponent.hp.current, 20)
  assert.equal(data.newGameState.actionUsed.player, undefined)
  assert.deepEqual(data.toolsUsed, ['resolve_player_attack', 'next_turn', 'run_monster_turns'])
  assert.equal(data.newGameState.player.hp.current, 13, 'the explicit monster turn used its real miss, not a new initiative roll')
  assert.equal((await loadSession(id)).gameState.round, 2)
})

test('the GM can explicitly grant a rare second player action before resolving the monster response', async t => {
  const id = await session(t, combatState(), '20,20,1,20,1')
  let turns = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    switch (++turns) {
      case 1: return tool('roll_ability_check', { ability: 'cha', dc: 1 })
      case 2: return tool('grant_player_action', { reason: 'Une diversion déjà établie permet une seconde tentative distincte.' })
      case 3:
        assert.equal(results(params, 'grant_player_action')[0].additionalPlayerAction, true)
        return tool('roll_ability_check', { ability: 'wis', dc: 1 })
      case 4: return tool('next_turn', { actorId: 'player' })
      case 5: return tool('run_monster_turns')
      default: return text('Tu profites de la diversion pour agir deux fois, puis esquives la riposte.')
    }
  })
  const data = await post(id, 'Je tente de négocier, puis de repérer une issue si une occasion le permet.')
  assert.equal(turns, 6)
  assert.equal(data.newGameState.round, 2)
  assert.equal(data.newGameState.combatLog.filter(entry => entry.action.startsWith('Héros - Test')).length, 2)
  assert.equal(data.newGameState.dmActionAllowance.granted, true)
})

test('a refused action is not retried by the server; the AI chooses the pending turn transitions', async t => {
  const id = await session(t, combatState(), '20,1,1,1,20,1')
  let turns = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    switch (++turns) {
      case 1: return tool('resolve_player_attack', { targetId: 'opponent', weaponOrSpell: 'longsword' })
      case 2: return tool('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: 'opponent', dc: 6 })
      case 3:
        assert.equal(results(params, 'roll_ability_check')[0].code, 'ACTION_ALREADY_USED')
        assert.equal(params.tool_choice, undefined)
        return tool('next_turn', { actorId: 'player' })
      case 4: return tool('run_monster_turns')
      default: return text('Ton attaque a occupé ce tour. La négociation n’a pas été tentée ; la riposte est résolue.')
    }
  })
  const data = await post(id, 'Je tente de négocier.')
  assert.equal(turns, 5)
  assert.equal(data.newGameState.round, 2)
  assert.equal(data.toolsUsed.filter(name => name === 'roll_ability_check').length, 1)
  assert.match(data.narrative, /n’a pas été tentée/)
})

test('the AI ends a won combat without any automatic server call or dead monster response', async t => {
  const id = await session(t, combatState(false, 1), '20,1,1')
  let turns = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    switch (++turns) {
      case 1: return tool('resolve_player_attack', { targetId: 'opponent', weaponOrSpell: 'longsword' })
      case 2: return text('Ton adversaire tombe.')
      case 3:
        assert.equal(context.gameState.phase, 'combat', 'no server-invented end_combat')
        return tool('end_combat', { force: false })
      default: return text('Ton adversaire tombe. Le combat est terminé.')
    }
  })
  const data = await post(id, 'Je frappe mon adversaire.')
  assert.equal(turns, 4)
  assert.equal(data.newGameState.phase, 'exploration')
  assert.deepEqual(data.toolsUsed, ['resolve_player_attack', 'end_combat'])
})

test('ending combat does not grant a second player action in the same message', async t => {
  const id = await session(t, combatState(false, 1), '20,1,1')
  let turns = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    switch (++turns) {
      case 1: return tool('resolve_player_attack', { targetId: 'opponent', weaponOrSpell: 'longsword' })
      case 2: return tool('end_combat', { force: false })
      case 3: return tool('roll_ability_check', { ability: 'wis', skill: 'perception', dc: 10 })
      default:
        assert.equal(results(params, 'roll_ability_check')[0].code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
        return text('Ton adversaire tombe. Le combat est terminé.')
    }
  })
  const data = await post(id, 'Je frappe mon adversaire.')
  assert.equal(data.newGameState.phase, 'exploration')
  assert.deepEqual(data.toolsUsed, ['resolve_player_attack', 'end_combat'])
})

test('a model refusing all continuation feedback never causes automatic turns or fabricated MCP calls', async t => {
  const id = await session(t, combatState(), '20,1,1')
  let turns = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (++turns === 1) return tool('resolve_player_attack', { targetId: 'opponent', weaponOrSpell: 'longsword' })
    return text('Le combat s’arrête sans riposte.')
  })
  const data = await post(id, 'Je frappe mon adversaire.')
  assert.equal(turns, 7, 'one resolved action followed by six stalled iterations')
  assert.deepEqual(data.toolsUsed, ['resolve_player_attack'])
  assert.equal(data.newGameState.round, 1)
  assert.equal(data.newGameState.actionUsed.player, true)
  assert.equal(data.newGameState.player.hp.current, 13)
  assert.match(data.narrative, /résolution du tour reste incomplète/)
  assert.doesNotMatch(data.narrative, /combat s’arrête/)
})
