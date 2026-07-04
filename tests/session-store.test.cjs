// Store de sessions de jeu (backend unique Postgres, pg-mem injecté).
// Le round-trip complet, la sanitisation des ids et le listing par owner sont
// couverts par tests/db-stores.test.cjs ; ce fichier verrouille l'invariant
// spécifique du round-trip des turnTraces (typés mais persistés).

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

const pg = installPgMem()
const sessionStore = require(path.join(process.cwd(), 'lib/session-store.ts'))

test.after(() => {
  pg.restore()
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

test('session store sanitizes ids and round-trips turn traces', async () => {
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
})
