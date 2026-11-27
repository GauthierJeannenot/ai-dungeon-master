#!/usr/bin/env node
'use strict'

// Offline authoring utility. Never imported by the game or the MCP engine.
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const ROOT = path.resolve(__dirname, '..')
const DEFAULT_MANIFEST = path.join(ROOT, 'adventures/sarah-of-yellowcrest-manor/5etools-import.json')
const START = '<!-- BEGIN:5ETOOLS-CAMPAIGN-APPENDIX -->'
const END = '<!-- END:5ETOOLS-CAMPAIGN-APPENDIX -->'

function inline(value) {
  let text = String(value)
  // Process inner tags first (5etools permits nested formatting tags).
  return text.replace(/\{@(\w+)(?: ([^{}]*))?\}/g, (whole, tag, payload = '') => {
    const parts = payload.split('|')
    const first = parts[0]
    if (tag === 'b' || tag === 'bold') return `**${first}**`
    if (tag === 'i' || tag === 'italic') return `*${first}*`
    if (tag === 'h') return 'Hit: '
    if (tag === 'hit') return Number(first) >= 0 ? `+${first}` : first
    if (tag === 'dc') return `DC ${first}`
    if (tag === 'recharge') return `Recharge ${first || '6'}${first && first !== '6' ? '–6' : ''}`
    if (tag === 'atk') return ({ mw: 'Melee Weapon Attack:', rw: 'Ranged Weapon Attack:',
      'mw,rw': 'Melee or Ranged Weapon Attack:', ms: 'Melee Spell Attack:', rs: 'Ranged Spell Attack:' })[first] ?? whole
    if (tag === 'spell') return `[${parts[2] || first}](https://2014.5e.tools/spells.html#${encodeURIComponent(first.toLowerCase())}_${(parts[1] || 'PHB').toLowerCase()})`
    if (tag === 'creature') return `[${parts[2] || first}](https://2014.5e.tools/bestiary.html#${encodeURIComponent(first.toLowerCase())}_${(parts[1] || 'MM').toLowerCase()})`
    if (tag === 'link') return `[${first}](${parts[1]})`
    if (tag === 'dice' || tag === 'damage' || tag === 'scaledice' || tag === 'scaledamage') return parts[2] || first
    if (['item', 'condition', 'skill', 'sense', 'book', 'adventure', 'background', 'race', 'class'].includes(tag)) return parts[2] || first
    if (['area', 'filter', 'quickref', 'note'].includes(tag)) return first
    return whole // Unknown syntax stays visible instead of silently losing information.
  }).replace(/\{@(?:b|bold|i|italic) ([^{}]*)\}/g, (_, content) => content)
}

function entries(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return inline(value)
  if (Array.isArray(value)) return value.map(entries).filter(Boolean).join('\n\n')
  if (value.type === 'image') return '' // Images are referenced, never downloaded.
  if (value.type === 'list') return (value.items ?? []).map(item => `- ${entries(item).replace(/\n/g, '\n  ')}`).join('\n')
  if (value.type === 'table') {
    const cell = v => entries(v).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
    const labels = value.colLabels ?? Array((value.rows?.[0] ?? []).length).fill('')
    return [`| ${labels.map(cell).join(' | ')} |`, `| ${labels.map(() => '---').join(' | ')} |`,
      ...(value.rows ?? []).map(row => `| ${row.map(cell).join(' | ')} |`)].join('\n')
  }
  if (value.entries || value.entry || value.items) return [value.name ? `**${inline(value.name)}.**` : '',
    entries(value.entries ?? value.entry ?? value.items)].filter(Boolean).join(' ')
  return inline(JSON.stringify(value))
}

function fact(value) {
  if (value == null) return '—'
  if (typeof value !== 'object') return inline(value)
  if (Array.isArray(value)) return value.map(fact).join('; ')
  return Object.entries(value).map(([key, item]) => `${key}: ${fact(item)}`).join('; ')
}

function profileKey(name, source = 'MM') { return `${name.toLowerCase()}|${source.toUpperCase()}` }
function referenceKey(tag) {
  const [name, source] = tag.split('|')
  return profileKey(name, source || 'MM')
}
function statBlock(monster, compact) {
  if (monster._copy) throw new Error(`Profil hérité non résolu : ${monster.name} (${monster.source})`)
  for (const field of ['ac', 'hp', 'speed', 'str', 'dex', 'con', 'int', 'wis', 'cha']) {
    if (monster[field] == null) throw new Error(`Profil incomplet : ${monster.name}.${field}`)
  }
  const lines = [`### ${monster.name} — ${monster.source}`, '',
    `[Fiche 5e.tools](https://2014.5e.tools/bestiary.html#${encodeURIComponent(monster.name.toLowerCase())}_${monster.source.toLowerCase()}) · ${monster.source}, p. ${monster.page ?? '?'}`, '',
    `**Taille / type / alignement :** ${fact(monster.size)} / ${fact(monster.type)} / ${fact(monster.alignment)}`, '',
    `**CA :** ${fact(monster.ac)} · **PV :** ${fact(monster.hp)} · **Vitesses (pieds) :** ${fact(monster.speed)}`, '',
    '| FOR | DEX | CON | INT | SAG | CHA |', '| --- | --- | --- | --- | --- | --- |',
    `| ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map(key => `${monster[key]} (${Math.floor((monster[key] - 10) / 2) >= 0 ? '+' : ''}${Math.floor((monster[key] - 10) / 2)})`).join(' | ')} |`, '']
  for (const [key, label] of Object.entries({ save: 'Sauvegardes', skill: 'Compétences', senses: 'Sens',
    passive: 'Perception passive', resist: 'Résistances', immune: 'Immunités aux dégâts',
    vulnerable: 'Vulnérabilités', conditionImmune: 'Immunités aux états', languages: 'Langues', cr: 'FP' })) {
    if (monster[key] != null) lines.push(`**${label} :** ${fact(monster[key])}`, '')
  }
  if (compact) lines.push('**Capacités et actions — synthèse mécanique :**', '', compact, '')
  else {
    // These fields describe the base block only: optional variants are separate.
    for (const [key, label] of Object.entries({ trait: 'Traits', action: 'Actions', bonus: 'Actions bonus',
      reaction: 'Réactions', legendary: 'Actions légendaires' })) {
      if (monster[key]?.length) lines.push(`#### ${label}`, '', entries(monster[key]), '')
    }
    for (const spellcasting of monster.spellcasting ?? []) {
      lines.push(`#### ${spellcasting.name ?? 'Spellcasting'}`, '', entries(spellcasting.headerEntries), '')
      if (spellcasting.will) lines.push(`À volonté : ${entries(spellcasting.will)}`, '')
      for (const key of ['daily', 'rest', 'weekly']) for (const [frequency, spells] of Object.entries(spellcasting[key] ?? {})) {
        lines.push(`${key} ${frequency} : ${entries(spells)}`, '')
      }
      for (const [level, slot] of Object.entries(spellcasting.spells ?? {})) {
        lines.push(`Niveau ${level}${slot.slots != null ? ` (${slot.slots} emplacements)` : ''} : ${entries(slot.spells)}`, '')
      }
      lines.push(entries(spellcasting.footerEntries), '')
    }
  }
  if (monster.variant?.length) lines.push('Variantes optionnelles présentes dans la source : non activées dans cette annexe.', '')
  return lines.join('\n').trim()
}

function walk(value, visit) {
  if (value == null || typeof value !== 'object') return
  visit(value)
  for (const item of Object.values(value)) {
    if (Array.isArray(item)) item.forEach(child => walk(child, visit))
    else if (item && typeof item === 'object') walk(item, visit)
  }
}

function buildAnnex(manifest, documents, sources) {
  const adventure = documents['adventure/adventure-cm.json']
  const chapters = adventure.data ?? adventure.adventureData?.find(item => item.source === manifest.adventureSource)?.data
  const chapter = chapters?.find(item => item.name === manifest.chapter)
  if (!chapter || chapters[manifest.chapterIndex] !== chapter) throw new Error('Chapitre absent ou index modifié ; vérifier le manifeste.')
  const sections = new Map()
  walk(chapter, node => { if (node.id) sections.set(node.id, node.name ?? node.id) })
  const references = new Set([...JSON.stringify(chapter).matchAll(/\{@creature ([^}]+)\}/g)].map(match => referenceKey(match[1])))
  const monsters = new Map()
  for (const document of Object.values(documents)) for (const monster of document.monster ?? []) {
    const key = profileKey(monster.name, monster.source)
    if (monsters.has(key)) throw new Error(`Profil ambigu : ${key}`)
    monsters.set(key, monster)
  }
  const chapterUrl = `https://2014.5e.tools/adventure.html#${manifest.adventureSource.toLowerCase()},${manifest.chapterIndex}`
  const lines = [START, '## Bestiaire — annexe documentaire 5e.tools', '',
    `Référence : **${manifest.ruleset}**, [${manifest.chapter}](${chapterUrl}). Données [5etools 2014](${manifest.repository}/tree/${manifest.revision}), version figée **${manifest.revision}**.`, '',
    '> Annexe documentaire pour le MJ, susceptible de contenir des spoilers. Les valeurs ci-dessous sont les profils de référence, pas l’état courant des PNJ ni des effets résolus. Les adaptations solo et la couverture réelle des outils MCP restent applicables. Aucun pouvoir, équipement, PV ou événement n’est activé par cette annexe.', '',
    'Les compléments narratifs sont synthétisés en français depuis les passages indiqués ; les blocs SRD conservent leurs descriptions anglaises. Les blocs spécifiques non SRD sont présentés sous forme de faits mécaniques synthétisés. Les liens de sorts ne recopient pas leurs textes. Les codes de taille et d’alignement restent ceux de la source.', '',
    '### PNJ et compléments propres à la campagne', '']
  for (const person of manifest.people) {
    for (const id of person.sections) if (!sections.has(id)) throw new Error(`Section source absente pour ${person.name} : ${id}`)
    if (person.profile && !references.has(referenceKey(person.profile))) throw new Error(`Profil non référencé par le chapitre : ${person.profile}`)
    lines.push(`#### ${person.name}`, '', person.summary, '',
      `**Profil de référence :** ${person.profile ?? 'Aucun bloc attribué ; ne pas en inventer.'}`, '',
      `**Passages source :** ${person.sections.map(id => `[${sections.get(id)} (${id})](${chapterUrl})`).join(', ')}.`, '')
    if (person.fluff) {
      const fluff = Object.values(documents).flatMap(document => document.monsterFluff ?? [])
        .find(item => profileKey(item.name, item.source) === referenceKey(person.fluff))
      if (!fluff?.entries?.length) throw new Error(`Informations complémentaires absentes : ${person.fluff}`)
      lines.push(`**Complément du bestiaire (synthèse) :** ${person.fluffSummary}`, '')
      for (const img of fluff.images ?? []) {
        if (img.href?.type === 'internal') lines.push(`Illustration référencée : [${fluff.name}](https://5e.tools/img/${img.href.path.split('/').map(encodeURIComponent).join('/')})${img.credit ? ` — ${img.credit}` : ''}.`, '')
      }
    }
  }
  lines.push('### Profils référencés par le chapitre', '',
    'Chaque profil est reproduit une seule fois. Un profil générique ne remplace pas les particularités du PNJ : appliquer les précisions documentaires ci-dessus uniquement lors d’une intégration mécanique explicite.', '')
  for (const key of [...references].sort()) {
    const monster = monsters.get(key)
    if (!monster) throw new Error(`Profil introuvable : ${key}`)
    const compact = Object.entries(manifest.compactProfiles ?? {}).find(([name]) => referenceKey(name) === key)?.[1]
    if (!monster.srd && !compact) throw new Error(`Synthèse mécanique spécifique requise : ${key}`)
    lines.push(statBlock(monster, compact), '')
  }
  lines.push('### Provenance des données', '',
    'Candlekeep Mysteries et Monster Manual : Wizards of the Coast. Profils SRD 5.1 : [attribution locale](../../lib/srd/monsters.LICENSE.txt).', '',
    'Les sources JSON sont conservées dans le cache local ignoré par Git. Empreintes SHA-256 des fichiers effectivement lus :', '')
  for (const source of sources) lines.push(`- [${source.file}](${source.url}) — SHA-256 : ${source.sha256}`)
  lines.push('', END)
  return { text: lines.join('\n'), profiles: references.size, people: manifest.people.length }
}

function updateAnnex(original, annex) {
  const starts = original.split(START).length - 1
  const ends = original.split(END).length - 1
  if (starts !== ends || starts > 1) throw new Error('Marqueurs d’annexe incohérents ; fichier laissé intact.')
  if (!starts) return `${original}${original.endsWith('\n\n') ? '' : original.endsWith('\n') ? '\n' : '\n\n'}${annex}\n`
  const start = original.indexOf(START)
  const end = original.indexOf(END) + END.length
  if (end < start || original.slice(end).trim()) throw new Error('L’annexe doit être complète et en fin de fichier ; fichier laissé intact.')
  return original.slice(0, start) + annex + original.slice(end)
}

async function loadSources(manifest, cacheDir, offline, refresh) {
  const base = `${manifest.repository.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/${manifest.revision}/data/`
  const documents = {}, sources = []
  // No whole-site crawl. Only the campaign, its named NPCs and 2014 base blocks.
  for (const file of ['adventure/adventure-cm.json', 'bestiary/bestiary-cm.json', 'bestiary/bestiary-mm.json', 'bestiary/fluff-bestiary-cm.json']) {
    const target = path.join(cacheDir, file)
    let body
    try { if (!refresh) body = await fs.readFile(target, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (body === undefined) {
      if (offline) throw new Error(`Source manquante en mode hors ligne : ${target}`)
      const response = await fetch(base + file, { signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error(`Téléchargement refusé (${response.status}) : ${base + file}`)
      body = await response.text()
    }
    const document = JSON.parse(body)
    if (!document || typeof document !== 'object') throw new Error(`Source JSON invalide : ${file}`)
    documents[file] = document
    sources.push({ file, url: base + file, sha256: createHash('sha256').update(body).digest('hex') })
    if (!offline) {
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, body, 'utf8')
    }
  }
  return { documents, sources }
}

async function main(args) {
  const options = { manifest: DEFAULT_MANIFEST }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (['--write', '--check', '--offline', '--refresh', '--help'].includes(arg)) options[arg.slice(2)] = true
    else if (['--manifest', '--file', '--cache-dir'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Valeur manquante : ${arg}`)
      options[arg.slice(2)] = path.resolve(args[++i])
    } else throw new Error(`Option inconnue : ${arg}`)
  }
  if (options.help) {
    console.log('node scripts/import-5etools-campaign.cjs [--write | --check] [--offline] [--refresh] [--file campagne.md] [--cache-dir dossier] [--manifest fichier.json]\nSans --write : prépare et vérifie sans modifier le .md. --check échoue si l’annexe manque ou diffère. --offline utilise exclusivement le cache ; --refresh recharge la version figée.')
    return
  }
  if (options.write && options.check) throw new Error('--write et --check sont incompatibles.')
  if (options.offline && options.refresh) throw new Error('--offline et --refresh sont incompatibles.')
  const manifest = JSON.parse(await fs.readFile(options.manifest, 'utf8'))
  const target = options.file ?? path.resolve(path.dirname(options.manifest), manifest.document)
  const original = await fs.readFile(target, 'utf8')
  const cacheDir = options['cache-dir'] ?? path.join(ROOT, '.data/5etools-campaign', manifest.revision)
  const { documents, sources } = await loadSources(manifest, cacheDir, options.offline, options.refresh)
  const annex = buildAnnex(manifest, documents, sources)
  const updated = updateAnnex(original, annex.text)
  if (options.check && updated !== original) throw new Error('Annexe absente ou différente ; exécuter avec --write.')
  if (options.write && updated !== original) {
    // Complete the fetch/render first; atomic replacement avoids partial markdown.
    if (await fs.readFile(target, 'utf8') !== original) throw new Error('Le document a changé pendant l’import ; relancer.')
    const temporary = `${target}.${process.pid}.5etools.tmp`
    try { await fs.writeFile(temporary, updated, { encoding: 'utf8', flag: 'wx' }); await fs.rename(temporary, target) }
    finally { await fs.rm(temporary, { force: true }) }
  }
  console.log(`${options.write ? 'Annexe enregistrée' : options.check ? 'Annexe à jour' : 'Annexe prête (ajouter --write pour enregistrer)'} : ${annex.people} entrées PNJ, ${annex.profiles} profils.\n${target}`)
}

module.exports = { inline, entries, statBlock, buildAnnex, updateAnnex, loadSources, START, END }
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1 })
