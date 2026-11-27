const assert = require('node:assert/strict')
const { adjacent, ok } = require('./mcp-toolkit.cjs')

async function prepareGambling(call, { weekId = 'actual-gambling-week', creditorId = weekId + '-host', gp = 25 } = {}) {
  const state = await call('get_game_state')
  const cell = adjacent(state).find(candidate => !Object.values(state.npcs ?? {}).some(npc =>
    npc.position.x === candidate.x && npc.position.y === candidate.y))
  assert.ok(cell, 'The actual room needs a free spot near the selected venue.')
  ok(await call('create_npc', {
    npcId: creditorId, name: 'Représentant du lieu de jeu', cell, statBlock: 'goblin', disposition: 'neutral', visible: true,
    description: 'Ce PNJ déjà établi tient le jeu et est la contrepartie explicitement choisie par le MJ.',
  }))
  const venue = ok(await call('record_scene_fact', { cell: state.player.position,
    description: 'Le MJ confirme un jeu d’argent réel sur place et désigne ce représentant comme contrepartie.' })).worldFact
  const treasureId = weekId + '-real-funding'
  ok(await call('create_treasure', { treasureId, name: 'Pièces réelles', mode: 'authored', cell: state.player.position,
    description: 'Le MJ établit ces pièces réelles et les fait ramasser explicitement.', coins: { gp, cp: 1 } }))
  ok(await call('collect_treasure', { treasureId }))
  const input = { eventId: weekId, venueFactId: venue.id, creditorId, paid: { gp: 10 },
    explicitlyAdopted: true, actualGamblingVenueConfirmed: true }
  const work = index => ({ eventId: weekId + '-day-' + index, weekId })
  return { input, work, resolve: { eventId: weekId + '-roll', weekId, useThreeSourceChecks: true } }
}

async function nextGamblingDate(call, days = 1) {
  const now = (await call('get_game_state')).worldTimeSeconds ?? 0
  const to = (Math.floor(now / 86400) + days) * 86400
  let remaining = to - now
  while (remaining > 0) {
    const seconds = Math.min(86400, remaining)
    ok(await call('advance_time', { seconds }))
    remaining -= seconds
  }
}
module.exports = { prepareGambling, nextGamblingDate }
