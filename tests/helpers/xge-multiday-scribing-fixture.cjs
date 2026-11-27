const { ok } = require('./mcp-toolkit.cjs')

async function fundMultiDayScribing(call, { treasureId = 'actual-multiday-scribing-funds', coins = { gp: 250 } } = {}) {
  const state = await call('get_game_state')
  ok(await call('create_treasure', {
    treasureId, name: 'Fonds réels de transcription', mode: 'authored',
    description: 'Ces pièces réellement présentes sont collectées pour les fournitures du parchemin choisi.',
    cell: state.player.position, coins,
  }))
  ok(await call('collect_treasure', { treasureId }))
}

/** Actual supplies qualification only: no start, funds, spell preparation or effort is implicit. */
async function prepareMultiDayScroll(call, {
  projectId = 'actual-multiday-scribing', eventId = projectId + '-start',
  scrollItemId = projectId + '-scroll', paid = { gp: 250 },
} = {}) {
  const state = await call('get_game_state')
  const suppliesFact = ok(await call('record_scene_fact', {
    cell: state.player.position,
    description: 'Le MJ constate à cette case le vrai papier et la vraie encre nécessaires pour ce seul parchemin de Pas brumeux ; cette qualification ne crée pas de sort, de travail ni de richesse.',
  })).worldFact
  const input = {
    eventId, projectId, scrollItemId, spellId: 'misty-step', suppliesFactId: suppliesFact.id, paid,
    explicitlyAdopted: true, actualOneScrollSuppliesConfirmed: true,
  }
  return {
    input, start: input, suppliesFact,
    work: index => ({
      eventId: projectId + '-actual-date-' + index, projectId,
      activitySource: 'Huit heures réelles de transcription de ce parchemin précis, sans crédit pour une autre activité.',
    }),
  }
}

async function nextMultiDayScribingDate(call) {
  const state = await call('get_game_state')
  ok(await call('advance_time', { seconds: 86400 - state.worldTimeSeconds % 86400 }))
}

module.exports = { prepareMultiDayScroll, fundMultiDayScribing, nextMultiDayScribingDate }
