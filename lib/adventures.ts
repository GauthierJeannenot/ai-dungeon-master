// Registre des modules d'aventure proposés sur la landing page.
// Un seul module est jouable pour l'instant ; les suivants sont des placeholders
// affichés verrouillés. Pour ajouter un module : créer ses fichiers de contexte
// (context/), sa carte (public/) et l'entrée ci-dessous avec available: true.

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
  accent: 'amber' | 'emerald' | 'purple'
}

export const ADVENTURES: AdventureModule[] = [
  {
    id: 'grammys-country-apple-pie',
    title: "Grammy's Country Apple Pie",
    tagline: 'La recette perdue de la meilleure tarte du royaume',
    description:
      "La boulangerie de Grammy est abandonnée — et infestée de gobelins. Le sorcier Tyndareus le Vert t'engage pour retrouver la recette secrète de ses légendaires tartes aux pommes. Verger enchanté, dryades susceptibles, tréant bougon et Chef Grukk t'attendent.",
    level: 'Niveau 1 · D&D 5e',
    duration: '~1-2 h',
    available: true,
    playPath: '/game',
    accent: 'amber',
  },
  {
    // Contenu COMPLET dans adventures/tide-crypt/ (module, carte typée, fiche
    // perso niv.2, battlemap public/battlemaps/tide-crypt.png). Reste verrouillé
    // tant que le moteur est câblé sur Grammy's — le plan de câblage est dans
    // docs/multi-adventure-architecture.md ; passer available:true à l'étape 7.
    id: 'tide-crypt',
    title: 'La Crypte des Marées',
    tagline: 'La Flamme du phare dort dans un tombeau que la mer découvre',
    description:
      "Le phare de Kerlouan s'est éteint et les navires manquent la passe. À la lune noire, la marée dénude une chaussée de pierres qui descend vers la crypte de Morgane, première Gardienne des Marées. Ses marins morts veillent encore — rapportez la Flamme, poliment si possible.",
    level: 'Niveau 2 · D&D 5e',
    duration: '~2-3 h',
    available: false,
    accent: 'purple',
  },
]

export function getAdventure(id: string): AdventureModule | null {
  return ADVENTURES.find(adventure => adventure.id === id) ?? null
}

export const DEFAULT_ADVENTURE_ID = 'grammys-country-apple-pie'
