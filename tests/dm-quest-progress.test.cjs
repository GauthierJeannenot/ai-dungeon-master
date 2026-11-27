const assert = require('node:assert/strict')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

Object.assign(process.env, {
  LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai',
  MONETIZATION_ENABLED: 'false', LLM_MAX_CALLS_PER_REQUEST: '6', DM_RATE_LIMIT_PER_MINUTE: '0',
  APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
})
const pg = installPgMem()
const llm = require('../lib/dm/llm.ts')
const mcp = require('../lib/mcp-client.ts')
const { POST } = require('../app/api/dm/route.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { evaluateMapQuest } = require('../lib/adventure-map.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { buildStaticSystemBlocks, buildDynamicPrompt } = require('../lib/dm/prompts.ts')
const { getAdventureDefinition } = require('../lib/adventures.ts')

test.after(() => pg.restore())
const ADVENTURE = 'sarah-of-yellowcrest-manor'
const tool = (name, input) => ({ stop_reason: 'tool_use', content: [
  { type: 'tool_use', id: `call-${Math.random()}`, name, input },
] })
const text = value => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: value }] })

const lastResult = params => JSON.parse(params.messages.at(-1).content[0].content)

async function session(t, change = () => {}, history = []) {
  const id = `quest-progress-${process.pid}-${Date.now()}-${Math.random()}`
  t.after(async () => { await mcp.closeMCPClient(id); await deleteSession(id) })
  const state = buildInitialGameState(ADVENTURE, 'fighter')
  change(state)
  await saveSession(id, { gameState: state, history, adventureId: ADVENTURE, characterId: 'fighter' })
  return id
}
async function post(id, message) {
  const response = await POST(new Request('http://localhost/api/dm', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: id, message, adventureId: ADVENTURE, characterId: 'fighter' }),
  }))
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data))
  return data
}

for (const input of ['chat', 'book click']) {
  test(`reading the diary via ${input} reveals a neutral ghost through the agent and persists it`, async t => {
    const id = await session(t)
    assert.equal((await loadSession(id)).gameState.npcs.sarah.visible, false)
    const scene = getAdventureDefinition(ADVENTURE).scenes.candlekeep
    const message = input === 'chat' ? 'Je lis le livre.' : scene.hotspots.find(h => h.id === 'read_diary').message
    let rounds = 0
    t.mock.method(llm, 'createLlmMessage', async (params, context) => {

      assert.equal(context.operation, 'dm.turn')
      // The hidden ghost's lore cannot be required to understand the book:
      // its readable clues and final-response order must survive the tool call.
      const transcript = JSON.stringify(params)
      for (const clue of ['rue Delzorin', 'Malik et Janus', 'Tianna', 'tanneries', 'Faerl', 'rue Immar', 'sang bouillonnant', 'yeux à facettes']) {
        assert.ok(transcript.includes(clue), `missing readable diary clue: ${clue}`)
      }
      assert.ok(transcript.includes('résumé narratif en plusieurs paragraphes'))
      assert.ok(transcript.includes('puis l’apparition de Sarah'))
      assert.ok(transcript.includes('il ne raconte pas le meurtre de son autrice'))
      if (++rounds === 1) {
        assert.equal(context.gameState.npcs.sarah.visible, false)
        return tool('reveal_npc', { npcId: 'sarah', disposition: 'neutral', reason: 'Le héros lit le journal.' })
      }
      assert.equal((await loadSession(id)).gameState.npcs.sarah.visible, true)
      return text('À mesure que tu lis, une silhouette translucide apparaît au fond de la salle, près du vitrail. Ses lèvres remuent sans un son.')
    })
    const data = await post(id, message)
    assert.deepEqual(data.toolsUsed, ['reveal_npc'])
    assert.equal(data.newGameState.npcs.sarah.visible, true)
    assert.equal(data.newGameState.npcs.sarah.disposition, 'neutral')
    assert.ok(data.newGameState.droppedItems.sarah_diary_copy, 'reading does not collect the copy')
    assert.equal(evaluateMapQuest(data.newGameState, 'candlekeep', ADVENTURE).requiredDone, false)
    const saved = await loadSession(id)
    assert.equal(saved.gameState.npcs.sarah.visible, true, 'resuming keeps the apparition')
    assert.equal(saved.history.at(-1).content, data.narrative)
  })
}

test('accepting a mission records visible NPC trust before narration; taking its item remains a separate player choice', async t => {
  const id = await session(t)
  let stage = 'accept', rounds = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    if (++rounds === 1) {
      if (stage === 'accept') {
        const reveal = params.tools.find(tool => tool.name === 'reveal_npc')
        assert.match(reveal.description, /already-visible NPC/)
        return tool('reveal_npc', { npcId: 'sarah', disposition: 'helpful', reason: 'Mission explicitement acceptée.' })
      }
      return tool('pick_up_item', { itemId: 'sarah_diary_copy' })
    }
    const saved = (await loadSession(id)).gameState
    if (stage === 'accept') {
      assert.equal(saved.npcs.sarah.disposition, 'helpful')
      assert.equal(saved.player.inventory.some(item => item.id === 'sarah_diary_copy'), false)
      assert.ok(lastResult(params).narrationFacts.some(fact => /Disposition confirmée.*sarah.*helpful/.test(fact)))
      return text('Sarah accepte ton aide. La copie attend toujours sur la table ; souhaites-tu la prendre ?')
    }
    assert.equal(saved.player.inventory.filter(item => item.id === 'sarah_diary_copy').length, 1)
    assert.equal(saved.droppedItems.sarah_diary_copy, undefined)
    assert.ok(lastResult(params).narrationFacts.some(fact => /Inventaire confirmé.*sarah_diary_copy.*porté/.test(fact)))
    return text('Tu emportes la copie autorisée du journal.')
  })
  const accepted = await post(id, 'J’accepte de l’aider.')
  assert.deepEqual(accepted.toolsUsed, ['reveal_npc'])
  assert.equal(evaluateMapQuest(accepted.newGameState, 'candlekeep', ADVENTURE).requiredDone, false)
  stage = 'take'; rounds = 0
  const collected = await post(id, 'Je prends la copie du journal.')
  assert.deepEqual(collected.toolsUsed, ['pick_up_item'])
  assert.equal(evaluateMapQuest(collected.newGameState, 'candlekeep', ADVENTURE).requiredDone, true)
})

test('a missing quest prerequisite releases forced travel so the agent can explain the actual refusal once', async t => {
  const id = await session(t)
  let rounds = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    if (++rounds === 1) {
      assert.equal(params.tool_choice, undefined)
      return tool('travel_to_map', { transitionId: 'sail_to_waterdeep' })
    }
    assert.equal(rounds, 2, 'a refusal must not force six identical calls')
    assert.equal(params.tool_choice, undefined)
    const result = lastResult(params)
    assert.equal(result.code, 'MAP_QUEST_INCOMPLETE')
    assert.deepEqual(result.detail.missingObjectives.map(objective => objective.id), ['sarah_mission', 'diary_copy'])
    assert.match(result.actionRecovery, /REFUSÉ/)
    return text('Tu ne peux pas encore partir : il reste à rassurer Sarah sur sa mission et à prendre la copie du journal.')
  })
  const data = await post(id, 'Je pars pour Waterdeep.')
  assert.deepEqual(data.toolsUsed, ['travel_to_map'])
  assert.match(data.narrative, /rassurer Sarah.*copie/)
  assert.equal(data.newGameState.currentMapId, 'candlekeep')
  assert.equal(data.newGameState.npcs.sarah.disposition, 'neutral')
  assert.equal(data.newGameState.player.inventory.some(item => item.id === 'sarah_diary_copy'), false)
  assert.equal((await loadSession(id)).history.at(-1).content, data.narrative)
})

test('after refused travel the agent can record an explicitly requested prerequisite and then retry successfully', async t => {
  const id = await session(t, state => {
    state.player.inventory.push(state.droppedItems.sarah_diary_copy.item)
    delete state.droppedItems.sarah_diary_copy
  })
  let rounds = 0, system
  const realCall = mcp.callMCPTool, gameplay = []
  t.mock.method(mcp, 'callMCPTool', async (...args) => {
    if (!['get_game_state', 'replace_game_state'].includes(args[0])) gameplay.push(structuredClone(args.slice(0, 2)))
    return realCall(...args)
  })
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    system ??= params.system
    assert.deepEqual(params.system, system, 'recovery must not change the cached system')
    if (++rounds === 1) return tool('travel_to_map', { transitionId: 'sail_to_waterdeep' })
    assert.equal(params.tool_choice, undefined)
    if (rounds === 2) {
      assert.equal(lastResult(params).code, 'MAP_QUEST_INCOMPLETE')
      return tool('reveal_npc', { npcId: 'sarah', disposition: 'helpful', reason: 'Le joueur promet explicitement son aide.' })
    }
    if (rounds === 3) {
      assert.equal(context.gameState.npcs.sarah.disposition, 'helpful')
      return tool('travel_to_map', { transitionId: 'sail_to_waterdeep' })
    }
    assert.equal(rounds, 4)
    assert.equal(context.gameState.currentMapId, 'waterdeep')
    return text('Sarah reçoit ta promesse. Tu quittes Candlekeep pour Waterdeep avec la copie du journal.')
  })
  const data = await post(id, 'Je promets à Sarah de l’aider, puis je pars pour Waterdeep avec la copie que je porte.')
  assert.deepEqual(gameplay, [
    ['travel_to_map', { transitionId: 'sail_to_waterdeep' }],
    ['reveal_npc', { npcId: 'sarah', disposition: 'helpful', reason: 'Le joueur promet explicitement son aide.' }],
    ['travel_to_map', { transitionId: 'sail_to_waterdeep' }],
  ])
  assert.equal(data.newGameState.currentMapId, 'waterdeep')
  assert.ok(data.newGameState.mapOutcomes.candlekeep.objectivesDone.includes('sarah_mission'))
  assert.ok(data.newGameState.mapOutcomes.candlekeep.objectivesDone.includes('diary_copy'))
  assert.equal((await loadSession(id)).gameState.currentMapId, 'waterdeep')
})

test('quest progress changes only dynamic context, never the cached system', () => {
  const before = buildInitialGameState(ADVENTURE, 'fighter'), after = structuredClone(before)
  after.npcs.sarah.disposition = 'helpful'
  after.player.inventory.push(after.droppedItems.sarah_diary_copy.item)
  delete after.droppedItems.sarah_diary_copy
  const dynamicBefore = buildDynamicPrompt(before), dynamicAfter = buildDynamicPrompt(after)
  assert.match(dynamicBefore, /\[À FAIRE\].*"type":"npcDisposition","npcId":"sarah","disposition":"helpful"/)
  assert.match(dynamicBefore, /\[À FAIRE\].*"type":"itemInInventory","item":"sarah_diary_copy"/)
  assert.match(dynamicAfter, /\[FAIT\].*"type":"npcDisposition","npcId":"sarah","disposition":"helpful"/)
  assert.match(dynamicAfter, /\[FAIT\].*"type":"itemInInventory","item":"sarah_diary_copy"/)
  assert.deepEqual(buildStaticSystemBlocks(before), buildStaticSystemBlocks(after))
})

function atCobbler(state) {
  state.currentMapId = 'waterdeep'
  state.currentRoomId = '7'
  state.player.position = { x: 8, y: 14 }
  state.npcs.cobbler.disposition = 'offended'
}

for (const dc of [1, 30]) {
  test(`the agent records the residence after a social check (DC ${dc}), without requiring witness approval`, async t => {
    const id = await session(t, atCobbler)
    let rounds = 0, system
    const realCall = mcp.callMCPTool, gameplay = []
    t.mock.method(mcp, 'callMCPTool', async (...args) => {
      if (!['get_game_state', 'replace_game_state'].includes(args[0])) gameplay.push(structuredClone(args.slice(0, 2)))
      return realCall(...args)
    })
    t.mock.method(llm, 'createLlmMessage', async (params, context) => {

      system ??= params.system
      assert.deepEqual(params.system, system)
      if (++rounds === 1) return tool('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: 'cobbler', dc })
      const result = lastResult(params)
      assert.match(result.clueContext, /AVANT la narration finale, après le jet éventuel/)
      if (rounds === 2) {
        assert.equal(result.success, dc === 1)
        assert.match(result.clueContext, /"recorded":false/)
        assert.equal(context.gameState.worldFacts.some(fact => fact.clueId === 'greenfast_lead'), false)
        return tool('reveal_npc', { npcId: 'cobbler', disposition: 'offended', reason: 'Le cordonnier répond.' })
      }
      if (rounds === 3) {
        assert.match(result.clueContext, /"npcId":"cobbler","roomId":"7","visible":true,"present":true/)
        return tool('reveal_clue', { clueId: 'greenfast_lead', npcId: 'cobbler' })
      }
      assert.equal(rounds, 4)
      assert.match(result.clueContext, /"recorded":true/)
      assert.equal((await loadSession(id)).gameState.worldFacts.filter(fact => fact.clueId === 'greenfast_lead').length, 1)
      return text('Le cordonnier reste méfiant, mais te révèle que Faerl et Viallis résident à Greenfast. Tu connais maintenant la route.')
    })
    const data = await post(id, 'Je demande au cordonnier où vivent Faerl et Viallis.')
    assert.deepEqual(gameplay, [
      ['roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: 'cobbler', dc }],
      ['reveal_npc', { npcId: 'cobbler', disposition: 'offended', reason: 'Le cordonnier répond.' }],
      ['reveal_clue', { clueId: 'greenfast_lead', npcId: 'cobbler' }],
    ])
    assert.equal(data.newGameState.npcs.cobbler.disposition, 'offended')
    assert.equal(evaluateMapQuest(data.newGameState, 'waterdeep', ADVENTURE).requiredDone, true)
    assert.equal(data.newGameState.currentMapId, 'waterdeep', 'learning the road is not leaving the city')
  })
}

test('the agent can recover an omitted clue from established DM testimony when resuming, without another check', async t => {
  const id = await session(t, state => { atCobbler(state); state.npcs.cobbler.visible = true }, [
    { role: 'player', content: 'Où vivent-ils ?' },
    { role: 'dm', content: 'Le cordonnier te révèle que Faerl et Viallis résident à Greenfast, au sud-est de Waterdeep.' },
  ])
  let rounds = 0
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    if (++rounds === 1) return tool('reveal_clue', { clueId: 'greenfast_lead', npcId: 'cobbler' })
    return text('Tu connais déjà la route : Greenfast se trouve au sud-est de Waterdeep.')
  })
  const data = await post(id, 'Le cordonnier m’a indiqué la route, rappelle-moi où elle se trouve.')
  assert.deepEqual(data.toolsUsed, ['reveal_clue'])
  const saved = await loadSession(id)
  assert.equal(saved.gameState.worldFacts.filter(fact => fact.clueId === 'greenfast_lead').length, 1)
  assert.equal(saved.gameState.npcs.cobbler.disposition, 'offended')
})
