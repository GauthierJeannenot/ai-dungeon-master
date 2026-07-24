// Carte de la scène (lib/dm/scene-map.ts) : générée depuis l'état du jeu et
// injectée dans le bloc DYNAMIQUE du prompt DM. En exploration : zones des
// salles + adjacences précalculées + positions (pas de grille dessinée). En
// combat : la grille ASCII tactique s'ajoute. Vérifie aussi que les PNJ cachés
// ou d'une autre map et les monstres morts restent hors de la carte.

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')

process.env.APP_LOG_BUFFER_ENABLED = 'false'
process.env.APP_LOG_LEVEL = 'error'
process.env.APP_LOG_PERSIST_ENABLED = 'false'
process.env.MONETIZATION_ENABLED = 'false'

const restoreTsRequire = installTsRequireWithAliases()
const { renderSceneMap } = require(path.join(process.cwd(), 'lib/dm/scene-map.ts'))
const { buildDynamicPrompt } = require(path.join(process.cwd(), 'lib/dm/prompts.ts'))
const { buildInitialGameState } = require(path.join(process.cwd(), 'lib/initial-game-state.ts'))
const { getAdventureMap, firstMapId, getMapSpec } = require(path.join(process.cwd(), 'lib/adventure-map.ts'))

test.after(() => {
  restoreTsRequire()
})

// Extrait les lignes de la grille (entre les fences ```) et rend l'accès par
// cellule : le glyphe de la cellule (x, y) est à l'index 4 + 3x de la ligne y.
function parseGrid(rendered) {
  const lines = rendered.split('\n')
  const open = lines.indexOf('```')
  const close = lines.indexOf('```', open + 1)
  assert.ok(open >= 0 && close > open, 'la carte doit contenir un bloc fencé')
  const rows = lines.slice(open + 2, close) // +2 : saute l'en-tête de colonnes
  return {
    rows,
    glyphAt: (x, y) => rows[y].charAt(4 + 3 * x),
  }
}

test('exploration : zones, entrées et adjacences précalculées, sans grille dessinée', () => {
  const state = buildInitialGameState()
  const rendered = renderSceneMap(state)
  const defaultMap = firstMapId(state.adventureId)
  const mapData = getAdventureMap(state.adventureId)

  assert.ok(!rendered.includes('```'), 'pas de grille dessinée hors combat')
  assert.match(rendered, /salle ACTUELLE/, 'la salle courante doit être signalée')
  for (const room of mapData.rooms) {
    if ((room.mapId ?? defaultMap) !== defaultMap) continue
    assert.ok(rendered.includes(`Salle ${room.id} : ${room.name} (x ${room.zone.minX}-${room.zone.maxX}, y ${room.zone.minY}-${room.zone.maxY})`),
      `zone de « ${room.name} » absente`)
    const entry = mapData.entryCells[room.id]
    if (entry) {
      assert.ok(rendered.includes(`entrée (${entry.x}, ${entry.y})`), `entrée de la salle ${room.id} absente`)
    }
  }
  // Adjacence connue du module par défaut : Quai de chargement (7, x3-5 y5-7)
  // borde le Sol de la boulangerie (8, x6-11 y5-8) à l'est.
  assert.match(rendered, /Salle 7 : [^\n]*borde : [^\n]*8 \(est\)/)
  assert.match(rendered, /Salle 8 : [^\n]*borde : [^\n]*7 \(ouest\)/)
  assert.ok(rendered.includes(`LE JOUEUR, en (${state.player.position.x}, ${state.player.position.y})`))
})

test('PNJ révélés listés avec leurs coordonnées, PNJ cachés absents', () => {
  const state = buildInitialGameState()
  const npcs = Object.values(state.npcs ?? {})
  const visible = npcs.filter(npc => npc.visible)
  const hidden = npcs.filter(npc => !npc.visible)
  assert.ok(visible.length > 0, 'le module par défaut doit avoir au moins un PNJ visible')
  assert.ok(hidden.length > 0, 'le module par défaut doit avoir au moins un PNJ caché')

  const rendered = renderSceneMap(state)
  for (const npc of visible) {
    assert.ok(rendered.includes(`${npc.name} (${npc.kind}, ${npc.disposition}) en (${npc.position.x}, ${npc.position.y})`),
      `PNJ visible « ${npc.name} » absent`)
  }
  for (const npc of hidden) {
    assert.ok(!rendered.includes(`${npc.name} (`), `PNJ caché « ${npc.name} » ne doit pas figurer sur la carte`)
  }
})

test('combat : grille tactique dessinée, joueur et monstres vivants placés, morts absents', () => {
  const state = buildInitialGameState()
  state.phase = 'combat'
  state.monsters = {
    m1: { id: 'm1', name: 'Créature A', type: 'goblin', hp: { current: 5, max: 7 }, ac: 13, stats: {}, position: { x: 1, y: 0 }, conditions: [], xpValue: 50, attackBonus: 4, damageDice: '1d6', speed: 30, isAlive: true },
    m2: { id: 'm2', name: 'Créature B', type: 'goblin', hp: { current: 0, max: 7 }, ac: 13, stats: {}, position: { x: 2, y: 0 }, conditions: [], xpValue: 50, attackBonus: 4, damageDice: '1d6', speed: 30, isAlive: false },
  }
  const rendered = renderSceneMap(state)
  const { rows } = getMapSpec(undefined, state.adventureId).grid
  const grid = parseGrid(rendered)

  assert.equal(grid.rows.length, rows, `la grille doit avoir ${rows} rangées`)
  assert.equal(grid.glyphAt(state.player.position.x, state.player.position.y), '@',
    'le joueur doit apparaître à sa position')
  assert.equal(grid.glyphAt(1, 0), 'M', 'le monstre vivant doit apparaître en (1, 0)')
  assert.notEqual(grid.glyphAt(2, 0), 'M', 'le monstre mort ne doit pas apparaître')
  assert.ok(rendered.includes('Créature A en (1, 0)'))
  assert.ok(!rendered.includes('Créature B'))
})

test('multi-map : la carte suit currentMapId et exclut les salles des autres maps', () => {
  const state = buildInitialGameState('fey-shadow-fair')
  const mapData = getAdventureMap('fey-shadow-fair')
  assert.ok(mapData.maps.length > 1, 'fey-shadow-fair doit être multi-map')
  const secondMap = mapData.maps[1]

  state.currentMapId = secondMap.id
  state.player.position = { x: 0, y: 0 }
  const rendered = renderSceneMap(state)
  assert.match(rendered, new RegExp(`grille ${secondMap.grid.cols}×${secondMap.grid.rows}`))

  const defaultMap = firstMapId('fey-shadow-fair')
  for (const room of mapData.rooms) {
    const onSecond = (room.mapId ?? defaultMap) === secondMap.id
    assert.equal(rendered.includes(room.name), onSecond,
      `salle « ${room.name} » ${onSecond ? 'attendue' : 'interdite'} sur la carte de ${secondMap.id}`)
  }
  // Le Bois-Ricanant se remonte sud → nord : la salle 11 borde la 10 au nord.
  assert.match(rendered, /Salle 10 : [^\n]*borde : [^\n]*B \(nord\)/)
})

test('le bloc dynamique du prompt DM contient la carte de la scène', () => {
  const state = buildInitialGameState()
  const prompt = buildDynamicPrompt(state)
  assert.match(prompt, /## CARTE DE LA SCÈNE/)
  assert.match(prompt, /Salles de la carte \(zones et adjacences\)/)
  assert.ok(prompt.includes('LE JOUEUR'), 'les positions doivent être injectées')
})
