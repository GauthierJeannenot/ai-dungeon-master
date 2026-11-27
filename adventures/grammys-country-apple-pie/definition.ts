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
  "Le vieux sorcier Tyndareus le Vert t'a engagé pour une mission singulière : retrouver la recette secrète des célèbres tartes aux pommes de Grammy. Après des jours de route, te voici enfin devant la vieille boulangerie, abandonnée depuis longtemps et, dit-on, infestée de gobelins. L'odeur des pommes du verger flotte encore dans l'air, et la porte entrebâillée t'invite à entrer. Juste à côté de toi, un grand arbre noueux se dresse en silence — et tu jurerais qu'il te fixe avec insistance. Que fais-tu ?"

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
  battlemapImage: '/battlemaps/grammys-interior-topdown.png',
  tacticalViews: [{ mapId: 'bakery', roomIds: ['4', '5', '7', '8', '9'],
    image: '/battlemaps/grammys-interior-rooms-hd.png',
    bounds: { minX: 3, maxX: 13, minY: 4, maxY: 12 } }],
  scenes: {
    bakery: {
      navigationMode: 'exploration',
      image: '/adventures/grammys-country-apple-pie/bakery-exterior.png',
      alt: 'La boulangerie de Grammy, son toit de tuiles, le verger et le chemin extérieur.',
      width: 1335,
      height: 1178,
      hint: 'À l’extérieur, explore librement le chemin, le verger et les déchets. Clique sur un repère pour décrire ton intention au MJ. Franchir la porte de la boulangerie affiche le plan tactique intérieur.',
      hotspots: [
        {
          id: 'old_apple_tree', marker: '1', label: 'Mac, le vieux pommier', roomIds: ['1'],
          message: 'Je m’approche de Mac, le vieux pommier près du chemin, et je lui adresse la parole.',
          bounds: { x: 14, y: 54, width: 6, height: 7 },
        },
        {
          id: 'orchard', marker: '2', label: 'Verger de pommiers', destinationRoomId: '2', roomIds: ['1', '2', '3'],
          message: 'Je souhaite explorer le verger en contournant la boulangerie par l’extérieur.',
          bounds: { x: 54, y: 5, width: 6, height: 7 },
        },
        {
          id: 'refuse_heap', marker: '3', label: 'Tas de déchets', destinationRoomId: '3', roomIds: ['1', '2', '3'],
          message: 'Je souhaite observer le tas de déchets à l’est de la boulangerie, en restant à distance sans le toucher.',
          bounds: { x: 84, y: 34, width: 6, height: 7 },
        },
        {
          id: 'front_door', marker: '4', label: 'Porte extérieure', roomIds: ['1', '2', '3', '4'],
          message: 'Je m’approche de la porte extérieure depuis ma zone actuelle et m’arrête devant, sans l’ouvrir, la forcer ni la franchir.',
          bounds: { x: 60, y: 44, width: 6, height: 7 },
        },
        {
          id: 'outside_path', marker: '5', label: 'Chemin extérieur', destinationRoomId: '1', roomIds: ['2', '3', '4'],
          message: 'Je souhaite retourner sur le chemin devant la boulangerie. Si la porte extérieure est fermée, je m’arrête devant sans l’ouvrir ni la forcer.',
          bounds: { x: 43, y: 84, width: 6, height: 7 },
        },
      ],
      npcOverlays: [],
    },
  },
  // Source de vérité unique : la grille du moteur (map.ts, première map). Pas de duplication.
  grid: GRAMMYS_MAP.maps[0].grid,
  welcomeMessage: WELCOME,
  chatPlaceholders: PLACEHOLDERS,
  roomStatusHints: ROOM_STATUS_HINTS,
  characterHooks: {
    fighter: "Ancien soldat d'une compagnie de mercenaires dissoute, tu cherches à te racheter. Le vieux sorcier Tyndareus le Vert t'a engagé pour retrouver la recette secrète des tartes aux pommes de Grammy — de l'or, et peut-être une façon de faire le bien sans dégainer au premier souffle de conflit.",
    bard: "Tyndareus le Vert t'a promis une bourse — et surtout une histoire : la recette légendaire de Grammy dort dans une boulangerie infestée de gobelins. Une ballade pareille ne s'écrit pas de loin : entre, charme, improvise.",
    wizard: "Tyndareus le Vert, un confrère de l'art, t'a chargé de retrouver la recette secrète de Grammy. La rumeur parle d'un verger enchanté et de dryades : de quoi éveiller ta curiosité arcanique autant que ta prudence.",
    cleric: "Tyndareus le Vert t'a demandé de retrouver la recette perdue de Grammy et, ce faisant, d'apaiser ce qui hante encore sa vieille boulangerie. Une œuvre de compassion autant qu'une quête.",
  },
  promptGuidance: {
    movementExample: 'je vais au verger',
    namedPlaces: 'verger, tas de déchets, entrée/façade, bureau, quai de chargement, sol de la boulangerie, appartement',
    visibleNpcExample: 'Mac dès le départ',
    nonHostileNpcs: 'Mac le Tréant, la dryade',
    actionExamples: [
      '- "je fouille la bibliothèque" → appelle roll_ability_check, ability=wis, dc≈13.',
      '- "je crochète la serrure du coffre" → appelle roll_ability_check, ability=dex, dc≈15.',
      '- "je dépose une offrande au pied des arbres" → appelle roll_ability_check, ability=cha ; après réussite confirmée, choisis reveal_npc si la scène le justifie, avec un npcId exact du profil dryad présent.',
      '- "j\'attaque le gobelin" → appelle resolve_player_attack, target="gobelin".',
      '- "j\'entre dans la salle suivante" → appelle move_token ; après arrivée confirmée, choisis trigger_room_event si un événement établi le nécessite.',
      '- "je lève les yeux vers le plafond / qui es-tu ?" → dialogue ou description sans effet mécanique.',
    ],
  },
}
