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
    id: 'coming-soon',
    title: 'La Crypte des Marées',
    tagline: 'Prochaine aventure — en préparation',
    description:
      "Un phare éteint, des marées qui murmurent et une crypte engloutie qui ne se découvre qu'à la lune noire. Ce module est en cours d'écriture et arrivera bientôt.",
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
