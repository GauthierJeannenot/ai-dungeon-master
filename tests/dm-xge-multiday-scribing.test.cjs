const test = require('node:test'), assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false',
  DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { engine, ok, adjacent } = require('./helpers/mcp-toolkit.cjs')
const { prepareMultiDayScroll, fundMultiDayScribing } = require('./helpers/xge-multiday-scribing-fixture.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
test.after(() => pg.restore())

test('a real eight-hour scroll-work POST consumes its primary message decision, blocks the next explicit check before MCP, retains exact paid SQL effort and hides all four project tools in actual combat', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '19' })
  ok(await call('prepare_spells', { spellIds: ['misty-step'] }))
  await fundMultiDayScribing(call, { treasureId: 'actual-api-work-funds', coins: { gp: 250 } })
  const prepared = await prepareMultiDayScroll(call, { projectId: 'actual-api-eight-hour-project' })
  const beforePurchase = await call('get_game_state')
  ok(await call('start_xge_spell_scroll_project', prepared.input))
  const before = await call('get_game_state')
  assert.equal(copperValue(beforePurchase.dmTools.wallet) - copperValue(before.dmTools.wallet), 25000)
  const work = { name: 'work_xge_spell_scroll_project', input: prepared.work(0) }
  const check = { name: 'roll_ability_check', input: { entityId: 'player', ability: 'int', dc: 10, label: 'Une autre action principale explicitement choisie.' } }
  let feedback
  const played = await play(t, call, [work, params => {
    const worked = ok(lastResult(params)); assert.equal(worked.completedDays, 1); assert.equal(worked.seconds, 28800)
    return check
  }, params => { feedback = lastResult(params); return 'Le résultat mécanique de cette journée est conservé.' }],
  'Je transcris huit heures puis je demande explicitement un autre test distinct, sans octroi supplémentaire du MJ.')
  assert.equal(feedback.code, 'PRIMARY_ACTION_ALREADY_RESOLVED', 'Eight real hours must count as the primary decision before an unrelated check.')
  assert.equal(feedback.detail.firstTool, work.name); assert.equal(feedback.detail.blockedTool, check.name)
  assert.deepEqual(played.selected, [work, check]); assert.deepEqual(played.seen, [work])
  const after = played.result.newGameState
  assert.equal(after.worldTimeSeconds - before.worldTimeSeconds, 28800)
  assert.deepEqual(after.dmTools.wallet, before.dmTools.wallet); assert.deepEqual(after.player.spellSlots, before.player.spellSlots)
  assert.deepEqual(after.player.position, before.player.position)
  const project = after.dmTools.xgeScrollScribing.projects[0]
  assert.equal(project.segments.length, 1); assert.deepEqual(project.segments[0].input, work.input)
  assert.equal(project.purchase.at, project.start.at); assert.equal(copperValue(project.purchase.paid), 25000)
  assert.equal(after.droppedItems?.[prepared.input.scrollItemId], undefined)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19, 'The blocked check must not have rolled its die.')

  const id = 'w34-api-work-sql-' + process.pid + '-' + Math.random()
  t.after(() => deleteSession(id)); await saveSession(id, { gameState: after, history: [], adventureId: after.adventureId, characterId: after.characterId })
  const restored = await engine(t, { characterId: after.characterId, adventureId: after.adventureId, dice: '20,1,19' })
  ok(await restored('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await restored('get_game_state'), after)
  assert.equal(ok(await restored(work.name, work.input)).replayed, true)
  assert.deepEqual(await restored('get_game_state'), after)

  const foe = ok(await restored('spawn_monster', { monsterType: 'goblin', cell: adjacent(after)[0] }))
  ok(await restored('enter_combat', { combatants: ['player', foe.id] }))
  const combat = await restored('get_game_state'), tools = ['start_xge_spell_scroll_project', 'work_xge_spell_scroll_project', 'abandon_xge_spell_scroll_project', 'adjudicate_xge_spell_scroll_delay']
  assert.equal(combat.phase, 'combat')
  const observation = await play(t, restored, [params => {
    const offered = new Set(params.tools.map(tool => tool.name))
    assert.ok(tools.every(name => !offered.has(name)), 'Actual combat must not expose any exploration-only scroll-project tool.')
    return 'Le personnage est en initiative et observe la situation.'
  }], 'Je regarde les choix actuellement disponibles pendant le combat.')
  assert.deepEqual(observation.selected, []); assert.deepEqual(observation.seen, [])
  assert.deepEqual(observation.result.newGameState.dmTools.xgeScrollScribing, combat.dmTools.xgeScrollScribing)
  assert.deepEqual(observation.result.newGameState.dmTools.wallet, combat.dmTools.wallet)
  assert.equal(observation.result.newGameState.worldTimeSeconds, combat.worldTimeSeconds)
  assert.equal(ok(await restored('roll_dice', { notation: '1d20' })).total, 19)
})
