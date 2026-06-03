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
