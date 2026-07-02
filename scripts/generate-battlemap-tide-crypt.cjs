#!/usr/bin/env node
'use strict'

// Génère public/battlemaps/tide-crypt.png : battlemap pixel art du module
// « La Crypte des Marées », EXACTEMENT alignée sur la grille 17×15 et sur les
// zones de adventures/tide-crypt/map.ts (garder synchronisé).
//
// Relancer :  node scripts/generate-battlemap-tide-crypt.cjs
// Aucune dépendance : PNG écrit à la main (zlib natif + CRC32), même mécanique
// que scripts/generate-battlemap.cjs (Grammy's).

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const COLS = 17
const ROWS = 15
const CELL_PX = 32
const WIDTH = COLS * CELL_PX
const HEIGHT = ROWS * CELL_PX

// ── Salles (copie de adventures/tide-crypt/map.ts — garder synchronisé) ──────
const ROOMS = {
  1: { name: 'Grève aux Épaves', minX: 2, maxX: 16, minY: 12, maxY: 14 },
  2: { name: 'Phare Éteint', minX: 13, maxX: 15, minY: 8, maxY: 11 },
  3: { name: 'Épave de la Sirène', minX: 2, maxX: 4, minY: 9, maxY: 11 },
  4: { name: 'Passage des Marées', minX: 7, maxX: 10, minY: 9, maxY: 11 },
  5: { name: 'Antichambre Engloutie', minX: 6, maxX: 11, minY: 6, maxY: 8 },
  6: { name: 'Ossuaire des Marins', minX: 2, maxX: 5, minY: 3, maxY: 7 },
  7: { name: 'Salle des Cloches', minX: 12, maxX: 15, minY: 3, maxY: 6 },
  8: { name: 'Chapelle de la Gardienne', minX: 6, maxX: 11, minY: 1, maxY: 5 },
}
// Salles murées (bâtiments/crypte). L'épave (3) a sa coque en props, le
// passage (4) est à ciel ouvert entre deux murs d'eau.
const BUILDING = new Set([2, 5, 6, 7, 8])
const ROOM_PRIORITY = [8, 7, 6, 5, 4, 3, 2, 1]

// Portes : paires de cases [x1,y1,x2,y2] dont le mur commun est percé.
const DOORS = [
  [14, 11, 14, 12], // grève ↔ phare
  [8, 8, 8, 9],     // passage ↔ antichambre (escalier noyé)
  [5, 6, 6, 6],     // antichambre ↔ ossuaire (arche basse)
  [11, 6, 12, 6],   // antichambre ↔ salle des cloches
  [8, 5, 8, 6],     // antichambre ↔ chapelle (double porte de bronze)
]

// ── PRNG déterministe ────────────────────────────────────────────────────────
let seed = 0x71DE5
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

// ── Canvas RGBA ──────────────────────────────────────────────────────────────
const px = Buffer.alloc(WIDTH * HEIGHT * 4)

function hex(color) {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff]
}

function set(x, y, color) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return
  const i = (y * WIDTH + x) * 4
  const [r, g, b] = hex(color)
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
}

function rect(x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, color)
  }
}

function shade(color, delta) {
  const [r, g, b] = hex(color)
  const clamp = v => Math.max(0, Math.min(255, v))
  return (clamp(r + delta) << 16) | (clamp(g + delta) << 8) | clamp(b + delta)
}

// ── Attribution case → salle ─────────────────────────────────────────────────
function roomAt(cx, cy) {
  for (const id of ROOM_PRIORITY) {
    const r = ROOMS[id]
    if (cx >= r.minX && cx <= r.maxX && cy >= r.minY && cy <= r.maxY) return id
  }
  return 0 // extérieur
}

function isDoor(x1, y1, x2, y2) {
  return DOORS.some(([a, b, c, d]) =>
    (a === x1 && b === y1 && c === x2 && d === y2) ||
    (a === x2 && b === y2 && c === x1 && d === y1)
  )
}

// ── Palette ──────────────────────────────────────────────────────────────────
const SEA = 0x1e3a4a
const SEA_DEEP = 0x162d3b
const SAND = 0x9c8a5e
const ROCK = 0x3d4245
const STONE_WET = 0x4a5458
const STONE_CRYPT = 0x515c63
const WOOD_WRECK = 0x4a3625
const FLAGSTONE = 0x6b7570
const CHAPEL_STONE = 0x5d686f
const FLAME = 0x3adbc0

// ── Textures de sol par case ─────────────────────────────────────────────────
function paintSeaCell(cx, cy) {
  const base = (cx + cy) % 2 === 0 ? SEA : SEA_DEEP
  rect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX, base)
  // Écume / reflets
  for (let i = 0; i < 6; i++) {
    const x = cx * CELL_PX + Math.floor(rand() * (CELL_PX - 4))
    const y = cy * CELL_PX + Math.floor(rand() * CELL_PX)
    rect(x, y, 3 + Math.floor(rand() * 3), 1, shade(base, 24))
  }
}

function paintRockCell(cx, cy) {
  const base = (cx + cy) % 2 === 0 ? ROCK : shade(ROCK, -6)
  rect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX, base)
  for (let i = 0; i < 8; i++) {
    const x = cx * CELL_PX + Math.floor(rand() * (CELL_PX - 4))
    const y = cy * CELL_PX + Math.floor(rand() * (CELL_PX - 2))
    rect(x, y, 3, 2, shade(base, rand() < 0.5 ? 10 : -12))
  }
}

function paintSandCell(cx, cy) {
  const base = (cx + cy) % 2 === 0 ? SAND : shade(SAND, -6)
  rect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX, base)
  for (let i = 0; i < 14; i++) {
    const x = cx * CELL_PX + Math.floor(rand() * CELL_PX)
    const y = cy * CELL_PX + Math.floor(rand() * CELL_PX)
    set(x, y, shade(base, rand() < 0.5 ? 14 : -14))
  }
  // Varech éparpillé
  if (rand() < 0.4) {
    const x = cx * CELL_PX + Math.floor(rand() * (CELL_PX - 6))
    const y = cy * CELL_PX + Math.floor(rand() * (CELL_PX - 3))
    rect(x, y, 5, 2, 0x3f4f2e)
  }
}

function paintWetStoneCell(cx, cy, base) {
  const x0 = cx * CELL_PX
  const y0 = cy * CELL_PX
  for (let dy = 0; dy < CELL_PX; dy++) {
    for (let dx = 0; dx < CELL_PX; dx++) {
      const tx = Math.floor(dx / 16)
      const ty = Math.floor(dy / 16)
      let c = (tx + ty + cx + cy) % 2 === 0 ? base : shade(base, -10)
      if (dx % 16 === 0 || dy % 16 === 0) c = shade(base, -26)
      set(x0 + dx, y0 + dy, c)
    }
  }
  // Reflets d'humidité bleu-vert
  for (let i = 0; i < 5; i++) {
    const x = x0 + Math.floor(rand() * (CELL_PX - 4))
    const y = y0 + Math.floor(rand() * CELL_PX)
    rect(x, y, 3, 1, 0x4a7a78)
  }
}

function paintFloodedCell(cx, cy) {
  // Antichambre : dalle sombre sous une pellicule d'eau immobile.
  paintWetStoneCell(cx, cy, STONE_WET)
  const x0 = cx * CELL_PX
  const y0 = cy * CELL_PX
  for (let i = 0; i < 8; i++) {
    const x = x0 + Math.floor(rand() * (CELL_PX - 6))
    const y = y0 + Math.floor(rand() * CELL_PX)
    rect(x, y, 4 + Math.floor(rand() * 3), 1, 0x2e5a5e)
  }
}

function paintWreckCell(cx, cy) {
  const x0 = cx * CELL_PX
  const y0 = cy * CELL_PX
  for (let dy = 0; dy < CELL_PX; dy++) {
    const plank = Math.floor(dy / 8)
    const c = shade(WOOD_WRECK, (plank % 2 === 0 ? 6 : -6) + ((cx * 5 + plank) % 3) * 3)
    for (let dx = 0; dx < CELL_PX; dx++) set(x0 + dx, y0 + dy, c)
    if (dy % 8 === 7) {
      for (let dx = 0; dx < CELL_PX; dx++) set(x0 + dx, y0 + dy, shade(WOOD_WRECK, -22))
    }
  }
}

function paintCausewayCell(cx, cy) {
  // Dalles plates mouillées, eau retenue sur les bords est/ouest de la salle.
  const room = ROOMS[4]
  if (cx === room.minX || cx === room.maxX) {
    paintSeaCell(cx, cy)
    return
  }
  const base = (cx + cy) % 2 === 0 ? FLAGSTONE : shade(FLAGSTONE, -8)
  rect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX, base)
  for (let i = 0; i < 8; i++) {
    const x = cx * CELL_PX + Math.floor(rand() * (CELL_PX - 5))
    const y = cy * CELL_PX + Math.floor(rand() * (CELL_PX - 2))
    rect(x, y, 4, 2, shade(base, rand() < 0.5 ? 10 : -14))
  }
  // Algues sur les dalles
  if (rand() < 0.5) {
    const x = cx * CELL_PX + Math.floor(rand() * (CELL_PX - 5))
    const y = cy * CELL_PX + Math.floor(rand() * (CELL_PX - 2))
    rect(x, y, 4, 2, 0x3f5f3e)
  }
}

// ── Sols ─────────────────────────────────────────────────────────────────────
for (let cy = 0; cy < ROWS; cy++) {
  for (let cx = 0; cx < COLS; cx++) {
    const room = roomAt(cx, cy)
    switch (room) {
      case 1: paintSandCell(cx, cy); break
      case 2: paintWetStoneCell(cx, cy, STONE_CRYPT); break
      case 3: paintWreckCell(cx, cy); break
      case 4: paintCausewayCell(cx, cy); break
      case 5: paintFloodedCell(cx, cy); break
      case 6: paintWetStoneCell(cx, cy, shade(STONE_CRYPT, -8)); break
      case 7: paintWetStoneCell(cx, cy, STONE_CRYPT); break
      case 8: paintWetStoneCell(cx, cy, CHAPEL_STONE); break
      default:
        // Extérieur : mer sur la colonne de gauche et la rangée du bas de la
        // grève, roche partout ailleurs (la crypte est creusée dans la falaise).
        if (cx <= 1 || cy === 0) paintSeaCell(cx, cy)
        else paintRockCell(cx, cy)
        break
    }
  }
}

// Ligne d'écume au bord de la grève (transition mer → sable, colonne x2).
for (let cy = 12; cy < ROWS; cy++) {
  const x0 = 2 * CELL_PX
  for (let dy = 0; dy < CELL_PX; dy++) {
    if (rand() < 0.5) set(x0, cy * CELL_PX + dy, 0xcfd8d2)
    if (rand() < 0.3) set(x0 + 1, cy * CELL_PX + dy, 0xb8c4bd)
  }
}

// ── Murs ─────────────────────────────────────────────────────────────────────
const WALL = 0x30383c
const WALL_DARK = 0x22282b
const WALL_T = 5

function drawWallSegmentH(cx, cy, side) {
  const x0 = cx * CELL_PX
  const y = side < 0 ? cy * CELL_PX : (cy + 1) * CELL_PX
  for (let dx = 0; dx < CELL_PX; dx++) {
    for (let t = -WALL_T; t < WALL_T; t++) {
      set(x0 + dx, y + t, t === -WALL_T || t === WALL_T - 1 ? WALL_DARK : shade(WALL, ((dx >> 3) % 2) * 8))
    }
  }
}

function drawWallSegmentV(cx, cy, side) {
  const y0 = cy * CELL_PX
  const x = side < 0 ? cx * CELL_PX : (cx + 1) * CELL_PX
  for (let dy = 0; dy < CELL_PX; dy++) {
    for (let t = -WALL_T; t < WALL_T; t++) {
      set(x + t, y0 + dy, t === -WALL_T || t === WALL_T - 1 ? WALL_DARK : shade(WALL, ((dy >> 3) % 2) * 8))
    }
  }
}

const DOOR_BRONZE = 0x6a8a5e
function drawDoorH(cx, cy) {
  const x0 = cx * CELL_PX + 4
  const y = (cy + 1) * CELL_PX - 3
  rect(x0, y, CELL_PX - 8, 6, DOOR_BRONZE)
  rect(x0, y + 2, CELL_PX - 8, 1, shade(DOOR_BRONZE, -30))
}
function drawDoorV(cx, cy) {
  const y0 = cy * CELL_PX + 4
  const x = (cx + 1) * CELL_PX - 3
  rect(x, y0, 6, CELL_PX - 8, DOOR_BRONZE)
  rect(x + 2, y0, 1, CELL_PX - 8, shade(DOOR_BRONZE, -30))
}

for (let cy = 0; cy < ROWS; cy++) {
  for (let cx = 0; cx < COLS; cx++) {
    const hereRoom = roomAt(cx, cy)
    const hereBuilding = BUILDING.has(hereRoom)

    for (const [nx, ny, vertical] of [[cx + 1, cy, true], [cx, cy + 1, false]]) {
      const thereRoom = nx < COLS && ny < ROWS ? roomAt(nx, ny) : 0
      const thereBuilding = BUILDING.has(thereRoom)
      if (hereRoom === thereRoom) continue
      if (!hereBuilding && !thereBuilding) continue

      if (isDoor(cx, cy, nx, ny)) {
        if (vertical) drawDoorV(cx, cy)
        else drawDoorH(cx, cy)
      } else if (vertical) {
        drawWallSegmentV(cx, cy, 1)
      } else {
        drawWallSegmentH(cx, cy, 1)
      }
    }
  }
}

// ── Props ────────────────────────────────────────────────────────────────────
function drawPillar(cx, cy) {
  const x0 = cx * CELL_PX + 11
  const y0 = cy * CELL_PX + 11
  rect(x0, y0, 10, 10, shade(STONE_CRYPT, 18))
  rect(x0 + 2, y0 + 2, 6, 6, shade(STONE_CRYPT, -20))
}

function drawNiche(x, y, horizontal) {
  // Niche funéraire : cavité sombre + ossements pâles.
  if (horizontal) {
    rect(x, y, 14, 8, 0x1d2224)
    rect(x + 3, y + 3, 8, 2, 0xcfc9b4)
  } else {
    rect(x, y, 8, 14, 0x1d2224)
    rect(x + 3, y + 3, 2, 8, 0xcfc9b4)
  }
}

function drawBell(cx, cy, big, color) {
  const x0 = cx * CELL_PX
  const y0 = cy * CELL_PX
  const w = big ? 16 : 10
  const h = big ? 14 : 9
  const bx = x0 + Math.floor((CELL_PX - w) / 2)
  const by = y0 + 6
  // Corde
  rect(x0 + CELL_PX / 2 - 1, y0, 2, 6, 0x7a6a4a)
  // Cloche (trapèze grossier)
  for (let dy = 0; dy < h; dy++) {
    const inset = Math.floor(((h - dy) / h) * (w / 4))
    rect(bx + inset, by + dy, w - inset * 2, 1, shade(color, dy % 3 === 0 ? 10 : 0))
  }
  rect(bx - 1, by + h, w + 2, 2, shade(color, -25))
}

function drawAltar(cx, cy) {
  const x0 = cx * CELL_PX + 4
  const y0 = cy * CELL_PX + 8
  rect(x0, y0, CELL_PX - 8, 14, shade(CHAPEL_STONE, 24))
  rect(x0, y0, CELL_PX - 8, 2, shade(CHAPEL_STONE, 40))
  // Lanterne et sa flamme bleu-vert
  const lx = x0 + Math.floor((CELL_PX - 8) / 2) - 3
  rect(lx, y0 - 8, 7, 8, 0x8a7a52)
  rect(lx + 1, y0 - 7, 5, 6, 0x1d2a2b)
  rect(lx + 2, y0 - 6, 3, 4, FLAME)
  set(lx + 3, y0 - 7, shade(FLAME, 40))
  // Halo au sol
  for (let i = 0; i < 20; i++) {
    const hx = cx * CELL_PX + 4 + Math.floor(rand() * (CELL_PX - 8))
    const hy = cy * CELL_PX + 2 + Math.floor(rand() * 8)
    if (rand() < 0.4) set(hx, hy, shade(FLAME, -70))
  }
}

function drawCrate(x, y, size, color) {
  rect(x, y, size, size, color)
  rect(x, y, size, 1, shade(color, 25))
  rect(x, y + size - 1, size, 1, shade(color, -30))
  rect(x, y, 1, size, shade(color, 15))
  rect(x + size - 1, y, 1, size, shade(color, -25))
  for (let d = 0; d < size; d++) set(x + d, y + d, shade(color, -18))
}

function drawWreckRibs() {
  // Membrures de la coque le long des bords de l'épave (salle 3).
  const room = ROOMS[3]
  const RIB = shade(WOOD_WRECK, -18)
  for (let cy = room.minY; cy <= room.maxY; cy++) {
    for (const cx of [room.minX, room.maxX]) {
      const x0 = cx * CELL_PX + (cx === room.minX ? 2 : CELL_PX - 6)
      rect(x0, cy * CELL_PX, 4, CELL_PX, RIB)
    }
  }
  // Proue au nord
  for (let cx = room.minX; cx <= room.maxX; cx++) {
    rect(cx * CELL_PX, room.minY * CELL_PX, CELL_PX, 5, RIB)
  }
}

function drawLighthouseFloor() {
  // Rez du phare : cercle de pierre claire + départ d'escalier en spirale.
  const room = ROOMS[2]
  const centerX = Math.floor(((room.minX + room.maxX + 1) / 2) * CELL_PX)
  const centerY = Math.floor(((room.minY + room.maxY + 1) / 2) * CELL_PX)
  const radius = 40
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= radius && dist >= radius - 4) {
        set(centerX + dx, centerY + dy, shade(STONE_CRYPT, 26))
      }
      if (dist < radius - 4 && Math.abs(dist - (radius - 18)) < 2) {
        set(centerX + dx, centerY + dy, shade(STONE_CRYPT, 14))
      }
    }
  }
  // Bureau du gardien (rez, coin sud-ouest)
  rect(13 * CELL_PX + 4, 11 * CELL_PX + 6, 20, 12, 0x5a452c)
}

// Antichambre : piliers rongés de sel
drawPillar(7, 7)
drawPillar(10, 7)

// Ossuaire : niches le long des murs ouest et nord
for (let cy = 3; cy <= 7; cy++) drawNiche(2 * CELL_PX + 3, cy * CELL_PX + 12, false)
for (let cx = 3; cx <= 5; cx++) drawNiche(cx * CELL_PX + 9, 3 * CELL_PX + 4, true)

// Salle des cloches : deux grandes vert-de-gris + une petite pâle
drawBell(13, 4, true, 0x5f7a58)
drawBell(14, 5, true, 0x5f7a58)
drawBell(15, 4, false, 0xb8b4a2)

// Chapelle : autel + lanterne en (8,2)
drawAltar(8, 2)
drawPillar(6, 3)
drawPillar(11, 3)

// Épave : coque + tonneau dans la cale
drawWreckRibs()
drawCrate(3 * CELL_PX + 10, 10 * CELL_PX + 10, 12, 0x6a4f30)

// Phare : sol circulaire + bureau
drawLighthouseFloor()

// Grève : rochers, bois flotté, barque retournée
drawCrate(6 * CELL_PX + 8, 13 * CELL_PX + 10, 10, 0x6a4f30)
rect(10 * CELL_PX + 4, 14 * CELL_PX + 8, 22, 6, shade(WOOD_WRECK, 12))
for (const [cx, cy] of [[5, 14], [9, 12], [13, 13], [15, 12]]) {
  const x = cx * CELL_PX + 6 + Math.floor(rand() * 10)
  const y = cy * CELL_PX + 6 + Math.floor(rand() * 10)
  rect(x, y, 7, 5, shade(ROCK, 14))
  rect(x + 1, y + 1, 5, 3, shade(ROCK, 2))
}
// Rocher de Maël en (12,13)
rect(12 * CELL_PX + 8, 13 * CELL_PX + 12, 14, 9, shade(ROCK, 20))

// ── Encodage PNG ─────────────────────────────────────────────────────────────
const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(WIDTH, 0)
ihdr.writeUInt32BE(HEIGHT, 4)
ihdr[8] = 8
ihdr[9] = 6
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 4))
for (let y = 0; y < HEIGHT; y++) {
  const rowStart = y * (1 + WIDTH * 4)
  raw[rowStart] = 0
  px.copy(raw, rowStart + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const outDir = path.join(__dirname, '..', 'public', 'battlemaps')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'tide-crypt.png')
fs.writeFileSync(outPath, png)
console.log(`tide-crypt.png générée : ${WIDTH}×${HEIGHT}px (${COLS}×${ROWS} cases de ${CELL_PX}px) → ${outPath}`)
