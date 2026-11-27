const test = require('node:test')
const assert = require('node:assert/strict')

Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { prepareAlarmCube } = require('./helpers/alarm-fixture.cjs')
const { prepareResearch } = require('./helpers/xge-research-fixture.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')

test.after(() => pg.restore())

async function prepareAlarmAndResearch(call) {
  const state = await call('get_game_state')
  const { input, completed: cast } = await prepareAlarmCube(call)
  ok(await call('create_treasure', {
    treasureId: 'w25-research-funding', name: 'Research funding',
    description: 'The character collects these coins to pay the actual study expenses.',
    cell: state.player.position, mode: 'authored', coins: { gp: 50 },
  }))
  ok(await call('collect_treasure', { treasureId: 'w25-research-funding' }))
  return { cast, cell: input.alarmWard.cell, study: await prepareResearch(call) }
}

const wizard = { adventureId: 'fey-shadow-fair', characterId: 'wizard' }

test('one paid day of actual XGE research expires a PHB Alarm and replay preserves the original elapsed time and fee', async t => {
  const options = { ...wizard, dice: '19' }
  const call = await engine(t, options)
  const { cast, cell, study } = await prepareAlarmAndResearch(call)
  const before = await call('get_game_state')
  const armed = ok(await call('inspect_alarm'))
  assert.equal(armed.activeWards.length, 1)
  assert.equal(cast.expiresAt, before.worldTimeSeconds + 28_800)

  const effort = study.effort('w25-alarm-study', 28_800, { paid: { gp: 50 } })
  ok(await call('work_xge_research', effort))
  const after = await call('get_game_state')
  assert.equal(after.worldTimeSeconds, cast.expiresAt)
  assert.equal(copperValue(before.dmTools.wallet) - copperValue(after.dmTools.wallet), 5_000)
  assert.deepEqual(after.player.spellSlots, before.player.spellSlots)
  assert.deepEqual(after.player.hp, before.player.hp)
  assert.deepEqual(ok(await call('inspect_alarm')).activeWards, [])

  const id = `w25-alarm-research-${process.pid}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: after, history: [], adventureId: after.adventureId, characterId: after.characterId })
  const restored = await engine(t, options)
  ok(await restored('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  const restoredState = await restored('get_game_state')
  assert.equal(ok(await restored('work_xge_research', effort)).replayed, true)
  assert.deepEqual(await restored('get_game_state'), restoredState)
  ok(await restored('move_token', { tokenId: 'player', toCell: cell }))
  assert.deepEqual((await restored('get_game_state')).player.position, cell)
  const expired = ok(await restored('inspect_alarm'))
  assert.deepEqual(expired.activeWards, [])
  assert.equal(expired.pingCount, armed.pingCount)
  assert.equal(ok(await restored('roll_dice', { notation: '1d20' })).total, 19)
})

test('research cannot cross an incubating Sewer Plague boundary or spend the original fee on a refused interval', async t => {
  const call = await engine(t, { ...wizard, dice: '1,1,19' })
  ok(await call('advance_time', { seconds: 14 * 3_600 }))
  const { player } = await call('get_game_state')
  ok(await call('create_affliction_source', {
    sourceId: 'w25-ground-contamination', templateId: 'sewer_plague',
    name: 'Established contamination of this spot', cell: player.position, doses: 1,
  }))
  const { affliction, save, incubationRoll } = ok(await call('expose_affliction', {
    sourceId: 'w25-ground-contamination', eventId: 'w25-contact', targetId: 'player', delivery: 'contact',
  }))
  assert.equal(save.success, false)
  assert.equal(incubationRoll.total, 1)
  const current = await call('get_game_state')
  ok(await call('advance_time', { seconds: affliction.nextAt - current.worldTimeSeconds - 3_600 }))
  const { study } = await prepareAlarmAndResearch(call)
  const before = await call('get_game_state')
  const armed = ok(await call('inspect_alarm'))
  const effort = study.effort('w25-cross-onset', 7_200, { paid: { gp: 50 } })
  assert.equal((await call('work_xge_research', effort)).code, 'XGE_RESEARCH_ACTUAL_EVENT_BOUNDARY')
  assert.deepEqual(await call('get_game_state'), before)
  assert.deepEqual(ok(await call('inspect_alarm')), armed)

  ok(await call('advance_time', { seconds: affliction.nextAt - before.worldTimeSeconds }))
  ok(await call('resolve_affliction_event', { afflictionId: affliction.id }))
  const beforeStudy = await call('get_game_state')
  ok(await call('work_xge_research', effort))
  const afterStudy = await call('get_game_state')
  assert.equal(afterStudy.worldTimeSeconds - beforeStudy.worldTimeSeconds, 7_200)
  assert.equal(copperValue(beforeStudy.dmTools.wallet) - copperValue(afterStudy.dmTools.wallet), 5_000)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
