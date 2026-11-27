const { ok } = require('./mcp-toolkit.cjs')

async function prepareUrbanEncounter(call, { secondOfDay = 12 * 3600, calendar = true, day = 1 } = {}) {
  const { player } = await call('get_game_state')
  const fact = async description => ok(await call('record_scene_fact', { description, cell: player.position })).worldFact
  const district = await fact('Le MJ confirme que ce quartier réellement présent est urbain et choisi pour le contrôle.')
  const input = {
    eventId: 'actual-urban-check', districtFactId: district.id, actualUrbanDistrictConfirmed: true,
    dayStartReferenceId: 'local-urban-day-start', nightStartReferenceId: 'local-urban-night-start',
    decision: 'draw', reason: 'Le MJ choisit une proposition pour le quartier actuellement fréquenté.',
  }
  if (!calendar) return { input }
  const date = { year: 1, segmentId: 'first', day }
  const decision = await fact('Le MJ établit le calendrier, sa date actuelle et son heure réelle.')
  ok(await call('configure_campaign_calendar', {
    eventId: 'actual-urban-calendar', decisionFactId: decision.id,
    actualCalendarAndAnchorConfirmed: true, day86400SecondsExplicitlyAdopted: true,
    definition: { kind: 'custom_fixed', name: 'Calendrier urbain choisi', segments: [{ segmentId: 'first', name: 'Mois choisi', days: 30 }] },
    anchor: { ...date, secondOfDay },
  }))
  for (const [referenceId, hour, name] of [[input.dayStartReferenceId, 6, 'Début du jour local'],
    [input.nightStartReferenceId, 20, 'Début de la nuit locale']]) {
    const source = await fact('Le MJ établit effectivement cette heure physique récurrente pour le quartier.')
    ok(await call('record_calendar_reference', {
      eventId: referenceId + '-event', referenceId, factId: source.id, actualReferenceConfirmed: true,
      category: 'physical_cycle', name, description: 'Repère physique local explicitement établi.',
      anchor: { ...date, secondOfDay: hour * 3600 }, periodDays: 1,
    }))
  }
  return { input, district }
}

const urbanReroll = (checkId, previousDrawId = checkId, eventId = 'actual-urban-reroll') => ({
  eventId, checkId, previousDrawId, incompatibleWithActualHourConfirmed: true,
  reason: 'Le MJ constate que la proposition précédente est incompatible avec cette heure locale réelle.',
})

module.exports = { prepareUrbanEncounter, urbanReroll }
