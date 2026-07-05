import type { GameState, NpcState, WorldNpcDisposition, Item } from './types'
import { GRAMMYS_MAP, GRAMMYS_ID } from '../adventures/grammys-country-apple-pie/map'
import { TIDE_CRYPT_MAP, TIDE_CRYPT_ID } from '../adventures/tide-crypt/map'
import { FEY_SHADOW_FAIR_MAP, FEY_SHADOW_FAIR_ID } from '../adventures/fey-shadow-fair/map'

export interface GridCell {
  x: number
  y: number
}

// Une map d'un module : sa grille et son identité. Les salles/encounters/PNJ
// restent des collections PLATES au niveau du module (roomId globalement
// uniques, numérotation continue à travers les maps) ; chaque salle porte son
// mapId (absent = première map). Voir docs/multi-map-adventures.md.
export interface AdventureMapSpec {
  id: string
  name: string
  grid: { cols: number; rows: number }
  // Taille de case MINIMALE en px — rendu uniquement, JAMAIS lue par le moteur
  // (ses bornes de déplacement dérivent de `grid`). Si la map tient dans le
  // conteneur, les cases s'agrandissent pour le remplir (cases carrées,
  // letterbox) ; sinon elles restent à cette taille et la map devient
  // scrollable. Absent = DEFAULT_CELL_SIZE. Voir docs/battlemap-viewport.md.
  cellSize?: number
}

// Taille de case par défaut (px) quand une map ne configure pas `cellSize`.
export const DEFAULT_CELL_SIZE = 48

export interface AdventureRoom {
  id: string
  name: string
  // Map où vit la salle (absent = première map du module).
  mapId?: string
  zone: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
}

// ── Quêtes de map et transitions inter-maps ──────────────────────────────────
// La complétion d'une map est jugée par le MOTEUR seul, via des conditions
// vérifiables sur GameState — jamais par le LLM ni le client. Liste fermée,
// extensible par ajout de variantes ; jamais de condition « floue ».
export type ObjectiveCheck =
  | { type: 'encounterResolved'; encounterId: string }
  | { type: 'itemInInventory'; item: string }
  | { type: 'npcDisposition'; npcId: string; disposition: WorldNpcDisposition }
  | { type: 'roomVisited'; roomId: string }

export interface MapObjective {
  id: string
  label: string        // court, injectable tel quel dans un prompt
  required: boolean    // true = nécessaire à la complétion PARTIELLE (= sortie)
  check: ObjectiveCheck
}

export interface MapQuest {
  mapId: string
  // Complétion partielle = tous les `required` remplis ; totale = tous.
  objectives: MapObjective[]
}

export interface MapTransition {
  id: string
  fromMapId: string
  toMapId: string
  // Point d'arrivée sur la map de DESTINATION (coordonnées de sa grille).
  arrivalCell: GridCell
  arrivalRoomId: string
  // PNJ qui traversent avec le joueur. Les autres restent (sens unique).
  companions?: string[]
  pattern?: RegExp
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
  // Requis si roomId est null sur un module multi-map (PNJ « ambiant » : sans
  // salle, sa map ne peut pas être dérivée). Absent = map de la salle, sinon
  // première map.
  mapId?: string
  cell: GridCell
  disposition: WorldNpcDisposition
  visibleFromStart: boolean
  description?: string
}

// Toutes les données de carte d'un module. Chaque module en exporte une instance
// (adventures/<id>/map.ts) ; le registre ci-dessous les agrège par adventureId.
export interface AdventureMapData {
  // Maps du module, dans l'ordre de progression — maps[0] est la map de départ.
  // Chaque map porte SA grille (cols × rows). SOURCE DE VÉRITÉ UNIQUE : les
  // bornes de déplacement du moteur (mcp-server/rules.ts) en dérivent maxX/maxY
  // selon la map courante. Ne pas dupliquer ces nombres ailleurs.
  maps: AdventureMapSpec[]
  // Quête par map (clé = mapId). Une map sans quête = sortie libre (aventure
  // 1-map, ou map de conclusion).
  mapQuests: Record<string, MapQuest>
  // Transitions inter-maps, à SENS UNIQUE (vide pour une aventure 1-map).
  mapTransitions: MapTransition[]
  // État initial du joueur pour ce module. Le PERSONNAGE (characters/<id>/)
  // apporte classe, stats, CA, kit, PV (formule) ; l'aventure ne règle que le
  // NIVEAU (seul levier de puissance) et d'éventuels objets propres au module
  // (extraInventory : potions offertes, objet de quête). Fusionné à la création
  // d'une partie — voir mcp-server/game-state.ts (buildInitialPlayer).
  startCell: GridCell
  initialPlayer: {
    level: number
    extraInventory?: Item[]
  }
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
  [FEY_SHADOW_FAIR_ID]: FEY_SHADOW_FAIR_MAP,
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

// Map de départ d'un module (les états legacy sans currentMapId y retombent).
export function firstMapId(adventureId?: string): string {
  return getAdventureMap(adventureId).maps[0].id
}

export function getMapSpec(mapId: string | null | undefined, adventureId?: string): AdventureMapSpec {
  const map = getAdventureMap(adventureId)
  return map.maps.find(spec => spec.id === mapId) ?? map.maps[0]
}

// Grille de la map demandée (repli : première map). Les bornes de déplacement
// du moteur en dérivent — c'est LA source de vérité des dimensions.
export function gridForMap(mapId: string | null | undefined, adventureId?: string): { cols: number; rows: number } {
  return getMapSpec(mapId, adventureId).grid
}

// Map d'une salle (mapId absent sur la salle = première map du module).
export function resolveRoomMapId(roomId: string | null | undefined, adventureId?: string): string | null {
  const room = getAdventureRoom(roomId, adventureId)
  if (!room) return null
  return room.mapId ?? firstMapId(adventureId)
}

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
      mapId: spec.mapId ?? resolveRoomMapId(spec.roomId, adventureId) ?? firstMapId(adventureId),
      disposition: spec.disposition,
      visible: spec.visibleFromStart,
      description: spec.description,
    }
  }
  return npcs
}

// Inférence historique (première map) — les call-sites multi-map passent par
// inferRoomIdOnMap. Identique à l'ancien comportement pour une aventure 1-map.
export function inferAdventureRoomId(cell: GridCell, adventureId?: string): string | null {
  return inferRoomIdOnMap(cell, firstMapId(adventureId), adventureId)
}

// Inférence de salle scopée à UNE map : deux maps ont chacune leur grille, une
// cellule seule est donc ambiguë — on ne matche que les salles de la map donnée.
export function inferRoomIdOnMap(
  cell: GridCell,
  mapId: string | null | undefined,
  adventureId?: string
): string | null {
  const resolvedMapId = getMapSpec(mapId, adventureId).id
  return getAdventureMap(adventureId).rooms.find(room =>
    (room.mapId ?? firstMapId(adventureId)) === resolvedMapId &&
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

// ── Quête de map : évaluation moteur ─────────────────────────────────────────
// Évalue un ObjectiveCheck contre l'état — uniquement des faits de GameState,
// jamais d'interprétation narrative (docs/multi-map-adventures.md, décision 1).
function isObjectiveDone(check: ObjectiveCheck, gameState: GameState): boolean {
  switch (check.type) {
    case 'encounterResolved':
      return Boolean(gameState.encountersTriggered?.includes(check.encounterId))
    case 'itemInInventory': {
      const needle = check.item.toLowerCase()
      return gameState.player.inventory.some(item =>
        item.id === check.item || item.name.toLowerCase().includes(needle)
      )
    }
    case 'npcDisposition':
      return gameState.npcs?.[check.npcId]?.disposition === check.disposition
    case 'roomVisited':
      return gameState.roomsVisited.includes(check.roomId)
  }
}

export interface MapQuestStatus {
  mapId: string
  objectives: Array<{ id: string; label: string; required: boolean; done: boolean }>
  // Complétion partielle atteinte (tous les objectifs requis) = sortie autorisée.
  requiredDone: boolean
  // Complétion totale (tous les objectifs, requis et optionnels).
  allDone: boolean
}

// Statut de la quête d'une map. Une map sans quête déclarée = sortie libre
// (requiredDone/allDone true, zéro objectif).
export function evaluateMapQuest(
  gameState: GameState,
  mapId: string | null | undefined,
  adventureId?: string
): MapQuestStatus {
  const resolvedMapId = getMapSpec(mapId, adventureId).id
  const quest = getAdventureMap(adventureId).mapQuests[resolvedMapId]
  const objectives = (quest?.objectives ?? []).map(objective => ({
    id: objective.id,
    label: objective.label,
    required: objective.required,
    done: isObjectiveDone(objective.check, gameState),
  }))
  return {
    mapId: resolvedMapId,
    objectives,
    requiredDone: objectives.filter(o => o.required).every(o => o.done),
    allDone: objectives.every(o => o.done),
  }
}

// Transitions sortantes de la map donnée.
export function mapTransitionsFrom(mapId: string | null | undefined, adventureId?: string): MapTransition[] {
  const resolvedMapId = getMapSpec(mapId, adventureId).id
  return getAdventureMap(adventureId).mapTransitions.filter(t => t.fromMapId === resolvedMapId)
}

// Résout la transition demandée depuis la map courante : par id, par map de
// destination, par pattern sur le texte, ou l'unique sortante. null = ambigu/aucune.
export function resolveMapTransition(
  params: { fromMapId: string | null | undefined; transitionId?: string; toMapId?: string; text?: string },
  adventureId?: string
): MapTransition | null {
  const outgoing = mapTransitionsFrom(params.fromMapId, adventureId)
  if (params.transitionId) {
    return outgoing.find(t => t.id === params.transitionId) ?? null
  }
  if (params.toMapId) {
    return outgoing.find(t => t.toMapId === params.toMapId) ?? null
  }
  if (params.text) {
    const byPattern = outgoing.find(t => t.pattern?.test(params.text!))
    if (byPattern) return byPattern
  }
  return outgoing.length === 1 ? outgoing[0] : null
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
