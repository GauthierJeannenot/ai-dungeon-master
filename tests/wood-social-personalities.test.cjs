const test = require('node:test')
const assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
process.env.MONETIZATION_ENABLED = 'false'
const pg = installPgMem()
const { getAdventureMap } = require('../lib/adventure-map.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { socialActors, initializeSocialPersonalities, SocialProfileSchema, SOCIAL_RANDOM_FIELDS } = require('../lib/social.ts')
const { buildLocalBestiaryContext } = require('../lib/dm/local-bestiary.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
test.after(() => pg.restore())
const adventureId = 'fey-shadow-fair'
const data = getAdventureMap(adventureId)
const woodEncounters = Object.values(data.encounters).filter(encounter => encounter.socialProfile)
const fresh = seed => initializeSocialPersonalities(buildInitialGameState(adventureId), seed)
const actor = (state, id) => socialActors(state).find(actor => actor.targetId === id)
const callEngine = async t => {
  const call=await engine(t,{adventureId,dice:'13,13,13,13,13,13,13,13,13,13'})
  return call
}
const fungusId = 'encounter:mocking_mushrooms:0'

test('the six wood groups define fifteen complete social roles with valid additive preparation tables', () => {
  assert.equal(woodEncounters.length, 6)
  assert.equal(woodEncounters.reduce((count, encounter) => count + encounter.monsters.length, 0), 15)
  for (const encounter of woodEncounters) {
    assert.equal(data.rooms.find(room => room.id === encounter.roomId).mapId, 'wood')
    const profile = SocialProfileSchema.parse(encounter.socialProfile)
    assert.equal(profile.influenceable, true)
    assert.equal(profile.randomizeMode, 'append')
    assert.ok(profile.goals.length)
    for (const field of SOCIAL_RANDOM_FIELDS) {
      const table = data.social.tables[profile.randomize[field]]
      assert.equal(table.entries.length, 4)
      assert.equal(new Set(table.entries).size, 4)
    }
  }
})

test('random details append to every fixed role and never mutate the campaign templates', () => {
  const originals = structuredClone(woodEncounters.map(encounter => encounter.socialProfile))
  const state = fresh('wood-game-one')
  assert.equal(Object.keys(state.socialPersonalities).length, 29)
  for (const encounter of woodEncounters) encounter.monsters.forEach((_, index) => {
    const id = `encounter:${encounter.id}:${index}`, actual = actor(state, id).profile
    const fixed = encounter.socialProfile, drawn = state.socialPersonalities[id]
    assert.deepEqual(actual.goals, fixed.goals)
    for (const field of SOCIAL_RANDOM_FIELDS) {
      assert.equal(drawn[field].length, 1)
      const choices = data.social.tables[fixed.randomize[field]].entries
      assert.ok(choices.includes(drawn[field][0]))
      const base = ['likedTopics', 'tabooTopics'].includes(field) ? fixed[field] : fixed.personality[field]
      const effective = ['likedTopics', 'tabooTopics'].includes(field) ? actual[field] : actual.personality[field]
      assert.deepEqual(effective, [...new Set([...base, ...drawn[field]])])
    }
  })
  assert.deepEqual(woodEncounters.map(encounter => encounter.socialProfile), originals)
})

test('every new seed changes flavor, while reuse preserves each saved choice and core behavior', () => {
  const first = fresh('wood-game-one'), saved = structuredClone(first)
  initializeSocialPersonalities(first, 'ignored-seed')
  assert.deepEqual(first, saved)
  const second = fresh('wood-game-two')
  assert.notDeepEqual(second.socialPersonalities, first.socialPersonalities)
  for (const encounter of woodEncounters) encounter.monsters.forEach((_, index) => {
    const id = `encounter:${encounter.id}:${index}`
    assert.deepEqual(actor(first, id).profile.goals, actor(second, id).profile.goals)
    for (const trait of encounter.socialProfile.personality.traits) {
      assert.ok(actor(first, id).profile.personality.traits.includes(trait))
      assert.ok(actor(second, id).profile.personality.traits.includes(trait))
    }
  })
  assert.ok(actor(first, 'encounter:blink_pack:0').profile.personality.traits.includes('Ne cherchent jamais à tuer.'))
  assert.ok(actor(first, 'encounter:toll_brigands:0').profile.personality.traits.includes('Suivent leur capitaine.'))
})

test('encounter overrides distinguish the same SRD type and do not alter other campaigns or unnamed fungi', () => {
  const state = fresh('wood-exceptions')
  assert.equal(actor(state, fungusId).profile.influenceable, true)
  assert.equal(data.social.monsterTypes.violet_fungus.influenceable, false)
  const other = buildInitialGameState('grammys-country-apple-pie')
  assert.equal(actor(other, 'encounter:violet_fungus_heap:0').profile.influenceable, false)
  const shadow = actor(state, 'encounter:shadow_cotillon:0').profile
  const duelist = actor(state, 'encounter:princes_jest:1').profile
  assert.notDeepEqual(shadow.goals, duelist.goals)
  assert.equal(data.encounters.shadow_cotillon.monsters[0].monsterType, data.encounters.princes_jest.monsters[1].monsterType)
})

test('wood profiles stay out of the fair prompt and NPC profiles keep their fixed personalities', () => {
  const state = fresh('wood-locality')
  let context = buildLocalBestiaryContext(state)
  assert.doesNotMatch(context, /"targetId":"encounter:mocking_mushrooms:0"|"targetId":"encounter:blink_pack:0"/)
  for (const spec of data.npcs) assert.deepEqual(actor(state, spec.id).profile.personality, data.social.npcs[spec.id].personality)
  state.currentMapId = 'wood'; state.currentRoomId = '10'; state.player.position = { x: 4, y: 21 }
  context = buildLocalBestiaryContext(state)
  assert.ok(context.includes(`"targetId":"${fungusId}"`))
  assert.doesNotMatch(context, /"targetId":"nicodeme"|"targetId":"encounter:blink_pack:0"/)
})

test('MCP initializes each profile without consuming gameplay dice and upgrades an NPC-only save without rerolls', async t => {
  const call = await callEngine(t)
  const state = await call('get_game_state')
  assert.equal(Object.keys(state.socialPersonalities).length, 29)
  const oldNpcProfiles = Object.fromEntries(Object.entries(state.socialPersonalities).filter(([id]) => !id.startsWith('encounter:')))
  const legacy = structuredClone(state); legacy.socialPersonalities = structuredClone(oldNpcProfiles)
  ok(await call('replace_game_state', { gameState: legacy }))
  const restored = await call('get_game_state')
  assert.equal(restored.socialProfileSeed, state.socialProfileSeed)
  assert.deepEqual(restored.socialPersonalities, state.socialPersonalities)
  assert.deepEqual(Object.fromEntries(Object.entries(restored.socialPersonalities).filter(([id]) => !id.startsWith('encounter:'))), oldNpcProfiles)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 13)
})

test('a socially influenceable wood fungus keeps its role and personality after combat spawn and restart', async t => {
  const call = await callEngine(t), resume = await callEngine(t)
  const state = await call('get_game_state')
  state.currentMapId = 'wood'; state.player.position = { x: 4, y: 21 }
  ok(await call('replace_game_state', { gameState: state }))
  const check = ok(await call('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: fungusId, dc: 10 }))
  assert.equal(check.dc, 10)
  const before = await call('get_game_state')
  const battle = ok(await call('start_encounter', { encounterId: 'mocking_mushrooms' }))
  const monster = battle.spawnedMonsters[0]
  assert.equal(monster.socialIdentity, fungusId)
  const after = await call('get_game_state')
  assert.deepEqual(actor(after, monster.id).profile, actor(before, fungusId).profile)
  assert.deepEqual(after.socialPersonalities, before.socialPersonalities)
  const id = `wood-profiles-${process.pid}`; t.after(() => deleteSession(id))
  await saveSession(id, { gameState: after, history: [] })
  ok(await resume('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  const restored = await resume('get_game_state')
  assert.deepEqual(restored.socialPersonalities, after.socialPersonalities)
  assert.deepEqual(actor(restored, monster.id).profile, actor(after, monster.id).profile)
  const nextCheck = ok(await resume('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: monster.id, dc: 10 }))
  assert.equal(nextCheck.dc, 10)
})
