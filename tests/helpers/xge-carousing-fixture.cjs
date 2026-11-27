const assert = require('node:assert/strict')
const { adjacent, ok } = require('./mcp-toolkit.cjs')

// Only public preparation. Never starts a week or inserts activity/ledger state.
async function prepareCarousing(call, { projectId = 'actual-carousing-week', socialClass = 'lower',
  venueId = projectId + '-venue', hostId = projectId + '-host', fundGp = 0 } = {}) {
  const state = await call('get_game_state')
  if (!state.npcs?.[hostId] && !state.monsters[hostId]) {
    const cell = adjacent(state).find(c => ![...Object.values(state.npcs ?? {}), ...Object.values(state.monsters)]
      .some(a => a.position.x === c.x && a.position.y === c.y))
    assert.ok(cell, 'A real free position beside the selected socializing venue is required.')
    ok(await call('create_npc', { npcId: hostId, name: 'Hôte réel du lieu de sociabilité', statBlock: 'goblin',
      cell, disposition: 'neutral', visible: true,
      description: 'Ce PNJ réellement représenté accueille cette semaine de repas, boissons et rencontres dans le milieu social explicitement qualifié par le MJ. Son espèce ne détermine ni sa classe sociale ni ses ressources.' }))
  }
  const venue = ok(await call('record_scene_fact', { cell: state.player.position,
    description: 'Le MJ atteste ce véritable lieu accessible de repas, boissons et sociabilité, son hôte réel et le milieu social choisi. Aucun PNJ, contact, aide, renseignement ou bénéfice ne vient de ce libellé.' })).worldFact
  const startInput = { eventId: projectId, venueId, venueFactId: venue.id, hostId, socialClass, explicitlyAdopted: true,
    actualSocializingAccessConfirmed: true, actualSocialClassConfirmed: true, actualVenueHostConfirmed: true }
  if (socialClass === 'upper') {
    const access = ok(await call('record_scene_fact', { cell: state.player.position,
      description: `Le MJ atteste que la personne réelle ${hostId}, déjà présente et rencontrée ici, est le contact suffisant qui a effectivement donné accès à la noblesse locale. Aucun historique noble, déguisement ou résultat de Tromperie n’est fabriqué.` })).worldFact
    startInput.nobilityAccessFactId = access.id
    startInput.actualNobilityAccessThroughContactsConfirmed = true
    startInput.nobilityContactIds = [hostId]
  }
  if (fundGp) {
    const treasureId = projectId + '-actual-coins'
    ok(await call('create_treasure', { treasureId, name: 'Pièces réelles pour les dépenses', mode: 'authored',
      cell: state.player.position, coins: { gp: fundGp }, description: 'Le MJ place ces vraies pièces avant leur collecte explicite.' }))
    ok(await call('collect_treasure', { treasureId }))
  }
  return { input: startInput, startInput,
    work: (index, paid) => ({ eventId: projectId + '-day-' + index, weekId: projectId, ...(paid ? { paid } : {}) }),
    resolve: { eventId: projectId + '-resolve', weekId: projectId },
    site: { mapId: state.currentMapId, roomId: state.currentRoomId, cell: state.player.position }, hostId, venueFactId: venue.id }
}
async function nextCarousingDate(call, days = 1) {
  const state = await call('get_game_state'), until = (Math.floor(state.worldTimeSeconds / 86400) + days) * 86400
  let left = until - state.worldTimeSeconds
  while (left > 0) { const seconds = Math.min(86400, left); ok(await call('advance_time', { seconds })); left -= seconds }
}
module.exports = { prepareCarousing, nextCarousingDate }
