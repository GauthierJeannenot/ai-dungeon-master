const { ok } = require('./mcp-toolkit.cjs')
const higherPotionRecipes = {
  superior: { gp: 1000, days: 15, templateId: 'potion_of_superior_healing', dice: 8, modifier: 8 },
  supreme: { gp: 10000, days: 20, templateId: 'potion_of_supreme_healing', dice: 10, modifier: 20 },
}
async function collectHigherBrewingFunds(call, gp, treasureId) {
  const state = await call('get_game_state')
  ok(await call('create_treasure', { treasureId, name: 'Vraies pièces pour les fournitures', mode: 'authored',
    description: 'Les pièces de platine réellement présentes sont ramassées avant l’achat des fournitures choisies.', cell: state.player.position, coins: { pp: gp / 10 } }))
  ok(await call('collect_treasure', { treasureId }))
}
async function prepareHigherPotion(call, toolItemId, {
  potionType = 'superior', eventId = 'actual-higher-potion-project', potionItemId = eventId + '-dose', paid,
} = {}) {
  const state = await call('get_game_state'), recipe = higherPotionRecipes[potionType]
  const fact = ok(await call('record_scene_fact', { cell: state.player.position,
    description: `Les fournitures ordinaires réellement disponibles à cet établi correspondent à une seule potion ${potionType}, sans formule ou ingrédient exotique inventé.` })).worldFact
  return { eventId, potionItemId, toolItemId, suppliesFactId: fact.id, potionType, paid: paid ?? { pp: recipe.gp / 10 },
    explicitlyAdopted: true, actualOneDoseSuppliesConfirmed: true,
    activitySource: 'Le personnage choisit cette préparation de potion avec les fournitures réelles, son type source et sa trousse maîtrisée.' }
}
const higherPotionWork = (projectId, index) => ({ eventId: projectId + '-work-' + index, projectId,
  activitySource: 'Huit heures réellement consacrées à cette unique potion au lieu de travail avec la même trousse maîtrisée.' })
async function advanceHigherBrewingDate(call, dates = 1) {
  const state = await call('get_game_state')
  let seconds = dates * 86400 - state.worldTimeSeconds % 86400
  while (seconds > 0) {
    const part = Math.min(864000, seconds)
    ok(await call('advance_time', { seconds: part }))
    seconds -= part
  }
}
module.exports = { higherPotionRecipes, collectHigherBrewingFunds, prepareHigherPotion, higherPotionWork, advanceHigherBrewingDate }
