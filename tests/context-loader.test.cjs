// Le context-loader charge les fichiers markdown du bon module, avec repli sur
// le module par défaut (Grammy's) pour les fichiers de règles qu'un module ne
// redéfinit pas (tide-crypt n'a ni player-rules.md ni dm-rules.md).

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')

process.env.APP_LOG_BUFFER_ENABLED = 'false'
process.env.APP_LOG_LEVEL = 'error'
process.env.APP_LOG_PERSIST_ENABLED = 'false'

const restoreTsRequire = installTsRequireWithAliases()
const loader = require(path.join(process.cwd(), 'lib/context-loader.ts'))

test.after(() => {
  restoreTsRequire()
})

test('loads each module own adventure text and player sheet', () => {
  const grammy = loader.loadContextFiles('grammys-country-apple-pie')
  assert.match(grammy.adventureModule, /Grammy|boulangerie/i)
  assert.match(grammy.playerCharacter, /Niveau.*1|Niveau : 1/i)

  const tide = loader.loadContextFiles('tide-crypt')
  assert.match(tide.adventureModule, /Crypte des Marées|Morgane|phare/i)
  assert.match(tide.playerCharacter, /Niveau.*2/i)
})

test('tide-crypt falls back to Grammy player rules but keeps its own dm rules', () => {
  const grammy = loader.loadContextFiles('grammys-country-apple-pie')
  const tide = loader.loadContextFiles('tide-crypt')
  // player-rules.md n'existe pas côté tide-crypt → repli sur les règles joueur
  // génériques de Grammy's (mécaniques D&D communes, sans vocabulaire de module).
  assert.equal(tide.playerRules, grammy.playerRules)
  // dm-rules.md, adventure-module.md et player-character.md sont PROPRES à
  // tide-crypt (son dm-rules.md évite d'hériter du bestiaire Grammy — Mac,
  // dryades, verger — qui fuyait auparavant dans le prompt de la crypte).
  assert.notEqual(tide.dmRules, grammy.dmRules)
  assert.doesNotMatch(tide.dmRules, /Mac le|dryade|verger|Grukk/i)
  assert.notEqual(tide.adventureModule, grammy.adventureModule)
  assert.notEqual(tide.playerCharacter, grammy.playerCharacter)
})

test('unknown module defaults to the default module content (fail-safe)', () => {
  const grammy = loader.loadContextFiles('grammys-country-apple-pie')
  // Id inconnu du registre → repli fail-safe sur le module par défaut pour TOUS
  // les fichiers (perModule ou non), puisqu'aucun contenu propre n'existe.
  const unknown = loader.loadContextFiles('does-not-exist')
  assert.equal(unknown.adventureModule, grammy.adventureModule)
  assert.equal(unknown.playerCharacter, grammy.playerCharacter)
})

test('the default module ships all four context files (fallback guard)', () => {
  // Le repli n'a plus de constante en dur : il s'appuie entièrement sur les
  // fichiers du module par défaut. Ils doivent tous exister sur le disque.
  const dir = path.join(process.cwd(), 'adventures', 'grammys-country-apple-pie')
  for (const file of ['player-character.md', 'player-rules.md', 'dm-rules.md', 'adventure-module.md']) {
    assert.ok(fs.existsSync(path.join(dir, file)), `fichier de repli manquant : ${file}`)
  }
})

test('parsed module is cached per adventure and split into rooms', () => {
  const grammy = loader.loadAdventureModuleParsed('grammys-country-apple-pie')
  const tide = loader.loadAdventureModuleParsed('tide-crypt')
  assert.ok(Object.keys(grammy.rooms).length >= 6)
  assert.ok(Object.keys(tide.rooms).length >= 6)
  assert.notEqual(grammy.index, tide.index)
  // Cache : deux appels rendent la même instance.
  assert.equal(loader.loadAdventureModuleParsed('tide-crypt'), tide)
})
