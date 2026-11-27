const assert = require('node:assert/strict')
const { ok, adjacent } = require('./mcp-toolkit.cjs')
const { prepareCarousing, nextCarousingDate } = require('./xge-carousing-fixture.cjs')

async function sceneFact(call, description) {
  const s = await call('get_game_state')
  return ok(await call('record_scene_fact', { cell: s.player.position, description })).worldFact
}
async function createAnotherPerson(call, id = 'actual-other-person') {
  const s = await call('get_game_state'), cell = adjacent(s).find(c => ![...Object.values(s.npcs ?? {}), ...Object.values(s.monsters)]
    .some(a => a.position.x === c.x && a.position.y === c.y))
  assert.ok(cell)
  ok(await call('create_npc', { npcId: id, name: 'Autre personne réellement présente', statBlock: 'goblin', cell,
    disposition: 'neutral', visible: true, description: 'Cette autre personne physiquement représentée ne se substitue pas à l’identité du contact existant. Aucune classe sociale ou disposition ne vient de son espèce.' }))
  return id
}
async function completeCarousingWeek(call, f, { start = 0 } = {}) {
  for (let i = start; i < 5; i++) {
    if (i) await nextCarousingDate(call)
    ok(await call('work_xge_carousing', f.work(i, i ? undefined : { gp: { lower: 10, middle: 50, upper: 250 }[f.startInput.socialClass] })))
  }
  return ok(await call('resolve_xge_carousing', f.resolve))
}
async function nameActualContact(call, contactId, f) {
  const socialClass = await sceneFact(call, `Le MJ qualifie cette personne réellement rencontrée dans le milieu ${f.startInput.socialClass}, sans déduire ce milieu de son espèce.`)
  const relation = await sceneFact(call, 'Les véritables conversations et repas de cette semaine expliquent ce lien avec cette personne déjà représentée. Aucun effet ni attitude n’est produit par ce reçu.')
  const input = { eventId: f.startInput.eventId + '-actual-name', contactId, assignment: 'named', targetId: f.hostId,
    socialClass: f.startInput.socialClass, socialClassFactId: socialClass.id, explanationFactId: relation.id,
    actualMetNpcConfirmed: true, actualSocialClassConfirmed: true, actualRelationshipExplanationConfirmed: true }
  ok(await call('assign_xge_carousing_contact', input)); return input
}
async function actualAidInput(call, contactId, targetId, { eventId = 'actual-aid-' + contactId, renewed = false } = {}) {
  const aid = await sceneFact(call, 'Cette personne a effectivement apporté une aide précise déjà jouée, sans risque de vie. Cette qualification ne crée aucune aide, connaissance, récompense ou attitude.')
  return { eventId, contactId, targetId, actualAidOrObstacleFactId: aid.id, actualAidOrObstacleConfirmed: true, noLifeRiskConfirmed: true,
    ...(renewed ? { actualNewAidAfterRenewalConfirmed: true } : {}) }
}

// Positive progress uses public tools only, including every effort and aid qualification.
async function prepareNamedAlly(call, { projectId = 'old-actual-named-week', socialClass = 'lower', reserveSecond = false,
  consume = true, consumeAtFreeDate = true } = {}) {
  const f = await prepareCarousing(call, { projectId, socialClass, fundGp: 2 * { lower: 10, middle: 50, upper: 250 }[socialClass] })
  ok(await call('start_xge_carousing', f.startInput))
  const result = await completeCarousingWeek(call, f), outcome = result.week.resolution.outcome
  assert.equal(outcome.kind, 'allied')
  const contactId = outcome.contactIds[0], namedInput = await nameActualContact(call, contactId, f)
  if (reserveSecond) {
    assert.ok(outcome.contactIds[1])
    ok(await call('assign_xge_carousing_contact', { eventId: projectId + '-reserve-second', contactId: outcome.contactIds[1], assignment: 'unspecified' }))
  }
  let consumptionInput, consumption
  if (consume) {
    if (consumeAtFreeDate) await nextCarousingDate(call)
    consumptionInput = await actualAidInput(call, contactId, f.hostId, { eventId: projectId + '-actual-aid' })
    consumption = ok(await call('consume_xge_carousing_contact', consumptionInput)).event
  }
  return { f, contactId, targetId: f.hostId, namedInput, consumptionInput, consumption }
}

// Only prepares the next venue/input; no implicit start or effort.
async function prepareNextNamedWeek(call, old, { projectId = 'new-actual-named-week', socialClass = old.f.startInput.socialClass } = {}) {
  return prepareCarousing(call, { projectId, socialClass, hostId: old.targetId, venueId: old.f.startInput.venueId })
}
async function prepareRenewalInput(call, old, sourceContactId, { eventId = 'actual-named-renewal', consumedContactId = old.contactId,
  consumedEventId = old.consumptionInput?.eventId, socialClass = old.f.startInput.socialClass } = {}) {
  const meeting = await sceneFact(call, 'Le personnage rencontre réellement ici la même personne nommée, identifiée par son vrai corps et son identité sociale. Aucun remplaçant ni PNJ n’est créé.')
  const social = await sceneFact(call, `La classe sociale actuelle explicitement qualifiée de cette personne est toujours ${socialClass}, celle du lien d’origine et de cette nouvelle semaine.`)
  const renewal = await sceneFact(call, 'La nouvelle semaine réellement accomplie et ce retour en relation expliquent le retour en bonnes grâces avec cette personne. Le nouveau gain est offert pour une seule promesse future, sans aide ou attitude automatique.')
  return { eventId, sourceContactId, consumedContactId, consumedEventId, targetId: old.targetId, socialClass,
    meetingFactId: meeting.id, socialClassFactId: social.id, renewalFactId: renewal.id,
    actualSameNamedAllyMetConfirmed: true, actualCurrentClassAndGoodGracesConfirmed: true }
}
module.exports = { sceneFact, createAnotherPerson, completeCarousingWeek, nameActualContact, actualAidInput, prepareNamedAlly, prepareNextNamedWeek, prepareRenewalInput }
