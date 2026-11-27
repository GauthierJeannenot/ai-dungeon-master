const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai',
  MONETIZATION_ENABLED: 'false', DM_RATE_LIMIT_PER_MINUTE: '0',
  APP_LOG_PERSIST_ENABLED: 'false', AI_DM_TEST_DICE_SEQUENCE: '20,1,1,16,4,20,1', LLM_MAX_CALLS_PER_REQUEST: '6' })
const pg = installPgMem()
const llm = require('../lib/dm/llm.ts')
const { POST } = require('../app/api/dm/route.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
test.after(() => pg.restore())
const tool = (name, input = {}) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `${name}-${Math.random()}`, name, input }] })
const text = value => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: value }] })

async function session(t, state = buildInitialGameState()) {
  const id = `doors-narration-${process.pid}-${Date.now()}-${Math.random()}`
  await saveSession(id, { gameState: state, history: [] })
  t.after(async () => { await closeMCPClient(id); await deleteSession(id) })
  return id
}
async function post(id, message) {
  const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: id, message }) }))
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  return data
}

test('the model chooses a door approach and MCP keeps the player on the current side', async t => {
  const state = buildInitialGameState(); state.player.position = { x: 11, y: 12 }; state.currentRoomId = '4'
  const id = await session(t, state)
  let count = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (++count === 1) {
      assert.equal(params.tool_choice, undefined)
      return tool('move_token', { tokenId: 'player', doorId: 'entry-apartment', doorMode: 'approach' })
    }
    const result = JSON.parse(params.messages.at(-1).content[0].content)
    assert.ok(result.narrationFacts.some(fact => /Franchissement de porte : NON/.test(fact)))
    return text('Tu rejoins la porte ouest et restes dans l’entrée.')
  })
  const data = await post(id, 'je me dirige vers la porte qui mène vers l’ouest')
  assert.deepEqual(data.newGameState.player.position, { x: 10, y: 10 })
  assert.equal(data.newGameState.currentRoomId, '4')
  assert.equal(data.newGameState.phase, 'exploration')
  assert.deepEqual(data.toolsUsed, ['move_token'])
  assert.deepEqual(data.newGameState.encountersTriggered, [])
})

test('rushing to smash the door moves first, rolls once at its authored DC, saves its state and does not cross', async t => {
  const id = await session(t)
  let count = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (++count === 1) {
      assert.equal(params.tool_choice, undefined)
      return tool('move_token', { tokenId: 'player', doorId: 'front', doorMode: 'approach' })
    }
    if (count === 2) {
      assert.equal(params.tool_choice, undefined)
      return tool('interact_door', { doorId: 'front', action: 'force' })
    }
    return text('Tu rejoins les portes et fracasses le bois pourri, sans entrer.')
  })
  const data = await post(id, 'je fonce vers la porte et la fracasse avec mon épée')
  assert.deepEqual(data.toolsUsed, ['move_token', 'interact_door'])
  assert.deepEqual(data.newGameState.player.position, { x: 11, y: 13 })
  assert.equal(data.newGameState.currentRoomId, '1')
  assert.equal(data.newGameState.sceneMemory.doorStates.front, 'broken')
  const rolls = data.newGameState.combatLog.filter(entry => /vs DD 14/.test(entry.mechanicalDetail ?? ''))
  assert.equal(rolls.filter(entry => /Test|Forcer/.test(entry.action)).length, 1)
  assert.equal((await loadSession(id)).gameState.sceneMemory.doorStates.front, 'broken')
})

test('explicit crossing approaches, opens and only then enters the opposite room', async t => {
  const state = buildInitialGameState(); state.player.position = { x: 11, y: 12 }; state.currentRoomId = '4'
  const id = await session(t, state)
  let count = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (++count === 1) return tool('move_token', { tokenId: 'player', doorId: 'entry-apartment', doorMode: 'approach' })
    if (count === 2) return tool('interact_door', { doorId: 'entry-apartment', action: 'open' })
    if (count === 3) {
      const opened = JSON.parse(params.messages.at(-1).content[0].content)
      assert.match(opened.sceneContext, /SALLES VOISINES/)
      assert.match(opened.sceneContext, /"roomId":"9"/)
      assert.match(opened.sceneContext, /"state":"open"/)
      assert.ok(!opened.sceneContext.includes('ÉTAT ACTUEL DU JEU'), 'append local room/perception context without duplicating the frozen state prompt')
      return tool('move_token', { tokenId: 'player', doorId: 'entry-apartment', doorMode: 'cross' })
    }
    if (count === 4) {
      const stopped = JSON.parse(params.messages.at(-1).content[0].content)
      assert.equal(stopped.stopReason, 'event_decision')
      assert.equal(stopped.goalReached, false)
      return tool('move_token', { tokenId: 'player', doorId: 'entry-apartment', doorMode: 'cross', acknowledgeEventIds: [stopped.stopEvent.id] })
    }
    return text('Tu ouvres puis franchis la porte ouest.')
  })
  const data = await post(id, 'je franchis la porte à l’ouest')
  assert.deepEqual(data.toolsUsed, ['move_token', 'interact_door'])
  assert.equal(data.newGameState.combatLog.filter(entry => /se deplace/.test(entry.action)).length, 2)
  assert.equal(data.newGameState.currentRoomId, '9')
  assert.deepEqual(data.newGameState.player.position, { x: 9, y: 10 })
})

test('a barred door stops after one refusal, without inventing a break-in or repeatedly forcing an open action', async t => {
  const id = await session(t)
  let count = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (context.operation === 'dm.final_narration') {
      assert.match(params.messages.at(-1).content, /DOOR_BARRED/)
      return text('Tu rejoins la porte, mais une barre empêche de l’ouvrir depuis ce côté. Tu ne franchis pas le seuil.')
    }
    assert.equal(context.operation, 'dm.turn')
    assert.ok(++count <= 2)
    return count === 1
      ? tool('move_token', { tokenId: 'player', doorId: 'front', doorMode: 'approach' })
      : tool('interact_door', { doorId: 'front', action: 'open' })
  })
  const data = await post(id, 'je franchis la porte extérieure')
  assert.equal(count, 2)
  assert.equal(data.newGameState.currentRoomId, '1')
  assert.equal(data.newGameState.combatLog.filter(entry => /Forcer/.test(entry.action)).length, 0)
  assert.match(data.narrative, /barre empêche/)
  assert.doesNotMatch(data.narrative, /ce tour de combat/)
})

test('the narrator directly receives the real hit, damage and final HP without a control call', async t => {
  const state = buildInitialGameState()
  state.phase = 'combat'; state.round = 1; state.currentTurn = 'player'; state.initiativeOrder = ['player', 'guard']
  state.monsters.guard = { id: 'guard', name: 'Garde', type: 'bandit', hp: { current: 30, max: 30 }, ac: 10,
    stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, position: { x: 5, y: 13 }, conditions: [], xpValue: 25, attackBonus: 4, damageDice: '1d6', speed: 30, isAlive: true }
  const id = await session(t, state)
  let count = 0
  const operations = []
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {
    operations.push(context.operation)

    assert.equal(context.operation, 'dm.turn')
    switch (++count) {
      case 1: return tool('resolve_player_attack', { targetId: 'guard', weaponOrSpell: 'longsword' })
      case 2: return tool('next_turn', { actorId: 'player' })
      case 3: return tool('run_monster_turns')
      default: {
        const result = JSON.parse(params.messages.at(-1).content[0].content)
        assert.ok(result.narrationFacts.some(fact => /Garde → toi : TOUCHE, 4 dégâts/.test(fact)), JSON.stringify(result))
        assert.ok(result.narrationFacts.some(fact => /16\/20 PV/.test(fact)))
        assert.match(JSON.stringify(params.system), /ne peut jamais/)
        return text('Ton épée touche. La lame du garde te blesse malgré ta cotte de mailles : tu perds 4 PV.')
      }
    }
  })
  const data = await post(id, 'Je frappe le garde.')
  assert.deepEqual(operations, ['dm.turn', 'dm.turn', 'dm.turn', 'dm.turn'])
  assert.equal(data.newGameState.player.hp.current, 16)
  assert.match(data.narrative, /perds 4 PV/)
  assert.equal((await loadSession(id)).history.at(-1).content, data.narrative)
  assert.deepEqual(data.toolsUsed, ['resolve_player_attack', 'next_turn', 'run_monster_turns'])
})

test('movement facts go straight into the next narration request with no extra LLM call', async t => {
  const id = await session(t)
  let count = 0
  const operations = []
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {
    operations.push(context.operation)

    assert.equal(context.operation, 'dm.turn')
    if (++count === 1) return tool('move_token', { tokenId: 'player', toCell: { x: 11, y: 13 } })
    const result = JSON.parse(params.messages.at(-1).content[0].content)
    assert.deepEqual(result.newPosition, { x: 11, y: 13 })
    assert.ok(result.narrationFacts.some(fact => /État final.*\(11,13\).*salle 1/.test(fact)))
    return text('Tu rejoins les abords de la porte en (11,13), toujours à l’extérieur.')
  })
  const data = await post(id, 'je vais en (11,13)')
  assert.deepEqual(operations, ['dm.turn', 'dm.turn'])
  assert.deepEqual(data.toolsUsed, ['move_token'])
  assert.equal((await loadSession(id)).history.at(-1).content, data.narrative)
})

function barnDoorState() {
  const state = buildInitialGameState('sarah-of-yellowcrest-manor')
  state.currentMapId = 'greenfast'; state.currentRoomId = '10'
  state.player.position = { x: 15, y: 12 }
  return state
}

test('forcing a door alone keeps exploration and explicitly tells the narrator that no combat or initiative exists', async t => {
  const id = await session(t, barnDoorState())
  let count = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    if (++count === 1) return tool('interact_door', { doorId: 'barn', action: 'force' })
    const result = JSON.parse(params.messages.at(-1).content[0].content)
    assert.equal(result.doorState, 'broken')
    assert.ok(result.narrationFacts.some(fact => /Phase confirmée : exploration.*Aucun combat actif.*n'annonce ni combat engagé, ni initiative lancée/.test(fact)))
    return text('Tu brises la porte et restes devant le seuil ouvert.')
  })
  const data = await post(id, 'Je force la double porte sans entrer.')
  assert.equal(count, 2, 'no additional verification model')
  assert.deepEqual(data.toolsUsed, ['interact_door'], 'no server-created encounter call')
  assert.equal(data.newGameState.phase, 'exploration')
  assert.deepEqual(data.newGameState.initiativeOrder, [])
  assert.deepEqual(data.newGameState.monsters, {})
  assert.deepEqual(data.newGameState.player.position, { x: 15, y: 12 })
})

test('an AI-requested encounter after forcing a door reaches the UI and SQL with the actual participants and initiative', async t => {
  const previousDice = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = '20,20,20,1,1'
  t.after(() => { process.env.AI_DM_TEST_DICE_SEQUENCE = previousDice })
  const { getAdventure, getAdventureScene } = require('../lib/adventures.ts')
  const { combatParticipants } = require('../lib/combat-participants.ts')
  const initial = barnDoorState()
  assert.ok(getAdventureScene(getAdventure(initial.adventureId), initial), 'illustrated exploration before combat')
  const id = await session(t, initial)
  let count = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    if (++count === 1) return tool('interact_door', { doorId: 'barn', action: 'force' })
    if (count === 2) {
      const result = JSON.parse(params.messages.at(-1).content[0].content)
      assert.equal(result.doorState, 'broken')
      return tool('start_encounter', { encounterId: 'barn_watch', playerCell: { x: 15, y: 12 } })
    }
    const result = JSON.parse(params.messages.at(-1).content[0].content)
    assert.equal(result.code, undefined, 'scene setup is allowed after the player action')
    assert.equal(result.combat.phase, 'combat')
    assert.equal(result.spawnedMonsters.length, 2, 'use the authored encounter, not three invented opponents')
    assert.ok(result.narrationFacts.some(fact => /Initiative confirmée par le moteur.*tour actuel : toi/.test(fact)))
    return text('La porte cède. Les deux ravisseurs engagent le combat ; tu gardes ta position devant le seuil et joues en premier.')
  })
  const data = await post(id, 'Je force la porte et défie les ravisseurs, sans entrer.')
  assert.equal(count, 3)
  assert.deepEqual(data.toolsUsed, ['interact_door', 'start_encounter'])
  assert.equal(data.newGameState.phase, 'combat')
  assert.equal(data.newGameState.currentTurn, 'player')
  assert.equal(data.newGameState.round, 1)
  assert.deepEqual(data.newGameState.player.position, { x: 15, y: 12 }, 'no implicit movement to the preset entry')
  assert.equal(combatParticipants(data.newGameState).hostileCount, 2)
  assert.equal(getAdventureScene(getAdventure(initial.adventureId), data.newGameState), undefined, 'UI switches to the tactical map')
  const stored = await loadSession(id)
  assert.deepEqual(stored.gameState.initiativeOrder, data.newGameState.initiativeOrder)
  assert.equal(stored.gameState.phase, 'combat')
})
