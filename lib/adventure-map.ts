import type { NpcState, WorldNpcDisposition, PlayerState } from './types'
import { GRAMMYS_MAP, GRAMMYS_ID } from '../adventures/grammys-country-apple-pie/map'
import { TIDE_CRYPT_MAP, TIDE_CRYPT_ID } from '../adventures/tide-crypt/map'

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

export interface AdventureNpcSpec {
  id: string
  name: string
  kind: string
  roomId: string | null
  cell: GridCell
  disposition: WorldNpcDisposition
  visibleFromStart: boolean
  description?: string
}

// Toutes les données de carte d'un module. Chaque module en exporte une instance
// (adventures/<id>/map.ts) ; le registre ci-dessous les agrège par adventureId.
export interface AdventureMapData {
  // État initial du joueur pour ce module (fusionné sur le gabarit par défaut du
  // moteur à la création d'une partie — voir mcp-server/game-state.ts, étape 3).
  startCell: GridCell
  initialPlayer: Pick<PlayerState, 'level' | 'hp' | 'inventory'>
  rooms: AdventureRoom[]
  entryCells: Record<string, GridCell>
  encounters: Record<string, EncounterDefinition>
  npcs: AdventureNpcSpec[]
  namedLocationCells: Array<{ id: string; pattern: RegExp; cell: GridCell }>
  roomNavigationAliases: Array<{ roomId: string; pattern: RegExp }>
  roomContextAliases: Array<{ roomId: string; pattern: RegExp }>
  doorTransitions: AdventureTransition[]
  forwardTransitions: AdventureTransition[]
  roomHooks: Record<string, string>
}

// ── Registre des cartes de module ────────────────────────────────────────────
// Couche « données », importable à la fois par l'app Next et par le serveur MCP
// (mcp-server compile lib/adventure-map.ts + adventures/**). La couche « module
// complet » (welcome, fiche joueur, battlemap) vit dans lib/adventures.ts, côté
// app uniquement.

export const DEFAULT_ADVENTURE_ID = GRAMMYS_ID

const ADVENTURE_MAPS: Record<string, AdventureMapData> = {
  [GRAMMYS_ID]: GRAMMYS_MAP,
  [TIDE_CRYPT_ID]: TIDE_CRYPT_MAP,
}

// Retourne la carte du module demandé, ou celle du module par défaut si l'id est
// inconnu (fail-safe : le moteur ne doit jamais planter sur un id douteux).
export function getAdventureMap(adventureId: string = DEFAULT_ADVENTURE_ID): AdventureMapData {
  return ADVENTURE_MAPS[adventureId] ?? ADVENTURE_MAPS[DEFAULT_ADVENTURE_ID]
}

export function isKnownAdventureId(adventureId: string | null | undefined): boolean {
  return Boolean(adventureId && adventureId in ADVENTURE_MAPS)
}

// ── Accesseurs paramétrés par adventureId (défaut = module par défaut) ────────
// Les signatures gardent l'adventureId en DERNIER argument optionnel : tous les
// call-sites historiques (un seul argument) restent valides.

// Construit l'état initial des PNJ pour une nouvelle partie (id -> NpcState).
export function seedAdventureNpcs(adventureId?: string): Record<string, NpcState> {
  const npcs: Record<string, NpcState> = {}
  for (const spec of getAdventureMap(adventureId).npcs) {
    npcs[spec.id] = {
      id: spec.id,
      name: spec.name,
      kind: spec.kind,
      position: { x: spec.cell.x, y: spec.cell.y },
      roomId: spec.roomId,
      disposition: spec.disposition,
      visible: spec.visibleFromStart,
      description: spec.description,
    }
  }
  return npcs
}

export function inferAdventureRoomId(cell: GridCell, adventureId?: string): string | null {
  return getAdventureMap(adventureId).rooms.find(room =>
    cell.x >= room.zone.minX &&
    cell.x <= room.zone.maxX &&
    cell.y >= room.zone.minY &&
    cell.y <= room.zone.maxY
  )?.id ?? null
}

export function getAdventureRoom(roomId: string | null | undefined, adventureId?: string): AdventureRoom | null {
  if (!roomId) return null
  return getAdventureMap(adventureId).rooms.find(room => room.id === roomId) ?? null
}

export function getEncounter(encounterId: string, adventureId?: string): EncounterDefinition | null {
  return getAdventureMap(adventureId).encounters[encounterId] ?? null
}

export function encounterIds(adventureId?: string): string[] {
  return Object.keys(getAdventureMap(adventureId).encounters)
}

export function centerCellForAdventureRoom(roomId: string, adventureId?: string): GridCell | null {
  const room = getAdventureRoom(roomId, adventureId)
  if (!room) return null

  return {
    x: Math.round((room.zone.minX + room.zone.maxX) / 2),
    y: Math.round((room.zone.minY + room.zone.maxY) / 2),
  }
}

export function encounterIdForAdventureRoom(roomId: string | null | undefined, adventureId?: string): string | null {
  if (!roomId) return null
  return Object.values(getAdventureMap(adventureId).encounters)
    .find(encounter => encounter.roomId === roomId)?.id ?? null
}

export function findNamedAdventureLocationCell(text: string, adventureId?: string): GridCell | null {
  return getAdventureMap(adventureId).namedLocationCells.find(location => location.pattern.test(text))?.cell ?? null
}

export function findAdventureRoomIdByAlias(text: string, adventureId?: string): string | null {
  return getAdventureMap(adventureId).roomNavigationAliases.find(alias => alias.pattern.test(text))?.roomId ?? null
}

export function findAdventureRoomIdByContextAlias(
  text: string,
  currentRoomId: string | null | undefined,
  adventureId?: string
): string | null {
  const matchedRoomIds = getAdventureMap(adventureId).roomContextAliases
    .filter(alias => alias.roomId !== currentRoomId && alias.pattern.test(text))
    .map(alias => alias.roomId)

  return matchedRoomIds.length === 1 ? matchedRoomIds[0] : null
}

export function relativeAdventureRoomIdForText(
  text: string,
  currentRoomId: string | null | undefined,
  options: { doorAction: boolean; forwardAction: boolean },
  adventureId?: string
): string | null {
  if (!currentRoomId) return null
  const map = getAdventureMap(adventureId)

  if (options.doorAction) {
    const transitions = map.doorTransitions.filter(transition => transition.fromRoomId === currentRoomId)
    const specific = transitions.find(transition => transition.pattern?.test(text))
    if (specific) return specific.toRoomId

    const fallback = transitions.find(transition => !transition.pattern)
    if (fallback) return fallback.toRoomId
  }

  if (options.forwardAction) {
    return map.forwardTransitions.find(transition => transition.fromRoomId === currentRoomId)?.toRoomId ?? null
  }

  return null
}

// Synthèse des accroches mécaniques par salle. Injectée dans le prompt dynamique
// (quand currentRoomId est connu) pour que le DM sache quels tools sont pertinents
// SANS avoir à retrouver la bonne section du module markdown.
export function describeRoomHooks(roomId: string | null | undefined, adventureId?: string): string | null {
  if (!roomId) return null
  const map = getAdventureMap(adventureId)
  const room = map.rooms.find(candidate => candidate.id === roomId)
  const hooks = map.roomHooks[roomId]
  if (!room || !hooks) return null
  return `Salle ${room.id} — ${room.name}\n${hooks}`
}
