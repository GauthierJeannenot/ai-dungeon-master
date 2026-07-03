// Vocabulaire des prompts DM par module (promptGuidance). Vérifie qu'un module
// ne reçoit jamais le vocabulaire mécanique d'un autre : le prompt statique ET
// le prompt du classifieur de tide-crypt sont exempts des termes Grammy (Mac,
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
const { buildStaticPrompt } = require(path.join(process.cwd(), 'lib/dm/prompts.ts'))
const { buildPlannerSystem } = require(path.join(process.cwd(), 'lib/dm/planner.ts'))
const { buildInitialGameState } = require(path.join(process.cwd(), 'lib/initial-game-state.ts'))

test.after(() => {
  restoreTsRequire()
})

// Termes du bestiaire/lore Grammy qui NE doivent pas fuir dans un autre module.
// (« boulangerie »/« Grammy » sont volontairement absents : la fiche perso de
// tide-crypt y fait un clin d'œil narratif assumé — c'est du contenu propre.)
const GRAMMY_BESTIARY = /verger|dryade|mac le|grukk|tarte/i

const FAKE_TOOLS = [
  { name: 'roll_ability_check', description: 'jet de caractéristique' },
  { name: 'move_token', description: 'déplacement' },
  { name: 'resolve_player_attack', description: 'attaque' },
]

test('tide-crypt static prompt is free of Grammy bestiary vocabulary', () => {
  const prompt = buildStaticPrompt('tide-crypt')
  assert.doesNotMatch(prompt, GRAMMY_BESTIARY, 'le prompt statique tide-crypt contient du vocabulaire Grammy')
  assert.match(prompt, /Maël/, 'le prompt statique tide-crypt devrait mentionner Maël')
})

test('tide-crypt planner system is free of Grammy vocabulary and speaks the crypt', () => {
  const gs = buildInitialGameState('tide-crypt')
  const system = buildPlannerSystem(gs, FAKE_TOOLS, undefined)
  assert.doesNotMatch(system, GRAMMY_BESTIARY, 'le classifieur tide-crypt contient du vocabulaire Grammy')
  assert.match(system, /reveal_npc:ghost/, "le classifieur tide-crypt devrait utiliser le marqueur reveal_npc du module")
})

test('grammy planner system keeps its original module examples (regression guard)', () => {
  const gs = buildInitialGameState('grammys-country-apple-pie')
  const system = buildPlannerSystem(gs, FAKE_TOOLS, undefined)
  // Les exemples d'origine restent byte-identiques (le prompt Grammy ne bouge pas).
  assert.match(system, /je dépose une offrande au pied des arbres.*reveal_npc:dryad/)
  assert.match(system, /reveal_npc:dryad" quand des PNJ cachés se montrent/)
})
