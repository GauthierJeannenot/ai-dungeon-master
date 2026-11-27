import type { GameState } from '@/lib/types'
import type { AdventureRoom } from '@/lib/adventure-map'
import { firstMapId, getAdventureMap, getMapSpec, getNavigationMode, roomContainsCell } from '@/lib/adventure-map'
import { navigationGrid, findNavigationPath, navigationPathCost, geometricDistanceCells, savedDoorState } from '@/lib/navigation'
import { geometryAscii } from '@/lib/battlemap-geometry'
import { activeMapTerrain, completedRoundEvents } from '@/lib/combat-round-events'
import { playerKnowsDoor,playerDoorGeometry,confidentialHiddenDoorContext } from '@/lib/door-discovery'
import { localLivingMonsters, localNpcs } from './local-creatures'

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
// Jamais dans le bloc statique : conserver un préfixe
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
  const mapData = getAdventureMap(gameState)
  const currentMap = getMapSpec(gameState.currentMapId, gameState)
  const { cols, rows } = currentMap.grid
  const defaultMapId = firstMapId(gameState)
  const onCurrentMap = (mapId?: string) => (mapId ?? defaultMapId) === currentMap.id
  const inBounds = (x: number, y: number) => x >= 0 && x < cols && y >= 0 && y < rows
  const inCombat = gameState.phase === 'combat'
  const explorationOverview = getNavigationMode(gameState) === 'exploration'

  const mapRooms = mapData.rooms.filter(room => onCurrentMap(room.mapId))
  const circulation = navigationGrid(gameState, 'player', currentMap.geometry)
  const directConnection = (a: AdventureRoom, b: AdventureRoom) => {
    for (let y = a.zone.minY; y <= a.zone.maxY; y++) for (let x = a.zone.minX; x <= a.zone.maxX; x++) {
      const c = { x, y }
      if (circulation.roomAt(c) !== a.id) continue
      if (circulation.neighbors(c).some(n => circulation.roomAt(n) === b.id && circulation.step(c, n, true, false))) return true
    }
    return false
  }

  // ── Cloisons : paires de salles contiguës qui NE communiquent PAS (déclarées
  // dans map.ts). Clé normalisée (ordre des deux salles indifférent) pour un
  // test symétrique. Toute contiguïté ABSENTE de cet ensemble est franchissable.

  // ── Salles : zone, entrée, statut, contiguïtés (communicantes vs cloisonnées)
  const roomLines = mapRooms.map(room => {
    const symbol = roomSymbol(room.id)
    const entry = mapData.entryCells[room.id]
    const status = gameState.currentRoomId === room.id
      ? ' — salle ACTUELLE'
      : gameState.roomsVisited.includes(room.id) ? ' — visitée' : ''
    const neighbors = explorationOverview ? [] : mapRooms.filter(other =>
      other.id !== room.id && zonesTouch(room.zone, other.zone))
    const label = (other: AdventureRoom) =>
      `${roomSymbol(other.id)} (${directionLabel(room.zone, other.zone)})`
    const communicating = neighbors
      .filter(other => directConnection(room, other)).map(label)
    const walled = neighbors
      .filter(other => !directConnection(room, other)).map(label)
    const parts = [
      `${symbol} = Salle ${room.id} : ${room.name} (x ${room.zone.minX}-${room.zone.maxX}, y ${room.zone.minY}-${room.zone.maxY})`,
      room.areas ? `emprise exacte ${room.areas.map(a => `x ${a.minX}-${a.maxX}, y ${a.minY}-${a.maxY}`).join(' + ')}` : '',
      entry ? `entrée (${entry.x}, ${entry.y})` : '',
      `but explicite move_token({tokenId:"player",roomId:${JSON.stringify(room.id)}})`,
      room.navigationEvent ? `décision avant entrée : ${room.navigationEvent.id} (${room.navigationEvent.label})` : '',
      communicating.length > 0 ? `communique avec : ${communicating.join(', ')}` : '',
      walled.length > 0 ? `contiguë mais cloisonnée (mur, pas de passage direct) : ${walled.join(', ')}` : '',
    ].filter(Boolean)
    return parts.join(' — ') + status
  })

  // ── Positions vivantes : joueur, PNJ révélés, monstres vivants ────────────
  const player = gameState.player.position
  const visibleNpcs = localNpcs(gameState).filter(npc => npc.visible)
  const aliveMonsters = localLivingMonsters(gameState)

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
          if (inBounds(x, y) && roomContainsCell(room, { x, y })) grid[y][x] = symbol
        }
      }
    }
    for (const [roomId, cell] of Object.entries(mapData.entryCells)) {
      const room = mapRooms.find(candidate => candidate.id === roomId)
      if (room && inBounds(cell.x, cell.y)) grid[cell.y][cell.x] = '+'
    }
    for (const feature of activeMapTerrain(gameState)) for (const cell of feature.cells) {
      if (inBounds(cell.x, cell.y)) grid[cell.y][cell.x] = feature.kind === 'blocked' ? '#' : '~'
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
      'Grille tactique (1 case = 5 pieds ; + = point d’entrée de salle, . = hors salle ; # = obstacle infranchissable, ~ = terrain difficile coût ×2) :',
      '```',
      header,
      ...grid.map((row, y) => String(y).padStart(2) + '  ' + row.join('  ')),
      '```',
    ]
  }

  return [
    `Carte « ${currentMap.name} » — grille ${cols}×${rows}, coordonnées (x, y) : x = colonne (0-${cols - 1}), y = rangée (0-${rows - 1}), nord = y décroissant.`,
    explorationOverview
      ? `Carte d’exploration : ${currentMap.explorationRoomIds ? 'les lieux extérieurs' : 'tous les lieux de cette map'} peuvent être demandés directement par roomId, même non contigus. Ne demande pas de déplacement intermédiaire entre zones ; le moteur calcule le trajet. Une porte fermée ou une décision peut arrêter ce trajet et exige une action explicite distincte. L’illustration ne fixe pas les distances tactiques.${currentMap.explorationRoomIds ? ' Les intérieurs utilisent la navigation tactique dès le seuil franchi ; ressortir rétablit l’exploration.' : ''}`
      : 'Carte tactique : déplacements selon la géométrie, les passages et les portes ; en combat, respecter le budget de mouvement.',
    ...gridSection,
    ...activeMapTerrain(gameState).map(feature => `${feature.label} : ${feature.kind === 'blocked' ? 'infranchissable' : 'terrain difficile, coût de déplacement ×2'} ; cases ${feature.cells.map(c => `(${c.x},${c.y})`).join(', ')}.`),
    ...(currentMap.roundEvents ?? []).map(event => completedRoundEvents(gameState)[event.id]?.mechanicalSummary
      ?? `Événement mécanique prévu : ${event.name}, à la fin du round ${event.afterRound} en salle ${event.roomId}. Trajet ${event.path.map(c => `(${c.x},${c.y})`).join(' → ')} ; ${event.damageDice} contondants et à terre pour chaque créature sur le trajet. Ne pas le résoudre par des outils supplémentaires : le moteur applique cet effet à la transition de round.`),
    ...(inCombat && currentMap.geometry ? ['Circulation extraite (D = seuil connu, voir état des portes ci-dessous) :', '```', geometryAscii(playerDoorGeometry(gameState,currentMap.geometry)), '```'] : []),
    explorationOverview ? 'Lieux de la carte d’exploration (destinations au choix, sans condition de contiguïté) :' : 'Salles de la carte (zones, communications et cloisons) :',
    ...roomLines,
    ...((mapData.doors ?? []).filter(door => playerKnowsDoor(gameState,door.id)&&door.sides.some(side => mapRooms.some(r => r.id === side.roomId))).map(door => {
      const side = door.sides.find(side => side.roomId === gameState.currentRoomId) ?? door.sides[0]
      const other = door.sides.find(candidate => candidate !== side)!
      return `${door.opening ? 'Passage vide sans porte' : 'Porte'} ${door.id} (${door.name}), ${side.direction} : approche côté salle ${side.roomId} = (${side.cell.x},${side.cell.y}), traversée vers salle ${other.roomId} = (${other.cell.x},${other.cell.y}), état = ${savedDoorState(gameState, door.id)}.${door.opening ? ' Toujours ouvert : traverser avec move_token, aucune ouverture/fermeture ni forçage.' : ''}`
    })),
    'Positions :',
    ...positionLines,
    `Géométrie : ${currentMap.geometry ? currentMap.geometry.review : 'legacy_unverified (murs de l’illustration non validés)'}. Une connexion topologique ne garantit pas un passage actuellement praticable.`,
    'Aides de navigation depuis la position courante (cases de 5 pieds, diagonale = 1 ; ces buts ne limitent pas les actions de jeu de rôle) :',
    ...mapRooms.map(room => {
      const entry = mapData.entryCells[room.id]
      try {
        const path = findNavigationPath(gameState, 'player', { kind: 'room', roomId: room.id }, { geometry: currentMap.geometry })
        const costCells = navigationPathCost(gameState, path)
        const budget = inCombat ? Math.max(0, Math.floor(gameState.player.speed / 5) - (gameState.movementUsed.player ?? 0)) : null
        return JSON.stringify({ roomId: room.id, name: room.name, geometricDistanceCells: entry ? geometricDistanceCells(player, entry) : null,
          pathExistsNow: true, pathCostCells: costCells, remainingBudgetCells: budget, withinMovementBudget: budget === null || costCells <= budget })
      } catch { return JSON.stringify({ roomId: room.id, name: room.name, pathExistsNow: false, pathCostCells: null, withinMovementBudget: false }) }
    }),
    'Choisis explicitement le roomId correspondant au lieu nommé. Ne calcule ni trajet intermédiaire ni distance de parcours : preview_navigation et move_token les calculent et revalident. Les états frais des tool_result priment sur cet aperçu initial. Aucun changement de map par un trajet ; utilise une transition explicite.',
  ].join('\n')+confidentialHiddenDoorContext(gameState)
}
