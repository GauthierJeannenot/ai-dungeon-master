#!/usr/bin/env node
'use strict'

// Authoring only. No network or source-book data is loaded during a game.
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const sharp = require('sharp')
const ROOT = path.resolve(__dirname, '..')
const DIR = path.join(ROOT, 'adventures/sarah-of-yellowcrest-manor')
const PUBLIC = '/adventures/sarah-of-yellowcrest-manor/5etools'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

async function main() {
  const offline = process.argv.includes('--offline')
  for (const arg of process.argv.slice(2)) if (arg !== '--offline') throw new Error(`Option inconnue : ${arg}`)
  const recipe = JSON.parse(await fs.readFile(path.join(DIR, '5etools-import.json'), 'utf8'))
  const cache = path.join(ROOT, '.data/5etools-campaign', recipe.revision)
  const sources = []
  async function source(file) {
    const bytes = await fs.readFile(path.join(cache, file))
    sources.push({ file, sha256: hash(bytes), url: `${recipe.repository.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/${recipe.revision}/data/${file}` })
    return JSON.parse(bytes)
  }
  const book = await source('adventure/adventure-cm.json')
  const chapter = book.adventureData.find(item => item.source === recipe.adventureSource)?.data.find(item => item.name === recipe.chapter)
  if (!chapter) throw new Error('Chapitre de Sarah absent du cache source.')
  const assets = []
  function add(imagePath, local, title, category, credit = '', profile) {
    assets.push({ title, category, credit: credit || 'Non indiqué dans les données source',
      ...(profile ? { profile } : {}),
      url: 'https://5e.tools/img/' + imagePath.split('/').map(encodeURIComponent).join('/'),
      localPath: `${PUBLIC}/${local}` })
  }
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'image') {
      if (node.href?.type !== 'internal') throw new Error('Image de chapitre non interne : vérifier manuellement.')
      const title = node.title.replace(/\{@creature ([^|}]+)[^}]*\}/g, '$1')
      add(node.href.path, `chapter/${path.basename(node.href.path)}`, title, node.imageType ?? 'illustration', node.credit)
      if (node.hrefThumbnail) add(node.hrefThumbnail.path, `thumbnails/${path.basename(node.hrefThumbnail.path)}`, `${title} — miniature`, 'thumbnail', node.credit)
      return
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') walk(value)
    }
  }
  walk(chapter)
  // Original chapter profiles, plus the grick explicitly used by the adaptation.
  const profiles = { MM: ['Commoner', 'Cult Fanatic', 'Cultist', 'Ghost', 'Grell', 'Grick', 'Knight', 'Mage', 'Noble', 'Thug'], CM: ['Faerl'] }
  for (const [sourceId, names] of Object.entries(profiles)) {
    const blocks = await source(`bestiary/bestiary-${sourceId.toLowerCase()}.json`)
    const fluff = await source(`bestiary/fluff-bestiary-${sourceId.toLowerCase()}.json`)
    for (const name of names) {
      const block = blocks.monster.find(item => item.name === name && item.source === sourceId)
      if (!block?.hasToken) throw new Error(`Token non attesté : ${name}|${sourceId}`)
      add(`bestiary/tokens/${sourceId}/${name}.webp`, `tokens/${slug(name)}.webp`, name, 'token', '', `${name}|${sourceId}`)
      for (const image of fluff.monsterFluff.find(item => item.name === name && item.source === sourceId)?.images ?? []) {
        if (image.href?.type !== 'internal') throw new Error(`Illustration externe : ${name}`)
        add(image.href.path, `bestiary/${path.basename(image.href.path)}`, name, 'bestiary', image.credit, `${name}|${sourceId}`)
      }
    }
  }
  for (const asset of assets) {
    const destination = path.join(ROOT, 'public', asset.localPath)
    let bytes
    if (offline) bytes = await fs.readFile(destination)
    else {
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(30000) })
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Image refusée : ${response.status} ${asset.url}`)
      bytes = Buffer.from(await response.arrayBuffer())
    }
    const metadata = await sharp(bytes).metadata()
    if (metadata.format !== 'webp' || !metadata.width || !metadata.height) throw new Error(`WebP invalide : ${asset.url}`)
    Object.assign(asset, { width: metadata.width, height: metadata.height, bytes: bytes.length, sha256: hash(bytes) })
    if (!offline) {
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.writeFile(destination, bytes)
    }
    console.log(`${asset.category}: ${asset.title} (${asset.width}×${asset.height})`)
  }
  const manifest = { chapter: recipe.chapter, chapterUrl: 'https://2014.5e.tools/adventure.html#cm,9', revision: recipe.revision,
    rights: 'Illustrations et tokens des publications D&D de Wizards of the Coast. Disponibilité sur 5e.tools ne vaut pas licence libre ; crédits conservés selon les données source.', sources, assets }
  const target = path.join(DIR, '5etools-assets.json')
  const rendered = JSON.stringify(manifest, null, 2) + '\n'
  if (offline) {
    if (await fs.readFile(target, 'utf8') !== rendered) throw new Error('Manifeste différent des fichiers locaux.')
  } else await fs.writeFile(target, rendered)
  const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const credits = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sarah — crédits et images</title>
<style>body{max-width:1100px;margin:32px auto;padding:0 20px;background:#171717;color:#eee;font:16px system-ui}a{color:#e5bc80}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:20px}figure{margin:0;padding:16px;background:#292929;border-radius:12px}img{width:100%;height:220px;object-fit:contain}small{display:block;color:#ccc}</style>
<h1>Sarah of Yellowcrest Manor — images et crédits</h1><p>${escape(manifest.rights)}</p>
<p><a href="${manifest.chapterUrl}">Chapitre source sur 5e.tools (2014)</a> · Données ${manifest.revision}. <a href="/miniatures/credits.html">Crédits des figurines de repli et du héros</a>.</p>
<p>Sarah, Faerl, Vecken et Viallis disposent d’illustrations nommées. Les autres pions utilisent un archétype, pas un portrait individuel. Le pion collectif des esprits est représenté par Sarah. L’apparition de Sarah dans la salle de lecture conserve son image existante. Les cartes originales restent des références : les plans jouables de l’adaptation sont conservés.</p>
<div class="gallery">${assets.map(a => `<figure><a href="${escape(a.localPath)}"><img src="${escape(a.localPath)}" alt="${escape(a.title)}" loading="lazy"></a><figcaption>${escape(a.title)}<small>${a.category} · ${a.width} × ${a.height} · ${escape(a.credit)}</small><a href="${escape(a.url)}">Source de l’image</a></figcaption></figure>`).join('\n')}</div></html>\n`
  const creditsPath = path.join(ROOT, 'public', PUBLIC, 'credits.html')
  if (offline) {
    if (await fs.readFile(creditsPath, 'utf8') !== credits) throw new Error('Crédits différents des sources.')
  } else await fs.writeFile(creditsPath, credits)
  console.log(`${assets.length} images ${offline ? 'vérifiées hors ligne' : 'téléchargées'}.`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
