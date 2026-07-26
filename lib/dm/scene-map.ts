import type { GameState } from '@/lib/types'
import type { AdventureRoom } from '@/lib/adventure-map'
import { firstMapId, getAdventureMap, getMapSpec } from '@/lib/adventure-map'

// ─────────────────────────────────────────────────────────────────────────────
// Carte de la scène, générée depuis l'état du jeu à chaque tour — une seule
// source de vérité (map.ts du module + GameState), injectée dans le bloc
// DYNAMIQUE du prompt DM (lib/dm/prompts.ts).
//
// Deux niveaux de détail selon la phase :
// - TOUJOURS : zones des salles de la map courante + graphe d'adjacence
//   précalculé (quelle salle borde quelle salle, dans quelle direction),
//   scindé en « communique avec » (contiguïté FRANCHISSABLE) et « contiguë
//   mais cloisonnée » (contiguïté séparée par un mur, déclarée dans
//   map.ts.partitions), points d'entrée, positions du joueur, des PNJ révélés
//   et des monstres vivants. C'est ce qui porte la narration spatiale.
// - COMBAT uniquement : en plus, la grille ASCII dessinée, pour la géométrie
//   fine (contact, distances en cases). Hors combat elle coûterait des tokens
//   à chaque appel pour un signal déjà couvert par zones + adjacence.
//
// Jamais dans le bloc statique : le cache Anthropic exige un préfixe
// byte-identique d'un appel à l'autre.
// ─────────────────────────────────────────────────────────────────────────────

type Zone = AdventureRoom['zone']

// Symbole d'une salle sur la grille : '1'-'9' puis 'A'-'Z' (salle 10 = 'A'),
// en cohérence avec la numérotation globale continue des modules multi-maps.
function roomSymbol(roomId: string): string {
  const n = Number.parseInt(roomId, 10)
  if (Number.isInteger(n) && n >= 1 && n <= 9) return String(n)
  if (Number.isInteger(n) && n >= 10 && n <= 35) return String.fromCharCode(65 + n - 10)
  return roomId.charAt(0).toUpperCase() || '?'
}

// Deux zones sont adjacentes si elles se chevauchent ou se touchent par un
// bord (aucune case d'écart) — jamais par un simple coin.
function zonesTouch(a: Zone, b: Zone): boolean {
  const xOverlap = a.minX <= b.maxX && b.minX <= a.maxX
  const yOverlap = a.minY <= b.maxY && b.minY <= a.maxY
  if (xOverlap && yOverlap) return true
  const xTouch = a.maxX + 1 === b.minX || b.maxX + 1 === a.minX
  const yTouch = a.maxY + 1 === b.minY || b.maxY + 1 === a.minY
  return (xTouch && yOverlap) || (yTouch && xOverlap)
}

// Direction de la salle `to` vue depuis `from` (nord = y décroissant), à
// partir des centres de zones. Composante retenue si l'écart est net (≥ 2
// cases) ; aucune composante nette = simple « adjacente » (chevauchement).
function directionLabel(from: Zone, to: Zone): string {
  const dx = (to.minX + to.maxX) / 2 - (from.minX + from.maxX) / 2
  const dy = (to.minY + to.maxY) / 2 - (from.minY + from.maxY) / 2
  const parts: string[] = []
  if (dy <= -2) parts.push('nord')
  else if (dy >= 2) parts.push('sud')
  if (dx >= 2) parts.push('est')
  else if (dx <= -2) parts.push('ouest')
  return parts.length > 0 ? parts.join('-') : 'adjacente'
}

export function renderSceneMap(gameState: GameState): string {
  const adventureId = gameState.adventureId
  const mapData = getAdventureMap(adventureId)
  const currentMap = getMapSpec(gameState.currentMapId, adventureId)
  const { cols, rows } = currentMap.grid
  const defaultMapId = firstMapId(adventureId)
  const onCurrentMap = (mapId?: string) => (mapId ?? defaultMapId) === currentMap.id
  const inBounds = (x: number, y: number) => x >= 0 && x < cols && y >= 0 && y < rows
  const inCombat = gameState.phase === 'combat'

  const mapRooms = mapData.rooms.filter(room => onCurrentMap(room.mapId))

  // ── Cloisons : paires de salles contiguës qui NE communiquent PAS (déclarées
  // dans map.ts). Clé normalisée (ordre des deux salles indifférent) pour un
  // test symétrique. Toute contiguïté ABSENTE de cet ensemble est franchissable.
  const partitionKey = (a: string, b: string) => [a, b].sort().join('|')
  const partitions = new Set((mapData.partitions ?? []).map(([a, b]) => partitionKey(a, b)))

  // ── Salles : zone, entrée, statut, contiguïtés (communicantes vs cloisonnées)
  const roomLines = mapRooms.map(room => {
    const symbol = roomSymbol(room.id)
    const entry = mapData.entryCells[room.id]
    const status = gameState.currentRoomId === room.id
      ? ' — salle ACTUELLE'
      : gameState.roomsVisited.includes(room.id) ? ' — visitée' : ''
    const neighbors = mapRooms.filter(other =>
      other.id !== room.id && zonesTouch(room.zone, other.zone))
    const label = (other: AdventureRoom) =>
      `${roomSymbol(other.id)} (${directionLabel(room.zone, other.zone)})`
    const communicating = neighbors
      .filter(other => !partitions.has(partitionKey(room.id, other.id))).map(label)
    const walled = neighbors
      .filter(other => partitions.has(partitionKey(room.id, other.id))).map(label)
    const parts = [
      `${symbol} = Salle ${room.id} : ${room.name} (x ${room.zone.minX}-${room.zone.maxX}, y ${room.zone.minY}-${room.zone.maxY})`,
      entry ? `entrée (${entry.x}, ${entry.y})` : '',
      communicating.length > 0 ? `communique avec : ${communicating.join(', ')}` : '',
      walled.length > 0 ? `contiguë mais cloisonnée (mur, pas de passage direct) : ${walled.join(', ')}` : '',
    ].filter(Boolean)
    return parts.join(' — ') + status
  })

  // ── Positions vivantes : joueur, PNJ révélés, monstres vivants ────────────
  const player = gameState.player.position
  const visibleNpcs = Object.values(gameState.npcs ?? {})
    .filter(npc => npc.visible && onCurrentMap(npc.mapId))
  const aliveMonsters = Object.values(gameState.monsters).filter(monster => monster.isAlive)

  const positionLines = [
    `${inCombat ? '@ = ' : '- '}LE JOUEUR, en (${player.x}, ${player.y})`,
    ...visibleNpcs.map((npc, index) => {
      const symbol = index < 26 ? String.fromCharCode(97 + index) : '?'
      return `${inCombat ? `${symbol} = ` : '- '}${npc.name} (${npc.kind}, ${npc.disposition}) en (${npc.position.x}, ${npc.position.y})`
    }),
    ...aliveMonsters.map(monster =>
      `${inCombat ? 'M = ' : '- '}${monster.name} en (${monster.position.x}, ${monster.position.y})`),
  ]

  // ── Grille dessinée (combat uniquement) ───────────────────────────────────
  let gridSection: string[] = []
  if (inCombat) {
    const grid: string[][] = Array.from({ length: rows }, () => Array<string>(cols).fill('.'))
    for (const room of mapRooms) {
      const symbol = roomSymbol(room.id)
      for (let y = room.zone.minY; y <= room.zone.maxY; y++) {
        for (let x = room.zone.minX; x <= room.zone.maxX; x++) {
          if (inBounds(x, y)) grid[y][x] = symbol
        }
      }
    }
    for (const [roomId, cell] of Object.entries(mapData.entryCells)) {
      const room = mapRooms.find(candidate => candidate.id === roomId)
      if (room && inBounds(cell.x, cell.y)) grid[cell.y][cell.x] = '+'
    }
    visibleNpcs.forEach((npc, index) => {
      const symbol = index < 26 ? String.fromCharCode(97 + index) : '?'
      if (inBounds(npc.position.x, npc.position.y)) grid[npc.position.y][npc.position.x] = symbol
    })
    for (const monster of aliveMonsters) {
      if (inBounds(monster.position.x, monster.position.y)) {
        grid[monster.position.y][monster.position.x] = 'M'
      }
    }
    if (inBounds(player.x, player.y)) grid[player.y][player.x] = '@'

    // En-tête de colonnes + une ligne par rangée, cellules alignées sur 3
    // caractères (le glyphe de la cellule x est à l'index 4 + 3x de sa ligne).
    const header = '   ' + Array.from({ length: cols }, (_, x) => String(x).padStart(2)).join(' ')
    gridSection = [
      'Grille tactique (1 case = 5 pieds ; + = point d’entrée de salle, . = hors salle) :',
      '```',
      header,
      ...grid.map((row, y) => String(y).padStart(2) + '  ' + row.join('  ')),
      '```',
    ]
  }

  return [
    `Carte « ${currentMap.name} » — grille ${cols}×${rows}, coordonnées (x, y) : x = colonne (0-${cols - 1}), y = rangée (0-${rows - 1}), nord = y décroissant.`,
    ...gridSection,
    'Salles de la carte (zones, communications et cloisons) :',
    ...roomLines,
    'Positions :',
    ...positionLines,
    'Cette carte reflète l’état RÉEL du moteur à ce tour : appuie-toi dessus pour situer la scène, estimer les distances et choisir les coordonnées exactes de `move_token` (les « entrée (x, y) » ci-dessus sont les cibles sûres). « communique avec » = salles accessibles directement depuis celle-ci ; « contiguë mais cloisonnée » = salle voisine sur la grille mais séparée par un mur — n’y fais pas passer le joueur directement, il faut contourner.',
  ].join('\n')
}
