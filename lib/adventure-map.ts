import type { AdventureRewardDefinition } from './adventure-reward-state'
import { campaignObjectiveOutcomeId,type CampaignEncounterResult } from './campaign-outcome-state'
import type { GameState, NpcState, WorldNpcDisposition, Item, DroppedItem } from './types'
import { createNpcState } from './npc-stat-blocks'
import { GRAMMYS_MAP, GRAMMYS_ID } from '../adventures/grammys-country-apple-pie/map'
import { TIDE_CRYPT_MAP, TIDE_CRYPT_ID } from '../adventures/tide-crypt/map'
import { FEY_SHADOW_FAIR_MAP, FEY_SHADOW_FAIR_ID } from '../adventures/fey-shadow-fair/map'
import { YELLOWCREST_MAP, YELLOWCREST_ID } from '../adventures/sarah-of-yellowcrest-manor/map'
import bakeryGeometry from '../adventures/grammys-country-apple-pie/geometry.json'
import cryptGeometry from '../adventures/tide-crypt/geometry.json'
import fairGeometry from '../adventures/fey-shadow-fair/geometry.json'
import { GeometrySchema } from './battlemap-geometry'
import { overlayDungeons } from '../adventures/generated-dungeon/map'
export type AdventureSource = string | { adventureId?: string; dmTools?: GameState['dmTools'] }

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
  // Exploration overviews offer every location; tactical maps expose local connections.
  // This changes destination guidance only: engine paths, doors and combat still apply.
  navigationMode?: 'exploration' | 'tactical'
  // On a mixed map, these rooms use exploration; all other rooms keep navigationMode.
  explorationRoomIds?: string[]
  // Opt-in, reusable room discovery, driven only by engine roomsVisited.
  fogOfWar?: boolean
  // Optional room-only fog (e.g. interiors); other rooms and open ground stay visible.
  fogHiddenRoomIds?: string[]
  // Default fog remembers visits; this policy also remembers a view through a nearby open threshold.
  fogReveal?: 'open-door'
  // Several reversible floors can belong to the same one-way story act.
  travelGroup?: string
  grid: { cols: number; rows: number }
  // Taille de case MINIMALE en px — rendu uniquement, JAMAIS lue par le moteur
  // (ses bornes de déplacement dérivent de `grid`). Si la map tient dans le
  // conteneur, les cases s'agrandissent pour le remplir (cases carrées,
  // letterbox) ; sinon elles restent à cette taille et la map devient
  // scrollable. Absent = DEFAULT_CELL_SIZE. Voir docs/battlemap-viewport.md.
  cellSize?: number
  // Smooth interpolation for painted artwork; pixel maps keep their default rendering.
  imageRendering?: 'auto' | 'pixelated'
  // Optional imported, reviewed geometry. Absence is explicitly legacy/unverified.
  geometry?: import('./battlemap-geometry').BattlemapGeometry
  // Authored floor features, shared by pathfinding, movement budgets and UI.
  terrain?: Array<{ kind: 'blocked' | 'difficult'; label: string; cells: GridCell[]; untilRoundEventId?: string }>
  // Authored environmental effects resolved by the engine at a round boundary.
  roundEvents?: Array<{ id: string; roomId: string; afterRound: number; name: string;
    path: GridCell[]; damageDice: string; opensDoors?: string[] }>
}

// Taille de case par défaut (px) quand une map ne configure pas `cellSize`.
export const DEFAULT_CELL_SIZE = 48

export interface AdventureDoor {
  id: string
  name: string
  // A permanent opening has no door leaf and cannot be closed or forced.
  opening?: boolean
  sides: [
    { roomId: string; cell: GridCell; direction: string },
    { roomId: string; cell: GridCell; direction: string },
  ]
  initialState: 'open' | 'closed'
  forceDc?: number
  barredFromRoomId?: string
}

export interface AdventureRoom {
  id: string
  name: string
  // Legacy authored enclosure: crossing its boundary requires an authored threshold.
  // Imported geometry replaces this coarse fallback after review.
  enclosed?: boolean
  navigationEvent?: { id: string; label: string }
  // Map où vit la salle (absent = première map du module).
  mapId?: string
  entryStealthDc?: number // DD d'entrée furtive, résolu par move_token (défaut 15)
  zone: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  // Optional exact footprint as a union of rectangles; zone remains its bounding box.
  // Prevents an L-shaped room from claiming adjacent rooms inside that box.
  areas?: Array<{ minX: number; maxX: number; minY: number; maxY: number }>
}

// ── Quêtes de map et transitions inter-maps ──────────────────────────────────
// La complétion d'une map est jugée par le MOTEUR seul, via des conditions
// vérifiables sur GameState — jamais par le LLM ni le client. Liste fermée,
// extensible par ajout de variantes ; jamais de condition « floue ».
export type ObjectiveCheck =
  | { type: 'encounterResolved'; encounterId: string }
  | { type: 'npcPartyArrival'; npcId: string; roomId: string }
  | { type: 'encounterOutcome'; encounterId: string; accepted: CampaignEncounterResult[] }
  | { type: 'itemInInventory'; item: string; strictmatch?: 'id' }
  | { type: 'npcDisposition'; npcId: string; disposition: WorldNpcDisposition }
  | { type: 'roomVisited'; roomId: string }
  | { type: 'clueRevealed'; clueId: string }

export interface MapObjective {
  id: string
  dialogue?: { npcIds: string[]; label: string } // Player journal only after an explicit NPC communication.
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
  generatedDungeonId?: string
  id: string
  // Local stairs: require this exact departure, skip act objectives and do not
  // close either floor. Both maps must declare the same travelGroup.
  passage?: { roomId: string; cell: GridCell; label: string }
  // Elapsed travel only; never grants an implicit rest or restores resources.
  travelSeconds?: number
  fromMapId: string
  toMapId: string
  // Point d'arrivée sur la map de DESTINATION (coordonnées de sa grille).
  arrivalCell: GridCell
  arrivalRoomId: string
  // Authored belongings collected as part of this deliberate story departure.
  // Existing ground instances on the departure map only; never generated loot.
  departureItemIds?: string[]
  // PNJ candidats à la traversée avec le joueur. Seuls ceux devenus `helpful`
  // (amitié actée en jeu via reveal_npc) traversent ; les autres restent, comme
  // tous les PNJ non listés (sens unique).
  companions?: string[]
}

export interface EncounterMonsterSpec {
  monsterType: string
  cell: GridCell
  name?: string
  hpOverride?: number
}

export interface EncounterDefinition {
  socialProfile?: import('./social').SocialProfile // Campaign role overrides species defaults.
  id: string
  roomId: string
  name: string
  playerCell?: GridCell
  monsters: EncounterMonsterSpec[]
  // Authored exception to investigation: creatures prepare an ambush inside their room.
  noiseAmbush?: { perceptionDc: number; dexterityDc: number }
}



export interface AdventureNpcSpec {
  party?: { releaseDoorId?: string; safeRoomIds: string[] }
  initialHp?: number
  group?: { name: string; members: Array<{ id: string; name: string }> }
  socialIdentity?: string // Same person represented in several campaign acts.
  // Authored SRD block for saves/spell targeting, without starting combat.
  statBlock?: string
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
  reactive?: {
    objectives: string[]
    capabilities: Array<'move' | 'open_door' | 'close_door' | 'force_door' | 'initiate_combat' | 'attack'>
    speed: number // feet per turn; one grid step = 5 feet
    combatTemplate?: string
    triggers: Array<'after_player_action' | 'turn_start'>
  }
}

// Toutes les données de carte d'un module. Chaque module en exporte une instance
// (adventures/<id>/map.ts) ; le registre ci-dessous les agrège par adventureId.
export interface AdventureMapData {
  social?: import('./social').AdventureSocialData
  // Additive, data-driven coordinate migrations for saved maps redesigned later.
  layoutMigrations?: Array<{ id: string; fromMapId: string; toMapId: string;
    area: AdventureRoom['zone']; offset: GridCell }>
  // Maps du module, dans l'ordre de progression — maps[0] est la map de départ.
  // Chaque map porte SA grille (cols × rows). SOURCE DE VÉRITÉ UNIQUE : les
  // bornes de déplacement du moteur (mcp-server/rules.ts) en dérivent maxX/maxY
  // selon la map courante. Ne pas dupliquer ces nombres ailleurs.
  maps: AdventureMapSpec[]
  // Quête par map (clé = mapId). Une map sans quête = sortie libre (aventure
  // 1-map, ou map de conclusion).
  mapQuests: Record<string, MapQuest>
  campaignTracking?: { encounterIds: string[] } // explicit authored scope, never enabled by default
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
  // Authored objects already on the ground; acquired through pick_up_item.
  // Optional so existing modules and hydrated sessions keep their inventories.
  groundItems?: DroppedItem[]
  rewards?: AdventureRewardDefinition[] // Confidential authored sources, not spawned loot or player knowledge.
  // Information the agent may explicitly reveal after a witness shares it.
  clues?: Array<{ id: string; text: string; sourceNpcIds: string[] }>
  doors?: AdventureDoor[]
  roomHooks: Record<string, string>
  // Cloisons : paires de salles géométriquement CONTIGUËS (leurs zones se
  // touchent) qui ne communiquent PAS — un mur/une paroi les sépare. Le moteur
  // déduit la salle courante de la POSITION du joueur (inferRoomIdOnMap), donc
  // toute contiguïté est franchissable PAR DÉFAUT : on ne déclare ICI que les
  // EXCEPTIONS. La relation est symétrique — l'ordre des deux salles est
  // indifférent. Consommé par renderSceneMap (lib/dm/scene-map.ts) pour
  // distinguer « communique avec » de « cloisonné » dans la carte de la scène.
  // Optionnel : absent ⇒ aucune cloison (toutes les contiguïtés communiquent).
  partitions?: Array<[string, string]>
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
  [YELLOWCREST_ID]: YELLOWCREST_MAP,
}

// Geometry is versioned with adventure content; never derived during a session.
for (const [id, geometries] of [[GRAMMYS_ID, bakeryGeometry], [TIDE_CRYPT_ID, cryptGeometry], [FEY_SHADOW_FAIR_ID, fairGeometry]] as const) {
  for (const [mapId, value] of Object.entries(geometries)) {
    const spec = ADVENTURE_MAPS[id].maps.find(m => m.id === mapId)
    if (!spec) throw new Error(`Unknown geometry map: ${id}/${mapId}`)
    spec.geometry = GeometrySchema.parse(value)
  }
}

// Retourne la carte du module demandé, ou celle du module par défaut si l'id est
// inconnu (fail-safe : le moteur ne doit jamais planter sur un id douteux).
export function getAdventureMap(source: AdventureSource = DEFAULT_ADVENTURE_ID): AdventureMapData {
  const id=typeof source==='string'?source:source.adventureId??DEFAULT_ADVENTURE_ID
  const base=ADVENTURE_MAPS[id]??ADVENTURE_MAPS[DEFAULT_ADVENTURE_ID]
  return typeof source!=='string' && source.dmTools?.dungeons && Object.keys(source.dmTools.dungeons).length
    ? overlayDungeons(base,source.dmTools.dungeons) : base
}

export function isKnownAdventureId(adventureId: string | null | undefined): boolean {
  return Boolean(adventureId && adventureId in ADVENTURE_MAPS)
}

// ── Accesseurs paramétrés par adventureId (défaut = module par défaut) ────────
// Les signatures gardent l'adventureId en DERNIER argument optionnel : tous les
// call-sites historiques (un seul argument) restent valides.

// Map de départ d'un module (les états legacy sans currentMapId y retombent).
export function firstMapId(adventureId?: AdventureSource): string {
  return getAdventureMap(adventureId).maps[0].id
}

export function getMapSpec(mapId: string | null | undefined, adventureId?: AdventureSource): AdventureMapSpec {
  const map = getAdventureMap(adventureId)
  return map.maps.find(spec => spec.id === mapId) ?? map.maps[0]
}

export function getNavigationMode(state: Pick<GameState, 'adventureId' | 'currentMapId' | 'currentRoomId' | 'phase'>): 'exploration' | 'tactical' {
  if (state.phase === 'combat') return 'tactical'
  const map = getMapSpec(state.currentMapId, state)
  if (state.currentRoomId && map.explorationRoomIds?.includes(state.currentRoomId)) return 'exploration'
  return map.navigationMode ?? 'tactical'
}

// Grille de la map demandée (repli : première map). Les bornes de déplacement
// du moteur en dérivent — c'est LA source de vérité des dimensions.
export function gridForMap(mapId: string | null | undefined, adventureId?: AdventureSource): { cols: number; rows: number } {
  return getMapSpec(mapId, adventureId).grid
}

// Map d'une salle (mapId absent sur la salle = première map du module).
export function resolveRoomMapId(roomId: string | null | undefined, adventureId?: AdventureSource): string | null {
  const room = getAdventureRoom(roomId, adventureId)
  if (!room) return null
  return room.mapId ?? firstMapId(adventureId)
}

// Construit l'état initial des PNJ pour une nouvelle partie (id -> NpcState).
export function seedAdventureNpcs(adventureId?: AdventureSource): Record<string, NpcState> {
  const npcs: Record<string, NpcState> = {}
  for (const spec of getAdventureMap(adventureId).npcs) {
    npcs[spec.id] = createNpcState(spec,
      spec.mapId ?? resolveRoomMapId(spec.roomId, adventureId) ?? firstMapId(adventureId))
  }
  return npcs
}

export function seedAdventureGroundItems(adventureId?: AdventureSource): Record<string, DroppedItem> {
  return Object.fromEntries((getAdventureMap(adventureId).groundItems ?? []).map(drop =>
    [drop.item.id, structuredClone(drop)]))
}

// Inférence historique (première map) — les call-sites multi-map passent par
// inferRoomIdOnMap. Identique à l'ancien comportement pour une aventure 1-map.
export function inferAdventureRoomId(cell: GridCell, adventureId?: AdventureSource): string | null {
  return inferRoomIdOnMap(cell, firstMapId(adventureId), adventureId)
}

export function roomContainsCell(room: AdventureRoom, cell: GridCell): boolean {
  return (room.areas ?? [room.zone]).some(area => cell.x >= area.minX && cell.x <= area.maxX
    && cell.y >= area.minY && cell.y <= area.maxY)
}

// Inférence de salle scopée à UNE map : deux maps ont chacune leur grille, une
// cellule seule est donc ambiguë — on ne matche que les salles de la map donnée.
export function inferRoomIdOnMap(
  cell: GridCell,
  mapId: string | null | undefined,
  adventureId?: AdventureSource
): string | null {
  const resolvedMapId = getMapSpec(mapId, adventureId).id
  return getAdventureMap(adventureId).rooms.find(room =>
    (room.mapId ?? firstMapId(adventureId)) === resolvedMapId &&
    roomContainsCell(room, cell)
  )?.id ?? null
}

export function getAdventureRoom(roomId: string | null | undefined, adventureId?: AdventureSource): AdventureRoom | null {
  if (!roomId) return null
  return getAdventureMap(adventureId).rooms.find(room => room.id === roomId) ?? null
}

export function getEncounter(encounterId: string, adventureId?: AdventureSource): EncounterDefinition | null {
  return getAdventureMap(adventureId).encounters[encounterId] ?? null
}

export function encounterIds(adventureId?: AdventureSource): string[] {
  return Object.keys(getAdventureMap(adventureId).encounters)
}

export function centerCellForAdventureRoom(roomId: string, adventureId?: AdventureSource): GridCell | null {
  const room = getAdventureRoom(roomId, adventureId)
  if (!room) return null

  return {
    x: Math.round((room.zone.minX + room.zone.maxX) / 2),
    y: Math.round((room.zone.minY + room.zone.maxY) / 2),
  }
}

export function encounterIdForAdventureRoom(roomId: string | null | undefined, adventureId?: AdventureSource): string | null {
  if (!roomId) return null
  return Object.values(getAdventureMap(adventureId).encounters)
    .find(encounter => encounter.roomId === roomId)?.id ?? null
}

// ── Quête de map : évaluation moteur ─────────────────────────────────────────
// Évalue un ObjectiveCheck contre l'état — uniquement des faits de GameState,
// jamais d'interprétation narrative (docs/multi-map-adventures.md, décision 1).
export function isObjectiveDone(check: ObjectiveCheck, gameState: GameState): boolean {
  switch (check.type) {
    case 'npcPartyArrival':
      return Object.values(gameState.dmTools?.npcParty?.arrivals??{}).some(a=>a.npcId===check.npcId&&a.roomId===check.roomId)
    case 'encounterResolved':
      return Boolean(gameState.encountersTriggered?.includes(check.encounterId))
    case 'encounterOutcome':
      return Boolean(campaignObjectiveOutcomeId(gameState,check.encounterId,check.accepted))
    case 'itemInInventory': {
      if (check.strictmatch === 'id') return gameState.player.inventory.some(item => item.id === check.item)
      const needle = check.item.toLowerCase()
      return gameState.player.inventory.some(item =>
        item.id === check.item || item.name.toLowerCase().includes(needle)
      )
    }
    case 'npcDisposition':
      return gameState.npcs?.[check.npcId]?.disposition === check.disposition
    case 'roomVisited':
      return gameState.roomsVisited.includes(check.roomId)
    case 'clueRevealed':
      return Boolean(gameState.worldFacts?.some(fact => fact.clueId === check.clueId))
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
  adventureId?: AdventureSource
): MapQuestStatus {
  adventureId ??= gameState
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
export function mapTransitionsFrom(mapId: string | null | undefined, adventureId?: AdventureSource): MapTransition[] {
  const resolvedMapId = getMapSpec(mapId, adventureId).id
  return getAdventureMap(adventureId).mapTransitions.filter(t => t.fromMapId === resolvedMapId)
}

// Identifiants explicites choisis par l'agent. Ni texte libre, ni destination
// implicite ; une sélection ambiguë ou contradictoire est refusée.
export function resolveMapTransition(
  params: { fromMapId: string | null | undefined; transitionId?: string; toMapId?: string },
  adventureId?: AdventureSource
): MapTransition | null {
  if (!params.transitionId && !params.toMapId) return null
  const matches = mapTransitionsFrom(params.fromMapId, adventureId).filter(transition =>
    (!params.transitionId || transition.id === params.transitionId)
    && (!params.toMapId || transition.toMapId === params.toMapId))
  return matches.length === 1 ? matches[0] : null
}

// Synthèse des accroches mécaniques par salle. Injectée dans le prompt dynamique
// (quand currentRoomId est connu) pour que le DM sache quels tools sont pertinents
// SANS avoir à retrouver la bonne section du module markdown.
export function describeRoomHooks(roomId: string | null | undefined, adventureId?: AdventureSource): string | null {
  if (!roomId) return null
  const map = getAdventureMap(adventureId)
  const room = map.rooms.find(candidate => candidate.id === roomId)
  const hooks = map.roomHooks[roomId]
  if (!room || !hooks) return null
  return `Salle ${room.id} — ${room.name}\n${hooks}`
}
