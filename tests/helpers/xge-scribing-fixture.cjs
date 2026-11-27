const { ok } = require('./mcp-toolkit.cjs')

async function fundScribing(call, treasureId = 'actual-scribing-funds', gp = 75) {
  const { player } = await call('get_game_state')
  ok(await call('create_treasure', {
    treasureId, name: 'Fonds de transcription', mode: 'authored',
    description: 'Le personnage collecte ces pièces réelles pour payer le papier et l’encre.',
    cell: player.position, coins: { gp },
  }))
  ok(await call('collect_treasure', { treasureId }))
}

async function prepareScribingAtCurrentSite(call, {
  eventId = 'actual-xge-scribing', scrollItemId = 'actual-scribed-scroll', spellId = 'magic-missile',
  paid = { gp: spellId === 'ray-of-frost' ? 15 : 25 }, componentPouchItemId,
} = {}) {
  const { player } = await call('get_game_state')
  const { worldFact } = ok(await call('record_scene_fact', {
    cell: player.position,
    description: 'Le MJ confirme le papier et l’encre réellement disponibles à ce lieu de transcription pour un seul parchemin.',
  }))
  return { eventId, scrollItemId, spellId, suppliesFactId: worldFact.id, paid,
    explicitlyAdopted: true, actualOneScrollSuppliesConfirmed: true,
    activitySource: 'Le PJ choisit de consacrer huit heures réelles à ce parchemin.',
    ...(componentPouchItemId ? { componentPouchItemId } : {}) }
}

module.exports = { fundScribing, prepareScribingAtCurrentSite }
