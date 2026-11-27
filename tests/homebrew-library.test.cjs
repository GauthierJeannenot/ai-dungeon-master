const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { consultRules, readRollableTable } = require('../mcp-server/dist/mcp-server/rules-library.js')

test('the requested invented entries are explicitly labelled and their original source checksums are retained', () => {
  const manifest = JSON.parse(fs.readFileSync('rules/books/manifest.json', 'utf8'))
  for (const id of ['phb-2014', 'xge']) {
    const book = manifest.find(book => book.id === id)
    assert.match(book.originalSha256, /^[a-f0-9]{64}$/)
    assert.notEqual(book.sha256, book.originalSha256)
    assert.ok(book.amendments.some(amendment => amendment.type === 'homebrew'))
  }
  assert.equal(manifest.find(book => book.id === 'dmg-2014').amendments, undefined)
  const names = consultRules({ topic: 'names' })
  assert.equal(names.totalMatches, 3)
  for (const row of [...names.results, ...consultRules({ topic: 'trinkets' }).results]) {
    const table = readRollableTable(row.tableId)
    assert.equal(table.source.origin, 'homebrew')
    assert.equal(table.notation, '1d20')
    assert.equal(table.rows.length, 20)
    assert.equal(row.source.origin, 'homebrew')
    const context = consultRules({ sectionId: row.sectionId })
    assert.match(context.text, /CRÉATION MAISON/)
    assert.match(context.source.originalSha256, /^[a-f0-9]{64}$/)
  }
  const original = consultRules({ topic: 'npc' })
  assert.ok(original.results.every(row => row.source.origin === 'transcription'))
})

test('invented tool examples and spell identification stay documentary and clearly optional', () => {
  const tools = consultRules({ book: 'xge', query: 'homebrew tool uses' })
  const toolText = consultRules({ sectionId: tools.results[0].sectionId })
  assert.equal(toolText.source.origin, 'homebrew')
  assert.match(toolText.text, /DD.*propos/i)
  assert.match(toolText.text, /pas la liste officielle/)
  const identify = consultRules({ book: 'xge', query: 'homebrew identify a spell' })
  const rule = consultRules({ sectionId: identify.results[0].sectionId })
  assert.equal(rule.source.origin, 'homebrew')
  assert.match(rule.text, /RÈGLE OPTIONNELLE/)
  assert.match(rule.text, /DD 10 \+ le niveau/)
  assert.match(rule.text, /Tant que ce résolveur manque/)
})
