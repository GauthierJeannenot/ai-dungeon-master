// Le moteur MCP est paramétré par ADVENTURE_ID au spawn (un process = une
// aventure). Ce test lance le binaire compilé avec des env différentes et
// vérifie que l'état initial et les rencontres proviennent du bon module.

const test = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = result.content.find(c => c.type === 'text')?.text
  return text ? JSON.parse(text) : result
}

// Spawn du moteur avec une aventure donnée (ou défaut si adventureId null).
async function withAdventureEngine(adventureId, fn) {
  const env = { ...process.env }
  if (adventureId) env.ADVENTURE_ID = adventureId
  else delete env.ADVENTURE_ID

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['mcp-server/dist/mcp-server/index.js'],
    env,
  })
  const client = new Client({ name: 'mcp-adventure-test', version: '1.0.0' })
  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close()
  }
}

test('engine defaults to Grammy when ADVENTURE_ID is unset', async () => {
  await withAdventureEngine(null, async client => {
    const state = await callTool(client, 'get_game_state')
    assert.equal(state.adventureId, 'grammys-country-apple-pie')
    assert.deepEqual(state.player.position, { x: 4, y: 13 })
    assert.equal(state.player.level, 1)
    assert.equal(state.player.hp.max, 20)
    // Mac le Tréant visible d'emblée, dryades cachées.
    assert.ok(state.npcs.mac, 'PNJ mac absent')
    assert.equal(state.npcs.mac.visible, true)
    assert.equal(state.npcs.dryad_1.visible, false)
    // Rencontre Grammy jouable.
    const started = await callTool(client, 'start_encounter', { encounterId: 'bakery_floor_goblins' })
    assert.ok(!started.error, `start_encounter a échoué : ${JSON.stringify(started)}`)
  })
})

test('engine loads the tide-crypt module under ADVENTURE_ID=tide-crypt', async () => {
  await withAdventureEngine('tide-crypt', async client => {
    const state = await callTool(client, 'get_game_state')
    assert.equal(state.adventureId, 'tide-crypt')
    assert.deepEqual(state.player.position, { x: 4, y: 13 })
    // Héros niveau 2 (28 PV, deux potions).
    assert.equal(state.player.level, 2)
    assert.equal(state.player.hp.max, 28)
    assert.equal(state.player.inventory.filter(i => i.type === 'potion').length, 2)
    // Maël présent et visible ; l'Écho de la Gardienne cachée ; PAS de Mac.
    assert.ok(state.npcs.mael, 'PNJ mael absent')
    assert.equal(state.npcs.mael.visible, true)
    assert.equal(state.npcs.guardian_echo.visible, false)
    assert.equal(state.npcs.mac, undefined, 'Mac ne devrait pas exister dans la crypte')
  })
})

test('tide-crypt final encounter spawns the Gardien Noyé', async () => {
  await withAdventureEngine('tide-crypt', async client => {
    const started = await callTool(client, 'start_encounter', { encounterId: 'guardian_chapel' })
    assert.ok(!started.error, `start_encounter a échoué : ${JSON.stringify(started)}`)

    const state = await callTool(client, 'get_game_state')
    assert.equal(state.phase, 'combat')
    const names = Object.values(state.monsters).map(m => m.name)
    assert.ok(names.includes('Le Gardien Noyé'), `Gardien absent des monstres : ${names.join(', ')}`)
  })
})

test('a Grammy encounter id is rejected by a tide-crypt engine', async () => {
  await withAdventureEngine('tide-crypt', async client => {
    // L'enum du schéma (encounterIds("tide-crypt")) ne contient pas les
    // rencontres Grammy : soit le SDK rejette la promesse (validation), soit le
    // moteur renvoie une erreur. Les deux formes sont des échecs acceptables.
    let rejected = false
    try {
      const started = await callTool(client, 'start_encounter', { encounterId: 'bakery_floor_goblins' })
      rejected = Boolean(started.error || started.isError)
    } catch {
      rejected = true
    }
    assert.ok(rejected, 'une rencontre Grammy ne devrait pas exister dans la crypte')
  })
})
