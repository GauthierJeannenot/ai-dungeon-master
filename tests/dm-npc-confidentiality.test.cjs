const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

Object.assign(process.env, {
  LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai',
  MONETIZATION_ENABLED: 'false', DM_RATE_LIMIT_PER_MINUTE: '0',
  APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error', AI_DM_TEST_DICE_SEQUENCE: '4',
})
const pg = installPgMem()
const llm = require('../lib/dm/llm.ts')
const { POST } = require('../app/api/dm/route.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { buildDynamicPrompt, buildStaticPrompt } = require('../lib/dm/prompts.ts')
const { narrationEvidence } = require('../lib/dm/narration.ts')
const { getAdventureMap } = require('../lib/adventure-map.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { closeMCPClient } = require('../lib/mcp-client.ts')

test.after(() => pg.restore())
const adventureId = 'sarah-of-yellowcrest-manor'
const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: name, name, input }] })
const text = value => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: value }] })
const failedCheckGuidance = /Jet de caractéristique ÉCHOUÉ/

test('village objectives and innkeeper metadata do not disclose his private confidence off scene', () => {
  const state = buildInitialGameState(adventureId)
  Object.assign(state, { currentMapId: 'greenfast', currentRoomId: '10' })
  state.player.position = { x: 2, y: 11 }
  const map = getAdventureMap(adventureId)
  const objective = map.mapQuests.greenfast.objectives.find(o => o.id === 'fargo_promise')
  assert.deepEqual(objective.check, { type: 'npcDisposition', npcId: 'old_fargo', disposition: 'helpful' })
  assert.doesNotMatch(objective.label, /fils|vivant|Viallis/)
  assert.doesNotMatch(map.npcs.find(npc => npc.id === 'old_fargo').description, /fils|Viallis/)
  assert.doesNotMatch(buildDynamicPrompt(state), /son fils|fils vivant|fils suit|fils a suivi/)

  state.currentRoomId = '12'
  state.player.position = { x: 14, y: 7 }
  const detail = buildDynamicPrompt(state)
  assert.match(detail, /Confidences privées du MJ — ne pas raconter avant qu’il se confie/)
  assert.match(detail, /cet échec n’est pas une écoute patiente réussie/)
  assert.match(detail, /chemin public de la tour, qui reste accessible même sans confidence/)
})

test('the barn has a neutral label in the map and DM context', () => {
  const state = buildInitialGameState(adventureId)
  Object.assign(state, { currentMapId: 'greenfast', currentRoomId: '11' })
  state.player.position = { x: 7, y: 7 }
  const map = getAdventureMap(adventureId)
  assert.equal(map.rooms.find(room => room.id === '15').name, 'G5 — La grange')
  const system = buildStaticPrompt(adventureId)
  assert.doesNotMatch(system, /grange du culte|grange des ravisseurs/)
  const detail = buildDynamicPrompt(state)
  assert.match(detail, /Salle 15 : G5 — La grange/)
  assert.doesNotMatch(detail, /grange du culte|grange des ravisseurs/)
})

test('every adventure requires confirmed success before revealing any check-gated information, even before a roll', () => {
  for (const id of ['grammys-country-apple-pie', 'tide-crypt', 'fey-shadow-fair', adventureId]) {
    const prompt = buildStaticPrompt(id)
    assert.match(prompt, /Informations soumises à un jet — règle générale/)
    assert.match(prompt, /ne révèle JAMAIS une information.*tant que l'outil n'a pas confirmé la réussite du jet correspondant/)
    assert.match(prompt, /perception, fouille, enquête, connaissances, intuition, interaction sociale ou autre test/)
    assert.match(prompt, /Avant le jet, sans jet ou après un échec, l'information reste inconnue/)
    assert.match(prompt, /Une réussite ne révèle que les informations correspondant à l'action résolue/)
    assert.match(prompt, /jamais le contenu d'une confidence refusée, même en bilan, en option de dialogue ou sous une négation/)
    assert.match(prompt, /Un aparté antérieur de ce genre n'est pas une découverte/)
    assert.match(prompt, /accessibles sans jet ou malgré l'échec.*n'invente pas de jet pour les bloquer/)
  }
})

test('the logged failed Persuasion sends confidentiality guidance directly to the narrator, without another model call', async t => {
  // The logged hero was the default fighter; calling himself a bard in his
  // message does not change his mechanical character or grant expertise.
  const state = buildInitialGameState(adventureId)
  Object.assign(state, { currentMapId: 'greenfast', currentRoomId: '12' })
  state.player.position = { x: 14, y: 7 }
  state.roomsVisited = ['10', '12']
  state.npcs.old_fargo.visible = true
  const id = `npc-confidentiality-${process.pid}-${Date.now()}`
  await saveSession(id, { gameState: state, history: [] })
  t.after(async () => { await closeMCPClient(id); await deleteSession(id) })
  let rounds = 0
  const operations = []
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {
    operations.push(context.operation)

    if (++rounds === 1) return tool('roll_ability_check', {
      ability: 'cha', dc: 13, entityId: 'player', label: 'Persuasion', skill: 'persuasion', targetId: 'old_fargo',
      roleplayBonus: 2, roleplayReason: 'Le héros se présente comme un conteur curieux des histoires locales.',
    })
    const result = JSON.parse(params.messages.at(-1).content[0].content)
    assert.equal(result.success, false)
    assert.equal(result.roll.total, 6)
    assert.ok(result.narrationFacts.some(fact => failedCheckGuidance.test(fact)))
    assert.ok(result.narrationFacts.some(fact => /ne cite jamais le contenu d'une confidence refusée/.test(fact)))
    assert.ok(result.narrationFacts.some(fact => /indices explicitement accessibles malgré l'échec/.test(fact)))
    return text('Le tavernier secoue la tête et reprend son verre à essuyer. « Je n’ai rien à raconter. » Tu restes au comptoir, sans obtenir de confidence.')
  })
  const response = await POST(new Request('http://localhost/api/dm', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: id, message: "je suis un barde, je parcours le pays a la recherche d'histoire qui peuvent m'inspirer, j'adore les histoires de villages" }),
  }))
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  assert.deepEqual(data.toolsUsed, ['roll_ability_check'])
  assert.deepEqual(operations, ['dm.turn', 'dm.turn'])
  assert.equal(data.newGameState.npcs.old_fargo.disposition, 'neutral')
  assert.equal((await loadSession(id)).history.at(-1).content, data.narrative)
})

test('a successful check or failed attack does not get misreported as a failed ability check', () => {
  const state = buildInitialGameState(adventureId)
  for (const call of [
    { tool: 'roll_ability_check', result: { success: true } },
    { tool: 'resolve_player_attack', result: { success: false } },
  ]) assert.ok(narrationEvidence(state, state, [call]).every(fact => !failedCheckGuidance.test(fact)))
})
