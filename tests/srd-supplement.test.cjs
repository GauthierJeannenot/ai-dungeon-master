const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
const { consultRules } = require('../mcp-server/rules-library.ts')
test.after(restore)

const metadata = JSON.parse(fs.readFileSync('rules/supplements/srd-5.1-2014.source.json', 'utf8'))

test('SRD supplement reconstructs the archived 403-page source verbatim with exact PDF provenance', () => {
  const catalog = consultRules({ book: 'srd-5.1-2014' }).books[0]
  assert.equal(catalog.edition, '2014')
  assert.equal(catalog.pages, 403)
  assert.equal(catalog.srdVersion, '5.1')
  assert.equal(catalog.sections, 404)
  let rebuilt = ''
  for (let number = 1; number <= catalog.sections; number++) {
    let offset = 0
    do {
      const result = consultRules({ sectionId: `srd-5.1-2014:${number}`, offset, limit: 5000 })
      assert.equal(result.source.origin, 'official_srd')
      assert.equal(result.source.page, number === 1 ? undefined : number - 1)
      assert.equal(result.source.url, metadata.sourceUrl)
      assert.equal(result.source.officialMirror, metadata.currentOfficialMirror)
      assert.equal(result.source.license, 'CC-BY-4.0')
      assert.equal(result.source.licenseUrl, metadata.licenseUrl)
      assert.equal(result.source.attribution, metadata.attribution)
      assert.equal(result.source.sha256, metadata.textSha256)
      assert.equal(result.source.pdfSha256, metadata.pdfSha256)
      assert.ok(result.text.length <= 5000)
      rebuilt += result.text
      offset = result.nextOffset
    } while (offset !== null)
  }
  assert.equal(rebuilt, fs.readFileSync(metadata.text, 'utf8'))
  assert.equal(createHash('sha256').update(rebuilt).digest('hex'), metadata.textSha256)
  assert.equal(createHash('sha256').update(fs.readFileSync(metadata.pdf)).digest('hex'), metadata.pdfSha256)
})

test('missing SRD entries are found at their actual 2014 source pages despite PDF whitespace', () => {
  for (const [query, page, heading] of [
    ['Bag of Holding', 210, 'Bag of Holding'], ['Shield +1', 242, 'Shield, +1, +2, or +3'],
    ['Grappler', 75, 'Grappler'], ['College of Lore', 13, 'College of Lore'], ['Champion', 25, 'Champion'],
  ]) {
    const result = consultRules({ book: 'srd-5.1-2014', query }).results[0]
    assert.equal(result.source.page, page, query)
    assert.ok(result.excerpt.includes(heading), query)
    assert.ok(result.excerpt.length <= 300)
    let text = '', offset = 0
    do {
      const passage = consultRules({ sectionId: result.sectionId, offset, limit: 5000 })
      text += passage.text
      offset = passage.nextOffset
    } while (offset !== null)
    const sourceLines = fs.readFileSync(result.source.file, 'utf8').split('\n')
    assert.equal(text.trimEnd(), sourceLines.slice(result.source.startLine - 1, result.source.endLine).join('\n').trimEnd())
    assert.ok(text.includes(heading))
  }
})

test('SRD page index and long source reads paginate within the existing bounds', () => {
  let resultOffset = 0, pages = []
  do {
    const result = consultRules({ book: 'srd-5.1-2014', query: 'Page', resultOffset })
    assert.ok(result.results.length <= 5)
    pages.push(...result.results.map(entry => entry.source.page))
    resultOffset = result.nextResultOffset
  } while (resultOffset !== null)
  assert.deepEqual(pages, Array.from({ length: 403 }, (_, index) => index + 1))
  assert.throws(() => consultRules({ book: 'srd-5.2', query: 'Bag of Holding' }), error => error.code === 'RULES_SELECTION_INVALID')
  assert.throws(() => consultRules({ book: 'srd-5.1-2014', sectionId: 'phb-2014:1' }), error => error.code === 'RULES_SELECTION_INVALID')
})

test('supplement checksum, edition and fixed-path validation fail closed in a fresh process', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-dm-srd-'))
  const root = process.cwd()
  const supplement = path.join(directory, 'rules', 'supplements')
  fs.mkdirSync(supplement, { recursive: true })
  for (const file of ['srd-5.1-2014.md', 'SRD_CC_v5.1.pdf']) fs.copyFileSync(path.join(root, 'rules', 'supplements', file), path.join(supplement, file))
  const script = `require(${JSON.stringify(path.join(root, 'tests/helpers/ts-require.cjs'))}).installTsRequireWithAliases();
    const {consultRules}=require(${JSON.stringify(path.join(root, 'mcp-server/rules-library.ts'))});
    try { consultRules({book:'srd-5.1-2014',query:'Grappler'}); process.exitCode=1; }
    catch(error) { if (!/Invalid SRD|checksum mismatch/.test(error.message)) throw error; }`
  try {
    for (const changes of [{ srdVersion: '5.2' }, { ruleset: '2024' }, { text: '../../.env' },
      { pdf: '../../.env' }, { textSha256: '0'.repeat(64) }, { pdfSha256: '0'.repeat(64) }]) {
      fs.writeFileSync(path.join(supplement, 'srd-5.1-2014.source.json'), JSON.stringify({ ...metadata, ...changes }))
      execFileSync(process.execPath, ['-e', script], { cwd: directory, stdio: 'pipe' })
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
