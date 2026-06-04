const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const Module = require('node:module')
const ts = require('typescript')

const sessionStoreDir = path.join(os.tmpdir(), `ai-dm-api-test-${process.pid}`)

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-ant-test-placeholder'
process.env.ALLOW_PAID_LLM = 'false'
process.env.APP_LOG_BUFFER_ENABLED = 'false'
process.env.APP_LOG_LEVEL = 'error'
process.env.APP_LOG_PERSIST_ENABLED = 'false'
process.env.GAME_SESSION_STORE_DIR = sessionStoreDir
process.env.LLM_MODE = 'mock'

function installTsRequireWithAliases() {
  const previousTs = Module._extensions['.ts']
  const previousResolve = Module._resolveFilename

  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      const mapped = path.join(process.cwd(), request.slice(2))
      return previousResolve.call(this, mapped, parent, isMain, options)
    }

    return previousResolve.call(this, request, parent, isMain, options)
  }

  Module._extensions['.ts'] = function loadTs(mod, filename) {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    mod._compile(output, filename)
  }

  return () => {
    Module._resolveFilename = previousResolve
    if (previousTs) Module._extensions['.ts'] = previousTs
    else delete Module._extensions['.ts']
  }
}

const restoreTsRequire = installTsRequireWithAliases()
const { POST } = require(path.join(process.cwd(), 'app/api/dm/route.ts'))
const { closeMCPClient } = require(path.join(process.cwd(), 'lib/mcp-client.ts'))
const { deleteSession } = require(path.join(process.cwd(), 'lib/session-store.ts'))

const DEFAULT_SCENE_NARRATIVE_PATTERN = /facade de la boulangerie grince|dans le verger, les branches|au quai de chargement, la porte laterale|dans l'entree, les traces|au sol de la boulangerie|dans l'appartement de grammy/i

test.after(() => {
  restoreTsRequire()
  fs.rmSync(sessionStoreDir, { recursive: true, force: true })
})

function baseGameState(overrides = {}) {
  return {
    phase: 'exploration',
    player: {
      id: 'player',
      name: 'Heros',
      class: 'Guerrier',
      level: 1,
      hp: { current: 20, max: 20 },
      ac: 16,
      stats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 },
      proficiencyBonus: 2,
      position: { x: 4, y: 13 },
      conditions: [],
      inventory: [
        { id: 'longsword', name: 'Epee longue', type: 'weapon', damage: '1d8+3' },
        { id: 'shield', name: 'Bouclier', type: 'armor', acBonus: 2 },
        { id: 'potion1', name: 'Potion de soin', type: 'potion', description: '2d4+2 HP' },
      ],
      speed: 30,
    },
    monsters: {},
    initiativeOrder: [],
    currentTurn: null,
    round: 0,
    movementUsed: {},
    actionUsed: {},
    combatLog: [],
    roomsVisited: ['1'],
    currentRoomId: '1',
    encountersTriggered: [],
    ...overrides,
  }
}

function makeGoblin(overrides = {}) {
  return {
    id: 'goblin_a',
    name: 'Gobelin test',
    type: 'goblin',
    hp: { current: 7, max: 7 },
    ac: 13,
    stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    position: { x: 5, y: 13 },
    conditions: [],
    xpValue: 50,
    attackBonus: 4,
    damageDice: '1d6+2',
    speed: 30,
    isAlive: true,
    ...overrides,
  }
}

function combatGameState() {
  return baseGameState({
    phase: 'combat',
    player: {
      ...baseGameState().player,
      position: { x: 4, y: 13 },
    },
    monsters: {
      goblin_a: makeGoblin(),
    },
    initiativeOrder: ['player', 'goblin_a'],
    currentTurn: 'player',
    round: 1,
  })
}

function downedCombatGameState() {
  const state = combatGameState()
  return {
    ...state,
    player: {
      ...state.player,
      hp: { current: 0, max: 20 },
      conditions: ['unconscious'],
      deathSaves: { successes: 0, failures: 2 },
    },
    actionUsed: {},
    movementUsed: {},
    combatLog: [
      {
        id: 'log-downed',
        round: 2,
        turn: 'goblin_a',
        action: 'Gobelin test attaque Heros',
        mechanicalDetail: 'Heros tombe a 0 PV | A TERRE (0 succes, 2 echecs mort)',
        timestamp: Date.now(),
      },
    ],
  }
}

function officeGameState() {
  return baseGameState({
    player: {
      ...baseGameState().player,
      position: { x: 5, y: 9 },
    },
    roomsVisited: ['5'],
    currentRoomId: '5',
  })
}

function bakeryEntranceGameState() {
  return baseGameState({
    player: {
      ...baseGameState().player,
      position: { x: 12, y: 11 },
    },
    roomsVisited: ['1', '4'],
    currentRoomId: '4',
  })
}

function bakeryFloorGameState() {
  return baseGameState({
    player: {
      ...baseGameState().player,
      position: { x: 9, y: 7 },
    },
    roomsVisited: ['1', '4', '8'],
    currentRoomId: '8',
  })
}

function loadingDockGameState() {
  return baseGameState({
    player: {
      ...baseGameState().player,
      position: { x: 4, y: 6 },
    },
    roomsVisited: ['1', '4', '7'],
    currentRoomId: '7',
  })
}

function lowHpPotionCombatGameState() {
  const state = combatGameState()
  return {
    ...state,
    player: {
      ...state.player,
      hp: { current: 1, max: 20 },
      ac: 5,
    },
    monsters: {
      goblin_a: makeGoblin({
        attackBonus: 10,
        damageDice: '1d6+2',
      }),
    },
  }
}

async function postDm(body) {
  const response = await POST(new Request('http://localhost/api/dm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))

  return {
    response,
    data: await response.json(),
  }
}

async function cleanupSession(sessionId) {
  await closeMCPClient(sessionId).catch(() => undefined)
  await deleteSession(sessionId).catch(() => undefined)
}

test('DM API resolves an exploration move through MCP in mock mode', async t => {
  const sessionId = `api-move-${process.pid}-${Date.now()}`
  t.after(() => cleanupSession(sessionId))

  const { response, data } = await postDm({
    message: 'je vais en (11,13)',
    clientRequestId: `client-${sessionId}`,
    sessionId,
    history: [],
  })

  assert.equal(response.status, 200)
  assert.ok(data.toolsUsed.includes('resolve_player_action'))
  assert.deepEqual(data.newGameState.player.position, { x: 11, y: 13 })
  assert.equal(typeof data.narrative, 'string')
  assert.ok(data.narrative.length > 0)
  assert.doesNotMatch(data.narrative, /\[Mock\]/)
  assert.doesNotMatch(data.narrative, /case|decor se replace/i)
  assert.equal(typeof data.newGameState.sceneMemory?.updatedAt, 'string')
  assert.ok(data.engine?.events?.some(event => event.type === 'entity.moved'))
  assert.ok(data.engine?.affordances?.some(action => action.kind === 'move' && action.enabled === true))
  assert.equal(data.turnTrace?.schemaVersion, 1)
  assert.equal(data.turnTrace?.input.raw, 'je vais en (11,13)')
  assert.ok(data.turnTrace?.actions.some(action => action.toolName === 'resolve_player_action' && action.executed))
  assert.ok(data.turnTrace?.engineEvents.some(event => event.type === 'entity.moved'))
  assert.ok(data.turnTrace?.worldDiff)
  assert.deepEqual(data.turnTrace?.contradictions, [])
  assert.equal(data.usage?.llm.calls, 1)
  assert.equal(data.usage?.narrator, 'llm')
  assert.equal(data.usage?.llmRoute, 'short')
})

test('DM API resolves a combat attack through MCP in mock mode', async t => {
  const sessionId = `api-attack-${process.pid}-${Date.now()}`
  const previousDice = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = '20,8,8'
  t.after(async () => {
    if (previousDice === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE
    else process.env.AI_DM_TEST_DICE_SEQUENCE = previousDice
    await cleanupSession(sessionId)
  })

  const { response, data } = await postDm({
    message: "j'attaque le gobelin",
    clientRequestId: `client-${sessionId}`,
    sessionId,
    gameState: combatGameState(),
    history: [],
  })

  assert.equal(response.status, 200)
  assert.ok(data.toolsUsed.includes('resolve_player_action'))
  assert.equal(data.newGameState.monsters.goblin_a.isAlive, false)
  assert.ok(data.newGameState.combatLog.some(entry => /attaque/i.test(entry.action)))
  assert.doesNotMatch(data.narrative, /\[Mock\]/)
  assert.equal(data.newGameState.sceneMemory?.madeNoise, true)
  assert.equal(data.newGameState.sceneMemory?.goblinMorale, 'shaken')
  assert.ok(data.engine?.events?.some(event => event.type === 'combat.attack'))
  assert.ok(data.engine?.affordances?.some(action => action.kind === 'move' && action.enabled === true))
  assert.equal(data.usage?.llm.calls, 1)
  assert.equal(data.usage?.narrator, 'llm')
  assert.equal(data.usage?.llmRoute, 'short')
})

test('DM API resolves creative improvisation as persistent fiction instead of default fallback', async t => {
  const sessionId = `api-improvise-${process.pid}-${Date.now()}`
  t.after(() => cleanupSession(sessionId))

  const { response, data } = await postDm({
    message: "je lance creation d'eau sous la porte pour mouiller le sol",
    clientRequestId: `client-${sessionId}`,
    sessionId,
    gameState: bakeryEntranceGameState(),
    history: [],
  })

  assert.equal(response.status, 200)
  assert.ok(data.toolsUsed.includes('resolve_player_action'))
  assert.equal(data.turnTrace?.intent.kind, 'improvise')
  assert.ok(data.turnTrace?.actions.some(action => action.toolName === 'resolve_player_action' && action.executed))
  assert.ok(data.engine?.events?.some(event => event.type === 'fiction.fact_created'))
  assert.ok(data.engine?.events?.some(event => event.type === 'improvisation.resolved'))
  assert.ok(Object.values(data.newGameState.world.fictionFacts).some(fact =>
    fact.text.includes("eau") &&
    fact.roomId === '4' &&
    fact.status === 'active'
  ))
  assert.ok(data.turnTrace?.worldDiff?.fictionFacts)
  assert.doesNotMatch(data.narrative, DEFAULT_SCENE_NARRATIVE_PATTERN)
  assert.doesNotMatch(data.narrative, /situation ne le permet pas|intention cherche une prise|geste se bloque/i)
})

test('DM API routes open social scenes through rich mock LLM narration', async t => {
  const sessionId = `api-social-${process.pid}-${Date.now()}`
  t.after(() => cleanupSession(sessionId))

  const { response, data } = await postDm({
    message: 'je negocie avec Mac pour le convaincre de nous aider',
    clientRequestId: `client-${sessionId}`,
    sessionId,
    gameState: baseGameState(),
    history: [],
  })

  assert.equal(response.status, 200)
  assert.ok((data.usage?.llm.calls ?? 0) >= 1)
  assert.ok((data.usage?.llm.calls ?? 0) <= 2)
  assert.equal(data.usage?.llmRoute, 'rich')
  assert.equal(data.usage?.narrator, 'llm')
})

test('DM API routes downed player status guidance through final LLM narration', async t => {
  const sessionId = `api-downed-status-${process.pid}-${Date.now()}`
  t.after(() => cleanupSession(sessionId))

  const { response, data } = await postDm({
    message: 'donc je suis mort la?',
    clientRequestId: `client-${sessionId}`,
    sessionId,
    gameState: downedCombatGameState(),
    history: [],
  })

  assert.equal(response.status, 200)
  assert.deepEqual(data.toolsUsed, [])
  assert.equal(data.newGameState.player.hp.current, 0)
  assert.equal(data.newGameState.currentTurn, 'player')
  assert.ok(data.engine?.affordances?.some(action => action.kind === 'death_save' && action.enabled === true))
  assert.ok(data.engine?.affordances?.some(action => action.kind === 'attack' && action.enabled === false))
  assert.equal(data.usage?.llm.calls, 1)
  assert.deepEqual(data.usage?.operations, ['dm.final_narration'])
  assert.equal(data.usage?.llmRoute, 'rich')
  assert.equal(data.usage?.narrator, 'llm')
})

test('DM API automatically resolves natural death save requests while player is down', async t => {
  const previousDice = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = '12,12,12,12'
  t.after(() => {
    if (previousDice === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE
    else process.env.AI_DM_TEST_DICE_SEQUENCE = previousDice
  })

  for (const message of ['je fais mon jet de mort', 'bah c est toi qui jettes les des']) {
    const sessionId = `api-death-save-${process.pid}-${Date.now()}-${message.length}`
    t.after(() => cleanupSession(sessionId))

    const { response, data } = await postDm({
      message,
      clientRequestId: `client-${sessionId}`,
      sessionId,
      gameState: downedCombatGameState(),
      history: [],
    })

    assert.equal(response.status, 200, message)
    assert.ok(data.toolsUsed.includes('resolve_player_action'), message)
    assert.ok(data.engine?.events?.some(event => event.type === 'combat.death_save'), message)
    assert.doesNotMatch(data.narrative, /a toi de lancer|lance(?:r)? toi|lance(?:r)? le de|jettes? toi/i, message)
  }
})

test('DM API resolves sensory movement toward smell origin from room 4', async t => {
  const sessionId = `api-sensory-move-${process.pid}-${Date.now()}`
  t.after(() => cleanupSession(sessionId))

  const { response, data } = await postDm({
    message: "je vais vers l'origine de l'odeur",
    clientRequestId: `client-${sessionId}`,
    sessionId,
    gameState: bakeryEntranceGameState(),
    history: [],
  })

  assert.equal(response.status, 200)
  assert.ok(data.toolsUsed.includes('resolve_player_action'))
  assert.ok(data.engine?.events?.some(event => event.type === 'entity.moved'))
  assert.equal(data.newGameState.currentRoomId, '8')
  assert.equal(data.newGameState.phase, 'exploration')
  assert.deepEqual(data.newGameState.player.position, { x: 9, y: 7 })
})

test('DM API resolves npc and landmark destinations through the location index', async t => {
  const cases = [
    ['tres bien je vais aller voir les dryades dans ce cas', baseGameState()],
    ['je me dirige vers les dryades', baseGameState()],
    ['je vais voir ta soeur', baseGameState()],
    ['je sors du quai de chargement et vais vers le verger', loadingDockGameState()],
  ]

  for (const [index, [message, gameState]] of cases.entries()) {
    const sessionId = `api-location-destination-${process.pid}-${Date.now()}-${index}`
    t.after(() => cleanupSession(sessionId))

    const { response, data } = await postDm({
      message,
      clientRequestId: `client-${sessionId}`,
      sessionId,
      gameState,
      history: [],
    })

    assert.equal(response.status, 200, message)
    assert.ok(data.toolsUsed.includes('resolve_player_action'), message)
    assert.ok(data.toolsUsed.includes('move_token'), message)
    assert.ok(data.engine?.events?.some(event => event.type === 'entity.moved'), message)
    assert.equal(data.newGameState.currentRoomId, '2', message)
    assert.deepEqual(data.newGameState.player.position, { x: 9, y: 2 }, message)
    assert.equal(data.debug?.targetResolution?.status, 'resolved', message)
    assert.equal(data.debug?.targetResolution?.target?.roomId, '2', message)
    assert.notEqual(data.newGameState.currentRoomId, '7', message)
  }
})

test('DM API blocks unresolved movement intents before default narration', async t => {
  const cases = [
    ['je pars vers la cachette secrete', baseGameState(), /destination|repere concret|destinations claires/i],
    ['je sors du quai de chargement', loadingDockGameState(), /sortie claire|Verger|Tas de dechets|Sol de la boulangerie/i],
  ]

  for (const [index, [message, gameState, narrativePattern]] of cases.entries()) {
    const sessionId = `api-unresolved-move-${process.pid}-${Date.now()}-${index}`
    t.after(() => cleanupSession(sessionId))

    const { response, data } = await postDm({
      message,
      clientRequestId: `client-${sessionId}`,
      sessionId,
      gameState,
      history: [],
    })

    assert.equal(response.status, 200, message)
    assert.deepEqual(data.toolsUsed, [], message)
    assert.ok(data.debug?.refusalCode?.startsWith('UNRESOLVED_MOVE'), message)
    assert.equal(data.turnTrace?.refusalCode, data.debug?.refusalCode, message)
    assert.equal(data.turnTrace?.actions?.[0]?.toolName, 'unresolved_intent', message)
    assert.equal(data.turnTrace?.actions?.[0]?.executed, false, message)
    assert.equal(data.usage?.llm.calls, 0, message)
    assert.equal(data.usage?.llmRoute, 'none', message)
    assert.match(data.narrative, narrativePattern, message)
    assert.doesNotMatch(data.narrative, /facade de la boulangerie grince|porte laterale bat doucement/i, message)
  }
})

test('DM API reconciles explicit room corrections through canonical movement', async t => {
  for (const [index, message] of ['non je suis au verger', 'bouge mon token dans le verger'].entries()) {
    const sessionId = `api-location-reconcile-${process.pid}-${Date.now()}-${index}`
    t.after(() => cleanupSession(sessionId))

    const { response, data } = await postDm({
      message,
      clientRequestId: `client-${sessionId}`,
      sessionId,
      gameState: loadingDockGameState(),
      history: [],
    })

    assert.equal(response.status, 200, message)
    assert.ok(data.toolsUsed.includes('resolve_player_action'), message)
    assert.ok(data.toolsUsed.includes('move_token'), message)
    assert.ok(data.engine?.events?.some(event => event.type === 'entity.moved'), message)
    assert.equal(data.newGameState.currentRoomId, '2', message)
    assert.deepEqual(data.newGameState.player.position, { x: 9, y: 2 }, message)
    assert.equal(data.turnTrace?.intent?.kind, 'state_reconcile', message)
    assert.equal(data.turnTrace?.targetResolution?.status, 'resolved', message)
    assert.equal(data.turnTrace?.targetResolution?.roomId, '2', message)
    assert.ok(data.turnTrace?.actions.some(action => action.toolName === 'resolve_player_action' && action.executed), message)
    assert.match(data.narrative, /verger/i, message)
    assert.doesNotMatch(data.narrative, /quai/i, message)
    assert.equal(data.usage?.llm.calls, 0, message)
    assert.equal(data.usage?.llmRoute, 'none', message)
  }
})

test('DM API refuses location reconciliation without a target room instead of teleporting', async t => {
  const sessionId = `api-location-reconcile-missing-${process.pid}-${Date.now()}`
  t.after(() => cleanupSession(sessionId))

  const { response, data } = await postDm({
    message: 'il faut me bouger',
    clientRequestId: `client-${sessionId}`,
    sessionId,
    gameState: loadingDockGameState(),
    history: [],
  })

  assert.equal(response.status, 200)
  assert.deepEqual(data.toolsUsed, [])
  assert.equal(data.newGameState.currentRoomId, '7')
  assert.deepEqual(data.newGameState.player.position, { x: 4, y: 6 })
  assert.equal(data.turnTrace?.intent?.kind, 'state_reconcile')
  assert.equal(data.turnTrace?.targetResolution?.status, 'missing_target')
  assert.match(data.narrative, /salle claire|verger|quai/i)
  assert.equal(data.usage?.llm.calls, 0)
  assert.equal(data.usage?.llmRoute, 'none')
})

test('DM API resolves the narrated initial front door through scene surface affordances', async t => {
  const previousDice = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = '20,20,20,20'
  t.after(() => {
    if (previousDice === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE
    else process.env.AI_DM_TEST_DICE_SEQUENCE = previousDice
  })

  for (const [index, message] of [
    'JE CASSE LA PORTE',
    'je detruis la porte et je rentre dans le batiment',
    'je pousse la porte',
    'je rentre',
    "je vais a l'interieur",
  ].entries()) {
    const sessionId = `api-front-door-${process.pid}-${Date.now()}-${index}`
    t.after(() => cleanupSession(sessionId))

    const { response, data } = await postDm({
      message,
      clientRequestId: `client-${sessionId}`,
      sessionId,
      gameState: baseGameState(),
      history: [],
    })

    assert.equal(response.status, 200, message)
    assert.ok(data.toolsUsed.includes('resolve_player_action'), message)
    assert.notEqual(data.debug?.refusalCode, 'WORLD_OBJECT_NOT_AFFORDED', message)
    assert.ok(data.debug?.actionPlan, message)
    assert.ok(data.debug?.sceneSurface?.objects?.some?.(object => object.id === 'front_double_door'), message)
    assert.ok(data.engine?.events?.some(event => event.type === 'door.opened' && event.targetId === 'front_double_door'), message)
    if (/casse|detruis/i.test(message)) assert.ok(data.toolsUsed.includes('world.force'), message)
    if (!/casse|detruis/i.test(message) && /pousse|rentre|interieur/i.test(message)) assert.ok(data.toolsUsed.includes('world.open'), message)
    if (/rentre|interieur|pousse|detruis/i.test(message)) {
      assert.ok(data.debug.actionPlan.steps.length >= 2, message)
      assert.ok(data.toolsUsed.includes('move_token'), message)
      assert.ok(data.engine?.events?.some(event => event.type === 'entity.moved'), message)
      assert.equal(data.newGameState.currentRoomId, '4', message)
    } else {
      assert.equal(data.debug.actionPlan.steps.length, 1, message)
    }
  }
})

test('DM API returns a useful ambiguity instead of moving through an unspecified interior door', async t => {
  const sessionId = `api-ambiguous-door-${process.pid}-${Date.now()}`
  t.after(() => cleanupSession(sessionId))

  const { response, data } = await postDm({
    message: 'je pousse la porte',
    clientRequestId: `client-${sessionId}`,
    sessionId,
    gameState: bakeryEntranceGameState(),
    history: [],
  })

  assert.equal(response.status, 200)
  assert.ok(data.toolsUsed.includes('resolve_player_action'))
  assert.equal(data.debug?.refusalCode, 'WORLD_OBJECT_AMBIGUOUS')
  assert.equal(data.debug?.actionPlan?.blocked?.code, 'ACTION_PLAN_TARGET_AMBIGUOUS')
  assert.ok(data.engine?.events?.some(event => event.type === 'action.blocked'))
  assert.equal(data.newGameState.currentRoomId, '4')
  assert.match(data.narrative, /plusieurs|cibles|laquelle|porte/i)
})

test('DM API refuses vague multi-exit exploration without triggering final encounter', async t => {
  const sessionId = `api-vague-explore-${process.pid}-${Date.now()}`
  t.after(() => cleanupSession(sessionId))

  const { response, data } = await postDm({
    message: "ok je change de piece alors, j'explore encore",
    clientRequestId: `client-${sessionId}`,
    sessionId,
    gameState: bakeryFloorGameState(),
    history: [],
  })

  assert.equal(response.status, 200)
  assert.equal(data.newGameState.phase, 'exploration')
  assert.equal(data.newGameState.currentRoomId, '8')
  assert.ok(!data.toolsUsed.includes('start_encounter'))
  assert.ok(!data.engine?.events?.some(event => event.type === 'combat.started'))
  assert.match(data.narrative, /plusieurs|issues|repere/i)
})

test('DM API preserves potion-used then KO event order in narration', async t => {
  const sessionId = `api-potion-ko-${process.pid}-${Date.now()}`
  const previousDice = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = '1,1,20,6'
  t.after(async () => {
    if (previousDice === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE
    else process.env.AI_DM_TEST_DICE_SEQUENCE = previousDice
    await cleanupSession(sessionId)
  })

  const { response, data } = await postDm({
    message: 'je bois ma potion',
    clientRequestId: `client-${sessionId}`,
    sessionId,
    gameState: lowHpPotionCombatGameState(),
    history: [],
  })

  assert.equal(response.status, 200)
  assert.ok(data.toolsUsed.includes('resolve_player_action'))
  assert.ok(data.engine?.events?.some(event => event.type === 'item.used'))
  assert.equal(data.newGameState.player.hp.current, 0)
  assert.ok(data.newGameState.player.conditions.includes('unconscious'))
  assert.match(data.narrative, /potion/i)
  assert.match(data.narrative, /riposte|fauche|retombes|inconscient|0 PV/i)
  assert.doesNotMatch(data.narrative, /fiole.*vide|potion.*vide|sans effet|depuis le debut/i)
})

test('DM API resolves natural stateful world actions through canonical engine events', async t => {
  const sessionId = `api-world-${process.pid}-${Date.now()}`
  const previousDice = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = '10,8'
  t.after(async () => {
    if (previousDice === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE
    else process.env.AI_DM_TEST_DICE_SEQUENCE = previousDice
    await cleanupSession(sessionId)
  })

  const search = await postDm({
    message: 'je fouille le bureau',
    clientRequestId: `client-search-${sessionId}`,
    sessionId,
    gameState: officeGameState(),
    history: [],
  })
  assert.equal(search.response.status, 200)
  assert.ok(search.data.toolsUsed.includes('resolve_player_action'))
  assert.ok(search.data.engine?.events?.some(event => event.type === 'room.object_discovered' && event.targetId === 'office_drawer'))
  assert.equal(search.data.newGameState.world.objects.office_drawer.discovered, true)
  assert.ok(search.data.engine?.affordances?.some(action => action.kind === 'unlock' && action.enabled === true))

  const lockedOpen = await postDm({
    message: "je l'ouvre",
    clientRequestId: `client-open-ana-${sessionId}`,
    sessionId,
    gameState: search.data.newGameState,
    history: [],
  })
  assert.equal(lockedOpen.response.status, 200)
  assert.ok(lockedOpen.data.toolsUsed.includes('resolve_player_action'))
  assert.ok(lockedOpen.data.engine?.events?.some(event =>
    event.type === 'action.blocked' &&
    event.metadata?.code === 'OBJECT_LOCKED'
  ))

  const force = await postDm({
    message: "j'enfonce le tiroir",
    clientRequestId: `client-force-${sessionId}`,
    sessionId,
    gameState: lockedOpen.data.newGameState,
    history: [],
  })
  assert.equal(force.response.status, 200)
  assert.ok(force.data.toolsUsed.includes('resolve_player_action'))
  assert.ok(force.data.engine?.events?.some(event => event.type === 'object.opened' && event.targetId === 'office_drawer'))
  assert.ok(force.data.engine?.events?.some(event => event.type === 'alarm.raised'))
  assert.equal(force.data.newGameState.world.objects.recipe_half_office.discovered, true)
  assert.ok(force.data.engine?.affordances?.some(action => action.kind === 'take' && action.enabled === true))

  const take = await postDm({
    message: 'je prends le fragment de recette',
    clientRequestId: `client-take-${sessionId}`,
    sessionId,
    gameState: force.data.newGameState,
    history: [],
  })
  assert.equal(take.response.status, 200)
  assert.ok(take.data.toolsUsed.includes('resolve_player_action'))
  assert.ok(take.data.engine?.events?.some(event => event.type === 'object.taken' && event.targetId === 'recipe_half_office'))
  assert.ok(take.data.engine?.events?.some(event => event.type === 'quest.item_found'))
  assert.equal(take.data.newGameState.world.quests.grammy_recipe.progress, 1)

  const read = await postDm({
    message: 'je le lis',
    clientRequestId: `client-read-ana-${sessionId}`,
    sessionId,
    gameState: take.data.newGameState,
    history: [],
  })
  assert.equal(read.response.status, 200)
  assert.ok(read.data.toolsUsed.includes('resolve_player_action'))
  assert.ok(read.data.engine?.events?.some(event => event.type === 'clue.read' && event.targetId === 'recipe_half_office'))

  const duplicateTake = await postDm({
    message: 'je prends la recette encore',
    clientRequestId: `client-duplicate-${sessionId}`,
    sessionId,
    gameState: read.data.newGameState,
    history: [],
  })
  assert.equal(duplicateTake.response.status, 200)
  assert.ok(duplicateTake.data.engine?.events?.some(event => event.type === 'action.blocked'))
  assert.equal(duplicateTake.data.newGameState.world.quests.grammy_recipe.progress, 1)
})

test('DM API canonical talk changes NPC disposition through world event', async t => {
  const sessionId = `api-talk-${process.pid}-${Date.now()}`
  t.after(() => cleanupSession(sessionId))

  const { response, data } = await postDm({
    message: 'je parle gentiment a Mac de la recette',
    clientRequestId: `client-${sessionId}`,
    sessionId,
    gameState: baseGameState(),
    history: [],
  })

  assert.equal(response.status, 200)
  assert.ok(data.toolsUsed.includes('resolve_player_action'))
  assert.equal(data.newGameState.world.npcs.mac.disposition, 'helpful')
  assert.ok(data.engine?.events?.some(event => event.type === 'npc.disposition_changed' && event.targetId === 'mac'))
  assert.equal(data.usage?.llmRoute, 'rich')
  assert.notEqual(data.usage?.narrator, 'fallback')
  assert.doesNotMatch(data.narrative, DEFAULT_SCENE_NARRATIVE_PATTERN)
})

test('DM API canonical ask reveals information without forcing disposition change', async t => {
  const sessionId = `api-ask-${process.pid}-${Date.now()}`
  t.after(() => cleanupSession(sessionId))

  const { response, data } = await postDm({
    message: 'je lui demande ou est la recette',
    clientRequestId: `client-${sessionId}`,
    sessionId,
    gameState: baseGameState(),
    history: [],
  })

  assert.equal(response.status, 200)
  assert.ok(data.toolsUsed.includes('resolve_player_action'))
  assert.equal(data.newGameState.world.npcs.mac.disposition, 'neutral')
  assert.ok(data.engine?.events?.some(event => event.type === 'npc.information_revealed' && event.targetId === 'mac'))
  assert.notEqual(data.usage?.narrator, 'fallback')
  assert.doesNotMatch(data.narrative, DEFAULT_SCENE_NARRATIVE_PATTERN)
})
