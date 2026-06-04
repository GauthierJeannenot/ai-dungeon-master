export interface GridCell {
  x: number
  y: number
}

export interface AdventureRoom {
  id: string
  name: string
  zone: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
}

export interface EncounterMonsterSpec {
  monsterType: string
  cell: GridCell
  name?: string
  hpOverride?: number
}

export interface EncounterDefinition {
  id: string
  roomId: string
  name: string
  playerCell?: GridCell
  monsters: EncounterMonsterSpec[]
}

export interface AdventureTransition {
  fromRoomId: string
  toRoomId: string
  pattern?: RegExp
}

export const ADVENTURE_ROOMS: AdventureRoom[] = [
  { id: '1', name: 'Entrée extérieure', zone: { minX: 3, maxX: 16, minY: 13, maxY: 14 } },
  { id: '2', name: 'Verger de pommiers', zone: { minX: 3, maxX: 15, minY: 1, maxY: 2 } },
  { id: '3', name: 'Tas de déchets', zone: { minX: 12, maxX: 13, minY: 5, maxY: 7 } },
  { id: '4', name: "L'entrée", zone: { minX: 10, maxX: 13, minY: 9, maxY: 12 } },
  { id: '5', name: 'Le Bureau', zone: { minX: 5, maxX: 6, minY: 8, maxY: 11 } },
  { id: '7', name: 'Quai de chargement', zone: { minX: 3, maxX: 5, minY: 5, maxY: 7 } },
  { id: '8', name: 'Sol de la boulangerie', zone: { minX: 6, maxX: 11, minY: 5, maxY: 8 } },
  { id: '9', name: "Appartement de Grammy", zone: { minX: 7, maxX: 9, minY: 8, maxY: 11 } },
]

export const ENCOUNTERS: Record<string, EncounterDefinition> = {
  loading_dock_patrol: {
    id: 'loading_dock_patrol',
    roomId: '7',
    name: 'Patrouille du quai de chargement',
    playerCell: { x: 4, y: 6 },
    monsters: [
      { monsterType: 'goblin', cell: { x: 5, y: 5 }, name: 'Gobelin Patrouille' },
      { monsterType: 'goblin', cell: { x: 5, y: 6 }, name: 'Gobelin Patrouille' },
    ],
  },
  bakery_floor_goblins: {
    id: 'bakery_floor_goblins',
    roomId: '8',
    name: 'Gobelin Charpentier',
    playerCell: { x: 9, y: 6 },
    monsters: [
      { monsterType: 'goblin_minion', cell: { x: 10, y: 5 }, name: 'Gobelin Charpentier' },
      { monsterType: 'goblin_minion', cell: { x: 10, y: 8 }, name: 'Gobelin Charpentier' },
      { monsterType: 'goblin_minion', cell: { x: 7, y: 7 }, name: 'Gobelin Charpentier' },
    ],
  },
  grammy_apartment_guards: {
    id: 'grammy_apartment_guards',
    roomId: '9',
    name: 'Gardes de Chef Grukk',
    playerCell: { x: 8, y: 9 },
    monsters: [
      { monsterType: 'goblin', cell: { x: 9, y: 11 }, name: 'Gobelin Garde' },
      { monsterType: 'goblin', cell: { x: 9, y: 10 }, name: 'Gobelin Garde' },
      { monsterType: 'hobgoblin', cell: { x: 7, y: 11 }, name: 'Chef Grukk', hpOverride: 18 },
    ],
  },
  violet_fungus_heap: {
    id: 'violet_fungus_heap',
    roomId: '3',
    name: 'Champignon Violet',
    playerCell: { x: 12, y: 6 },
    monsters: [
      { monsterType: 'violet_fungus', cell: { x: 13, y: 6 }, name: 'Champignon Violet' },
    ],
  },
}

export const NAMED_LOCATION_CELLS: Array<{ id: string; pattern: RegExp; cell: GridCell }> = [
  { id: 'mac', pattern: /\b(mac|treant|grand pommier|pommier anime|pommier eveille)\b/, cell: { x: 7, y: 13 } },
]

export const ROOM_NAVIGATION_ALIASES: Array<{ roomId: string; pattern: RegExp }> = [
  { roomId: '5', pattern: /\b(bureau|bureau de grammy)\b/ },
  { roomId: '9', pattern: /\b(appartement|appartement de grammy|etage|a l etage|en haut|escalier)\b/ },
  { roomId: '8', pattern: /\b(sol de la boulangerie|boulangerie|four|cuisine)\b/ },
  { roomId: '7', pattern: /\b(quai|chargement|dock)\b/ },
  { roomId: '2', pattern: /\b(verger|pommiers?|pommier|arbres?|dryades?)\b/ },
  { roomId: '3', pattern: /\b(dechets?|tas|champignons?|fungus)\b/ },
  { roomId: '4', pattern: /\b(entree|hall)\b/ },
  { roomId: '1', pattern: /\b(exterieur|dehors|sortie)\b/ },
]

export const ROOM_CONTEXT_ALIASES: Array<{ roomId: string; pattern: RegExp }> = [
  { roomId: '8', pattern: /\b(porte des reserves?|reserves?|sol(?: de la)? boulangerie|fours?|fournee|plans de travail)\b/ },
  { roomId: '9', pattern: /\b(appartement(?: de grammy)?|grammy|chef grukk|grukk)\b/ },
  { roomId: '7', pattern: /\b(quai de chargement|quai|chargement|porte laterale)\b/ },
  { roomId: '5', pattern: /\b(bureau|paperasse|registres?|classeurs?)\b/ },
  { roomId: '3', pattern: /\b(tas de dechets?|dechets?|champignons? violets?)\b/ },
  { roomId: '2', pattern: /\b(verger|pommiers?|pommier|dryades?)\b/ },
]

export const DOOR_TRANSITIONS: AdventureTransition[] = [
  { fromRoomId: '1', toRoomId: '4' },
  { fromRoomId: '7', toRoomId: '8' },
  { fromRoomId: '4', toRoomId: '9', pattern: /\b(appartement|grammy|gauche|etage|haut|escalier)\b/ },
  { fromRoomId: '4', toRoomId: '1', pattern: /\b(dehors|exterieur|sortie|arriere|retour)\b/ },
  { fromRoomId: '4', toRoomId: '8' },
  { fromRoomId: '8', toRoomId: '9', pattern: /\b(appartement|grammy|etage|haut|escalier)\b/ },
  { fromRoomId: '8', toRoomId: '5', pattern: /\b(bureau|paperasse|registres?)\b/ },
  { fromRoomId: '8', toRoomId: '7', pattern: /\b(quai|chargement|laterale|dock)\b/ },
]

export const FORWARD_TRANSITIONS: AdventureTransition[] = [
  { fromRoomId: '1', toRoomId: '4' },
  { fromRoomId: '4', toRoomId: '8' },
  { fromRoomId: '7', toRoomId: '8' },
  { fromRoomId: '8', toRoomId: '9' },
]

export function inferAdventureRoomId(cell: GridCell): string | null {
  return ADVENTURE_ROOMS.find(room =>
    cell.x >= room.zone.minX &&
    cell.x <= room.zone.maxX &&
    cell.y >= room.zone.minY &&
    cell.y <= room.zone.maxY
  )?.id ?? null
}

export function getAdventureRoom(roomId: string | null | undefined): AdventureRoom | null {
  if (!roomId) return null
  return ADVENTURE_ROOMS.find(room => room.id === roomId) ?? null
}

export function getEncounter(encounterId: string): EncounterDefinition | null {
  return ENCOUNTERS[encounterId] ?? null
}

export function centerCellForAdventureRoom(roomId: string): GridCell | null {
  const room = getAdventureRoom(roomId)
  if (!room) return null

  return {
    x: Math.round((room.zone.minX + room.zone.maxX) / 2),
    y: Math.round((room.zone.minY + room.zone.maxY) / 2),
  }
}

export function encounterIdForAdventureRoom(roomId: string | null | undefined): string | null {
  if (!roomId) return null
  return Object.values(ENCOUNTERS).find(encounter => encounter.roomId === roomId)?.id ?? null
}

export function findNamedAdventureLocationCell(text: string): GridCell | null {
  return NAMED_LOCATION_CELLS.find(location => location.pattern.test(text))?.cell ?? null
}

export function findAdventureRoomIdByAlias(text: string): string | null {
  return ROOM_NAVIGATION_ALIASES.find(alias => alias.pattern.test(text))?.roomId ?? null
}

export function findAdventureRoomIdByContextAlias(text: string, currentRoomId: string | null | undefined): string | null {
  const matchedRoomIds = ROOM_CONTEXT_ALIASES
    .filter(alias => alias.roomId !== currentRoomId && alias.pattern.test(text))
    .map(alias => alias.roomId)

  return matchedRoomIds.length === 1 ? matchedRoomIds[0] : null
}

export function relativeAdventureRoomIdForText(
  text: string,
  currentRoomId: string | null | undefined,
  options: { doorAction: boolean; forwardAction: boolean }
): string | null {
  if (!currentRoomId) return null

  if (options.doorAction) {
    const transitions = DOOR_TRANSITIONS.filter(transition => transition.fromRoomId === currentRoomId)
    const specific = transitions.find(transition => transition.pattern?.test(text))
    if (specific) return specific.toRoomId

    const fallback = transitions.find(transition => !transition.pattern)
    if (fallback) return fallback.toRoomId
  }

  if (options.forwardAction) {
    return FORWARD_TRANSITIONS.find(transition => transition.fromRoomId === currentRoomId)?.toRoomId ?? null
  }

  return null
}
