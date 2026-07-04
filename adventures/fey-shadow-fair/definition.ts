import type { AdventureContent } from '../../lib/adventures'
import { FEY_SHADOW_FAIR_MAP } from './map'

// Contenu APP du module « La Foire du Voleur d'Ombres ». Voir le commentaire de
// tête de adventures/grammys-country-apple-pie/definition.ts pour la frontière
// moteur/app. Premier module MULTI-MAPS : battlemapImages fournit une image par
// mapId (la grille de chaque map vient de map.ts — source de vérité unique).

const WELCOME =
  "La Foire aux Chandelles ne s'installe au pré communal qu'aux nuits de lune-miel, et hier soir tu y as perdu quelque chose d'embarrassant : ton ombre. Gagée au bonneteau contre Maître Filou, un farfadet aux cartes trop parfaites, envolée avec lui vers le Bois-Ricanant. Sous les lampions, les badauds gloussent en montrant tes talons nus de toute silhouette. La rumeur dit que seule Madame Bougie ouvre le Portail des Vers Luisants — et qu'elle ne l'ouvre qu'aux gens qu'elle apprécie. Que fais-tu ?"

const PLACEHOLDERS: Record<string, string[]> = {
  default: [
    'Complimenter une chandelière, suivre une piste de souliers pointus, oser le carrousel...',
    "Faire rire une fée, marchander un indice, garder sa bourse à l'œil...",
  ],
  '2': [
    'Aborder Madame Bougie, surveiller les tire-goussets, flairer la cire chaude...',
    "Rendre un service à la gardienne du portail, acheter une chandelle-souvenir...",
  ],
  '5': [
    'Franchir le portail (sans retour !), vérifier ses affaires, dire adieu à la foire...',
    "S'assurer que Barnabé est du voyage, respirer un grand coup, passer l'arche...",
  ],
  '9': [
    "Faire rire le Prince, dénoncer la triche de Filou, saluer APRÈS la blague...",
    'Tenter une farce, produire les cartes truquées, réclamer son ombre poliment...',
  ],
}

const ROOM_STATUS_HINTS: Record<string, string> = {
  '1': "La foire scintille: aborde les forains, cherche ton ombre, remonte l'allee.",
  '2': "Madame Bougie tient le portail: rends-lui service, charme-la, ou regle leur compte aux tire-goussets.",
  '3': 'Le carrousel de limaces tourne: paie un tour, parle a Barnabé, ecoute les rumeurs.',
  '4': 'La tente de Filou: interroge Pipotin, fouille la table, evite d\'accuser sans preuve.',
  '5': 'Le portail attend: confirme ton depart (sans retour) ou finis tes affaires ici.',
  '6': 'Les champignons ricanent: passe ton chemin, cherche des traces, ne les vexe pas.',
  '7': 'Le bal des grenouilles: danse, apprends le protocole, ou contourne la mare.',
  '8': 'Les chiens-clins veulent jouer: comprends leur jeu ou cours apres ton miroir.',
  '9': 'La Cour du Prince: fais-le rire AVANT de saluer, ou denonce la triche de Filou.',
}

export const FEY_SHADOW_FAIR_CONTENT: AdventureContent = {
  id: 'fey-shadow-fair',
  title: "La Foire du Voleur d'Ombres",
  tagline: 'Ton ombre est partie au Feywild — elle, au moins, savait danser',
  description:
    "À la Foire aux Chandelles, le héros a perdu son ombre au bonneteau contre un farfadet tricheur. Pour la récupérer, il faudra charmer la gardienne du portail, traverser SANS RETOUR vers le Bois-Ricanant, survivre à un bal de grenouilles et faire rire un archifée collectionneur d'ombres. Deux cartes, zéro seconde chance, beaucoup de fous rires.",
  level: 'Niveau 3 · D&D 5e',
  duration: '~2-3 h',
  accent: 'emerald',
  battlemapImage: '/battlemaps/fey-shadow-fair-fair.png',
  battlemapImages: {
    fair: '/battlemaps/fey-shadow-fair-fair.png',
    wood: '/battlemaps/fey-shadow-fair-wood.png',
  },
  // Source de vérité unique : la grille du moteur (map.ts, première map). Pas de duplication.
  grid: FEY_SHADOW_FAIR_MAP.maps[0].grid,
  welcomeMessage: WELCOME,
  chatPlaceholders: PLACEHOLDERS,
  roomStatusHints: ROOM_STATUS_HINTS,
  promptGuidance: {
    movementExample: 'je vais au carrousel de limaces',
    namedPlaces:
      "le Pré aux Lanternes, l'Allée des Baraques, le Carrousel de Limaces, la Tente du Bonneteau, le Portail des Vers Luisants — puis, au Bois-Ricanant : la clairière des champignons, la Mare aux Grenouilles, le Sentier des Chiens-Clins, la Cour du Prince",
    visibleNpcExample: 'Madame Bougie et Barnabé dès le départ sur la foire',
    nonHostileNpcs: 'Madame Bougie, Pipotin, Barnabé l\'arbuste, la Baronne Grenouille, Maître Filou, le Prince des Farces',
    revealNpcKindExample: 'reveal_npc:archfey',
    plannerExamples: [
      '- "je complimente madame bougie sur ses chandelles" → requiresMechanic=true, tool=roll_ability_check, ability=cha, dc≈13, confidence=high.',
      '- "j\'attrape le tire-gousset la main dans mon sac" → requiresMechanic=true, tool=start_encounter, confidence=high.',
      '- "je franchis le portail des vers luisants" → requiresMechanic=true, tool=travel_to_map, confidence=high.',
      '- "je danse la gavotte avec la baronne" → requiresMechanic=true, tool=roll_ability_check, ability=dex, dc≈11, sceneMarkers=["reveal_npc:frog_noble"], confidence=medium.',
      '- "je raconte au prince comment j\'ai perdu mon ombre comme un idiot" → requiresMechanic=true, tool=roll_ability_check, ability=cha, dc≈13, sceneMarkers=["reveal_npc:archfey"], confidence=high.',
      '- "je contemple les lampions / c\'est quoi cette foire ?" → requiresMechanic=false, confidence=high.',
    ],
  },
}
