import type { AdventureContent } from '../../lib/adventures'
import { GRAMMYS_MAP } from './map'

// Contenu APP du module « Grammy's Country Apple Pie » : tout ce qui est
// spécifique au module côté frontend/prompts (meta landing, welcome,
// placeholders, indices de statut, vocabulaire injecté dans les prompts DM).
// La couche MOTEUR (rooms, encounters, npcs…) vit dans ./map.ts.
//
// ⚠️ Ce fichier n'est PAS compilé par le serveur MCP (mcp-server/tsconfig.json
// n'inclut que les map.ts) : ne rien y importer d'app-only à l'exécution.

const WELCOME =
  "Le vieux sorcier Tyndareus le Vert t'a engagé pour une mission singulière : retrouver la recette secrète des célèbres tartes aux pommes de Grammy. Après des jours de route, te voici enfin devant la vieille boulangerie, abandonnée depuis longtemps et, dit-on, infestée de gobelins. L'odeur des pommes du verger flotte encore dans l'air, et de grandes portes de bois massif, closes, te barrent le passage. Juste à côté de toi, un grand arbre noueux se dresse en silence — et tu jurerais qu'il te fixe avec insistance. Que fais-tu ?"

// Placeholders du champ de saisie par salle (clé 'default' = repli).
const PLACEHOLDERS: Record<string, string[]> = {
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

// Indices de statut (ligne au-dessus du champ de saisie) par salle, hors combat.
const ROOM_STATUS_HINTS: Record<string, string> = {
  '4': "Les traces menent aux fours; une autre piste grimpe vers l'appartement.",
  '8': 'Les fours claquent: parle, fouille, provoque, ou cherche une sortie.',
  '9': "Grammy n'est plus tres loin: arrache une info, negocie, ou tente un coup.",
}

export const GRAMMYS_CONTENT: AdventureContent = {
  id: 'grammys-country-apple-pie',
  title: "Grammy's Country Apple Pie",
  tagline: 'La recette perdue de la meilleure tarte du royaume',
  description:
    "La boulangerie de Grammy est abandonnée — et infestée de gobelins. Le sorcier Tyndareus le Vert t'engage pour retrouver la recette secrète de ses légendaires tartes aux pommes. Verger enchanté, dryades susceptibles, tréant bougon et Chef Grukk t'attendent.",
  level: 'Niveau 1 · D&D 5e',
  duration: '~1-2 h',
  accent: 'amber',
  battlemapImage: '/battlemaps/grammys_bakery.png',
  // Source de vérité unique : la grille du moteur (map.ts, première map). Pas de duplication.
  grid: GRAMMYS_MAP.maps[0].grid,
  welcomeMessage: WELCOME,
  chatPlaceholders: PLACEHOLDERS,
  roomStatusHints: ROOM_STATUS_HINTS,
  characterHooks: {
    fighter: "Ancien soldat d'une compagnie de mercenaires dissoute, tu cherches à te racheter. Le vieux sorcier Tyndareus le Vert t'a engagé pour retrouver la recette secrète des tartes aux pommes de Grammy — de l'or, et peut-être une façon de faire le bien sans dégainer au premier souffle de conflit.",
    rogue: "Tyndareus le Vert t'a engagé pour un travail discret : récupérer la recette secrète de Grammy dans une boulangerie infestée de gobelins. Fouiller, crocheter, se faufiler — exactement ton domaine.",
    wizard: "Tyndareus le Vert, un confrère de l'art, t'a chargé de retrouver la recette secrète de Grammy. La rumeur parle d'un verger enchanté et de dryades : de quoi éveiller ta curiosité arcanique autant que ta prudence.",
    cleric: "Tyndareus le Vert t'a demandé de retrouver la recette perdue de Grammy et, ce faisant, d'apaiser ce qui hante encore sa vieille boulangerie. Une œuvre de compassion autant qu'une quête.",
  },
  promptGuidance: {
    movementExample: 'je vais au verger',
    namedPlaces: 'verger, tas de déchets, entrée/façade, bureau, quai de chargement, sol de la boulangerie, appartement',
    visibleNpcExample: 'Mac dès le départ',
    nonHostileNpcs: 'Mac le Tréant, la dryade',
    revealNpcKindExample: 'reveal_npc:dryad',
    plannerExamples: [
      '- "je fouille la bibliothèque" → requiresMechanic=true, tool=roll_ability_check, ability=wis, dc≈13, confidence=high.',
      '- "je crochète la serrure du coffre" → requiresMechanic=true, tool=roll_ability_check, ability=dex, dc≈15, confidence=high.',
      '- "je dépose une offrande au pied des arbres" → requiresMechanic=true, tool=roll_ability_check, ability=cha, sceneMarkers=["reveal_npc:dryad"], confidence=medium.',
      '- "j\'attaque le gobelin" → requiresMechanic=true, tool=resolve_player_attack, target="gobelin", confidence=high.',
      '- "j\'entre dans la salle suivante" → requiresMechanic=true, tool=move_token, sceneMarkers=["trigger_room_event:enter"], confidence=high.',
      '- "je lève les yeux vers le plafond / qui es-tu ?" → requiresMechanic=false, confidence=high.',
    ],
  },
}
