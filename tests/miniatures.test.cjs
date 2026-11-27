const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const test = require('node:test')
require('./helpers/ts-require.cjs').installTsRequireWithAliases()
const { miniatureForHero, miniatureForCreature, miniatureForNpc } = require('../lib/miniatures.ts')

test('unsupported identities keep their original token instead of guessing from prose', () => {
  for (const id of ['unknown', '__proto__']) assert.equal(miniatureForHero(id), undefined)
  for (const type of ['zombie', 'bat', 'rat', 'spider', 'giant_frog', 'dryad', 'a goblin in disguise', '__proto__']) assert.equal(miniatureForCreature(type), undefined)
  for (const kind of [undefined, 'merchant', 'prisoners', 'ghost', 'shrub', 'archfey', 'frog_noble', '__proto__']) assert.equal(miniatureForNpc(kind), undefined)
  assert.equal(miniatureForHero(), 'realistic/warrior')
  assert.equal(miniatureForNpc('knight'), 'realistic/warrior')
})

test('only suitable realistic sculptures replace tokens, without keeping cartoon models', () => {
  for (const [type, model] of Object.entries({
    wolf: 'realistic/wolf', dire_wolf: 'realistic/wolf', goblin: 'realistic/goblin',
    knight: 'realistic/warrior', guard: 'realistic/warrior', mage: 'realistic/sage',
    hobgoblin: 'realistic/hobgoblin', satyr: 'realistic/satyr',
    skeleton: 'realistic/skeleton', awakened_tree: 'realistic/living-tree',
    ghost: 'realistic/ghost-male', violet_fungus: 'realistic/violet-fungus',
    awakened_shrub: 'realistic/awakened-shrub',
  })) assert.equal(miniatureForCreature(type), model)
  assert.equal(miniatureForHero('wizard'), 'realistic/sage')
  assert.equal(miniatureForHero('cleric'), 'realistic/cleric')
  assert.equal(miniatureForHero('bard'), 'realistic/bard')
  assert.equal(miniatureForNpc('scholar'), 'realistic/sage')
  assert.equal(miniatureForNpc('awakened_tree'), 'realistic/living-tree')
  assert.equal(miniatureForNpc('frog_noble'), undefined)
})

test('module-specific visual identities stay scoped to their authored adventure', () => {
  for (const lookup of [miniatureForCreature, miniatureForNpc]) {
    assert.equal(lookup('dryad', 'grammys-country-apple-pie'), 'realistic/forest-spirit')
    assert.equal(lookup('dryad', 'fey-shadow-fair'), undefined)
    assert.equal(lookup('dryad', '__proto__'), undefined)
    assert.equal(lookup('__proto__', 'grammys-country-apple-pie'), undefined)
  }
  assert.equal(miniatureForNpc('bard', 'fey-shadow-fair'), undefined)
})

test('authored fey performers and human apparitions keep their identities across token kinds', () => {
  const fair = 'fey-shadow-fair'
  for (const [id, model] of Object.entries({
    nicodeme: 'realistic/goblin-civilian', pipotin: 'realistic/goblin-civilian',
    theophile: 'realistic/goblin-civilian', barnabe: 'realistic/potted-shrub',
    mirabelle: 'realistic/halfling-bard', maitre_filou: 'realistic/leprechaun',
    madame_bougie: 'realistic/candle-halfling',
  })) {
    assert.equal(miniatureForNpc(undefined, fair, id), model)
    assert.equal(miniatureForCreature('goblin', fair, id), model)
    assert.equal(miniatureForNpc(undefined, 'sarah-of-yellowcrest-manor', id), undefined)
  }
  // Sarah keeps the user's existing apparition image, even with a ghost type.
  assert.equal(miniatureForNpc('ghost', 'sarah-of-yellowcrest-manor', 'sarah'), undefined)
  assert.equal(miniatureForCreature('ghost', 'sarah-of-yellowcrest-manor', 'sarah'), undefined)
  assert.equal(miniatureForCreature('ghost', 'sarah-of-yellowcrest-manor', 'other_ghost'), 'realistic/ghost-male')
  assert.equal(miniatureForNpc('ghost', fair, 'sarah'), undefined)
  assert.equal(miniatureForNpc('merchant', fair, 'madame_bougie'), 'realistic/candle-halfling')
  assert.equal(miniatureForNpc('merchant', fair, 'other_merchant'), undefined)
  assert.equal(miniatureForNpc('merchant', 'grammys-country-apple-pie', 'madame_bougie'), undefined)
  for (const id of ['ernestine', 'miroslav', 'tetes_jacassantes', 'baronne_grenouille', 'ombre_soliste', 'prince_farces', '__proto__']) {
    assert.equal(miniatureForNpc(undefined, fair, id), undefined)
  }
  assert.equal(miniatureForNpc('ghost', 'sarah-of-yellowcrest-manor', 'sarah_at_rest'), undefined)
})

test('selected realistic assets have attributed, intact GLBs and lightweight transparent portraits', () => {
  const ids = new Set([
    ...['fighter', 'wizard', 'cleric', 'bard'].map(miniatureForHero),
    ...['goblin', 'knight', 'guard', 'mage', 'wolf', 'hobgoblin', 'satyr', 'skeleton', 'awakened_tree', 'ghost', 'violet_fungus', 'awakened_shrub'].map(type => miniatureForCreature(type)),
    miniatureForNpc('dryad', 'grammys-country-apple-pie'),
    ...['barnabe', 'mirabelle', 'maitre_filou', 'nicodeme', 'madame_bougie'].map(id => miniatureForNpc(undefined, 'fey-shadow-fair', id)),
  ])
  const sources = require('../public/miniatures/realistic/sources.json')
  assert.deepEqual(ids, new Set(sources.models.map(model => model.id)))
  const credits = fs.readFileSync(path.join(__dirname, '../public/miniatures/credits.html'), 'utf8')
  for (const id of ids) {
    assert.ok(id.startsWith('realistic/'))
    const source = sources.models.find(model => model.id === id)
    const bytes = fs.readFileSync(path.join(__dirname, '../public/miniatures', `${id}.glb`))
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), source.sha256)
    assert.equal(source.license, 'CC-BY-4.0')
    assert.ok(credits.includes(source.source), id)
    const png = fs.readFileSync(path.join(__dirname, '../public/miniatures', `${id}.png`))
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a', id)
    assert.equal(png.readUInt32BE(16), 192, id)
    assert.equal(png.readUInt32BE(20), 192, id)
    assert.equal(png[25], 6, `${id}: RGBA transparency`)
    assert.ok(png.length < 100_000, `${id}: portrait download budget`)
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF', id)
    assert.equal(bytes.readUInt32LE(4), 2, id)
    assert.equal(bytes.readUInt32LE(8), bytes.length, id)
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
    assert.ok(json.scenes?.length > 0, id)
    for (const item of [...(json.buffers ?? []), ...(json.images ?? [])]) {
      assert.ok(!item.uri || item.uri.startsWith('data:'), `${id}: external resource`)
    }
  }
})
