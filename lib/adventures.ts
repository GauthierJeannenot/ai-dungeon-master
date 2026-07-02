import { getAdventureMap, DEFAULT_ADVENTURE_ID, type AdventureMapData } from './adventure-map'

// ─────────────────────────────────────────────────────────────────────────────
// Registre des modules d'aventure. Deux niveaux :
//   - AdventureModule : métadonnées de la landing (titre, pitch, disponibilité).
//   - AdventureDefinition : le module COMPLET côté app (landing + contexte,
//     battlemap, état initial, welcome, placeholders, carte moteur).
//
// La couche « carte/moteur » (rooms, encounters, npcs…) vit dans
// lib/adventure-map.ts + adventures/<id>/map.ts et est aussi importable par le
// serveur MCP. Ce fichier-ci n'est utilisé que côté app/frontend.
//
// Pour ajouter un module : voir la checklist du README (« Ajouter un module »).
// ─────────────────────────────────────────────────────────────────────────────

export { DEFAULT_ADVENTURE_ID }

export type AdventureAccent = 'amber' | 'emerald' | 'purple'

export interface AdventureModule {
  id: string
  title: string
  tagline: string
  description: string
  level: string
  duration: string
  available: boolean
  /** Chemin de la page de jeu pour ce module. */
  playPath?: string
  /** Accent visuel de la carte sur la landing. */
  accent: AdventureAccent
}

export interface AdventureDefinition extends AdventureModule {
  /** Dossier des fichiers de contexte markdown (adventures/<id>). */
  contextDir: string
  /** Image de battlemap servie (public/…). */
  battlemapImage: string
  /** Dimensions de la grille (17×15 pour les deux modules actuels). */
  grid: { cols: number; rows: number }
  /** Message d'ouverture du DM affiché avant le premier message du joueur. */
  welcomeMessage: string
  /** Placeholders du champ de saisie par salle (clé 'default' = repli). */
  chatPlaceholders?: Record<string, string[]>
  /** Carte moteur du module (rooms, encounters, npcs, hooks, startCell…). */
  map: AdventureMapData
}

const GRAMMYS_WELCOME =
  "Le vieux sorcier Tyndareus le Vert t'a engagé pour une mission singulière : retrouver la recette secrète des célèbres tartes aux pommes de Grammy. Après des jours de route, te voici enfin devant la vieille boulangerie, abandonnée depuis longtemps et, dit-on, infestée de gobelins. L'odeur des pommes du verger flotte encore dans l'air, et la porte entrebâillée t'invite à entrer. Que fais-tu ?"

const TIDE_CRYPT_WELCOME =
  "Le phare de Kerlouan s'est éteint il y a trois nuits, et déjà les navires manquent la passe. Maël, le vieux gardien, t'attend sur la grève, une lanterne sourde à la main. La lune noire a tiré la mer si loin qu'une chaussée de pierres, d'ordinaire noyée, s'enfonce à découvert vers un escalier sombre. « La Flamme dort là-dessous, gamin », murmure-t-il. « Va la chercher. Poliment, si tu tiens à remonter. » Que fais-tu ?"

// Placeholders du chat par salle (repris de components/Chat.tsx pour Grammy's).
const GRAMMYS_PLACEHOLDERS: Record<string, string[]> = {
  default: [
    "Fouiller les comptoirs, écouter derrière une porte, suivre l'odeur de cannelle...",
    'Avancer prudemment, tenter un plan bancal, faire confiance au nez...',
  ],
  '1': [
    "Amadouer l'arbre, forcer la porte, accuser une pomme d'espionnage...",
    "Inspecter l'écorce, toquer à la porte, flairer le piège à tarte...",
  ],
  '8': [
    'Négocier avec Grukk, lever le bouclier, demander qui tient la recette...',
    'Observer les gobelins, chercher une sortie, parler plus fort que le danger...',
  ],
}

const TIDE_CRYPT_PLACEHOLDERS: Record<string, string[]> = {
  default: [
    'Sonder la laisse de mer, guetter la marée, écouter la crypte respirer...',
    "Avancer sur la chaussée, prier les morts, chercher l'indice qui apaise...",
  ],
  '1': [
    'Interroger Maël, fouiller le varech, jauger la chaussée découverte...',
    'Demander le rythme des cloches, ramasser un débris, flairer le sel...',
  ],
  '8': [
    'Offrir le médaillon, nommer Morgane, demander la Flamme sans la voler...',
    "Saluer le Gardien, chercher l'Écho, tendre une main plutôt qu'une lame...",
  ],
}

export const ADVENTURES: AdventureDefinition[] = [
  {
    id: 'grammys-country-apple-pie',
    title: "Grammy's Country Apple Pie",
    tagline: 'La recette perdue de la meilleure tarte du royaume',
    description:
      "La boulangerie de Grammy est abandonnée — et infestée de gobelins. Le sorcier Tyndareus le Vert t'engage pour retrouver la recette secrète de ses légendaires tartes aux pommes. Verger enchanté, dryades susceptibles, tréant bougon et Chef Grukk t'attendent.",
    level: 'Niveau 1 · D&D 5e',
    duration: '~1-2 h',
    available: true,
    // playPath générique jusqu'à l'étape 7 (la page de jeu ne lit pas encore
    // l'adventure param) ; passera à /game?adventure=<id> en étape 7.
    playPath: '/game',
    accent: 'amber',
    contextDir: 'adventures/grammys-country-apple-pie',
    battlemapImage: '/battlemap.png',
    grid: { cols: 17, rows: 15 },
    welcomeMessage: GRAMMYS_WELCOME,
    chatPlaceholders: GRAMMYS_PLACEHOLDERS,
    map: getAdventureMap('grammys-country-apple-pie'),
  },
  {
    id: 'tide-crypt',
    title: 'La Crypte des Marées',
    tagline: 'La Flamme du phare dort dans un tombeau que la mer découvre',
    description:
      "Le phare de Kerlouan s'est éteint et les navires manquent la passe. À la lune noire, la marée dénude une chaussée de pierres qui descend vers la crypte de Morgane, première Gardienne des Marées. Ses marins morts veillent encore — rapportez la Flamme, poliment si possible.",
    level: 'Niveau 2 · D&D 5e',
    duration: '~2-3 h',
    // Reste verrouillé jusqu'à l'étape 7 (page de jeu multi-modules) — le
    // contenu et le registre existent, seul le câblage frontend manque.
    available: false,
    playPath: '/game?adventure=tide-crypt',
    accent: 'purple',
    contextDir: 'adventures/tide-crypt',
    battlemapImage: '/battlemaps/tide-crypt.png',
    grid: { cols: 17, rows: 15 },
    welcomeMessage: TIDE_CRYPT_WELCOME,
    chatPlaceholders: TIDE_CRYPT_PLACEHOLDERS,
    map: getAdventureMap('tide-crypt'),
  },
]

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
