#!/usr/bin/env node
'use strict'

// Génère public/battlemaps/grammys-country-apple-pie.png : carte pixel art
// EXACTEMENT alignée sur la grille de jeu (17 colonnes × 15 lignes, CELL_PX
// pixels par case).
//
// La disposition des salles reproduit adventures/grammys-country-apple-pie/map.ts —
// si les zones changent là-bas, relancer :
//   node scripts/generate-battlemap-grammys-country-apple-pie.cjs
//
// Aucune dépendance : PNG écrit à la main (zlib natif + CRC32).

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const COLS = 17
const ROWS = 15
const CELL_PX = 32
const WIDTH = COLS * CELL_PX
const HEIGHT = ROWS * CELL_PX

// ── Salles (copie de ADVENTURE_ROOMS — garder synchronisé) ───────────────────
const ROOMS = {
  1: { name: 'Entrée extérieure', minX: 3, maxX: 16, minY: 13, maxY: 14 },
  2: { name: 'Verger de pommiers', minX: 3, maxX: 15, minY: 1, maxY: 2 },
  3: { name: 'Tas de déchets', minX: 12, maxX: 13, minY: 5, maxY: 7 },
  4: { name: "L'entrée", minX: 10, maxX: 13, minY: 9, maxY: 12 },
  5: { name: 'Le Bureau', minX: 5, maxX: 6, minY: 8, maxY: 11 },
  7: { name: 'Quai de chargement', minX: 3, maxX: 5, minY: 5, maxY: 7 },
  8: { name: 'Sol de la boulangerie', minX: 6, maxX: 11, minY: 5, maxY: 8 },
  9: { name: 'Appartement de Grammy', minX: 7, maxX: 9, minY: 8, maxY: 11 },
}
// Salles couvertes par le bâtiment (murs + plancher).
const BUILDING = new Set([4, 5, 7, 8, 9])
// Priorité d'attribution des cases contestées (zones qui se chevauchent).
const ROOM_PRIORITY = [5, 9, 4, 7, 8, 3, 2, 1]

// Portes : paires de cases [x1,y1,x2,y2] dont le mur commun est percé.
const DOORS = [
  [11, 12, 11, 13],  // 4 ↔ 1 : grandes portes de la façade (sud)
  [10, 8, 10, 9],    // 8 ↔ 4 : porte des réserves
  [6, 7, 6, 8],      // 8 ↔ 5 : porte du bureau
  [8, 7, 8, 8],      // 8 ↔ 9 : escalier vers l'appartement
  [9, 10, 10, 10],   // 9 ↔ 4 : porte de l'appartement côté entrée
  [5, 6, 6, 6],      // 7 ↔ 8 : porte latérale du quai
  [2, 6, 3, 6],      // extérieur ↔ 7 : quai de chargement ouvert
]

// ── PRNG déterministe (même image à chaque exécution) ────────────────────────
let seed = 0xA11CE
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

// Assombrit/éclaircit légèrement une couleur.
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

function isBuilding(cx, cy) {
  return BUILDING.has(roomAt(cx, cy))
}

function isDoor(x1, y1, x2, y2) {
  return DOORS.some(([a, b, c, d]) =>
    (a === x1 && b === y1 && c === x2 && d === y2) ||
    (a === x2 && b === y2 && c === x1 && d === y1)
  )
}

// ── Textures de sol par case ─────────────────────────────────────────────────
const GRASS = 0x3f5a33
const GRASS_ALT = 0x466339
const DIRT = 0x8a6f47
const WOOD = 0x7a5c39
const TILE = 0x8d7f6a
const STONE = 0x75705f
const CARPET = 0x7a4a41
const OFFICE = 0x6e5233

function paintGrassCell(cx, cy) {
  const base = (cx + cy) % 2 === 0 ? GRASS : GRASS_ALT
  rect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX, base)
  // Touffes d'herbe aléatoires
  for (let i = 0; i < 14; i++) {
    const x = cx * CELL_PX + Math.floor(rand() * CELL_PX)
    const y = cy * CELL_PX + Math.floor(rand() * CELL_PX)
    set(x, y, shade(base, rand() < 0.5 ? 12 : -12))
  }
}

function paintDirtCell(cx, cy) {
  rect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX, (cx + cy) % 2 === 0 ? DIRT : shade(DIRT, 6))
  for (let i = 0; i < 16; i++) {
    const x = cx * CELL_PX + Math.floor(rand() * CELL_PX)
    const y = cy * CELL_PX + Math.floor(rand() * CELL_PX)
    set(x, y, shade(DIRT, rand() < 0.5 ? 14 : -14))
  }
}

function paintPlankCell(cx, cy, base) {
  const x0 = cx * CELL_PX
  const y0 = cy * CELL_PX
  for (let dy = 0; dy < CELL_PX; dy++) {
    const plank = Math.floor(dy / 8) // 4 planches par case
    const c = shade(base, (plank % 2 === 0 ? 5 : -5) + ((cx * 7 + plank) % 3) * 3)
    for (let dx = 0; dx < CELL_PX; dx++) set(x0 + dx, y0 + dy, c)
    if (dy % 8 === 7) {
      for (let dx = 0; dx < CELL_PX; dx++) set(x0 + dx, y0 + dy, shade(base, -22))
    }
  }
}

function paintTileCell(cx, cy) {
  const x0 = cx * CELL_PX
  const y0 = cy * CELL_PX
  for (let dy = 0; dy < CELL_PX; dy++) {
    for (let dx = 0; dx < CELL_PX; dx++) {
      const tx = Math.floor(dx / 16)
      const ty = Math.floor(dy / 16)
      let c = (tx + ty + cx + cy) % 2 === 0 ? TILE : shade(TILE, -12)
      if (dx % 16 === 0 || dy % 16 === 0) c = shade(TILE, -30)
      set(x0 + dx, y0 + dy, c)
    }
  }
}

function paintStoneCell(cx, cy) {
  const base = (cx + cy) % 2 === 0 ? STONE : shade(STONE, -8)
  rect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX, base)
  for (let i = 0; i < 10; i++) {
    const x = cx * CELL_PX + Math.floor(rand() * (CELL_PX - 3))
    const y = cy * CELL_PX + Math.floor(rand() * (CELL_PX - 2))
    const c = shade(base, rand() < 0.5 ? 10 : -12)
    rect(x, y, 3, 2, c)
  }
}

function paintCarpetCell(cx, cy) {
  const x0 = cx * CELL_PX
  const y0 = cy * CELL_PX
  rect(x0, y0, CELL_PX, CELL_PX, CARPET)
  for (let dy = 0; dy < CELL_PX; dy++) {
    for (let dx = 0; dx < CELL_PX; dx++) {
      if ((dx + dy) % 8 === 0) set(x0 + dx, y0 + dy, shade(CARPET, -14))
      if ((dx - dy + CELL_PX) % 8 === 0) set(x0 + dx, y0 + dy, shade(CARPET, 10))
    }
  }
}

// ── Sols ─────────────────────────────────────────────────────────────────────
for (let cy = 0; cy < ROWS; cy++) {
  for (let cx = 0; cx < COLS; cx++) {
    const room = roomAt(cx, cy)
    switch (room) {
      case 1: paintDirtCell(cx, cy); break
      case 4: paintPlankCell(cx, cy, WOOD); break
      case 5: paintPlankCell(cx, cy, OFFICE); break
      case 7: paintStoneCell(cx, cy); break
      case 8: paintTileCell(cx, cy); break
      case 9: paintCarpetCell(cx, cy); break
      default: paintGrassCell(cx, cy); break // 0 (extérieur), 2 (verger), 3 (déchets)
    }
  }
}

// Chemin de terre : de la bordure sud jusqu'aux grandes portes (colonne 11).
for (let cy = 13; cy < ROWS; cy++) paintDirtCell(11, cy)

// ── Murs du bâtiment ─────────────────────────────────────────────────────────
const WALL = 0x4a3b2c
const WALL_DARK = 0x37281c
const WALL_T = 5 // épaisseur en px de chaque côté de l'arête

function drawWallSegmentH(cx, cy, side) {
  // Mur horizontal sur le bord haut (side=-1) ou bas (side=+1) de la case.
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

const DOOR_WOOD = 0x9a6b33
function drawDoorH(cx, cy, side) {
  const x0 = cx * CELL_PX + 4
  const y = (side < 0 ? cy * CELL_PX : (cy + 1) * CELL_PX) - 3
  rect(x0, y, CELL_PX - 8, 6, DOOR_WOOD)
  rect(x0, y + 2, CELL_PX - 8, 1, shade(DOOR_WOOD, -30))
}
function drawDoorV(cx, cy, side) {
  const y0 = cy * CELL_PX + 4
  const x = (side < 0 ? cx * CELL_PX : (cx + 1) * CELL_PX) - 3
  rect(x, y0, 6, CELL_PX - 8, DOOR_WOOD)
  rect(x + 2, y0, 1, CELL_PX - 8, shade(DOOR_WOOD, -30))
}

for (let cy = 0; cy < ROWS; cy++) {
  for (let cx = 0; cx < COLS; cx++) {
    const hereRoom = roomAt(cx, cy)
    const hereBuilding = BUILDING.has(hereRoom)

    // Bord droit / bas : comparer à la case voisine (chaque arête traitée une fois).
    for (const [nx, ny, vertical] of [[cx + 1, cy, true], [cx, cy + 1, false]]) {
      const thereRoom = nx < COLS && ny < ROWS ? roomAt(nx, ny) : 0
      const thereBuilding = BUILDING.has(thereRoom)
      if (hereRoom === thereRoom) continue
      if (!hereBuilding && !thereBuilding) continue // pas de mur entre zones extérieures

      if (isDoor(cx, cy, nx, ny)) {
        if (vertical) drawDoorV(cx, cy, 1)
        else drawDoorH(cx, cy, 1)
      } else if (vertical) {
        drawWallSegmentV(cx, cy, 1)
      } else {
        drawWallSegmentH(cx, cy, 1)
      }
    }
  }
}

// ── Props ────────────────────────────────────────────────────────────────────
function drawTree(cx, cy) {
  const x0 = cx * CELL_PX
  const y0 = cy * CELL_PX
  // Tronc
  rect(x0 + 14, y0 + 20, 5, 9, 0x5b4327)
  // Feuillage (losange grossier)
  const FOLIAGE = 0x4e7a3a
  for (let dy = 2; dy < 22; dy++) {
    const half = dy < 12 ? dy : 22 - dy
    const w = Math.min(13, half + 4)
    for (let dx = 16 - w; dx <= 16 + w; dx++) {
      set(x0 + dx, y0 + dy, shade(FOLIAGE, ((dx + dy) % 5) * 3 - 6))
    }
  }
  // Pommes
  for (let i = 0; i < 5; i++) {
    const ax = x0 + 6 + Math.floor(rand() * 20)
    const ay = y0 + 4 + Math.floor(rand() * 14)
    set(ax, ay, 0xb8402f); set(ax + 1, ay, 0xb8402f)
  }
}

function drawCrate(x, y, size) {
  rect(x, y, size, size, 0x8a6a3d)
  rect(x, y, size, 1, shade(0x8a6a3d, 25))
  rect(x, y + size - 1, size, 1, shade(0x8a6a3d, -30))
  rect(x, y, 1, size, shade(0x8a6a3d, 15))
  rect(x + size - 1, y, 1, size, shade(0x8a6a3d, -25))
  for (let d = 0; d < size; d++) set(x + d, y + d, shade(0x8a6a3d, -18))
}

function drawOven(cx, cy) {
  const x0 = cx * CELL_PX + 3
  const y0 = cy * CELL_PX + 3
  rect(x0, y0, CELL_PX - 6, CELL_PX - 10, 0x4d4a45)
  rect(x0 + 2, y0 + 2, CELL_PX - 10, CELL_PX - 14, 0x3a3835)
  // Bouche du four
  rect(x0 + 8, y0 + 10, 10, 7, 0x1e1c1a)
  rect(x0 + 10, y0 + 12, 6, 4, 0xd0752b)
  rect(x0 + 11, y0 + 13, 4, 2, 0xf0a03c)
}

function drawTable(cx, cy, w, h, color) {
  const x0 = cx * CELL_PX + 4
  const y0 = cy * CELL_PX + 6
  rect(x0, y0, w, h, color)
  rect(x0, y0, w, 2, shade(color, 18))
  rect(x0, y0 + h - 2, w, 2, shade(color, -22))
}

function drawBed(cx, cy) {
  const x0 = cx * CELL_PX + 5
  const y0 = cy * CELL_PX + 3
  rect(x0, y0, 22, CELL_PX * 2 - 10, 0x6d3f35)          // cadre
  rect(x0 + 2, y0 + 2, 18, 10, 0xd8d2c2)                // oreiller
  rect(x0 + 2, y0 + 13, 18, CELL_PX * 2 - 27, 0x93353a) // couverture
  for (let dy = 0; dy < CELL_PX * 2 - 27; dy += 4) {
    rect(x0 + 2, y0 + 13 + dy, 18, 1, shade(0x93353a, -18))
  }
}

function drawGarbage(cx, cy) {
  const x0 = cx * CELL_PX
  const y0 = cy * CELL_PX
  for (let i = 0; i < 26; i++) {
    const x = x0 + 2 + Math.floor(rand() * (CELL_PX - 6))
    const y = y0 + 2 + Math.floor(rand() * (CELL_PX - 6))
    const colors = [0x6b6252, 0x7a7060, 0x585043, 0x8a7f6a]
    rect(x, y, 2 + Math.floor(rand() * 3), 2 + Math.floor(rand() * 2), colors[Math.floor(rand() * colors.length)])
  }
  // Touche de champignon violet
  if ((cx + cy) % 2 === 0) {
    const mx = x0 + 8 + Math.floor(rand() * 12)
    const my = y0 + 8 + Math.floor(rand() * 12)
    rect(mx, my, 4, 3, 0x7c4d8f)
    rect(mx + 1, my - 1, 2, 1, 0x9a6bb0)
  }
}

function drawCounter(cx, cy, w) {
  const x0 = cx * CELL_PX + 2
  const y0 = cy * CELL_PX + 10
  rect(x0, y0, w, 12, 0x5f4426)
  rect(x0, y0, w, 3, shade(0x5f4426, 22))
}

// Verger : un pommier par case paire des lignes 1-2 + lisière d'arbres au nord.
for (let cx = 3; cx <= 15; cx += 2) drawTree(cx, 1)
for (let cx = 4; cx <= 14; cx += 2) drawTree(cx, 2)
for (let cx = 0; cx < COLS; cx++) if (cx % 2 === 0) drawTree(cx, 0)
// Bordures gauche/droite boisées hors bâtiment
for (let cy = 0; cy <= 12; cy += 2) { drawTree(0, cy); drawTree(16, cy) }
drawTree(1, 4); drawTree(2, 10); drawTree(15, 6)

// Tas de déchets (salle 3)
for (let cy = 5; cy <= 7; cy++) for (let cx = 12; cx <= 13; cx++) drawGarbage(cx, cy)

// Boulangerie (salle 8) : fours au nord, plans de travail, armoire vitrée (6,7)
drawOven(9, 5); drawOven(10, 5); drawOven(11, 5)
drawTable(7, 6, CELL_PX + 18, 12, 0x6f4f2c)
// Armoire vitrée (potions) en (6,7)
rect(6 * CELL_PX + 6, 7 * CELL_PX + 6, 20, 20, 0x5f4426)
rect(6 * CELL_PX + 9, 7 * CELL_PX + 9, 14, 14, 0x8fb6c9)
rect(6 * CELL_PX + 11, 7 * CELL_PX + 12, 3, 6, 0xc0392b)
rect(6 * CELL_PX + 17, 7 * CELL_PX + 12, 3, 6, 0xc0392b)

// Bureau (salle 5) : bureau + classeurs
drawTable(5, 9, CELL_PX + 16, 14, 0x4f3a22)
rect(5 * CELL_PX + 4, 8 * CELL_PX + 4, 10, 16, 0x5a452c)

// Appartement (salle 9) : lit + table
drawBed(7, 9)
drawTable(9, 9, 18, 12, 0x6d4f31)

// Entrée (salle 4) : comptoir + caisse
drawCounter(12, 10, CELL_PX + 20)
drawCrate(13 * CELL_PX + 8, 11 * CELL_PX + 8, 12)

// Quai de chargement (salle 7) : caisses et tonneaux
drawCrate(4 * CELL_PX + 4, 5 * CELL_PX + 6, 14)
drawCrate(4 * CELL_PX + 20, 5 * CELL_PX + 12, 10)
drawCrate(3 * CELL_PX + 6, 7 * CELL_PX + 10, 12)

// Mac le Tréant vit en (7,13) : ombre d'arbre au sol (le token PNJ fait le reste)
rect(7 * CELL_PX + 8, 13 * CELL_PX + 8, 16, 16, shade(DIRT, -20))
for (let i = 0; i < 10; i++) {
  const x = 7 * CELL_PX + 6 + Math.floor(rand() * 20)
  const y = 13 * CELL_PX + 6 + Math.floor(rand() * 20)
  set(x, y, shade(DIRT, -34))
}

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
ihdr[8] = 8   // bit depth
ihdr[9] = 6   // color type RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

// Scanlines avec filtre 0
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
const outPath = path.join(outDir, 'grammys-country-apple-pie.png')
fs.writeFileSync(outPath, png)
console.log(`grammys-country-apple-pie.png générée : ${WIDTH}×${HEIGHT}px (${COLS}×${ROWS} cases de ${CELL_PX}px) → ${outPath}`)
