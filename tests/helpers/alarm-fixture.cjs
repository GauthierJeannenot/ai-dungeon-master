const { adjacent, ok } = require('./mcp-toolkit.cjs')

function alarmCubeInput(cell, exemptCreatureIds = []) {
  return {
    spellId: 'alarm',
    alarmWard: { kind: 'ground_cube', cell, mode: 'mental', exemptCreatureIds },
    focusItemId: 'component_pouch',
  }
}

async function prepareAlarmCube(call, { cell, exemptCreatureIds = [], ritual = false } = {}) {
  const state = await call('get_game_state')
  const input = alarmCubeInput(cell ?? adjacent(state)[0], exemptCreatureIds)
  if (ritual) input.ritual = true
  const started = ok(await call('cast_spell', input))
  ok(await call('continue_casting', {
    castingId: started.castingId, eventId: `work-${started.castingId}`, seconds: started.durationSeconds,
  }))
  const completed = ok(await call('finish_casting', { castingId: started.castingId }))
  return { input, started, completed }
}

module.exports = { alarmCubeInput, prepareAlarmCube }
