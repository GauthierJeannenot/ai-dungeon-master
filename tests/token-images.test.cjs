const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const test = require('node:test')
require('./helpers/ts-require.cjs').installTsRequireWithAliases()
const { tokenImageForActor, getAdventure } = require('../lib/adventures.ts')
const id = 'sarah-of-yellowcrest-manor'
const manifest = require('../adventures/sarah-of-yellowcrest-manor/5etools-assets.json')

test('authored portraits follow identity across NPC aliases and combat profiles', () => {
  const faerl = tokenImageForActor(id, 'faerl_city')
  assert.match(faerl, /tokens\/faerl.webp$/)
  assert.equal(tokenImageForActor(id, 'faerl_village'), faerl)
  assert.equal(tokenImageForActor(id, 'faerl', 'noble'), faerl)
  const vecken = tokenImageForActor(id, 'vecken')
  assert.match(vecken, /Sir-vecken.webp$/)
  assert.equal(tokenImageForActor(id, 'vecken_rescued'), vecken)
  assert.equal(tokenImageForActor(id, 'vecken', 'knight'), vecken)
  assert.match(tokenImageForActor(id, 'encounter:viallis_ritual:0', 'mage'), /Viallis-yellowcrest.webp$/)
  assert.match(tokenImageForActor(id, 'another_mage', 'mage'), /tokens\/mage.webp$/)
  assert.match(tokenImageForActor(id, 'sarah', 'ghost'), /sarahs-ghost.webp$/)
  assert.match(tokenImageForActor(id, 'grick_1', 'grick'), /tokens\/grick.webp$/)
  assert.equal(tokenImageForActor(id, 'grell_1', 'grell'), undefined)
  assert.notEqual(tokenImageForActor(id, 'cobbler'), faerl)
  assert.notEqual(tokenImageForActor(id, 'avowed'), tokenImageForActor(id, 'sarah'))
})

test('campaign images never leak into other adventures or guess actor identities', () => {
  for (const adventure of [undefined, '__proto__', 'fey-shadow-fair', 'grammys-country-apple-pie']) {
    assert.equal(tokenImageForActor(adventure, 'faerl', 'mage'), undefined)
  }
  for (const actor of ['unknown', '__proto__', 'constructor', 'Faerl says hello']) {
    assert.equal(tokenImageForActor(id, actor), undefined)
  }
  assert.equal(tokenImageForActor(id, '__proto__', '__proto__'), undefined)
})

test('all authored NPCs have a local intact image; all imported assets retain provenance', () => {
  const adventure = getAdventure(id)
  const registered = new Map(manifest.assets.map(asset => [asset.localPath, asset]))
  for (const npc of adventure.map.npcs) assert.ok(registered.has(tokenImageForActor(id, npc.id)), npc.id)
  for (const encounter of Object.values(adventure.map.encounters)) {
    for (const [index, monster] of encounter.monsters.entries()) assert.ok(registered.has(tokenImageForActor(id, `encounter:${encounter.id}:${index}`, monster.monsterType)), monster.monsterType)
  }
  const credits = fs.readFileSync(path.join(__dirname, '../public', adventure.tokenImages.credits), 'utf8')
  assert.equal(manifest.assets.filter(asset => asset.category === 'illustration').length, 5)
  assert.equal(manifest.assets.filter(asset => ['map', 'mapPlayer'].includes(asset.category)).length, 4)
  for (const asset of manifest.assets) {
    assert.ok(asset.url.startsWith('https://5e.tools/img/'))
    assert.ok(credits.includes(asset.url.replaceAll('&', '&amp;')), asset.title)
    const bytes = fs.readFileSync(path.join(__dirname, '../public', asset.localPath))
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
    assert.equal(bytes.length, asset.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256)
  }
})
