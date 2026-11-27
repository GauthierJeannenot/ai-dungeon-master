#!/usr/bin/env node
'use strict'

// Asset packing only: crop the six ImageGen drawings, retaining the original.
// No network or image-generation API. Run after changing the source atlas.
const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')
const { generate } = require('../public/dungeon-tiles/layout.js')
const output = path.join(__dirname, '..', 'public', 'dungeon-tiles')
const tiles = [
  { id: 'dead-end', label: 'Cul-de-sac', exits: 1 },
  { id: 'straight', label: 'Couloir droit', exits: 5 },
  { id: 'corner', label: 'Angle', exits: 3 },
  { id: 'tee', label: 'Jonction en T', exits: 11 },
  { id: 'cross', label: 'Croisement', exits: 15 },
  { id: 'room', label: 'Salle', exits: 15 },
]
async function main() {
  const atlas = path.join(output, 'graphite-atlas.png')
  const metadata = await sharp(atlas).metadata()
  if (metadata.width !== 1536 || metadata.height !== 1024) throw new Error('Expected a 1536x1024 atlas (3x2 tiles).')
  for (const [i, tile] of tiles.entries()) {
    // Discard the generated 16px paper inset so mouths touch the square edge.
    await sharp(atlas).extract({ left: (i % 3) * 512 + 16, top: Math.floor(i / 3) * 512 + 16, width: 480, height: 480 })
      .resize(512, 512).png().toFile(path.join(output, `${tile.id}.png`))
  }
  const manifest = { version: 1, style: 'graphite-pencil', tileSize: 512,
    atlas: 'graphite-atlas.png', grid: { columns: 3, rows: 2 },
    exits: { north: 1, east: 2, south: 4, west: 8 }, rotation: 'clockwise-degrees',
    note: 'Graphite artwork has hand-drawn seams; exit masks define logical connectivity, not engine collision geometry.',
    tiles: tiles.map(tile => ({ ...tile, file: `${tile.id}.png` })) }
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  const plan = generate(manifest)
  await fs.writeFile(path.join(output, 'example-layout.json'), JSON.stringify(plan, null, 2) + '\n')
  const size = 256
  const layers = []
  for (const tile of plan.tiles) layers.push({ input: await sharp(path.join(output, `${tile.tileId}.png`))
    .resize(size, size).rotate(tile.rotation, { background: '#fff' }).png().toBuffer(), left: tile.x * size, top: tile.y * size })
  await sharp({ create: { width: plan.width * size, height: plan.height * size, channels: 3, background: '#fff' } })
    .composite(layers).png().toFile(path.join(output, 'example-dungeon.png'))
  process.stdout.write('Prepared six graphite tiles, manifest and connected example dungeon.\n')
}
main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1 })
