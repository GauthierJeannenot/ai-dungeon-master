const test = require('node:test')
const assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
process.env.MONETIZATION_ENABLED = 'false'
const pg = installPgMem()
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { getAdventureMap } = require('../lib/adventure-map.ts')
const { initializeSocialPersonalities, socialActors, SOCIAL_RANDOM_FIELDS, SocialProfileSchema } = require('../lib/social.ts')
const { buildDynamicPrompt } = require('../lib/dm/prompts.ts')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
test.after(() => pg.restore())

const adventureId = 'grammys-country-apple-pie'
const goblinId = 'encounter:bakery_floor_goblins:0'
const chiefId = 'encounter:grammy_apartment_guards:2'
const fresh = seed => initializeSocialPersonalities(buildInitialGameState(adventureId), seed)
const actor = (state, id) => socialActors(state).find(actor => actor.targetId === id)
const callEngine = async t => {
  const call=await engine(t,{adventureId,dice:'13,13,13,13,13,13,13,13'})
  return call
}

test('module social tables resolve every configured field and fixed profiles are complete', () => {
  const social = getAdventureMap(adventureId).social
  assert.equal(Object.keys(social.tables).length, 5)
  for (const table of Object.values(social.tables)) {
    assert.equal(table.entries.length, 8)
    assert.equal(new Set(table.entries).size, 8)
    assert.ok(table.entries.every(entry => entry.trim()))
  }
  for (const profile of [...Object.values(social.npcs), ...Object.values(social.monsterTypes)]) {
    SocialProfileSchema.parse(profile)
    for (const id of Object.values(profile.randomize ?? {})) assert.ok(social.tables[id])
  }
  for (const id of ['mac', 'dryad_1', 'dryad_2', 'dryad_3']) {
    const profile = social.npcs[id]
    assert.equal(profile.randomize, undefined)
    for (const field of ['ideals', 'bonds', 'traits']) assert.ok(profile.personality[field].length)
  }
})

test('Mac and dryads keep fixed goals, ideals, bonds and traits in every new game', () => {
  const first = fresh('first-game'), second = fresh('second-game')
  for (const id of ['mac', 'dryad_1', 'dryad_2', 'dryad_3']) {
    assert.deepEqual(actor(first, id).profile, actor(second, id).profile)
    assert.equal(first.socialPersonalities[id], undefined)
    assert.equal(second.socialPersonalities[id], undefined)
  }
})

test('each encounter goblin and chief has its own saved table draws while goals stay fixed and ordered', () => {
  const state = fresh('sample-game'), social = getAdventureMap(adventureId).social
  assert.equal(Object.keys(state.socialPersonalities).length, 5)
  for (const entry of socialActors(state).filter(entry => entry.profile.randomize)) {
    const generated = state.socialPersonalities[entry.relationshipId]
    for (const field of SOCIAL_RANDOM_FIELDS) {
      const choices = social.tables[entry.profile.randomize[field]].entries
      assert.equal(generated[field].length, 1)
      assert.ok(choices.includes(generated[field][0]))
      const effective = field === 'likedTopics' || field === 'tabooTopics'
        ? entry.profile[field] : entry.profile.personality[field]
      assert.deepEqual(effective, generated[field])
    }
    assert.deepEqual(entry.profile.goals, entry.targetId === chiefId ? ['Survivre', 'Manger des tartes'] : ['Manger des tartes'])
  }
  assert.notDeepEqual(state.socialPersonalities[goblinId], state.socialPersonalities['encounter:bakery_floor_goblins:1'])
})

test('new game seeds vary the draws; an existing game never redraws saved choices', () => {
  const first = fresh('first-game'), second = fresh('second-game')
  assert.notEqual(first.socialProfileSeed, second.socialProfileSeed)
  assert.notDeepEqual(first.socialPersonalities, second.socialPersonalities)
  const saved = structuredClone(first)
  initializeSocialPersonalities(first, 'ignored-new-seed')
  assert.deepEqual(first, saved)
  const restored = JSON.parse(JSON.stringify(saved))
  initializeSocialPersonalities(restored, 'another-ignored-seed')
  assert.deepEqual(restored, JSON.parse(JSON.stringify(saved)))
  const varied = new Set(Array.from({ length: 12 }, (_, index) => JSON.stringify(fresh(`game-${index}`).socialPersonalities[goblinId])))
  assert.ok(varied.size > 1)
})

test('changing campaign table entries cannot rewrite already saved personalities', () => {
  const state = fresh('saved-profile'), before = structuredClone(state.socialPersonalities)
  const table = getAdventureMap(adventureId).social.tables.bakery_ideals
  const original = table.entries
  try {
    table.entries = ['Nouvel idéal de test']
    initializeSocialPersonalities(state, 'ignored')
    assert.deepEqual(state.socialPersonalities, before)
    assert.deepEqual(actor(state, goblinId).profile.personality.ideals, before[goblinId].ideals)
  } finally { table.entries = original }
})

test('real fresh engine sessions have different seeds without consuming gameplay dice', async t => {
  const first = await callEngine(t), second = await callEngine(t)
  const a = await first('get_game_state'), b = await second('get_game_state')
  assert.ok(a.socialProfileSeed); assert.ok(b.socialProfileSeed)
  assert.notEqual(a.socialProfileSeed, b.socialProfileSeed)
  assert.equal(Object.keys(a.socialPersonalities).length, 5)
  assert.deepEqual(actor(a, 'mac').profile, actor(b, 'mac').profile)
  assert.equal(ok(await first('roll_dice', { notation: '1d20' })).total, 13)
  assert.equal(ok(await second('roll_dice', { notation: '1d20' })).total, 13)
})

test('Postgres and replace_game_state restore the same profiles in a different engine process', async t => {
  const first = await callEngine(t), second = await callEngine(t)
  const saved = await first('get_game_state')
  const id = `social-personality-${process.pid}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: saved, history: [] })
  const loaded = (await loadSession(id)).gameState
  ok(await second('replace_game_state', { gameState: loaded }))
  const restored = await second('get_game_state')
  assert.equal(restored.socialProfileSeed, saved.socialProfileSeed)
  assert.deepEqual(restored.socialPersonalities, saved.socialPersonalities)
  assert.deepEqual(actor(restored, goblinId).profile, actor(saved, goblinId).profile)
  assert.equal(ok(await second('roll_dice', { notation: '1d20' })).total, 13)
})

test('a legacy saved game receives personalities once and preserves its personalities', async t => {
  const call = await callEngine(t)
  const legacy = await call('get_game_state')
  delete legacy.socialProfileSeed; delete legacy.socialPersonalities
  ok(await call('replace_game_state', { gameState: legacy }))
  const first = await call('get_game_state')
  assert.equal(Object.keys(first.socialPersonalities).length, 5)
  ok(await call('replace_game_state', { gameState: JSON.parse(JSON.stringify(first)) }))
  const second = await call('get_game_state')
  assert.equal(second.socialProfileSeed, first.socialProfileSeed)
  assert.deepEqual(second.socialPersonalities, first.socialPersonalities)
})

test('the encounter personality survives spawning, combat and state hydration under its canonical identity', async t => {
  const call = await callEngine(t)
  const before = await call('get_game_state')
  before.player.position = { x: 11, y: 8 }
  ok(await call('replace_game_state', { gameState: before }))
  const battle = ok(await call('start_encounter', { encounterId: 'bakery_floor_goblins' }))
  const monster = battle.spawnedMonsters[0]
  assert.equal(monster.socialIdentity, goblinId)
  let after = await call('get_game_state')
  assert.deepEqual(after.socialPersonalities, before.socialPersonalities)
  assert.deepEqual(actor(after, monster.id).profile, actor(before, goblinId).profile)
  ok(await call('replace_game_state', { gameState: after }))
  after = await call('get_game_state')
  assert.deepEqual(after.socialPersonalities, before.socialPersonalities)
})

test('a separately spawned goblin gets a saved personality and its drawn favorite topic remains stable', async t => {
  const call = await callEngine(t)
  const monster = ok(await call('spawn_monster', { monsterType: 'goblin', cell: { x: 5, y: 13 } }))
  let state = await call('get_game_state')
  const profile = actor(state, monster.id).profile
  assert.deepEqual(profile.goals, ['Manger des tartes'])
  assert.ok(state.socialPersonalities[monster.id])
  state = await call('get_game_state')
  ok(await call('replace_game_state', { gameState: state }))
  assert.deepEqual(actor(await call('get_game_state'), monster.id).profile, profile)
})

test('the dynamic prompt exposes only local personality data, not the seed or the global saved stock', () => {
  const state = fresh('confidential-seed')
  const prompt = buildDynamicPrompt(state)
  assert.match(prompt, /"targetId":"mac"/)
  assert.match(prompt, /"ideals":/)
  assert.match(prompt, /priorité décroissante/)
  assert.doesNotMatch(prompt, /confidential-seed|"socialPersonalities"|"targetId":"encounter:bakery_floor_goblins:0"/)
})

test('a campaign without random social tables keeps its state untouched by initialization', () => {
  assert.equal(getAdventureMap('tide-crypt').social.tables, undefined)
  const state = buildInitialGameState('tide-crypt'), before = structuredClone(state)
  initializeSocialPersonalities(state, 'unused-seed')
  assert.deepEqual(state, before)
})
