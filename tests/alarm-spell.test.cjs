const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', DM_RATE_LIMIT_PER_MINUTE: '0' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, adjacent, grid } = require('./helpers/mcp-toolkit.cjs')
const { alarmCubeInput, prepareAlarmCube } = require('./helpers/alarm-fixture.cjs')
const { completeCasting } = require('./helpers/casting.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { inferRoomIdOnMap } = require('../mcp-server/dist/lib/adventure-map.js')
const fey = 'fey-shadow-fair'
const same = (a, b) => a.x === b.x && a.y === b.y
test.after(() => pg.restore())

async function refuse(call, name, input, code) {
  const before = await call('get_game_state')
  const result = await call(name, input)
  assert.equal(result.code, code, JSON.stringify(result))
  assert.deepEqual(await call('get_game_state'), before)
}

function straightRoute(state) {
  const nav = grid(state), { position } = state.player
  for (let y = Math.max(0, position.y - 4); y <= position.y + 4; y++) {
    for (let x = Math.max(0, position.x - 4); x <= position.x + 4; x++) {
      const cell = { x, y }, from = { x: x - 1, y }, to = { x: x + 1, y }
      if (![from, cell, to].every(c => !same(c, position) && nav.free(c) && inferRoomIdOnMap(c, state.currentMapId, state) === state.currentRoomId)) continue
      if (nav.step(from, cell) && nav.step(cell, to)) return { from, cell, to }
    }
  }
  assert.fail('A real clear straight route through three existing ground cells is required')
}

test('normal published Fey wizard Alarm wakes natural sleep on an actual intermediate entry and reveals no intruder', async t => {
  const call = await engine(t, { adventureId: fey, characterId: 'wizard', dice: '19' })
  const initial = await call('get_game_state')
  assert.equal(initial.player.level, 3)
  assert.ok(initial.player.knownSpells.includes('alarm'))
  const { from, cell, to } = straightRoute(initial)
  const intruder = ok(await call('spawn_monster', { monsterType: 'goblin', cell: from }))
  const { completed } = await prepareAlarmCube(call, { cell })
  assert.equal(completed.expiresAt, initial.worldTimeSeconds + 60 + 28800)
  assert.equal(ok(await call('inspect_alarm')).pingCount, 0)
  ok(await call('begin_natural_sleep', {
    eventId: 'alarm-real-natural-sleep', entityId: 'player', actualNaturalSleepConfirmed: true,
    reason: 'The player actually sleeps beside the selected ground ward.',
  }))
  const asleep = await call('get_game_state')
  assert.ok(asleep.player.conditions.includes('unconscious'))
  const moved = ok(await call('move_token', { tokenId: intruder.id, toCell: to }))
  assert.deepEqual(moved.path, [from, cell, to])
  assert.deepEqual(moved.finalPosition, to)
  assert.equal(moved.mentalAlarm.received, 1)
  assert.equal(moved.mentalAlarm.latestPing.awakened, true)
  const after = await call('get_game_state'), view = ok(await call('inspect_alarm'))
  assert.equal(view.pingCount, 1)
  assert.equal(after.dmTools.sleep.episodes['alarm-real-natural-sleep'].wakeCause, 'mental_alarm')
  assert.equal(after.player.conditions.includes('unconscious'), false)
  assert.equal(after.worldTimeSeconds, asleep.worldTimeSeconds)
  assert.equal(JSON.stringify(after.dmTools.alarmSpell).includes(intruder.id), false)
  assert.equal(JSON.stringify(view).includes(intruder.id), false)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('original one-minute cube cast survives SQL, fixes its placement, spends one slot on finish and expires at eight hours', async t => {
  const call = await engine(t, { adventureId: fey, characterId: 'wizard', dice: '19' })
  const initial = await call('get_game_state'), cell = adjacent(initial)[0], input = alarmCubeInput(cell)
  await refuse(call, 'cast_spell', { spellId: 'alarm', toCell: cell, narrative: 'Old point', focusItemId: 'component_pouch' }, 'ALARM_WARD_SELECTION_REQUIRED')
  await refuse(call, 'cast_spell', { ...input, alarmWard: { ...input.alarmWard, exemptCreatureIds: ['missing-actual-body'] } }, 'ALARM_EXEMPT_CREATURE_REQUIRED')
  const began = ok(await call('cast_spell', input))
  assert.equal(began.durationSeconds, 60)
  ok(await call('continue_casting', { castingId: began.castingId, eventId: 'first-alarm-work', seconds: 20 }))
  const partial = await call('get_game_state')
  assert.deepEqual(partial.player.spellSlots, initial.player.spellSlots)
  assert.equal(ok(await call('inspect_alarm')).activeWards.length, 0)
  const id = `alarm-sql-${process.pid}-${Date.now()}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: partial, history: [], adventureId: fey, characterId: 'wizard' })
  const next = await engine(t, { adventureId: fey, characterId: 'wizard', dice: '19' })
  ok(await next('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await next('get_game_state'), partial)
  ok(await next('continue_casting', { castingId: began.castingId, eventId: 'final-alarm-work', seconds: 40 }))
  await refuse(next, 'finish_casting', { castingId: began.castingId, toCell: initial.player.position }, 'ALARM_TARGET_FIXED')
  const finished = ok(await next('finish_casting', { castingId: began.castingId })), after = await next('get_game_state')
  assert.equal(after.player.spellSlots.level1.current, initial.player.spellSlots.level1.current - 1)
  assert.equal(after.hero.concentrationIds.player, undefined)
  assert.equal(finished.expiresAt, after.worldTimeSeconds + 28800)
  assert.deepEqual(ok(await next('finish_casting', { castingId: began.castingId })), finished)
  assert.deepEqual(await next('get_game_state'), after)
  await saveSession(id, { gameState: after, history: [], adventureId: fey, characterId: 'wizard' })
  const resumed = await engine(t, { adventureId: fey, characterId: 'wizard', dice: '19' })
  ok(await resumed('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await resumed('get_game_state'), after)
  const forged = structuredClone(after)
  forged.dmTools.alarmSpell.wards[finished.alarmId].expiresAt++
  await refuse(resumed, 'replace_game_state', { gameState: forged }, 'ALARM_STATE_MISMATCH')
  ok(await resumed('advance_time', { seconds: 28800 }))
  assert.equal(ok(await resumed('inspect_alarm')).activeWards.length, 0)
  ok(await resumed('move_token', { tokenId: 'player', toCell: cell }))
  assert.equal(ok(await resumed('inspect_alarm')).pingCount, 0)
  assert.equal(ok(await resumed('roll_dice', { notation: '1d20' })).total, 19)
})

test('a real wizard ritual leaves slots intact and the newest ward on the same cube controls exemptions', async t => {
  const call = await engine(t, { adventureId: fey, characterId: 'wizard', dice: '19' })
  const before = await call('get_game_state'), cell = before.player.position, away = adjacent(before)[0]
  const first = await prepareAlarmCube(call, { cell })
  assert.equal(ok(await call('inspect_alarm')).pingCount, 0, 'Casting on the current cell is not entry')
  ok(await call('move_token', { tokenId: 'player', toCell: away }))
  ok(await call('move_token', { tokenId: 'player', toCell: cell }))
  assert.equal(ok(await call('inspect_alarm')).pingCount, 1)
  const slots = (await call('get_game_state')).player.spellSlots
  const second = await prepareAlarmCube(call, { cell, ritual: true, exemptCreatureIds: ['player'] })
  assert.equal(second.started.durationSeconds, 660)
  assert.notEqual(first.completed.alarmId, second.completed.alarmId)
  const view = ok(await call('inspect_alarm'))
  assert.deepEqual(view.activeWards.map(w => w.castingId), [second.completed.alarmId])
  assert.deepEqual((await call('get_game_state')).player.spellSlots, slots)
  ok(await call('move_token', { tokenId: 'player', toCell: away }))
  ok(await call('move_token', { tokenId: 'player', toCell: cell }))
  assert.equal(ok(await call('inspect_alarm')).pingCount, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a prepared-spell fixture at the real Sarah door detects panel manipulation and through-path crossing once each', async t => {
  const call = await engine(t, { adventureId: 'sarah-of-yellowcrest-manor', characterId: 'wizard', dice: '19' })
  // This fixture supplies only already learned knowledge. The published N7
  // sheet lacks Alarm. Door, long cast, costs and all contacts are real tools.
  const state = await call('get_game_state')
  assert.equal(state.player.knownSpells.includes('alarm'), false)
  state.player.knownSpells.push('alarm')
  ok(await call('replace_game_state', { gameState: state }))
  const doorId = 'reading_departure'
  ok(await call('move_token', { tokenId: 'player', doorId, doorMode: 'approach' }))
  const result = await completeCasting(call, ok(await call('cast_spell', {
    spellId: 'alarm', focusItemId: 'component_pouch', alarmWard: { kind: 'door', doorId, mode: 'mental', exemptCreatureIds: [] },
  })))
  assert.equal(result.placement.doorId, doorId)
  const close = ok(await call('interact_door', { doorId, action: 'close' }))
  assert.equal(close.mentalAlarm.received, 1)
  assert.equal(ok(await call('interact_door', { doorId, action: 'close' })).unchanged, true)
  assert.equal(ok(await call('inspect_alarm')).pingCount, 1)
  assert.equal(ok(await call('interact_door', { doorId, action: 'open' })).mentalAlarm.received, 1)
  const moved = ok(await call('move_token', { tokenId: 'player', toCell: { x: 12, y: 8 } }))
  assert.ok(moved.path.some(c => same(c, { x: 10, y: 8 })))
  assert.deepEqual(moved.finalPosition, { x: 12, y: 8 })
  assert.equal(moved.mentalAlarm.received, 1)
  assert.equal(ok(await call('inspect_alarm')).pingCount, 3)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('actual DM POST forwards the chosen cube and casting work, then exposes only the received ping after entry', async t => {
  const call = await engine(t, { adventureId: fey, characterId: 'wizard' })
  for (const roomId of ['2', '9', '5']) ok(await call('move_token', { tokenId: 'player', roomId }))
  const before = await call('get_game_state'), cell = adjacent(before)[0]
  assert.equal(before.currentRoomId, '5')
  const turn = await play(t, call, [
    { name: 'cast_spell', input: alarmCubeInput(cell) },
    params => {
      const started = lastResult(params)
      assert.equal(started.durationSeconds, 60)
      return { name: 'continue_casting', input: { castingId: started.castingId, eventId: 'actual-api-alarm-work', seconds: 60 } }
    },
    params => ({ name: 'finish_casting', input: { castingId: lastResult(params).castingId } }),
    params => {
      assert.equal(lastResult(params).castingCompleted, true)
      return { name: 'move_token', input: { tokenId: 'player', toCell: cell } }
    },
    params => {
      assert.equal(lastResult(params).mentalAlarm.received, 1)
      return { name: 'inspect_alarm', input: {} }
    },
    params => {
      const view = lastResult(params)
      assert.equal(view.pingCount, 1)
      assert.deepEqual(Object.keys(view.latestPing).sort(), ['at', 'awakened', 'number'])
      return 'L’Alarme mentale signale une entrée.'
    },
  ], 'Je choisis ce cube au sol pour Alarme mentale sans exemptions, je travaille une minute, termine le sort et entre dans la case.')
  assert.deepEqual(turn.seen, turn.selected)
  assert.equal(turn.result.newGameState.dmTools.alarmSpell.pingCount, 1)
  assert.equal(turn.result.newGameState.player.spellSlots.level1.current, before.player.spellSlots.level1.current - 1)
})
