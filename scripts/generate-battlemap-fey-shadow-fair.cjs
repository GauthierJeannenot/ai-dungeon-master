#!/usr/bin/env node
'use strict'

// Génère les DEUX battlemaps du module multi-maps « La Foire du Voleur
// d'Ombres » (adventures/fey-shadow-fair/map.ts — garder synchronisé) :
//   public/battlemaps/fey-shadow-fair-fair.png : la Foire aux Chandelles, 24×16
//   public/battlemaps/fey-shadow-fair-wood.png : le Bois-Ricanant, 16×24
//
// 64 px/case → 1536×1024 (paysage) et 1024×1536 (portrait) : la résolution
// native MAXIMALE des images générées par ChatGPT. Ces PNG procéduraux sont des
// placeholders — une illustration ChatGPT aux mêmes dimensions les remplace
// telle quelle (le test de registre ne vérifie que les dimensions).
//
// Relancer :  node scripts/generate-battlemap-fey-shadow-fair.cjs
// Aucune dépendance : PNG écrit à la main (zlib natif + CRC32), même mécanique
// que scripts/generate-battlemap-tide-crypt.cjs.

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const CELL_PX = 64

// ── PRNG déterministe ────────────────────────────────────────────────────────
let seed = 0xFA17E
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

function hex(color) {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff]
}

function shade(color, delta) {
  const [r, g, b] = hex(color)
  const clamp = v => Math.max(0, Math.min(255, v))
  return (clamp(r + delta) << 16) | (clamp(g + delta) << 8) | clamp(b + delta)
}

// ── Canvas paramétrable (une instance par map) ───────────────────────────────
function makeCanvas(cols, rows) {
  const width = cols * CELL_PX
  const height = rows * CELL_PX
  const px = Buffer.alloc(width * height * 4)
  function set(x, y, color) {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 4
    const [r, g, b] = hex(color)
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
  }
  function rect(x, y, w, h, color) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, color)
    }
  }
  function disc(cx, cy, radius, color) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) set(cx + dx, cy + dy, color)
      }
    }
  }
  function ring(cx, cy, radius, thickness, color) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d <= radius && d >= radius - thickness) set(cx + dx, cy + dy, color)
      }
    }
  }
  return { cols, rows, width, height, px, set, rect, disc, ring }
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
function writePng(canvas, filename) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(canvas.width, 0)
  ihdr.writeUInt32BE(canvas.height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  const raw = Buffer.alloc(canvas.height * (1 + canvas.width * 4))
  for (let y = 0; y < canvas.height; y++) {
    const rowStart = y * (1 + canvas.width * 4)
    raw[rowStart] = 0
    canvas.px.copy(raw, rowStart + 1, y * canvas.width * 4, (y + 1) * canvas.width * 4)
  }

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])

  const outDir = path.join(__dirname, '..', 'public', 'battlemaps')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, filename)
  fs.writeFileSync(outPath, png)
  console.log(`${filename} générée : ${canvas.width}×${canvas.height}px (${canvas.cols}×${canvas.rows} cases de ${CELL_PX}px) → ${outPath}`)
}

// ── Utilitaires de peinture partagés ─────────────────────────────────────────
function paintNoisyCell(c, cx, cy, base, speckles, delta) {
  const b = (cx + cy) % 2 === 0 ? base : shade(base, -6)
  c.rect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX, b)
  for (let i = 0; i < speckles; i++) {
    const x = cx * CELL_PX + Math.floor(rand() * CELL_PX)
    const y = cy * CELL_PX + Math.floor(rand() * CELL_PX)
    c.set(x, y, shade(b, rand() < 0.5 ? delta : -delta))
  }
}

function drawLantern(c, x, y) {
  c.rect(x, y - 12, 3, 20, 0x4a3a26)
  c.disc(x + 1, y - 16, 6, 0xe8b04a)
  c.disc(x + 1, y - 16, 2, 0xfae08a)
  for (let i = 0; i < 18; i++) {
    const hx = x + 1 + Math.floor((rand() - 0.5) * 26)
    const hy = y - 16 + Math.floor((rand() - 0.5) * 20)
    if (rand() < 0.4) c.set(hx, hy, 0x7a6a3a)
  }
}

function drawMushroom(c, x, y, capColor, size) {
  c.rect(x - 2, y, 5, size + 3, 0xd8d2c0)
  c.disc(x, y - 2, size + 3, capColor)
  c.disc(x - size + 2, y - 4, 2, shade(capColor, 40))
  c.disc(x + 3, y - size, 2, 0xf0e8d8)
}

function drawTree(c, x, y, canopy, trunk) {
  c.disc(x, y, 13, canopy)
  c.disc(x - 5, y - 5, 7, shade(canopy, 14))
  c.disc(x, y, 4, trunk)
}

function cellCx(cx) { return cx * CELL_PX + CELL_PX / 2 }
function cellCy(cy) { return cy * CELL_PX + CELL_PX / 2 }

// ═════════════════════════════════════════════════════════════════════════════
// CARTE 1 — La Foire aux Chandelles (24×16, 1536×1024)
// Salles (copie de adventures/fey-shadow-fair/map.ts — garder synchronisé)
// ═════════════════════════════════════════════════════════════════════════════
function generateFair() {
  const COLS = 24
  const ROWS = 16
  const c = makeCanvas(COLS, ROWS)

  const ROOMS = {
    1: { minX: 0, maxX: 23, minY: 13, maxY: 15 },  // Pré aux Lanternes
    2: { minX: 0, maxX: 9, minY: 9, maxY: 12 },    // Allée des Baraques
    3: { minX: 12, maxX: 21, minY: 9, maxY: 12 },  // Carrousel + Piste d'Escargots
    4: { minX: 0, maxX: 5, minY: 0, maxY: 4 },     // Tente du Bonneteau
    5: { minX: 14, maxX: 19, minY: 0, maxY: 4 },   // Portail des Vers Luisants
    6: { minX: 0, maxX: 6, minY: 5, maxY: 8 },     // Grand Chapiteau
    7: { minX: 16, maxX: 21, minY: 5, maxY: 8 },   // Théière à Bulles
    8: { minX: 8, maxX: 14, minY: 5, maxY: 8 },    // Verger aux Ripailles
    9: { minX: 7, maxX: 12, minY: 0, maxY: 4 },    // Palais des Miroirs
  }
  const ROOM_PRIORITY = [9, 5, 4, 6, 7, 8, 3, 2, 1]
  function roomAt(cx, cy) {
    for (const id of ROOM_PRIORITY) {
      const r = ROOMS[id]
      if (cx >= r.minX && cx <= r.maxX && cy >= r.minY && cy <= r.maxY) return id
    }
    return 0
  }

  const GRASS_NIGHT = 0x27402a
  const GRASS_PRE = 0x35522f
  const PATH = 0x6b5a38
  const PLANKS = 0x7a5c34
  const TENT_A = 0x8a3040
  const TENT_B = 0xd8cfc0
  const GROVE = 0x1f3a33
  const BIGTOP = 0x7a2838
  const ORCHARD = 0x3a5a2c
  const TEA = 0x5a4a6a
  const MIRROR = 0x4a5a72

  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      switch (roomAt(cx, cy)) {
        case 1: paintNoisyCell(c, cx, cy, GRASS_PRE, 20, 14); break
        case 2: paintNoisyCell(c, cx, cy, PATH, 16, 12); break
        case 3: paintNoisyCell(c, cx, cy, PLANKS, 10, 10); break
        case 4: {
          // Sol de tente rayé
          for (let dy = 0; dy < CELL_PX; dy++) {
            for (let dx = 0; dx < CELL_PX; dx++) {
              const s = Math.floor((cx * CELL_PX + dx) / 18) % 2 === 0
              c.set(cx * CELL_PX + dx, cy * CELL_PX + dy, s ? TENT_A : shade(TENT_B, ((dy >> 4) % 2) * -8))
            }
          }
          break
        }
        case 5: paintNoisyCell(c, cx, cy, GROVE, 16, 10); break
        case 6: {
          // Piste de cirque : anneaux concentriques peints en props plus bas
          paintNoisyCell(c, cx, cy, shade(BIGTOP, -18), 8, 8)
          break
        }
        case 7: paintNoisyCell(c, cx, cy, TEA, 12, 10); break
        case 8: paintNoisyCell(c, cx, cy, ORCHARD, 18, 12); break
        case 9: paintNoisyCell(c, cx, cy, MIRROR, 8, 8); break
        default: paintNoisyCell(c, cx, cy, GRASS_NIGHT, 12, 10); break
      }
    }
  }

  // Chemins de terre reliant les attractions
  const pathCells = [
    [4, 12], [4, 11], [5, 8], [5, 7], [3, 4], [10, 12], [11, 11], [11, 4],
    [13, 8], [15, 7], [16, 4], [17, 9], [7, 6], [15, 6], [9, 4], [22, 10],
  ]
  for (const [cx, cy] of pathCells) {
    paintNoisyCell(c, cx, cy, shade(PATH, -8), 12, 10)
  }

  // Lanternes du pré
  for (const [lx, ly] of [[1, 13], [3, 15], [6, 14], [9, 13], [12, 15], [15, 13], [18, 14], [21, 13], [23, 15]]) {
    drawLantern(c, lx * CELL_PX + 20 + Math.floor(rand() * 16), ly * CELL_PX + 34)
  }
  // Arche d'entrée de la foire au-dessus du départ (4,14)
  c.ring(cellCx(4), 13 * CELL_PX + 56, 28, 6, 0x8a6a3a)
  c.rect(4 * CELL_PX + 4, 13 * CELL_PX + 52, 8, 40, 0x6a4f2c)
  c.rect(4 * CELL_PX + 52, 13 * CELL_PX + 52, 8, 40, 0x6a4f2c)
  // Guérite de Nicodème (7,14) : toit étoilé + fée d'argent
  c.rect(7 * CELL_PX + 8, 14 * CELL_PX + 12, 48, 40, 0x3a3a5a)
  c.rect(7 * CELL_PX + 4, 14 * CELL_PX + 4, 56, 10, 0x2a2a4a)
  c.disc(7 * CELL_PX + 32, 14 * CELL_PX + 2, 5, 0xd8d8e8)
  for (let i = 0; i < 8; i++) {
    c.set(7 * CELL_PX + 8 + Math.floor(rand() * 48), 14 * CELL_PX + 6 + Math.floor(rand() * 6), 0xf0e8a0)
  }

  // Baraques de l'allée : étals le long du bord nord
  for (const bx of [1, 3, 5, 7, 9]) {
    const x0 = bx * CELL_PX + 8
    const y0 = 9 * CELL_PX + 6
    c.rect(x0, y0, 48, 24, 0x5a4028)
    c.rect(x0, y0, 48, 6, [0x9a4048, 0x4a7a58, 0x8a7a30, 0x5a5a9a, 0x8a5a2a][(bx - 1) / 2])
  }
  // Étal de Madame Bougie en (2,10) : chandelles
  c.rect(2 * CELL_PX + 10, 10 * CELL_PX + 16, 44, 28, 0x6a4f2c)
  for (let i = 0; i < 6; i++) {
    const x = 2 * CELL_PX + 14 + i * 7
    c.rect(x, 10 * CELL_PX + 6, 4, 12, 0xe8dcb0)
    c.set(x + 1, 10 * CELL_PX + 4, 0xf0c060)
    c.set(x + 1, 10 * CELL_PX + 3, 0xf8e080)
  }

  // Carrousel (ouest de la salle 3) : piste circulaire + limaces
  const ccx = cellCx(14) + CELL_PX / 2
  const ccy = cellCy(10) + CELL_PX / 2
  c.ring(ccx, ccy, 100, 8, shade(PLANKS, 26))
  c.ring(ccx, ccy, 58, 6, shade(PLANKS, -18))
  c.disc(ccx, ccy, 12, 0x8a6a3a) // mât central
  for (const angle of [0.4, 1.6, 2.9, 4.2, 5.4]) {
    const sx = ccx + Math.floor(Math.cos(angle) * 79)
    const sy = ccy + Math.floor(Math.sin(angle) * 79)
    c.disc(sx, sy, 10, 0x9a8a4a)
    c.disc(sx + 6, sy - 4, 6, 0xb0a05a)
    c.set(sx + 9, sy - 8, 0xd0c07a)
    c.set(sx + 11, sy - 8, 0xd0c07a)
  }
  // Piste d'Escargots (est de la salle 3) : anneau de course + escargots
  const rcx = cellCx(19) + CELL_PX / 2
  const rcy = cellCy(10) + CELL_PX / 2
  c.ring(rcx, rcy, 82, 14, shade(PATH, -14))
  c.ring(rcx, rcy, 82, 2, 0xd8d0b0)
  c.ring(rcx, rcy, 54, 2, 0xd8d0b0)
  for (const angle of [0.8, 2.4, 4.0, 5.6]) {
    const sx = rcx + Math.floor(Math.cos(angle) * 68)
    const sy = rcy + Math.floor(Math.sin(angle) * 68)
    c.disc(sx, sy, 7, [0xb05a5a, 0x5a7ab0, 0x8ab05a, 0xb0a04a][Math.floor(angle)])
    c.disc(sx - 4, sy + 2, 4, 0xc8b890)
  }
  // Pot de Barnabé en (19,10)
  c.rect(19 * CELL_PX + 20, 10 * CELL_PX + 30, 24, 20, 0x9a5a30)
  c.disc(19 * CELL_PX + 32, 10 * CELL_PX + 22, 14, 0x3a6a2f)
  c.disc(19 * CELL_PX + 25, 10 * CELL_PX + 14, 8, 0x4a7a38)
  c.disc(19 * CELL_PX + 40, 10 * CELL_PX + 12, 6, 0x4a7a38)

  // Tente : table de bonneteau + cartes
  c.rect(2 * CELL_PX + 12, 2 * CELL_PX + 20, 44, 28, 0x4a6a4a)
  for (const dx of [6, 18, 30]) {
    c.rect(2 * CELL_PX + 14 + dx, 2 * CELL_PX + 28, 10, 14, 0xe8e0d0)
    c.set(2 * CELL_PX + 18 + dx, 2 * CELL_PX + 34, 0x2a2a2a)
    c.set(2 * CELL_PX + 19 + dx, 2 * CELL_PX + 35, 0x2a2a2a)
  }

  // Grand Chapiteau : anneaux de piste + gradins
  const bcx = cellCx(3)
  const bcy = cellCy(6) + CELL_PX / 2
  c.ring(bcx, bcy, 96, 10, 0xa8842a)
  c.ring(bcx, bcy, 60, 6, shade(BIGTOP, 40))
  c.disc(bcx, bcy, 22, shade(BIGTOP, 24))
  c.disc(bcx, bcy, 8, 0xe8c04a)
  for (const angle of [0.6, 1.8, 3.1, 4.4, 5.5]) {
    const gx = bcx + Math.floor(Math.cos(angle) * 78)
    const gy = bcy + Math.floor(Math.sin(angle) * 78)
    c.rect(gx - 8, gy - 3, 16, 6, 0x5a4028)
  }
  // La vielle d'Ernestine (1,6)
  c.rect(1 * CELL_PX + 18, 6 * CELL_PX + 24, 28, 16, 0x8a6a3a)
  c.disc(1 * CELL_PX + 24, 6 * CELL_PX + 22, 4, 0xe8c04a)

  // Théière à Bulles : théière géante + bulles
  const tcx = cellCx(18) + CELL_PX / 2
  const tcy = cellCy(6) + CELL_PX / 2
  c.disc(tcx, tcy, 56, 0x8a5a9a)
  c.disc(tcx, tcy - 10, 40, shade(0x8a5a9a, 20))
  c.ring(tcx, tcy, 56, 4, 0xd8b0d8)
  c.rect(tcx - 6, tcy - 88, 12, 34, shade(0x8a5a9a, 10)) // bec verseur
  c.disc(tcx + 48, tcy - 24, 10, 0xb08ac0)               // anse
  for (let i = 0; i < 14; i++) {
    const bx = tcx - 70 + Math.floor(rand() * 140)
    const by = tcy - 110 + Math.floor(rand() * 70)
    c.ring(bx, by, 3 + Math.floor(rand() * 5), 1, 0xd8c8e8)
  }
  // Tasses des gobelins autour du socle
  for (const angle of [0.9, 2.2, 3.6, 5.0]) {
    const gx = tcx + Math.floor(Math.cos(angle) * 66)
    const gy = tcy + Math.floor(Math.sin(angle) * 66)
    c.disc(gx, gy, 5, 0xe8e0d0)
    c.set(gx, gy, 0x8a6a3a)
  }

  // Verger aux Ripailles : poiriers + tables de banquet
  for (const [txc, tyc] of [[9, 5], [12, 6], [10, 8], [14, 7], [8, 6]]) {
    drawTree(c, cellCx(txc), cellCy(tyc), 0x4a7a38, 0x5a4028)
  }
  for (const [bx, by] of [[10, 6], [12, 8]]) {
    c.rect(bx * CELL_PX + 8, by * CELL_PX + 24, 48, 18, 0x8a6a3a)
    for (let i = 0; i < 5; i++) {
      c.disc(bx * CELL_PX + 14 + i * 9, by * CELL_PX + 30, 3, [0xe8dcb0, 0xd8b04a, 0xc86a5a][i % 3])
    }
  }
  // Balançoire de Mirabelle (13,5)
  c.rect(13 * CELL_PX + 30, 5 * CELL_PX + 4, 3, 30, 0x8a7a5a)
  c.rect(13 * CELL_PX + 22, 5 * CELL_PX + 32, 20, 5, 0x8a6a3a)

  // Palais des Miroirs : rangées de glaces
  for (const mx of [7, 8, 9, 10, 11, 12]) {
    c.rect(mx * CELL_PX + 12, 0 * CELL_PX + 8, 40, 26, 0x8a9ab8)
    c.rect(mx * CELL_PX + 16, 0 * CELL_PX + 12, 32, 18, 0xc8d8e8)
    c.rect(mx * CELL_PX + 20, 0 * CELL_PX + 14, 6, 14, 0xf0f8ff)
  }
  for (const mx of [7, 9, 11]) {
    c.rect(mx * CELL_PX + 12, 4 * CELL_PX + 30, 40, 26, 0x8a9ab8)
    c.rect(mx * CELL_PX + 16, 4 * CELL_PX + 34, 32, 18, 0xc8d8e8)
  }

  // Portail des Vers Luisants en (16,2) : arche lumineuse + lucioles
  const gx = cellCx(16)
  const gy = cellCy(2)
  c.ring(gx, gy, 30, 8, 0x4a7a3a)
  c.ring(gx, gy, 22, 4, 0xa8e06a)
  for (let i = 0; i < 60; i++) {
    const fx = 14 * CELL_PX + Math.floor(rand() * 6 * CELL_PX)
    const fy = 0 * CELL_PX + Math.floor(rand() * 5 * CELL_PX)
    if (rand() < 0.7) c.set(fx, fy, rand() < 0.5 ? 0xcaf07a : 0x9ad05a)
  }

  // Guirlandes de fanions entre le pré et l'allée
  for (let x = 0; x < 10 * CELL_PX; x += 14) {
    const y = 12 * CELL_PX + 52 + Math.floor(Math.sin(x / 30) * 6)
    c.set(x, y, 0xc0b090)
    c.rect(x + 3, y + 2, 5, 7, [0x9a4048, 0x4a7a58, 0x8a7a30][Math.floor(x / 14) % 3])
  }

  writePng(c, 'fey-shadow-fair-fair.png')
}

// ═════════════════════════════════════════════════════════════════════════════
// CARTE 2 — Le Bois-Ricanant (16×24, 1024×1536 — on monte du sud vers le nord)
// ═════════════════════════════════════════════════════════════════════════════
function generateWood() {
  const COLS = 16
  const ROWS = 24
  const c = makeCanvas(COLS, ROWS)

  const ROOMS = {
    10: { minX: 0, maxX: 15, minY: 19, maxY: 23 }, // Clairière des Champignons
    11: { minX: 0, maxX: 15, minY: 14, maxY: 18 }, // Carrefour des Têtes
    12: { minX: 0, maxX: 7, minY: 9, maxY: 13 },   // Péage des Brigands
    13: { minX: 9, maxX: 15, minY: 9, maxY: 13 },  // Mare aux Grenouilles
    14: { minX: 0, maxX: 7, minY: 5, maxY: 8 },    // Sentier des Chiens-Clins
    15: { minX: 9, maxX: 15, minY: 5, maxY: 8 },   // Bal des Ombres
    16: { minX: 2, maxX: 13, minY: 0, maxY: 4 },   // Cour du Prince
  }
  const ROOM_PRIORITY = [16, 14, 15, 12, 13, 11, 10]
  function roomAt(cx, cy) {
    for (const id of ROOM_PRIORITY) {
      const r = ROOMS[id]
      if (cx >= r.minX && cx <= r.maxX && cy >= r.minY && cy <= r.maxY) return id
    }
    return 0
  }

  const FOREST = 0x1e3322
  const MOSS = 0x35592f
  const CROSSROAD = 0x554630
  const WATER = 0x2a5a66
  const DIRT = 0x5f4c30
  const STAGE = 0x3a3a52
  const COURT = 0x6a5a26

  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      switch (roomAt(cx, cy)) {
        case 10: paintNoisyCell(c, cx, cy, MOSS, 20, 12); break
        case 11: paintNoisyCell(c, cx, cy, CROSSROAD, 16, 12); break
        case 12: {
          // Le ruisseau qui glousse traverse le péage
          if (cy === 11) {
            const base = (cx + cy) % 2 === 0 ? WATER : shade(WATER, -8)
            c.rect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX, base)
            for (let i = 0; i < 8; i++) {
              c.rect(cx * CELL_PX + Math.floor(rand() * (CELL_PX - 8)), cy * CELL_PX + Math.floor(rand() * CELL_PX), 7, 2, shade(base, 20))
            }
          } else {
            paintNoisyCell(c, cx, cy, DIRT, 16, 12)
          }
          break
        }
        case 13: {
          const base = (cx + cy) % 2 === 0 ? WATER : shade(WATER, -8)
          c.rect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX, base)
          for (let i = 0; i < 10; i++) {
            const x = cx * CELL_PX + Math.floor(rand() * (CELL_PX - 8))
            const y = cy * CELL_PX + Math.floor(rand() * CELL_PX)
            c.rect(x, y, 7, 2, shade(base, 20))
          }
          break
        }
        case 14: paintNoisyCell(c, cx, cy, DIRT, 16, 12); break
        case 15: paintNoisyCell(c, cx, cy, STAGE, 12, 10); break
        case 16: paintNoisyCell(c, cx, cy, COURT, 20, 14); break
        default: {
          paintNoisyCell(c, cx, cy, FOREST, 12, 8)
          if (rand() < 0.4) {
            drawTree(c, cx * CELL_PX + 16 + Math.floor(rand() * 30), cy * CELL_PX + 16 + Math.floor(rand() * 30), 0x2e4a28, 0x4a3423)
          }
          break
        }
      }
    }
  }

  // Chemins entre les salles (sud → nord)
  for (const [cx, cy] of [[4, 19], [5, 18], [7, 13], [3, 13], [11, 13], [3, 8], [11, 8], [6, 4], [9, 4]]) {
    paintNoisyCell(c, cx, cy, shade(DIRT, -6), 14, 10)
  }

  // Clairière : champignons moqueurs (dont les deux du spawn de rencontre)
  drawMushroom(c, 3 * CELL_PX + 32, 20 * CELL_PX + 36, 0x7a4a9a, 10)
  drawMushroom(c, 6 * CELL_PX + 28, 21 * CELL_PX + 40, 0x8a3a8a, 10)
  for (const [mx, my] of [[1, 22], [8, 20], [11, 22], [13, 20], [2, 19], [10, 19], [14, 23], [5, 23]]) {
    drawMushroom(c, mx * CELL_PX + 16 + Math.floor(rand() * 28), my * CELL_PX + 24 + Math.floor(rand() * 20), 0x6a3a7a, 6)
  }

  // Carrefour : les trois têtes de pierre (7,15) + poteau indicateur + affiches
  const hx = cellCx(7)
  const hy = cellCy(15)
  c.disc(hx, hy + 14, 18, 0x8a8a80)
  c.disc(hx - 4, hy - 4, 15, 0x9a9a90)
  c.disc(hx + 2, hy - 20, 12, 0x8a8a80)
  for (const [ex, ey] of [[hx - 8, hy - 6], [hx - 1, hy - 6], [hx - 3, hy - 22], [hx + 4, hy - 22], [hx - 6, hy + 10], [hx + 2, hy + 10]]) {
    c.set(ex, ey, 0x2a2a24)
    c.set(ex + 1, ey, 0x2a2a24)
  }
  for (let i = 0; i < 30; i++) {
    c.set(hx - 20 + Math.floor(rand() * 40), hy - 30 + Math.floor(rand() * 60), 0x4a6a38)
  }
  // Poteau à quatre flèches contradictoires
  c.rect(cellCx(4), cellCy(16) - 24, 4, 48, 0x5a4630)
  for (const [dy, w] of [[-20, 26], [-8, -22], [4, 30], [16, -18]]) {
    c.rect(cellCx(4) + (w < 0 ? w : 4), cellCy(16) + dy, Math.abs(w), 7, 0x7a6240)
  }
  // Affiches « RECHERCHÉ » sur un tronc
  c.rect(cellCx(11) - 8, cellCy(15) - 20, 16, 40, 0x4a3423)
  c.rect(cellCx(11) - 14, cellCy(15) - 14, 13, 17, 0xd8d0b0)
  c.rect(cellCx(11) + 3, cellCy(15) - 6, 13, 17, 0xe0d8b8)
  c.rect(cellCx(11) - 11, cellCy(15) - 10, 7, 8, 0x8a7a5a) // le portrait (sans ombre)

  // Péage : pont de rondins sur le ruisseau + barrière + tente des brigands
  for (let x = 2 * CELL_PX; x < 5 * CELL_PX; x += 10) {
    c.rect(x, 11 * CELL_PX - 4, 8, CELL_PX + 8, 0x6a4f2c)
  }
  c.rect(1 * CELL_PX + 8, 10 * CELL_PX + 24, 60, 6, 0x8a6a3a) // barrière
  c.rect(1 * CELL_PX + 8, 10 * CELL_PX + 12, 5, 18, 0x6a4f2c)
  c.disc(2 * CELL_PX + 40, 12 * CELL_PX + 20, 16, 0x7a4a38)   // tente-tonneau
  c.ring(2 * CELL_PX + 40, 12 * CELL_PX + 20, 16, 3, 0x9a6a48)
  // Mirlitons plantés en faisceau
  for (const dx of [0, 6, 12]) {
    c.rect(5 * CELL_PX + 20 + dx, 12 * CELL_PX + 14, 3, 22, 0xd8b04a)
  }

  // Mare : nénuphars dallés (piste de bal) + grand nénuphar de la Baronne (13,10)
  for (const [nx, ny] of [[9, 10], [10, 12], [11, 10], [12, 12], [14, 11], [10, 9], [13, 13], [15, 9], [9, 13], [14, 9]]) {
    c.disc(cellCx(nx), cellCy(ny), 18, 0x3f7a3a)
    c.disc(cellCx(nx) + 4, cellCy(ny) - 6, 4, 0x5a9a4a)
  }
  c.disc(cellCx(13), cellCy(10), 26, 0x4a8a42)
  c.ring(cellCx(13), cellCy(10), 26, 4, 0x6aba5a)
  c.disc(cellCx(13), cellCy(10), 6, 0xd8b0d8) // coussin de la Baronne

  // Sentier : empreintes de pattes qui apparaissent/disparaissent
  for (let i = 0; i < 26; i++) {
    const x = Math.floor((0.5 + rand() * 6.5) * CELL_PX)
    const y = Math.floor((5.2 + rand() * 3.4) * CELL_PX)
    if (rand() < 0.6) {
      c.rect(x, y, 2, 2, 0x3a2e1c)
      c.rect(x + 4, y + 2, 2, 2, 0x3a2e1c)
      c.rect(x + 2, y + 6, 2, 2, 0x3a2e1c)
    }
  }

  // Bal des Ombres : estrade de clair de lune + silhouettes dansantes
  c.disc(cellCx(12), cellCy(6) + CELL_PX / 2, 80, 0x8a8ab0)
  c.disc(cellCx(12), cellCy(6) + CELL_PX / 2, 66, 0xa8a8c8)
  for (const [sx, sy, sh] of [[10.5, 6.2, 22], [12.2, 7.4, 26], [13.8, 6.0, 20], [11.4, 5.6, 18]]) {
    c.rect(Math.floor(sx * CELL_PX), Math.floor(sy * CELL_PX), 8, sh, 0x14141e)
    c.disc(Math.floor(sx * CELL_PX) + 4, Math.floor(sy * CELL_PX) - 4, 5, 0x14141e)
  }
  // Rideaux d'ombre sur les bords de la scène
  for (let i = 0; i < 40; i++) {
    const x = 9 * CELL_PX + Math.floor(rand() * 7 * CELL_PX)
    const y = 5 * CELL_PX + Math.floor(rand() * 4 * CELL_PX)
    if (rand() < 0.3) c.set(x, y, 0x22223a)
  }

  // Cour du Prince : trône de guingois (9,1) + rideau de feuilles dorées
  const tx = 9 * CELL_PX
  const ty = 1 * CELL_PX
  c.rect(tx + 14, ty + 20, 36, 32, 0x8a6a20)          // assise penchée
  c.rect(tx + 10, ty + 4, 12, 48, 0xa8842a)           // dossier de travers
  c.rect(tx + 44, ty + 12, 10, 40, 0x8a6a20)
  c.disc(tx + 16, ty + 2, 4, 0xe8c04a)                // pompon
  // Feuilles dorées en bordure nord de la cour
  for (let x = 2 * CELL_PX; x < 14 * CELL_PX; x += 9) {
    const y = 4 + Math.floor(rand() * 18)
    c.rect(x, y, 6, 4, rand() < 0.5 ? 0xd8b02a : 0xb8922a)
  }
  // Sacoche de Filou (5,1) : l'ombre qui dépasse
  c.rect(5 * CELL_PX + 20, 1 * CELL_PX + 32, 24, 18, 0x6a4a2a)
  c.rect(5 * CELL_PX + 26, 1 * CELL_PX + 14, 12, 18, 0x101018)   // l'ombre !
  c.rect(5 * CELL_PX + 22, 1 * CELL_PX + 10, 5, 5, 0x101018)     // petite main qui dépasse
  c.rect(5 * CELL_PX + 40, 1 * CELL_PX + 18, 4, 10, 0x2a3a4a)    // le reflet de Miroslav

  // Lucioles ambiantes du bois
  for (let i = 0; i < 120; i++) {
    const x = Math.floor(rand() * c.width)
    const y = Math.floor(rand() * c.height)
    if (rand() < 0.5) c.set(x, y, 0x9ad05a)
  }

  writePng(c, 'fey-shadow-fair-wood.png')
}

generateFair()
generateWood()
