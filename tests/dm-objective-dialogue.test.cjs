const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  LLM_PROVIDER: 'openai', APP_LOG_LEVEL: 'error', APP_LOG_PERSIST_ENABLED: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', LLM_MAX_CALLS_PER_REQUEST: '8' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { knownObjectives } = require('../lib/objective-journal.ts')
test.after(() => pg.restore())

test('player quotation, negation and speculation about quests never create a dialogue or objective without an AI tool call', async t => {
  const seed = await engine(t)
  ok(await seed('reveal_npc', { npcId: 'sarah', disposition: 'helpful' }))
  const before = await seed('get_game_state')
  for (const message of [
    'Explique la citation « Sarah me donne la quête de retrouver les cendres ».',
    'Sarah ne me demande aucune quête ; nous parlons seulement du journal.',
    'Si Sarah me proposait une nouvelle mission, serait-elle obligatoire ?',
  ]) {
    const { result, seen } = await play(t, seed, ['Tu envisages cette possibilité sans nouveau propos du PNJ.'], message)
    assert.deepEqual(seen, [])
    assert.deepEqual(result.toolsUsed, [])
    assert.deepEqual(result.newGameState.objectiveJournal, undefined)
    assert.deepEqual(knownObjectives(result.newGameState), [])
    for (const key of ['player', 'npcs', 'worldTimeSeconds', 'worldFacts']) assert.deepEqual(result.newGameState[key], before[key])
  }
})

test('the agent selects a real quest communication, receives its contextual evidence, and still has its actual player action; SQL preserves the exact dialogue', async t => {
  const seed = await engine(t, { dice: '20,19' })
  ok(await seed('reveal_npc', { npcId: 'sarah', disposition: 'helpful' }))
  const input = Object.freeze({ eventId: 'api-actual-proposal', npcId: 'sarah', communication: 'gesture',
    statement: 'Elle montre le journal et indique la copie autorisée à emporter.',
    authored: [{ mapId: 'candlekeep', objectiveId: 'diary_copy' }], generated: [] })
  const { result, seen } = await play(t, seed, [
    params => {
      assert.ok(params.tools.some(tool => tool.name === 'record_objective_dialogue'))
      assert.ok(params.tools.some(tool => tool.name === 'inspect_objectives'))
      return { name: 'get_rules_support', input: { domain: 'objectives' } }
    },
    params => {
      assert.ok(lastResult(params).procedures.some(guide => guide.text.includes('record_objective_dialogue')))
      return { name: 'record_objective_dialogue', input }
    },
    (params, context) => {
      const evidence = lastResult(params)
      assert.equal(evidence.source.statement, input.statement)
      assert.match(evidence.objectiveContext, /Emporter une copie autorisée du journal/)
      assert.equal(knownObjectives(context.gameState).length, 1)
      return { name: 'roll_ability_check', input: { entityId: 'player', ability: 'wis', dc: 10 } }
    },
    params => {
      assert.equal(lastResult(params).error, undefined, 'a proposal spends no player primary action')
      return { name: 'inspect_objectives', input: {} }
    },
    params => {
      assert.equal(lastResult(params).objectives.length, 1)
      return 'Elle te propose d’emporter cette copie ; tu décides encore de la suite.'
    },
  ], 'Nous poursuivons notre conversation ; je ne ramasse encore aucun objet.')
  assert.deepEqual(seen.find(call => call.name === 'record_objective_dialogue').input, input)
  const after = result.newGameState
  assert.deepEqual(after.objectiveJournal.dialogues[input.eventId].input, input)
  assert.equal(knownObjectives(after).length, 1)
  assert.equal(knownObjectives(after)[0].done, false)
  assert.deepEqual(after.player.inventory, (await seed('get_game_state')).player.inventory)
  assert.equal(ok(await seed('roll_dice', { notation: '1d20' })).total, 19)
})
