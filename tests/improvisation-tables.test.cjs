const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
const { consultRules } = require('../mcp-server/dist/mcp-server/rules-library.js')

function catalog(topic) {
  const results = []
  let offset = 0
  do {
    const page = consultRules({ topic, resultOffset: offset })
    assert.ok(page.results.length <= 5)
    results.push(...page.results)
    offset = page.nextResultOffset
    if (offset === null) assert.equal(results.length, page.totalMatches)
  } while (offset !== null)
  return results
}

test('improvisation catalogs find original NPC, plot and dungeon tables, with complete source pagination', () => {
  const expected = { npc: ['NPC Appearance', 'NPC Mannerisms', 'NPC Flaws and Secrets'],
    adventure: ['Dungeon Goals', 'Adventure Introduction', 'Adventure Climax'],
    dungeon: ['Passage', 'Chamber', 'Dungeon Chamber Contents'] }
  for (const topic of Object.keys(expected)) {
    const tables = catalog(topic)
    for (const title of expected[topic]) assert.ok(tables.some(table => table.title === title), `${topic}: ${title}`)
    assert.equal(new Set(tables.map(table => table.tableId)).size, tables.length)
    for (const table of tables) {
      assert.equal(table.book, 'dmg-2014')
      assert.equal(table.topic, topic)
      let offset = 0, rebuilt = ''
      do {
        const page = consultRules({ tableId: table.tableId, offset, limit: 1000 })
        assert.equal(page.kind, 'table')
        assert.ok(page.text.length <= 1000)
        rebuilt += page.text
        offset = page.nextOffset
      } while (offset !== null)
      const source = fs.readFileSync(table.source.file, 'utf8').split('\n')
      assert.equal(rebuilt.trimEnd(), source.slice(table.source.startLine - 1, table.source.endLine).join('\n').trimEnd())
      assert.equal(rebuilt.length, table.totalChars)
      assert.ok(consultRules({ sectionId: table.sectionId }).totalChars >= rebuilt.length)
    }
  }
})

test('table selectors reject ambiguity, unknown IDs and invalid pagination', () => {
  const tableId = catalog('npc')[0].tableId
  for (const input of [{ topic: 'npc', query: 'secret' }, { topic: 'npc', tableId },
    { topic: 'npc', sectionId: 'dmg-2014:1' }, { topic: 'unknown' },
    { topic: 'npc', book: 'phb-2014' }, { tableId, book: 'phb-2014' },
    { tableId: '../../.env' }, { tableId, offset: 999999 }, { tableId, resultOffset: 1 },
    { tableId, limit: 5001 }, { topic: 'dungeon', offset: 1 }]) {
    assert.throws(() => consultRules(input), error => /^RULES_/.test(error.code))
  }
})

test('the agent can consult tables through real MCP without changing state or consuming dice in either phase', async () => {
  const client = new Client({ name: 'improvisation-tables-test', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, AI_DM_TEST_DICE_SEQUENCE: '13' } }))
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args })
    assert.ok(!result.isError, result.content[0].text)
    return JSON.parse(result.content[0].text)
  }
  try {
    const tool = (await client.listTools()).tools.find(tool => tool.name === 'consult_rules')
    assert.equal(tool.annotations.readOnlyHint, true)
    assert.ok(tool.inputSchema.properties.topic)
    assert.ok(tool.inputSchema.properties.tableId)
    for (const phase of ['exploration', 'combat']) {
      const initial = await call('get_game_state')
      if (phase === 'combat') await call('replace_game_state', { gameState: {
        ...initial, phase, currentTurn: 'player', initiativeOrder: ['player'], round: 1,
      } })
      const before = await call('get_game_state')
      const list = await call('consult_rules', { topic: 'npc' })
      const page = await call('consult_rules', { tableId: list.results[0].tableId })
      assert.equal(page.kind, 'table')
      assert.deepEqual(await call('get_game_state'), before)
    }
    assert.equal((await call('roll_dice', { notation: '1d20' })).total, 13)
  } finally { await client.close() }
})
