import type { AdventureContent } from '../../lib/adventures'
import { TIDE_CRYPT_MAP } from './map'

// Contenu APP du module « La Crypte des Marées ». Voir le commentaire de tête de
// adventures/grammys-country-apple-pie/definition.ts pour la frontière moteur/app.

const WELCOME =
  "Le phare de Kerlouan s'est éteint il y a trois nuits, et déjà les navires manquent la passe. Maël, le vieux gardien, t'attend sur la grève, une lanterne sourde à la main. La lune noire a tiré la mer si loin qu'une chaussée de pierres, d'ordinaire noyée, s'enfonce à découvert vers un escalier sombre. « La Flamme dort là-dessous, gamin », murmure-t-il. « Va la chercher. Poliment, si tu tiens à remonter. » Que fais-tu ?"

const PLACEHOLDERS: Record<string, string[]> = {
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

const ROOM_STATUS_HINTS: Record<string, string> = {
  '1': 'La maree descend: interroge Mael, sonde la chaussee, ou t\'engage sous terre.',
  '2': 'Les cloches attendent un ordre: ecoute, teste une sonnerie, ou cherche la regle.',
  '8': 'Le Gardien veille: parle avec respect, offre plutot que prends, ou nomme les morts.',
}

export const TIDE_CRYPT_CONTENT: AdventureContent = {
  id: 'tide-crypt',
  title: 'La Crypte des Marées',
  tagline: 'La Flamme du phare dort dans un tombeau que la mer découvre',
  description:
    "Le phare de Kerlouan s'est éteint et les navires manquent la passe. À la lune noire, la marée dénude une chaussée de pierres qui descend vers la crypte de Morgane, première Gardienne des Marées. Ses marins morts veillent encore — rapportez la Flamme, poliment si possible.",
  level: 'Niveau 2 · D&D 5e',
  duration: '~2-3 h',
  accent: 'purple',
  battlemapImage: '/battlemaps/tide-crypt.png',
  // Source de vérité unique : la grille du moteur (map.ts, première map). Pas de duplication.
  grid: TIDE_CRYPT_MAP.maps[0].grid,
  welcomeMessage: WELCOME,
  chatPlaceholders: PLACEHOLDERS,
  roomStatusHints: ROOM_STATUS_HINTS,
  promptGuidance: {
    movementExample: 'je descends vers la crypte',
    namedPlaces: 'la grève, la chaussée, le beffroi, la nef, la chapelle du Gardien, le tombeau de Morgane',
    visibleNpcExample: 'Maël sur la grève dès le départ',
    nonHostileNpcs: "Maël le gardien, l'Écho de la Gardienne",
    revealNpcKindExample: 'reveal_npc:ghost',
    plannerExamples: [
      '- "je fouille le varech sur la chaussée" → requiresMechanic=true, tool=roll_ability_check, ability=wis, dc≈13, confidence=high.',
      '- "je sonne les cloches dans l\'ordre grave, grave, aigu" → requiresMechanic=true, tool=roll_ability_check, ability=int, dc≈12, confidence=high.',
      '- "j\'offre le médaillon en nommant Morgane" → requiresMechanic=true, tool=roll_ability_check, ability=cha, sceneMarkers=["reveal_npc:ghost"], confidence=medium.',
      '- "j\'attaque le marin noyé" → requiresMechanic=true, tool=resolve_player_attack, target="marin noyé", confidence=high.',
      '- "je descends l\'escalier vers la salle suivante" → requiresMechanic=true, tool=move_token, sceneMarkers=["trigger_room_event:enter"], confidence=high.',
      '- "je contemple la mer noire / qui es-tu ?" → requiresMechanic=false, confidence=high.',
    ],
  },
}
