const assert = require('node:assert/strict')
const { ok } = require('./mcp-toolkit.cjs')
const { calendarDateSeconds, calendarDateFromSeconds } = require('../../mcp-server/dist/lib/calendar-state.js')

async function prepareRechargeCalendar(call, { firstAfterSeconds = 3600, adopt = true, periodDays = 1 } = {}) {
  const before = await call('get_game_state')
  const fact = async description => ok(await call('record_scene_fact', { description, cell: before.player.position })).worldFact
  if (!before.dmTools?.calendar) {
    const decision = await fact('Le MJ établit un calendrier de campagne et son ancre actuelle pour mesurer les vrais instants.')
    ok(await call('configure_campaign_calendar', {
      eventId: 'recharge-campaign-calendar', decisionFactId: decision.id,
      actualCalendarAndAnchorConfirmed: true, day86400SecondsExplicitlyAdopted: true,
      definition: { kind: 'custom_fixed', name: 'Calendrier de campagne', segments: [{ segmentId: 'first', name: 'Cycle choisi', days: 365 }] },
      anchor: { year: 1, segmentId: 'first', day: 1, secondOfDay: 0 },
    }))
  }
  const state = await call('get_game_state')
  const sourceFact = await fact('Le MJ confirme que cette carte est sans aube et y fixe une vraie référence physique de recharge toutes les vingt-quatre heures.')
  const configuration = state.dmTools.calendar.configuration
  const definition = configuration.input.definition
  const seconds = calendarDateSeconds(definition, configuration.input.anchor)
    + state.worldTimeSeconds - configuration.at + firstAfterSeconds
  const { year, segmentId, day, secondOfDay } = calendarDateFromSeconds(definition, seconds)
  const reference = {
    eventId: 'actual-recharge-reference-command', referenceId: 'actual-dawnless-recharge-reference',
    factId: sourceFact.id, actualReferenceConfirmed: true, category: 'physical_cycle', name: 'Instant de recharge sans aube',
    description: 'Référence locale de vingt-quatre heures choisie par le MJ.', anchor: { year, segmentId, day, secondOfDay }, periodDays,
  }
  ok(await call('record_calendar_reference', reference))
  const input = { eventId: 'actual-xge-recharge-adoption', mapId: state.currentMapId,
    referenceId: reference.referenceId, actualDawnlessMapConfirmed: true }
  const result = adopt ? ok(await call('adopt_xge_recharge_calendar', input)) : undefined
  assert.equal((await call('get_game_state')).worldTimeSeconds, before.worldTimeSeconds)
  return { input, result, reference, sourceFact }
}

async function createRechargeItem(call, templateId, itemId, { initialCharges, pickup = true } = {}) {
  const state = await call('get_game_state')
  ok(await call('create_magic_item', { templateId, itemId, name: 'Objet de recharge observé',
    description: 'Un objet magique réel déposé au point choisi.', cell: state.player.position,
    ...(initialCharges === undefined ? {} : { initialCharges }) }))
  if (pickup) ok(await call('pick_up_item', { itemId }))
  return itemId
}

async function expendPearl(call, itemId = 'actual-recharge-pearl') {
  const { player } = await call('get_game_state')
  if (!player.knownSpells.includes('mage-armor')) ok(await call('prepare_spells', { spellIds: ['mage-armor'] }))
  await createRechargeItem(call, 'pearl_of_power', itemId)
  ok(await call('attune_magic_item', { itemId, operation: 'attune' }))
  const before = await call('get_game_state')
  ok(await call('cast_spell', { spellId: 'mage-armor', slotLevel: 1, targetId: 'player', focusItemId: 'component_pouch' }))
  assert.equal((await call('get_game_state')).player.spellSlots.level1.current, before.player.spellSlots.level1.current - 1)
  const use = ok(await call('use_magic_item', { itemId, slotLevel: 1 }))
  assert.equal(use.chargesRemaining, 0)
  assert.equal(use.spellSlots.level1.current, before.player.spellSlots.level1.current)
  return itemId
}

module.exports = { prepareRechargeCalendar, createRechargeItem, expendPearl }
