const assert = require('node:assert/strict')
const { adjacent, ok } = require('./mcp-toolkit.cjs')
async function prepareService(call, { weekId = 'actual-service-week', templeId = 'actual-temple', representativeId = 'actual-temple-representative' } = {}) {
  const initial = await call('get_game_state')
  if (!initial.npcs?.[representativeId] && !initial.monsters[representativeId]) {
    const cell = adjacent(initial).find(c => ![...Object.values(initial.npcs ?? {}), ...Object.values(initial.monsters)]
      .some(a => a.position.x === c.x && a.position.y === c.y))
    assert.ok(cell, 'A real free same-room position for the explicitly qualified temple representative is required.')
    ok(await call('create_npc', { npcId: representativeId, name: 'Représentant réel du temple', statBlock: 'goblin', cell,
      disposition: 'neutral', visible: true, description: 'Cette personne réellement présente représente ce temple et accepte cette semaine de service. Aucune religion, capacité cléricale, attitude favorable, information ou ressource n’est déduite de son espèce ou de son nom.' }))
  }
  const state = await call('get_game_state')
  const temple = ok(await call('record_scene_fact', { cell: state.player.position,
    description: 'Le MJ qualifie ici ce vrai lieu de culte représenté sur le support actuel, son accès réel pour ce personnage et ses croyances/ethos réellement alignés. La personne désignée est effectivement son représentant capable. Le service ne paie aucune pièce et les faveurs sont seulement des promesses futures.' })).worldFact
  const input = { eventId: weekId, templeId, templeFactId: temple.id, representativeId, explicitlyAdopted: true,
    actualTempleAccessConfirmed: true, actualAlignedBeliefsAndEthosConfirmed: true, actualTempleRepresentativeConfirmed: true }
  async function acceptedFavor(favorId, { eventId = weekId + '-actual-favor-use', purpose = 'specific_problem' } = {}) {
    const here = await call('get_game_state')
    const request = ok(await call('record_scene_fact', { cell: here.player.position,
      description: 'Le personnage a réellement demandé à ce temple une aide pour le problème précis choisi par le MJ, ou le soutien social/politique explicitement sélectionné. Cette qualification ne révèle aucun renseignement et ne fournit aucun avantage.' })).worldFact
    const acceptance = ok(await call('record_scene_fact', { cell: here.player.position,
      description: 'Le représentant présent de ce temple a réellement accepté cette demande et cette consommation de promesse. Aucun service, renseignement, quête, alliance, présage ou effet physique n’est exécuté par ce simple reçu.' })).worldFact
    return { eventId, favorId, representativeId, purpose, requestFactId: request.id, acceptanceFactId: acceptance.id,
      actualRequestAndAcceptanceConfirmed: true, actualTempleRepresentativeConfirmed: true }
  }
  return { input, work: index => ({ eventId: weekId + '-day-' + index, weekId }),
    resolve: { eventId: weekId + '-resolve', weekId, skill: 'religion' }, acceptedFavor,
    site: { mapId: state.currentMapId, roomId: state.currentRoomId, cell: state.player.position } }
}
async function nextServiceDate(call, days = 1) {
  const state = await call('get_game_state'), until = (Math.floor(state.worldTimeSeconds / 86400) + days) * 86400
  let remaining = until - state.worldTimeSeconds
  while (remaining > 0) { const seconds = Math.min(86400, remaining); ok(await call('advance_time', { seconds })); remaining -= seconds }
}
async function completeServiceWork(call, f, { start = 0, gap = false } = {}) {
  for (let i = start; i < 5; i++) {
    if (i) await nextServiceDate(call, gap && i === 2 ? 2 : 1)
    assert.equal(ok(await call('work_xge_religious_service', f.work(i))).seconds, 28800)
  }
}
module.exports = { prepareService, nextServiceDate, completeServiceWork }
