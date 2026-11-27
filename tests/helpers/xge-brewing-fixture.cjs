const { ok } = require('./mcp-toolkit.cjs')
const { prepareCourse } = require('./xge-training-fixture.cjs')

async function collectFunding(call, treasureId, gp) {
  const { player } = await call('get_game_state')
  ok(await call('create_treasure', {
    treasureId, name: 'Pièces réelles disponibles', mode: 'authored',
    description: 'Fonds réellement collectés pour couvrir la formation et les fournitures.',
    cell: player.position, coins: { gp },
  }))
  ok(await call('collect_treasure', { treasureId }))
}

async function prepareHerbalismCourse(call, courseId = 'actual-brewing-herbalism') {
  await collectFunding(call, courseId + '-funding', 250)
  return prepareCourse(call, { kind: 'tool', subjectId: 'herbalism_kit', courseId })
}

async function prepareBrewAtCurrentSite(call, toolItemId, {
  eventId = 'actual-xge-brewing', potionItemId = 'actual-brewed-healing-potion', paid = { gp: 25 },
} = {}) {
  const { player } = await call('get_game_state')
  const { worldFact } = ok(await call('record_scene_fact', {
    cell: player.position,
    description: 'Le MJ confirme les fournitures ordinaires réellement disponibles pour une seule potion de soins normale à ce lieu de travail.',
  }))
  return { eventId, potionItemId, toolItemId, suppliesFactId: worldFact.id, paid,
    explicitlyAdopted: true, actualOneDoseSuppliesConfirmed: true,
    activitySource: 'Le PJ consacre huit heures réelles à cette potion avec ses fournitures établies.' }
}

module.exports = { prepareHerbalismCourse, prepareBrewAtCurrentSite }
