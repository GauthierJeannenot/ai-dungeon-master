const assert = require('node:assert/strict')
const { adjacent, ok } = require('./mcp-toolkit.cjs')

async function preparePit(call, { weekId = 'actual-pit-week', promoterId = weekId + '-promoter', opponentIds } = {}) {
  async function person(id, statBlock, name, description) {
    const state = await call('get_game_state')
    const cell = adjacent(state).find(candidate => ![...Object.values(state.npcs ?? {}), ...Object.values(state.monsters)]
      .some(actor => actor.position.x === candidate.x && actor.position.y === candidate.y))
    assert.ok(cell, 'The actual organized venue needs another real free same-room participant position.')
    ok(await call('create_npc', { npcId: id, name, description, statBlock, cell, disposition: 'neutral', visible: true }))
  }
  const initial = await call('get_game_state')
  if (!initial.npcs?.[promoterId] && !initial.monsters[promoterId])
    await person(promoterId, 'goblin', 'Promoteur réel', 'Cet organisateur réel représente le lieu de combats non létaux et verse uniquement les prix effectivement dus et explicitement réglés. Aucun coffre vide, ressource infinie ou consentement n’est inféré de son nom.')
  if (!opponentIds) {
    opponentIds = [weekId + '-opponent']
    await person(opponentIds[0], 'veteran', 'Participant réel', 'Cet individu réel participe aux rencontres non létales organisées et prévues par le MJ. Ses statistiques ne sont pas modifiées et aucun combat tactique n’est lancé.')
  }
  const state = await call('get_game_state')
  const venue = ok(await call('record_scene_fact', { cell: state.player.position,
    description: 'Le MJ qualifie ici le vrai lieu de rencontres organisées, prévues et non létales, ce promoteur présent et les participants effectivement désignés. Les prix source effectivement gagnés seront réglés par une réception explicite, sans mise ni frais d’entrée inventés.' })).worldFact
  const input = { eventId: weekId, venueFactId: venue.id, promoterId, opponentIds,
    explicitlyAdopted: true, actualPredeterminedNonlethalMatchesConfirmed: true }
  return { input, work: index => ({ eventId: weekId + '-day-' + index, weekId }),
    resolve: { eventId: weekId + '-resolve', weekId, useThreeSourceChecks: true }, promoterId, opponentIds,
    site: { mapId: state.currentMapId, roomId: state.currentRoomId, cell: state.player.position } }
}
async function nextPitDate(call, days = 1) {
  const state = await call('get_game_state'), to = (Math.floor(state.worldTimeSeconds / 86400) + days) * 86400
  let remaining = to - state.worldTimeSeconds
  while (remaining > 0) { const seconds = Math.min(86400, remaining); ok(await call('advance_time', { seconds })); remaining -= seconds }
}
async function completePitWork(call, fixture, { start = 0, gap = false } = {}) {
  for (let day = start; day < 5; day++) {
    if (day) await nextPitDate(call, gap && day === 2 ? 2 : 1)
    assert.equal(ok(await call('work_xge_pit_fighting', fixture.work(day))).seconds, 28800)
  }
}
module.exports = { preparePit, nextPitDate, completePitWork }
