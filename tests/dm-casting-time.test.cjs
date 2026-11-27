const test = require('node:test'), assert = require('node:assert/strict')
const { installPgMem } = require('./helpers/pg-mem.cjs')
Object.assign(process.env, { LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', LLM_PROVIDER: 'openai', MONETIZATION_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error', LLM_MAX_CALLS_PER_REQUEST: '12' })
const pg = installPgMem(), llm = require('../lib/dm/llm.ts'), mcp = require('../lib/mcp-client.ts')
const { POST } = require('../app/api/dm/route.ts'), { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
test.after(() => pg.restore())
const plain = value => JSON.parse(JSON.stringify(value))
const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `casting-${name}-${Math.random()}`, name, input }] })
const text = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Le travail réellement effectué et le résultat moteur déterminent seuls l’état de ton rituel.' }] })

for (const resumed of [false, true]) test(`the API ${resumed ? 'resumes a persisted' : 'completes one'} ritual through explicit work and finish, without extra-action rejection or fabricated calls`, async t => {
  const seed = await engine(t, { characterId: 'wizard', dice: '19' }), before = await seed('get_game_state')
  const sessionId = `dm-casting-${resumed}-${process.pid}-${Date.now()}`, seen = [], chosen = []
  await saveSession(sessionId, { gameState: before, history: [], adventureId: before.adventureId, characterId: before.characterId })
  t.after(async () => { await mcp.closeMCPClient(sessionId); await deleteSession(sessionId) })
  t.mock.method(mcp, 'listMCPTools', async () => (await seed.client.listTools()).tools)
  t.mock.method(mcp, 'callMCPTool', async (name, input = {}) => {
    if (!['get_game_state', 'replace_game_state'].includes(name)) {
      assert.ok(['cast_spell', 'continue_casting', 'finish_casting'].includes(name), `Only the model's chosen incantation calls may reach MCP: ${name}`)
      seen.push({ name, input: plain(input) })
    }
    return seed(name, input)
  })
  let castingId, request = 0, turn = 0
  const emit = (name, input) => { chosen.push({ name, input: plain(input) }); return tool(name, input) }
  t.mock.method(llm, 'createLlmMessage', async (params, context) => {

    assert.equal(context.operation, 'dm.turn')
    ++turn
    if (request === 0 && turn === 1) return emit('cast_spell', { spellId: 'detect-magic', ritual: true })
    if (request === 0 && turn === 2) {
      const record = Object.values(context.gameState.dmTools.casting.records).find(record => record.status === 'active')
      assert.ok(record); castingId = record.id
      assert.equal(context.gameState.worldTimeSeconds, before.worldTimeSeconds)
      assert.deepEqual(context.gameState.player.spellSlots, before.player.spellSlots)
      return emit('continue_casting', { castingId, eventId: 'first-work', seconds: 300 })
    }
    if (request === 0 && resumed && turn === 3) {
      assert.equal(context.gameState.worldTimeSeconds, before.worldTimeSeconds + 300)
      assert.equal(context.gameState.dmTools.casting.records[castingId].activeSeconds, 300)
      return text()
    }
    const step = request === 0 ? turn - 2 : turn
    if (step === 1) return emit('continue_casting', { castingId, eventId: 'last-work', seconds: 306 })
    if (step === 2) {
      assert.equal(context.gameState.dmTools.casting.records[castingId].status, 'ready')
      assert.equal(context.gameState.worldTimeSeconds, before.worldTimeSeconds + 606)
      assert.deepEqual(context.gameState.player.spellSlots, before.player.spellSlots)
      return emit('finish_casting', { castingId })
    }
    if (step === 3) {
      assert.equal(context.gameState.dmTools.casting.records[castingId].status, 'completed')
      assert.ok(context.gameState.hero.effects.some(effect => effect.kind === 'concentration:detect-magic'))
      return tool('cast_spell', { spellId: 'magic-missile', targetId: 'unselected-other-target', slotLevel: 1 })
    }
    assert.equal(step, 4)
    const block = params.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === 'tool_result').at(-1)
    assert.equal(block.is_error, true)
    assert.equal(JSON.parse(block.content).code, 'PRIMARY_ACTION_ALREADY_RESOLVED')
    return text()
  })
  async function post(message) {
    const response = await POST(new Request('http://localhost/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, message, adventureId: before.adventureId, characterId: before.characterId }) }))
    const result = await response.json()
    assert.equal(response.status, 200, JSON.stringify(result))
    assert.deepEqual(plain((await loadSession(sessionId)).gameState), result.newGameState, 'actual work, concentration and receipts persist unchanged in SQL')
    return result.newGameState
  }
  let after = await post(resumed ? 'Je commence Détection de la magie en rituel et travaille cinq minutes.' : 'Je lance Détection de la magie en rituel et accomplis toute son incantation.')
  if (resumed) { request = 1; turn = 0; after = await post('Je poursuis puis termine le même rituel.') }
  assert.deepEqual(seen, chosen, 'all exact tool arguments come from the model, without server-selected targets or work')
  assert.equal(after.worldTimeSeconds, before.worldTimeSeconds + 606)
  assert.deepEqual(after.player.spellSlots, before.player.spellSlots)
  assert.equal(Object.keys(after.dmTools.casting.records).length, 1)
  assert.equal(after.dmTools.casting.records[castingId].activeSeconds, 606)
  assert.equal(after.dmTools.casting.records[castingId].status, 'completed')
  assert.equal(ok(await seed('roll_dice', { notation: '1d20' })).total, 19, 'the ritual and its continuation invent no rolls')
})
