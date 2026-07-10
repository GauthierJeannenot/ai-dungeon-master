// Multi-map de bout en bout sur le binaire moteur compilé, via le premier
// module multi-maps du registre (fey-shadow-fair) : refus de voyage tant que
// la quête de map n'est pas remplie, effets du voyage (map courante, arrivée,
// compagnon, purge des monstres, mapOutcomes), sens unique, bornes par map,
// et survie des nouveaux champs au round-trip replace_game_state.

const test = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')

const ADVENTURE_ID = 'fey-shadow-fair'

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = result.content.find(c => c.type === 'text')?.text
  return text ? JSON.parse(text) : result
}

async function withEngine(fn) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, ADVENTURE_ID },
  })
  const client = new Client({ name: 'mcp-multimap-test', version: '1.0.0' })
  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close()
  }
}

// Remplit les deux objectifs REQUIS de la première map : rendre madame_bougie
// helpful (reveal_npc est scopé à la salle courante → aller salle 2 d'abord),
// puis visiter la salle 4 (tente).
async function completeFairRequiredQuest(client) {
  await callTool(client, 'move_token', { tokenId: 'player', toCell: { x: 7, y: 8 } })
  const reveal = await callTool(client, 'reveal_npc', { npcId: 'madame_bougie', disposition: 'helpful' })
  assert.ok(!reveal.error, `reveal_npc a échoué : ${JSON.stringify(reveal)}`)
  await callTool(client, 'move_token', { tokenId: 'player', toCell: { x: 3, y: 3 } })
}

// Acte l'amitié avec Barnabé (salle 3) : seul un compagnon HELPFUL traverse
// avec le joueur — un PNJ jamais abordé reste sur sa map.
async function befriendBarnabe(client) {
  await callTool(client, 'move_token', { tokenId: 'player', toCell: { x: 13, y: 10 } })
  const reveal = await callTool(client, 'reveal_npc', { npcId: 'barnabe', disposition: 'helpful' })
  assert.ok(!reveal.error, `reveal_npc barnabe a échoué : ${JSON.stringify(reveal)}`)
}

test('initial state starts on the first map with mapOutcomes empty', async () => {
  await withEngine(async client => {
    const state = await callTool(client, 'get_game_state')
    assert.equal(state.adventureId, ADVENTURE_ID)
    assert.equal(state.currentMapId, 'fair')
    assert.deepEqual(state.mapOutcomes, {})
    assert.equal(state.player.level, 3)
    // Les PNJ ont leur mapId (Barnabé sur la foire, le Prince dans le bois).
    assert.equal(state.npcs.barnabe.mapId, 'fair')
    assert.equal(state.npcs.prince_farces.mapId, 'wood')
  })
})

test('travel_to_map is refused while the required map quest is incomplete', async () => {
  await withEngine(async client => {
    const result = await callTool(client, 'travel_to_map', { toMapId: 'wood' })
    assert.equal(result.code, 'MAP_QUEST_INCOMPLETE')
    const missing = result.detail.missingObjectives.map(o => o.id).sort()
    assert.deepEqual(missing, ['charm_bougie', 'find_filou_trail'])
    // L'état n'a pas bougé.
    const state = await callTool(client, 'get_game_state')
    assert.equal(state.currentMapId, 'fair')
  })
})

test('travel_to_map is refused during combat even with the quest complete', async () => {
  await withEngine(async client => {
    await completeFairRequiredQuest(client)
    const started = await callTool(client, 'start_encounter', { encounterId: 'bonneteau_bouncers' })
    assert.ok(!started.error, `start_encounter a échoué : ${JSON.stringify(started)}`)
    const result = await callTool(client, 'travel_to_map', { toMapId: 'wood' })
    assert.equal(result.code, 'TRAVEL_DURING_COMBAT')
  })
})

test('travel applies arrival, companion transfer, monster purge and outcome (partial)', async () => {
  await withEngine(async client => {
    await completeFairRequiredQuest(client)
    // Barnabé devenu ami : il doit traverser (un PNJ neutre resterait).
    await befriendBarnabe(client)
    // Un monstre traîne sur la foire (spawné hors combat) : il doit être purgé.
    await callTool(client, 'spawn_monster', { monsterType: 'goblin', cell: { x: 8, y: 13 }, name: 'Badaud gobelin' })

    const travel = await callTool(client, 'travel_to_map', { toMapId: 'wood' })
    assert.ok(!travel.error, `travel_to_map a échoué : ${JSON.stringify(travel)}`)
    assert.equal(travel.fromMapId, 'fair')
    assert.equal(travel.toMapId, 'wood')
    // Quête partielle : les 2 requis sont faits, pas les 4 optionnels.
    assert.equal(travel.outcome.completion, 'partial')
    assert.ok(travel.outcome.objectivesDone.includes('find_filou_trail'))
    assert.ok(travel.outcome.objectivesDone.includes('charm_bougie'))
    assert.deepEqual(travel.companionsMoved, ['barnabe'])

    const state = await callTool(client, 'get_game_state')
    assert.equal(state.currentMapId, 'wood')
    assert.deepEqual(state.player.position, { x: 4, y: 21 })
    assert.equal(state.currentRoomId, '10')
    assert.deepEqual(state.monsters, {}, 'les monstres de la map quittée doivent être purgés')
    // Barnabé a traversé, adjacent à l'arrivée ; les autres PNJ restent.
    assert.equal(state.npcs.barnabe.mapId, 'wood')
    assert.equal(state.npcs.barnabe.roomId, '10')
    const dist = Math.max(
      Math.abs(state.npcs.barnabe.position.x - 4),
      Math.abs(state.npcs.barnabe.position.y - 21)
    )
    assert.ok(dist >= 1 && dist <= 3, `Barnabé mal placé : ${JSON.stringify(state.npcs.barnabe.position)}`)
    assert.equal(state.npcs.madame_bougie.mapId, 'fair')
    assert.equal(state.mapOutcomes.fair.completion, 'partial')
  })
})

test('a companion never befriended (non-helpful) stays on his map', async () => {
  await withEngine(async client => {
    // Quête requise remplie SANS jamais aborder Barnabé (il reste neutral).
    await completeFairRequiredQuest(client)
    const travel = await callTool(client, 'travel_to_map', { toMapId: 'wood' })
    assert.ok(!travel.error, `travel_to_map a échoué : ${JSON.stringify(travel)}`)
    assert.deepEqual(travel.companionsMoved, [], 'aucun compagnon ne doit traverser sans amitié actée')

    const state = await callTool(client, 'get_game_state')
    assert.equal(state.npcs.barnabe.mapId, 'fair', 'Barnabé jamais abordé doit rester à la foire')
    assert.equal(state.npcs.barnabe.roomId, '3')
  })
})

test('travel outcome is total when optional objectives are also done', async () => {
  await withEngine(async client => {
    await completeFairRequiredQuest(client)
    // Optionnel 1 : visiter le carrousel (salle 3).
    await callTool(client, 'move_token', { tokenId: 'player', toCell: { x: 13, y: 10 } })
    // Optionnel 2 : résoudre la rencontre des tire-goussets.
    const started = await callTool(client, 'start_encounter', { encounterId: 'fair_pickpockets' })
    assert.ok(!started.error, `start_encounter a échoué : ${JSON.stringify(started)}`)
    const ended = await callTool(client, 'end_combat', { force: true, reason: 'ils rendent tout' })
    assert.ok(!ended.error, `end_combat a échoué : ${JSON.stringify(ended)}`)
    // Optionnel 3 : consoler Miroslav (salle 9 — reveal_npc est scopé à la salle courante).
    await callTool(client, 'move_token', { tokenId: 'player', toCell: { x: 9, y: 2 } })
    const mime = await callTool(client, 'reveal_npc', { npcId: 'miroslav', disposition: 'helpful' })
    assert.ok(!mime.error, `reveal_npc miroslav a échoué : ${JSON.stringify(mime)}`)
    // Optionnel 4 : goûter aux réjouissances du Verger (salle 8).
    await callTool(client, 'move_token', { tokenId: 'player', toCell: { x: 14, y: 13 } })

    const travel = await callTool(client, 'travel_to_map', { toMapId: 'wood' })
    assert.ok(!travel.error, `travel_to_map a échoué : ${JSON.stringify(travel)}`)
    assert.equal(travel.outcome.completion, 'total')
  })
})

test('transitions are one-way and encounters are gated to their map', async () => {
  await withEngine(async client => {
    await completeFairRequiredQuest(client)
    await callTool(client, 'travel_to_map', { toMapId: 'wood' })

    // Aucune transition ne quitte le bois (carte finale).
    const back = await callTool(client, 'travel_to_map', { toMapId: 'fair' })
    assert.equal(back.code, 'NO_MAP_TRANSITION')

    // Une rencontre de la foire ne se déclenche pas depuis le bois.
    const wrongMap = await callTool(client, 'start_encounter', { encounterId: 'fair_pickpockets' })
    assert.equal(wrongMap.code, 'ENCOUNTER_WRONG_MAP')

    // Une rencontre du bois, elle, fonctionne.
    const ok = await callTool(client, 'start_encounter', { encounterId: 'blink_pack' })
    assert.ok(!ok.error, `start_encounter bois a échoué : ${JSON.stringify(ok)}`)
  })
})

test('movement bounds follow the current map grid', async () => {
  await withEngine(async client => {
    // Foire : 24×16 → (23,15) est valide.
    const onFair = await callTool(client, 'move_token', { tokenId: 'player', toCell: { x: 23, y: 15 } })
    assert.ok(!onFair.error, `move (23,15) sur la foire a échoué : ${JSON.stringify(onFair)}`)

    await completeFairRequiredQuest(client)
    await callTool(client, 'travel_to_map', { toMapId: 'wood' })

    // Bois : 16×24 → (23,15) est HORS bornes, (15,23) est valide.
    const outOfBounds = await callTool(client, 'move_token', { tokenId: 'player', toCell: { x: 23, y: 15 } })
    assert.equal(outOfBounds.code, 'INVALID_GRID_CELL')
    const inBounds = await callTool(client, 'move_token', { tokenId: 'player', toCell: { x: 15, y: 23 } })
    assert.ok(!inBounds.error, `move (15,23) dans le bois a échoué : ${JSON.stringify(inBounds)}`)
  })
})

test('currentMapId, mapOutcomes and npc mapId survive replace_game_state', async () => {
  await withEngine(async client => {
    await completeFairRequiredQuest(client)
    await befriendBarnabe(client)
    await callTool(client, 'travel_to_map', { toMapId: 'wood' })
    const before = await callTool(client, 'get_game_state')

    // Round-trip complet (la route DM fait exactement cela à chaque requête).
    await callTool(client, 'replace_game_state', { gameState: before })
    const after = await callTool(client, 'get_game_state')

    assert.equal(after.currentMapId, 'wood')
    assert.deepEqual(after.mapOutcomes, before.mapOutcomes)
    assert.equal(after.npcs.barnabe.mapId, 'wood')
    assert.equal(after.npcs.madame_bougie.mapId, 'fair')
    assert.equal(after.currentRoomId, before.currentRoomId)
  })
})

test('legacy state without multi-map fields falls back to the first map', async () => {
  await withEngine(async client => {
    const state = await callTool(client, 'get_game_state')
    // Simule un état historique : champs multi-map absents.
    delete state.currentMapId
    delete state.mapOutcomes
    for (const npc of Object.values(state.npcs)) delete npc.mapId

    await callTool(client, 'replace_game_state', { gameState: state })
    const after = await callTool(client, 'get_game_state')
    assert.equal(after.currentMapId, 'fair')
    assert.deepEqual(after.mapOutcomes, {})
  })
})
