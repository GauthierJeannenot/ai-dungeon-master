const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const Module = require('node:module')
const ts = require('typescript')

const sessionStoreDir = path.join(os.tmpdir(), `ai-dm-session-store-test-${process.pid}`)

process.env.APP_LOG_BUFFER_ENABLED = 'false'
process.env.APP_LOG_LEVEL = 'error'
process.env.APP_LOG_PERSIST_ENABLED = 'false'
process.env.GAME_SESSION_STORE_DIR = sessionStoreDir

function installTsRequire() {
  const previous = Module._extensions['.ts']
  Module._extensions['.ts'] = function loadTs(mod, filename) {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    mod._compile(output, filename)
  }

  return () => {
    if (previous) Module._extensions['.ts'] = previous
    else delete Module._extensions['.ts']
  }
}

const restoreTsRequire = installTsRequire()
const sessionStore = require(path.join(process.cwd(), 'lib/session-store.ts'))

test.after(() => {
  restoreTsRequire()
  fs.rmSync(sessionStoreDir, { recursive: true, force: true })
})

function gameState() {
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
      inventory: [],
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
  }
}

test('session store sanitizes ids consistently and leaves no temp file after save', async () => {
  await sessionStore.saveSession('unsafe/session:id', {
    gameState: gameState(),
    history: [{ role: 'player', content: 'hello' }],
    summaryContext: 'summary',
    turnTraces: [{
      schemaVersion: 1,
      traceId: 'turn-test',
      requestId: 'dm-test',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      status: 'completed',
      input: { raw: 'hello' },
      actions: [],
      toolsUsed: [],
      engineEvents: [],
      affordances: [],
      enemyReactions: [],
      narrativeFacts: [],
      contradictions: [],
      finalNarration: 'ok',
      narrator: 'fallback',
      llmRoute: 'none',
    }],
  })

  const loaded = await sessionStore.loadSession('unsafe_session_id')
  assert.equal(loaded.schemaVersion, 1)
  assert.equal(loaded.sessionId, 'unsafe_session_id')
  assert.equal(loaded.history.length, 1)
  assert.equal(loaded.summaryContext, 'summary')
  assert.equal(loaded.turnTraces.length, 1)
  assert.equal(loaded.turnTraces[0].traceId, 'turn-test')

  const files = fs.readdirSync(sessionStoreDir)
  assert.deepEqual(files, ['unsafe_session_id.json'])
})
