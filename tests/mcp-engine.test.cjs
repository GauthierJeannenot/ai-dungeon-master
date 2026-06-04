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

test('replaceState preserves scene memory', () => {
  const source = JSON.parse(JSON.stringify(gameState.getState()))
  source.sceneMemory = {
    madeNoise: true,
    tension: 2,
    alertLevel: 3,
    macDisposition: 'offended',
    goblinMorale: 'shaken',
    patrolPressure: 'stirring',
    lastDirectorBeats: ['noise-made'],
    lastWorldSignals: ['Du bruit porte plus loin.'],
    updatedAt: '2026-06-04T00:00:00.000Z',
  }

  gameState.replaceState(source)
  const state = gameState.getState()

  assert.deepEqual(state.sceneMemory, source.sceneMemory)
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

test('advanceTurn does not skip the next monster when the current player is filtered out', () => {
  gameState.spawnMonster(makeMonster('goblin_a'))
  gameState.spawnMonster(makeMonster('goblin_b'))
  gameState.setInitiativeOrder(['player', 'goblin_a', 'goblin_b'])
  gameState.updatePlayerHP(-99)
  gameState.getState().player.deathSaves = { successes: 0, failures: 0, stable: true }

  const next = gameState.advanceTurn()
  const state = gameState.getState()

  assert.equal(next, 'goblin_a')
  assert.deepEqual(state.initiativeOrder, ['goblin_a', 'goblin_b'])
})

test('player damage at 0 HP records death failures and ordinary healing does not revive the dead', () => {
  gameState.updatePlayerHP(-99)
  gameState.updatePlayerHP(-1)
  gameState.updatePlayerHP(-1)
  gameState.updatePlayerHP(-1)

  const deadState = gameState.getState()
  assert.equal(deadState.player.hp.current, 0)
  assert.equal(deadState.player.deathSaves.dead, true)
  assert.equal(deadState.player.deathSaves.failures, 3)

  gameState.updatePlayerHP(20)
  const healedState = gameState.getState()
  assert.equal(healedState.player.hp.current, 0)
  assert.equal(healedState.player.deathSaves.dead, true)
})

test('MCP server accepts replace_game_state and move_token toCell contracts', async () => {
  await withMcpClient(async client => {
    const state = await callTool(client, 'get_game_state')
    state.player.position = { x: 4, y: 13 }
    state.sceneMemory = {
      madeNoise: true,
      tension: 2,
      alertLevel: 3,
      macDisposition: 'offended',
      goblinMorale: 'shaken',
      patrolPressure: 'hunting',
      lastDirectorBeats: ['noise-made'],
      lastWorldSignals: ['Du bruit porte plus loin.'],
      updatedAt: '2026-06-04T00:00:00.000Z',
    }

    await callTool(client, 'replace_game_state', { gameState: state })
    const afterReplace = await callTool(client, 'get_game_state')
    assert.deepEqual(afterReplace.player.position, { x: 4, y: 13 })
    assert.deepEqual(afterReplace.sceneMemory, state.sceneMemory)

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
    const lastLog = stateAfter.combatLog.at(-1)
    assert.match(lastLog.action, /se deplace/)
    assert.match(lastLog.mechanicalDetail, /Deplacement \(4,13\) -> \(10,10\)/)
    assert.match(lastLog.mechanicalDetail, /salle 1 -> 4/)
  })
})

test('MCP move_token clears current room outside mapped adventure zones', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    await callTool(client, 'replace_game_state', { gameState: baseState })

    const move = await callTool(client, 'move_token', {
      tokenId: 'player',
      toCell: { x: 0, y: 0 },
    })
    assert.equal(move.success, true)
    assert.equal(move.currentRoomId, null)

    const blocked = await callTool(client, 'trigger_room_event', {
      roomId: '1',
      eventType: 'custom',
      description: 'Un evenement dans une salle que le joueur a quittee.',
    })
    assert.equal(blocked.code, 'ROOM_EVENT_LOCATION_MISMATCH')

    const stateAfter = await callTool(client, 'get_game_state')
    assert.equal(stateAfter.currentRoomId, null)
    assert.deepEqual(stateAfter.player.position, { x: 0, y: 0 })
  })
})

test('MCP trigger_room_event cannot mutate a room outside the current player room', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    await callTool(client, 'replace_game_state', { gameState: baseState })

    const blocked = await callTool(client, 'trigger_room_event', {
      roomId: '8',
      eventType: 'ambush',
      description: 'Les gobelins surgissent sans deplacement.',
    })
    assert.equal(blocked.code, 'ROOM_EVENT_LOCATION_MISMATCH')

    const stateAfter = await callTool(client, 'get_game_state')
    assert.equal(stateAfter.currentRoomId, '1')
    assert.deepEqual(stateAfter.roomsVisited, ['1'])
    assert.equal(stateAfter.combatLog.length, 0)
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

test('MCP rules reject out-of-bounds monster spawns and encounter cells', async () => {
  await withMcpClient(async client => {
    const spawn = await callTool(client, 'spawn_monster', {
      monsterType: 'goblin',
      cell: { x: 99, y: 6 },
    })
    assert.equal(spawn.code, 'INVALID_GRID_CELL')

    const encounter = await callTool(client, 'start_encounter', {
      monsters: [{
        monsterType: 'goblin',
        cell: { x: 5, y: 99 },
        name: 'Gobelin hors carte',
      }],
    })
    assert.equal(encounter.code, 'INVALID_GRID_CELL')
  })
})

test('MCP spawn_monster places neutral creatures without starting combat', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    await callTool(client, 'replace_game_state', { gameState: baseState })

    // Dryade: template non hostile => disposition neutral par défaut, pas de combat.
    const dryad = await callTool(client, 'spawn_monster', {
      monsterType: 'dryad',
      cell: { x: 6, y: 6 },
    })
    assert.equal(dryad.disposition, 'neutral')
    assert.equal(dryad.isAlive, true)

    // Gobelin: hostile par défaut.
    const goblin = await callTool(client, 'spawn_monster', {
      monsterType: 'goblin',
      cell: { x: 7, y: 6 },
    })
    assert.equal(goblin.disposition, 'hostile')

    // Override explicite.
    const friendly = await callTool(client, 'spawn_monster', {
      monsterType: 'goblin',
      cell: { x: 8, y: 6 },
      disposition: 'friendly',
    })
    assert.equal(friendly.disposition, 'friendly')

    // Aucun combat déclenché par spawn_monster.
    const stateAfter = await callTool(client, 'get_game_state')
    assert.equal(stateAfter.phase, 'exploration')
  })
})

test('MCP start_encounter forces hostile disposition even for neutral templates', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    await callTool(client, 'replace_game_state', { gameState: baseState })

    const encounter = await callTool(client, 'start_encounter', {
      playerCell: { x: 4, y: 6 },
      monsters: [{ monsterType: 'dryad', cell: { x: 5, y: 6 }, name: 'Dryade enragée' }],
    })
    assert.equal(encounter.spawnedMonsters[0].disposition, 'hostile')
    assert.equal(encounter.combat.phase, 'combat')
  })
})

test('MCP resolve_player_attack auto-engages combat against neutral creatures on the grid', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    await callTool(client, 'replace_game_state', { gameState: baseState })
    // Player default position is (4,13); place goblins in melee range.

    const goblin1 = await callTool(client, 'spawn_monster', {
      monsterType: 'goblin', cell: { x: 5, y: 13 }, name: 'Gobelin patrouille 1', disposition: 'neutral',
    })
    const goblin2 = await callTool(client, 'spawn_monster', {
      monsterType: 'goblin', cell: { x: 4, y: 12 }, name: 'Gobelin patrouille 2', disposition: 'neutral',
    })
    // A neutral creature of a DIFFERENT type must stay out of the fight.
    const dryad = await callTool(client, 'spawn_monster', {
      monsterType: 'dryad', cell: { x: 3, y: 13 }, disposition: 'neutral',
    })

    // Still exploration before the attack.
    let state = await callTool(client, 'get_game_state')
    assert.equal(state.phase, 'exploration')

    const attack = await callTool(client, 'resolve_player_attack', {
      targetName: 'Gobelin patrouille 1',
    })

    // Combat engaged in one call, player acts first, exact-named goblin targeted.
    assert.equal(attack.combatEngaged, true)
    assert.equal(attack.phase, 'combat')
    assert.equal(attack.currentTurn, 'player')
    assert.equal(attack.targetId, goblin1.id)

    state = await callTool(client, 'get_game_state')
    assert.equal(state.phase, 'combat')
    // Both goblins (same type) joined and turned hostile; the dryad did not.
    assert.equal(state.monsters[goblin1.id].disposition, 'hostile')
    assert.equal(state.monsters[goblin2.id].disposition, 'hostile')
    assert.equal(state.monsters[dryad.id].disposition, 'neutral')
    assert.ok(state.initiativeOrder.includes(goblin1.id))
    assert.ok(state.initiativeOrder.includes(goblin2.id))
    assert.ok(state.initiativeOrder.includes('player'))
    assert.ok(!state.initiativeOrder.includes(dryad.id))
  })
})

test('MCP resolve_player_attack picks nearest when a fuzzy name is ambiguous', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    await callTool(client, 'replace_game_state', { gameState: baseState })

    const near = await callTool(client, 'spawn_monster', {
      monsterType: 'goblin', cell: { x: 5, y: 13 }, name: 'Gobelin proche', disposition: 'neutral',
    })
    await callTool(client, 'spawn_monster', {
      monsterType: 'goblin', cell: { x: 9, y: 9 }, name: 'Gobelin loin', disposition: 'neutral',
    })

    // "gobelin" matches both; the engine resolves to the nearest instead of erroring.
    const attack = await callTool(client, 'resolve_player_attack', { targetName: 'gobelin' })
    assert.notEqual(attack.code, 'TARGET_AMBIGUOUS')
    assert.equal(attack.targetId, near.id)
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

test('MCP resolve_attack can target a dying player and records death save failures', async () => {
  await withForcedDiceSequence('10,10,1,1', async () => {
    await withMcpClient(async client => {
      const baseState = await callTool(client, 'get_game_state')
      const state = makeCombatState(baseState, { currentTurn: 'goblin_a' })
      state.player.hp.current = 0
      state.player.ac = 1
      state.player.deathSaves = { successes: 0, failures: 0 }
      state.player.conditions = ['unconscious']

      await callTool(client, 'replace_game_state', { gameState: state })

      const attack = await callTool(client, 'resolve_attack', {
        attackerId: 'goblin_a',
        targetId: 'player',
        weaponOrSpell: 'cimeterre',
        customDamageDice: '1d2',
      })

      assert.equal(attack.hit, true)
      assert.equal(attack.criticalHit, true)
      assert.equal(attack.targetDied, false)
      assert.equal(attack.targetHpAfter, 0)
      assert.match(attack.mechanicalSummary, /A TERRE/)
      assert.match(attack.mechanicalSummary, /2 echecs mort/)

      const stateAfter = await callTool(client, 'get_game_state')
      assert.deepEqual(stateAfter.player.deathSaves, { successes: 0, failures: 2, stable: false })
      assert.equal(stateAfter.actionUsed.goblin_a, true)
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

test('MCP resolve_player_attack resolves a named target before nearest fallback', async () => {
  await withForcedDiceSequence('20,1,1', async () => {
    await withMcpClient(async client => {
      const baseState = await callTool(client, 'get_game_state')
      const guard = makeMonster('goblin_guard', 20)
      guard.name = 'Gobelin Garde'
      guard.position = { x: 1, y: 0 }
      const grukk = makeMonster('chef_grukk', 20)
      grukk.name = 'Chef Grukk'
      grukk.type = 'hobgoblin'
      grukk.position = { x: 1, y: 1 }

      await callTool(client, 'replace_game_state', {
        gameState: {
          ...baseState,
          phase: 'combat',
          currentTurn: 'player',
          round: 1,
          initiativeOrder: ['player', guard.id, grukk.id],
          movementUsed: {},
          actionUsed: {},
          player: {
            ...baseState.player,
            position: { x: 0, y: 0 },
          },
          monsters: {
            [guard.id]: guard,
            [grukk.id]: grukk,
          },
        },
      })

      const attack = await callTool(client, 'resolve_player_attack', {
        targetName: 'Grukk',
        weaponOrSpell: 'longsword',
        customDamageDice: '1d2',
      })

      assert.equal(attack.targetId, grukk.id)
      assert.equal(attack.hit, true)

      const stateAfter = await callTool(client, 'get_game_state')
      assert.equal(stateAfter.monsters[grukk.id].hp.current, attack.targetHpAfter)
      assert.equal(stateAfter.monsters[guard.id].hp.current, 20)
    })
  })
})

test('MCP resolve_player_action resolves canonical attack, move, and item actions', async () => {
  await withForcedDiceSequence('20,1,1,3,4', async () => {
    await withMcpClient(async client => {
      const baseState = await callTool(client, 'get_game_state')
      const state = makeCombatState(baseState)
      state.player.hp.current = 10
      state.player.inventory = [
        ...state.player.inventory,
        { id: 'potion_extra', name: 'Potion de soin', type: 'potion', description: 'Restaure 2d4+2 HP' },
      ]
      state.monsters.goblin_a.position = { x: 2, y: 0 }

      await callTool(client, 'replace_game_state', { gameState: state })

      const move = await callTool(client, 'resolve_player_action', {
        action: {
          kind: 'move',
          toCell: { x: 1, y: 0 },
        },
      })

      assert.equal(move.kind, 'move')
      assert.equal(move.toolEquivalent, 'move_token')
      assert.equal(move.result.distanceMoved, 1)
      assert.deepEqual(move.gameState.player.position, { x: 1, y: 0 })
      assert.equal(move.gameState.movementUsed.player, 1)

      const attack = await callTool(client, 'resolve_player_action', {
        action: {
          kind: 'attack',
          targetHint: 'nearest',
          weaponOrSpell: 'longsword',
          customDamageDice: '1d2',
        },
      })

      assert.equal(attack.kind, 'attack')
      assert.equal(attack.toolEquivalent, 'resolve_player_attack')
      assert.equal(attack.result.targetId, 'goblin_a')
      assert.equal(attack.result.hit, true)
      assert.equal(attack.gameState.actionUsed.player, true)

      const advanced = await callTool(client, 'next_turn', { actorId: 'player' })
      assert.equal(advanced.currentTurn, 'goblin_a')
      const monsterPass = await callTool(client, 'next_turn', { actorId: 'goblin_a', skipAction: true })
      assert.equal(monsterPass.currentTurn, 'player')

      const potion = await callTool(client, 'resolve_player_action', {
        action: {
          kind: 'use_item',
          itemId: 'potion_extra',
        },
      })

      assert.equal(potion.kind, 'use_item')
      assert.equal(potion.toolEquivalent, 'use_healing_potion')
      assert.equal(potion.result.hpBefore, 10)
      assert.equal(potion.result.hpAfter, 19)
      assert.equal(potion.gameState.player.hp.current, 19)
    })
  })
})

test('MCP resolve_player_action propagates canonical action errors', async () => {
  await withMcpClient(async client => {
    const result = await callTool(client, 'resolve_player_action', {
      action: {
        kind: 'ability_check',
        entityId: 'missing_entity',
        ability: 'wis',
      },
    })

    assert.equal(result.code, 'ENTITY_NOT_FOUND')
    assert.equal(result.success, undefined)
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

test('MCP rules treat a dying player as occupying their cell', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    const state = makeCombatState(baseState, {
      currentTurn: 'goblin_a',
      playerPosition: { x: 0, y: 0 },
      monsterPosition: { x: 2, y: 0 },
    })
    state.player.hp.current = 0
    state.player.deathSaves = { successes: 0, failures: 0 }
    state.player.conditions = ['unconscious']

    await callTool(client, 'replace_game_state', { gameState: state })

    const move = await callTool(client, 'move_token', {
      tokenId: 'goblin_a',
      toCell: { x: 0, y: 0 },
    })
    assert.equal(move.code, 'CELL_OCCUPIED')

    const stateAfter = await callTool(client, 'get_game_state')
    assert.deepEqual(stateAfter.monsters.goblin_a.position, { x: 2, y: 0 })
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

test('MCP roll_ability_check resolves skill checks and consumes a combat action', async () => {
  await withForcedDiceSequence('10', async () => {
    await withMcpClient(async client => {
      const baseState = await callTool(client, 'get_game_state')
      const state = makeCombatState(baseState)
      state.player.stats = { ...state.player.stats, cha: 16 }
      state.player.proficiencyBonus = 2

      await callTool(client, 'replace_game_state', { gameState: state })

      const check = await callTool(client, 'roll_ability_check', {
        ability: 'cha',
        dc: 14,
        proficient: true,
        label: 'Persuasion',
      })

      assert.equal(check.entityId, 'player')
      assert.equal(check.ability, 'cha')
      assert.equal(check.label, 'Persuasion')
      assert.equal(check.success, true)
      assert.equal(check.roll.total, 15)
      assert.match(check.mechanicalSummary, /Persuasion/)
      assert.match(check.mechanicalSummary, /DD 14/)

      const stateAfter = await callTool(client, 'get_game_state')
      assert.equal(stateAfter.actionUsed.player, true)

      const nextTurn = await callTool(client, 'next_turn', { actorId: 'player' })
      assert.equal(nextTurn.currentTurn, 'goblin_a')
    })
  })
})

test('MCP roll_ability_check is limited to the actor turn in combat', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')

    await callTool(client, 'replace_game_state', {
      gameState: makeCombatState(baseState, { currentTurn: 'goblin_a' }),
    })

    const wrongTurn = await callTool(client, 'roll_ability_check', {
      ability: 'cha',
      dc: 14,
      label: 'Persuasion',
      proficient: true,
    })

    assert.equal(wrongTurn.code, 'NOT_CURRENT_TURN')
  })
})

test('MCP entity tools return canonical not-found rule errors', async () => {
  await withMcpClient(async client => {
    const attack = await callTool(client, 'resolve_attack', {
      attackerId: 'missing_actor',
      targetId: 'player',
      weaponOrSpell: 'longsword',
    })
    assert.equal(attack.code, 'ENTITY_NOT_FOUND')
    assert.equal(attack.detail.entityId, 'missing_actor')

    const check = await callTool(client, 'roll_ability_check', {
      entityId: 'missing_actor',
      ability: 'cha',
      dc: 14,
    })
    assert.equal(check.code, 'ENTITY_NOT_FOUND')
    assert.equal(check.detail.entityId, 'missing_actor')

    const save = await callTool(client, 'resolve_saving_throw', {
      entityId: 'missing_actor',
      ability: 'dex',
      dc: 10,
    })
    assert.equal(save.code, 'ENTITY_NOT_FOUND')
    assert.equal(save.detail.entityId, 'missing_actor')

    const stats = await callTool(client, 'get_entity_stats', {
      entityId: 'missing_actor',
    })
    assert.equal(stats.code, 'ENTITY_NOT_FOUND')
    assert.equal(stats.detail.entityId, 'missing_actor')
  })
})

test('MCP resolve_saving_throw does not consume the combat action', async () => {
  await withForcedDiceSequence('12', async () => {
    await withMcpClient(async client => {
      const baseState = await callTool(client, 'get_game_state')

      await callTool(client, 'replace_game_state', {
        gameState: makeCombatState(baseState),
      })

      const save = await callTool(client, 'resolve_saving_throw', {
        entityId: 'player',
        ability: 'dex',
        dc: 10,
      })
      assert.equal(save.success, true)

      const stateAfter = await callTool(client, 'get_game_state')
      assert.equal(stateAfter.actionUsed.player, undefined)

      const nextTurn = await callTool(client, 'next_turn', { actorId: 'player' })
      assert.equal(nextTurn.code, 'TURN_ACTION_REQUIRED')
    })
  })
})

test('MCP use_healing_potion heals, consumes inventory, and consumes a combat action', async () => {
  await withForcedDiceSequence('3,4', async () => {
    await withMcpClient(async client => {
      const baseState = await callTool(client, 'get_game_state')
      const state = makeCombatState(baseState)
      state.player.hp.current = 10
      state.player.inventory = [
        ...state.player.inventory,
        { id: 'potion_extra', name: 'Potion de soin', type: 'potion', description: 'Restaure 2d4+2 HP' },
      ]

      await callTool(client, 'replace_game_state', { gameState: state })

      const potion = await callTool(client, 'use_healing_potion', {
        potionId: 'potion_extra',
      })

      assert.equal(potion.hpBefore, 10)
      assert.equal(potion.hpAfter, 19)
      assert.equal(potion.healingDone, 9)
      assert.equal(potion.remainingPotions, 1)
      assert.match(potion.mechanicalSummary, /HP 10\/20 -> 19\/20/)

      const stateAfter = await callTool(client, 'get_game_state')
      assert.equal(stateAfter.player.hp.current, 19)
      assert.equal(stateAfter.player.inventory.some(item => item.id === 'potion_extra'), false)
      assert.equal(stateAfter.actionUsed.player, true)
    })
  })
})

test('MCP use_healing_potion is limited to the player turn in combat', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')

    await callTool(client, 'replace_game_state', {
      gameState: makeCombatState(baseState, { currentTurn: 'goblin_a' }),
    })

    const wrongTurn = await callTool(client, 'use_healing_potion')
    assert.equal(wrongTurn.code, 'NOT_CURRENT_TURN')
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

test('MCP end_combat sees all living monsters and awards XP only once', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    const state = makeCombatState(baseState)
    const sideMonster = makeMonster('goblin_b')
    sideMonster.position = { x: 2, y: 0 }
    state.monsters.goblin_b = sideMonster
    state.monsters.goblin_a.hp.current = 0
    state.monsters.goblin_a.isAlive = false
    state.initiativeOrder = ['player', 'goblin_a']

    await callTool(client, 'replace_game_state', { gameState: state })

    const blocked = await callTool(client, 'end_combat')
    assert.equal(blocked.code, 'COMBATANTS_STILL_ACTIVE')
    assert.deepEqual(blocked.detail.livingCombatants, ['goblin_b'])

    state.monsters.goblin_b.hp.current = 0
    state.monsters.goblin_b.isAlive = false
    state.initiativeOrder = ['player', 'goblin_a', 'goblin_b']
    await callTool(client, 'replace_game_state', { gameState: state })

    const ended = await callTool(client, 'end_combat')
    assert.equal(ended.xpAwarded, 100)
    assert.equal(ended.defeatedMonsters.length, 2)

    const afterFirstCombat = await callTool(client, 'get_game_state')
    const newThreat = makeMonster('goblin_c')
    newThreat.position = { x: 1, y: 0 }
    await callTool(client, 'replace_game_state', {
      gameState: {
        ...afterFirstCombat,
        phase: 'combat',
        currentTurn: 'player',
        round: 1,
        initiativeOrder: ['player', 'goblin_c'],
        movementUsed: {},
        actionUsed: {},
        monsters: {
          ...afterFirstCombat.monsters,
          goblin_c: newThreat,
        },
      },
    })
    const secondState = await callTool(client, 'get_game_state')
    secondState.monsters.goblin_c.hp.current = 0
    secondState.monsters.goblin_c.isAlive = false
    await callTool(client, 'replace_game_state', { gameState: secondState })

    const secondEnded = await callTool(client, 'end_combat')
    assert.equal(secondEnded.xpAwarded, 50)
    assert.deepEqual(secondEnded.defeatedMonsters.map(monster => monster.id), ['goblin_c'])
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

      const secondDeathSave = await callTool(client, 'roll_death_save')
      assert.equal(secondDeathSave.code, 'ACTION_ALREADY_USED')
      const afterSecondAttempt = await callTool(client, 'get_game_state')
      assert.deepEqual(afterSecondAttempt.player.deathSaves, { successes: 1, failures: 0 })

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
    assert.deepEqual(stateAfter.encountersTriggered, ['bakery_floor_goblins'])
  })
})

test('MCP start_encounter rejects a preset encounter already triggered', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    await callTool(client, 'replace_game_state', { gameState: baseState })

    const encounter = await callTool(client, 'start_encounter', {
      encounterId: 'bakery_floor_goblins',
      reason: 'Premier declenchement.',
    })
    assert.equal(encounter.encounterId, 'bakery_floor_goblins')

    const afterEncounter = await callTool(client, 'get_game_state')
    for (const monster of Object.values(afterEncounter.monsters)) {
      monster.hp.current = 0
      monster.isAlive = false
    }
    await callTool(client, 'replace_game_state', { gameState: afterEncounter })
    const ended = await callTool(client, 'end_combat')
    assert.equal(ended.phase, 'exploration')

    const duplicate = await callTool(client, 'start_encounter', {
      encounterId: 'bakery_floor_goblins',
      reason: 'Tentative de respawn.',
    })
    assert.equal(duplicate.code, 'ENCOUNTER_ALREADY_RESOLVED')

    const finalState = await callTool(client, 'get_game_state')
    assert.equal(Object.values(finalState.monsters).filter(monster => monster.isAlive).length, 0)
    assert.deepEqual(finalState.encountersTriggered, ['bakery_floor_goblins'])
  })
})

test('MCP start_encounter rolls back partial mutations on late validation failure', async () => {
  await withMcpClient(async client => {
    const baseState = await callTool(client, 'get_game_state')
    const originalPosition = { x: 4, y: 13 }

    await callTool(client, 'replace_game_state', {
      gameState: {
        ...baseState,
        phase: 'exploration',
        currentTurn: null,
        round: 0,
        initiativeOrder: [],
        movementUsed: {},
        actionUsed: {},
        player: {
          ...baseState.player,
          hp: { current: 0, max: baseState.player.hp.max },
          deathSaves: { successes: 0, failures: 1 },
          position: originalPosition,
        },
        monsters: {},
        encountersTriggered: [],
      },
    })

    const failed = await callTool(client, 'start_encounter', {
      encounterId: 'bakery_floor_goblins',
      playerCell: { x: 10, y: 13 },
      reason: 'test rollback when player cannot enter combat',
    })
    assert.equal(failed.code, 'ENTITY_DEAD')

    const stateAfter = await callTool(client, 'get_game_state')
    assert.equal(stateAfter.phase, 'exploration')
    assert.deepEqual(stateAfter.player.position, originalPosition)
    assert.deepEqual(Object.keys(stateAfter.monsters), [])
    assert.deepEqual(stateAfter.encountersTriggered, [])
    assert.equal(stateAfter.currentTurn, null)
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
