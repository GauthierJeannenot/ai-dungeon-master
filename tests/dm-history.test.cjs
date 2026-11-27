const assert = require('node:assert/strict')
const test = require('node:test')
process.env.LLM_MODE = 'mock'
process.env.MONETIZATION_ENABLED = 'false'
process.env.APP_LOG_PERSIST_ENABLED = 'false'
process.env.APP_LOG_LEVEL = 'error'
const restore = require('./helpers/ts-require.cjs').installTsRequireWithAliases()
const llm = require('../lib/dm/llm.ts')
const { processHistory, historyPromptMessages } = require('../lib/dm/history.ts')
test.after(restore)
const context = () => ({ requestId: 'history-test', operation: 'dm.turn', inputMode: 'text', usageLog: [] })
const response = text => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' })
const turns = Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'dm' : 'player', content: `Échange ${i}` }))

test('a short history below the context budget requires no summary generation', async t => {
  t.mock.method(llm, 'createLlmMessage', () => assert.fail('No compression needed'))
  const result = await processHistory(turns, 'Résumé existant', context(), async () => true)
  assert.equal(result.compressed, false)
  assert.deepEqual(result.retainedHistory, turns)
  assert.equal(result.summaryContext, 'Résumé existant')
})

test('context pressure overrides the ten-message floor and preserves complete recent exchanges', async t => {
  const generate = t.mock.method(llm, 'createLlmMessage', async (params, ctx) => {
    assert.equal(ctx.operation, 'history.compress')
    assert.match(params.messages[0].content, /Résumé existant/)
    for (const turn of turns.slice(0, 4)) assert.ok(params.messages[0].content.includes(turn.content))
    assert.ok(!params.messages[0].content.includes(turns[4].content))
    return response('Résumé consolidé')
  })
  const before = JSON.stringify(turns)
  const result = await processHistory(turns, 'Résumé existant', context(), async recent => recent.length <= 2)
  assert.equal(generate.mock.callCount(), 1)
  assert.equal(result.compressed, true)
  assert.deepEqual(result.retainedHistory, turns.slice(4))
  assert.equal(JSON.stringify(turns), before)
  const prompt = historyPromptMessages(result.messages, result.summaryContext)
  assert.equal(prompt.length, 3)
  assert.match(prompt[0].content, /Résumé consolidé/)
  assert.deepEqual(prompt.slice(1), result.messages)
})

test('oversized compression requests are summarized in chronological chunks, including a single huge turn', async t => {
  t.mock.method(llm, 'measureLlmContext', async params => ({
    inputTokens: params.messages[0].content.length, contextWindow: 2000,
  }))
  const pieces = []
  t.mock.method(llm, 'createLlmMessage', async params => {
    assert.ok(params.messages[0].content.length + params.max_tokens <= 2000)
    pieces.push(params.messages[0].content.split('Échanges à intégrer:\nJoueur: ')[1])
    return response('Résumé complet du fragment et des précédents.')
  })
  const original = 'Une promesse 🐉 et un objet laissé derrière. '.repeat(200)
  const result = await processHistory([{ role: 'player', content: original }], undefined, context(), async recent => recent.length === 0)
  assert.ok(pieces.length > 1)
  assert.equal(pieces.join(''), original)
  assert.equal(result.retainedHistory.length, 0)
  assert.equal(result.summaryContext, 'Résumé complet du fragment et des précédents.')
})

test('empty or truncated summaries fail without discarding the original history', async t => {
  const before = JSON.stringify(turns)
  const generate = t.mock.method(llm, 'createLlmMessage', async () => response(''))
  for (const value of [response(''), { ...response('Résumé tronqué'), stop_reason: 'max_tokens' }]) {
    generate.mock.mockImplementation(async () => value)
    await assert.rejects(processHistory(turns, undefined, context(), async () => false), /résumé complet/)
    assert.equal(JSON.stringify(turns), before)
  }
})

test('an irreducible current turn stops before generation instead of dropping engine context', async t => {
  t.mock.method(llm, 'createLlmMessage', () => assert.fail('No compressible history'))
  await assert.rejects(processHistory([], undefined, context(), async () => false), /tour courant dépasse/)
})

test('compression distinguishes discovered testimony from omniscient predictions instead of making them acquired knowledge', async t => {
  const history = [
    { role: 'player', content: 'Je demande au témoin ce qui se passe.' },
    { role: 'dm', content: 'Il te parle de la route. Si tu pars sans le convaincre, il sera capturé plus tard.' },
  ]
  const before = JSON.stringify(history)
  t.mock.method(llm, 'createLlmMessage', async params => {
    assert.match(params.messages[0].content, /informations effectivement découvertes par le personnage.*apartés omniscients du MJ/)
    assert.match(params.messages[0].content, /Ne transforme jamais une prédiction, un objectif caché ou une conséquence future conditionnelle/)
    assert.match(params.messages[0].content, /écarte ces spoilers du résumé des faits établis/)
    assert.match(params.messages[0].content, /il sera capturé plus tard/, 'the summarizer receives the original transcript for interpretation')
    return response('Le héros a rencontré un témoin et appris l’existence de la route.')
  })
  const result = await processHistory(history, undefined, context(), async recent => recent.length === 0)
  assert.equal(JSON.stringify(history), before, 'compression does not rewrite the original messages')
  assert.doesNotMatch(result.summaryContext, /captur/)
})

test('compression is told to discard the content of an accidentally narrated refused confidence', async t => {
  const history = [
    { role: 'player', content: 'Je lui demande des histoires du village.' },
    { role: 'dm', content: 'Échec. Le témoin sait où est le trésor, dans la cave du moulin, mais refuse de te le dire.' },
  ]
  t.mock.method(llm, 'createLlmMessage', async params => {
    assert.ok(params.messages[0].content.includes(history[1].content))
    assert.match(params.messages[0].content, /Une confidence refusée reste inconnue/)
    assert.match(params.messages[0].content, /Une information nécessitant un jet reste inconnue sans réussite confirmée du jet correspondant/)
    assert.match(params.messages[0].content, /conserve seulement le refus observable et écarte le contenu secret/)
    return response('Le héros a interrogé le témoin, qui a refusé de se confier après un échec.')
  })
  const result = await processHistory(history, undefined, context(), async recent => recent.length === 0)
  assert.doesNotMatch(result.summaryContext, /trésor|cave|moulin/)
})
