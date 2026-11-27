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
const adventureId = 'sarah-of-yellowcrest-manor'
const data = getAdventureMap(adventureId)
const fresh = seed => initializeSocialPersonalities(buildInitialGameState(adventureId), seed)
const actor = (state, id) => socialActors(state).find(actor => actor.targetId === id)
const callEngine = async t => {
  const call=await engine(t,{adventureId,dice:'13,13,13,13,13,13,13,13'})
  return call
}

test('all fourteen NPC representations and twelve encounter actors have complete, additive campaign profiles', () => {
  assert.equal(data.npcs.length, 14)
  const templates = structuredClone(data.social)
  const first = fresh('yellowcrest-one'), second = fresh('yellowcrest-two')
  assert.equal(socialActors(first).length, 26)
  assert.equal(Object.keys(first.socialPersonalities).length, 23, 'three people have two representations')
  for (const table of Object.values(data.social.tables)) {
    assert.equal(table.entries.length, 4)
    assert.equal(new Set(table.entries).size, 4)
  }
  for (const current of socialActors(first)) {
    const base = data.social.npcs[current.targetId] ?? data.social.monsterTypes[
      data.encounters[current.targetId.split(':')[1]].monsters[Number(current.targetId.split(':')[2])].monsterType]
    SocialProfileSchema.parse(base)
    assert.equal(base.randomizeMode, 'append')
    assert.deepEqual(current.profile.goals, base.goals)
    assert.deepEqual(current.profile.goals, actor(second, current.targetId).profile.goals)
    for (const field of SOCIAL_RANDOM_FIELDS) {
      const effective = ['likedTopics', 'tabooTopics'].includes(field) ? current.profile[field] : current.profile.personality[field]
      const fixed = ['likedTopics', 'tabooTopics'].includes(field) ? base[field] : base.personality[field]
      assert.ok(fixed.every(value => effective.includes(value)))
      if (!base.randomize[field]) { assert.deepEqual(effective, fixed); continue }
      const draw = first.socialPersonalities[current.relationshipId][field]
      assert.equal(draw.length, 1)
      assert.ok(data.social.tables[base.randomize[field]].entries.includes(draw[0]))
      assert.ok(effective.includes(draw[0]))
    }
  }
  assert.deepEqual(data.social, templates, 'preparation must not mutate the authored campaign')
})

test('new games vary details, while Sarah, Vecken and Faerl keep one identity and their fixed constraints', () => {
  const state = fresh('yellowcrest-shared'), snapshot = structuredClone(state)
  initializeSocialPersonalities(state, 'not-a-reroll')
  assert.deepEqual(state, snapshot)
  assert.notDeepEqual(fresh('yellowcrest-other').socialPersonalities, state.socialPersonalities)
  for (const [first, next] of [['sarah', 'sarah_at_rest'], ['vecken', 'vecken_rescued'], ['faerl_city', 'faerl_village']]) {
    assert.equal(actor(state, first).relationshipId, actor(state, next).relationshipId)
    // Scene-specific source excerpts can differ; the same person's social
    // constraints and prepared personality must remain identical.
    const { lore: firstLore, ...firstProfile } = actor(state, first).profile
    const { lore: nextLore, ...nextProfile } = actor(state, next).profile
    assert.deepEqual(firstProfile, nextProfile)
  }
  assert.match(actor(state, 'sarah').profile.personality.traits.join(' '), /Muette avant les adieux/)
  assert.match(actor(state, 'vecken').profile.personality.traits.join(' '), /Refuse de rejoindre l’expédition/)
  assert.ok(actor(state, 'arnulf').profile.likedTopics.includes('Histoires macabres'))
  assert.match(actor(state, 'old_fargo').profile.personality.traits.join(' '), /un échec ne révèle pas ses pensées/)
  assert.match(actor(state, 'encounter:vault_grick:0').profile.personality.traits.join(' '), /ne dialogue pas comme un humain/)
})

test('every draw keeps faithful cult members locked while the manipulated novice and hired guard remain distinct', () => {
  for (let seed = 0; seed < 12; seed++) {
    const state = fresh(`cult-lock-${seed}`)
    const locked = socialActors(state).filter(current => !current.profile.influenceable)
    assert.equal(locked.length, 10, 'ten encounter cult members; Faerl is an intimidation exception')
    for (const current of locked) {
      assert.equal(current.profile.randomize.ideals, undefined)
      assert.equal(current.profile.randomize.bonds, undefined)
      assert.ok(current.profile.refusalReason)
    }
    assert.equal(actor(state, 'young_fargo').profile.influenceable, true)
    for (const id of ['faerl_city', 'faerl_village']) {
      assert.equal(actor(state, id).profile.influenceable, true)
      assert.equal(actor(state, id).profile.refusalReason, undefined)
    }
    assert.equal(actor(state, 'encounter:faerl_bodyguards:0').profile.influenceable, true)
    assert.match(actor(state, 'encounter:faerl_bodyguards:0').profile.personality.traits.join(' '), /sans connaître le culte/)
    assert.match(actor(state, 'encounter:viallis_ritual:0').profile.personality.traits.join(' '), /indécis lorsqu’il perd le contrôle/)
  }
})

test('local personality context does not reveal remote cultists or the innkeepers private background off scene', () => {
  const state = fresh('yellowcrest-local')
  let context = buildLocalBestiaryContext(state)
  assert.ok(context.includes('"targetId":"sarah"'))
  assert.doesNotMatch(context, /"targetId":"old_fargo"|"targetId":"faerl_city"|"targetId":"encounter:viallis_ritual:0"/)
  state.currentMapId = 'greenfast'; state.currentRoomId = '10'; state.player.position = { x: 2, y: 11 }
  context = buildLocalBestiaryContext(state)
  assert.doesNotMatch(context, /"targetId":"old_fargo"|Son fils et l’auberge/)
})

test('MCP prepares new games and legacy saves without rerolls or gameplay dice, then persists them in Postgres', async t => {
  const call = await callEngine(t), other = await callEngine(t)
  const first = await call('get_game_state'), second = await other('get_game_state')
  assert.equal(Object.keys(first.socialPersonalities).length, 23)
  assert.notEqual(first.socialProfileSeed, second.socialProfileSeed)
  assert.notDeepEqual(first.socialPersonalities, second.socialPersonalities)
  const legacy = structuredClone(first)
  delete legacy.socialPersonalities; delete legacy.socialProfileSeed
  ok(await call('replace_game_state', { gameState: legacy }))
  const upgraded = await call('get_game_state')
  assert.deepEqual(upgraded.socialPersonalities, first.socialPersonalities)
  const id = `yellowcrest-personalities-${process.pid}`; t.after(() => deleteSession(id))
  await saveSession(id, { gameState: upgraded, history: [] })
  ok(await other('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  const restored = await other('get_game_state')
  assert.equal(restored.socialProfileSeed, upgraded.socialProfileSeed)
  assert.deepEqual(restored.socialPersonalities, upgraded.socialPersonalities)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 13)
  assert.equal(ok(await other('roll_dice', { notation: '1d20' })).total, 13)
})

test('a random favorite supports rich roleplay and follows Vecken between acts without granting helpful disposition', async t => {
  const call = await callEngine(t)
  let state = await call('get_game_state')
  state.currentMapId = 'waterdeep'; state.player.position = state.npcs.vecken.position
  ok(await call('replace_game_state', { gameState: state }))
  state = await call('get_game_state')
  const subject = state.socialPersonalities.vecken.likedTopics[0]
  const beforeTravel = await call('get_game_state')
  assert.equal(beforeTravel.npcs.vecken.disposition, 'neutral')
  state = structuredClone(beforeTravel); state.currentMapId = 'cellar'; state.player.position = state.npcs.vecken_rescued.position
  ok(await call('replace_game_state', { gameState: state }))
  const after = await call('get_game_state')
  assert.deepEqual(after.socialPersonalities, beforeTravel.socialPersonalities)
  const check = ok(await call('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: 'vecken_rescued', dc: 12 }))
  assert.equal(check.dc, 12)
  assert.equal((await call('get_game_state')).npcs.vecken_rescued.disposition, 'neutral')
})

test('authored cult members refuse every social lever even with a random favorite and a high roll', async t => {
  const call = await callEngine(t)
  const locked = socialActors(await call('get_game_state')).filter(current => !current.profile.influenceable)
  for (const current of locked) {
    const state = await call('get_game_state')
    state.currentMapId = current.mapId; state.player.position = current.position
    ok(await call('replace_game_state', { gameState: state }))
    const before = await call('get_game_state')
    for (const skill of ['persuasion', 'intimidation', 'deception']) {
      const result = await call('roll_ability_check', { ability: 'cha', skill, targetId: current.targetId, dc: 1,
        advantage: true, advantageReason: 'Argument favorable', roleplayBonus: 5, roleplayReason: 'Discours particulièrement riche' })
      assert.equal(result.code, 'SOCIAL_TARGET_UNINFLUENCEABLE', JSON.stringify(result))
    }
    if (before.npcs[current.targetId]) {
      assert.equal((await call('reveal_npc', { npcId: current.targetId, disposition: 'helpful' })).code, 'SOCIAL_TARGET_UNINFLUENCEABLE')
    }
    assert.deepEqual(await call('get_game_state'), before)
  }
  const state = await call('get_game_state')
  state.currentMapId = 'cellar'; state.player.position = state.npcs.young_fargo.position
  ok(await call('replace_game_state', { gameState: state }))
  const check = ok(await call('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: 'young_fargo', dc: 12 }))
  assert.equal(check.dc, 12)
})

test('Viallis keeps his fixed role and absolute social lock after combat spawn and engine restart', async t => {
  const call = await callEngine(t), resume = await callEngine(t)
  const state = await call('get_game_state')
  state.currentMapId = 'temple'; state.player.position = data.encounters.viallis_ritual.playerCell
  ok(await call('replace_game_state', { gameState: state }))
  const before = await call('get_game_state')
  const battle = ok(await call('start_encounter', { encounterId: 'viallis_ritual' }))
  const viallis = battle.spawnedMonsters.find(monster => monster.type === 'mage')
  assert.ok(viallis)
  const after = await call('get_game_state')
  assert.deepEqual(after.socialPersonalities, before.socialPersonalities)
  assert.deepEqual(actor(after, viallis.id).profile, actor(before, 'encounter:viallis_ritual:0').profile)
  ok(await resume('replace_game_state', { gameState: after }))
  const restored = await resume('get_game_state')
  assert.deepEqual(actor(restored, viallis.id).profile, actor(after, viallis.id).profile)
  assert.equal((await resume('roll_ability_check', { ability: 'cha', skill: 'deception', targetId: viallis.id, dc: 1 })).code,
    'SOCIAL_TARGET_UNINFLUENCEABLE')
  assert.deepEqual(await resume('get_game_state'), restored)
})
