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
    actionUsed: {},
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

async function withForcedDiceSequence(sequence, fn) {
  const previous = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = sequence
  try {
    return await fn()
  } finally {
    if (previous === undefined) {
      delete process.env.AI_DM_TEST_DICE_SEQUENCE
    } else {
      process.env.AI_DM_TEST_DICE_SEQUENCE = previous
    }
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

test('rollDice can consume a forced test sequence', async () => {
  await withForcedDiceSequence('2,4', async () => {
    const result = dice.rollDice('2d6')

    assert.deepEqual(result.rolls, [2, 4])
    assert.equal(result.total, 6)
  })
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

test('replaceState infers current room from player position', () => {
  const source = JSON.parse(JSON.stringify(gameState.getState()))
  source.player.position = { x: 10, y: 10 }
  source.currentRoomId = null
  source.roomsVisited = []

  gameState.replaceState(source)
  const state = gameState.getState()

  assert.equal(state.currentRoomId, '4')
  assert.deepEqual(state.roomsVisited, ['4'])
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

test('advanceTurn keeps a dying player in initiative for death saves', () => {
  gameState.spawnMonster(makeMonster('goblin_a'))
  gameState.setInitiativeOrder(['goblin_a', 'player'])
  gameState.updatePlayerHP(-99)

  const next = gameState.advanceTurn()
  const state = gameState.getState()

  assert.equal(next, 'player')
  assert.deepEqual(state.initiativeOrder, ['goblin_a', 'player'])
  assert.equal(state.player.hp.current, 0)
  assert.ok(state.player.conditions.includes('unconscious'))
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
    assert.equal(afterMove.currentRoomId, '1')
    assert.deepEqual(afterMove.roomsVisited, ['1'])
  })
})

test('MCP move_token tracks room transitions for the player', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    await callTool(client, 'replace_game_state', { gameState: baseState })

    const move = await callTool(client, 'move_token', {
      tokenId: 'player',
      toCell: { x: 10, y: 10 },
    })

    assert.equal(move.success, true)
    assert.equal(move.currentRoomId, '4')
    assert.deepEqual(move.roomsVisited, ['1', '4'])

    const stateAfter = await callTool(client, 'get_game_state')
    assert.equal(stateAfter.currentRoomId, '4')
    assert.deepEqual(stateAfter.roomsVisited, ['1', '4'])
  })
})

test('MCP rules reject out-of-bounds movement destinations', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    baseState.player.position = { x: 4, y: 13 }
    await callTool(client, 'replace_game_state', { gameState: baseState })

    const offRightEdge = await callTool(client, 'move_token', {
      tokenId: 'player',
      toCell: { x: 17, y: 13 },
    })
    assert.equal(offRightEdge.code, 'INVALID_GRID_CELL')
    assert.deepEqual(offRightEdge.detail.bounds, { minX: 0, maxX: 16, minY: 0, maxY: 14 })

    const offBottomEdge = await callTool(client, 'move_token', {
      tokenId: 'player',
      toCell: { x: 4, y: 15 },
    })
    assert.equal(offBottomEdge.code, 'INVALID_GRID_CELL')

    const stateAfter = await callTool(client, 'get_game_state')
    assert.deepEqual(stateAfter.player.position, { x: 4, y: 13 })
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

test('MCP resolve_attack doubles damage dice on a natural 20', async () => {
  await withForcedDiceSequence('20,5,5', async () => {
    await withMcpClient(async client => {
      const baseState = await callTool(client, 'get_game_state')
      const combatState = makeCombatState(baseState)
      combatState.monsters.goblin_a.hp = { current: 30, max: 30 }
      combatState.monsters.goblin_a.ac = 99

      await callTool(client, 'replace_game_state', { gameState: combatState })

      const attack = await callTool(client, 'resolve_attack', {
        attackerId: 'player',
        targetId: 'goblin_a',
        weaponOrSpell: 'longsword',
        customDamageDice: '1d8+3',
      })

      assert.equal(attack.naturalRoll, 20)
      assert.equal(attack.criticalHit, true)
      assert.equal(attack.criticalMiss, false)
      assert.equal(attack.hit, true)
      assert.equal(attack.damageRoll.notation, '2d8+3')
      assert.deepEqual(attack.damageRoll.rolls, [5, 5])
      assert.equal(attack.damageDealt, 13)
      assert.match(attack.mechanicalSummary, /CRITIQUE/)
    })
  })
})

test('MCP resolve_attack misses on a natural 1 even with a high bonus', async () => {
  await withForcedDiceSequence('1', async () => {
    await withMcpClient(async client => {
      const baseState = await callTool(client, 'get_game_state')
      const combatState = makeCombatState(baseState)
      combatState.player.stats = { ...combatState.player.stats, str: 100 }
      combatState.monsters.goblin_a.ac = 1

      await callTool(client, 'replace_game_state', { gameState: combatState })

      const attack = await callTool(client, 'resolve_attack', {
        attackerId: 'player',
        targetId: 'goblin_a',
        weaponOrSpell: 'longsword',
      })

      assert.equal(attack.naturalRoll, 1)
      assert.equal(attack.criticalHit, false)
      assert.equal(attack.criticalMiss, true)
      assert.equal(attack.hit, false)
      assert.equal(attack.damageRoll, undefined)
      assert.match(attack.mechanicalSummary, /ECHEC CRITIQUE/)
    })
  })
})

test('MCP resolve_player_attack resolves a spatial target hint', async () => {
  await withForcedDiceSequence('20,1,1', async () => {
    await withMcpClient(async client => {
      const baseState = await callTool(client, 'get_game_state')
      const right = makeMonster('goblin_right', 20)
      right.position = { x: 2, y: 1 }
      const left = makeMonster('goblin_left', 20)
      left.position = { x: 0, y: 1 }

      await callTool(client, 'replace_game_state', {
        gameState: {
          ...baseState,
          phase: 'combat',
          currentTurn: 'player',
          round: 1,
          initiativeOrder: ['player', 'goblin_right', 'goblin_left'],
          movementUsed: {},
          actionUsed: {},
          player: {
            ...baseState.player,
            position: { x: 1, y: 1 },
          },
          monsters: {
            goblin_right: right,
            goblin_left: left,
          },
        },
      })

      const attack = await callTool(client, 'resolve_player_attack', {
        targetHint: 'right',
        weaponOrSpell: 'longsword',
        customDamageDice: '1d2',
      })

      assert.equal(attack.targetId, 'goblin_right')
      assert.equal(attack.criticalHit, true)
      assert.equal(attack.hit, true)
      assert.ok(attack.targetHpAfter < 20)

      const stateAfter = await callTool(client, 'get_game_state')
      assert.equal(stateAfter.monsters.goblin_right.hp.current, attack.targetHpAfter)
      assert.equal(stateAfter.monsters.goblin_left.hp.current, 20)
    })
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

test('MCP rules require an action before advancing the current turn', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')

    await callTool(client, 'replace_game_state', {
      gameState: makeCombatState(baseState),
    })

    const earlyNextTurn = await callTool(client, 'next_turn', { actorId: 'player' })
    assert.equal(earlyNextTurn.code, 'TURN_ACTION_REQUIRED')

    const attack = await callTool(client, 'resolve_attack', {
      attackerId: 'player',
      targetId: 'goblin_a',
      weaponOrSpell: 'longsword',
      customDamageDice: '1d2',
    })
    assert.equal(attack.attackerId, 'player')

    const secondAttack = await callTool(client, 'resolve_attack', {
      attackerId: 'player',
      targetId: 'goblin_a',
      weaponOrSpell: 'longsword',
    })
    assert.equal(secondAttack.code, 'ACTION_ALREADY_USED')

    const nextTurn = await callTool(client, 'next_turn', { actorId: 'player' })
    assert.equal(nextTurn.endedTurn, 'player')
    assert.equal(nextTurn.currentTurn, 'goblin_a')
  })
})

test('MCP pass_turn is limited to the player turn', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')

    await callTool(client, 'replace_game_state', {
      gameState: makeCombatState(baseState),
    })

    const passed = await callTool(client, 'pass_turn', {
      reason: 'Le joueur attend.',
    })
    assert.equal(passed.endedTurn, 'player')
    assert.equal(passed.currentTurn, 'goblin_a')
    assert.equal(passed.skippedAction, true)

    const blocked = await callTool(client, 'pass_turn', {
      reason: 'Le gobelin attend.',
    })
    assert.equal(blocked.code, 'PLAYER_TURN_REQUIRED')
  })
})

test('MCP rules do not consume an action for rejected range attempts', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')

    await callTool(client, 'replace_game_state', {
      gameState: makeCombatState(baseState, {
        currentTurn: 'goblin_a',
        playerPosition: { x: 0, y: 0 },
        monsterPosition: { x: 3, y: 0 },
      }),
    })

    const outOfRange = await callTool(client, 'resolve_attack', {
      attackerId: 'goblin_a',
      targetId: 'player',
      weaponOrSpell: 'cimeterre',
    })
    assert.equal(outOfRange.code, 'TARGET_OUT_OF_RANGE')

    const move = await callTool(client, 'move_token', {
      tokenId: 'goblin_a',
      toCell: { x: 1, y: 0 },
    })
    assert.equal(move.success, true)

    const attack = await callTool(client, 'resolve_attack', {
      attackerId: 'goblin_a',
      targetId: 'player',
      weaponOrSpell: 'cimeterre',
    })
    assert.equal(attack.attackerId, 'goblin_a')

    const secondAttack = await callTool(client, 'resolve_attack', {
      attackerId: 'goblin_a',
      targetId: 'player',
      weaponOrSpell: 'cimeterre',
    })
    assert.equal(secondAttack.code, 'ACTION_ALREADY_USED')

    const nextTurn = await callTool(client, 'next_turn', { actorId: 'goblin_a' })
    assert.equal(nextTurn.endedTurn, 'goblin_a')
    assert.equal(nextTurn.currentTurn, 'player')
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
    assert.deepEqual(forced.disengagedMonsters, [{ id: 'goblin_a', name: 'goblin_a', type: 'goblin' }])

    const stateAfter = await callTool(client, 'get_game_state')
    assert.equal(Object.values(stateAfter.monsters).filter(monster => monster.isAlive).length, 0)
  })
})

test('MCP roll_death_save tracks player death saves and consumes the turn action', async () => {
  await withForcedDiceSequence('19', async () => {
    await withMcpClient(async client => {
      const baseState = await callTool(client, 'get_game_state')
      const state = makeCombatState(baseState)
      state.player.hp.current = 0
      state.player.deathSaves = { successes: 0, failures: 0 }
      state.player.conditions = ['unconscious']

      await callTool(client, 'replace_game_state', { gameState: state })

      const deathSave = await callTool(client, 'roll_death_save')
      assert.equal(deathSave.roll.total, 19)
      assert.equal(deathSave.successes, 1)
      assert.equal(deathSave.failures, 0)
      assert.equal(deathSave.stable, false)
      assert.equal(deathSave.dead, false)

      const afterSave = await callTool(client, 'get_game_state')
      assert.equal(afterSave.actionUsed.player, true)
      assert.deepEqual(afterSave.player.deathSaves, { successes: 1, failures: 0 })

      const nextTurn = await callTool(client, 'next_turn', { actorId: 'player' })
      assert.equal(nextTurn.currentTurn, 'goblin_a')
    })
  })
})

test('MCP roll_death_save stabilizes the player on three successes', async () => {
  await withForcedDiceSequence('12', async () => {
    await withMcpClient(async client => {
      const baseState = await callTool(client, 'get_game_state')
      const state = makeCombatState(baseState)
      state.player.hp.current = 0
      state.player.deathSaves = { successes: 2, failures: 0 }
      state.player.conditions = ['unconscious']

      await callTool(client, 'replace_game_state', { gameState: state })

      const deathSave = await callTool(client, 'roll_death_save')
      assert.equal(deathSave.stable, true)
      assert.equal(deathSave.dead, false)
      assert.equal(deathSave.successes, 0)
      assert.equal(deathSave.failures, 0)

      const afterSave = await callTool(client, 'get_game_state')
      assert.deepEqual(afterSave.player.deathSaves, { successes: 0, failures: 0, stable: true })

      const nextTurn = await callTool(client, 'next_turn', { actorId: 'player' })
      assert.equal(nextTurn.currentTurn, 'goblin_a')
      assert.deepEqual(nextTurn.initiativeOrder, ['goblin_a'])
    })
  })
})

test('MCP start_encounter atomically moves player, spawns real IDs, and enters combat', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    await callTool(client, 'replace_game_state', { gameState: baseState })

    const encounter = await callTool(client, 'start_encounter', {
      encounterId: 'bakery_floor_goblins',
      reason: 'Le joueur provoque les gobelins du sol de la boulangerie.',
    })

    assert.equal(encounter.roomId, '8')
    assert.deepEqual(encounter.movedPlayer.to, { x: 9, y: 6 })
    assert.equal(encounter.spawnedMonsters.length, 3)
    assert.ok(encounter.spawnedMonsters.every(monster => monster.id.startsWith('goblin_')))
    assert.ok(encounter.spawnedMonsters.every(monster => !['goblin1', 'goblin2', 'goblin3'].includes(monster.id)))
    assert.equal(encounter.combat.phase, 'combat')
    assert.equal(encounter.combat.initiativeOrder.length, 4)
    assert.equal(encounter.combat.currentTurn, 'player')
    assert.equal(encounter.combat.initiativeOrder[0], 'player')
    assert.ok(encounter.combat.initiativeOrder.includes('player'))

    const spawnedIds = encounter.spawnedMonsters.map(monster => monster.id)
    for (const id of spawnedIds) {
      assert.ok(encounter.combat.initiativeOrder.includes(id))
    }

    const stateAfter = await callTool(client, 'get_game_state')
    assert.equal(stateAfter.phase, 'combat')
    assert.equal(stateAfter.currentRoomId, '8')
    assert.ok(stateAfter.roomsVisited.includes('8'))
    assert.deepEqual(stateAfter.player.position, { x: 9, y: 6 })
    assert.deepEqual(Object.keys(stateAfter.monsters).sort(), spawnedIds.sort())
  })
})

test('MCP combat scenario resolves movement, attacks, turn order, and combat end', async () => {
  await withForcedDiceSequence('10,10,10,1,10,1,10', async () => {
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
    assert.deepEqual(finalState.actionUsed, {})
    assert.equal(finalState.monsters[monster.id].isAlive, false)
    assert.ok(finalState.combatLog.length >= 5)
    })
  })
})
