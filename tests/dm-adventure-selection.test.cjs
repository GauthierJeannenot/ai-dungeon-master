// Sélection d'aventure côté route DM : id inconnu (400), défaut Grammy jouable,
// mismatch avec une session existante (409). Harnais mock hors runtime Next.

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { installPgMem } = require('./helpers/pg-mem.cjs')

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-ant-test-placeholder'
process.env.ALLOW_PAID_LLM = 'false'
process.env.LLM_MODE = 'mock'
process.env.MONETIZATION_ENABLED = 'false'

// Backend unique Postgres, émulé en mémoire (pg-mem injecté).
const pg = installPgMem()
const { POST } = require(path.join(process.cwd(), 'app/api/dm/route.ts'))
const { closeMCPClient } = require(path.join(process.cwd(), 'lib/mcp-client.ts'))
const { saveSession, deleteSession } = require(path.join(process.cwd(), 'lib/session-store.ts'))

test.after(async () => {
  pg.restore()
})

function dmRequest(body) {
  return new Request('http://localhost/api/dm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.9.9.9' },
    body: JSON.stringify(body),
  })
}

test('unknown adventureId is a 400 before any work', async () => {
  const res = await POST(dmRequest({ message: 'je regarde', sessionId: 'adv-unknown', adventureId: 'nope' }))
  assert.equal(res.status, 400)
})

test('unknown characterId is a 400 before any work', async () => {
  const res = await POST(dmRequest({ message: 'je regarde', sessionId: 'char-unknown', characterId: 'paladin' }))
  assert.equal(res.status, 400)
})

test('new session with a chosen character resolves and persists it', async () => {
  const sessionId = 'char-default'
  const res = await POST(dmRequest({ message: 'je vais en (5,13)', sessionId, characterId: 'wizard' }))
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.newGameState.characterId, 'wizard')
  assert.equal(data.newGameState.player.class, 'Magicien')
  await deleteSession(sessionId)
  await closeMCPClient(sessionId)
})

test('requesting a different character than the stored session is a 409', async () => {
  const sessionId = 'char-mismatch'
  await saveSession(sessionId, {
    gameState: {
      adventureId: 'grammys-country-apple-pie',
      characterId: 'wizard',
      phase: 'exploration',
      player: {
        id: 'player', name: 'Aldric', class: 'Magicien', level: 1,
        hp: { current: 12, max: 12 }, ac: 12,
        stats: { str: 8, dex: 14, con: 12, int: 16, wis: 12, cha: 10 },
        proficiencyBonus: 2, position: { x: 4, y: 13 }, conditions: [], speed: 30, inventory: [],
      },
      monsters: {}, initiativeOrder: [], currentTurn: null, round: 0,
      movementUsed: {}, actionUsed: {}, combatLog: [], roomsVisited: ['1'], currentRoomId: '1',
    },
    history: [],
    summaryContext: undefined,
    turnTraces: [],
    adventureId: 'grammys-country-apple-pie',
    characterId: 'wizard',
  })

  const res = await POST(dmRequest({ message: 'je regarde', sessionId, characterId: 'bard' }))
  assert.equal(res.status, 409)

  await deleteSession(sessionId)
  await closeMCPClient(sessionId)
})

test('new session with default adventure resolves to Grammy and plays', async () => {
  const sessionId = 'adv-default'
  const res = await POST(dmRequest({ message: 'je vais en (5,13)', sessionId }))
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.newGameState.adventureId, 'grammys-country-apple-pie')
  await deleteSession(sessionId)
  await closeMCPClient(sessionId)
})

test('requesting a different adventure than the stored session is a 409', async () => {
  const sessionId = 'adv-mismatch'
  // Pré-seed une session tide-crypt (état minimal portant l'adventureId).
  await saveSession(sessionId, {
    gameState: {
      adventureId: 'tide-crypt',
      phase: 'exploration',
      player: {
        id: 'player', name: 'Héros', class: 'Guerrier', level: 2,
        hp: { current: 28, max: 28 }, ac: 16,
        stats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 },
        proficiencyBonus: 2, position: { x: 4, y: 13 }, conditions: [], speed: 30, inventory: [],
      },
      monsters: {}, initiativeOrder: [], currentTurn: null, round: 0,
      movementUsed: {}, actionUsed: {}, combatLog: [], roomsVisited: ['1'], currentRoomId: '1',
    },
    history: [],
    summaryContext: undefined,
    turnTraces: [],
  })

  const res = await POST(dmRequest({ message: 'je regarde', sessionId, adventureId: 'grammys-country-apple-pie' }))
  assert.equal(res.status, 409)

  await deleteSession(sessionId)
  await closeMCPClient(sessionId)
})
