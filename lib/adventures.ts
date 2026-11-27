import { getAdventureMap, getMapSpec, getNavigationMode, DEFAULT_ADVENTURE_ID, type AdventureMapData } from './adventure-map'
import type { GameState } from './types'
import { GRAMMYS_CONTENT } from '../adventures/grammys-country-apple-pie/definition'
import { TIDE_CRYPT_CONTENT } from '../adventures/tide-crypt/definition'
import { FEY_SHADOW_FAIR_CONTENT } from '../adventures/fey-shadow-fair/definition'
import { YELLOWCREST_CONTENT } from '../adventures/sarah-of-yellowcrest-manor/definition'
import { completedRoundEvents } from './combat-round-events'

// ─────────────────────────────────────────────────────────────────────────────
// Registre des modules d'aventure — pur AGRÉGATEUR.
//
// Le contenu propre à chaque module (meta landing, welcome, placeholders,
// indices de statut, vocabulaire des prompts) vit dans adventures/<id>/
// definition.ts. La couche « carte/moteur » (rooms, encounters, npcs…) vit dans
// lib/adventure-map.ts + adventures/<id>/map.ts (aussi importable par le serveur
// MCP). Ce fichier ne fait que fusionner les deux avec l'« exploitation »
// (disponibilité + chemin de jeu) et exposer les accesseurs côté app.
//
// Pour ajouter un module : voir la checklist du README (« Ajouter un module »).
// ─────────────────────────────────────────────────────────────────────────────

export { DEFAULT_ADVENTURE_ID }

export type AdventureAccent = 'amber' | 'emerald' | 'purple'

/** Percentage bounds within an illustration, independent of the engine grid. */
export interface SceneBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface AdventureScene {
  /** Optional mode restriction, for maps mixing an illustrated exterior and tactical interiors. */
  navigationMode?: 'exploration' | 'tactical'
  /** Author-reviewed illustration footprints, in percent (independent of the grid). */
  fogRegions?: Array<{ roomId: string; points: Array<[number, number]> }>
  image: string
  alt: string
  width: number
  height: number
  hint: string
  hotspots: Array<{
    id: string
    label: string
    message: string
    roomIds: string[]
    bounds: SceneBounds
    /** Solid action button anchored inside the illustration. */
    appearance?: 'button'
    /** Numbered map pin, also listed below the image for small screens. */
    marker?: string
    requiresClueId?: string
    /** Optional navigation binding; shared accessibility and fog rules apply. */
    destinationRoomId?: string
  }>
  npcOverlays: Array<{
    npcId: string
    image: string
    alt: string
    bounds: SceneBounds
  }>
  actions?: Array<{ label: string; message: string; roomIds: string[]; requiresClueId?: string;
    placement?: 'right' }>
}

// Vocabulaire du module injecté dans les prompts DM (prompts.ts) à
// la place de valeurs en dur : garde les prompts d'un module exempts du
// vocabulaire d'un autre. Voir docs/adventure-content-consolidation.md.
export interface AdventurePromptGuidance {
  /** Exemple d'intention de déplacement propre au module (« je vais au verger »). */
  movementExample: string
  /** Lieux nommés du module, en une liste lisible (« verger, tas de déchets, … »). */
  namedPlaces: string
  /** PNJ visible dès le départ, exemple pour la règle des tokens (« Mac dès le départ »). */
  visibleNpcExample: string
  /** PNJ non hostiles que run_monster_turns ignore (« Mac le Tréant, la dryade… »). */
  nonHostileNpcs: string
  /** Exemples du module pour les appels explicites du MJ ; aucun effet automatique. */
  actionExamples: string[]
}

// Contenu APP d'un module (adventures/<id>/definition.ts). Ne contient que du
// contenu propre au module — ni la carte moteur, ni l'exploitation (available,
// playPath), ajoutées par le registre ci-dessous.
export interface AdventureContent {
  id: string
  title: string
  tagline: string
  description: string
  level: string
  duration: string
  /** Accent visuel de la carte sur la landing. */
  accent: AdventureAccent
  /** Image de battlemap servie (public/battlemaps/<id>.png) — map de départ. */
  battlemapImage: string
  /**
   * Modules multi-maps : image par mapId (public/battlemaps/<id>-<mapId>.png).
   * Absent = module 1-map (battlemapImage suffit). La map de départ peut y
   * figurer ou non ; battlemapImage reste le repli.
   */
  battlemapImages?: Record<string, string>
  /** Visual assets only; identity bindings never affect engine state. */
  tokenImages?: {
    npcs: Readonly<Record<string, string>>
    creatures: Readonly<Record<string, string>>
    credits: string
  }
  /** Local combat artwork using the existing map coordinates, without teleporting. */
  combatViews?: Array<{ mapId: string; roomIds: string[]; image: string;
    afterEventImages?: Record<string, string>;
    bounds: { minX: number; maxX: number; minY: number; maxY: number } }>
  /** Local framing used in tactical navigation, including outside combat. */
  tacticalViews?: AdventureContent['combatViews']
  /** Illustrated exploration scenes keyed by mapId; combat keeps its tactical map. */
  scenes?: Record<string, AdventureScene>
  /** Dimensions de la grille de la PREMIÈRE map (les suivantes : map.maps[i].grid). */
  grid: { cols: number; rows: number }
  /** Message d'ouverture du DM affiché avant le premier message du joueur. */
  welcomeMessage: string
  /** Placeholders du champ de saisie par salle (clé 'default' = repli). */
  chatPlaceholders?: Record<string, string[]>
  /** Indices de statut par salle (ligne au-dessus du champ, hors combat). */
  roomStatusHints?: Record<string, string>
  /** Vocabulaire injecté dans les prompts DM. */
  promptGuidance: AdventurePromptGuidance
  /**
   * Accroche narrative liant UN personnage à CETTE aventure (clé = characterId).
   * 2-3 phrases (l'équivalent de la section « Histoire » de l'ancien
   * player-character.md), injectées sous la fiche générique dans le prompt
   * statique. Le vocabulaire de module vit ICI, pas dans characters/. Absent
   * pour un personnage = la fiche générique suffit. Voir docs/playable-characters.md.
   */
  characterHooks?: Record<string, string>
}

// Module COMPLET côté app : contenu + exploitation + carte moteur.
export interface AdventureDefinition extends AdventureContent {
  available: boolean
  /**
   * Module payant : accessible uniquement à un utilisateur connecté ayant acheté
   * l'accès (achat unique, cf. lib/module-access.ts). Axe orthogonal à `available`
   * (« publié / pas “bientôt” ») et aux tokens (facturation par message).
   */
  requiresEntitlement: boolean
  /** Prix d'achat de l'accès au module, en centimes d'euro (si payant). */
  priceCents?: number
  /** Chemin de la page de jeu pour ce module. */
  playPath?: string
  /** Dossier des fichiers de contexte markdown (adventures/<id>). */
  contextDir: string
  /** Carte moteur du module (rooms, encounters, npcs, hooks, startCell…). */
  map: AdventureMapData
}

/** Exact authored identity first, then an explicitly authored creature archetype. */
export function tokenImageForActor(adventureId: string | undefined, actorId?: string, creatureType?: string): string | undefined {
  const images = getAdventure(adventureId)?.tokenImages
  if (!images) return undefined
  if (actorId && Object.hasOwn(images.npcs, actorId)) return images.npcs[actorId]
  return creatureType && Object.hasOwn(images.creatures, creatureType) ? images.creatures[creatureType] : undefined
}

export function getAdventureScene(adventure: AdventureContent, state: GameState): AdventureScene | undefined {
  if (state.phase === 'combat') return undefined
  const map = getMapSpec(state.currentMapId, state)
  const scene = adventure.scenes?.[map.id]
  if (scene?.navigationMode && scene.navigationMode !== getNavigationMode(state)) return undefined
  return scene
}

export function getCombatView(adventure: AdventureContent, state: GameState) {
  if (state.phase !== 'combat') return undefined
  return selectTacticalView(adventure.combatViews, state)
}

export function getTacticalView(adventure: AdventureContent, state: GameState) {
  return getCombatView(adventure, state) ?? (getNavigationMode(state) === 'tactical'
    ? selectTacticalView(adventure.tacticalViews, state) : undefined)
}

function selectTacticalView(views: AdventureContent['combatViews'], state: GameState) {
  const mapId = getMapSpec(state.currentMapId, state).id
  const view = views?.find(view => {
    if (view.mapId !== mapId || !state.currentRoomId || !view.roomIds.includes(state.currentRoomId)) return false
    const inside = (cell: { x: number; y: number }) => cell.x >= view.bounds.minX && cell.x <= view.bounds.maxX
      && cell.y >= view.bounds.minY && cell.y <= view.bounds.maxY
    // A pursuit outside the local view restores the complete tactical board.
    return inside(state.player.position) && Object.values(state.monsters).filter(m => m.isAlive).every(m => inside(m.position))
  })
  if (!view) return undefined
  const variant = Object.entries(view.afterEventImages ?? {}).find(([eventId]) => completedRoundEvents(state)[eventId])
  return variant ? { ...view, image: variant[1] } : view
}

// Disponibilité par module — « exploitation », pas du contenu : un module peut
// être présent dans le registre mais verrouillé (placeholder landing).
const AVAILABILITY: Record<string, boolean> = {
  'grammys-country-apple-pie': true,
  'tide-crypt': true,
  'fey-shadow-fair': true,
  'sarah-of-yellowcrest-manor': true,
}

// Modules payants (accès à acheter, une fois, par compte connecté) et leur prix
// en centimes d'euro. Keyé par slug d'identifiant (« exploitation », pas du
// contenu narratif) — cf. verrou tests/no-module-leaks.
const REQUIRES_ENTITLEMENT: Record<string, boolean> = {
  'tide-crypt': true,
  'fey-shadow-fair': true,
}
const MODULE_PRICE_CENTS: Record<string, number> = {
  'tide-crypt': 500,
  'fey-shadow-fair': 1000,
}

function toDefinition(content: AdventureContent): AdventureDefinition {
  const requiresEntitlement = REQUIRES_ENTITLEMENT[content.id] ?? false
  return {
    ...content,
    available: AVAILABILITY[content.id] ?? false,
    requiresEntitlement,
    priceCents: requiresEntitlement ? MODULE_PRICE_CENTS[content.id] : undefined,
    playPath: `/game?adventure=${content.id}`,
    contextDir: `adventures/${content.id}`,
    map: getAdventureMap(content.id),
  }
}

const REGISTERED_ADVENTURES: AdventureDefinition[] = [GRAMMYS_CONTENT, TIDE_CRYPT_CONTENT, FEY_SHADOW_FAIR_CONTENT, YELLOWCREST_CONTENT].map(toDefinition)

// Keep retired content readable for existing sessions, outside the public catalogue.
export const ADVENTURES = REGISTERED_ADVENTURES.filter(adventure => adventure.id !== TIDE_CRYPT_CONTENT.id)

export function getAdventure(id: string | null | undefined): AdventureDefinition | null {
  if (!id) return null
  return REGISTERED_ADVENTURES.find(adventure => adventure.id === id) ?? null
}

// Résout un module JOUABLE : lève si l'id est inconnu ou verrouillé. Utilisé par
// la route DM et la page de jeu (sécurité : on ne démarre que du disponible).
export function requireAvailableAdventure(id: string | null | undefined): AdventureDefinition {
  const adventure = getAdventure(id ?? DEFAULT_ADVENTURE_ID)
  if (!adventure) {
    throw new Error(`Module d'aventure inconnu : "${id}"`)
  }
  if (!adventure.available) {
    throw new Error(`Module d'aventure non disponible : "${id}"`)
  }
  return adventure
}

// Définition complète du module, défaut si id inconnu (fail-safe lecture seule).
export function getAdventureDefinition(id: string | null | undefined): AdventureDefinition {
  return getAdventure(id) ?? getAdventure(DEFAULT_ADVENTURE_ID)!
}

// Module payant JOUABLE ciblé par un achat : lève si l'id est inconnu, verrouillé
// (« bientôt ») ou gratuit. Utilisé par le checkout Stripe pour valider un
// achat d'accès module et retrouver son prix (source de vérité unique).
export function requirePurchasableModule(
  id: string | null | undefined
): { id: string; title: string; priceCents: number } {
  const adventure = getAdventure(id)
  if (!adventure || !adventure.available) {
    throw new Error(`Module d'aventure indisponible : "${id}"`)
  }
  if (!adventure.requiresEntitlement || !adventure.priceCents) {
    throw new Error(`Module d'aventure non payant : "${id}"`)
  }
  return { id: adventure.id, title: adventure.title, priceCents: adventure.priceCents }
}
