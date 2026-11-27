const test = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
const { installPgMem } = require('./helpers/pg-mem.cjs')
process.env.MONETIZATION_ENABLED = 'false'
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { getAdventureMap } = require('../lib/adventure-map.ts')
const { SocialProfileSchema, socialActors } = require('../lib/social.ts')
const { buildLocalBestiaryContext } = require('../lib/dm/local-bestiary.ts')
test.after(() => pg.restore())

async function engine(t, adventureId = 'grammys-country-apple-pie', characterId = 'fighter', dice = '12,12,12,12,12,12,12,12,12,12,12,12') {
  const client = new Client({ name: 'social-test', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, ADVENTURE_ID: adventureId, CHARACTER_ID: characterId, AI_DM_TEST_DICE_SEQUENCE: dice } }))
  t.after(() => client.close())
  const raw = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args })
    const text = result.content.find(c => c.type === 'text').text
    let data
    try { data = JSON.parse(text) } catch { data = { error: text } }
    return { error: Boolean(result.isError), data }
  }
  const call = async (name, args) => { const result = await raw(name, args); assert.equal(result.error, false, JSON.stringify(result.data)); return result.data }
  return { call, raw }
}
test('every campaign authors valid social defaults, NPC profiles and monster exceptions', () => {
  for (const id of ['grammys-country-apple-pie', 'tide-crypt', 'fey-shadow-fair', 'sarah-of-yellowcrest-manor']) {
    const map = getAdventureMap(id), social = map.social
    assert.ok(social)
    for (const profile of [social.npcDefault, social.monsterDefault, ...Object.values(social.npcs), ...Object.values(social.monsterTypes)]) {
      SocialProfileSchema.parse(profile)
      assert.ok(profile.goals.length)
      if (!profile.influenceable) assert.ok(profile.refusalReason)
    }
    for (const npc of map.npcs) assert.ok(social.npcs[npc.id], `Explicit profile for ${id}/${npc.id}`)
    for (const id of Object.keys(social.npcs)) assert.ok(map.npcs.some(npc => npc.id === id))
  }
})

test('faithful cult members remain locked while Faerl and the manipulated novice are influenceable', async t => {
  const { call, raw } = await engine(t, 'sarah-of-yellowcrest-manor')
  let state = await call('get_game_state')
  state.currentMapId = 'waterdeep'; state.player.position = state.npcs.faerl_city.position
  await call('replace_game_state', { gameState: state })
  const guard = await call('spawn_monster', { monsterType: 'cultist', cell: { x: 19, y: 14 } })
  const before = await call('get_game_state')
  const refusal = await raw('roll_ability_check', { ability: 'cha', skill: 'intimidation', targetId: guard.id, dc: 10 })
  assert.equal(refusal.data.code, 'SOCIAL_TARGET_UNINFLUENCEABLE')
  assert.deepEqual(await call('get_game_state'), before)
  await call('reveal_npc', { npcId: 'faerl_city' })
  assert.ok((await call('roll_ability_check', { ability: 'cha', skill: 'intimidation', targetId: 'faerl_city', dc: 15 })).social)
  state = await call('get_game_state'); state.currentMapId = 'cellar'; state.player.position = state.npcs.young_fargo.position
  await call('replace_game_state', { gameState: state })
  assert.ok((await call('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: 'young_fargo', dc: 12 })).social)
})

for (const [targetId, mapId] of [['faerl_city', 'waterdeep'], ['faerl_village', 'greenfast']]) {
  for (const [die, granted] of [[20, true], [1, false]]) {
    test(`Faerl intimidation uses the social procedure at ${mapId}, die ${die}, including save restoration and retry`, async t => {
      const { call } = await engine(t, 'sarah-of-yellowcrest-manor', 'fighter', `${die},17`)
      const state = await call('get_game_state')
      state.currentMapId = mapId
      state.currentRoomId = state.npcs[targetId].roomId
      state.player.position = state.npcs[targetId].position
      state.player.stats.cha = 10
      state.player.skillProficiencies = []
      state.player.expertise = []
      await call('replace_game_state', { gameState: state })
      const source = 'Menace crédible établie dans la scène ; le MJ évalue cette demande précise comme un risque mineur pour Faerl.'
      await call('begin_social_interaction', { eventId: 'faerl-begin', interactionId: 'faerl-talk', targetId,
        attitude: 'indifferent', source, characteristics: [] })
      await call('record_social_conversation', { eventId: 'faerl-threat', interactionId: 'faerl-talk', targetId,
        source, requestReached: true, sufficientForInsight: false,
        participants: [{ entityId: 'player', contribution: 'neutral', statement: 'Dis-moi quand ton maître se rend à Greenfast.', source }] })
      await call('replace_game_state', { gameState: await call('get_game_state') })
      const before = await call('get_game_state')
      const input = { eventId: 'faerl-request', interactionId: 'faerl-talk', targetId, conversationEventId: 'faerl-threat',
        entityId: 'player', resolution: 'check', skill: 'intimidation',
        request: { id: 'faerl-information', description: 'Indiquer les habitudes de déplacement de Viallis connues de Faerl.', risk: 'minor', source } }
      const result = await call('resolve_social_request', input)
      assert.equal(result.requestGranted, granted)
      assert.equal(result.check.roll.rolls[0], die)
      assert.equal(result.check.dc, 20)
      assert.equal(result.check.ability, 'cha')
      assert.equal(result.check.social.targetId, targetId)
      const after = await call('get_game_state')
      assert.deepEqual(after.npcs, before.npcs, 'influence grants no automatic disposition or physical effect')
      const id = `faerl-intimidation-${targetId}-${die}-${process.pid}`
      t.after(() => deleteSession(id))
      await saveSession(id, { gameState: after, history: [] })
      await call('replace_game_state', { gameState: (await loadSession(id)).gameState })
      const restored = await call('get_game_state')
      assert.equal((await call('resolve_social_request', input)).replayed, true)
      assert.deepEqual(await call('get_game_state'), restored)
      assert.equal((await call('roll_dice', { notation: '1d20' })).total, 17)
    })
  }
}

test('missing, unknown, remote and dead social targets refuse without dice or state changes', async t => {
  const { call, raw } = await engine(t)
  const dead = await call('spawn_monster', { monsterType: 'goblin', cell: { x: 5, y: 13 } })
  const state = await call('get_game_state'); state.monsters[dead.id].hp.current = 0; state.monsters[dead.id].isAlive = false
  await call('replace_game_state', { gameState: state })
  const before = await call('get_game_state')
  for (const [targetId, code] of [[undefined, 'SOCIAL_TARGET_REQUIRED'], ['invented', 'SOCIAL_TARGET_UNKNOWN'],
    ['dryad_1', 'SOCIAL_TARGET_UNREACHABLE'], [dead.id, 'SOCIAL_TARGET_DEAD']]) {
    const refused = await raw('roll_ability_check', { ability: 'cha', skill: 'deception', targetId, dc: 10 })
    assert.equal(refused.error, true); assert.equal(refused.data.code, code)
    assert.deepEqual(await call('get_game_state'), before)
  }
  assert.equal((await call('roll_dice', { notation: '1d20' })).total, 12)
})


test('every influence skill uses the exact DC with the same creature rules before and after hydration', async t => {
  const { call } = await engine(t)
  for (const skill of ['persuasion', 'intimidation', 'deception']) {
    const result = await call('roll_ability_check', { ability: 'cha', skill, targetId: 'mac', dc: 10 })
    assert.equal(result.dc, 10)
    assert.deepEqual(result.social, { targetId: 'mac', baseDc: 10, dcModifier: 0, policy: 'standard2014' })
  }
  const state = await call('get_game_state')
  await call('replace_game_state', { gameState: state })
  assert.deepEqual(await call('get_game_state'), state)
})

test('obsolete scores and policy selections are removed at SQL and MCP boundaries without changing personalities or consuming dice', async t => {
  const { call, raw } = await engine(t)
  const legacy = await call('get_game_state'), savedProfiles = structuredClone(legacy.socialPersonalities)
  legacy.socialRelationships = { mac: { empathy: 100, interactions: [] } }
  legacy.dmTools ??= { version: 1, objects: {}, traps: {}, npcs: {}, itemUses: {} }
  legacy.dmTools.socialInteractions = { version: 1, records: {}, receipts: {
    oldPolicy: { kind: 'policy', command: '{}', at: 0, status: 'resolved', result: {} },
  }, policy: { value: 'campaign_empathy', eventId: 'oldPolicy', source: 'Legacy fixture', at: 0 } }
  const id = `removed-social-model-${process.pid}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: legacy, history: [] })
  const loaded = (await loadSession(id)).gameState
  assert.equal(Object.hasOwn(loaded, 'socialRelationships'), false)
  assert.deepEqual(loaded.dmTools.socialInteractions, { version: 1, records: {}, receipts: {} })
  await call('replace_game_state', { gameState: legacy })
  const restored = await call('get_game_state')
  assert.equal(Object.hasOwn(restored, 'socialRelationships'), false)
  assert.deepEqual(restored.socialPersonalities, savedProfiles)
  assert.deepEqual(restored.dmTools.socialInteractions, loaded.dmTools.socialInteractions)
  for (const name of ['record_social_interaction', 'configure_social_policy']) {
    assert.equal((await raw(name, {})).error, true)
  }
  assert.equal((await call('roll_dice', { notation: '1d20' })).total, 12)
})

test('social checks retain their exact standard DC and original die through an Inspiration reaction', async t => {
  const { call } = await engine(t, 'sarah-of-yellowcrest-manor', 'bard', '8,4,17')
  const state = await call('get_game_state')
  state.hero.inspiration.push({ targetId: 'player', die: 8, expiresAt: 600 })
  await call('replace_game_state', { gameState: state })
  const pending = await call('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId: 'sarah', dc: 15 })
  assert.ok(pending.pendingReaction)
  await call('replace_game_state', { gameState: await call('get_game_state') })
  const result = await call('resolve_reaction', { pendingId: pending.pendingReaction.id, choice: 'bardic_inspiration' })
  assert.equal(result.dc, 15)
  assert.equal(result.social.policy, 'standard2014')
  assert.equal(result.success, result.roll.total >= 15)
  assert.equal((await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('the MCP catalogue and prompts expose only standard social procedures and confidential personalities', async t => {
  const { engine: open } = require('./helpers/mcp-toolkit.cjs')
  const call = await open(t)
  const catalogue = await call.client.listTools()
  const names = catalogue.tools.map(tool => tool.name)
  for (const name of ['begin_social_interaction', 'resolve_social_request', 'discern_social_characteristic']) assert.ok(names.includes(name))
  for (const name of ['record_social_interaction', 'configure_social_policy']) assert.ok(!names.includes(name))
  const { buildStaticPrompt } = require('../lib/dm/prompts.ts')
  const prompt = buildStaticPrompt('sarah-of-yellowcrest-manor')
  const state = buildInitialGameState('sarah-of-yellowcrest-manor'), context = buildLocalBestiaryContext(state)
  assert.doesNotMatch(JSON.stringify(catalogue) + prompt + context, /campaign_empathy|initialEmpathy|empathyKind|"empathy"|record_social_interaction|configure_social_policy|roleplayQuality|Empathie maison|modificateur d.empathie/i)
  assert.match(context, /CONFIDENTIELS AU MJ/)
  assert.match(context, /"targetId":"sarah"/)
  assert.doesNotMatch(context, /"targetId":"young_fargo"|"targetId":"vecken_rescued"/)
  const versions = socialActors(state).filter(actor => ['vecken', 'vecken_rescued'].includes(actor.targetId))
  assert.equal(versions[0].relationshipId, versions[1].relationshipId)
  assert.deepEqual(versions[0].profile, versions[1].profile)
})
