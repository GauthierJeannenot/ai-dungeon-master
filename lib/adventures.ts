import { getAdventureMap, DEFAULT_ADVENTURE_ID, type AdventureMapData } from './adventure-map'
import { GRAMMYS_CONTENT } from '../adventures/grammys-country-apple-pie/definition'
import { TIDE_CRYPT_CONTENT } from '../adventures/tide-crypt/definition'
import { FEY_SHADOW_FAIR_CONTENT } from '../adventures/fey-shadow-fair/definition'

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

// Vocabulaire du module injecté dans les prompts DM (prompts.ts + planner.ts) à
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
  /** 4-6 exemples « message → décision » pour le classifieur, dont un reveal_npc du module. */
  plannerExamples: string[]
  /** Exemple de marqueur reveal_npc du module (« reveal_npc:dryad » / « reveal_npc:ghost »). */
  revealNpcKindExample: string
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

// Disponibilité par module — « exploitation », pas du contenu : un module peut
// être présent dans le registre mais verrouillé (placeholder landing).
const AVAILABILITY: Record<string, boolean> = {
  'grammys-country-apple-pie': true,
  'tide-crypt': true,
  'fey-shadow-fair': true,
}

// Modules payants (accès à acheter, une fois, par compte connecté) et leur prix
// en centimes d'euro. Keyé par slug d'identifiant (« exploitation », pas du
// contenu narratif) — cf. verrou tests/no-module-leaks.
const REQUIRES_ENTITLEMENT: Record<string, boolean> = {
  'tide-crypt': true,
}
const MODULE_PRICE_CENTS: Record<string, number> = {
  'tide-crypt': 500,
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

export const ADVENTURES: AdventureDefinition[] = [GRAMMYS_CONTENT, TIDE_CRYPT_CONTENT, FEY_SHADOW_FAIR_CONTENT].map(toDefinition)

export function getAdventure(id: string | null | undefined): AdventureDefinition | null {
  if (!id) return null
  return ADVENTURES.find(adventure => adventure.id === id) ?? null
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
