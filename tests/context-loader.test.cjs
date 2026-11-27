// Socles partagés obligatoires, compléments joueur facultatifs par campagne.

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

const MODULE_IDS = require('../lib/adventures.ts').ADVENTURES.map(({ id }) => id)

test('dm rules are shared, identical for every module', () => {
  const sharedDmRules = fs.readFileSync(
    path.join(process.cwd(), 'adventures', '_shared', 'dm-rules.md'), 'utf-8')
  for (const id of MODULE_IDS) {
    assert.equal(loader.loadContextFiles(id).dmRules, sharedDmRules)
  }
  // Anti-fuite : le fichier partagé ne transporte le vocabulaire d'AUCUN module.
  assert.doesNotMatch(sharedDmRules, /Grammy|Grukk|Mac le|verger|boulangerie|dryade|Gardien Noyé|Morgane|Chien-clin|Filou|salle \d/i)
})

test('every character gets a compact 2014 rules core and on-demand books rather than full manuals', () => {
  const { ADVENTURES } = require('../lib/adventures.ts')
  const { buildStaticPrompt } = require('../lib/dm/prompts.ts')
  const catalog = require('../mcp-server/dist/mcp-server/rules-library.js').consultRules({})
  for (const { id } of ADVENTURES) {
    for (const character of ['fighter', 'bard', 'wizard', 'cleric']) {
      const ctx = loader.loadContextFiles(id, character)
      const prompt = buildStaticPrompt(id, character)
      assert.match(prompt, /D&D 5e 2014/)
      assert.match(prompt, /consult_rules/)
      assert.match(ctx.dmRules, /Consulte d'abord le bestiaire local de la campagne/)
      assert.match(ctx.dmRules, /book:"mm-2014"/)
      assert.match(ctx.dmRules, /règle maison/)
      assert.ok(ctx.dmRules.length + ctx.playerRules.length < 10000)
      assert.doesNotMatch(ctx.dmRules + ctx.playerRules, /2024|Guerrier niveau 1|Désavantage sur le jet d'initiative/)
      for (const book of catalog.books) {
        const sourcePath = book.id === 'srd-5.1-2014'
          ? 'rules/supplements/srd-5.1-2014.md' : `rules/books/${book.id}.md`
        const full = fs.readFileSync(sourcePath, 'utf8')
        assert.equal(prompt.includes(full.slice(0, 500)), false, `${id}/${character}: full book leaked into static prompt`)
      }
    }
  }
})

test('each module combines the shared player core with only its own optional supplement', () => {
  for (const id of MODULE_IDS) {
    const dir = path.join(process.cwd(), 'adventures', id)
    for (const file of ['bestiary.md', 'adventure-module.md']) {
      assert.ok(fs.existsSync(path.join(dir, file)), `fichier manquant : adventures/${id}/${file}`)
    }
    const ctx = loader.loadContextFiles(id)
    const core = fs.readFileSync('adventures/_shared/player-rules.md', 'utf8')
    const supplementPath = path.join(dir, 'player-rules.md')
    const supplement = fs.existsSync(supplementPath) ? fs.readFileSync(supplementPath, 'utf8').trim() : ''
    assert.equal(ctx.playerRules, supplement ? `${core.trimEnd()}\n\n${supplement}\n` : core)
    assert.equal(ctx.playerRules.split('# Socle joueur').length, 2)
    if (id !== 'sarah-of-yellowcrest-manor') assert.doesNotMatch(ctx.playerRules, /Yellowcrest|Candlekeep|Greenfast/)

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

test('full bestiary remains available as a reference while the static prompt contains no roster', () => {
  const { ADVENTURES } = require('../lib/adventures.ts')
  const { buildStaticPrompt } = require('../lib/dm/prompts.ts')
  for (const { id } of ADVENTURES) {
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'adventures', id, 'bestiary.json'), 'utf8'))
    const prompt = loader.loadBestiaryPrompt(id)
    const system = buildStaticPrompt(id)
    assert.ok(!system.includes(prompt), `${id}: a campaign-wide roster must not enter the static prompt`)
    assert.doesNotMatch(system, /## (?:Bestiaire du module|Récapitulatif des monstres de la session)/i)
    assert.match(prompt, /get_monster_stat_block/)
    assert.match(prompt, /engineSupport/)
    for (const note of [...manifest.notes, ...(manifest.narrativeNpcs ?? [])]) assert.ok(prompt.includes(note), `${id}: lost module note`)
    for (const creature of manifest.creatures) {
      assert.ok(prompt.includes(creature.title))
      assert.ok(prompt.includes(JSON.stringify(creature.type)))
      if (creature.role) assert.ok(prompt.includes(creature.role))
      for (const note of creature.notes ?? []) assert.ok(prompt.includes(note), `${id}: lost creature guidance`)
    }
    for (const creature of manifest.creatures) {
      const local = loader.loadBestiaryPrompt(id, [creature.type])
      assert.ok(local.includes(JSON.stringify(creature.type)))
      if (creature.role) assert.ok(!local.includes(creature.role), `${id}: campaign-wide placement leaked`)
      for (const note of creature.notes ?? []) assert.ok(local.includes(note))
      for (const note of [...manifest.notes, ...(manifest.narrativeNpcs ?? [])]) assert.ok(!local.includes(note))
      for (const other of manifest.creatures.filter(other => other.type !== creature.type)) {
        assert.ok(!local.includes(`### Type moteur ${JSON.stringify(other.type)}`))
      }
    }
    assert.equal(loader.loadBestiaryPrompt(id, []), '')
    const full = loader.loadContextFiles(id).bestiary
    assert.ok(prompt.length < full.length * 0.6, `${id}: leave room for tool results and narration`)
    assert.ok(!system.includes(full), `${id}: do not also inject the complete bestiary`)
  }
  assert.equal(loader.loadBestiaryPrompt('does-not-exist'), loader.loadBestiaryPrompt())
})

test('unknown module defaults to the default module content (fail-safe)', () => {
  const grammy = loader.loadContextFiles('grammys-country-apple-pie')
  const unknown = loader.loadContextFiles('does-not-exist')
  assert.equal(unknown.adventureModule, grammy.adventureModule)
  assert.equal(unknown.playerRules, grammy.playerRules)
})

test('the shared rule cores exist, and every character ships a sheet', () => {
  // player-character.md a disparu des modules : la fiche vit dans characters/.
  // _shared/ contient les deux socles génériques.
  const sharedDir = path.join(process.cwd(), 'adventures', '_shared')
  assert.ok(fs.existsSync(path.join(sharedDir, 'dm-rules.md')), 'fichier manquant : _shared/dm-rules.md')
  assert.ok(fs.existsSync(path.join(sharedDir, 'player-rules.md')))
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

test('missing shared player core fails explicitly instead of using a campaign file', () => {
  const read = fs.readFileSync
  fs.readFileSync = function (filename, ...args) {
    if (path.resolve(String(filename)) === path.resolve('adventures/_shared/player-rules.md')) {
      throw Object.assign(new Error('missing test core'), { code: 'ENOENT' })
    }
    return read.call(this, filename, ...args)
  }
  try {
    assert.throws(() => loader.loadContextFiles('tide-crypt', 'missing-core-test'),
      /Fichier de contexte manquant : adventures\/_shared\/player-rules\.md/)
  } finally {
    fs.readFileSync = read
  }
})
