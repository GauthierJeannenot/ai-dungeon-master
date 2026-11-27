'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, writeFile, readFile, rm } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { updateAnnex, START, END, statBlock } = require('../scripts/import-5etools-campaign.cjs')

test('appendix refresh preserves the campaign byte for byte and is idempotent, including CRLF', () => {
  const campaign = '# Campagne\r\n\r\n## Salle 35 — Fin\r\n\r\nÉpilogue.\r\n'
  const annex = `${START}\n## Bestiaire — sources\n\nFiche.\n${END}`
  const result = updateAnnex(campaign, annex)
  assert.ok(result.startsWith(campaign))
  assert.equal(updateAnnex(result, annex), result)
  const revised = updateAnnex(result, annex.replace('Fiche.', 'Fiche corrigée.'))
  assert.ok(revised.startsWith(campaign))
  assert.equal(revised.split(START).length, 2)
  assert.match(revised, /Fiche corrigée/)
})

test('malformed markers and user content after the appendix cannot be silently deleted', () => {
  const annex = `${START}\n## Bestiaire\n${END}`
  for (const original of [START, END, END + START, annex + annex, annex + '\nNotes utilisateur']) {
    assert.throws(() => updateAnnex(original, annex), /Marqueurs|complète/)
  }
})

test('unresolved or incomplete profiles fail instead of producing invented statistics', () => {
  assert.throws(() => statBlock({ name: 'Unresolved', _copy: { name: 'Mage' } }), /hérité/)
  assert.throws(() => statBlock({ name: 'Incomplete' }), /incomplet/)
})

test('offline CLI appends real fixture stats and refuses missing sources without modifying the campaign', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), '5etools-campaign-'))
  try {
    const manifestPath = path.join(dir, 'manifest.json')
    const target = path.join(dir, 'campaign.md')
    const original = '# Une campagne\n\nFin.\n'
    await writeFile(target, original)
    const manifest = { ruleset: '2014', repository: 'https://github.com/example/fixture', revision: 'test',
      document: 'campaign.md', adventureSource: 'CM', chapter: 'Fixture', chapterIndex: 0,
      people: [{ name: 'Témoin', profile: 'Commoner|MM', sections: ['witness'], summary: 'Un témoin.' }] }
    await writeFile(manifestPath, JSON.stringify(manifest))
    const cache = path.join(dir, 'cache')
    await mkdir(path.join(cache, 'adventure'), { recursive: true })
    await mkdir(path.join(cache, 'bestiary'), { recursive: true })
    const documents = {
      'adventure/adventure-cm.json': { adventureData: [{ source: 'CM', data: [{ name: 'Fixture',
        entries: [{ id: 'witness', entries: ['A {@creature commoner}.'] }] }] }] },
      'bestiary/bestiary-cm.json': { monster: [] },
      'bestiary/bestiary-mm.json': { monster: [{ name: 'Commoner', source: 'MM', srd: true, page: 345,
        size: ['M'], type: 'humanoid', ac: [10], hp: { average: 4, formula: '1d8' }, speed: { walk: 30 },
        str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
        action: [{ name: 'Club', entries: ['{@atk mw} {@hit 2} to hit. {@h}2 ({@damage 1d4}) bludgeoning damage.'] }] }] },
      'bestiary/fluff-bestiary-cm.json': { monsterFluff: [] }
    }
    for (const [file, document] of Object.entries(documents)) await writeFile(path.join(cache, file), JSON.stringify(document))
    const command = [path.resolve(__dirname, '../scripts/import-5etools-campaign.cjs'), '--offline', '--manifest', manifestPath, '--cache-dir', cache]
    execFileSync(process.execPath, [...command, '--write'])
    const first = await readFile(target, 'utf8')
    assert.ok(first.startsWith(original))
    assert.match(first, /average: 4; formula: 1d8/)
    assert.match(first, /Melee Weapon Attack: \+2 to hit/)
    assert.doesNotMatch(first, /\{@/)
    execFileSync(process.execPath, [...command, '--write'])
    assert.equal(await readFile(target, 'utf8'), first)
    execFileSync(process.execPath, [...command, '--check'])
    await rm(path.join(cache, 'bestiary/bestiary-mm.json'))
    assert.throws(() => execFileSync(process.execPath, [...command, '--write'], { stdio: 'pipe' }), /Source manquante/)
    assert.equal(await readFile(target, 'utf8'), first)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('documentary appendix does not enter game prompts or the final room', () => {
  const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
  installTsRequireWithAliases()
  const { parseAdventureModule } = require('../lib/context-loader.ts')
  const annex = `${START}\n## Bestiaire — annexe documentaire 5e.tools\n\n### Identité distante secrète\n\nSECRET_NPC_PROFILE.\n${END}\n`
  const parsed = parseAdventureModule('# Carte rest — Fin\n\n## Salle 35 — Épilogue\n\nAdieux.\n\n' + annex)
  assert.match(parsed.rooms['35'], /Adieux/)
  assert.doesNotMatch(JSON.stringify(parsed), /SECRET_NPC_PROFILE|Identité distante/)
})
