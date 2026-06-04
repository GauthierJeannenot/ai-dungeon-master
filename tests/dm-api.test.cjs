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
  assert.ok(data.toolsUsed.includes('move_token'))
  assert.deepEqual(data.newGameState.player.position, { x: 11, y: 13 })
  assert.equal(typeof data.narrative, 'string')
  assert.ok(data.narrative.length > 0)
  assert.doesNotMatch(data.narrative, /\[Mock\]/)
  assert.equal(typeof data.newGameState.sceneMemory?.updatedAt, 'string')
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
  assert.ok(data.toolsUsed.includes('resolve_player_attack'))
  assert.equal(data.newGameState.monsters.goblin_a.isAlive, false)
  assert.ok(data.newGameState.combatLog.some(entry => /attaque/i.test(entry.action)))
  assert.doesNotMatch(data.narrative, /\[Mock\]/)
  assert.equal(data.newGameState.sceneMemory?.madeNoise, true)
})
