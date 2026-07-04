#!/usr/bin/env node
'use strict'

// Génère les DEUX battlemaps du module multi-maps « La Foire du Voleur
// d'Ombres » (adventures/fey-shadow-fair/map.ts — garder synchronisé) :
//   public/battlemaps/fey-shadow-fair-fair.png : la Foire aux Chandelles, 17×15
//   public/battlemaps/fey-shadow-fair-wood.png : le Bois-Ricanant, 15×13
//
// Relancer :  node scripts/generate-battlemap-fey-shadow-fair.cjs
// Aucune dépendance : PNG écrit à la main (zlib natif + CRC32), même mécanique
// que scripts/generate-battlemap-tide-crypt.cjs.

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const CELL_PX = 32

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
  // Poteau + halo chaud
  c.rect(x, y - 6, 2, 10, 0x4a3a26)
  c.disc(x + 1, y - 8, 3, 0xe8b04a)
  c.set(x + 1, y - 8, 0xfae08a)
  for (let i = 0; i < 10; i++) {
    const hx = x + 1 + Math.floor((rand() - 0.5) * 14)
    const hy = y - 8 + Math.floor((rand() - 0.5) * 10)
    if (rand() < 0.4) c.set(hx, hy, 0x7a6a3a)
  }
}

function drawMushroom(c, x, y, capColor, size) {
  c.rect(x - 1, y, 3, size, 0xd8d2c0)           // pied
  c.disc(x, y - 1, size + 1, capColor)          // chapeau
  c.set(x - size + 1, y - 2, shade(capColor, 40))
  c.set(x + 2, y - size + 1, 0xf0e8d8)          // point clair
}

// ═════════════════════════════════════════════════════════════════════════════
// CARTE 1 — La Foire aux Chandelles (17×15)
// Salles (copie de adventures/fey-shadow-fair/map.ts — garder synchronisé)
// ═════════════════════════════════════════════════════════════════════════════
function generateFair() {
  const COLS = 17
  const ROWS = 15
  const c = makeCanvas(COLS, ROWS)

  const ROOMS = {
    1: { minX: 2, maxX: 16, minY: 12, maxY: 14 },  // Pré aux Lanternes
    2: { minX: 2, maxX: 9, minY: 8, maxY: 11 },    // Allée des Baraques
    3: { minX: 11, maxX: 15, minY: 8, maxY: 11 },  // Carrousel de Limaces
    4: { minX: 3, maxX: 7, minY: 3, maxY: 6 },     // Tente du Bonneteau
    5: { minX: 10, maxX: 14, minY: 2, maxY: 5 },   // Portail des Vers Luisants
  }
  const ROOM_PRIORITY = [5, 4, 3, 2, 1]
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

  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      switch (roomAt(cx, cy)) {
        case 1: paintNoisyCell(c, cx, cy, GRASS_PRE, 12, 14); break
        case 2: paintNoisyCell(c, cx, cy, PATH, 10, 12); break
        case 3: {
          // Plateau de bois circulaire du carrousel (peint case par case, cercle en props)
          paintNoisyCell(c, cx, cy, PLANKS, 6, 10)
          break
        }
        case 4: {
          // Sol de tente rayé
          const stripe = Math.floor((cx * CELL_PX) / 10)
          for (let dy = 0; dy < CELL_PX; dy++) {
            for (let dx = 0; dx < CELL_PX; dx++) {
              const s = Math.floor((cx * CELL_PX + dx) / 10) % 2 === 0
              c.set(cx * CELL_PX + dx, cy * CELL_PX + dy, s ? TENT_A : shade(TENT_B, ((dy >> 3) % 2) * -8))
            }
          }
          void stripe
          break
        }
        case 5: paintNoisyCell(c, cx, cy, GROVE, 10, 10); break
        default: paintNoisyCell(c, cx, cy, GRASS_NIGHT, 8, 10); break
      }
    }
  }

  // Chemin de terre reliant pré → allée → tente → portail
  for (const [cx, cy] of [[4, 12], [4, 11], [5, 7], [5, 6], [9, 7], [10, 6], [12, 6], [12, 5]]) {
    paintNoisyCell(c, cx, cy, shade(PATH, -8), 8, 10)
  }

  // Lanternes du pré
  for (const [lx, ly] of [[3, 13], [6, 14], [8, 12], [10, 13], [12, 14], [14, 12], [16, 13]]) {
    drawLantern(c, lx * CELL_PX + 10 + Math.floor(rand() * 8), ly * CELL_PX + 16)
  }
  // Arche d'entrée de la foire au-dessus du départ (4,13)
  c.ring(4 * CELL_PX + 16, 12 * CELL_PX + 30, 14, 3, 0x8a6a3a)
  c.rect(4 * CELL_PX + 2, 12 * CELL_PX + 28, 4, 20, 0x6a4f2c)
  c.rect(4 * CELL_PX + 26, 12 * CELL_PX + 28, 4, 20, 0x6a4f2c)

  // Baraques de l'allée : étals le long du bord nord
  for (const bx of [2, 4, 6, 8]) {
    const x0 = bx * CELL_PX + 4
    const y0 = 8 * CELL_PX + 4
    c.rect(x0, y0, 24, 12, 0x5a4028)
    c.rect(x0, y0, 24, 3, [0x9a4048, 0x4a7a58, 0x8a7a30, 0x5a5a9a][(bx / 2 - 1) % 4]) // auvents
  }
  // Étal de Madame Bougie en (3,9) : chandelles
  c.rect(3 * CELL_PX + 6, 9 * CELL_PX + 8, 20, 14, 0x6a4f2c)
  for (let i = 0; i < 5; i++) {
    const x = 3 * CELL_PX + 8 + i * 4
    c.rect(x, 9 * CELL_PX + 4, 2, 6, 0xe8dcb0)
    c.set(x, 9 * CELL_PX + 3, 0xf0c060)
  }

  // Carrousel : piste circulaire + limaces
  const ccx = Math.floor(13.5 * CELL_PX)
  const ccy = Math.floor(9.5 * CELL_PX) + CELL_PX / 2
  c.ring(ccx, ccy, 52, 4, shade(PLANKS, 26))
  c.ring(ccx, ccy, 30, 3, shade(PLANKS, -18))
  c.disc(ccx, ccy, 6, 0x8a6a3a) // mât central
  for (const angle of [0.4, 1.6, 2.9, 4.2, 5.4]) {
    const sx = ccx + Math.floor(Math.cos(angle) * 41)
    const sy = ccy + Math.floor(Math.sin(angle) * 41)
    c.disc(sx, sy, 5, 0x9a8a4a)          // corps de limace
    c.disc(sx + 3, sy - 2, 3, 0xb0a05a)  // tête
    c.set(sx + 4, sy - 4, 0xd0c07a)      // antenne
  }
  // Pot de Barnabé en (14,9)
  c.rect(14 * CELL_PX + 10, 9 * CELL_PX + 14, 12, 10, 0x9a5a30)
  c.disc(14 * CELL_PX + 16, 9 * CELL_PX + 10, 7, 0x3a6a2f)
  c.disc(14 * CELL_PX + 13, 9 * CELL_PX + 7, 4, 0x4a7a38)

  // Tente : table de bonneteau + cartes
  c.rect(5 * CELL_PX + 6, 4 * CELL_PX + 10, 22, 14, 0x4a6a4a)
  for (const dx of [3, 9, 15]) {
    c.rect(5 * CELL_PX + 8 + dx, 4 * CELL_PX + 14, 5, 7, 0xe8e0d0)
    c.set(5 * CELL_PX + 10 + dx, 4 * CELL_PX + 17, 0x2a2a2a)
  }

  // Portail des Vers Luisants en (12,4) : arche lumineuse + lucioles
  const gx = 12 * CELL_PX + 16
  const gy = 4 * CELL_PX + 16
  c.ring(gx, gy, 15, 4, 0x4a7a3a)
  c.ring(gx, gy, 11, 2, 0xa8e06a)
  for (let i = 0; i < 26; i++) {
    const fx = 10 * CELL_PX + Math.floor(rand() * 5 * CELL_PX)
    const fy = 2 * CELL_PX + Math.floor(rand() * 4 * CELL_PX)
    c.set(fx, fy, rand() < 0.5 ? 0xcaf07a : 0x9ad05a)
  }

  // Guirlandes de fanions entre le pré et l'allée
  for (let x = 2 * CELL_PX; x < 10 * CELL_PX; x += 8) {
    const y = 11 * CELL_PX + 26 + Math.floor(Math.sin(x / 18) * 3)
    c.set(x, y, 0xc0b090)
    c.rect(x + 2, y + 1, 3, 4, [0x9a4048, 0x4a7a58, 0x8a7a30][Math.floor(x / 8) % 3])
  }

  writePng(c, 'fey-shadow-fair-fair.png')
}

// ═════════════════════════════════════════════════════════════════════════════
// CARTE 2 — Le Bois-Ricanant (15×13)
// ═════════════════════════════════════════════════════════════════════════════
function generateWood() {
  const COLS = 15
  const ROWS = 13
  const c = makeCanvas(COLS, ROWS)

  const ROOMS = {
    6: { minX: 1, maxX: 6, minY: 8, maxY: 11 },   // Clairière des Champignons
    7: { minX: 8, maxX: 13, minY: 7, maxY: 11 },  // Mare aux Grenouilles
    8: { minX: 1, maxX: 6, minY: 3, maxY: 6 },    // Sentier des Chiens-Clins
    9: { minX: 8, maxX: 13, minY: 1, maxY: 5 },   // Cour du Prince
  }
  const ROOM_PRIORITY = [9, 8, 7, 6]
  function roomAt(cx, cy) {
    for (const id of ROOM_PRIORITY) {
      const r = ROOMS[id]
      if (cx >= r.minX && cx <= r.maxX && cy >= r.minY && cy <= r.maxY) return id
    }
    return 0
  }

  const FOREST = 0x1e3322
  const MOSS = 0x35592f
  const WATER = 0x2a5a66
  const DIRT = 0x5f4c30
  const COURT = 0x6a5a26

  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      switch (roomAt(cx, cy)) {
        case 6: paintNoisyCell(c, cx, cy, MOSS, 12, 12); break
        case 7: {
          const base = (cx + cy) % 2 === 0 ? WATER : shade(WATER, -8)
          c.rect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX, base)
          for (let i = 0; i < 5; i++) {
            const x = cx * CELL_PX + Math.floor(rand() * (CELL_PX - 5))
            const y = cy * CELL_PX + Math.floor(rand() * CELL_PX)
            c.rect(x, y, 4, 1, shade(base, 20))
          }
          break
        }
        case 8: paintNoisyCell(c, cx, cy, DIRT, 10, 12); break
        case 9: paintNoisyCell(c, cx, cy, COURT, 12, 14); break
        default: {
          paintNoisyCell(c, cx, cy, FOREST, 8, 8)
          // Troncs d'arbres épars hors salles
          if (rand() < 0.35) {
            const x = cx * CELL_PX + 8 + Math.floor(rand() * 12)
            const y = cy * CELL_PX + 8 + Math.floor(rand() * 12)
            c.disc(x, y, 6, 0x2e4a28)
            c.disc(x, y, 3, 0x4a3423)
          }
          break
        }
      }
    }
  }

  // Chemins entre les salles
  for (const [cx, cy] of [[3, 7], [7, 9], [7, 10], [10, 6], [3, 2], [7, 4]]) {
    paintNoisyCell(c, cx, cy, shade(DIRT, -6), 8, 10)
  }

  // Clairière : champignons moqueurs (dont les deux du spawn de rencontre)
  drawMushroom(c, 2 * CELL_PX + 16, 8 * CELL_PX + 18, 0x7a4a9a, 5)
  drawMushroom(c, 5 * CELL_PX + 14, 8 * CELL_PX + 20, 0x8a3a8a, 5)
  for (const [mx, my] of [[1, 10], [4, 11], [6, 9], [2, 9]]) {
    drawMushroom(c, mx * CELL_PX + 8 + Math.floor(rand() * 14), my * CELL_PX + 12 + Math.floor(rand() * 10), 0x6a3a7a, 3)
  }

  // Mare : nénuphars dallés (piste de bal) + grand nénuphar de la Baronne (12,8)
  for (const [nx, ny] of [[8, 8], [9, 10], [10, 9], [11, 8], [11, 11], [13, 9], [9, 7], [12, 11]]) {
    c.disc(nx * CELL_PX + 16, ny * CELL_PX + 16, 9, 0x3f7a3a)
    c.set(nx * CELL_PX + 16, ny * CELL_PX + 12, 0x5a9a4a)
  }
  c.disc(12 * CELL_PX + 16, 8 * CELL_PX + 16, 13, 0x4a8a42)
  c.ring(12 * CELL_PX + 16, 8 * CELL_PX + 16, 13, 2, 0x6aba5a)
  c.disc(12 * CELL_PX + 16, 8 * CELL_PX + 16, 3, 0xd8b0d8) // coussin de la Baronne

  // Sentier : empreintes de pattes qui apparaissent/disparaissent
  for (let i = 0; i < 14; i++) {
    const x = (1 + rand() * 5) * CELL_PX + 8
    const y = (3 + rand() * 3) * CELL_PX + 8
    if (rand() < 0.6) {
      c.set(Math.floor(x), Math.floor(y), 0x3a2e1c)
      c.set(Math.floor(x) + 2, Math.floor(y) + 1, 0x3a2e1c)
      c.set(Math.floor(x) + 1, Math.floor(y) + 3, 0x3a2e1c)
    }
  }

  // Cour du Prince : trône de guingois (11,2) + rideau de feuilles dorées
  const tx = 11 * CELL_PX
  const ty = 2 * CELL_PX
  c.rect(tx + 8, ty + 10, 18, 16, 0x8a6a20)          // assise penchée
  c.rect(tx + 6, ty + 2, 6, 24, 0xa8842a)            // dossier de travers
  c.rect(tx + 22, ty + 6, 5, 20, 0x8a6a20)
  c.set(tx + 8, ty + 1, 0xe8c04a)                    // pompon
  // Feuilles dorées en bordure nord de la cour
  for (let x = 8 * CELL_PX; x < 14 * CELL_PX; x += 5) {
    const y = 1 * CELL_PX + 2 + Math.floor(rand() * 8)
    c.rect(x, y, 3, 2, rand() < 0.5 ? 0xd8b02a : 0xb8922a)
  }
  // Sacoche de Filou (9,2) : l'ombre qui dépasse
  c.rect(9 * CELL_PX + 10, 2 * CELL_PX + 16, 12, 9, 0x6a4a2a)
  c.rect(9 * CELL_PX + 13, 2 * CELL_PX + 8, 6, 8, 0x101018)   // l'ombre !
  c.set(9 * CELL_PX + 12, 2 * CELL_PX + 6, 0x101018)          // petite main qui dépasse

  // Lucioles ambiantes du bois
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rand() * c.width)
    const y = Math.floor(rand() * c.height)
    if (rand() < 0.5) c.set(x, y, 0x9ad05a)
  }

  writePng(c, 'fey-shadow-fair-wood.png')
}

generateFair()
generateWood()
