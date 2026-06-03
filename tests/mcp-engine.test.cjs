const test = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')

const dice = require('../mcp-server/dist/mcp-server/dice.js')
const gameState = require('../mcp-server/dist/mcp-server/game-state.js')

function makeMonster(id, hp = 7) {
  return {
    id,
    name: id,
    type: 'goblin',
    hp: { current: hp, max: hp },
    ac: 15,
    stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    position: { x: 6, y: 6 },
    conditions: [],
    xpValue: 50,
    attackBonus: 4,
    damageDice: '1d6+2',
    speed: 30,
    isAlive: hp > 0,
  }
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = result.content.find(c => c.type === 'text')?.text
  return text ? JSON.parse(text) : result
}

test.beforeEach(() => {
  gameState.resetState()
})

test('rollDice parses notation and keeps totals in range', () => {
  const result = dice.rollDice('2d6+3')

  assert.equal(result.notation, '2d6+3')
  assert.equal(result.rolls.length, 2)
  assert.equal(result.modifier, 3)
  assert.ok(result.total >= 5)
  assert.ok(result.total <= 15)
})

test('rollDice rejects invalid notation', () => {
  assert.throws(() => dice.rollDice('2d1'), /Dice sides/)
  assert.throws(() => dice.rollDice('not-dice'), /Invalid dice notation/)
})

test('replaceState deep-copies incoming state', () => {
  const source = JSON.parse(JSON.stringify(gameState.getState()))
  source.player.position = { x: 2, y: 3 }

  gameState.replaceState(source)
  source.player.position = { x: 99, y: 99 }

  assert.deepEqual(gameState.getState().player.position, { x: 2, y: 3 })
})

test('advanceTurn removes dead monsters from initiative', () => {
  gameState.spawnMonster(makeMonster('goblin_a'))
  gameState.spawnMonster(makeMonster('goblin_b'))
  gameState.setInitiativeOrder(['player', 'goblin_a', 'goblin_b'])
  gameState.updateMonsterHP('goblin_a', -99)

  const next = gameState.advanceTurn()
  const state = gameState.getState()

  assert.equal(next, 'goblin_b')
  assert.deepEqual(state.initiativeOrder, ['player', 'goblin_b'])
})

test('MCP server accepts replace_game_state and move_token toCell contracts', async () => {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['mcp-server/dist/mcp-server/index.js'],
    env: process.env,
  })
  const client = new Client({ name: 'mcp-engine-test', version: '1.0.0' })

  await client.connect(transport)
  try {
    const state = await callTool(client, 'get_game_state')
    state.player.position = { x: 4, y: 13 }

    await callTool(client, 'replace_game_state', { gameState: state })
    const afterReplace = await callTool(client, 'get_game_state')
    assert.deepEqual(afterReplace.player.position, { x: 4, y: 13 })

    await callTool(client, 'move_token', {
      tokenId: 'player',
      toCell: { x: 5, y: 13 },
    })
    const afterMove = await callTool(client, 'get_game_state')
    assert.deepEqual(afterMove.player.position, { x: 5, y: 13 })
  } finally {
    await client.close()
  }
})
