const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { consultRules } = require('../mcp-server/dist/mcp-server/rules-library.js')
const { linksForRule, withRuleToolGuidance } = require('../mcp-server/dist/mcp-server/rules-tool-guidance.js')
const { selectToolsForPhase } = require('../mcp-server/dist/lib/tool-exposure.js')
const { TOOLKIT_SUPPORT } = require('../mcp-server/dist/mcp-server/toolkit-support.js')
const { engine, ok, replace } = require('./helpers/mcp-toolkit.cjs')
const links = require('../mcp-server/rules-tool-links.json')
const guides = require('../lib/dm/rule-guides.json')
const allTools = [...new Set([...Object.values(TOOLKIT_SUPPORT).flatMap(domain => domain.tools),
  ...guides.flatMap(guide => guide.tools)])].map(name => ({ name }))
const annotated = input => withRuleToolGuidance(consultRules(input), allTools)
const passage = (book, query) => annotated({ sectionId: consultRules({ book, query }).results[0].sectionId })

test('authored associations point to existing source titles, pages, pinned lines and canonical procedures', () => {
  const books = new Map()
  const manifest = require('../rules/books/manifest.json')
  for (const link of links) {
    assert.ok(TOOLKIT_SUPPORT[link.domain], link.domain)
    const selected = guides.filter(guide => guide.domains.includes(link.domain) && (!link.guideIds || link.guideIds.includes(guide.id)))
    assert.ok(selected.length, `${link.domain}: usage procedure required`)
    for (const id of link.guideIds ?? []) assert.ok(selected.some(guide => guide.id === id), id)
    for (const source of link.sources) {
      if (source.pages) {
        for (const page of source.pages) {
          const result = consultRules({ sectionId: `srd-5.1-2014:${page + 1}`, limit: 1 })
          assert.equal(result.source.page, page)
          assert.ok(linksForRule(result).includes(link) || linksForRule(result).some(item => item.domain === link.domain))
        }
        continue
      }
      if (!books.has(source.book)) {
        const text = fs.readFileSync(`rules/books/${source.book}.md`, 'utf8'), ancestors = []
        const paths = [...text.matchAll(/^(?:>[ \t]*)*(#{1,6})[ \t]+([^\r\n]+)/gm)].map(header => {
          while (ancestors.length && ancestors.at(-1).level >= header[1].length) ancestors.pop()
          ancestors.push({ level: header[1].length, heading: header[2].trim() })
          return ancestors.map(item => item.heading.toLowerCase())
        })
        books.set(source.book, { paths, lines: text.split('\n') })
      }
      const { paths, lines } = books.get(source.book)
      for (const heading of source.headings ?? []) assert.ok(paths.some(path => path.at(-1) === heading.toLowerCase()
        && (!source.within || path.includes(source.within.toLowerCase()))), `${link.domain}: ${heading}`)
      if (source.lines) {
        assert.ok(source.lines[0] > 0 && source.lines[1] >= source.lines[0] && source.lines[1] <= lines.length)
        assert.ok(lines.slice(source.lines[0] - 1, source.lines[1]).join('\n').trim())
        assert.ok(linksForRule({ book: source.book, source: { origin: 'transcription',
          sha256: manifest.find(book => book.id === source.book).sha256,
          startLine: source.lines[0], endLine: source.lines[1] } }).some(item => item.domain === link.domain), `${link.domain}: stale line hash`)
      }
    }
  }
})

test('social reads combine unchanged DMG text with the exact party-only procedure; searches stay compact', () => {
  const search = annotated({ book: 'dmg-2014', query: 'social interaction' })
  assert.ok(search.results[0].engineGuidance.domains.includes('social_interactions'))
  assert.equal(search.results[0].engineGuidance.procedures, undefined)
  const raw = consultRules({ sectionId: search.results[0].sectionId }), read = annotated({ sectionId: raw.sectionId })
  for (const key of ['text', 'source', 'offset', 'nextOffset', 'totalChars']) assert.deepEqual(read[key], raw[key])
  const guidance = read.engineGuidance
  assert.equal(guidance.origin, 'project_mcp_annotations')
  assert.ok(guidance.tools.includes('record_social_conversation'))
  assert.ok(guidance.tools.includes('resolve_social_request'))
  assert.match(guidance.procedures.map(guide => guide.text).join('\n'), /JAMAIS la cible opposée/)
  assert.ok(guidance.procedures.some(guide => guide.id === 'social-interactions-participants-recovery'))
  assert.ok(!guidance.procedures.some(guide => guide.id === 'social-interactions-2'), 'no unrelated generic-check advice')
  assert.match(guidance.notice, /No action, optional rule, homebrew or engine capability is activated/)
})

test('annotations follow exact source titles and visible pinned lines, rather than words in the query or prose', () => {
  const hit = consultRules({ book: 'phb-2014', query: 'oil usually' }).results.find(hit => hit.headings.includes('Adventuring Gear'))
  const raw = consultRules({ sectionId: hit.sectionId })
  const source = fs.readFileSync(raw.source.file, 'utf8').split('\n').slice(raw.source.startLine - 1, raw.source.endLine).join('\n')
  const offset = source.indexOf('***Oil.***'), end = source.indexOf('\n', offset)
  assert.ok(offset >= 0)
  const oil = annotated({ sectionId: raw.sectionId, offset, limit: end - offset })
  assert.ok(oil.engineGuidance.domains.includes('offensive_oil'))
  assert.ok(!oil.engineGuidance.domains.includes('ground_gear'))
  assert.ok(!oil.engineGuidance.domains.includes('basic_poison'))
  assert.equal(oil.readRange.startLine, 4305)
  assert.ok(!linksForRule({ ...oil, source: { ...oil.source, sha256: 'changed-source' } }).some(link => link.domain === 'offensive_oil'))
  assert.deepEqual(linksForRule({ book: 'phb-2014', headings: ['Unrelated title'], text: 'Social Interaction Oil' }), [])
  assert.deepEqual(linksForRule({ book: 'phb-2014', headings: ['Weapon Properties'], source: { origin: 'homebrew' } }), [])
  const light = passage('phb-2014', 'light')
  assert.ok(light.engineGuidance.domains.includes('light_spell'))
  assert.ok(!light.engineGuidance.domains.includes('weapon_properties'), 'the Light spell is not the weapon property')
  const tumble = passage('dmg-2014', 'tumble')
  assert.deepEqual(tumble.engineGuidance.procedures.map(guide => guide.id), ['combat-actions-1'])
  assert.ok(!tumble.engineGuidance.tools.includes('resolve_cleaving'))
  const unknown = withRuleToolGuidance({ kind: 'passage', book: 'phb-2014', headings: ['Unmapped'] }, allTools)
  assert.deepEqual(unknown.engineGuidance.tools, [])
  assert.match(unknown.engineGuidance.help, /No authored tool association/)
})

test('real MCP annotations respect phase and character availability without mutating state or consuming dice', async t => {
  const call = await engine(t, { dice: '19' })
  const registered = (await call.client.listTools()).tools
  for (const phase of ['exploration', 'combat']) {
    await replace(call, state => { state.phase = phase; if (phase === 'combat') Object.assign(state, { round: 1, currentTurn: 'player', initiativeOrder: ['player'] }) })
    const before = await call('get_game_state')
    const available = new Set(selectToolsForPhase(registered, phase, before.player.ruleset === 'srd2014').map(tool => tool.name))
    const hit = ok(await call('consult_rules', { book: 'phb-2014', query: 'actions in combat' })).results[0]
    const read = ok(await call('consult_rules', { sectionId: hit.sectionId }))
    assert.ok(read.engineGuidance.procedures.some(guide => guide.id === 'combat-actions-standard'))
    for (const name of read.engineGuidance.tools) assert.ok(available.has(name), name)
    for (const name of read.engineGuidance.unavailableTools) assert.ok(!available.has(name), name)
    assert.equal(read.engineGuidance.tools.includes('resolve_player_attack'), phase === 'combat')
    const srd = ok(await call('consult_rules', { book: 'srd-5.1-2014', query: 'Bag of Holding' }))
    const item = ok(await call('consult_rules', { sectionId: srd.results[0].sectionId }))
    assert.ok(item.engineGuidance.domains.includes('magic_items'))
    assert.equal(item.source.origin, 'official_srd')
    const monster = ok(await call('consult_rules', { book: 'mm-2014', query: 'beholder' }))
    const reference = ok(await call('consult_rules', { sectionId: monster.results[0].sectionId }))
    assert.deepEqual(reference.engineGuidance.tools, ['get_monster_stat_block'])
    assert.deepEqual(await call('get_game_state'), before)
  }
  await replace(call, state => { delete state.player.ruleset; delete state.hero })
  const hit = ok(await call('consult_rules', { book: 'phb-2014', query: 'long rest' })).results[0]
  const legacy = ok(await call('consult_rules', { sectionId: hit.sectionId }))
  assert.ok(!legacy.engineGuidance.tools.includes('begin_rest'))
  assert.ok(legacy.engineGuidance.unavailableTools.includes('begin_rest'))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
