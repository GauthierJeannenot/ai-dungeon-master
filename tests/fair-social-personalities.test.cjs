const test = require('node:test')
const assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
process.env.MONETIZATION_ENABLED = 'false'
const pg = installPgMem()
const { getAdventureMap, evaluateMapQuest } = require('../lib/adventure-map.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { socialActors, initializeSocialPersonalities, SocialProfileSchema } = require('../lib/social.ts')
const { buildDynamicPrompt } = require('../lib/dm/prompts.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
test.after(() => pg.restore())

const adventureId = 'fey-shadow-fair'
const fresh = seed => initializeSocialPersonalities(buildInitialGameState(adventureId), seed)
const profile = (state, id = 'nicodeme') => socialActors(state).find(actor => actor.targetId === id).profile
const approvedIds = getAdventureMap(adventureId).npcs.map(npc => npc.id)
const callEngine = async t => {
  const call=await engine(t,{adventureId,dice:'13,13,13'})
  return call
}

test('the approved ticketer profile fixes role, ideal, bond, signature traits', () => {
  const social = getAdventureMap(adventureId).social
  const fixed = SocialProfileSchema.parse(social.npcs.nicodeme)
  assert.equal(fixed.influenceable, true)
  assert.deepEqual(fixed.goals, ['Contrôler les entrées et faire respecter les usages de la foire'])
  assert.deepEqual(fixed.personality, {
    ideals: ['Tout le monde peut s’amuser, à condition de jouer le jeu.'],
    bonds: ['La foire et son poste de billettiste, dont il est fier.'],
    traits: ['Feint la surdité.', 'Procède avec une lenteur cérémonieuse.', 'Pratique un humour pince-sans-rire.'],
  })
  assert.deepEqual(social.tables.ticketer_likes.entries, ['Vieilles histoires', 'Devinettes', 'Objets anciens', 'Traditions féeriques'])
  assert.deepEqual(social.tables.ticketer_dislikes.entries, ['Moqueries sur son âge', 'Impatience', 'Interruptions', 'Mépris de son métier'])
})

test('the approved hostess keeps her role, ideal, bonds, traits and two aversions fixed', () => {
  const social = getAdventureMap(adventureId).social
  const fixed = SocialProfileSchema.parse(social.npcs.madame_bougie)
  assert.equal(fixed.influenceable, true)
  assert.deepEqual(fixed.goals, ['Préserver la foire et aider les visiteurs bienveillants'])
  assert.deepEqual(fixed.personality, {
    ideals: ['La bonté se prouve par des actes.'],
    bonds: ['La foire, ses forains et ses chandelles-souvenirs.'],
    traits: ['Chaleureuse et maternelle.', 'Perspicace.', 'Possède une répartie piquante.'],
  })
  assert.deepEqual(fixed.tabooTopics, ['Flagornerie grossière', 'Désordre violent'])
  assert.deepEqual(fixed.randomize, { likedTopics: 'candlekeeper_likes' })
  assert.deepEqual(social.tables.candlekeeper_likes.entries, ['Souvenirs heureux', 'Artisanat', 'Histoires de voyage', 'Petites attentions'])
})

test('the approved companion keeps fixed personality and one randomized interest', () => {
  const social = getAdventureMap(adventureId).social
  const fixed = SocialProfileSchema.parse(social.npcs.barnabe)
  assert.equal(fixed.influenceable, true)
  assert.deepEqual(fixed.goals, ['Découvrir le Bois-Ricanant avec un compagnon de voyage'])
  assert.deepEqual(fixed.personality, {
    ideals: ['Avoir des racines n’oblige pas à rester immobile.'],
    bonds: ['Son pot, sa petite maison, et ceux qui le considèrent comme un compagnon.'],
    traits: ['Curieux et enthousiaste.', 'Naïf et bavard.', 'S’émerveille facilement.'],
  })
  assert.deepEqual(fixed.tabooTopics, ['Abandon', 'Le traiter comme un objet'])
  assert.deepEqual(fixed.randomize, { likedTopics: 'shrub_likes' })
  assert.deepEqual(social.tables.shrub_likes.entries, ['Grandes forêts', 'Voyages', 'Animaux étranges', 'Récits d’aventure'])
})

test('all fourteen fair NPCs have complete fixed personalities and valid campaign taste tables', () => {
  const social = getAdventureMap(adventureId).social
  assert.equal(approvedIds.length, 14)
  assert.equal(Object.keys(social.npcs).length, 14)
  for (const id of approvedIds) {
    const spec = SocialProfileSchema.parse(social.npcs[id])
    assert.equal(spec.influenceable, true)
    assert.ok(spec.goals.length)
    for (const field of ['ideals', 'bonds', 'traits']) assert.ok(spec.personality[field].length)
    assert.deepEqual(Object.keys(spec.randomize).sort(), id === 'nicodeme' ? ['likedTopics', 'tabooTopics'] : ['likedTopics'])
    for (const tableId of Object.values(spec.randomize)) {
      const table = social.tables[tableId]
      assert.ok(table, `${id}: ${tableId}`)
      assert.equal(table.entries.length, 4)
      assert.equal(new Set(table.entries).size, 4)
      assert.ok(table.entries.every(entry => entry.trim()))
    }
  }
  assert.deepEqual(social.npcs.pipotin.personality, {
    ideals: ['Un talent mérite d’être reconnu.'],
    bonds: ['La baraque de bonneteau et son statut d’apprenti de Maître Filou.'],
    traits: ['Vantard et théâtral.', 'Rusé et susceptible.', 'Sensible aux compliments sincères.'],
  })
})

test('only approved NPCs receive their selected draws without randomizing any fixed personality fields', () => {
  const social = getAdventureMap(adventureId).social
  const state = fresh('first-fair-game')
  assert.deepEqual(Object.keys(state.socialPersonalities).filter(id => approvedIds.includes(id)), approvedIds)
  assert.deepEqual(Object.keys(state.socialPersonalities.nicodeme).sort(), ['likedTopics', 'tabooTopics'])
  const actual = profile(state)
  assert.equal(actual.likedTopics.length, 1)
  assert.equal(actual.tabooTopics.length, 1)
  assert.ok(social.tables.ticketer_likes.entries.includes(actual.likedTopics[0]))
  assert.ok(social.tables.ticketer_dislikes.entries.includes(actual.tabooTopics[0]))
  assert.deepEqual(actual.personality, social.npcs.nicodeme.personality)
  assert.deepEqual(actual.goals, social.npcs.nicodeme.goals)
  assert.deepEqual(Object.keys(state.socialPersonalities.madame_bougie), ['likedTopics'])
  const hostess = profile(state, 'madame_bougie')
  assert.equal(hostess.likedTopics.length, 1)
  assert.ok(social.tables.candlekeeper_likes.entries.includes(hostess.likedTopics[0]))
  assert.deepEqual(hostess.personality, social.npcs.madame_bougie.personality)
  assert.deepEqual(hostess.tabooTopics, ['Flagornerie grossière', 'Désordre violent'])
  assert.deepEqual(Object.keys(state.socialPersonalities.barnabe), ['likedTopics'])
  const companion = profile(state, 'barnabe')
  assert.equal(companion.likedTopics.length, 1)
  assert.ok(social.tables.shrub_likes.entries.includes(companion.likedTopics[0]))
  assert.deepEqual(companion.personality, social.npcs.barnabe.personality)
  assert.deepEqual(companion.tabooTopics, ['Abandon', 'Le traiter comme un objet'])
  for (const [id, spec] of Object.entries(social.npcs)) {
    const actual = profile(state, id)
    assert.deepEqual(actual.personality, spec.personality)
    assert.deepEqual(actual.goals, spec.goals)
    assert.equal(actual.likedTopics.length, 1)
    assert.ok(social.tables[spec.randomize.likedTopics].entries.includes(actual.likedTopics[0]))
    assert.deepEqual(Object.keys(state.socialPersonalities[id]).sort(), Object.keys(spec.randomize).sort())
    if (id !== 'nicodeme') assert.deepEqual(actual.tabooTopics, spec.tabooTopics)
  }
})

test('new seeds vary tastes, while reinitialization keeps saved tastes and every fixed personality field', () => {
  const first = fresh('first-fair-game'), saved = structuredClone(first)
  initializeSocialPersonalities(first, 'unused-replacement-seed')
  assert.deepEqual(first, saved)
  const drawn = Object.fromEntries(approvedIds.map(id => [id, new Set()]))
  for (let index = 0; index < 16; index++) {
    const state = fresh(`fair-game-${index}`)
    for (const id of approvedIds) {
      const actual = profile(state, id)
      assert.deepEqual(actual.personality, profile(first, id).personality)
      assert.deepEqual(actual.goals, profile(first, id).goals)
      drawn[id].add(JSON.stringify(state.socialPersonalities[id]))
    }
    assert.deepEqual(profile(state, 'madame_bougie').tabooTopics, ['Flagornerie grossière', 'Désordre violent'])
    assert.deepEqual(profile(state, 'barnabe').tabooTopics, ['Abandon', 'Le traiter comme un objet'])
  }
  for (const id of approvedIds) assert.ok(drawn[id].size > 1)
})

test('fresh actual fair sessions have new seeds, correct NPC values and untouched gameplay dice', async t => {
  const first = await callEngine(t), second = await callEngine(t)
  const a = await first('get_game_state'), b = await second('get_game_state')
  assert.notEqual(a.socialProfileSeed, b.socialProfileSeed)
  assert.deepEqual(Object.keys(a.socialPersonalities).filter(id => approvedIds.includes(id)), approvedIds)
  for (const id of approvedIds) assert.deepEqual(profile(a, id).personality, profile(b, id).personality)
  assert.equal(ok(await first('roll_dice', { notation: '1d20' })).total, 13)
  assert.equal(ok(await second('roll_dice', { notation: '1d20' })).total, 13)
})

test('the ticketer tastes and personality survive Postgres and restoration into another engine', async t => {
  const first = await callEngine(t), second = await callEngine(t)
  const before = await first('get_game_state')
  const favorite = profile(before).likedTopics[0]
  const saved = await first('get_game_state'), id = `fair-personality-${process.pid}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: saved, history: [] })
  ok(await second('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  const restored = await second('get_game_state')
  assert.equal(restored.socialProfileSeed, saved.socialProfileSeed)
  assert.deepEqual(restored.socialPersonalities, saved.socialPersonalities)
  assert.deepEqual(profile(restored), profile(saved))
  for (const id of approvedIds) assert.deepEqual(profile(restored, id), profile(saved, id))
  const prompt = buildDynamicPrompt(restored)
  assert.match(prompt, /"targetId":"nicodeme"/)
  assert.ok(prompt.includes(favorite))
  assert.doesNotMatch(prompt, /"socialPersonalities"|"socialProfileSeed"/)
  assert.ok(!prompt.includes(saved.socialProfileSeed))
  assert.doesNotMatch(prompt, /"targetId":"maitre_filou"|"targetId":"prince_farces"|"targetId":"miroslav"/)
})

test('hostess personality and favorite topic survive restart without granting her portal agreement', async t => {
  const first = await callEngine(t), second = await callEngine(t)
  const before = await first('get_game_state')
  before.player.position = { ...before.npcs.madame_bougie.position }
  ok(await first('replace_game_state', { gameState: before }))
  const favorite = profile(before, 'madame_bougie').likedTopics[0]
  const saved = await first('get_game_state'), id = `hostess-personality-${process.pid}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: saved, history: [] })
  ok(await second('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  const restored = await second('get_game_state')
  assert.deepEqual(restored.socialPersonalities, saved.socialPersonalities)
  assert.equal(restored.socialProfileSeed, saved.socialProfileSeed)
  assert.deepEqual(profile(restored, 'madame_bougie'), profile(saved, 'madame_bougie'))
  assert.equal(restored.npcs.madame_bougie.disposition, 'neutral')
  assert.equal(evaluateMapQuest(restored, 'fair', adventureId).objectives.find(objective => objective.id === 'charm_bougie').done, false)
})

for (const agrees of [false, true]) test(`the companion keeps the standard DC and travel requires explicit agreement (${agrees})`, async t => {
  const call = await callEngine(t), resume = await callEngine(t)
  const state = await call('get_game_state')
  const favorite = profile(state, 'barnabe').likedTopics[0]
  state.player.position = { ...state.npcs.barnabe.position }
  ok(await call('replace_game_state', { gameState: state }))
  const check = ok(await call('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: 'barnabe', dc: 10 }))
  assert.equal(check.social.dcModifier, 0)
  assert.equal(check.dc, 10)
  assert.equal(check.success, true)
  assert.equal((await call('get_game_state')).npcs.barnabe.disposition, 'neutral', 'A successful check alone does not establish the companion agreement')
  if (agrees) ok(await call('reveal_npc', { npcId: 'barnabe', disposition: 'helpful', reason: 'Le joueur accepte explicitement de l’emmener.' }))
  const departure = await call('get_game_state')
  departure.roomsVisited = [...new Set([...departure.roomsVisited, '4'])]
  departure.npcs.madame_bougie.disposition = 'helpful'
  ok(await call('replace_game_state', { gameState: departure }))
  const travel = ok(await call('travel_to_map', { toMapId: 'wood' }))
  assert.deepEqual(travel.companionsMoved, agrees ? ['barnabe'] : [])
  const saved = await call('get_game_state'), id = `shrub-personality-${process.pid}-${agrees}`
  assert.equal(saved.npcs.barnabe.mapId, agrees ? 'wood' : 'fair')
  assert.equal(profile(saved, 'barnabe').likedTopics[0], favorite)
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: saved, history: [] })
  ok(await resume('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  const restored = await resume('get_game_state')
  assert.equal(restored.npcs.barnabe.mapId, agrees ? 'wood' : 'fair')
  assert.deepEqual(profile(restored, 'barnabe'), profile(saved, 'barnabe'))
  assert.deepEqual(restored.socialPersonalities.barnabe, saved.socialPersonalities.barnabe)
})

test('the barkers failed optional negotiation cannot remove the main lead or fabricate a payment', async t => {
  const call = await callEngine(t)
  const state = await call('get_game_state')
  state.player.position = { ...state.npcs.pipotin.position }
  state.player.stats.cha = 10
  ok(await call('replace_game_state', { gameState: state }))
  const before = await call('get_game_state')
  assert.equal(evaluateMapQuest(before, 'fair', adventureId).objectives.find(objective => objective.id === 'find_filou_trail').done, true)
  const check = ok(await call('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: 'pipotin', dc: 14 }))
  assert.equal(check.dc, 14)
  assert.equal(check.success, false)
  const favorite = profile(before, 'pipotin').likedTopics[0]
  const after = await call('get_game_state')
  assert.equal(evaluateMapQuest(after, 'fair', adventureId).objectives.find(objective => objective.id === 'find_filou_trail').done, true)
  assert.deepEqual(after.player.inventory, before.player.inventory)
  assert.equal(after.npcs.pipotin.disposition, 'wary')
})

test('the mime and tea maker retain their mandatory communication styles in local guidance', () => {
  const state = fresh('communication-styles')
  state.currentRoomId = '9'; state.player.position = { ...state.npcs.miroslav.position }
  let prompt = buildDynamicPrompt(state)
  assert.match(prompt, /Il ne prononce aucune réplique/)
  assert.ok(profile(state, 'miroslav').personality.traits.some(trait => trait.includes('Ne parle jamais')))
  state.currentRoomId = '7'; state.player.position = { ...state.npcs.theophile.position }
  prompt = buildDynamicPrompt(state)
  assert.match(prompt, /Il parle toujours en rimes approximatives/)
  assert.ok(profile(state, 'theophile').personality.traits.includes('Parle uniquement en rimes approximatives.'))
})

test('a favorite topic cannot reveal the prince, finish the final objective, grant gifts or start combat', async t => {
  const call = await callEngine(t)
  const state = await call('get_game_state')
  state.currentMapId = 'wood'; state.player.position = { ...state.npcs.prince_farces.position }
  ok(await call('replace_game_state', { gameState: state }))
  const before = await call('get_game_state')
  assert.equal(before.npcs.prince_farces.visible, false)
  ok(await call('begin_social_interaction', { eventId: 'prince-conversation', interactionId: 'prince-talk', targetId: 'prince_farces', attitude: 'hostile', source: 'Son rôle et sa réaction établis dans la scène.' }))
  const after = await call('get_game_state')
  assert.equal(after.npcs.prince_farces.visible, false)
  assert.equal(after.npcs.prince_farces.disposition, 'wary')
  assert.equal(evaluateMapQuest(after, 'wood', adventureId).objectives.find(objective => objective.id === 'recover_shadow').done, false)
  assert.deepEqual(after.player.inventory, before.player.inventory)
  assert.deepEqual(after.monsters, before.monsters)
  assert.equal(after.phase, 'exploration')
})
