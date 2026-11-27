const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { generate, rotate, directions } = require('../public/dungeon-tiles/layout.js')
const manifest = require('../public/dungeon-tiles/manifest.json')

test('every tile mask can be rendered and every occupied dungeon cell is reachable with reciprocal exits', () => {
  for (let n = 0; n < 80; n++) {
    const width = 3 + n % 10, height = 3 + (n * 3) % 10
    const count = 5 + n % (width * height - 4)
    const plan = generate(manifest, { seed: `test-${n}`, width, height, count })
    assert.equal(plan.tiles.length, count)
    const key = cell => `${cell.x},${cell.y}`
    const cells = new Map(plan.tiles.map(tile => [key(tile), tile]))
    assert.equal(cells.size, count)
    for (const cell of plan.tiles) {
      assert.ok(cell.x >= 0 && cell.x < width && cell.y >= 0 && cell.y < height)
      const art = manifest.tiles.find(tile => tile.id === cell.tileId)
      assert.equal(rotate(art.exits, cell.rotation / 90), cell.exits)
      for (const dir of directions) if (cell.exits & dir.bit) {
        const neighbor = cells.get(`${cell.x + dir.dx},${cell.y + dir.dy}`)
        assert.ok(neighbor, 'no dangling passage')
        assert.ok(neighbor.exits & dir.opposite, 'no passage into a closed wall')
      }
    }
    const queue = [cells.get(key(plan.entrance))], seen = new Set([key(plan.entrance)])
    for (let i = 0; i < queue.length; i++) for (const dir of directions) if (queue[i].exits & dir.bit) {
      const next = cells.get(`${queue[i].x + dir.dx},${queue[i].y + dir.dy}`)
      if (!seen.has(key(next))) { seen.add(key(next)); queue.push(next) }
    }
    assert.equal(seen.size, count)
    assert.ok(seen.has(key(plan.objective)))
    assert.notDeepEqual(plan.entrance, plan.objective)
  }
})

test('layouts are reproducible, accept full grids, and reject unbounded input', () => {
  assert.deepEqual(generate(manifest), generate(manifest))
  assert.notDeepEqual(generate(manifest, { seed: 'different' }), generate(manifest))
  assert.equal(generate(manifest, { width: 3, height: 3, count: 9 }).tiles.length, 9)
  for (const input of [{ seed: '' }, { seed: 'x'.repeat(81) }, { width: 100 }, { height: 2 }, { count: 50 }, { count: 4 }, { count: 5.5 }]) {
    assert.throws(() => generate(manifest, input))
  }
})

test('the six generated PNG tiles have the documented square size and public paths', async () => {
  assert.equal(manifest.tiles.length, 6)
  for (const tile of manifest.tiles) {
    assert.equal(path.basename(tile.file), tile.file)
    const file = path.join('public/dungeon-tiles', tile.file)
    assert.ok(fs.existsSync(file))
    const metadata = await sharp(file).metadata()
    assert.equal(metadata.width, manifest.tileSize)
    assert.equal(metadata.height, manifest.tileSize)
  }
})
