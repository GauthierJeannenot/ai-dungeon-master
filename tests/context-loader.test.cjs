// Le context-loader charge les fichiers markdown du bon module. Chaque module
// possède SON player-rules.md, SON bestiary.md et SON adventure-module.md —
// jamais de repli sur une autre aventure (sauf fail-safe id inconnu). Le SEUL
// contenu partagé est adventures/_shared/dm-rules.md (règles DM génériques,
// sans vocabulaire de module).

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

const MODULE_IDS = ['grammys-country-apple-pie', 'tide-crypt', 'fey-shadow-fair']

test('dm rules are the single shared file, identical for every module', () => {
  const sharedDmRules = fs.readFileSync(
    path.join(process.cwd(), 'adventures', '_shared', 'dm-rules.md'), 'utf-8')
  for (const id of MODULE_IDS) {
    assert.equal(loader.loadContextFiles(id).dmRules, sharedDmRules)
  }
  // Anti-fuite : le fichier partagé ne transporte le vocabulaire d'AUCUN module.
  assert.doesNotMatch(sharedDmRules, /Grammy|Grukk|Mac le|verger|boulangerie|dryade|Gardien Noyé|Morgane|Chien-clin|Filou|salle \d/i)
})

test('each module ships its OWN player rules, bestiary and adventure module', () => {
  for (const id of MODULE_IDS) {
    const dir = path.join(process.cwd(), 'adventures', id)
    for (const file of ['player-rules.md', 'bestiary.md', 'adventure-module.md']) {
      assert.ok(fs.existsSync(path.join(dir, file)), `fichier manquant : adventures/${id}/${file}`)
    }
    const ctx = loader.loadContextFiles(id)
    assert.equal(ctx.playerRules, fs.readFileSync(path.join(dir, 'player-rules.md'), 'utf-8'))
    assert.equal(ctx.bestiary, fs.readFileSync(path.join(dir, 'bestiary.md'), 'utf-8'))
  }

  // Le bestiaire est bien PAR module : celui d'un module ne parle jamais des
  // créatures reskinnées d'un autre.
  const grammy = loader.loadContextFiles('grammys-country-apple-pie')
  const tide = loader.loadContextFiles('tide-crypt')
  const fey = loader.loadContextFiles('fey-shadow-fair')
  assert.match(grammy.bestiary, /Grukk/i)
  assert.match(tide.bestiary, /Gardien Noyé/i)
  assert.match(fey.bestiary, /Chien-clin/i)
  assert.doesNotMatch(tide.bestiary, /Grukk|Mac le|verger/i)
  assert.doesNotMatch(fey.bestiary, /Grukk|Mac le|verger|Gardien Noyé|Morgane/i)
  assert.doesNotMatch(grammy.bestiary, /Gardien Noyé|Morgane|Chien-clin|mirliton/i)
  assert.notEqual(tide.adventureModule, grammy.adventureModule)
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

test('the shared dm rules exist (single shared file), and every character ships a sheet', () => {
  // player-character.md a disparu des modules : la fiche vit dans characters/.
  // _shared/ ne contient QUE dm-rules.md — tout le reste est par module.
  const sharedDir = path.join(process.cwd(), 'adventures', '_shared')
  assert.ok(fs.existsSync(path.join(sharedDir, 'dm-rules.md')), 'fichier manquant : _shared/dm-rules.md')
  assert.ok(!fs.existsSync(path.join(sharedDir, 'player-rules.md')), '_shared/player-rules.md ne doit plus exister (règles joueur PAR module)')
  for (const id of ['fighter', 'bard', 'wizard', 'cleric']) {
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
