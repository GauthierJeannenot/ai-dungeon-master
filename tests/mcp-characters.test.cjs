const test = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')

// Moteur testé = binaire COMPILÉ (mcp-server/dist). Chaque scénario spawne un
// process avec son propre CHARACTER_ID (figé au spawn) — miroir d'ADVENTURE_ID.
async function withCharacter(env, fn) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, ...env },
  })
  const client = new Client({ name: 'mcp-characters-test', version: '1.0.0' })
  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close()
  }
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = result.content.find(c => c.type === 'text')?.text
  return { data: text ? JSON.parse(text) : result, isError: Boolean(result.isError) }
}

async function getState(client) {
  return (await callTool(client, 'get_game_state')).data
}

function makeMonster(id, pos = { x: 5, y: 6 }, hp = 20) {
  return {
    id, name: id, type: 'goblin',
    hp: { current: hp, max: hp }, ac: 5,
    stats: { str: 8, dex: 8, con: 10, int: 8, wis: 8, cha: 8 },
    position: pos, conditions: [], xpValue: 50,
    attackBonus: 2, damageDice: '1d4', speed: 30, isAlive: hp > 0,
  }
}

// Construit un état de combat autour du joueur spawné (qui porte déjà les champs
// de personnage : classe, sorts, capacités).
function combatAround(state, overrides = {}) {
  return {
    ...state,
    phase: 'combat',
    currentTurn: 'player',
    round: 1,
    initiativeOrder: ['player', 'goblin'],
    movementUsed: {},
    actionUsed: {},
    bonusActionUsed: {},
    player: { ...state.player, position: { x: 5, y: 5 }, ...(overrides.player ?? {}) },
    monsters: { goblin: makeMonster('goblin', overrides.monsterPos) },
  }
}

test('spawn guerrier par défaut : byte-identique à l\'ancien héros', async () => {
  await withCharacter({}, async (client) => {
    const s = await getState(client)
    assert.equal(s.characterId, 'fighter')
    assert.equal(s.player.class, 'Guerrier')
    assert.equal(s.player.level, 1)
    assert.deepEqual(s.player.hp, { current: 20, max: 20 })
    assert.equal(s.player.ac, 16)
    assert.deepEqual(s.player.stats, { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 })
    const ids = s.player.inventory.map(i => i.id)
    assert.deepEqual(ids, ['longsword', 'shield', 'potion1'])
    assert.deepEqual(s.player.features, ['second_wind'])
  })
})

test('spawn magicien : sorts, emplacements et stats de classe', async () => {
  await withCharacter({ CHARACTER_ID: 'wizard' }, async (client) => {
    const s = await getState(client)
    assert.equal(s.characterId, 'wizard')
    assert.equal(s.player.class, 'Magicien')
    assert.equal(s.player.stats.int, 16)
    assert.equal(s.player.spellcastingAbility, 'int')
    assert.deepEqual(s.player.spellSlots, { level1: { current: 3, max: 3 } })
    assert.ok(s.player.knownSpells.includes('magic-missile'))
    assert.ok(s.player.knownSpells.includes('light'))
  })
})

test('cast_spell : sort inconnu refusé, tour de magie sans emplacement, worldFact round-trip', async () => {
  await withCharacter({ CHARACTER_ID: 'wizard' }, async (client) => {
    // Sort d'une autre classe → refus.
    const unknown = await callTool(client, 'cast_spell', { spellId: 'cure-wounds' })
    assert.equal(unknown.isError, true)
    assert.equal(unknown.data.code, 'SPELL_NOT_KNOWN')

    // Tour de magie (niveau 0) : aucun emplacement consommé, worldFact (carte).
    const light = await callTool(client, 'cast_spell', { spellId: 'light' })
    assert.equal(light.data.effect, 'utility')
    const s = await getState(client)
    assert.equal(s.player.spellSlots.level1.current, 3)
    assert.equal(s.worldFacts.length, 1)

    // Le worldFact survit au round-trip replace_game_state (porté par l'état).
    await callTool(client, 'replace_game_state', { gameState: s })
    const after = await getState(client)
    assert.equal(after.worldFacts.length, 1)
  })
})

test('cast_spell utilitaire (clerc, création d\'eau) : emplacements épuisables + worldFact', async () => {
  await withCharacter({ CHARACTER_ID: 'cleric' }, async (client) => {
    // Sort utilitaire de niveau 1 : consomme un emplacement à chaque lancer.
    for (let i = 0; i < 3; i++) {
      const r = await callTool(client, 'cast_spell', { spellId: 'create-water' })
      assert.equal(r.isError, false, `create-water #${i + 1}`)
      assert.equal(r.data.effect, 'utility')
    }
    let s = await getState(client)
    assert.equal(s.player.spellSlots.level1.current, 0)
    assert.ok(s.worldFacts.length >= 1, 'un fait de monde a été produit')

    // Plus d'emplacement → refus.
    const exhausted = await callTool(client, 'cast_spell', { spellId: 'create-water' })
    assert.equal(exhausted.isError, true)
    assert.equal(exhausted.data.code, 'SPELL_SLOTS_EXHAUSTED')

    // worldFacts + emplacements survivent au round-trip.
    const before = await getState(client)
    await callTool(client, 'replace_game_state', { gameState: before })
    s = await getState(client)
    assert.equal(s.worldFacts.length, before.worldFacts.length)
    assert.equal(s.player.spellSlots.level1.current, 0)
  })
})

test('cast_spell projectile magique en combat : touche auto, dégâts, emplacement débité', async () => {
  await withCharacter({ CHARACTER_ID: 'wizard' }, async (client) => {
    const initial = await getState(client)
    await callTool(client, 'replace_game_state', { gameState: combatAround(initial, { monsterPos: { x: 5, y: 6 } }) })
    const cast = await callTool(client, 'cast_spell', { spellId: 'magic-missile', targetName: 'goblin' })
    assert.equal(cast.isError, false)
    assert.equal(cast.data.effect, 'auto_hit')
    assert.equal(cast.data.hit, true)
    assert.ok(cast.data.targetHpAfter < 20, 'le gobelin a subi des dégâts')
    const s = await getState(client)
    assert.equal(s.player.spellSlots.level1.current, 2)
    assert.equal(s.actionUsed.player, true, 'le sort a consommé l\'action')
  })
})

test('second souffle (guerrier) : soigne, consomme la ressource, épuisable', async () => {
  await withCharacter({}, async (client) => {
    await callTool(client, 'update_hp', { entityId: 'player', delta: -8, reason: 'test' })
    const first = await callTool(client, 'use_class_feature', { featureId: 'second_wind' })
    assert.equal(first.isError, false)
    assert.ok(first.data.hpAfter > first.data.hpBefore, 'le second souffle soigne')
    const s = await getState(client)
    assert.equal(s.player.resources.second_wind.current, 0)
    const second = await callTool(client, 'use_class_feature', { featureId: 'second_wind' })
    assert.equal(second.isError, true)
    assert.equal(second.data.code, 'RESOURCE_EXHAUSTED')
  })
})

test('use_class_feature refusé si la classe ne l\'a pas (magicien ≠ second souffle)', async () => {
  await withCharacter({ CHARACTER_ID: 'wizard' }, async (client) => {
    const r = await callTool(client, 'use_class_feature', { featureId: 'second_wind' })
    assert.equal(r.isError, true)
    assert.equal(r.data.code, 'FEATURE_NOT_AVAILABLE')
  })
})

test('roll_ability_check : maîtrise dérivée du personnage via skill (anti-triche)', async () => {
  await withCharacter({ CHARACTER_ID: 'bard' }, async (client) => {
    // Barde : maîtrise en persuasion (CHA 16 → +3 ; maîtrise +2 ; total +5).
    // Les flags déclarés sont IGNORÉS quand skill est fourni : proficient=false
    // et expertise=true ne changent rien (le barde n'a pas d'expertise).
    const r = await callTool(client, 'roll_ability_check', { ability: 'str', skill: 'persuasion', proficient: false, expertise: true, dc: 10 })
    assert.equal(r.data.expertise, false)
    assert.equal(r.data.proficient, true)
    assert.equal(r.data.roll.modifier, 5)
    assert.equal(r.data.ability, 'cha')
  })
})

test('spawn barde : incantateur CHA au kit utilitaire', async () => {
  await withCharacter({ CHARACTER_ID: 'bard' }, async (client) => {
    const s = await getState(client)
    assert.equal(s.characterId, 'bard')
    assert.equal(s.player.class, 'Barde')
    assert.equal(s.player.stats.cha, 16)
    assert.equal(s.player.ac, 13)
    assert.equal(s.player.spellcastingAbility, 'cha')
    assert.deepEqual(s.player.spellSlots, { level1: { current: 3, max: 3 } })
    for (const id of ['vicious-mockery', 'minor-illusion', 'healing-word', 'thunderwave', 'disguise-self', 'speak-with-animals']) {
      assert.ok(s.player.knownSpells.includes(id), `sort connu manquant : ${id}`)
    }
  })
})

test('moquerie cruelle (barde) : sauvegarde SAG, dégâts pleins sur échec, aucun emplacement', async () => {
  // Dés forcés : JS SAG du gobelin (3-1=2 vs DD 13 → raté), puis dégâts 1d4=4.
  await withCharacter({ CHARACTER_ID: 'bard', AI_DM_TEST_DICE_SEQUENCE: '3,4' }, async (client) => {
    const initial = await getState(client)
    await callTool(client, 'replace_game_state', { gameState: combatAround(initial, { monsterPos: { x: 5, y: 6 } }) })
    const cast = await callTool(client, 'cast_spell', { spellId: 'vicious-mockery', targetName: 'goblin' })
    assert.equal(cast.isError, false)
    assert.equal(cast.data.effect, 'save')
    assert.equal(cast.data.saved, false)
    assert.equal(cast.data.dc, 13, 'DD = 8 + maîtrise 2 + mod CHA 3')
    assert.equal(cast.data.damageDealt, 4)
    const s = await getState(client)
    assert.equal(s.player.spellSlots.level1.current, 3, 'un tour de magie ne consomme pas d\'emplacement')
  })
})

test('déguisement (barde) : sort utilitaire narratif — coût débité, worldFact de carte', async () => {
  await withCharacter({ CHARACTER_ID: 'bard' }, async (client) => {
    const cast = await callTool(client, 'cast_spell', { spellId: 'disguise-self' })
    assert.equal(cast.isError, false)
    assert.equal(cast.data.effect, 'utility')
    assert.ok(cast.data.srdNote.length > 0, 'le srdNote borne la narration du DM')
    const s = await getState(client)
    assert.equal(s.player.spellSlots.level1.current, 2, 'sort de niveau 1 : emplacement débité')
    assert.equal(s.worldFacts.length, 1)
    assert.equal(s.worldFacts[0].expires, 'map')
    assert.ok(/Déguisement/.test(s.worldFacts[0].text))
  })
})
