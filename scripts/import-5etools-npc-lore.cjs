#!/usr/bin/env node
'use strict'

// Authoring import only: no game call, player-message interpretation, or LLM.
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { loadSources, inline } = require('./import-5etools-campaign.cjs')
const ROOT = path.resolve(__dirname, '..')
const DIR = path.join(ROOT, 'adventures/sarah-of-yellowcrest-manor')
const sha = text => createHash('sha256').update(text).digest('hex')

function plain(value) {
  let text = String(value)
  for (let i = 0; i < 8 && /\{@/.test(text); i++) {
    const previous = text
    text = inline(text).replace(/\{@\w+ ([^{}]*)\}/g, (_, payload) => {
      const parts = payload.split('|')
      return parts[2] || parts[0]
    })
    if (text === previous) break
  }
  // The dossier is plain text. Source references remain separately attached.
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').replace(/\*/g, '').trim()
}

function indexChapter(chapter) {
  const paragraphs = [], sections = new Map(), portraits = []
  const visit = (node, pointer, ancestors) => {
    if (typeof node === 'string') {
      const section = ancestors.at(-1)
      paragraphs.push({ id: pointer, sectionId: section?.id ?? chapter.id,
        title: ancestors.map(item => item.name).filter(Boolean).join(' / '),
        ...(section?.page ? { page: section.page } : {}), text: plain(node),
        ancestorIds: ancestors.map(item => item.id).filter(Boolean) })
      return
    }
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach((child, index) => visit(child, `${pointer}/${index}`, ancestors)); return }
    if (node.type === 'image') {
      if (node.href?.type === 'internal') portraits.push({
        title: plain(node.title ?? ''), credit: node.credit ?? '',
        url: `https://5e.tools/img/${node.href.path.split('/').map(encodeURIComponent).join('/')}`,
        ancestorIds: ancestors.map(item => item.id).filter(Boolean),
      })
      return
    }
    const context = node.id || node.name ? [...ancestors, node] : ancestors
    if (node.id) sections.set(node.id, node)
    for (const key of ['entries', 'items', 'entry', 'headerEntries', 'footerEntries', 'rows']) {
      if (node[key] !== undefined) visit(node[key], `${pointer}/${key}`, context)
    }
  }
  visit(chapter, '/chapter', [])
  return { paragraphs, sections, portraits }
}

function matchesAlias(text, aliases) {
  // Only source documents are indexed, never the player's messages.
  const searchable = text.replace(/Sarah of Yellowcrest Manor/gi, '')
  return aliases.some(alias => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^\\p{L}])${escaped}(?=$|[^\\p{L}])`, 'iu').test(searchable)
  })
}

function proseSections(entry, prefix) {
  const indexed = indexChapter({ ...entry, id: prefix })
  return indexed.paragraphs.map(({ ancestorIds, ...paragraph }) => ({ ...paragraph, category: 'archetype',
    archetype: entry.name, sourceFile: `bestiary/fluff-bestiary-${entry.source.toLowerCase()}.json` }))
}

function makeDossiers(manifest, documents, sources) {
  const recipe = manifest.npcLore
  if (!recipe?.profiles) throw new Error('Manifeste npcLore manquant.')
  const book = documents['adventure/adventure-cm.json']
  const chapter = (book.data ?? book.adventureData?.find(item => item.source === manifest.adventureSource)?.data)
    ?.find(item => item.name === manifest.chapter)
  if (!chapter) throw new Error('Chapitre de campagne absent.')
  const index = indexChapter(chapter)
  const profiles = {}
  const chapterUrl = `https://2014.5e.tools/adventure.html#${manifest.adventureSource.toLowerCase()},${manifest.chapterIndex}`
  for (const [key, spec] of Object.entries(recipe.profiles)) {
    for (const section of spec.sections ?? []) if (!index.sections.has(section)) throw new Error(`Section absente : ${key}/${section}`)
    const selected = index.paragraphs.filter(paragraph =>
      paragraph.ancestorIds.some(id => spec.sections?.includes(id))
      || matchesAlias(paragraph.text, spec.aliases ?? []))
    const passages = selected.map(({ ancestorIds, ...paragraph }) => ({ ...paragraph,
      category: 'campaign', sourceFile: 'adventure/adventure-cm.json' }))
    // All paragraphs are kept, including lists and personality children. No slice,
    // token cap or manual short-summary field is used by this importer.
    const sourcePersonality = {}
    if (spec.personalitySection) {
      const root = index.sections.get(spec.personalitySection)
      if (!root) throw new Error(`Personnalité source absente : ${key}`)
      const personalityKeys = { 'Personality Trait': 'traits', Ideal: 'ideals', Bond: 'bonds', Flaw: 'flaws' }
      for (const entry of root.entries ?? []) if (personalityKeys[entry.name]) {
        sourcePersonality[personalityKeys[entry.name]] = indexChapter({ ...entry, id: entry.id ?? key }).paragraphs.map(item => item.text)
      }
    }
    const portraits = index.portraits.filter(image => image.ancestorIds.some(id => spec.sections?.includes(id))
      || matchesAlias(image.title, spec.aliases ?? []))
      .map(({ ancestorIds, ...image }) => image)
    for (const reference of spec.fluff ?? []) {
      const [name, source] = reference.split('|')
      const file = `bestiary/fluff-bestiary-${source.toLowerCase()}.json`
      const matches = documents[file]?.monsterFluff?.filter(entry => entry.name.toLowerCase() === name.toLowerCase() && entry.source === source) ?? []
      if (matches.length !== 1 || matches[0]._copy) throw new Error(`Complément absent, ambigu ou hérité : ${reference}`)
      const entry = matches[0]
      if (entry.entries?.length) passages.push(...proseSections(entry, `/fluff/${source}/${name}`)
        .map(item => ({ ...item, category: source === 'CM' ? 'named-bestiary' : 'archetype' })))
      for (const image of entry.images ?? []) if (image.href?.type === 'internal') portraits.push({
        title: entry.name, credit: image.credit ?? '',
        url: `https://5e.tools/img/${image.href.path.split('/').map(encodeURIComponent).join('/')}`,
      })
    }
    if (spec.status !== 'adaptation-only' && !selected.length) throw new Error(`Aucun passage de campagne pour ${key}`)
    const files = new Set(passages.map(item => item.sourceFile))
    profiles[key] = {
      name: spec.name, sourceStatus: spec.status ?? 'source-backed',
      provider: '5etools', ruleset: '2014', revision: manifest.revision, chapterUrl,
      subjects: [{ id: key, name: spec.name }],
      sources: sources.filter(source => files.has(source.file)),
      passages,
      ...(Object.keys(sourcePersonality).length ? { sourcePersonality } : {}),
      portraits: [...new Map(portraits.map(image => [image.url, image])).values()],
      adaptationNotes: spec.adaptationNotes ?? [],
    }
  }
  return { version: 1, chapter: manifest.chapter, revision: manifest.revision, bindings: recipe.bindings,
    coverage: { chapterParagraphs: index.paragraphs.length,
      importedCampaignParagraphs: new Set(Object.values(profiles).flatMap(profile => profile.passages.filter(p => p.category === 'campaign').map(p => p.id))).size,
      profileCount: Object.keys(profiles).length }, profiles }
}

async function main(args) {
  const allowed = ['--write', '--offline', '--refresh', '--help']
  for (const arg of args) if (!allowed.includes(arg)) throw new Error(`Option inconnue : ${arg}`)
  if (args.includes('--help')) {
    process.stdout.write('node scripts/import-5etools-npc-lore.cjs [--write] [--offline | --refresh]\nImporte les dossiers PNJ complets sélectionnés par npcLore, sans test, appel LLM ni modification mécanique. --write enregistre npc-lore.json ; sinon imprime la couverture.\n')
    return
  }
  if (args.includes('--offline') && args.includes('--refresh')) throw new Error('--offline et --refresh sont incompatibles.')
  const manifest = JSON.parse(await fs.readFile(path.join(DIR, '5etools-import.json'), 'utf8'))
  const cacheDir = path.join(ROOT, '.data/5etools-campaign', manifest.revision)
  const { documents, sources } = await loadSources(manifest, cacheDir, args.includes('--offline'), args.includes('--refresh'))
  const file = 'bestiary/fluff-bestiary-mm.json'
  const target = path.join(cacheDir, file)
  const url = `${manifest.repository.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/${manifest.revision}/data/${file}`
  let body
  if (!args.includes('--refresh')) {
    try { body = await fs.readFile(target, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  if (body === undefined) {
    if (args.includes('--offline')) throw new Error(`Source hors ligne manquante : ${target}`)
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`Source indisponible (${response.status}) : ${url}`)
    body = await response.text()
    JSON.parse(body)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, body)
  }
  documents[file] = JSON.parse(body)
  sources.push({ file, url, sha256: sha(body) })
  const output = makeDossiers(manifest, documents, sources)
  if (args.includes('--write')) {
    const destination = path.join(DIR, 'npc-lore.json'), temporary = `${destination}.${process.pid}.tmp`
    try { await fs.writeFile(temporary, JSON.stringify(output, null, 2) + '\n', { flag: 'wx' }); await fs.rename(temporary, destination) }
    finally { await fs.rm(temporary, { force: true }) }
  }
  process.stdout.write(JSON.stringify({ written: args.includes('--write'), ...output.coverage,
    profiles: Object.entries(output.profiles).map(([id, profile]) => ({ id, name: profile.name,
      passages: profile.passages.length, status: profile.sourceStatus })) }, null, 2) + '\n')
}

module.exports = { plain, indexChapter, makeDossiers }
if (require.main === module) main(process.argv.slice(2)).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1 })
