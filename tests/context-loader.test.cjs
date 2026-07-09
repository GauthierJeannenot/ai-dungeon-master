// Le context-loader charge les fichiers markdown du bon module, avec repli sur
// adventures/_shared/ pour les fichiers de règles qu'un module ne redéfinit pas
// (règles D&D génériques, sans vocabulaire de module). Le contenu PROPRE au
// module (adventure-module.md) ne se replie jamais sur une autre aventure.

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

test('loads each module own adventure text and the chosen character sheet', () => {
  const grammy = loader.loadContextFiles('grammys-country-apple-pie')
  assert.match(grammy.adventureModule, /Grammy|boulangerie/i)
  // Fiche GÉNÉRIQUE du personnage (défaut : guerrier) — plus de niveau/PV chiffrés.
  assert.match(grammy.playerCharacter, /Guerrier/i)

  const tide = loader.loadContextFiles('tide-crypt')
  assert.match(tide.adventureModule, /Crypte des Marées|Morgane|phare/i)
})

test('the character sheet is GLOBAL : même personnage → même fiche sur deux aventures', () => {
  // Le personnage est orthogonal à l'aventure : le guerrier a la MÊME fiche
  // partout (l'accroche narrative propre au couple vit dans definition.ts).
  const grammyFighter = loader.loadContextFiles('grammys-country-apple-pie', 'fighter')
  const tideFighter = loader.loadContextFiles('tide-crypt', 'fighter')
  assert.equal(grammyFighter.playerCharacter, tideFighter.playerCharacter)

  // Un personnage différent → fiche différente (classe, sorts, capacités).
  const wizard = loader.loadContextFiles('grammys-country-apple-pie', 'wizard')
  assert.match(wizard.playerCharacter, /Magicien/i)
  assert.notEqual(wizard.playerCharacter, grammyFighter.playerCharacter)
})

test('modules without their own rules fall back to the shared files', () => {
  const sharedPlayerRules = fs.readFileSync(
    path.join(process.cwd(), 'adventures', '_shared', 'player-rules.md'), 'utf-8')
  const sharedDmRules = fs.readFileSync(
    path.join(process.cwd(), 'adventures', '_shared', 'dm-rules.md'), 'utf-8')

  // Aucun module ne redéfinit player-rules.md → tout le monde reçoit le partagé.
  const grammy = loader.loadContextFiles('grammys-country-apple-pie')
  const tide = loader.loadContextFiles('tide-crypt')
  const fey = loader.loadContextFiles('fey-shadow-fair')
  assert.equal(grammy.playerRules, sharedPlayerRules)
  assert.equal(tide.playerRules, sharedPlayerRules)
  assert.equal(fey.playerRules, sharedPlayerRules)

  // dm-rules.md : Grammy's et tide-crypt ont leur propre version (bestiaire et
  // notes de mise en scène du module) ; fey-shadow-fair reçoit le partagé.
  assert.notEqual(grammy.dmRules, sharedDmRules)
  assert.notEqual(tide.dmRules, sharedDmRules)
  assert.equal(fey.dmRules, sharedDmRules)
  assert.notEqual(tide.dmRules, grammy.dmRules)
  assert.notEqual(tide.adventureModule, grammy.adventureModule)

  // Anti-fuite : le repli partagé ne transporte le vocabulaire d'AUCUN module.
  assert.doesNotMatch(tide.dmRules, /Mac le|dryade|verger|Grukk/i)
  assert.doesNotMatch(fey.dmRules, /Grammy|Grukk|Mac le|verger|boulangerie|salle \d/i)
})

test('unknown character id defaults to the fighter sheet (fail-safe)', () => {
  const fighter = loader.loadContextFiles('grammys-country-apple-pie', 'fighter')
  const unknown = loader.loadContextFiles('grammys-country-apple-pie', 'paladin')
  assert.equal(unknown.playerCharacter, fighter.playerCharacter)
})

test('unknown module defaults to the default module content (fail-safe)', () => {
  const grammy = loader.loadContextFiles('grammys-country-apple-pie')
  const unknown = loader.loadContextFiles('does-not-exist')
  assert.equal(unknown.adventureModule, grammy.adventureModule)
})

test('the shared rules files exist, and every character ships a sheet', () => {
  // player-character.md a disparu des modules : la fiche vit dans characters/.
  const sharedDir = path.join(process.cwd(), 'adventures', '_shared')
  for (const file of ['player-rules.md', 'dm-rules.md']) {
    assert.ok(fs.existsSync(path.join(sharedDir, file)), `fichier de repli manquant : _shared/${file}`)
  }
  for (const id of ['fighter', 'rogue', 'wizard', 'cleric']) {
    const sheet = path.join(process.cwd(), 'characters', id, 'character-sheet.md')
    assert.ok(fs.existsSync(sheet), `fiche de personnage manquante : ${id}`)
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
