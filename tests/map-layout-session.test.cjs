const test = require('node:test')
const assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { loadSession, saveSession } = require('../lib/session-store.ts')
test.after(() => pg.restore())

test('legacy map positions migrate through SQL load and subsequent save only once', async () => {
  const state = buildInitialGameState('sarah-of-yellowcrest-manor')
  delete state.sceneMemory
  state.currentMapId = 'temple'; state.currentRoomId = '30'; state.player.position = { x: 19, y: 29 }
  state.roomsVisited.push('27', '30')
  await saveSession('old-manor', { adventureId: state.adventureId, gameState: state, history: [] })
  const loaded = await loadSession('old-manor')
  assert.equal(loaded.gameState.currentMapId, 'cellar')
  assert.deepEqual(loaded.gameState.player.position, { x: 19, y: 9 })
  await saveSession('old-manor', loaded)
  const reloaded = await loadSession('old-manor')
  assert.deepEqual(reloaded.gameState, loaded.gameState)
})
