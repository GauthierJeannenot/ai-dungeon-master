/* Shared by the standalone preview and offline tooling; no gameplay state. */
;(function (root) {
  'use strict'
  const directions = [
    { bit: 1, opposite: 4, dx: 0, dy: -1 },
    { bit: 2, opposite: 8, dx: 1, dy: 0 },
    { bit: 4, opposite: 1, dx: 0, dy: 1 },
    { bit: 8, opposite: 2, dx: -1, dy: 0 },
  ]
  const rotate = (mask, turns) => ((mask << turns) | (mask >> (4 - turns))) & 15

  function generate(manifest, { seed = 'crayon-01', width = 7, height = 7, count = 24 } = {}) {
    if (typeof seed !== 'string' || seed.length < 1 || seed.length > 80) throw new Error('Seed must be 1..80 characters.')
    if (![width, height].every(n => Number.isInteger(n) && n >= 3 && n <= 12)) throw new Error('Dimensions must be 3..12 tiles.')
    if (!Number.isInteger(count) || count < 5 || count > width * height) throw new Error('Tile count must be 5..width*height.')
    let state = 2166136261
    for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619)
    const random = () => {
      state += 0x6D2B79F5
      let n = Math.imul(state ^ (state >>> 15), 1 | state)
      n ^= n + Math.imul(n ^ (n >>> 7), 61 | n)
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296
    }
    const key = (x, y) => `${x},${y}`
    const cells = new Map()
    const add = (x, y) => {
      const cell = { x, y, exits: 0 }
      cells.set(key(x, y), cell)
      return cell
    }
    const connect = (a, b, direction) => { a.exits |= direction.bit; b.exits |= direction.opposite }
    const center = add(Math.floor(width / 2), Math.floor(height / 2))
    // A central four-port room anchors the kit. Every new tile is connected
    // immediately; passages never leave the grid or face a closed neighbour.
    for (const direction of directions) connect(center, add(center.x + direction.dx, center.y + direction.dy), direction)
    while (cells.size < count) {
      const frontier = []
      for (const cell of cells.values()) for (const direction of directions) {
        const x = cell.x + direction.dx, y = cell.y + direction.dy
        if (x >= 0 && y >= 0 && x < width && y < height && !cells.has(key(x, y))) frontier.push({ cell, direction, x, y })
      }
      const choice = frontier[Math.floor(random() * frontier.length)]
      connect(choice.cell, add(choice.x, choice.y), choice.direction)
    }
    for (const cell of cells.values()) for (const direction of directions.slice(1, 3)) {
      const neighbor = cells.get(key(cell.x + direction.dx, cell.y + direction.dy))
      if (neighbor && !(cell.exits & direction.bit) && random() < 0.12) connect(cell, neighbor, direction)
    }
    const farthest = start => {
      const queue = [start], seen = new Set([key(start.x, start.y)])
      for (let i = 0; i < queue.length; i++) for (const direction of directions) {
        if (!(queue[i].exits & direction.bit)) continue
        const next = cells.get(key(queue[i].x + direction.dx, queue[i].y + direction.dy))
        if (!seen.has(key(next.x, next.y))) { seen.add(key(next.x, next.y)); queue.push(next) }
      }
      return queue.at(-1)
    }
    const entrance = farthest(center), objective = farthest(entrance)
    const tiles = [...cells.values()].map(cell => {
      const options = manifest.tiles.flatMap(tile => [0, 1, 2, 3]
        .filter(turn => rotate(tile.exits, turn) === cell.exits)
        .map(turn => ({ tileId: tile.id, rotation: turn * 90 })))
      const choice = cell === center ? options.find(option => option.tileId === 'room') : options[Math.floor(random() * options.length)]
      if (!choice) throw new Error(`No tile supports exits ${cell.exits}.`)
      return { ...cell, ...choice }
    })
    return { version: 1, seed, width, height, tileSize: manifest.tileSize,
      entrance: { x: entrance.x, y: entrance.y }, objective: { x: objective.x, y: objective.y }, tiles,
      notice: 'Composition visuelle de préparation. Aucun état de partie, mur moteur, rencontre ou transition de session créé.' }
  }
  const api = { generate, rotate, directions }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.DungeonTiles = api
})(globalThis)
