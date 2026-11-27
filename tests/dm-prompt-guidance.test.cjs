// Vocabulaire des prompts DM par module (promptGuidance). Vérifie qu'un module
// ne reçoit jamais le vocabulaire mécanique d'un autre : le prompt statique ET
// les exemples du MJ de tide-crypt sont exempts des termes Grammy (Mac,
// verger, dryade, Grukk), et Grammy conserve ses exemples d'origine.

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')

process.env.APP_LOG_BUFFER_ENABLED = 'false'
process.env.APP_LOG_LEVEL = 'error'
process.env.APP_LOG_PERSIST_ENABLED = 'false'
process.env.MONETIZATION_ENABLED = 'false'

const restoreTsRequire = installTsRequireWithAliases()
const { guidesForDomain } = require('../lib/rule-guides.ts')
const withGuide = (id, domain) => buildStaticPrompt(id) + '\n' + guidesForDomain(domain).map(guide => guide.text).join('\n')
const { buildStaticPrompt } = require(path.join(process.cwd(), 'lib/dm/prompts.ts'))
const { buildDynamicPrompt } = require(path.join(process.cwd(), 'lib/dm/prompts.ts'))
const { buildMapQuestContext } = require(path.join(process.cwd(), 'lib/dm/quest-context.ts'))
const { getAdventureMap, evaluateMapQuest } = require(path.join(process.cwd(), 'lib/adventure-map.ts'))
const { buildInitialGameState } = require(path.join(process.cwd(), 'lib/initial-game-state.ts'))

test.after(() => {
  restoreTsRequire()
})

// Termes du bestiaire/lore Grammy qui NE doivent pas fuir dans un autre module.
// (« boulangerie »/« Grammy » sont volontairement absents : la fiche perso de
// tide-crypt y fait un clin d'œil narratif assumé — c'est du contenu propre.)
const GRAMMY_BESTIARY = /verger|dryade|mac le|grukk|tarte/i

test('door guidance uses the atomic tool without suggesting a generic check or a custom DC', () => {
  const prompt = withGuide('tide-crypt', 'objects')
  assert.match(prompt, /Forcer une porte identifiée.*interact_door/)
  assert.doesNotMatch(prompt, /Fouiller[^\n]*forcer une porte[^\n]*roll_ability_check/)

})

test('all adventures tell the DM to prefer dedicated tools while keeping standalone checks available', () => {
  for (const id of ['grammys-country-apple-pie', 'tide-crypt', 'fey-shadow-fair', 'sarah-of-yellowcrest-manor']) {
    for (const prompt of [buildStaticPrompt(id)]) {
      assert.match(prompt, /Priorité aux outils dédiés — règle générale/)
      assert.match(prompt, /pour la même tentative, ni avant ni après/)
      assert.match(prompt, /Un jet générique reste permis pour une action sans outil adapté/)
      assert.match(prompt, /Un refus de l'outil dédié n'autorise pas son contournement/)
    }
  }

})

test('the DM distinguishes unlimited GM events from the rare explicitly granted second player action', () => {
  const prompt = buildStaticPrompt('tide-crypt')
  assert.match(prompt, /autant d'événements du MJ que nécessaire/)
  assert.match(prompt, /Exception rare décidée par le MJ/)
  assert.match(prompt, /grant_player_action\(\{reason\}\)/)
  assert.match(prompt, /deuxième action effectivement déclarée par le joueur/)
  assert.match(prompt, /Jamais d'octroi systématique, de troisième action/)

})

test('DM rewards creative roleplay with a bounded bonus instead of advantage', () => {
  const prompt = withGuide('tide-crypt', 'check_modes')
  assert.match(prompt, /Bonus RP/)
  assert.match(prompt, /\+1 à \+5/)
  assert.match(prompt, /roleplayBonus/)
  assert.match(prompt, /roleplayReason/)
  assert.match(prompt, /N'accorde JAMAIS l'avantage comme récompense de roleplay/)
  assert.match(prompt, /jamais aux dégâts/)
})

test('certain changes of trust and inventory still require their tools, without inventing a player choice', () => {
  const prompt = withGuide('tide-crypt', 'items')
  assert.match(prompt, /Même un changement certain sans jet/)
  assert.match(prompt, /confiance\/disposition/)
  assert.match(prompt, /prise ou dépôt/)
  assert.match(prompt, /Accepter une mission n'autorise pas à prendre un objet offert/)

})

test('tide-crypt static prompt is free of Grammy bestiary vocabulary', () => {
  const prompt = buildStaticPrompt('tide-crypt')
  assert.doesNotMatch(prompt, GRAMMY_BESTIARY, 'le prompt statique tide-crypt contient du vocabulaire Grammy')
  assert.match(prompt, /Maël/, 'le prompt statique tide-crypt devrait mentionner Maël')
})

test('the DM owns interpretation, ambiguity and tool selection in every adventure', () => {
  for (const id of ['grammys-country-apple-pie', 'tide-crypt', 'fey-shadow-fair', 'sarah-of-yellowcrest-manor']) {
    const prompt = buildStaticPrompt(id)
    assert.match(prompt, /Tu interprètes directement le message du joueur et choisis toi-même les outils MCP/)
    assert.match(prompt, /Respecte les négations, citations et hypothèses/)
    assert.match(prompt, /demande une précision avant d'agir/)
    assert.match(prompt, /Une réponse textuelle, une consultation de règles ou record_scene_fact ne résout jamais cette mécanique/)
    assert.match(prompt, /Exemples propres à cette aventure/)
    assert.doesNotMatch(prompt, /requiresMechanic|sceneMarkers|confidence=|classifieur|planner/)
  }
})

test('module action examples reach only their own DM, including apparition and trust without implicit pickup', () => {
  const crypt = buildStaticPrompt('tide-crypt')
  assert.match(crypt, /je sonne les cloches/)
  assert.doesNotMatch(crypt, GRAMMY_BESTIARY)
  const grammy = buildStaticPrompt('grammys-country-apple-pie')
  assert.match(grammy, /je dépose une offrande au pied des arbres/)
  assert.doesNotMatch(grammy, /je sonne les cloches/)
  const sarah = buildStaticPrompt('sarah-of-yellowcrest-manor')
  assert.match(sarah, /je lis le livre.*appelle reveal_npc.*npcId="sarah"/)
  assert.match(sarah, /la réponse finale raconte d’abord le résumé complet de la lecture décrit en salle 1, puis l’apparition muette/)
  assert.match(sarah, /ni placer ce résumé seulement dans la prose accompagnant l’appel outil/)
  assert.match(sarah, /Ne pas ramasser la copie sans demande du joueur/)
})

test('every adventure keeps GM knowledge separate from character discoveries, including departure advice and past spoilers', () => {
  for (const id of ['grammys-country-apple-pie', 'tide-crypt', 'fey-shadow-fair', 'sarah-of-yellowcrest-manor']) {
    const prompt = buildStaticPrompt(id)
    assert.match(prompt, /Secrets du MJ et point de vue du personnage/)
    assert.match(prompt, /Un risque écrit dans les notes du MJ n'est pas un avertissement à donner au joueur/)
    assert.match(prompt, /Avant un départ définitif.*pistes déjà découvertes laissées en suspens/)
    assert.match(prompt, /Ne présente ni objectifs cachés, ni listes de complétion/)
    assert.match(prompt, /Un ancien aparté omniscient.*ne transforme pas un secret en connaissance du personnage/)
    assert.match(prompt, /MODULE D'AVENTURE \(INDEX\)\nRéférence confidentielle du MJ/)
  }
})

test('Waterdeep objectives and NPC descriptions no longer advertise a future consequence; the room notes retain it as private GM material', () => {
  const id = 'sarah-of-yellowcrest-manor'
  const state = buildInitialGameState(id)
  state.currentMapId = 'waterdeep'
  state.currentRoomId = '6'
  state.player.position = { x: 18, y: 7 }
  const objective = evaluateMapQuest(state, 'waterdeep', id).objectives.find(o => o.id === 'vecken_warned')
  assert.equal(objective.done, false)
  assert.equal(objective.label, 'Vecken a reçu le témoignage sur Sarah')
  assert.doesNotMatch(getAdventureMap(id).npcs.find(npc => npc.id === 'vecken').description, /part.*seul|captur/i)
  const questContext = buildMapQuestContext(state)
  assert.match(questContext, /ne sont pas un journal de quête public/)
  assert.doesNotMatch(questContext, /risque de partir seul|sera capturé/)
  const dynamic = buildDynamicPrompt(state)
  assert.match(dynamic, /SALLE ACTUELLE — DÉTAIL DU MODULE\nRéférence confidentielle du MJ/)
  assert.match(dynamic, /Secret MJ — ne pas annoncer au joueur, même comme avertissement ou option de dialogue/)
  assert.match(dynamic, /Vecken part seul chercher vengeance et sera capturé/)
  assert.match(dynamic, /Ne pas proposer de le convaincre pour éviter ce développement/)
})
