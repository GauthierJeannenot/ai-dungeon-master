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

function makeCombatState(baseState, overrides = {}) {
  const monster = makeMonster('goblin_a')
  monster.position = overrides.monsterPosition ?? { x: 1, y: 0 }

  return {
    ...baseState,
    phase: 'combat',
    currentTurn: overrides.currentTurn ?? 'player',
    round: 1,
    initiativeOrder: ['player', 'goblin_a'],
    movementUsed: {},
    player: {
      ...baseState.player,
      position: overrides.playerPosition ?? { x: 0, y: 0 },
    },
    monsters: { goblin_a: monster },
  }
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = result.content.find(c => c.type === 'text')?.text
  return text ? JSON.parse(text) : result
}

async function withMcpClient(fn) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['mcp-server/dist/mcp-server/index.js'],
    env: process.env,
  })
  const client = new Client({ name: 'mcp-engine-test', version: '1.0.0' })

  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close()
  }
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

test('d20WithModifier formats positive, zero, and negative modifiers', () => {
  assert.equal(dice.d20WithModifier(5), '1d20+5')
  assert.equal(dice.d20WithModifier(0), '1d20')
  assert.equal(dice.d20WithModifier(-5), '1d20-5')
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
  await withMcpClient(async client => {
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
  })
})

test('MCP rules reject attacks outside the active turn and range', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')

    await callTool(client, 'replace_game_state', {
      gameState: makeCombatState(baseState, { currentTurn: 'goblin_a' }),
    })
    const wrongTurn = await callTool(client, 'resolve_attack', {
      attackerId: 'player',
      targetId: 'goblin_a',
      weaponOrSpell: 'longsword',
    })
    assert.equal(wrongTurn.code, 'NOT_CURRENT_TURN')

    await callTool(client, 'replace_game_state', {
      gameState: makeCombatState(baseState, { monsterPosition: { x: 3, y: 0 } }),
    })
    const outOfRange = await callTool(client, 'resolve_attack', {
      attackerId: 'player',
      targetId: 'goblin_a',
      weaponOrSpell: 'longsword',
    })
    assert.equal(outOfRange.code, 'TARGET_OUT_OF_RANGE')
  })
})

test('MCP rules reject overlong combat movement and occupied cells', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')

    await callTool(client, 'replace_game_state', {
      gameState: makeCombatState(baseState),
    })
    const occupied = await callTool(client, 'move_token', {
      tokenId: 'player',
      toCell: { x: 1, y: 0 },
    })
    assert.equal(occupied.code, 'CELL_OCCUPIED')

    const tooFar = await callTool(client, 'move_token', {
      tokenId: 'player',
      toCell: { x: 7, y: 0 },
    })
    assert.equal(tooFar.code, 'MOVEMENT_EXCEEDED')

    const stateAfter = await callTool(client, 'get_game_state')
    assert.deepEqual(stateAfter.player.position, { x: 0, y: 0 })
  })
})

test('MCP rules require force to end combat with active enemies', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')

    await callTool(client, 'replace_game_state', {
      gameState: makeCombatState(baseState),
    })
    const blocked = await callTool(client, 'end_combat')
    assert.equal(blocked.code, 'COMBATANTS_STILL_ACTIVE')

    const forced = await callTool(client, 'end_combat', {
      force: true,
      reason: 'Les gobelins fuient.',
    })
    assert.equal(forced.phase, 'exploration')
    assert.equal(forced.reason, 'Les gobelins fuient.')
  })
})

test('MCP combat scenario resolves movement, attacks, turn order, and combat end', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    baseState.player.position = { x: 0, y: 0 }
    baseState.player.stats = { ...baseState.player.stats, str: 100, dex: 100 }
    baseState.player.ac = 1
    baseState.player.hp = { current: 20, max: 20 }

    await callTool(client, 'replace_game_state', { gameState: baseState })
    const monster = await callTool(client, 'spawn_monster', {
      monsterType: 'training_dummy',
      cell: { x: 2, y: 0 },
      name: 'Training Dummy',
      hpOverride: 50,
    })

    const stagedState = await callTool(client, 'get_game_state')
    stagedState.monsters[monster.id] = {
      ...stagedState.monsters[monster.id],
      stats: { ...stagedState.monsters[monster.id].stats, dex: 1 },
      attackBonus: 50,
      damageDice: '1d2',
    }
    await callTool(client, 'replace_game_state', { gameState: stagedState })

    const combat = await callTool(client, 'enter_combat', {
      combatants: ['player', monster.id],
    })
    assert.equal(combat.phase, 'combat')
    assert.equal(combat.currentTurn, 'player')

    const move = await callTool(client, 'move_token', {
      tokenId: 'player',
      toCell: { x: 1, y: 0 },
    })
    assert.equal(move.success, true)
    assert.equal(move.distanceMoved, 1)
    assert.equal(move.remainingMovement, 5)

    const firstAttack = await callTool(client, 'resolve_attack', {
      attackerId: 'player',
      targetId: monster.id,
      weaponOrSpell: 'longsword',
      customDamageDice: '1d2',
    })
    assert.equal(firstAttack.hit, true)
    assert.equal(firstAttack.targetDied, false)
    assert.ok(firstAttack.targetHpAfter < 50)

    const monsterTurn = await callTool(client, 'next_turn')
    assert.equal(monsterTurn.currentTurn, monster.id)

    const counterAttack = await callTool(client, 'resolve_attack', {
      attackerId: monster.id,
      targetId: 'player',
      weaponOrSpell: 'club',
      customDamageDice: '1d2',
    })
    assert.equal(counterAttack.hit, true)
    assert.equal(counterAttack.targetDied, false)
    assert.ok(counterAttack.targetHpAfter < 20)

    const playerTurn = await callTool(client, 'next_turn')
    assert.equal(playerTurn.currentTurn, 'player')

    const killingAttack = await callTool(client, 'resolve_attack', {
      attackerId: 'player',
      targetId: monster.id,
      weaponOrSpell: 'longsword',
      customDamageDice: '50d2',
    })
    assert.equal(killingAttack.hit, true)
    assert.equal(killingAttack.targetDied, true)
    assert.equal(killingAttack.targetHpAfter, 0)

    const ended = await callTool(client, 'end_combat')
    assert.equal(ended.phase, 'exploration')
    assert.equal(ended.xpAwarded, 50)
    assert.deepEqual(ended.defeatedMonsters, [{ id: monster.id, name: 'Training Dummy', xp: 50 }])

    const finalState = await callTool(client, 'get_game_state')
    assert.equal(finalState.phase, 'exploration')
    assert.equal(finalState.currentTurn, null)
    assert.equal(finalState.round, 0)
    assert.deepEqual(finalState.movementUsed, {})
    assert.equal(finalState.monsters[monster.id].isAlive, false)
    assert.ok(finalState.combatLog.length >= 5)
  })
})
