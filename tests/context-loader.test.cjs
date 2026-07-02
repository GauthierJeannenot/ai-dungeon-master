// Le context-loader charge les fichiers markdown du bon module, avec repli sur
// le module par défaut (Grammy's) pour les fichiers de règles qu'un module ne
// redéfinit pas (tide-crypt n'a ni player-rules.md ni dm-rules.md).

const assert = require('node:assert/strict')
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

test('tide-crypt falls back to Grammy generic rules for missing files', () => {
  const grammy = loader.loadContextFiles('grammys-country-apple-pie')
  const tide = loader.loadContextFiles('tide-crypt')
  // player-rules.md / dm-rules.md n'existent pas côté tide-crypt → repli Grammy's.
  assert.equal(tide.playerRules, grammy.playerRules)
  assert.equal(tide.dmRules, grammy.dmRules)
  // ... mais le module et la fiche perso sont bien distincts.
  assert.notEqual(tide.adventureModule, grammy.adventureModule)
  assert.notEqual(tide.playerCharacter, grammy.playerCharacter)
})

test('unknown module defaults to Grammy content', () => {
  const grammy = loader.loadContextFiles('grammys-country-apple-pie')
  const unknown = loader.loadContextFiles('does-not-exist')
  // Dossier absent → repli sur le module par défaut pour tous les fichiers.
  assert.equal(unknown.adventureModule, grammy.adventureModule)
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
