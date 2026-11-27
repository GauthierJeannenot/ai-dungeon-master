const { ok } = require('./mcp-toolkit.cjs')
const { calendarDateSeconds, calendarDateFromSeconds } = require('../../mcp-server/dist/lib/calendar-state.js')

async function prepareItemRechargeTime(call, itemIds, {
  eventId = 'actual-selected-item-recharge-time', firstAfterSeconds = 60, adopt = true,
} = {}) {
  const before = await call('get_game_state')
  const fact = async description => ok(await call('record_scene_fact', { description, cell: before.player.position })).worldFact
  if (!before.dmTools?.calendar) {
    const decision = await fact('Le MJ définit ce calendrier et son ancre présente pour les vrais horaires de la campagne.')
    ok(await call('configure_campaign_calendar', { eventId: eventId + '-calendar', decisionFactId: decision.id,
      actualCalendarAndAnchorConfirmed: true, day86400SecondsExplicitlyAdopted: true,
      definition: { kind: 'custom_fixed', name: 'Calendrier choisi', segments: [{ segmentId: 'year', name: 'Année réelle', days: 365 }] },
      anchor: { year: 1, segmentId: 'year', day: 1, secondOfDay: 0 } }))
  }
  const state = await call('get_game_state'), c = state.dmTools.calendar.configuration
  const observation = await fact('Le MJ confirme que ce monde connaît une aube et choisit ce véritable horaire local de recharge chaque24heures pour les seules instances explicitement désignées.')
  const referenceId = eventId + '-reference'
  const date = calendarDateFromSeconds(c.input.definition,
    calendarDateSeconds(c.input.definition, c.input.anchor) + state.worldTimeSeconds - c.at + firstAfterSeconds)
  const anchor = { year: date.year, segmentId: date.segmentId, day: date.day, secondOfDay: date.secondOfDay }
  ok(await call('record_calendar_reference', { eventId: eventId + '-reference-command', referenceId,
    factId: observation.id, actualReferenceConfirmed: true, category: 'physical_cycle', name: 'Horaire local choisi',
    description: 'Instant local retenu par le MJ dans ce monde avec aube, sans conséquence immédiate.', anchor, periodDays: 1 }))
  const input = { eventId, mapId: state.currentMapId, referenceId, itemIds,
    actualWorldWithDawnConfirmed: true, explicitlyAdopted: true }
  return { input, ...(adopt ? { result: ok(await call('adopt_xge_item_recharge_time', input)) } : {}) }
}
module.exports = { prepareItemRechargeTime }
